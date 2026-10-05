-- Preserve historical gap tasks while making the current request plan truthful.
begin;

alter table public.procurement_coverage_tasks
  drop constraint if exists procurement_coverage_tasks_state_check;
alter table public.procurement_coverage_tasks
  add constraint procurement_coverage_tasks_state_check check (state in
    ('unchecked','source_missing','method_missing','superseded','blocked','partial',
     'needs_interpretation','reviewed_with_results','reviewed_no_results'));

create or replace function public.reconcile_procurement_known_gaps(
  p_request_id uuid, p_tasks jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare item jsonb; target public.procurement_request_targets%rowtype;
        gap public.procurement_coverage_tasks%rowtype;
        replacements jsonb; resolved integer := 0; reopened integer := 0;
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
       or nullif(item->>'task_key','') is null then
      raise exception 'Invalid route coverage task';
    end if;
  end loop;
  for gap in select task.* from public.procurement_coverage_tasks task
    join public.procurement_request_targets route on route.id = task.target_id
    where route.search_request_id = p_request_id
      and task.task_key = task.kind || ':missing'
      and task.kind in ('forecast','opportunity','award')
    for update of task loop
    select coalesce(jsonb_agg(jsonb_build_object('task_key', t->>'task_key',
      'capability_id', t->>'capability_id')), '[]'::jsonb) into replacements
      from jsonb_array_elements(p_tasks) t
      where t->>'target_id' = gap.target_id::text
        and t->>'kind' = gap.kind and t->>'state' = 'unchecked'
        and t->>'capability_id' is not null
        and exists (select 1 from public.procurement_coverage_tasks saved
          join public.procurement_source_capabilities cap on cap.id = saved.capability_id
          where saved.target_id = gap.target_id and saved.task_key = t->>'task_key'
            and saved.capability_id = (t->>'capability_id')::uuid
            and cap.availability = 'active' and cap.verified_at <= now()
            and cap.verified_until > now());
    if jsonb_array_length(replacements) > 0 and gap.state <> 'superseded' then
      update public.procurement_coverage_tasks set state = 'superseded',
        evidence = coalesce(gap.evidence,'{}'::jsonb) ||
          jsonb_build_object('superseded_by',replacements), updated_at = now()
        where id = gap.id;
      resolved := resolved + 1;
    elsif jsonb_array_length(replacements) = 0 and gap.state = 'superseded' then
      select value into item from jsonb_array_elements(p_tasks)
        where value->>'target_id' = gap.target_id::text
          and value->>'task_key' = gap.task_key
          and value->>'state' in ('source_missing','method_missing') limit 1;
      if item is not null then
        update public.procurement_coverage_tasks set state = item->>'state',
          reason = item->>'reason', query_window = item->'query_window',
          evidence = coalesce(item->'evidence','{}'::jsonb), updated_at = now()
          where id = gap.id;
        reopened := reopened + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('superseded',resolved,'reopened',reopened);
end $fn$;

revoke all on function public.reconcile_procurement_known_gaps(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.reconcile_procurement_known_gaps(uuid,jsonb)
  to service_role;

commit;
