# Contracts Real Stage Workflow and Normalized Notes/History

## Problem and decisions

The Contracts page needs durable stage transitions, editable notes, and a truthful timeline. The earlier unified JSONB `procurement_lead_history` design is superseded by normalized tables:

- `procurement_leads.stage` and `procurement_leads.stage_reason` store the current stage.
- `lead_notes` stores one row per distinct note and its current body.
- `lead_note_edits` is append-only and records each note edit with old/new text.
- `lead_status_changes` is append-only and records each stage transition.
- The UI combines both audit streams into one chronological side-card timeline.

Confirmed requirements: stages are `new`, `interested`, `applied`, `hold`, `won`, `lost`, `not-interested`, and `withdrew`; any stage may transition to any other; Lost and Not interested require a persisted reason; existing quick actions remain; notes and stages persist in Supabase; historical-stage filtering is separate from current-stage filtering; migrations/RLS/RPCs are authorized.

## Important migration instruction

Do not run the existing `supabase/migrations/20260910000200_procurement_lead_history.sql` as written. It creates the superseded unified JSONB table and RPCs. Replace or supersede it before applying database changes. If it has already been applied, migrate useful rows first and remove the obsolete table/functions only in a separately reviewed step; never silently discard history.

## Phase 1: Database schema and SQL migration

Create a replay-safe Supabase migration.

### Current state

```sql
alter table public.procurement_leads
  add column if not exists stage_reason text;
```

Keep `procurement_leads.stage` as the current-state source of truth. Clear `stage_reason` when the stage is not `lost` or `not-interested`.

### Notes

```sql
create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.procurement_leads(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz
);

create table public.lead_note_edits (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.lead_notes(id) on delete cascade,
  old_body text not null,
  new_body text not null check (length(trim(new_body)) > 0),
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now()
);
```

Add indexes on `lead_notes (lead_id, created_at desc)` and `lead_note_edits (note_id, edited_at desc)`. Prefer soft deletion or no deletion while audit completeness matters.

### Stage transitions

```sql
create table public.lead_status_changes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.procurement_leads(id) on delete cascade,
  from_status text,
  to_status text not null,
  from_reason text,
  to_reason text,
  reason_code text,
  reason_note text,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (to_status in ('new','interested','applied','hold','won','lost','not-interested','withdrew'))
);
create index on public.lead_status_changes (lead_id, created_at desc);
create index on public.lead_status_changes (to_status, created_at desc);
create index on public.lead_status_changes (changed_by, created_at desc);
```

Use reason values such as `no-budget`, `bad-timing`, `another-vendor`, `too-small`, `too-large`, `labor-staffing-challenge`, `scope-not-a-fit`, and `other`. A separate `status_change_reasons` table is optional; use it only if reasons need centrally managed labels.

### RPC, identity, and RLS

Create authenticated atomic RPCs:

- `update_procurement_lead_stage(p_lead_id, p_new_stage, p_reason_code, p_reason_note)`: use `auth.uid()` internally, lock the lead, validate stage/reason, capture the actual old stage/reason, update `procurement_leads`, insert exactly one `lead_status_changes` row when state changes, and return the lead.
- `create_lead_note(p_lead_id, p_body)`: validate nonblank text, use `auth.uid()` for `created_by`, and return the inserted note.
- `edit_lead_note(p_note_id, p_new_body)`: lock the note, insert one old/new `lead_note_edits` row using `auth.uid()`, update the current note, and return it.

Never accept actor IDs from the browser. Enable RLS on all three tables. Anonymous users have no access; authenticated access follows the admitted-staff/procurement-lead policy. Grant only required RPC execution to `authenticated`; revoke public/anonymous execution. Include `notify pgrst, 'reload schema'`.

### Legacy data

If `procurement_leads.notes` contains one legacy note, backfill one `lead_notes` row per lead with a replay-safe `not exists` guard. Do not fabricate stage transitions. Define an explicit policy for imported records without a human actor before using `created_by not null`.

## Phase 2: Frontend data access

Update `src/lib/procurement.ts`:

1. Load `stage_reason`.
2. Replace unified-history types/queries with `LeadNoteRow`, `LeadNoteEditRow`, and `LeadStatusChangeRow`.
3. Add wrappers for create/edit note and stage-change RPCs.
4. Load notes, note edits, and status changes for the selected contract only; combine them client-side by timestamp.
5. Add a batched historical filter query/RPC returning lead IDs for `to_status`, changed date range, and optional actor.
6. Map `hold`, `on-hold`, and `paused` aliases.

## Phase 3: Contracts UI

Update `src/App.tsx` and `src/styles.css`:

1. Add `hold` and `stageReason` to the contract model.
2. Preserve quick actions and add a compact any-stage selector.
3. Offer Lost/Not interested reasons with an optional Other note.
4. Persist stages through the RPC; update local state only after success and report bulk partial failures.
5. Display current `lead_notes`, create notes through the RPC, and add editing through `edit_lead_note`.
6. Combine note creation, note edits, and status changes into the side-card timeline showing date/time, actor where available, old/new stage, reasons, and note text. Have check boxes under 'Show/Hide History' that are displayed when the history is displayed such that it defaults to only showing 'Notes' (not the edit history and not the stage chagne history); the other check boxes offered are 'Note edits' and 'Stage changes'.
7. Remove fake “Loaded from procurement_leads” history. Show history errors truthfully without disabling the card.

## Phase 4: Historical filters

Add a separate `Changed stage` filter with All, New, Interested, Applied, Hold, Won, Lost, Not interested, and Withdrew. Query `lead_status_changes.to_status`, not current stage. Support changed-date range at minimum and Changed by only when actor data is practical. Intersect historical IDs with current-stage, bid type, category, search, and applicable-date filters. Cache by filter signature and invalidate after stage changes. Reset must clear historical filters without changing unrelated defaults.

## Edge cases

- Concurrent changes lock the lead and record the true old state.
- Same-stage updates create no transition row.
- Leaving Lost/Not interested clears the current reason.
- Note edits append audit rows and never overwrite them.
- Failed writes do not appear successful in the UI.
- Legacy backfill is replay-safe and non-duplicating.
- Unauthorized users cannot read or mutate any normalized table.
- Unknown existing stages remain visible and editable through a safe fallback.

## Testing and SQL verification

Run lint and production build. In Supabase SQL Editor verify:

```sql
select to_regclass('public.lead_notes'),
       to_regclass('public.lead_note_edits'),
       to_regclass('public.lead_status_changes');

select proname from pg_proc
where proname in ('update_procurement_lead_stage','create_lead_note','edit_lead_note');
```

As an authenticated staff user, test every stage transition, required Lost/Not interested reasons, note creation/editing, timeline order, historical filters after a later stage change, and RLS denial for anonymous/direct unauthorized writes.

## Success criteria

- Current stage remains in `procurement_leads`.
- Notes have current-state rows plus append-only edit history.
- Stage transitions have a separate append-only table.
- RPCs use server-side authenticated identity and are atomic.
- The side card shows a truthful combined timeline.
- Historical filters are distinct from current-stage filters.
- SQL is safe to review/replay and does not silently discard data.
- Lint, build, SQL verification, and authenticated workflow tests pass.
