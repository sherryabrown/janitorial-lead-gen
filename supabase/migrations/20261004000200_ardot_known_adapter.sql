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
          and route_geography_id = target.geography_id
          and kind = item->>'kind'
          and availability = 'active' and verified_at <= now() and verified_until > now();
      if not found or capability.method_spec->>'version' <> '1' or not (
        (capability.method = 'api' and capability.method_spec->>'runner_id' = 'sam-search') or
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

commit;
