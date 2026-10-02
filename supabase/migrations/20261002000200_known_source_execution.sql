-- Phase 2: route-specific coverage, leased collection jobs and immutable source observations.
begin;

alter table public.procurement_coverage_tasks
  add column source_id uuid references public.procurement_sources(id);
alter table public.procurement_jobs
  add column task_id uuid references public.procurement_coverage_tasks(id),
  add column lease_token uuid;
create unique index procurement_jobs_task_id_key on public.procurement_jobs(task_id)
  where task_id is not null;
alter table public.procurement_runs
  add column job_id uuid references public.procurement_jobs(id),
  add column coverage_task_id uuid references public.procurement_coverage_tasks(id),
  add column page_index integer,
  add column page_attempt integer not null default 0,
  add constraint procurement_runs_page_index_check check (page_index is null or page_index >= 0),
  add constraint procurement_runs_page_attempt_check check (page_attempt >= 0),
  add constraint procurement_runs_execution_context_check
    check ((job_id is null and coverage_task_id is null and page_index is null)
      or (job_id is not null and coverage_task_id is not null and page_index is not null));
create unique index procurement_runs_job_page_attempt_key on public.procurement_runs(job_id,page_index,page_attempt)
  where job_id is not null;

create table public.procurement_source_observations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.procurement_sources(id),
  external_id text not null,
  record_group text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  change_type text not null check (change_type in ('new','changed')),
  first_run_id uuid not null references public.procurement_runs(id),
  observed_at timestamptz not null default now(),
  unique (source_id,external_id,payload_hash)
);
create index procurement_source_observations_identity_idx
  on public.procurement_source_observations(source_id,external_id);
alter table public.procurement_source_observations enable row level security;
revoke all on public.procurement_source_observations from public, anon, authenticated;
grant select, insert on public.procurement_source_observations to service_role;

