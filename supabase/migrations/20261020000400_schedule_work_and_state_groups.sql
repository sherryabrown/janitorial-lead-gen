-- Schedule work ownership and grouped state-source execution. No live schedule changes.
begin;
create view public.procurement_schedule_work_reservations with (security_invoker=true) as
 select s.id schedule_id,s.name,s.enabled,c.value county_id,w.work
 from public.procurement_schedules s cross join lateral jsonb_array_elements_text(s.config->'county_ids') c(value)
 cross join (values('maintain_sources'),('check_updates')) w(work)
 where s.config->>'target_kind'='county_scope' and s.archived_at is null and s.deleted_at is null and (s.config->>w.work)::boolean;
revoke all on public.procurement_schedule_work_reservations from public,anon,authenticated;
grant select on public.procurement_schedule_work_reservations to service_role;
do $$ begin
 if exists(select 1 from public.procurement_schedule_work_reservations group by county_id,work having count(*)>1) then raise exception 'Resolve existing county/work conflicts before migration';end if;
end $$;
create table public.procurement_schedule_state_memberships (
 schedule_id uuid not null references public.procurement_schedules(id),
 state_trigger_association_id uuid not null references public.procurement_state_trigger_associations(id),
 primary key(schedule_id,state_trigger_association_id),unique(state_trigger_association_id)
);
alter table public.procurement_schedule_state_memberships enable row level security;
revoke all on public.procurement_schedule_state_memberships from public,anon,authenticated;
grant select on public.procurement_schedule_state_memberships to service_role;
insert into public.procurement_schedule_state_memberships
 select s.id,a.value::uuid from public.procurement_schedules s cross join lateral jsonb_array_elements_text(coalesce(s.config->'state_trigger_ids',jsonb_build_array(s.config->>'state_trigger_id'))) a(value)
 where s.config->>'target_kind'='state_source' and s.archived_at is null and s.deleted_at is null;
drop index public.procurement_schedule_state_source;
create function public.lock_procurement_schedule_management() returns trigger language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended('procurement-schedule-management',0));return null;end $$;
create trigger procurement_schedule_management_lock before insert or update on public.procurement_schedules for each statement execute function public.lock_procurement_schedule_management();
create function public.reserve_procurement_schedule_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare conflict record; member text;
begin
 if new.archived_at is null and new.deleted_at is null then
  if new.config->>'target_kind'='county_scope' then
   select r.* into conflict from public.procurement_schedule_work_reservations r where r.schedule_id<>new.id and
    new.config->'county_ids' ? r.county_id and (new.config->>r.work)::boolean limit 1;
   if found then raise exception 'County % already reserves % in schedule % (%)',conflict.county_id,conflict.work,conflict.name,conflict.schedule_id;end if;
  end if;
 end if;
 delete from public.procurement_schedule_state_memberships where schedule_id=new.id;
 if new.config->>'target_kind'='state_source' and new.archived_at is null and new.deleted_at is null then
  for member in select jsonb_array_elements_text(coalesce(new.config->'state_trigger_ids',jsonb_build_array(new.config->>'state_trigger_id'))) loop
   insert into public.procurement_schedule_state_memberships values(new.id,member::uuid);
  end loop;
 end if;
 return new;
