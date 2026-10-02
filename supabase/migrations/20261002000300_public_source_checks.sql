-- Phase 2 continuation: verified public page/document checks and immutable capture evidence.
begin;

alter table public.procurement_coverage_tasks
  drop constraint if exists procurement_coverage_tasks_state_check;
alter table public.procurement_coverage_tasks
  add constraint procurement_coverage_tasks_state_check check (state in
    ('unchecked','source_missing','method_missing','blocked','partial',
     'needs_interpretation','reviewed_with_results','reviewed_no_results'));
alter table public.procurement_coverage_tasks
  drop constraint if exists procurement_coverage_tasks_kind_check;
alter table public.procurement_coverage_tasks
  add constraint procurement_coverage_tasks_kind_check check
    (kind in ('forecast','opportunity','award','source_entry'));

create table if not exists public.procurement_public_captures (
  run_id uuid primary key references public.procurement_runs(id),
  source_id uuid not null references public.procurement_sources(id),
  requested_url text not null check (requested_url like 'https://%'),
  final_url text not null check (final_url like 'https://%'),
  content_type text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_base64 text not null check (length(content_base64) between 1 and 2666668),
  retrieved_at timestamptz not null default now()
);
create index if not exists procurement_public_captures_identity_idx
  on public.procurement_public_captures(source_id,final_url,content_sha256);
alter table public.procurement_public_captures enable row level security;
revoke all on public.procurement_public_captures from public,anon,authenticated;
grant select,insert on public.procurement_public_captures to service_role;

create or replace function public.create_procurement_known_plan(
  p_request_id uuid, p_tasks jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare item jsonb; task_id uuid; capability public.procurement_source_capabilities%rowtype;
        entry_source public.procurement_sources%rowtype;
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
       or item->>'kind' not in ('forecast','opportunity','award','source_entry')
       or item->>'state' not in ('unchecked','blocked','source_missing','method_missing')
       or nullif(item->>'task_key','') is null
       or jsonb_typeof(item->'query_window') <> 'object' then
      raise exception 'Invalid route coverage task';
    end if;
    if item->>'kind' = 'source_entry' then
      select * into entry_source from public.procurement_sources
        where id = (item->>'source_id')::uuid;
      if not found or item->>'state' <> 'unchecked'
         or item->>'capability_id' is not null
         or entry_source.url <> item->'evidence'->>'entry_url' then
        raise exception 'Entry check needs a registered source URL';
      end if;
    elsif item->>'state' = 'unchecked' then
      select * into capability from public.procurement_source_capabilities
        where id = (item->>'capability_id')::uuid
          and source_id = (item->>'source_id')::uuid
          and route_geography_id = target.geography_id
          and kind = item->>'kind'
          and availability = 'active' and verified_at <= now() and verified_until > now();
      if not found or capability.method_spec->>'version' <> '1' or not (
        (capability.method = 'api' and capability.method_spec->>'runner_id' = 'sam-search') or
        (capability.method in ('browser','document') and capability.method_spec->>'runner_id' = 'public-fetch')) then
        raise exception 'Coverage task needs a current runnable capability';
      end if;
    end if;
    insert into public.procurement_coverage_tasks
      (target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,
       capability_id,source_id,state,query_window,evidence)
    values (target.id,item->>'task_key',item->>'agency_scope',target.geography_id,
      item->>'kind',(item->>'priority')::integer,item->>'reason',
      nullif(item->>'capability_id','')::uuid,nullif(item->>'source_id','')::uuid,
      item->>'state',item->'query_window',coalesce(item->'evidence','{}'::jsonb))
    on conflict (target_id,task_key) do nothing;
    get diagnostics affected = row_count;
    tasks_created := tasks_created + affected;
    select id into task_id from public.procurement_coverage_tasks
      where target_id = target.id and task_key = item->>'task_key';
    if item->>'state' = 'unchecked' then
      insert into public.procurement_jobs
        (search_request_id,capability_id,task_id,dedupe_key,kind,checkpoint)
      values (p_request_id,case when item->>'kind' = 'source_entry' then null else capability.id end,
              task_id,'known-source:' || task_id,
              'collect',jsonb_build_object('next_page',0,'run_ids','[]'::jsonb))
      on conflict (dedupe_key) do nothing;
      get diagnostics affected = row_count;
      jobs_created := jobs_created + affected;
    end if;
  end loop;
  return jsonb_build_object('tasks_created',tasks_created,'jobs_created',jobs_created);
end $fn$;

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
     or p_task_state not in ('reviewed_with_results','reviewed_no_results',
                             'needs_interpretation','blocked','partial')
     or (p_job_state = 'succeeded') <>
        (p_task_state in ('reviewed_with_results','reviewed_no_results','needs_interpretation'))
     or jsonb_typeof(p_checkpoint) <> 'object'
     or jsonb_typeof(p_evidence) <> 'object'
     or p_pages < 0 or p_results < 0
     or (p_job_state = 'succeeded' and (p_pages = 0 or p_evidence = '{}'::jsonb))
     or (p_task_state = 'needs_interpretation' and p_results <> 0) then
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

commit;
