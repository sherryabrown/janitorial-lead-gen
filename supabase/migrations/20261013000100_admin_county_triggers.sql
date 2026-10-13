-- Additive Admin execution only. No scheduler, source activation or live data rewrite.
begin;
create table public.procurement_triggers (
 id uuid primary key default gen_random_uuid(), target_kind text not null check(target_kind in ('county_scope','state_source')),
 config jsonb not null, origin text not null default 'manual' check(origin in ('manual','scheduled')),
 initiated_by uuid not null references auth.users(id), client_key text not null, submission_hash text not null,
 schedule_id uuid, occurrence_id uuid, state text not null default 'pending' check(state in ('pending','running','needs_review','partial','completed','cancelled','outcome_unknown')),
 checkpoint jsonb not null default '{}', lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), finished_at timestamptz,
 unique(initiated_by,client_key)
);
create index procurement_trigger_pending on public.procurement_triggers(state,created_at,id);
create table public.procurement_trigger_requests (
 id uuid not null default gen_random_uuid() unique,
 trigger_id uuid not null references public.procurement_triggers(id), request_id uuid not null references public.procurement_search_requests(id),
 county_id text references public.procurement_geographies(id), role text not null check(role in ('county','state_research','state_source')),
 scope jsonb not null, primary key(trigger_id,request_id), unique(request_id)
);
create table public.procurement_county_state_research (
 id uuid not null default gen_random_uuid() unique,
 county_id text not null references public.procurement_geographies(id), category text not null check(category in ('forecast','opportunity','award')),
 scope_revision text not null, request_id uuid not null references public.procurement_search_requests(id),
 state text not null default 'pending' check(state in ('pending','partial','completed')), evidence jsonb not null default '{}',
 updated_at timestamptz not null default now(), primary key(county_id,category,scope_revision)
);
create table public.procurement_state_trigger_associations (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.procurement_sources(id),
 category text not null check(category in ('forecast','opportunity','award')), method_scope text not null,
 county_ids text[] not null default '{}', evidence jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(source_id,category,method_scope)
);
create table public.procurement_workflow_steps (
 sequence bigint generated always as identity unique,
 id uuid primary key default gen_random_uuid(), trigger_id uuid not null references public.procurement_triggers(id),
 request_id uuid references public.procurement_search_requests(id), job_id uuid references public.procurement_jobs(id),
 task_id uuid references public.procurement_coverage_tasks(id), source_id uuid references public.procurement_sources(id), county_id text,
 job_attempt integer, phase text not null, attempt_key text not null, state text not null default 'started' check(state in ('started','completed','failed','interrupted')),
 actor_id uuid not null references auth.users(id), origin text not null, execution text not null default 'worker' check(execution in ('worker','user')), reason text not null default 'deterministic',
 summary jsonb not null default '{}', diagnostic_id uuid, started_at timestamptz not null default now(), finished_at timestamptz,
 unique(trigger_id,attempt_key)
);
create index procurement_steps_cursor on public.procurement_workflow_steps(trigger_id,started_at,id);
alter table public.procurement_usage_ledger add column step_id uuid references public.procurement_workflow_steps(id),
 add column trigger_id uuid references public.procurement_triggers(id);
create index procurement_usage_trigger on public.procurement_usage_ledger(trigger_id,created_at);

create function public.submit_procurement_trigger(p_actor uuid,p_key text,p_hash text,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype; c jsonb; r uuid; research uuid; k text; a public.procurement_state_trigger_associations%rowtype;
 cities text[]; categories text[]; old_request uuid; first_county jsonb;
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
   select * into a from public.procurement_state_trigger_associations where id=(p_config->>'state_trigger_id')::uuid;
   if not found or categories<>array[a.category] then raise exception 'Saved state trigger and matching category required'; end if;
 end if;
 insert into public.procurement_triggers(target_kind,config,initiated_by,client_key,submission_hash)
 values(p_config->>'target_kind',p_config,p_actor,p_key,p_hash) returning * into t;
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

create function public.claim_procurement_trigger() returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('hosted-procurement-worker',0));
 if exists(select 1 from public.procurement_jobs where state='running' and lease_until>now()) or
 exists(select 1 from public.procurement_triggers where state='running' and lease_until>now()) then return null; end if;
 select * into t from public.procurement_triggers where state='pending' or state='running' and lease_until<now()
 order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.procurement_triggers set state='running',lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',attempts=attempts+1,updated_at=now() where id=t.id returning * into t;
 return to_jsonb(t);
