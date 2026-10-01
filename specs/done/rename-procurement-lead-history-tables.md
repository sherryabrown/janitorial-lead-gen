# Rename Procurement Lead History Tables

## Problem and objective

The production lead-history tables use generic names that do not identify their procurement domain:

- `lead_notes`
- `lead_note_edits`
- `lead_status_changes`

Rename them to `procurement_lead_notes`, `procurement_lead_note_edits`, and `procurement_lead_stage_changes` respectively. This change is strictly a `procurement_` table-name prefix for those three relations; preserve all existing history, foreign-key relationships, RLS behavior, indexes, RPC names/signatures, functions, and application behavior.

## Technical approach

Add a new forward-only Supabase migration; do not alter prior migrations that have already been applied to the remote database. PostgreSQL `ALTER TABLE ... RENAME TO` retains table data and object identity, so dependent foreign keys, indexes, RLS configuration, policy definitions, and SQL function dependencies continue to target the renamed relation. Update every direct Supabase client table reference in `src/lib/procurement.ts` to match the new names, then force PostgREST to refresh its schema cache.

### Scope lock

| Legacy table | New table |
| --- | --- |
| `lead_notes` | `procurement_lead_notes` |
| `lead_note_edits` | `procurement_lead_note_edits` |
| `lead_status_changes` | `procurement_lead_stage_changes` |

Do not rename `procurement_leads`, any columns, index identifiers, RLS policy identifiers, RPC function names/signatures, or unrelated tables. The existing note and stage RPCs keep their names; PostgreSQL carries their parsed table dependencies to the renamed relations.

## Implementation steps

1. Add `supabase/migrations/20260911000400_rename_procurement_lead_history_tables.sql`.
   - Wrap the rename sequence in a transaction.
   - Rename in dependency-safe order:
     ```sql
     alter table public.lead_notes rename to procurement_lead_notes;
     alter table public.lead_note_edits rename to procurement_lead_note_edits;
     alter table public.lead_status_changes rename to procurement_lead_stage_changes;
     ```
   - Use explicit existence checks/conditional handling appropriate for this repository's migration convention, so the migration targets the known deployed schema without silently creating replacement tables.
   - Reload the PostgREST schema cache with `notify pgrst, 'reload schema';` after the rename, then commit.

2. Update direct frontend database references in `src/lib/procurement.ts`.
   - In `loadProcurementLeadHistory`, change the notes query to `procurement_lead_notes`, edits query to `procurement_lead_note_edits`, and stage-history query to `procurement_lead_stage_changes`.
   - In `findLeadIdsByActivityDate`, query all three renamed tables, including the note lookup used to resolve edited note IDs.
   - Keep selected columns, ordering, mapping, and error propagation exactly as they are.

3. Verify stored database behavior after applying the migration.
   - Confirm the existing note create/edit RPCs and both individual/bulk stage-update RPCs continue to insert history rows in the renamed tables. Their names and signatures must not change; PostgreSQL retains their table dependencies across a table rename.
   - Confirm the authenticated role can load notes, note edits, and stage history under the retained RLS policies.
   - Confirm all existing history is present under the new table names and no old-named tables remain.

4. Apply and validate.
   - Run `npx.cmd supabase db push` against the linked project, allowing the migration to execute only once.
   - Run `npx.cmd supabase migration list` to confirm local and remote histories align.
   - Run `npm.cmd run lint` and `npm.cmd run build` after the TypeScript change.

## Edge cases and safeguards

- A table rename preserves rows and object identity; do not copy data, drop/recreate the tables, reset RLS, or rename unrelated policy/index/RPC identifiers.
- The migration must be forward-only. Editing earlier applied migrations would leave already-deployed databases unchanged and would create misleading local schema history.
- The PostgREST cache reload is required so the frontend's newly named table endpoints are immediately discoverable.
- If deployment reports that an expected legacy table is missing, stop before applying any substitute schema and investigate the deployed schema/migration history.

## Testing strategy

1. Apply the migration and verify all three renamed tables, their row counts, indexes, policies, and foreign keys in Supabase.
2. In the app as an authenticated user, load a contract history, add a note, edit an owned note, make a stage change, and bulk-update selected stages.
3. Verify new note/edit/stage-history records appear in the renamed tables and are rendered correctly.
4. Run lint and production build.

## Success criteria

- The only renamed database identifiers are `procurement_lead_notes`, `procurement_lead_note_edits`, and `procurement_lead_stage_changes`; no unrelated table, column, index, policy, or RPC identifier changes.
- Existing lead history remains intact and its relationships, indexes, functions, and RLS access continue to work.
- Note and stage-history operations succeed through the frontend after the PostgREST schema cache reload.
- Supabase migration history and frontend lint/build validation pass.
