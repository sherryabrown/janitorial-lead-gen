# Contracts Mock Data Removal and Action Layout

## Problem statement

The Contracts page still contains a large `mockContracts` dataset and retained mock bid-source data even though production contracts now load from Supabase. The main contract card also displays Added/Updated metadata that the user no longer wants, and its action controls are stacked vertically in the right-side action area. The contract actions should occupy a shared horizontal row, wrapping only when the available card width requires it.

## Objectives

1. Remove all mock contract records from the Contracts page source.
2. Remove obsolete mock contract-support data if it is only retained for the old mock contract flow; do not remove mock company data.
3. Keep Contracts populated only by the authenticated Supabase `procurement_leads` load and any explicitly supported generated-contract flow.
4. Remove Added and Updated metadata from the main Contract card only. Do not remove company-card timestamps or database fields needed elsewhere.
5. Put the available Contract action buttons in one horizontal action row, with responsive wrapping for narrow layouts.
6. Preserve selection/disabled behavior, confirmation behavior, closed-state rendering, and action ordering.

## Current implementation findings

- `src/App.tsx` defines `mockContracts` with eight mock contract records around the top-level data declarations.
- `mockContracts` is not used as initial state; it is retained only through `void mockContracts`.
- `bidSources` is also retained as top-level mock source data and referenced only by `void bidSources` after the production source loading path replaced it.
- Contract state initializes as an empty array and is populated in the Supabase load effect, so deleting the unused mock contract array will not remove the production data path.
- Company state intentionally initializes from `mockCompanies`; company mock data must remain unchanged.
- `ContractList` renders a `.lead-touch` block containing Added and Updated below `ContractActions`.
- `ContractActions` renders action buttons inside `.lead-card-actions`, currently a CSS grid with one full-width button per row.
- The Contract card uses the `no-utility` row layout, so the action group occupies the right-side column. The action group can be changed to a horizontal flex layout without changing the overall card grid.
- Responsive CSS already places `.lead-card-actions` across the full row on narrow screens; the new layout should retain that behavior.

## Technical approach

### Phase 1: Remove mock contract data

1. Delete the `mockContracts` array and its `void mockContracts` retention statement.
2. Delete `bidSources` and its `void bidSources` retention statement if inspection confirms it has no active consumer. Keep the `BidSource` type if production source state or other source UI still requires it.
3. Do not change `mockCompanies`, company initial state, or company-only mock workflows.
4. Confirm `contracts` remains initialized to `[]` and that only `loadProcurementContracts(supabase)` populates the initial Contracts list.
5. Preserve generated contract insertion code if it remains part of the current Generate tab; this request removes static mock contract data, not explicitly requested integrations or future-phase Generate behavior.
6. Remove any now-unused imports, types, helper references, or source variables created by deleting the mock data. Let lint identify dead declarations.

### Phase 2: Remove contract-card Added/Updated display

1. Delete the ContractList `.lead-touch` block that renders Added and Updated.
2. Keep `addedAt`, `updatedAt`, and related database mapping in the data model if they are used for history, sorting, diagnostics, or future UI. This task is presentation-only and should not remove database columns from the Supabase query.
3. Do not remove the CompanyList `.lead-touch` block.
4. Remove contract-only CSS if it becomes unused, but preserve shared `.lead-touch` styles required by company cards unless they are safely split into separate selectors.

### Phase 3: Align Contract action buttons

1. Change `.lead-card-actions` from a single-column grid to a flex row with `flex-wrap: wrap`, a consistent gap, and an appropriate horizontal alignment.
2. Change `.lead-card-actions > button` from `width: 100%` to a content-sized or flex-sized button rule so the available actions share one row.
3. Preserve the existing action order:
   - New: Interested, Applied, Not interested
   - Interested: Applied, Withdrew, Not interested
   - Applied: Won, Withdrew, Lost
   - Closed: Closed label
4. Keep all buttons disabled when the card is not selected and keep click propagation stopped by the existing wrapper.
5. At narrow breakpoints, allow buttons to wrap cleanly across the available width rather than forcing overflow. The action group may remain full-width on mobile.
6. Verify that the action group does not collide with the title/content column or the right edge of the card at the existing desktop and tablet widths.

## Files likely to change

- `src/App.tsx`
  - remove unused mock contract/source declarations
  - remove ContractList Added/Updated markup
  - retain production Supabase loading and company mock data
- `src/styles.css`
  - change `.lead-card-actions` to a horizontal wrapping layout
  - change child button sizing
  - adjust responsive action layout if needed
- `src/lib/procurement.ts`
  - only if lint/type cleanup shows the contract timestamp fields are no longer needed by the active model; prefer leaving data mapping intact

## Edge cases

- Supabase unavailable or access denied: the Contracts page should remain empty/error-state driven, not fall back to mock contracts.
- No action buttons may be available for a closed contract; retain the Closed state label.
- A selected card and an unselected card must use the same layout; only enabled/disabled state changes.
- On narrow screens, buttons may wrap to a second visual line, but each button must remain fully visible and usable.
- Generated contracts must not be mistaken for static mock contracts; preserve them only where the current Generate flow intentionally inserts them.

## Testing strategy

1. Run lint and production build.
2. Verify no static contract records appear when Supabase returns an empty result.
3. Verify signed-in production contract loading remains unchanged.
4. Verify company mock records still appear in Companies mode.
5. Verify Contract cards no longer show Added or Updated.
6. Verify New, Interested, and Applied action sets render horizontally on desktop/tablet widths.
7. Verify buttons wrap without overflow at narrow widths.
8. Verify closed contracts still show Closed and no action buttons.
9. Verify selection, disabled states, confirmations, and action ordering remain unchanged.

## Success criteria

- No static mock contract records remain in the Contracts page source or runtime fallback.
- Contract cards do not display Added or Updated metadata.
- Contract action buttons share a horizontal row where space permits and wrap responsively when necessary.
- Company mock data and company-card timestamps remain intact.
- Production Supabase loading, filtering, and actions continue to compile and function.
- Lint and production build pass.