end $$;
create function public.checkpoint_procurement_trigger(p_id uuid,p_lease uuid,p_state text,p_checkpoint jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.procurement_triggers set state=p_state,checkpoint=p_checkpoint,lease_until=null,updated_at=now(),
 finished_at=case when p_state in ('completed','cancelled') then now() else null end
 where id=p_id and state='running' and lease_token=p_lease and lease_until>now(); return found;
end $$;
create function public.control_procurement_trigger(p_id uuid,p_actor uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype; child record;
begin
 if p_action not in ('cancel','resume') or not exists(select 1 from auth.users where id=p_actor) then raise exception 'Invalid control'; end if;
 select * into t from public.procurement_triggers where id=p_id for update;
 if not found then raise exception 'Trigger not found'; end if;
 if p_action='resume' and (exists(select 1 from public.procurement_usage_ledger where trigger_id=p_id and state in ('reserved','outcome_unknown')) or exists(select 1 from public.procurement_jobs j join public.procurement_trigger_requests r on r.request_id=j.search_request_id where r.trigger_id=p_id and j.state='outcome_unknown')) then raise exception 'Reconcile outcome first'; end if;
 update public.procurement_triggers set state=case when p_action='cancel' then 'cancelled' else 'pending' end,lease_until=null,
 checkpoint=checkpoint||jsonb_build_object('last_action',p_action,'actor_id',p_actor),updated_at=now() where id=p_id;
 for child in select request_id from public.procurement_trigger_requests where trigger_id=p_id loop
   perform public.control_procurement_workflow(child.request_id,p_actor,p_action);
 end loop;
 return jsonb_build_object('trigger_id',p_id,'action',p_action);
end $$;
create function public.associate_procurement_state_trigger(p_source uuid,p_category text,p_scope text,p_county text,p_evidence jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 insert into public.procurement_state_trigger_associations(source_id,category,method_scope,county_ids,evidence)
 values(p_source,p_category,p_scope,array[p_county],p_evidence)
 on conflict(source_id,category,method_scope) do update set county_ids=(select array_agg(distinct x order by x) from unnest(public.procurement_state_trigger_associations.county_ids||array[p_county]) x),updated_at=now()
 returning id into result; return result;
end $$;
-- Shared audit start is committed before execution; terminal writes are compare-and-set.
create function public.begin_procurement_step(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 update public.procurement_workflow_steps set state='interrupted',finished_at=now() where job_id=(p_input->>'job_id')::uuid and state='started' and job_attempt<(p_input->>'job_attempt')::integer;
 insert into public.procurement_workflow_steps(trigger_id,request_id,job_id,task_id,source_id,county_id,job_attempt,phase,attempt_key,actor_id,origin,execution,reason)
 values((p_input->>'trigger_id')::uuid,(p_input->>'request_id')::uuid,(p_input->>'job_id')::uuid,(p_input->>'task_id')::uuid,(p_input->>'source_id')::uuid,p_input->>'county_id',(p_input->>'job_attempt')::integer,
 p_input->>'phase',p_input->>'attempt_key',(p_input->>'actor_id')::uuid,p_input->>'origin',coalesce(p_input->>'execution','worker'),coalesce(p_input->>'reason','deterministic')) returning id into result; return result;
end $$;
create function public.finish_procurement_step(p_id uuid,p_state text,p_summary jsonb,p_diagnostic uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.procurement_workflow_steps set state=p_state,summary=p_summary,diagnostic_id=p_diagnostic,finished_at=now() where id=p_id and state='started';return found;
end $$;
create or replace function public.reserve_procurement_usage(p_entry jsonb,p_monthly_usd numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.procurement_usage_ledger%rowtype; spent numeric; calls integer; ins bigint; outs bigint; group_id uuid; step uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('procurement-shared-budget',0));
  select trigger_id into group_id from public.procurement_trigger_requests where request_id=(p_entry->>'request_id')::uuid;
  step:=(p_entry->>'step_id')::uuid;
  if group_id is not null and (step is null or not exists(select 1 from public.procurement_workflow_steps where id=step and trigger_id=group_id and request_id=(p_entry->>'request_id')::uuid and state='started')) then raise exception 'Matching active audit step required'; end if;
  if group_id is not null and exists(select 1 from public.procurement_triggers where id=group_id and state='cancelled') then raise exception 'Trigger cancelled'; end if;
  select * into v from public.procurement_usage_ledger where id=(p_entry->>'id')::uuid;
  if found then raise exception 'Call identity already reserved; reconcile before retry'; end if;
  if p_monthly_usd is null or p_monthly_usd<=0 then raise exception 'Paid calls disabled'; end if;
  select coalesce(sum(case when state='completed' then coalesce(actual_usd,reserved_usd) else greatest(reserved_usd,coalesce(actual_usd,0)) end),0),
    count(*) filter(where kind='inference'),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0)
    into spent,calls,ins,outs from public.procurement_usage_ledger
    where (case when group_id is null then request_id=(p_entry->>'request_id')::uuid else trigger_id=group_id end) and state<>'not_sent';
  if spent+(p_entry->>'reserved_usd')::numeric>1 or
     (p_entry->>'kind'='inference' and calls>=4) or ins+(p_entry->>'input_tokens')::integer>32000 or
     outs+(p_entry->>'output_tokens')::integer>8000 then raise exception 'Request budget exhausted'; end if;
  if exists(select 1 from public.procurement_usage_ledger where (case when group_id is null then request_id=(p_entry->>'request_id')::uuid else trigger_id=group_id end) and state in ('reserved','outcome_unknown')) then
    raise exception 'Previous call outcome unresolved';
  end if;
  select coalesce(sum(case when state='completed' then coalesce(actual_usd,reserved_usd) else greatest(reserved_usd,coalesce(actual_usd,0)) end),0) into spent from public.procurement_usage_ledger
    where created_at>=date_trunc('month',now()) and state<>'not_sent';
  if spent+(p_entry->>'reserved_usd')::numeric>p_monthly_usd then raise exception 'Monthly budget exhausted'; end if;
  insert into public.procurement_usage_ledger(id,request_id,actor_id,kind,provider,model,rate_version,input_tokens,output_tokens,reserved_usd,step_id,trigger_id)
    values((p_entry->>'id')::uuid,(p_entry->>'request_id')::uuid,(p_entry->>'actor_id')::uuid,p_entry->>'kind',p_entry->>'provider',
      p_entry->>'model',p_entry->>'rate_version',(p_entry->>'input_tokens')::integer,(p_entry->>'output_tokens')::integer,
      (p_entry->>'reserved_usd')::numeric,step,group_id) returning * into v;
  return to_jsonb(v);
end $$;

alter table public.procurement_triggers enable row level security;
revoke all on public.procurement_triggers from public,anon,authenticated;
grant select,insert,update on public.procurement_triggers to service_role;
alter table public.procurement_trigger_requests enable row level security;
revoke all on public.procurement_trigger_requests from public,anon,authenticated;
grant select,insert,update on public.procurement_trigger_requests to service_role;
alter table public.procurement_county_state_research enable row level security;
revoke all on public.procurement_county_state_research from public,anon,authenticated;
grant select,insert,update on public.procurement_county_state_research to service_role;
alter table public.procurement_state_trigger_associations enable row level security;
revoke all on public.procurement_state_trigger_associations from public,anon,authenticated;
grant select,insert,update on public.procurement_state_trigger_associations to service_role;
alter table public.procurement_workflow_steps enable row level security;
revoke all on public.procurement_workflow_steps from public,anon,authenticated;
grant select,insert,update on public.procurement_workflow_steps to service_role;
revoke all on function public.submit_procurement_trigger(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_procurement_trigger(uuid,text,text,jsonb) to service_role;
revoke all on function public.claim_procurement_trigger() from public,anon,authenticated;
grant execute on function public.claim_procurement_trigger() to service_role;
revoke all on function public.checkpoint_procurement_trigger(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_procurement_trigger(uuid,uuid,text,jsonb) to service_role;
revoke all on function public.control_procurement_trigger(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.control_procurement_trigger(uuid,uuid,text) to service_role;
revoke all on function public.associate_procurement_state_trigger(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.associate_procurement_state_trigger(uuid,text,text,text,jsonb) to service_role;
revoke all on function public.begin_procurement_step(jsonb) from public,anon,authenticated;
grant execute on function public.begin_procurement_step(jsonb) to service_role;
revoke all on function public.finish_procurement_step(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.finish_procurement_step(uuid,text,jsonb,uuid) to service_role;

-- Reuse the current worker claim implementation, adding only mutual exclusion with Admin coordinator claims.
alter function public.claim_procurement_workflow_job() rename to claim_procurement_workflow_job_before_admin;
create function public.claim_procurement_workflow_job() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('hosted-procurement-worker',0));
 if exists(select 1 from public.procurement_triggers where state='running' and lease_until>now()) then return null; end if;
 return public.claim_procurement_workflow_job_before_admin();
end $$;
revoke all on function public.claim_procurement_workflow_job() from public,anon,authenticated;
grant execute on function public.claim_procurement_workflow_job() to service_role;
grant usage,select on sequence public.procurement_workflow_steps_sequence_seq to service_role;

create index procurement_trigger_state_target on public.procurement_triggers((config->>'state_trigger_id'),created_at desc,id)
 where target_kind='state_source';
create function public.procurement_state_trigger_status() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'source_id',a.source_id,'name',s.name,'category',a.category,
   'county_ids',a.county_ids,'scheduled',false,'latest_run',latest.id,'last_finished_at',latest.finished_at)
   order by s.name,a.category,a.id),'[]'::jsonb)
 from public.procurement_state_trigger_associations a join public.procurement_sources s on s.id=a.source_id
 left join lateral(select t.id,t.finished_at from public.procurement_triggers t where t.target_kind='state_source' and t.config->>'state_trigger_id'=a.id::text
   order by t.created_at desc,t.id limit 1) latest on true;
$$;
revoke all on function public.procurement_state_trigger_status() from public,anon,authenticated;
grant execute on function public.procurement_state_trigger_status() to service_role;
commit;
