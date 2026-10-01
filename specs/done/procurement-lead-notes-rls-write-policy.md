# Procurement Lead Notes RLS Write Policy

## Problem

An authenticated user receives PostgreSQL error `42501` when adding a Contract note:

```text
new row violates row-level security policy for table "lead_notes"
```

The note client correctly calls `create_lead_note(p_lead_id, p_body)` after the prior parameter fix. The failure is in the database authorization layer: `20260910000200_procurement_lead_history.sql` enables RLS on `lead_notes`, `lead_note_edits`, and `lead_status_changes`, but creates only `SELECT` policies. `create_lead_note` and `edit_lead_note` are `security invoker` functions, so their inserts/updates must satisfy the caller's RLS policies.

## Objectives

- Allow signed-in staff to create notes through the existing RPC without weakening anonymous access.
- Allow a user to edit only notes they originally created, while retaining the append-only edit audit.
- Preserve read access for authenticated staff, the current RPC contracts, and the persistence-first UI behavior.
- Use a new forward-only migration; do not alter migrations that may already be applied.

## Technical approach

Keep the note RPCs as `security invoker` and add narrowly scoped RLS write policies. This makes authorization visible at the table boundary and keeps the existing `auth.uid()` values in the functions meaningful.

| Table | Operation | Policy rule |
| --- | --- | --- |
| `lead_notes` | Insert | authenticated caller may insert only when `created_by = auth.uid()` |
| `lead_notes` | Update | authenticated caller may update only a row where `created_by = auth.uid()`; the post-update row must still have that same owner |
| `lead_note_edits` | Insert | authenticated caller may append an audit row only when `edited_by = auth.uid()` and the related note belongs to them |

The existing `lead_notes_read`, `lead_note_edits_read`, and `lead_status_changes_read` policies remain unchanged. No browser client receives a service-role key, and no mock path is introduced.

## Implementation plan

### Phase 1: Add a forward-only RLS migration

1. Create a timestamped migration after `20260911000100_procurement_withdrew_stage_reason.sql`.
2. Enable RLS defensively with `alter table ... enable row level security` for the affected note tables.
3. Drop/recreate idempotent authenticated policies with clear names, for example:

```sql
create policy lead_notes_insert_own
on public.lead_notes for insert to authenticated
with check (created_by = auth.uid());

create policy lead_notes_update_own
on public.lead_notes for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
```

4. Add `lead_note_edits_insert_own` with a `WITH CHECK` condition that requires `edited_by = auth.uid()` and an `exists` subquery proving the referenced `lead_notes.created_by` is the same authenticated user.
5. Do not add direct delete policies. Notes and edits remain durable audit records.
6. Preserve the existing function execution grants and include `notify pgrst, 'reload schema';` before commit.

### Phase 2: Verify RPC behavior and error handling

1. Do not change the frontend call shape: `addProcurementLeadNote` must continue using `{ p_lead_id, p_body }`.
2. Verify `create_lead_note` inserts `created_by = auth.uid()`, satisfying the new insert policy.
3. Verify `edit_lead_note` can:
   - select and update a note created by the active user;
   - insert its corresponding `lead_note_edits` audit record;
   - reject an attempt to edit another user's note without exposing their write access.
4. Keep the UI behavior unchanged: a successful RPC reloads history before rendering the note; on failure, the draft text remains and the error is shown.
5. If testing shows the deployed database has a function owner or grants that differ from the checked-in migration, capture the actual policy/function definitions before changing strategy. The target is still least-privilege authenticated writes, not a broad public policy.

### Phase 3: Validate

1. Apply the migration to the intended Supabase project using the repository's normal migration workflow.
2. As a signed-in staff user, create a note and confirm:
   - no `42501` error occurs;
   - `lead_notes.created_by` is the current user;
   - the note appears once after the history reload.
3. Edit the newly created note and confirm its body updates and exactly one matching `lead_note_edits` row records old/new content and editor.
4. Using a different authenticated account, confirm read access remains available if intended by current policy, while modifying the first user's note is rejected.
5. Confirm anonymous users cannot invoke note writes and `npm.cmd run lint` plus `npm.cmd run build` still pass.

## Success criteria

- Authenticated staff can add Contract notes without RLS error `42501`.
- Staff can edit only their own notes; each edit remains auditable.
- Anonymous users retain no note-write access.
- Existing note retrieval, stage history, and client RPC parameter names remain unchanged.