end $$;
create trigger procurement_schedule_scope_reservation after insert or update of config,archived_at,deleted_at on public.procurement_schedules for each row execute function public.reserve_procurement_schedule_scope();
revoke all on function public.lock_procurement_schedule_management(),public.reserve_procurement_schedule_scope() from public,anon,authenticated;
create or replace function public.control_procurement_schedule(p_id uuid,p_actor uuid,p_action text,p_version integer,p_next timestamptz,p_now timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.procurement_schedules%rowtype;
begin
 if not public.procurement_schedule_owner_active(p_actor,p_now) or p_action not in ('pause','resume','archive') then raise exception 'Valid account/action required';end if;
 perform pg_advisory_xact_lock(hashtextextended('procurement-schedule-management',0));
 select * into s from public.procurement_schedules where id=p_id for update;
 if not found or s.version<>p_version or s.archived_at is not null then raise exception 'Schedule version changed; reload';end if;
 if p_action='resume' and (not public.procurement_schedule_owner_active(s.owner_id,p_now) or p_next is null or p_next<=p_now or s.blocker is not null) then raise exception 'Review schedule scope/owner before enabling';end if;
 update public.procurement_schedules set enabled=p_action='resume',next_due_at=case when p_action='resume' then p_next else null end,
  archived_at=case when p_action='archive' then p_now else null end,version=version+1,updated_by=p_actor,updated_at=p_now where id=p_id returning * into s;
 insert into public.procurement_schedule_events(schedule_id,actor_id,action,version)values(p_id,p_actor,p_action,s.version);return true;
end $$;
create or replace function public.submit_procurement_trigger_before_sam(p_actor uuid,p_key text,p_hash text,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype; c jsonb; r uuid; research uuid; k text; a public.procurement_state_trigger_associations%rowtype;
 cities text[]; categories text[]; old_request uuid; first_county jsonb; member jsonb; selected jsonb;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_key !~ '^[A-Za-z0-9_-]{8,100}$'
 or p_hash !~ '^[a-f0-9]{64}$' or p_config->>'target_kind' not in ('county_scope','state_source') then raise exception 'Invalid trigger submission'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-trigger-submit',0));
 select * into t from public.procurement_triggers where initiated_by=p_actor and client_key=p_key;
 if found then if t.submission_hash<>p_hash then raise exception 'Idempotency key reused for different input'; end if; return t.id; end if;
 if (select count(*) from public.procurement_triggers where initiated_by=p_actor and created_at>now()-interval '1 hour')>=10 then raise exception 'Hourly trigger limit reached'; end if;
 if jsonb_array_length(p_config->'counties') not between 1 and 75 or not ((p_config->>'maintain_sources')::boolean or (p_config->>'check_updates')::boolean)
 then raise exception 'County scope and work required'; end if;
 categories:=array(select jsonb_array_elements_text(p_config->'requested_categories'));
 if cardinality(categories)=0 or not categories <@ array['forecast','opportunity','award']::text[] then raise exception 'Categories required'; end if;
 -- Revalidate the frozen default all-city selection under the submission lock.
 for c in select value from jsonb_array_elements(p_config->'counties') loop
   if not exists(select 1 from public.procurement_geographies where id=c->>'id' and kind='county' and source_active) then raise exception 'Active county required'; end if;
   cities:=array(select g.id from public.procurement_place_counties pc join public.procurement_geographies g on g.id=pc.place_id
     where pc.county_id=c->>'id' and g.kind='municipality' and g.source_active order by g.id);
   if exists(select 1 from jsonb_array_elements(c->'city_revisions') v where not exists(select 1 from public.procurement_geographies g where g.id=v->>'id' and g.dataset_hash=v->>'dataset_hash')) then raise exception 'City dataset revision changed; preview again'; end if;
   if cities<>array(select jsonb_array_elements_text(c->'city_ids') order by 1) then raise exception 'County cities changed; preview again'; end if;
 end loop;
 if p_config->>'target_kind'='state_source' then
   selected:=coalesce(p_config->'state_trigger_ids',jsonb_build_array(p_config->>'state_trigger_id'));
   if jsonb_array_length(selected) not between 1 and 200 or
     (select count(distinct value) from jsonb_array_elements_text(selected))<>jsonb_array_length(selected) then raise exception 'Unique saved state associations required'; end if;
   for member in select value from jsonb_array_elements(selected) loop
    select * into a from public.procurement_state_trigger_associations where id=(member#>>'{}')::uuid;
    if not found or not a.category=any(categories) or not exists(select 1 from jsonb_array_elements_text(p_config->'county_ids') x where x=any(a.county_ids)) then raise exception 'State trigger scope does not match saved associations'; end if;
    if p_config ? 'state_sources' and not exists(select 1 from jsonb_array_elements(p_config->'state_sources') snapshot where snapshot->>'id'=a.id::text and snapshot->>'source_id'=a.source_id::text and snapshot->>'category'=a.category and snapshot->'county_ids'=to_jsonb(array(select unnest(a.county_ids) order by 1))) then raise exception 'State association changed; preview again';end if;
   end loop;
   if exists(select 1 from public.procurement_state_trigger_associations association where association.id::text in(select jsonb_array_elements_text(selected)) group by association.source_id,association.category having count(*)>1) then raise exception 'Choose one association per source and category';end if;
   if exists(select 1 from unnest(categories) chosen(category) where not exists(select 1 from public.procurement_state_trigger_associations association where association.id::text in(select jsonb_array_elements_text(selected)) and association.category=chosen.category)) then raise exception 'Every category requires a selected state association'; end if;
 end if;
 insert into public.procurement_triggers(target_kind,config,initiated_by,client_key,submission_hash)
 values(p_config->>'target_kind',p_config,p_actor,p_key,p_hash) returning * into t;
 if t.target_kind='state_source' then
  for member in select value from jsonb_array_elements(selected) order by value loop
   select * into a from public.procurement_state_trigger_associations where id=(member#>>'{}')::uuid;
   select value into c from jsonb_array_elements(p_config->'counties') where value->>'id'=any(a.county_ids) order by value->>'id' limit 1;
   cities:=array(select jsonb_array_elements_text(c->'city_ids'));
   r:=public.create_procurement_geography_request('Admin state-source check',c->>'id',cities,now(),'{"service":"janitorial"}',jsonb_build_object(a.category,p_config->'search_windows'->a.category),null);
   update public.procurement_search_requests set initiated_by=p_actor,requested_categories=array[a.category],request_origin='api',
     requested_search_areas=(select jsonb_agg(jsonb_build_object('area_type','county','county_name',value->>'name','state_code','AR')) from jsonb_array_elements(p_config->'counties') where value->>'id'=any(a.county_ids)),
     workflow_control=jsonb_build_object('cancelled',false,'admin_trigger_id',t.id,'admin_policy','state_source','source_id',a.source_id,'state_trigger_id',a.id,'maintain_sources',(p_config->>'maintain_sources')::boolean,'check_updates',(p_config->>'check_updates')::boolean) where id=r;
   delete from public.procurement_request_targets where search_request_id=r and geography_id<>'05';
   insert into public.procurement_trigger_requests(trigger_id,request_id,county_id,role,scope) values(t.id,r,c->>'id','state_source',jsonb_build_object('id',a.id,'source_id',a.source_id,'category',a.category,'counties',(select jsonb_agg(value) from jsonb_array_elements(p_config->'counties') where value->>'id'=any(a.county_ids))));
   insert into public.procurement_jobs(search_request_id,dedupe_key,kind,checkpoint) values(r,'api-workflow:'||r,'process',jsonb_build_object('stage','plan','actor_id',p_actor,'state_trigger_id',a.id));
  end loop;
  return t.id;
 end if;
 for c in select value from jsonb_array_elements(p_config->'counties') loop
   if t.target_kind='state_source' and first_county is not null then continue; end if;
   cities:=array(select jsonb_array_elements_text(c->'city_ids'));
   r:=public.create_procurement_geography_request('Admin county check',c->>'id',cities,now(),'{"service":"janitorial"}',p_config->'search_windows',null);
   update public.procurement_search_requests set initiated_by=p_actor,requested_categories=categories,request_origin='api',
    workflow_control=jsonb_build_object('cancelled',false,'admin_trigger_id',t.id,'admin_policy',t.target_kind,
     'source_id',a.source_id,'maintain_sources',(p_config->>'maintain_sources')::boolean,'check_updates',(p_config->>'check_updates')::boolean) where id=r;
   if t.target_kind='county_scope' then delete from public.procurement_request_targets where search_request_id=r and geography_id='05';
   else delete from public.procurement_request_targets where search_request_id=r and geography_id<>'05'; end if;
   insert into public.procurement_trigger_requests(trigger_id,request_id,county_id,role,scope) values(t.id,r,c->>'id',case when t.target_kind='state_source' then 'state_source' else 'county' end,c);
   insert into public.procurement_jobs(search_request_id,dedupe_key,kind,checkpoint) values(r,'api-workflow:'||r,'process',jsonb_build_object('stage','plan','actor_id',p_actor));
   first_county:=c;
   if t.target_kind='county_scope' and (p_config->>'maintain_sources')::boolean then
    research:=null;
    foreach k in array categories loop
     select request_id into old_request from public.procurement_county_state_research where county_id=c->>'id' and category=k and scope_revision=c->>'selection_token';
     if found then continue; end if;
     if research is null then
      research:=public.create_procurement_geography_request('Admin state-source research',c->>'id',cities,now(),'{"service":"janitorial"}',p_config->'search_windows',null);
      delete from public.procurement_request_targets where search_request_id=research and geography_id<>'05';
      update public.procurement_search_requests set initiated_by=p_actor,requested_categories=categories,request_origin='api',
       workflow_control=jsonb_build_object('cancelled',false,'admin_trigger_id',t.id,'admin_policy','state_research','maintain_sources',true,'check_updates',false) where id=research;
      insert into public.procurement_trigger_requests(trigger_id,request_id,county_id,role,scope) values(t.id,research,c->>'id','state_research',c);
      insert into public.procurement_jobs(search_request_id,dedupe_key,kind,checkpoint) values(research,'api-workflow:'||research,'process',jsonb_build_object('stage','plan','actor_id',p_actor));
     end if;
     insert into public.procurement_county_state_research(county_id,category,scope_revision,request_id) values(c->>'id',k,c->>'selection_token',research);
    end loop;
   end if;
 end loop;
 -- Independent state runs use every associated county's work scope, not statewide geographic certainty.
 if t.target_kind='state_source' then
  update public.procurement_search_requests set requested_search_areas=(select jsonb_agg(jsonb_build_object('area_type','county','county_name',value->>'name','state_code','AR')) from jsonb_array_elements(p_config->'counties')) where id=r;
 end if;
 return t.id;
end $$;
create or replace function public.procurement_state_trigger_status() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'source_id',a.source_id,'name',source.name,'category',a.category,
 'county_ids',a.county_ids,'scheduled',schedule.id is not null,'schedule_id',schedule.id,'schedule_enabled',schedule.enabled,'next_due_at',schedule.next_due_at,
 'latest_run',latest.id,'last_finished_at',latest.finished_at) order by source.name,a.category,a.id),'[]'::jsonb)
 from public.procurement_state_trigger_associations a join public.procurement_sources source on source.id=a.source_id
 left join public.procurement_schedule_state_memberships membership on membership.state_trigger_association_id=a.id
 left join public.procurement_schedules schedule on schedule.id=membership.schedule_id
 left join lateral(select t.id,t.finished_at from public.procurement_triggers t where t.target_kind='state_source' and (t.config->>'state_trigger_id'=a.id::text or t.config->'state_trigger_ids' ? a.id::text)
 order by t.created_at desc,t.id limit 1) latest on true;
$$;

create or replace function public.enqueue_procurement_schedule(p_id uuid,p_version integer,p_origin text,p_actor uuid,p_key text,p_due timestamptz,p_effective timestamptz,p_next timestamptz,p_now timestamptz,p_config jsonb,p_hash text,p_blocker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.procurement_schedules%rowtype;o public.procurement_schedule_occurrences%rowtype;t uuid;reason text:=p_blocker;actor uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('procurement-schedule-management',0));
 select * into s from public.procurement_schedules where id=p_id for update;
 if not found then raise exception 'Schedule not found';end if;
 select * into o from public.procurement_schedule_occurrences where schedule_id=p_id and run_key=p_key;
 if found then return jsonb_build_object('id',o.id,'state',o.state,'trigger_id',o.trigger_id,'replayed',true);end if;
 if s.version<>p_version or s.archived_at is not null then return jsonb_build_object('state','stale');end if;
 if p_origin not in ('manual','scheduled') then raise exception 'Invalid occurrence origin';end if;
 actor:=case when p_origin='scheduled' then s.owner_id else p_actor end;
 if not public.procurement_schedule_owner_active(actor,p_now) then reason:='owner_inactive';end if;
 if p_origin='scheduled' and (not s.enabled or s.next_due_at<>p_due or p_due>p_now) then return jsonb_build_object('state','stale');end if;
 if p_origin='scheduled' and (p_next is null or p_next<=p_now) then raise exception 'Future due timestamp required';end if;
 if reason is null and exists(select 1 from public.procurement_triggers t where t.schedule_id=p_id and
  (t.state in ('pending','running','outcome_unknown') or exists(select 1 from public.procurement_usage_ledger u where u.trigger_id=t.id and u.state in ('reserved','outcome_unknown')) or
   exists(select 1 from public.procurement_jobs j join public.procurement_trigger_requests r on r.request_id=j.search_request_id where r.trigger_id=t.id and j.state='outcome_unknown'))) then reason:='previous_run_active';end if;
 insert into public.procurement_schedule_occurrences(schedule_id,version,due_at,effective_at,origin,run_key,config,actor_id,state,reason,missed_from,missed_through)
 values(p_id,p_version,p_due,p_effective,p_origin,p_key,p_config,actor,case when reason='previous_run_active' then 'skipped' when reason is not null then 'blocked' else 'queued' end,reason,
  case when p_origin='scheduled' and p_effective>p_due then p_due end,case when p_origin='scheduled' and p_effective>p_due then p_effective end) returning * into o;
 if p_origin='scheduled' then
  update public.procurement_schedules set next_due_at=p_next,updated_at=p_now where id=p_id;
 end if;
 if reason is null then
  begin
   t:=public.submit_procurement_trigger(actor,'schedule-'||o.id,p_hash,p_config);
   update public.procurement_triggers set origin=p_origin,schedule_id=p_id,occurrence_id=o.id where id=t;
   update public.procurement_schedule_occurrences set trigger_id=t,baseline=public.procurement_schedule_baseline(t) where id=o.id returning * into o;
  exception when others then
   update public.procurement_schedule_occurrences set state='blocked',reason='trigger_enqueue_failed' where id=o.id returning * into o;
  end;
 end if;
 if o.reason in ('scope_changed','scope_unavailable','owner_inactive') then update public.procurement_schedules set enabled=false,next_due_at=null,blocker=o.reason,version=version+1 where id=p_id;end if;
 insert into public.procurement_schedule_events(schedule_id,actor_id,action,version,summary)values(p_id,actor,o.state,p_version,jsonb_build_object('occurrence_id',o.id,'reason',o.reason));
 return jsonb_build_object('id',o.id,'state',o.state,'trigger_id',o.trigger_id,'reason',o.reason);
end $$;

commit;

