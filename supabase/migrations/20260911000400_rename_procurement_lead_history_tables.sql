begin;

do $$
begin
  if to_regclass('public.lead_notes') is null
    or to_regclass('public.lead_note_edits') is null
    or to_regclass('public.lead_status_changes') is null then
    raise exception 'Expected legacy procurement lead-history tables are missing';
  end if;

  if to_regclass('public.procurement_lead_notes') is not null
    or to_regclass('public.procurement_lead_note_edits') is not null
    or to_regclass('public.procurement_lead_stage_changes') is not null then
    raise exception 'A target procurement lead-history table already exists';
  end if;
end;
$$;

alter table public.lead_notes rename to procurement_lead_notes;
alter table public.lead_note_edits rename to procurement_lead_note_edits;
alter table public.lead_status_changes rename to procurement_lead_stage_changes;

notify pgrst, 'reload schema';

commit;
