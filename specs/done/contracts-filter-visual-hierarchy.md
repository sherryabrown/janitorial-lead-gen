# Contracts Filter Visual Hierarchy

## Problem statement

The Contracts filter bar needs a clearer visual hierarchy. Search should be the primary wide control on its own row. Category, Bid type, Date, Sort, and Reset should form a compact secondary row. The current implementation also places the date helper under Bid type, exposes the Sort help content on screen after clicking, and uses long sort option labels that can be truncated.

## Objectives

1. Use a two-row filter layout: Search on the first row; the remaining controls on the second row.
2. Keep Sort compact and use short visible options.
3. Place Reset filters in a clearly separate action area, not visually beside or inside Sort.
4. Change the Sort info explanation to a hover tooltip; retain keyboard-focus availability for accessibility without leaving the explanation persistently visible.
5. Change the Date range heading to `Date` and place a hover info icon beside it explaining which date is used.
6. Keep the Date helper attached to the Date control, not Bid type.
7. Preserve current filtering, sorting, custom range validation, and reset behavior.

## Recommended copy

- Search
- Category
- Bid type
- Date
- Sort
- Reset filters

Date tooltip:

> Date uses the most relevant available date for the selected bid type.

Sort tooltip:

> Applicable uses the most relevant date for each bid type. Added and Updated use record timestamps.

Short sort option labels:

- Applicable date ↑
- Applicable date ↓
- Added ↑
- Added ↓
- Updated ↓

The tooltip should be visually hidden until hover/focus and should not consume persistent vertical space.

## Current implementation findings

- `ContractFiltersBar` currently places all controls in one grid row and includes Search, Category, Bid type, Date range, custom dates, Sort, validation, and Reset.
- The Date helper text is currently inside the `date-range-control` wrapper around Bid type, so it appears beneath the wrong control.
- Sort help is currently toggled into visible page content by React state.
- The Sort control uses long option labels from `labelForOption`, causing truncation in the screenshot.
- Reset is currently a grid item with a left divider, visually associating it with Sort.
- The shared responsive `.filter-bar` rules need adjustment for the new two-row structure.

## Technical approach

### Phase 1: Two-row layout

1. Wrap Search in a `.filter-search-row` that spans the full filter-bar width.
2. Wrap Category, Bid type, Date, custom date inputs, Sort, and Reset in a `.filter-controls-row`.
3. Use a wide Search input on row one and compact content-sized controls on row two.
4. Keep custom From/To fields adjacent to Date when Custom is selected.
5. Put Reset in `.filter-actions` at the far end of the controls row with a small gap or neutral separation, without a divider that implies it belongs to Sort.
6. At narrow widths, let the controls row wrap naturally while keeping Search full width.

### Phase 2: Date and Sort affordances

1. Rename `Date range` to `Date`.
2. Move the date explanation to a small info button next to the Date label.
3. Implement a reusable tooltip pattern using CSS `:hover` and `:focus-visible` on the info button. The tooltip must be hidden by default, positioned relative to the label, and have a high enough stacking context to avoid clipping.
4. Replace the Sort click-to-show state with a hover/focus tooltip. Remove `showSortHelp` state and `aria-expanded` if the control is no longer a disclosure; use an accessible `aria-label` and tooltip text tied with `aria-describedby` where practical.
5. Use `CircleHelp` or the existing info icon consistently for Date and Sort.
6. Ensure tooltip text is available on keyboard focus as well as pointer hover. Do not rely on hover alone for keyboard users.

### Phase 3: Short labels and helper placement

1. Keep the select option values unchanged for behavior, but update `labelForOption` to produce the shorter sort labels.
2. Place the Date info tooltip beside the Date label and remove the persistent date helper paragraph.
3. Use the tooltip copy to explain that the actual date depends on bid type and is selected by the system.
4. Keep the visible `Search` label and shorten the placeholder to avoid truncation, such as `Project, location, contact, or agency`.
5. Keep custom-date invalid-range feedback visible and associated with the controls.

### Phase 4: Reset verification

1. Keep Reset filters always visible and separate from Sort.
2. Ensure it restores category, bid type, date preset, custom dates, query, status, closed subcategory, and sort defaults.
3. If the reset behavior is duplicated between the filter bar and empty state, centralize the default object so both paths stay consistent.
4. Reset should not clear loaded Supabase records or the selected contract.

## Files likely to change

- `src/App.tsx`
  - ContractFiltersBar structure and tooltip markup
  - Date label/helper and Sort labels
  - removal of click-visible Sort help state
  - reset default handling if centralized
- `src/styles.css`
  - two-row filter layout
  - compact controls and separated Reset action
  - tooltip positioning/visibility
  - responsive wrapping

## Edge cases

- Tooltips must not be clipped by the filter card or overflow container.
- On touch devices, focus should expose the explanation even though hover is unavailable.
- On narrow screens, the tooltip should remain within the viewport or reposition safely.
- The Date explanation must remain accurate for All bid types and unknown bid types.
- Short sort labels must still distinguish ascending versus descending behavior.
- Custom From/To controls and invalid-range feedback must not be pushed into an unusable layout.

## Testing strategy

1. Run lint and production build.
2. Verify Search occupies the first row and the remaining controls form a clean second row.
3. Verify Sort is compact and no longer shows long truncated labels.
4. Verify Reset is visually separate from Sort and works with results visible.
5. Verify Date is labeled exactly `Date` and its info tooltip appears on hover and keyboard focus.
6. Verify Sort tooltip appears on hover and keyboard focus without remaining visible by default.
7. Verify date semantics explain applicable-date behavior without persistent helper clutter.
8. Verify all filters, custom dates, invalid-range feedback, sorting, and reset still function.
9. Verify responsive behavior at desktop, tablet, and narrow widths.

## Success criteria

- The filter bar has a clear two-row hierarchy.
- Sort is compact, concise, and explained through a hover/focus tooltip.
- Date is labeled `Date` and explained through a hover/focus tooltip.
- Reset filters is clearly independent from Sort.
- Search is visibly labeled and remains usable.
- Existing filtering, sorting, reset, and Supabase behavior remain intact.
- Lint and production build pass.
