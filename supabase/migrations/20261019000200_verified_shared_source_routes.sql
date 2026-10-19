-- Preserve canonical method identity; accept only server-verified additional route associations.
begin;

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
          and (route_geography_id = target.geography_id or (
            verification_evidence->>'automation_policy' = 'county-public-v1'
            and jsonb_typeof(verification_evidence->'route_geography_ids') = 'array'
            and (verification_evidence->'route_geography_ids') ? target.geography_id))
          and kind = item->>'kind'
          and availability = 'active' and verified_at <= now() and verified_until > now();
      if not found or capability.method_spec->>'version' <> '1' or not (
        (capability.method = 'api' and capability.method_spec->>'runner_id' in ('sam-search','api-bounded')) or
        (capability.method = 'browser' and capability.method_spec->>'runner_id' = 'authenticated-browser') or
        (capability.method in ('browser','document') and capability.method_spec->>'runner_id' = 'public-fetch') or
        (capability.method = 'browser' and capability.kind = 'opportunity'
          and capability.method_spec->>'runner_id' = 'ardot-table'
          and capability.method_spec->>'entry_url' =
            'https://ardot.gov/divisions/equipment-procurement/commodities-and-services/bids-by-fiscal-year/'
          and capability.method_spec->>'ajax_url' =
            'https://ardot.gov/wp-admin/admin-ajax.php?action=get_wdtable&table_id=53'
          and exists (select 1 from public.procurement_sources s
            where s.id = capability.source_id and s.code = 'ardot'))) then
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

-- Source gaps are distinct from legacy aggregate gaps; existing tasks/runs are retained.

create or replace function public.reconcile_procurement_source_gaps(p_request_id uuid,p_tasks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare item jsonb; gap public.procurement_coverage_tasks%rowtype;
  replacements jsonb; resolved integer := 0; reopened integer := 0;
begin
  if not exists(select 1 from public.procurement_search_requests where id=p_request_id)
    or p_tasks is null or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)=0 then
    raise exception 'Existing request and nonempty plan required';
  end if;
  for item in select value from jsonb_array_elements(p_tasks) loop
    if not exists(select 1 from public.procurement_request_targets t
      where t.id=(item->>'target_id')::uuid and t.search_request_id=p_request_id
      and t.geography_id=item->>'route_geography_id') then
      raise exception 'Invalid request route';
    end if;
  end loop;
  for gap in select t.* from public.procurement_coverage_tasks t
    join public.procurement_request_targets r on r.id=t.target_id
    where r.search_request_id=p_request_id and t.source_id is not null
      and t.task_key=t.kind||':source:'||t.source_id::text||':missing'
      and t.state in ('method_missing','superseded')
    for update of t loop
    select coalesce(jsonb_agg(jsonb_build_object('task_key',t->>'task_key',
      'capability_id',t->>'capability_id')),'[]'::jsonb) into replacements
      from jsonb_array_elements(p_tasks) t
      where t->>'target_id'=gap.target_id::text and t->>'kind'=gap.kind
        and t->>'source_id'=gap.source_id::text and t->>'state'='unchecked'
        and exists(select 1 from public.procurement_coverage_tasks saved
          join public.procurement_source_capabilities cap on cap.id=saved.capability_id
          where saved.target_id=gap.target_id and saved.task_key=t->>'task_key'
            and cap.id=(t->>'capability_id')::uuid and cap.source_id=gap.source_id
            and (cap.route_geography_id=gap.route_geography_id or (
              cap.verification_evidence->>'automation_policy'='county-public-v1'
              and jsonb_typeof(cap.verification_evidence->'route_geography_ids')='array'
              and (cap.verification_evidence->'route_geography_ids') ? gap.route_geography_id)) and cap.kind=gap.kind
            and cap.availability='active' and cap.verified_at<=now() and cap.verified_until>now());
    if jsonb_array_length(replacements)>0 and gap.state='method_missing' then
      update public.procurement_coverage_tasks set state='superseded',
        evidence=gap.evidence||jsonb_build_object('superseded_by',replacements),updated_at=now()
        where id=gap.id;
      resolved:=resolved+1;
    elsif gap.state='superseded' and jsonb_array_length(replacements)=0 then
      select value into item from jsonb_array_elements(p_tasks)
        where value->>'target_id'=gap.target_id::text and value->>'task_key'=gap.task_key
          and value->>'source_id'=gap.source_id::text and value->>'state'='method_missing' limit 1;
      if item is not null then
        update public.procurement_coverage_tasks set state='method_missing',reason=item->>'reason',
          evidence=coalesce(item->'evidence','{}'::jsonb)||jsonb_build_object('previous_resolution',gap.evidence->'superseded_by'),
          updated_at=now() where id=gap.id;
        reopened:=reopened+1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('superseded',resolved,'reopened',reopened);
end $fn$;
revoke all on function public.reconcile_procurement_source_gaps(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_procurement_source_gaps(uuid,jsonb) to service_role;


create or replace function public.procurement_schedule_baseline_before_sam(p_trigger uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(distinct jsonb_build_object('source_id',c.source_id,'category',c.kind,'capability_id',c.id,
 'run_id',saved.id,'finished_at',saved.finished_at,'content_sha256',saved.detail->>'content_sha256')),'[]'::jsonb)
 from public.procurement_trigger_requests link join public.procurement_search_requests req on req.id=link.request_id
 join public.procurement_request_targets target on target.search_request_id=req.id
 join public.procurement_source_capabilities c on (c.route_geography_id=target.geography_id or (
  c.verification_evidence->>'automation_policy'='county-public-v1'
  and jsonb_typeof(c.verification_evidence->'route_geography_ids')='array'
  and (c.verification_evidence->'route_geography_ids') ? target.geography_id))
 join public.procurement_sources source on source.id=c.source_id
 join lateral(select r.id,r.finished_at,r.detail from public.procurement_runs r join public.procurement_jobs j on j.id=r.job_id
  where r.source_id=c.source_id and j.capability_id=c.id and r.detail->>'state'='content_saved'
   and r.detail->'query_window'=req.search_windows->c.kind and r.detail->>'parser_version'=c.parser_version
  order by r.finished_at desc,r.id limit 1) saved on true
 where link.trigger_id=p_trigger and link.role<>'state_research' and c.kind=any(req.requested_categories)
 and ((link.role='state_source' and c.source_id=(req.workflow_control->>'source_id')::uuid) or
 (link.role='county' and source.contracting_entity_geo_level<>'state' and not exists(select 1 from public.procurement_source_capabilities sc where sc.source_id=c.source_id and sc.route_geography_id='05')));
$$;

commit;
