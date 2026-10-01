# Contracts Applicable-Date Filter Clarity

## Problem statement

The Contracts filter currently labels the date control simply `Date`, even though it filters by the system-selected applicable date. The user needs the terminology and behavior to be explicit. The current layout also gives the Date control a different width from the other dropdowns and places Reset filters awkwardly at the end of a wrapping flex row.

## Decisions and recommendations

### Terminology

Yes: the current Date filter is intended to use the applicable date. It should be labeled `Applicable date`, or `Date (applicable)` if the shorter label is needed.

“Most relevant” is primarily focused on actionable deadline/end dates, but it is not limited to them. The system should use the first available date according to bid type:

- Forecast: publication date, then contract start; advertisement-period text is display-only.
- Opportunity: response deadline, then current end, potential end, publication, and start.
- Award: current end, then potential end, publication, and start.
- Unknown: publication, response deadline, current end, potential end, and start.

The helper copy should say this plainly: “Uses the most relevant available date—usually a deadline or contract end; otherwise publication or start date.”

### Layout

Use a consistent width token for Category, Bid type, Applicable date, Sort, and custom date inputs. Search may remain wider because it is the primary text field. Put Reset filters in its own right-aligned action region with intentional spacing, not as an incidental item after Sort.

## Objectives

1. Rename the Date control to clearly communicate Applicable date.
2. Explain the applicable-date priority in a concise info tooltip beside the label.
3. Make Date and the other dropdowns the same width and height.
4. Give Reset filters a deliberate, visually separate location.
5. Preserve all filtering, sorting, custom-range validation, and reset behavior.

## Current implementation findings

- `ContractFiltersBar` currently renders a label of `Date` with an info tooltip, but the tooltip copy only says it uses the most relevant date for the selected bid type.
- `getApplicableContractDate` already implements the bid-type priority logic. The user-facing copy should reflect that it prioritizes deadlines/end dates where available and falls back to publication/start dates.
- `.filter-controls-row` is a wrapping flex container. `.date-range-control` and `.sort-control` have a minimum width, while `.select-field select` and `.sort-control select` have different sizing rules; this causes the Date control to look different.
- `.filter-actions` currently uses `margin-left: auto`, which can create an isolated/odd position after wrapping.
- Reset is already wired to the default filter state; only its placement and consistency need refinement.

## Technical approach

### Phase 1: Applicable-date language

1. Rename the visible Date label to `Applicable date` while retaining the internal `dateRangePreset` state name unless a broader rename is useful.
2. Update the tooltip copy to:

> Uses the most relevant available date—usually a deadline or contract end; otherwise publication or start date.

3. Keep the info icon hover/focus behavior and ensure its accessible label describes Applicable date.
4. Keep the Sort tooltip separately focused on Applicable date sorting versus Added/Updated timestamp sorting.

### Phase 2: Consistent control sizing

1. Introduce a shared `.contract-filter-control` or equivalent class for Category, Bid type, Applicable date, and Sort.
2. Apply the same width, minimum height, padding, and box-sizing rules to each select.
3. Keep Search wider and intentionally primary; it does not need to match the compact dropdown widths.
4. Ensure From/To custom date inputs align with the compact controls when shown.
5. Preserve responsive wrapping without allowing one control to become unexpectedly wider or narrower.

### Phase 3: Reset placement

1. Place Reset filters in a dedicated `.filter-actions` region at the far right of the controls row when space permits.
2. Use a clear gap or subtle separation from Sort, without making Reset appear to be part of sorting.
3. When the controls wrap, allow Reset to occupy its own final row or align naturally with the controls rather than floating unpredictably.
4. Keep Reset always available and ensure it restores all defaults: query, category, bid type, applicable-date range/custom dates, status, closed subcategory, and sorting.
5. Preserve the empty-state Clear filters action using the same default state.

## Files likely to change

- `src/App.tsx`
  - Applicable date label and tooltip copy
  - filter-control class hooks
  - Reset region markup if needed
- `src/styles.css`
  - shared dropdown sizing
  - controls-row and Reset layout
  - responsive behavior

## Edge cases

- The tooltip must remain available on keyboard focus and must not be clipped.
- Do not imply that Forecast fiscal-quarter advertisement text is an exact date.
- Unknown bid types should retain the existing fallback priority and explanation.
- Search should remain wider than compact dropdowns by design.
- Reset should clear custom From/To values even when the Date control is no longer labeled Date range.

## Testing strategy

1. Run lint and production build.
2. Verify the control label reads `Applicable date`.
3. Verify the tooltip explains deadline/end priority and publication/start fallback.
4. Verify Category, Bid type, Applicable date, and Sort have consistent dimensions.
5. Verify Reset has a deliberate separated placement at wide and narrow widths.
6. Verify Reset clears all filters and restores default applicable-date sorting.
7. Verify date filtering and sorting still use the existing bid-type-specific helper.

## Success criteria

- Users can tell that the date filter uses Applicable date.
- The UI accurately explains that Applicable date usually means a deadline/end date, with publication/start fallback.
- Compact dropdowns are visually consistent.
- Reset filters no longer appears misplaced or coupled to Sort.
- Existing behavior remains intact and lint/build pass.
