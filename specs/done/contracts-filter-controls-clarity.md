# Contracts Filter Controls Clarity

## Problem statement

The current Contracts filter bar presents several usability issues:

- Sort occupies the same visual footprint as the large Search field, making the hierarchy feel unbalanced.
- Reset filters sits beside the Sort control, making it look related to sorting instead of being a global filter action.
- “Applicable date” is not explained.
- The Date range control does not tell users which date is being evaluated for each bid type.
- The free-form search field relies on placeholder/ARIA text and does not visibly say “Search.”

## Objectives

1. Make Sort a compact, appropriately sized control rather than matching the Search field’s width.
2. Move Reset filters into a clearly separate filter-actions area, visually distinct from Sort.
3. Add an information icon beside Sort with a concise accessible explanation of Applicable date, Added, and Updated.
4. Clarify the Date range semantics in the UI: date ranges use the system-selected applicable date for each bid type.
5. Add a visible “Search” label to the free-form text search.
6. Preserve all current filter and sort behavior, including custom ranges, bid-type filtering, validation, and reset-to-default behavior.

## Recommended copy

Visible labels:

- Search
- Category
- Bid type
- Date range
- Sort
- Reset filters

Date range helper text:

> Filters by the applicable date for each bid type—for example, response deadline for opportunities and contract end for awards.

Sort info tooltip/popover:

> Applicable date uses the most relevant available date for each bid type. Added and Updated use the record timestamps.

The explanation should be short enough for a tooltip, but available to keyboard and screen-reader users through an accessible description or popover—not hover-only text.

## Current implementation findings

- `ContractFiltersBar` renders the Search field, Category, Bid type, Date range, custom From/To fields, Sort, validation text, and Reset filters button in one grid.
- The Sort control is currently a generic `FilterSelect`, so its width is governed by the shared filter grid.
- Reset filters is currently rendered at the end of the same filter-bar grid.
- The Search field currently uses a search icon and placeholder text but has no visible label.
- `getApplicableContractDate` contains the bid-type priority logic used for filtering/sorting.
- The current Date range control does not expose that helper logic to users.
- Lucide icon imports are already used throughout the app; an info/help icon such as `CircleHelp` or `Info` can be added without introducing a new dependency.

## Technical approach

### Phase 1: Filter-bar layout hierarchy

1. Update the filter-bar grid so the Search field remains the primary wide field, while Category, Bid type, Date range, and Sort use compact columns sized to their content.
2. Wrap the Sort label/control and info icon in a dedicated `.sort-control` container. Keep the select compact and prevent it from expanding to Search width.
3. Add a separate `.filter-actions` container for Reset filters. Place it after the filter controls with spacing or a visual boundary so it reads as a global action rather than a Sort option.
4. Preserve responsive behavior: controls may wrap on smaller widths, and Reset filters should remain a distinct full-width or aligned action without causing overflow.
5. Do not change CompanyFiltersBar layout.

### Phase 2: Sort explanation

1. Add an info icon next to the visible Sort label.
2. Implement a native-accessible explanation using either:
   - a compact tooltip/popover opened by click/focus, or
   - a button with an `aria-label` plus a visually hidden description and a visible tooltip on hover/focus.
3. Prefer a click/focus popover if the existing design system supports it, because the explanation is more discoverable and usable on touch devices.
4. Use the recommended concise copy and explicitly explain all three choices: Applicable date, Added, Updated.
5. Ensure Escape or clicking away closes a popover if one is implemented; ensure the info control is keyboard focusable.

### Phase 3: Date range clarity and Search label

1. Add helper text immediately below or beside the Date range control using the recommended copy.
2. If space is limited, use an info icon next to Date range with the same explanation, but do not make the semantics hover-only.
3. Add a visible `Search` label above the text input while retaining the search icon and descriptive placeholder.
4. Keep the existing input’s accessible label and expand its wording if needed to include project, location, contact, and agency.
5. Ensure custom From/To inputs remain clearly associated with Date range and continue showing invalid-range feedback.

### Phase 4: Reset behavior verification

1. Centralize the default filter object if practical so the Reset filters button and the empty-state Clear filters action use exactly the same defaults.
2. Reset must clear query, category, bid type, date preset, custom dates, status/closed subcategory, and sort selection/direction.
3. Reset must close or clear any open sort-help popover.
4. Keep the existing selected contract and loaded Supabase data intact when resetting filters; only the view state should change.

## Files likely to change

- `src/App.tsx`
  - filter-bar markup and labels
  - Sort help affordance/content
  - Date range helper text
  - centralized reset defaults if needed
- `src/styles.css`
  - compact sort layout
  - separated filter-actions area
  - visible Search label
  - helper text and tooltip/popover styling
  - responsive filter-bar behavior

## Edge cases

- The explanation must be available without hover and must not be clipped by the filter-bar container.
- On narrow screens, Sort and Reset must remain distinguishable after wrapping.
- The Date range explanation must remain accurate for unknown bid types: the system falls back to the best available parseable date.
- Reset must remove invalid custom date values as well as valid ones.
- Search label and placeholder should not duplicate awkwardly; use concise placeholder text after adding the visible label.

## Testing strategy

1. Run lint and production build.
2. Verify Sort is visibly narrower than Search at desktop widths.
3. Verify Reset filters is separated from Sort and clearly reads as a global action.
4. Verify the Sort info control opens or exposes the Applicable/Added/Updated explanation on mouse, keyboard, and touch-sized interaction.
5. Verify Date range helper text clearly identifies applicable-date behavior.
6. Verify Search is visibly labeled and still searches project, location, contact, and agency.
7. Verify custom date inputs and invalid-range feedback remain functional.
8. Verify Reset clears every Contract filter and restores default Applicable-date sorting.
9. Verify the filter bar remains usable at narrow widths and Company filters are unchanged.

## Success criteria

- Sort has a compact, distinct visual size and an accessible explanation.
- Reset filters is visually and semantically separate from Sort.
- Date range clearly explains which dates it evaluates.
- Search has a visible label.
- Existing filter, sort, reset, and Supabase data behavior remains intact.
- Lint and production build pass.
