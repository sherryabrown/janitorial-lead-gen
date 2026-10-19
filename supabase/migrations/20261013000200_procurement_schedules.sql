-- Scheduling state only. Installing extensions/activating Cron is a separate reviewed rollout.
begin;
create table public.procurement_schedules (
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 80),
 config jsonb not null,scope_hash text not null,window_policy jsonb not null,recurrence jsonb not null,
 version integer not null default 1,enabled boolean not null default false,next_due_at timestamptz,
 owner_id uuid references auth.users(id) on delete set null,created_by uuid,updated_by uuid,
 client_key text not null,submission_hash text not null,blocker text,archived_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(created_by,client_key)
);
create index procurement_schedules_due on public.procurement_schedules(next_due_at,id) where enabled;
create unique index procurement_schedule_state_source on public.procurement_schedules((config->>'state_trigger_id'))
 where config->>'target_kind'='state_source' and archived_at is null;
create table public.procurement_schedule_occurrences (
 id uuid primary key default gen_random_uuid(),schedule_id uuid not null references public.procurement_schedules(id),version integer not null,
 due_at timestamptz not null,effective_at timestamptz not null,origin text not null check(origin in ('manual','scheduled')),
 run_key text not null,config jsonb not null,actor_id uuid,baseline jsonb not null default '[]',
 state text not null check(state in ('queued','skipped','blocked')),reason text,trigger_id uuid references public.procurement_triggers(id),
 missed_from timestamptz,missed_through timestamptz,created_at timestamptz not null default now(),unique(schedule_id,run_key)
);
create unique index procurement_schedule_due_once on public.procurement_schedule_occurrences(schedule_id,due_at) where origin='scheduled';
create index procurement_schedule_occurrence_history on public.procurement_schedule_occurrences(schedule_id,created_at desc,id);
create table public.procurement_schedule_events (
 id uuid primary key default gen_random_uuid(),schedule_id uuid not null references public.procurement_schedules(id),
 actor_id uuid,action text not null,version integer not null,at timestamptz not null default now(),summary jsonb not null default '{}'
);
create index procurement_schedule_event_history on public.procurement_schedule_events(schedule_id,at desc,id);
alter table public.procurement_triggers add constraint procurement_trigger_schedule_fk foreign key(schedule_id) references public.procurement_schedules(id);
alter table public.procurement_triggers add constraint procurement_trigger_occurrence_fk foreign key(occurrence_id) references public.procurement_schedule_occurrences(id);
create index procurement_trigger_schedule on public.procurement_triggers(schedule_id) where schedule_id is not null;

create function public.procurement_schedule_owner_active(p_actor uuid,p_now timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_actor and nullif(to_jsonb(u)->>'deleted_at','') is null
 and (nullif(to_jsonb(u)->>'banned_until','') is null or (to_jsonb(u)->>'banned_until')::timestamptz<=p_now));
