# Contracts Applicable-Date Control Height

## Problem statement

The Applicable date dropdown is visibly shorter than Category, Bid type, and Sort in the Contracts filter bar. The screenshot shows the cause: Category and Bid type use the shared `FilterSelect`/`.select-field select` styles with `min-height: 38px`, while Applicable date is a raw `<select>` inside `.date-range-control` and does not receive the shared height, border, background, and padding rules. Sort has its own full control styling, so it aligns correctly while Applicable date does not.

## Objective

Make Applicable date visually identical to the other compact filter dropdowns in height, border, background, padding, font, and vertical alignment without changing its filtering behavior or label.

## Technical approach

1. Add a shared class such as `contract-filter-select` to the Applicable date `<select>` and, if useful, the Sort `<select>`.
2. Apply the same control rules to `.select-field select`, `.contract-filter-select`, and the Sort select:
   - `min-height: 38px`
   - consistent `height`/`box-sizing`
   - border, radius, background, text color, and padding
3. Keep the label row height consistent with Category, Bid type, and Sort.
4. Ensure the date control’s info icon remains beside the Applicable date label and does not affect the select’s height.
5. Preserve responsive behavior and custom date inputs.

## Files likely to change

- `src/App.tsx`: add the shared class to the Applicable date select.
- `src/styles.css`: unify select/control dimensions.

## Testing strategy

1. Run lint and production build.
2. Visually verify Category, Bid type, Applicable date, and Sort controls have equal heights.
3. Verify the Applicable date options and filtering behavior remain unchanged.
4. Verify the info icon remains aligned with the label and the custom date range still works.
5. Verify narrow-screen layout remains usable.

## Success criteria

- Applicable date is the same height and visual treatment as the other filter dropdowns.
- No filter behavior changes.
- Lint and production build pass.
