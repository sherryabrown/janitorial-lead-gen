begin;

alter table public.procurement_leads add column if not exists stage_reason text;

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.procurement_leads(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz
);

create table if not exists public.lead_note_edits (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.lead_notes(id) on delete cascade,
  old_body text not null,
  new_body text not null check (length(trim(new_body)) > 0),
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now()
);

create table if not exists public.lead_status_changes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.procurement_leads(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('new','interested','applied','hold','won','lost','not-interested','withdrew')),
  from_reason text,
  to_reason text,
  reason_code text,
  reason_note text,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists lead_notes_lead_created_idx on public.lead_notes(lead_id, created_at desc);
create index if not exists lead_note_edits_note_edited_idx on public.lead_note_edits(note_id, edited_at desc);
create index if not exists lead_status_changes_lead_created_idx on public.lead_status_changes(lead_id, created_at desc);
create index if not exists lead_status_changes_status_created_idx on public.lead_status_changes(to_status, created_at desc);
create index if not exists lead_status_changes_actor_created_idx on public.lead_status_changes(changed_by, created_at desc);

insert into public.lead_notes(lead_id, body, created_by)
select id, trim(notes), auth.uid()
from public.procurement_leads
where auth.uid() is not null and nullif(trim(notes), '') is not null
  and not exists (select 1 from public.lead_notes n where n.lead_id = procurement_leads.id);

alter table public.lead_notes enable row level security;
alter table public.lead_note_edits enable row level security;
alter table public.lead_status_changes enable row level security;

drop policy if exists lead_notes_read on public.lead_notes;
create policy lead_notes_read on public.lead_notes for select to authenticated using (auth.uid() is not null);
drop policy if exists lead_note_edits_read on public.lead_note_edits;
create policy lead_note_edits_read on public.lead_note_edits for select to authenticated using (auth.uid() is not null);
drop policy if exists lead_status_changes_read on public.lead_status_changes;
create policy lead_status_changes_read on public.lead_status_changes for select to authenticated using (auth.uid() is not null);

create or replace function public.update_procurement_lead_stage(p_lead_id uuid, p_new_stage text, p_reason_code text default null, p_reason_note text default null)
returns public.procurement_leads language plpgsql security invoker set search_path = public as $$
declare r public.procurement_leads; old_stage text; old_reason text; new_stage text := lower(replace(trim(coalesce(p_new_stage, '')), '_', '-')); new_reason text := nullif(trim(coalesce(p_reason_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then raise exception 'Invalid procurement stage'; end if;
  if new_stage in ('lost','not-interested') and nullif(trim(coalesce(p_reason_code, '')), '') is null then raise exception 'A reason is required'; end if;
  select * into r from public.procurement_leads where id = p_lead_id for update;
  if not found then raise exception 'Procurement lead not found'; end if;
  old_stage := r.stage; old_reason := r.stage_reason;
  if new_stage not in ('lost','not-interested') then p_reason_code := null; new_reason := null; end if;
  update public.procurement_leads set stage = new_stage, stage_reason = p_reason_code, updated_at = now() where id = p_lead_id returning * into r;
  if old_stage is distinct from new_stage or old_reason is distinct from p_reason_code then
    insert into public.lead_status_changes(lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by)
    values(p_lead_id, old_stage, new_stage, old_reason, p_reason_code, p_reason_code, new_reason, auth.uid());
  end if;
  return r;
end; $$;

create or replace function public.create_lead_note(p_lead_id uuid, p_body text)
returns public.lead_notes language plpgsql security invoker set search_path = public as $$
declare r public.lead_notes;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Note cannot be blank'; end if;
  insert into public.lead_notes(lead_id, body, created_by) values(p_lead_id, trim(p_body), auth.uid()) returning * into r;
  return r;
end; $$;

create or replace function public.edit_lead_note(p_note_id uuid, p_new_body text)
returns public.lead_notes language plpgsql security invoker set search_path = public as $$
declare r public.lead_notes; old_body text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_new_body), '') is null then raise exception 'Note cannot be blank'; end if;
  select * into r from public.lead_notes where id = p_note_id for update;
  if not found then raise exception 'Note not found'; end if;
  old_body := r.body;
  if old_body is distinct from trim(p_new_body) then
    insert into public.lead_note_edits(note_id, old_body, new_body, edited_by) values(p_note_id, old_body, trim(p_new_body), auth.uid());
    update public.lead_notes set body = trim(p_new_body), updated_by = auth.uid(), updated_at = now() where id = p_note_id returning * into r;
  end if;
  return r;
end; $$;

revoke all on public.lead_notes, public.lead_note_edits, public.lead_status_changes from anon;
revoke all on function public.update_procurement_lead_stage(uuid,text,text,text), public.create_lead_note(uuid,text), public.edit_lead_note(uuid,text) from public, anon;
grant execute on function public.update_procurement_lead_stage(uuid,text,text,text), public.create_lead_note(uuid,text), public.edit_lead_note(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
