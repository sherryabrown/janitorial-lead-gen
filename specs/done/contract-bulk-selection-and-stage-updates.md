# Contract Bulk Selection and Stage Updates

## Problem

The Contracts list has a selection mechanism, but its placement and behavior do not match the intended bulk workflow:

- The visible-result header places the selection button away from the result count and labels it `Select visible` / `Clear visible`.
- The bulk bar can only mark all selected records Interested.
- A broad stage change needs the same persistence rules as individual card actions: stage-history rows, current stage reason, required terminal reasons, and clear post-save context.

## Objectives

- Place `Select all` / `Unselect all` immediately beside the visible result count.
- Scope Select all to the currently filtered visible Contracts, preserving selections outside the current view unless the user explicitly unselects all visible records.
- When one or more Contracts are selected, expose all valid target stages except an already-shared current stage.
- Require and persist a shared reason for bulk Lost, Not interested, and Withdrew changes, including required Other detail.
- Write each changed record's stage/current reason/history atomically, with no partial bulk success.
- Preserve single-card action behavior, queue filtering, selected-card context, and Company bulk behavior.

## Current implementation

- `AppShell` derives `visibleCheckedContractIds` and `allVisibleContractsSelected` from `visibleContracts` and `checkedContractIds`.
- The Contracts `.list-header` currently shows the count on the left and a `Select visible` / `Clear visible` button on the right.
- `BulkActionBar` is generic but currently receives only an Interested primary action for Contracts.
- `applyContractAction` calls `update_procurement_lead_stage` per ID, reloads each history stream, then updates local contract state. It already passes reason data for the individual flow.
- `update_procurement_lead_stage` is the authoritative RPC for stage/current-reason updates and `lead_status_changes` audit rows. It locks one lead at a time and is not a bulk transaction.
- Terminal reason options and Other-detail validation already exist in `ContractActions`.

## Technical approach

Create a Contract-specific bulk stage control and a database RPC that performs the chosen stage transition in one transaction. The RPC accepts the selected IDs, target stage, reason code, and optional reason note; it locks affected rows, skips records already at the requested target, validates reason requirements, updates current state, and inserts one status-history row per actual transition.

For mixed-stage selections, the UI shows all stage targets. When the target matches some selected records' current stage, those records are explicitly excluded from the change; the confirmation/submit copy states how many will change. When every selected record already has the target stage, that stage is omitted/disabled. This avoids no-op history while still allowing a useful target choice for mixed selections.

## Implementation plan

### Phase 1: Selection header and state semantics

1. In the Contract `.list-header` in `src/App.tsx`, group the `N results` heading and the select control in one left-aligned inline region. Keep the existing eyebrow above the count.
2. Rename the action exactly based on visible selection state:
   - no/all-less-than-visible selections: `Select all`;
   - all currently visible Contracts selected: `Unselect all`.
3. Keep Select all scoped to `visibleContracts`, not the entire database. Selecting adds only visible IDs to the existing set; Unselect all removes only visible IDs and retains any checked IDs outside the filtered result set.
4. Keep selection clearing on queue/view changes as currently implemented unless it conflicts with the visible-scope rule. Do not alter Company header selection in this task.
5. Add clear accessible names/state: `Select all {N} visible contracts`, `Unselect all {N} visible contracts`, and disabled behavior when there are zero visible results.

### Phase 2: Bulk stage menu and reason flow

1. Replace the Contracts use of the generic one-primary-action `BulkActionBar` with a `ContractBulkStageBar` (or extend the shared component without complicating Company behavior).
2. Show a compact `Change stage` select/button only when at least one visible Contract is selected. Its options use existing readable `statusLabels`, while its submitted values remain canonical stage codes.
3. Derive target availability from selected contract records:
   - omit/disable a target only when every selected record already has that stage;
   - for a mixed selection, show the target and state the count that will change;
   - do not expose raw codes such as `not-interested`.
4. When the selected target is Lost, Not interested, or Withdrew, reveal the shared reason selector using the existing reason vocabulary. Require a reason before enabling submit; require a nonblank detail for Other.
5. Before the durable write, show concise confirmation copy identifying the target stage, the number of records that will actually change, and—when applicable—the shared reason. The only action emphasis is the final stage-change submit; Clear selection stays secondary.
6. Preserve the current card-level action menus. Factor shared stage-option/reason validation data out of `ContractActions` only where it prevents duplicated, diverging validation.

### Phase 3: Atomic database bulk update

1. Add a forward-only Supabase migration defining `public.bulk_update_procurement_lead_stage` with parameters such as:

```sql
p_lead_ids uuid[],
p_new_stage text,
p_reason_code text default null,
p_reason_note text default null
```

2. Implement it as `security definer` with the same controlled `search_path`, authentication check, allowed-stage normalization, and authenticated execute grant pattern as `update_procurement_lead_stage`.
3. Validate that the ID array is nonempty and contains no nulls. Lock matching `procurement_leads` rows with `FOR UPDATE`; reject missing IDs rather than silently updating a partial selection.
4. Apply the same terminal-reason policy as the individual RPC: Lost, Not interested, and Withdrew require `p_reason_code`; Other requires a reason note in the UI and should be defensively validated in SQL if reason codes are centrally validated. Clear reason/current note fields when the destination is a non-reason stage.
5. For each locked lead whose stage/reason actually changes, update `procurement_leads` and insert exactly one `lead_status_changes` row with old/new stage and old/new reason. Do not create history for records already at the requested target with the same reason.
6. Return the changed `procurement_leads` rows (and optionally counts) in a stable shape. Revoke public/anon execution, grant only `authenticated`, and reload the PostgREST schema.
7. Add `bulkUpdateProcurementLeadStage` in `src/lib/procurement.ts`; keep individual `updateProcurementLeadStage` unchanged for card actions.

### Phase 4: Client reconciliation and errors

1. Replace the bulk path in `AppShell` with the new bulk helper. Disable the stage submit while saving to prevent duplicate requests.
2. On success, refresh histories for changed leads, merge returned rows into `contracts`, retain selected-card context when that contract remains visible, clear the visible selection, and allow normal queue filters to determine the next result state.
3. On RPC failure, leave all local Contract states and selection intact, retain selected target/reason inputs, and show a concise actionable error. Because the database procedure is atomic, the UI must never present partial success.
4. If the selected records move out of the current queue/filter after success, communicate the new visible result count without sending the user to another queue automatically.

### Phase 5: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Verify header placement and behavior with zero, some, and all visible records selected; verify filtering does not accidentally select hidden records.
3. Test same-stage and mixed-stage selections. Confirm no-op records receive no stage-history row and the UI accurately states the changed count.
4. Test every target stage, particularly Lost, Not interested, and Withdrew with listed reasons and Other blank/nonblank detail.
5. Inspect `procurement_leads.stage`, `stage_reason`, and `lead_status_changes` after a bulk change. Every changed lead must have one correct audit row; unchanged leads must have none.
6. Induce an invalid/missing lead or server error and confirm the bulk transaction rolls back and the UI preserves selection/form values.
7. Confirm individual card stage actions and Company bulk actions continue working as before.

## Success criteria

- Select all/unselect all is beside the result count and applies only to visible Contracts.
- A selected group can move to any meaningful target stage with readable labels.
- Required terminal reasons are captured once and persist for every changed record.
- Bulk changes are atomic and create accurate per-lead stage history.
- No-op records do not receive misleading history entries.
- Existing individual Contract actions and Company workflows remain intact.
