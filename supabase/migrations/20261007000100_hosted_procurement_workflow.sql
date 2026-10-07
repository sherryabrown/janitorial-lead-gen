-- Reviewed forward migration. No existing requests or source methods are rewritten.
begin;
alter table public.procurement_search_requests
  add column initiated_by uuid references auth.users(id),
  add column client_request_key text,
  add column submission_hash text,
  add column requested_categories text[],
  add column workflow_control jsonb not null default '{}'::jsonb;
alter table public.procurement_search_requests drop constraint procurement_search_requests_request_origin_check;
alter table public.procurement_search_requests add constraint procurement_search_requests_request_origin_check
  check(request_origin is null or request_origin in ('chat','api'));
alter table public.procurement_search_requests add constraint procurement_requested_categories_check
  check(requested_categories is null or (cardinality(requested_categories)>0 and
    requested_categories <@ array['forecast','opportunity','award']::text[]));
create unique index procurement_request_client_key on public.procurement_search_requests(initiated_by,client_request_key)
  where client_request_key is not null;

create table public.procurement_extraction_cache (
  cache_key text primary key check(cache_key ~ '^[a-f0-9]{64}$'),
  source_id uuid not null references public.procurement_sources(id),
  facts jsonb not null,
  created_at timestamptz not null default now()
);
create table public.procurement_usage_ledger (
  id uuid primary key,
  request_id uuid not null references public.procurement_search_requests(id),
  actor_id uuid not null references auth.users(id),
  kind text not null check(kind in ('inference','search')),
  provider text not null,
  model text not null,
  rate_version text not null,
  input_tokens integer not null check(input_tokens between 0 and 8000),
  output_tokens integer not null check(output_tokens between 0 and 2000),
  reserved_usd numeric not null check(reserved_usd>=0),
  actual_usd numeric check(actual_usd>=0),
  state text not null default 'reserved' check(state in ('reserved','completed','not_sent','outcome_unknown')),
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index procurement_usage_request on public.procurement_usage_ledger(request_id,created_at);
create index procurement_usage_month on public.procurement_usage_ledger(created_at);
alter table public.procurement_extraction_cache enable row level security;
alter table public.procurement_usage_ledger enable row level security;
revoke all on public.procurement_extraction_cache,public.procurement_usage_ledger from public,anon,authenticated;
grant select,insert on public.procurement_extraction_cache to service_role;
grant select,insert,update on public.procurement_usage_ledger to service_role;
insert into storage.buckets(id,name,public) values('procurement-private','procurement-private',false)
  on conflict(id) do nothing;

create function public.submit_procurement_api_request(p_actor uuid,p_key text,p_hash text,p_input jsonb,p_categories text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.procurement_search_requests%rowtype; result uuid;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or
     p_key !~ '^[A-Za-z0-9_-]{8,100}$' or p_hash !~ '^[a-f0-9]{64}$' or
     cardinality(p_categories)=0 or not p_categories <@ array['forecast','opportunity','award']::text[] then
    raise exception 'Invalid authenticated submission';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into existing from public.procurement_search_requests where initiated_by=p_actor and client_request_key=p_key;
  if found then
    if existing.submission_hash<>p_hash then raise exception 'Idempotency key reused for different input'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.procurement_search_requests where initiated_by=p_actor and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Hourly request limit reached';
  end if;
  result:=public.create_procurement_geography_request(p_input->>'p_name',p_input->>'p_geography_id',
    array(select jsonb_array_elements_text(p_input->'p_selected_city_ids')),
    (p_input->>'p_cities_confirmed_at')::timestamptz,p_input->'p_service_scope',p_input->'p_search_windows',p_input->>'p_county_id');
  update public.procurement_search_requests set initiated_by=p_actor,client_request_key=p_key,submission_hash=p_hash,
    requested_categories=p_categories,request_origin='api',workflow_control=jsonb_build_object('cancelled',false)
    where id=result;
  insert into public.procurement_jobs(search_request_id,dedupe_key,kind,checkpoint)
    values(result,'api-workflow:'||result,'process',jsonb_build_object('stage','plan','actor_id',p_actor));
  return result;
end $$;

create function public.claim_procurement_workflow_job() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.procurement_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('hosted-procurement-worker',0));
  if exists(select 1 from public.procurement_jobs where (dedupe_key like 'api-workflow:%' or dedupe_key like 'api-import:%' or dedupe_key like 'api-sam:%') and
    state='running' and lease_until>now()) then return null; end if;
  select * into j from public.procurement_jobs where (dedupe_key like 'api-workflow:%' or dedupe_key like 'api-import:%' or dedupe_key like 'api-sam:%') and
    (state='pending' or state='running' and lease_until<now()) order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.procurement_jobs set state='running',lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',
    attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
end $$;
create function public.submit_procurement_sam_request(p_actor uuid,p_key text,p_hash text,p_kind text,p_window jsonb,p_filters jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.procurement_search_requests%rowtype; result uuid;
begin
  if not exists(select 1 from auth.users where id=p_actor) or p_key !~ '^[A-Za-z0-9_-]{8,100}$' or
    p_hash !~ '^[a-f0-9]{64}$' or p_kind not in ('opportunity','award') then raise exception 'Invalid statewide SAM request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into existing from public.procurement_search_requests where initiated_by=p_actor and client_request_key='sam:'||p_key;
  if found then
    if existing.submission_hash<>p_hash then raise exception 'Idempotency key reused for different input'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.procurement_search_requests where initiated_by=p_actor and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Hourly request limit reached'; end if;
  insert into public.procurement_search_requests(name,search_boundary_mode,requested_search_areas,contracting_entity_geo_levels,
    service_scope,search_windows,scope_resolution_state,request_origin,initiated_by,client_request_key,submission_hash,requested_categories)
    values('Manual statewide SAM janitorial','exact_area','[{"area_type":"state","state_code":"AR"}]',array['federal'],
      '{"service":"janitorial"}',jsonb_build_object(p_kind,p_window),'ready','api',p_actor,'sam:'||p_key,p_hash,array[p_kind]) returning id into result;
  insert into public.procurement_jobs(search_request_id,dedupe_key,kind,checkpoint)
    values(result,'api-sam:'||result,'process',jsonb_build_object('stage','sam_collect','actor_id',p_actor,'kind',p_kind,'filters',p_filters));
  return result;
end $$;

create function public.checkpoint_procurement_workflow(p_job uuid,p_lease uuid,p_state text,p_checkpoint jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_state not in ('pending','running','blocked','succeeded','cancelled','outcome_unknown') then raise exception 'Invalid workflow state'; end if;
  update public.procurement_jobs set state=p_state,checkpoint=p_checkpoint,updated_at=now(),
    lease_until=case when p_state='running' then now()+interval '10 minutes' else null end
    where id=p_job and lease_token=p_lease and lease_until>now() and state='running';
  return found;
end $$;

create function public.reserve_procurement_usage(p_entry jsonb,p_monthly_usd numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.procurement_usage_ledger%rowtype; spent numeric; calls integer; ins bigint; outs bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('procurement-shared-budget',0));
  select * into v from public.procurement_usage_ledger where id=(p_entry->>'id')::uuid;
  if found then raise exception 'Call identity already reserved; reconcile before retry'; end if;
  if p_monthly_usd is null or p_monthly_usd<=0 then raise exception 'Paid calls disabled'; end if;
  select coalesce(sum(case when state='completed' then coalesce(actual_usd,reserved_usd) else greatest(reserved_usd,coalesce(actual_usd,0)) end),0),
    count(*) filter(where kind='inference'),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0)
    into spent,calls,ins,outs from public.procurement_usage_ledger
    where request_id=(p_entry->>'request_id')::uuid and state<>'not_sent';
  if spent+(p_entry->>'reserved_usd')::numeric>1 or
     (p_entry->>'kind'='inference' and calls>=4) or ins+(p_entry->>'input_tokens')::integer>32000 or
     outs+(p_entry->>'output_tokens')::integer>8000 then raise exception 'Request budget exhausted'; end if;
  if exists(select 1 from public.procurement_usage_ledger where request_id=(p_entry->>'request_id')::uuid and state in ('reserved','outcome_unknown')) then
    raise exception 'Previous call outcome unresolved';
  end if;
  select coalesce(sum(case when state='completed' then coalesce(actual_usd,reserved_usd) else greatest(reserved_usd,coalesce(actual_usd,0)) end),0) into spent from public.procurement_usage_ledger
    where created_at>=date_trunc('month',now()) and state<>'not_sent';
  if spent+(p_entry->>'reserved_usd')::numeric>p_monthly_usd then raise exception 'Monthly budget exhausted'; end if;
  insert into public.procurement_usage_ledger(id,request_id,actor_id,kind,provider,model,rate_version,input_tokens,output_tokens,reserved_usd)
    values((p_entry->>'id')::uuid,(p_entry->>'request_id')::uuid,(p_entry->>'actor_id')::uuid,p_entry->>'kind',p_entry->>'provider',
      p_entry->>'model',p_entry->>'rate_version',(p_entry->>'input_tokens')::integer,(p_entry->>'output_tokens')::integer,
      (p_entry->>'reserved_usd')::numeric) returning * into v;
  return to_jsonb(v);
end $$;
create function public.refine_procurement_extraction(p_key text,p_expected jsonb,p_facts jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.procurement_extraction_cache set facts=p_facts where cache_key=p_key and facts=p_expected;
  return found;
end $$;
create function public.control_procurement_workflow(p_request uuid,p_actor uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.procurement_jobs%rowtype;
begin
  if p_action not in ('cancel','resume') or not exists(select 1 from auth.users where id=p_actor) then raise exception 'Invalid actor/action'; end if;
  select * into j from public.procurement_jobs where dedupe_key in ('api-workflow:'||p_request,'api-sam:'||p_request) for update;
  if not found then raise exception 'Hosted workflow request required'; end if;
  if p_action='resume' and j.state='outcome_unknown' then raise exception 'Reconcile before resume'; end if;
  update public.procurement_search_requests set workflow_control=workflow_control||jsonb_build_object(
    'cancelled',p_action='cancel','last_action',p_action,'actor_id',p_actor,'at',now()) where id=p_request;
  if p_action='resume' then
    update public.procurement_jobs set state='pending',updated_at=now() where id=j.id and state in ('blocked','cancelled');
  end if;
  return jsonb_build_object('request_id',p_request,'action',p_action);
end $$;
revoke all on function public.submit_procurement_api_request(uuid,text,text,jsonb,text[]),
  public.claim_procurement_workflow_job(),public.checkpoint_procurement_workflow(uuid,uuid,text,jsonb),
  public.reserve_procurement_usage(jsonb,numeric) from public,anon,authenticated;
grant execute on function public.submit_procurement_api_request(uuid,text,text,jsonb,text[]),
  public.claim_procurement_workflow_job(),public.checkpoint_procurement_workflow(uuid,uuid,text,jsonb),
  public.reserve_procurement_usage(jsonb,numeric) to service_role;
revoke all on function public.refine_procurement_extraction(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.refine_procurement_extraction(text,jsonb,jsonb) to service_role;
revoke all on function public.control_procurement_workflow(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.control_procurement_workflow(uuid,uuid,text) to service_role;
revoke all on function public.submit_procurement_sam_request(uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_procurement_sam_request(uuid,text,text,text,jsonb,jsonb) to service_role;
commit;
