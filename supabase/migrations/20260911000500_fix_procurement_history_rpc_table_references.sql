begin;

create or replace function public.create_lead_note(p_lead_id uuid, p_body text)
returns public.procurement_lead_notes
language plpgsql security invoker set search_path = public as $$
declare
  r public.procurement_lead_notes;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Note cannot be blank'; end if;
  insert into public.procurement_lead_notes(lead_id, body, created_by)
  values(p_lead_id, trim(p_body), auth.uid())
  returning * into r;
  return r;
end;
$$;

create or replace function public.edit_lead_note(p_note_id uuid, p_new_body text)
returns public.procurement_lead_notes
language plpgsql security invoker set search_path = public as $$
declare
  r public.procurement_lead_notes;
  old_body text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_new_body), '') is null then raise exception 'Note cannot be blank'; end if;
  select * into r from public.procurement_lead_notes where id = p_note_id for update;
  if not found then raise exception 'Note not found'; end if;
  old_body := r.body;
  if old_body is distinct from trim(p_new_body) then
    insert into public.procurement_lead_note_edits(note_id, old_body, new_body, edited_by)
    values(p_note_id, old_body, trim(p_new_body), auth.uid());
    update public.procurement_lead_notes
    set body = trim(p_new_body), updated_by = auth.uid(), updated_at = now()
    where id = p_note_id
    returning * into r;
  end if;
  return r;
end;
$$;

create or replace function public.update_procurement_lead_stage(
  p_lead_id uuid,
  p_new_stage text,
  p_reason_code text default null,
  p_reason_note text default null
) returns public.procurement_leads
language plpgsql security definer set search_path = public, auth
as $$
declare
  r public.procurement_leads;
  old_stage text;
  old_reason text;
  new_stage text := lower(replace(trim(coalesce(p_new_stage, '')), '_', '-'));
  new_reason text := nullif(trim(coalesce(p_reason_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then raise exception 'Invalid procurement stage'; end if;
  if new_stage in ('lost','not-interested','withdrew') and nullif(trim(coalesce(p_reason_code, '')), '') is null then raise exception 'A reason is required'; end if;
  select * into r from public.procurement_leads where id = p_lead_id for update;
  if not found then raise exception 'Procurement lead not found'; end if;
  old_stage := r.stage;
  old_reason := r.stage_reason;
  if new_stage not in ('lost','not-interested','withdrew') then p_reason_code := null; new_reason := null; end if;
  update public.procurement_leads set stage = new_stage, stage_reason = p_reason_code, updated_at = now() where id = p_lead_id returning * into r;
  if old_stage is distinct from new_stage or old_reason is distinct from p_reason_code then
    insert into public.procurement_lead_stage_changes(lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by)
    values(p_lead_id, old_stage, new_stage, old_reason, p_reason_code, p_reason_code, new_reason, auth.uid());
  end if;
  return r;
end;
$$;

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
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 or array_position(p_lead_ids, null) is not null then raise exception 'At least one valid procurement lead is required'; end if;
  if cardinality(p_lead_ids) <> (select count(distinct id) from unnest(p_lead_ids) as id) then raise exception 'Duplicate procurement lead ids are not allowed'; end if;
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then raise exception 'Invalid procurement stage'; end if;
  if new_stage in ('lost','not-interested','withdrew') and nullif(trim(coalesce(p_reason_code, '')), '') is null then raise exception 'A reason is required'; end if;
  if p_reason_code = 'Other' and new_reason is null then raise exception 'Other requires a reason detail'; end if;
  if new_stage not in ('lost','not-interested','withdrew') then p_reason_code := null; new_reason := null; end if;
  select count(*) into found_count from public.procurement_leads where id = any(p_lead_ids);
  if found_count <> cardinality(p_lead_ids) then raise exception 'One or more procurement leads were not found'; end if;
  for lead_row in select * from public.procurement_leads where id = any(p_lead_ids) order by id for update loop
    if lead_row.stage is distinct from new_stage or lead_row.stage_reason is distinct from p_reason_code then
      update public.procurement_leads set stage = new_stage, stage_reason = p_reason_code, updated_at = now() where id = lead_row.id returning * into updated_row;
      insert into public.procurement_lead_stage_changes(lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by)
      values(lead_row.id, lead_row.stage, new_stage, lead_row.stage_reason, p_reason_code, p_reason_code, new_reason, auth.uid());
      return next updated_row;
    end if;
  end loop;
end;
$$;

revoke all on function public.update_procurement_lead_stage(uuid,text,text,text), public.create_lead_note(uuid,text), public.edit_lead_note(uuid,text), public.bulk_update_procurement_lead_stage(uuid[],text,text,text) from public, anon;
grant execute on function public.update_procurement_lead_stage(uuid,text,text,text), public.create_lead_note(uuid,text), public.edit_lead_note(uuid,text), public.bulk_update_procurement_lead_stage(uuid[],text,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
