# Repair Procurement History RPCs After the Table Rename

## Problem and root cause

Adding a note now fails with:

`type "public.lead_notes" does not exist (42704)`

The three history tables were successfully renamed, but several stored PL/pgSQL function bodies still contain legacy table/type references. PostgreSQL preserves object dependencies during a table rename, but PL/pgSQL source is compiled when invoked; its declarations and SQL must use the renamed table/type identifiers.

## Scope

Repair only function bodies that reference the renamed history tables. Keep all existing RPC function names, parameter names/signatures, permissions, stage validations, reason requirements, and frontend `rpc(...)` calls unchanged.

| Function | Required table reference updates |
| --- | --- |
| `create_lead_note` | return type, declared row type, and insert target → `procurement_lead_notes` |
| `edit_lead_note` | return type, declared row type, select/update target → `procurement_lead_notes`; edit insert target → `procurement_lead_note_edits` |
| `update_procurement_lead_stage` | stage-history insert target → `procurement_lead_stage_changes` |
| `bulk_update_procurement_lead_stage` | stage-history insert target → `procurement_lead_stage_changes` |

## Technical approach

Add one forward-only migration that uses `CREATE OR REPLACE FUNCTION` to restate the current production function definitions with only their history-table identifiers changed. This recompiles the functions against the renamed tables without creating replacement tables or changing the public API. Reassert current execute grants and reload the PostgREST schema cache.

## Implementation steps

1. Create `supabase/migrations/20260911000500_fix_procurement_history_rpc_table_references.sql`.
   - Wrap it in a transaction.
   - Recreate `create_lead_note(uuid, text)` using `returns public.procurement_lead_notes`, `declare r public.procurement_lead_notes`, and inserts into `public.procurement_lead_notes`.
   - Recreate `edit_lead_note(uuid, text)` using the new return/declared type, selects/updates on `public.procurement_lead_notes`, and edit audit inserts into `public.procurement_lead_note_edits`.
   - Recreate `update_procurement_lead_stage` from the latest deployed definition, retaining Withdrew reason behavior/security settings and changing only its history insert to `public.procurement_lead_stage_changes`.
   - Recreate `bulk_update_procurement_lead_stage` from the latest deployed definition, retaining its validation/security settings and changing only its history insert to `public.procurement_lead_stage_changes`.
   - Revoke/grant execute exactly as currently configured, issue `notify pgrst, 'reload schema';`, and commit.

2. Do not change frontend RPC call names or parameters in `src/lib/procurement.ts`.
   - The client already uses the correct function names and parameter keys.
   - The prior table-query rename remains intact; no mock data or direct-table write fallback is introduced.

3. Apply and verify.
   - Deploy with `npx.cmd supabase db push` and verify aligned histories with `npx.cmd supabase migration list`.
   - As an authenticated user, add a note and edit an owned note; confirm records appear in `procurement_lead_notes` and `procurement_lead_note_edits`.
   - Change an individual stage and bulk-update stages; confirm records appear in `procurement_lead_stage_changes`.
   - Run `npm.cmd run lint` and `npm.cmd run build`.

## Safeguards

- Do not rename or drop any tables, columns, policies, indexes, or RPC identifiers.
- Do not use `DROP FUNCTION ... CASCADE`; function replacement preserves the public RPC endpoint and avoids unintended dependency removal.
- Copy the latest stage RPC behavior, not the original historical migration, so Withdrew and bulk reason rules remain intact.
- If function replacement reports a return-type incompatibility, stop and inspect the deployed function signature before changing it.

## Success criteria

- Add/edit note RPCs no longer reference `public.lead_notes` and succeed for an authenticated user.
- Individual and bulk stage RPCs write to `procurement_lead_stage_changes` without changing their API.
- Existing RLS/policy behavior, history data, and frontend query names remain unchanged.
- Remote migration history, lint, and production build pass.
