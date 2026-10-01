begin;

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
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then
    raise exception 'Invalid procurement stage';
  end if;
  if new_stage in ('lost','not-interested') and nullif(trim(coalesce(p_reason_code, '')), '') is null then
    raise exception 'A reason is required';
  end if;
  select * into r from public.procurement_leads where id = p_lead_id for update;
  if not found then raise exception 'Procurement lead not found'; end if;
  old_stage := r.stage;
  old_reason := r.stage_reason;
  if new_stage not in ('lost','not-interested') then p_reason_code := null; new_reason := null; end if;
  update public.procurement_leads
    set stage = new_stage, stage_reason = p_reason_code, updated_at = now()
    where id = p_lead_id
    returning * into r;
  if old_stage is distinct from new_stage or old_reason is distinct from p_reason_code then
    insert into public.lead_status_changes(
      lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by
    ) values (
      p_lead_id, old_stage, new_stage, old_reason, p_reason_code, p_reason_code, new_reason, auth.uid()
    );
  end if;
  return r;
end;
$$;

revoke all on function public.update_procurement_lead_stage(uuid,text,text,text) from public, anon;
grant execute on function public.update_procurement_lead_stage(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