create or replace function public.create_procurement_known_plan(
  p_request_id uuid, p_tasks jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare item jsonb; task_id uuid; capability public.procurement_source_capabilities%rowtype;
        target public.procurement_request_targets%rowtype;
        tasks_created integer := 0; jobs_created integer := 0; affected integer;
begin
  if not exists (select 1 from public.procurement_search_requests where id = p_request_id)
     or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception 'Existing request and nonempty coverage plan required';
  end if;
  for item in select value from jsonb_array_elements(p_tasks) loop
    select * into target from public.procurement_request_targets
      where id = (item->>'target_id')::uuid and search_request_id = p_request_id;
    if not found or target.geography_id <> item->>'route_geography_id'
       or item->>'kind' not in ('forecast','opportunity','award')
       or item->>'state' not in ('unchecked','blocked','source_missing')
       or nullif(item->>'task_key','') is null
       or jsonb_typeof(item->'query_window') <> 'object' then
      raise exception 'Invalid route coverage task';
    end if;
    if item->>'state' = 'unchecked' then
      select * into capability from public.procurement_source_capabilities
        where id = (item->>'capability_id')::uuid
          and source_id = (item->>'source_id')::uuid
          and route_geography_id = target.geography_id
          and kind = item->>'kind'
          and availability = 'active' and verified_at <= now() and verified_until > now();
      if not found or capability.method <> 'api'
         or capability.method_spec->>'runner_id' <> 'sam-search'
         or capability.method_spec->>'version' <> '1' then
        raise exception 'Coverage task needs a current runnable capability';
      end if;
    end if;
    insert into public.procurement_coverage_tasks
      (target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,
       capability_id,source_id,state,query_window)
    values (target.id,item->>'task_key',item->>'agency_scope',target.geography_id,
      item->>'kind',(item->>'priority')::integer,item->>'reason',
      nullif(item->>'capability_id','')::uuid,nullif(item->>'source_id','')::uuid,
      item->>'state',item->'query_window')
    on conflict (target_id,task_key) do nothing;
    get diagnostics affected = row_count;
    tasks_created := tasks_created + affected;
    select id into task_id from public.procurement_coverage_tasks
      where target_id = target.id and task_key = item->>'task_key';
    if item->>'state' = 'unchecked' then
      insert into public.procurement_jobs
        (search_request_id,capability_id,task_id,dedupe_key,kind,checkpoint)
      values (p_request_id,capability.id,task_id,'known-source:' || task_id,
              'collect',jsonb_build_object('next_page',0,'run_ids','[]'::jsonb))
      on conflict (dedupe_key) do nothing;
      get diagnostics affected = row_count;
      jobs_created := jobs_created + affected;
    end if;
  end loop;
  return jsonb_build_object('tasks_created',tasks_created,'jobs_created',jobs_created);
end $fn$;
revoke all on function public.create_procurement_known_plan(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_procurement_known_plan(uuid,jsonb) to service_role;

create or replace function public.claim_procurement_known_job(p_job_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare claimed public.procurement_jobs%rowtype;
begin
  update public.procurement_jobs
  set state = 'running', lease_token = gen_random_uuid(),
      lease_until = now() + interval '30 minutes', attempts = attempts + 1,
      updated_at = now()
  where id = p_job_id and kind = 'collect' and task_id is not null
    and attempts < 3 and (next_attempt_at is null or next_attempt_at <= now())
    and (state in ('pending','partial')
      or (state = 'running' and lease_until < now()))
  returning * into claimed;
  if not found then return null; end if;
  return to_jsonb(claimed);
end $fn$;
revoke all on function public.claim_procurement_known_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_procurement_known_job(uuid) to service_role;

create or replace function public.finish_procurement_known_job(
  p_job_id uuid, p_lease_token uuid, p_job_state text, p_task_state text,
  p_checkpoint jsonb, p_evidence jsonb, p_pages integer, p_results integer,
  p_last_error text default null)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare job public.procurement_jobs%rowtype;
begin
  select * into job from public.procurement_jobs
    where id = p_job_id and state = 'running'
      and lease_token = p_lease_token and lease_until > now()
    for update;
  if not found then return false; end if;
  if p_job_state not in ('succeeded','blocked','partial','outcome_unknown')
     or p_task_state not in ('reviewed_with_results','reviewed_no_results','blocked','partial')
     or (p_job_state = 'succeeded') <>
        (p_task_state in ('reviewed_with_results','reviewed_no_results'))
     or jsonb_typeof(p_checkpoint) <> 'object'
     or jsonb_typeof(p_evidence) <> 'object'
     or p_pages < 0 or p_results < 0
     or (p_job_state = 'succeeded' and (p_pages = 0 or p_evidence = '{}'::jsonb)) then
    raise exception 'Invalid collection outcome';
  end if;
  update public.procurement_coverage_tasks
    set state = p_task_state, checkpoint = p_checkpoint, evidence = p_evidence,
        pages_reviewed = p_pages, results_count = p_results, updated_at = now()
    where id = job.task_id;
  update public.procurement_jobs
    set state = p_job_state, checkpoint = p_checkpoint, last_error = p_last_error,
        lease_token = null, lease_until = null, updated_at = now()
    where id = p_job_id;
  return true;
end $fn$;
revoke all on function public.finish_procurement_known_job(uuid,uuid,text,text,jsonb,jsonb,integer,integer,text)
  from public,anon,authenticated;
grant execute on function public.finish_procurement_known_job(uuid,uuid,text,text,jsonb,jsonb,integer,integer,text)
  to service_role;

create or replace function public.record_procurement_observations(
  p_run_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare run public.procurement_runs%rowtype; item jsonb; old_exists boolean;
        result jsonb := '[]'::jsonb; change_state text;
begin
  select * into run from public.procurement_runs where id = p_run_id;
  if not found or run.job_id is null or run.detail->>'state' <> 'response_captured'
     or run.detail->>'upstream_status' <> '200'
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Verified routed SAM run and bounded observations required';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if nullif(item->>'external_id','') is null
       or nullif(item->>'record_group','') is null
       or (item->>'payload_hash') !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid source observation';
    end if;
    if exists (select 1 from public.procurement_source_observations
      where source_id = run.source_id and external_id = item->>'external_id'
        and payload_hash = item->>'payload_hash') then
      change_state := 'unchanged';
    else
      select exists (select 1 from public.procurement_source_observations
        where source_id = run.source_id and external_id = item->>'external_id')
        into old_exists;
      change_state := case when old_exists then 'changed' else 'new' end;
      insert into public.procurement_source_observations
        (source_id,external_id,record_group,payload_hash,change_type,first_run_id)
      values (run.source_id,item->>'external_id',item->>'record_group',
              item->>'payload_hash',change_state,p_run_id)
      on conflict (source_id,external_id,payload_hash) do nothing;
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'external_id',item->>'external_id','record_group',item->>'record_group',
      'payload_hash',item->>'payload_hash','change_type',change_state));
  end loop;
  return result;
end $fn$;
revoke all on function public.record_procurement_observations(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_procurement_observations(uuid,jsonb) to service_role;

commit;
