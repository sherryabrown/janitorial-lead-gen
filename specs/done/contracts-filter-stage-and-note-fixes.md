# Contracts Filter, Stage, and Note Fixes

## Problem statement

Four regressions in the production-backed Contracts queue need correction:

1. The filter bar uses one wrapping flex row for primary controls, the advanced panel, Sort, and Reset. With Advanced collapsed, the Category disclosure makes the primary controls look vertically inconsistent. With it expanded, `.advanced-filter-panel` takes a full flex row before the later Sort and Reset elements, so those elements drop below the advanced controls.
2. New notes fail because `addProcurementLeadNote` calls `create_lead_note` with `p_note_text`, while the deployed and checked-in RPC signature is `create_lead_note(p_lead_id uuid, p_body text)`.
3. Withdrew is a terminal stage but cannot collect or retain a stage reason: the UI calls it directly and the stage RPC clears reasons for every stage except Lost and Not interested.
4. The Changed stage filter exposes database stage values such as `not-interested`, rather than the human-readable stage names used elsewhere in the Contracts stage UI.

The result should retain the existing concise Contracts workflow: a single stable primary filter row, Advanced controls in a distinct secondary row, reason selection before terminal-stage persistence, and readable stage labels throughout.

## Existing implementation to preserve

- `src/App.tsx` owns `ContractFiltersBar`, `ContractActions`, client-side filter state, and history rendering.
- `src/lib/procurement.ts` is the Supabase boundary. It already maps production procurement records and history rows.
- `supabase/migrations/20260910000200_procurement_lead_history.sql` creates the notes/status-history tables and RPCs; `20260910000300_procurement_stage_rpc_permissions.sql` replaces only the stage RPC for authenticated execution.
- `statusLabels` already supplies the desired display labels (`New`, `Interested`, `Not interested`, `Applied`, `Hold`, `Won`, `Lost`, `Withdrew`).
- Existing note/history behavior remains persistence-first: update local UI only after the RPC and history reload succeed. Keep that behavior.

## Technical approach

Use explicit layout regions rather than relying on flex wrapping order:

```text
Search

Primary controls row
Category | Bid type | Applicable date | Sort | Reset filters
Advanced filters disclosure (under Category; does not alter primary baseline)

Advanced controls row, only while expanded
Changed stage | Changed date | optional changed-date From/To

Applicable-date custom From/To row, only while selected
```

The primary row must contain only the five primary columns. The disclosure and every conditional panel must be siblings after that row, never elements inserted before Sort/Reset inside it. Use a grid for the desktop primary row with the final Reset action aligned to the select baseline by a label-height spacer (or equivalent grid alignment), not `align-self: end` relative to an unrelated, taller flex child.

For reason persistence, define one shared terminal-stage reason configuration and use it for Lost, Not interested, and Withdrew. Preserve the existing reason vocabulary unless product requirements change it: No budget, Bad timing, Another vendor, Too small, Too large, Labor/staffing challenge, Scope not a fit, and Other. `Other` requires a nonblank detail so the saved history is meaningful. The stage RPC remains the atomic source of truth for stage, current reason, and status-change history.

## Implementation plan

### Phase 1: Rebuild the Contracts filter layout

1. In `ContractFiltersBar` in `src/App.tsx`, extract the following structural regions:
   - the existing search field;
   - `.contract-primary-filter-row` containing Category, Bid type, Applicable date, Sort, and a Reset wrapper;
   - the `Advanced filters` disclosure immediately after the primary row, visually aligned under the Category column;
   - an `#contract-advanced-filters` panel after the disclosure when open;
   - a dedicated custom Applicable-date range region and a dedicated custom Changed-date range region.
2. Do not render `advanced-filter-panel` inside the primary row. This specifically prevents an expanded panel from taking a flex line before Sort and Reset.
3. Keep Advanced collapsed by default. Continue showing the active indication and automatically reveal it when a changed-stage or changed-date filter is active. Reset must clear all values and collapse it through the existing reset state flow.
4. Keep real button semantics, `aria-expanded`, and `aria-controls`; retain keyboard activation and visible focus styling.
5. Update the filter CSS in `src/styles.css`:
   - replace `.filter-controls-row`'s layout for Contracts with a desktop grid whose five primary columns share one label/select baseline;
   - give Reset an explicit top label spacer or grid placement so its button aligns with the select controls rather than their labels;
   - make disclosure placement occupy the Category column without contributing height to the primary row;
   - make `.advanced-filter-panel` a quiet grid/row below the primary controls, with the same 38px controls and no overlap;
   - retain the responsive breakpoint behavior, but stack regions in document order at narrow widths with no overflow.
