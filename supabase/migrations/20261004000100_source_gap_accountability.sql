-- Source gaps are distinct from legacy aggregate gaps; existing tasks/runs are retained.
begin;
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
            and cap.route_geography_id=gap.route_geography_id and cap.kind=gap.kind
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
commit;
