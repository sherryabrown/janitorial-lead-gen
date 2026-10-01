# Exact Filter-Control Alignment and Left-Aligned Workflow Bar

## Confirmed visual acceptance criterion

The actual top and bottom edges of these six interactive controls must be exactly aligned on the same horizontal baseline:

- Category dropdown
- Bid Type dropdown
- Applicable Date dropdown
- Updated Date dropdown
- Sort dropdown
- Reset filters button

The labels may remain above their controls. The agreed correction is to lower the Category and Bid Type dropdowns—and the Reset filters button as needed—to meet the existing Date/Sort dropdown position. This is not a request to merely align label text or grid columns.

## Problem and objective

The current shared filter grid still produces different vertical offsets because Category/Bid Type use a label-row margin override while date/sort controls retain both label-row spacing and grid gap. Reset uses a separate, shorter blank spacer. Separately, the Generate/Open workflow bar is centered by auto margins, and the workspace wrapper needs to remain visually limited to the intrinsic Contracts/Companies control rather than a page-width white surface.

## Technical approach

Make the vertical rhythm explicit with one measured label-slot height and one select/button row position. Reuse the existing lower Date/Sort position as the reference; remove the Category/Bid Type margin override and size the Reset label spacer to the same total pre-control height. Do not use per-item `translate`, arbitrary negative margins, or a second grid implementation.

## Implementation steps

### 1. Lock the six filter controls to one vertical geometry

1. Define shared CSS custom properties or one shared control rule for:
   - label row height;
   - label-to-control spacing; and
   - 38px control height.
2. Apply that exact rule to the `FilterSelect` label/help structure, Applicable Date, Updated Date, Sort, and Reset filters.
3. Remove the special `.select-field > .filter-label-row { margin-bottom: 0; }` override that currently leaves Category/Bid Type selects 5px above Date/Sort selects.
4. Set `.filter-label-spacer` to the same full label-slot height used by the real label rows, so Reset filters moves down to the same control top edge—not merely near it.
5. Keep the primary control grid columns and custom date/error rows, but verify no date fields are auto-placed into the primary row when a custom preset is selected.
6. Use browser layout inspection/measurement at the target desktop width to verify all six bounding rectangles share the same `top` and `bottom` values. Treat any non-zero difference as a failed implementation.

### 2. Put the workflow bar back on the left

1. Keep the Generate/Open/etc. summary strip intrinsic-width so its white surface ends with its final visible workflow pill.
2. Replace the centering `margin: 0 auto ...` on the summary workflow container with left alignment relative to the App shell content edge.
3. Preserve the responsive horizontal-scroll behavior and Closed floating menu layering.

### 3. Limit Contracts/Companies encapsulation to its contents

1. Ensure `.workspace-mode-row` is only a neutral alignment wrapper: no white background, border, shadow, or forced full-width visual surface.
2. Ensure `.mode-switch` is the only encapsulated surface and sizes to its intrinsic Contracts + Companies content (including its padding/border), not the page width.
3. Check desktop and narrow widths for no trailing white block after Companies and no clipping of the Companies Coming Soon tooltip.

## Edge cases and safeguards

- Preserve all filter values, help icons, date validation, and Reset behavior while changing spacing.
- The alignment rule applies to control boxes, not tooltip popovers; tooltip positioning must remain viewport-safe.
- Do not re-center the workflow bar indirectly through a parent auto margin or `justify-content: center`.
- Keep Generate and Companies disabled with their Coming Soon behavior intact.

## Testing strategy

1. At desktop width, inspect/measure the six controls and verify identical `top` and `bottom` coordinates.
2. Select custom Applicable Date and Updated Date ranges; confirm primary controls remain in their aligned row and custom fields appear only below.
3. Confirm Generate/Open workflow begins at the left content edge and its white surface stops at the final pill.
4. Confirm Contracts/Companies has only its own compact white bordered surface and no page-width trailing background.
5. Run `npm.cmd run lint` and `npm.cmd run build`.

## Success criteria

- Category, Bid Type, Applicable Date, Updated Date, Sort, and Reset filters have exact matching control-box top and bottom edges.
- The workflow bar is left aligned.
- Only the compact Contracts/Companies switch is encapsulated; no blank white surface continues across the page.
- Existing filter/workflow behavior, responsive usability, and Coming Soon states are unchanged.