6. Check both supplied screenshots at the same viewport scale: collapsed and expanded must retain Category, Bid type, Applicable date, Sort, and Reset in the same row.

### Phase 2: Correct and harden note creation RPC usage

1. In `src/lib/procurement.ts`, change the `create_lead_note` RPC payload key from `p_note_text` to `p_body`; keep `p_lead_id` and the existing error propagation.
2. Correct the helper return type to the RPC's actual `lead_notes` row shape (`LeadNoteRow`), rather than `ProcurementHistoryRow`, if TypeScript uses the value.
3. Leave `saveContractNote` persistence-first: save the note, reload lead history, then update `contracts`. Keep the entered note in the editor if the RPC fails and surface the existing concise error.
4. Add an implementation-time regression check that spies/mocks the Supabase RPC call and asserts the exact function name and parameter object:

```ts
rpc('create_lead_note', { p_lead_id: leadId, p_body: text })
```

No new integration or mock-data path is required; this is a fix to the already requested Supabase notes integration.

### Phase 3: Add reasons to Withdrew transitions

1. Add a new forward-only migration (do not edit an already-applied migration) that replaces `public.update_procurement_lead_stage` with the same signature and permissions.
2. In the function:
   - require a nonblank `p_reason_code` for `lost`, `not-interested`, and `withdrew`;
   - retain the selected `p_reason_code` as `procurement_leads.stage_reason` for all three terminal reason stages;
   - preserve `p_reason_note` for history, especially the Other detail;
   - clear both reason fields only when the destination stage is not one of those three;
   - keep locking, authentication, allowed-stage validation, audit insertion, grants, and `notify pgrst, 'reload schema'` behavior.
3. Refactor `ContractActions` so Withdrew opens the same reason selector instead of immediately calling `onAction('withdrew')`. Make the selector track the requested terminal action, reset stale selection/detail when it closes or changes action, and disable its confirm action until valid.
4. Extend `updateProcurementLeadStage` to accept both reason code and optional reason detail, and pass both RPC parameters. Thread that typed reason payload through `applyContractAction` and `ContractList` rather than relying on a loose optional string.
5. After a successful stage update, update the selected card's current status/reason and reload that lead's history so the new stage/reason transition is immediately available under Stage changes. On failure, preserve the current card/status, selected context, and reason form values and display the existing actionable error.
6. Ensure bulk action behavior follows the same validation path. If a bulk terminal-stage action remains available, one chosen reason is intentionally applied to all selected leads and the UI should state that before confirmation.

### Phase 4: Use display labels in Changed stage

1. Create/reuse a single ordered Contract stage-option list with a stored canonical value and a display label from `statusLabels`:

```ts
const contractStageOptions = contractStageOrder.map((value) => ({
  value,
  label: statusLabels[value],
}));
```

2. Extend `FilterSelect` to optionally receive `{ value, label }` options (or add a narrowly scoped stage-filter select) while preserving the existing string options for Category and Bid type.
3. Render Changed stage using the canonical values needed by `findLeadIdsByStatusChange`, while presenting `New`, `Interested`, `Applied`, `Hold`, `Won`, `Lost`, `Not interested`, and `Withdrew`. Its default remains `All`.
4. Do not change filtering semantics or store display strings in filter state; only the presentation changes.

### Phase 5: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Manually verify desktop and narrow layouts:
   - collapsed: the five primary controls have aligned labels and controls, with Reset aligned to the control baseline;
   - expanded: Sort and Reset remain in the primary row while Changed stage/date appear only below it;
   - custom date ranges appear below their respective owning region and do not displace primary controls.
3. With an authenticated Supabase user, add a note and confirm the RPC is invoked with `p_body`, the note appears once after reload, and errors retain unsaved text.
4. For each of Lost, Not interested, and Withdrew, attempt Save with no reason (blocked), save a listed reason, and save Other with blank/nonblank detail. Verify `stage_reason` and `lead_status_changes.to_reason` persist and the Stage changes history shows the display label plus reason.
5. Verify moving a lead to a non-terminal-reason stage clears its current reason and records the transition.
6. Verify Changed stage shows friendly labels yet still returns matching history records for every canonical stage value.

## Success criteria

- Applicable date, Sort, and Reset stay aligned with Category and Bid type when Advanced is collapsed and expanded.
- Advanced filters never move Sort or Reset below the advanced controls.
- Adding a production note calls the deployed RPC with `p_body` and succeeds when permissions/schema are otherwise healthy.
- Withdrew requires and persists a reason, just like Lost and Not interested; history captures it.
- Changed stage uses the same readable stage labels as the Contracts stage menu while preserving canonical query values.
- Existing filtering, reset behavior, accessibility, current selected context, and concise visual hierarchy remain intact.
