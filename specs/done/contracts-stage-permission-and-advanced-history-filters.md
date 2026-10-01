# Contracts Stage Permission and Advanced History Filters

## Problem

Changing a contract to Interested fails with `permission denied for table procurement_leads (42501)`. The current `update_procurement_lead_stage` RPC is `security invoker`, so the authenticated browser role must have direct UPDATE permission and an UPDATE RLS policy on `procurement_leads`; the current database setup does not provide that. The fix must preserve staff-only access and keep the stage update/history insert atomic.

The current Changed stage and Changed from/to controls also appear in the primary filter row. They should be moved into an Advanced filters expand/collapse section between Category and Sort. Their date behavior must match the Applicable date control: All, Today, This week, This month, and Custom with From/To inputs.

## Objectives

1. Make authenticated staff stage changes succeed without exposing broader direct table writes.
2. Keep the current stage and status reason update plus audit row in one transaction.
3. Move historical filters into an Advanced section between Category and Sort.
4. Add a Changed date preset matching Applicable date semantics.
5. Preserve Reset filters behavior and distinguish current-stage filters from historical-change filters.

## Phase 1: Diagnose and fix Supabase permissions

Inspect the live policies/grants before writing SQL:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'procurement_leads';

select policyname, command, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'procurement_leads';
```

Use the project’s existing admitted-staff convention for authorization. Do not solve this by granting unrestricted UPDATE to `authenticated`.

Preferred RPC design:

- Change `update_procurement_lead_stage` to `security definer` with a fixed `search_path` such as `public, auth`.
- Validate `auth.uid()` and admitted-staff membership inside the function.
- Lock the requested lead row, capture actual old stage/reason, validate target stage and required Lost/Not interested reason, update only the intended columns, insert one `lead_status_changes` row when state changes, and return the updated lead.
- Revoke public/anonymous execution and grant execution only to the intended authenticated staff role.
- Add equivalent authorization to `create_lead_note` and `edit_lead_note`; they must not become an accidental bypass.
- If the project’s established policy requires invoker functions, instead add the narrowest UPDATE policy and column/table grants needed for admitted staff, and document why this is safe.

Create a new replay-safe migration after the existing normalized migration so the already-created function signature is replaced correctly. Include `notify pgrst, 'reload schema'`. Do not use a browser-supplied actor ID; continue using `auth.uid()`.

## Phase 2: Frontend historical filter model

Update `ContractFilters` to replace always-visible `changedDateFrom`/`changedDateTo` with a preset matching the applicable date control:

```ts
type ContractDateRangePreset = 'all' | 'today' | 'this-week' | 'this-month' | 'custom';

changedStage: 'All' | ContractStatus;
changedDateRangePreset: ContractDateRangePreset;
changedDateFrom?: string;
changedDateTo?: string;
```

Add helpers shared with or equivalent to `matchesContractDateRange` so Changed date filters use local calendar Today/This week/This month and custom inclusive dates. The historical query must filter `lead_status_changes.created_at`, while the existing Applicable date filter continues to use the contract’s bid-type-specific applicable date.

Update the Supabase loader/query wrapper to accept optional `to_status`, `dateFrom`, and `dateTo`; return distinct `lead_id` values. Keep the query batched and only run it when Changed stage or Changed date is not All. Handle invalid custom ranges as no results with the same validation message pattern as Applicable date.

## Phase 3: Filter layout

In `ContractFiltersBar`, keep Search as the full-width first row. In the primary controls row, show Category, Bid type, Applicable date, and then Sort. Place an Advanced filters toggle between Category and Sort, visually compact and clearly labeled with expanded/collapsed state.

When expanded, render:

- Changed stage select: All, New, Interested, Applied, Hold, Won, Lost, Not interested, Withdrew.
- Changed date select: All, Today, This week, This month, Custom.
- Custom Changed date From/To inputs only when Custom is selected.
- A concise info tooltip explaining that these filters search historical stage transitions, not the current stage.

Keep Advanced closed by default unless a historical filter is active, so active filtering remains discoverable. Reset filters must clear stage/date historical filters and return Advanced to its default closed state. The existing Applicable date controls and Sort placement must remain unchanged otherwise.

## Phase 4: UI persistence/error behavior

Keep the existing no-optimistic-success rule. On a failed stage RPC, leave the card/list unchanged and show the database error in the existing actionable error area. On success, refresh the lead and status history and invalidate the historical filter ID cache so a changed-stage search reflects the new transition.

## Testing

1. Run the SQL inspection queries as the authenticated staff user and verify the chosen permission path.
2. Execute a stage change to Interested, Lost with a reason, and another open stage; verify `procurement_leads` updates and `lead_status_changes` records the actual old/new values.
3. Verify anonymous and non-admitted users cannot call the RPC or update procurement data.
4. Verify Changed stage alone, Changed date presets, and custom Changed date ranges find historical transitions even when the current stage differs.
5. Verify current Status and historical Changed stage filters remain independent.
6. Verify Advanced expands between Category and Sort, auto-opens when active, and Reset clears all historical controls.
7. Run ESLint and the production build.

## Success criteria

- Staff can persist stage changes without `42501`.
- RPC authorization is narrow, server-side, atomic, and actor-safe.
- Advanced filters contain Changed stage and Changed date.
- Changed date supports All, Today, This week, This month, and Custom like Applicable date.
- Historical filtering uses `lead_status_changes.created_at` and `to_status`.
- Reset, errors, cache invalidation, lint, and build all work.
