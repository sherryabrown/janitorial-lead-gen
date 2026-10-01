begin;

alter table public.lead_notes enable row level security;
alter table public.lead_note_edits enable row level security;

drop policy if exists lead_notes_insert_own on public.lead_notes;
create policy lead_notes_insert_own
on public.lead_notes for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists lead_notes_update_own on public.lead_notes;
create policy lead_notes_update_own
on public.lead_notes for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists lead_note_edits_insert_own on public.lead_note_edits;
create policy lead_note_edits_insert_own
on public.lead_note_edits for insert to authenticated
with check (
  edited_by = auth.uid()
  and exists (
    select 1
    from public.lead_notes
    where lead_notes.id = lead_note_edits.note_id
      and lead_notes.created_by = auth.uid()
  )
);

notify pgrst, 'reload schema';
commit;