$$;
create function public.save_procurement_schedule(p_id uuid,p_actor uuid,p_key text,p_hash text,p_expected_version integer,p_input jsonb,p_now timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.procurement_schedules%rowtype;
begin
 if not public.procurement_schedule_owner_active(p_actor,p_now) then raise exception 'Active account required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('procurement-schedule-management',0));
 if p_id is null then
  if p_key !~ '^[A-Za-z0-9_-]{8,100}$' then raise exception 'Submission key required'; end if;
  select * into s from public.procurement_schedules where created_by=p_actor and client_key=p_key;
  if found then if s.submission_hash<>p_hash then raise exception 'Schedule key reused for different input'; end if;return s.id;end if;
  insert into public.procurement_schedules(name,config,scope_hash,window_policy,recurrence,enabled,next_due_at,owner_id,created_by,updated_by,client_key,submission_hash)
  values(p_input->>'name',p_input->'config',p_input->>'scope_hash',p_input->'window_policy',p_input->'recurrence',(p_input->>'enabled')::boolean,
   (p_input->>'next_due_at')::timestamptz,p_actor,p_actor,p_actor,p_key,p_hash) returning * into s;
 else
  select * into s from public.procurement_schedules where id=p_id for update;
  if not found or s.version<>p_expected_version or s.archived_at is not null then raise exception 'Schedule version changed; reload';end if;
  if (p_input->>'enabled')::boolean and not public.procurement_schedule_owner_active(s.owner_id,p_now) then raise exception 'Schedule owner is inactive; save a new schedule under an active account';end if;
  update public.procurement_schedules set name=p_input->>'name',config=p_input->'config',scope_hash=p_input->>'scope_hash',window_policy=p_input->'window_policy',recurrence=p_input->'recurrence',
   enabled=(p_input->>'enabled')::boolean,next_due_at=(p_input->>'next_due_at')::timestamptz,version=version+1,updated_by=p_actor,updated_at=p_now,blocker=null where id=p_id returning * into s;
 end if;
 insert into public.procurement_schedule_events(schedule_id,actor_id,action,version)values(s.id,p_actor,case when p_id is null then 'created' else 'edited' end,s.version);
 return s.id;
end $$;
create function public.control_procurement_schedule(p_id uuid,p_actor uuid,p_action text,p_version integer,p_next timestamptz,p_now timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.procurement_schedules%rowtype;
begin
 if not public.procurement_schedule_owner_active(p_actor,p_now) or p_action not in ('pause','resume','archive') then raise exception 'Valid account/action required';end if;
 select * into s from public.procurement_schedules where id=p_id for update;
 if not found or s.version<>p_version or s.archived_at is not null then raise exception 'Schedule version changed; reload';end if;
 if p_action='resume' and (not public.procurement_schedule_owner_active(s.owner_id,p_now) or p_next is null or p_next<=p_now or s.blocker is not null) then raise exception 'Review schedule scope/owner before enabling';end if;
 update public.procurement_schedules set enabled=p_action='resume',next_due_at=case when p_action='resume' then p_next else null end,
  archived_at=case when p_action='archive' then p_now else null end,version=version+1,updated_by=p_actor,updated_at=p_now where id=p_id returning * into s;
 insert into public.procurement_schedule_events(schedule_id,actor_id,action,version)values(p_id,p_actor,p_action,s.version);return true;
end $$;
create function public.disable_inactive_procurement_schedules(p_now timestamptz) returns integer language plpgsql security definer set search_path='' as $$
declare s record; n integer:=0;
begin
 for s in update public.procurement_schedules set enabled=false,next_due_at=null,blocker='owner_inactive',version=version+1,updated_at=p_now
 where enabled and not public.procurement_schedule_owner_active(owner_id,p_now) returning id,version loop
  insert into public.procurement_schedule_events(schedule_id,action,version) values(s.id,'owner_inactive',s.version);n:=n+1;
 end loop;return n;
end $$;

-- Latest confirmed matching observation is retained separately from the existing any-historical-hash classification.
create function public.procurement_schedule_baseline(p_trigger uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(distinct jsonb_build_object('source_id',c.source_id,'category',c.kind,'capability_id',c.id,
 'run_id',saved.id,'finished_at',saved.finished_at,'content_sha256',saved.detail->>'content_sha256')),'[]'::jsonb)
 from public.procurement_trigger_requests link join public.procurement_search_requests req on req.id=link.request_id
 join public.procurement_request_targets target on target.search_request_id=req.id
 join public.procurement_source_capabilities c on c.route_geography_id=target.geography_id
 join public.procurement_sources source on source.id=c.source_id
 join lateral(select r.id,r.finished_at,r.detail from public.procurement_runs r join public.procurement_jobs j on j.id=r.job_id
  where r.source_id=c.source_id and j.capability_id=c.id and r.detail->>'state'='content_saved'
   and r.detail->'query_window'=req.search_windows->c.kind and r.detail->>'parser_version'=c.parser_version
  order by r.finished_at desc,r.id limit 1) saved on true
 where link.trigger_id=p_trigger and link.role<>'state_research' and c.kind=any(req.requested_categories)
 and ((link.role='state_source' and c.source_id=(req.workflow_control->>'source_id')::uuid) or
 (link.role='county' and source.contracting_entity_geo_level<>'state' and not exists(select 1 from public.procurement_source_capabilities sc where sc.source_id=c.source_id and sc.route_geography_id='05')));
$$;
create function public.enqueue_procurement_schedule(p_id uuid,p_version integer,p_origin text,p_actor uuid,p_key text,p_due timestamptz,p_effective timestamptz,p_next timestamptz,p_now timestamptz,p_config jsonb,p_hash text,p_blocker text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.procurement_schedules%rowtype;o public.procurement_schedule_occurrences%rowtype;t uuid;reason text:=p_blocker;actor uuid;
begin
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

create function public.procurement_scheduled_trigger_runnable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.procurement_triggers t left join public.procurement_schedules s on s.id=t.schedule_id where t.id=p_id and
 (t.origin<>'scheduled' or s.enabled and s.archived_at is null and public.procurement_schedule_owner_active(s.owner_id,now())));
$$;
create function public.procurement_scheduled_request_runnable(p_request uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.procurement_trigger_requests r where r.request_id=p_request and not public.procurement_scheduled_trigger_runnable(r.trigger_id));
$$;
create or replace function public.claim_procurement_workflow_job_before_admin() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.procurement_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('hosted-procurement-worker',0));
  if exists(select 1 from public.procurement_jobs where (dedupe_key like 'api-workflow:%' or dedupe_key like 'api-import:%' or dedupe_key like 'api-sam:%') and
    state='running' and lease_until>now()) then return null; end if;
  select * into j from public.procurement_jobs where (dedupe_key like 'api-workflow:%' or dedupe_key like 'api-import:%' or dedupe_key like 'api-sam:%') and
    (state='pending' or state='running' and lease_until<now()) and public.procurement_scheduled_request_runnable(search_request_id) order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.procurement_jobs set state='running',lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',
    attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
end $$;
create or replace function public.claim_procurement_trigger() returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('hosted-procurement-worker',0));
 if exists(select 1 from public.procurement_jobs where state='running' and lease_until>now()) or
 exists(select 1 from public.procurement_triggers where state='running' and lease_until>now()) then return null; end if;
 select * into t from public.procurement_triggers where (state='pending' or state='running' and lease_until<now()) and public.procurement_scheduled_trigger_runnable(id)
 order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.procurement_triggers set state='running',lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',attempts=attempts+1,updated_at=now() where id=t.id returning * into t;
 return to_jsonb(t);
