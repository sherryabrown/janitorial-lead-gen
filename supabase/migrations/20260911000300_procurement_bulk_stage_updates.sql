begin;

create or replace function public.bulk_update_procurement_lead_stage(
  p_lead_ids uuid[],
  p_new_stage text,
  p_reason_code text default null,
  p_reason_note text default null
) returns setof public.procurement_leads
language plpgsql security definer set search_path = public, auth
as $$
declare
  lead_row public.procurement_leads;
  updated_row public.procurement_leads;
  found_count integer;
  new_stage text := lower(replace(trim(coalesce(p_new_stage, '')), '_', '-'));
  new_reason text := nullif(trim(coalesce(p_reason_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 or array_position(p_lead_ids, null) is not null then
    raise exception 'At least one valid procurement lead is required';
  end if;
  if cardinality(p_lead_ids) <> (select count(distinct id) from unnest(p_lead_ids) as id) then
    raise exception 'Duplicate procurement lead ids are not allowed';
  end if;
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then
    raise exception 'Invalid procurement stage';
  end if;
  if new_stage in ('lost','not-interested','withdrew') and nullif(trim(coalesce(p_reason_code, '')), '') is null then
    raise exception 'A reason is required';
  end if;
  if p_reason_code = 'Other' and new_reason is null then
    raise exception 'Other requires a reason detail';
  end if;
  if new_stage not in ('lost','not-interested','withdrew') then
    p_reason_code := null;
    new_reason := null;
  end if;

  select count(*) into found_count from public.procurement_leads where id = any(p_lead_ids);
  if found_count <> cardinality(p_lead_ids) then raise exception 'One or more procurement leads were not found'; end if;

  for lead_row in select * from public.procurement_leads where id = any(p_lead_ids) order by id for update loop
    if lead_row.stage is distinct from new_stage or lead_row.stage_reason is distinct from p_reason_code then
      update public.procurement_leads
        set stage = new_stage, stage_reason = p_reason_code, updated_at = now()
        where id = lead_row.id
        returning * into updated_row;
      insert into public.lead_status_changes(
        lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by
      ) values (
        lead_row.id, lead_row.stage, new_stage, lead_row.stage_reason, p_reason_code, p_reason_code, new_reason, auth.uid()
      );
      return next updated_row;
    end if;
  end loop;
end;
$$;

revoke all on function public.bulk_update_procurement_lead_stage(uuid[],text,text,text) from public, anon;
grant execute on function public.bulk_update_procurement_lead_stage(uuid[],text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