end $$;
alter table public.procurement_schedules enable row level security;
revoke all on public.procurement_schedules from public,anon,authenticated;
grant select,insert,update on public.procurement_schedules to service_role;
alter table public.procurement_schedule_occurrences enable row level security;
revoke all on public.procurement_schedule_occurrences from public,anon,authenticated;
grant select,insert,update on public.procurement_schedule_occurrences to service_role;
alter table public.procurement_schedule_events enable row level security;
revoke all on public.procurement_schedule_events from public,anon,authenticated;
grant select,insert,update on public.procurement_schedule_events to service_role;
revoke all on function public.procurement_schedule_owner_active(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.procurement_schedule_owner_active(uuid,timestamptz) to service_role;
revoke all on function public.save_procurement_schedule(uuid,uuid,text,text,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_procurement_schedule(uuid,uuid,text,text,integer,jsonb,timestamptz) to service_role;
revoke all on function public.control_procurement_schedule(uuid,uuid,text,integer,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.control_procurement_schedule(uuid,uuid,text,integer,timestamptz,timestamptz) to service_role;
revoke all on function public.disable_inactive_procurement_schedules(timestamptz) from public,anon,authenticated;
grant execute on function public.disable_inactive_procurement_schedules(timestamptz) to service_role;
revoke all on function public.enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,text,text) to service_role;
revoke all on function public.procurement_scheduled_trigger_runnable(uuid) from public,anon,authenticated;
grant execute on function public.procurement_scheduled_trigger_runnable(uuid) to service_role;
revoke all on function public.procurement_scheduled_request_runnable(uuid) from public,anon,authenticated;
grant execute on function public.procurement_scheduled_request_runnable(uuid) to service_role;

revoke all on function public.procurement_schedule_baseline(uuid) from public,anon,authenticated;
grant execute on function public.procurement_schedule_baseline(uuid) to service_role;
create or replace function public.procurement_state_trigger_status() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'source_id',a.source_id,'name',source.name,'category',a.category,
 'county_ids',a.county_ids,'scheduled',schedule.id is not null,'schedule_id',schedule.id,'schedule_enabled',schedule.enabled,'next_due_at',schedule.next_due_at,
 'latest_run',latest.id,'last_finished_at',latest.finished_at) order by source.name,a.category,a.id),'[]'::jsonb)
 from public.procurement_state_trigger_associations a join public.procurement_sources source on source.id=a.source_id
 left join public.procurement_schedules schedule on schedule.config->>'state_trigger_id'=a.id::text and schedule.archived_at is null
 left join lateral(select t.id,t.finished_at from public.procurement_triggers t where t.target_kind='state_source' and t.config->>'state_trigger_id'=a.id::text
 order by t.created_at desc,t.id limit 1) latest on true;
$$;
commit;
