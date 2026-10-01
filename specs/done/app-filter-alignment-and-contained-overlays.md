# Align App Filters and Contain Summary and Stage-Reason Overlays

## Problem and objectives

The App page currently has four related layout failures:

1. Contract filter labels, selects, help icons, and Reset filters do not share a consistent baseline.
2. White surface backgrounds extend through unused horizontal space instead of ending with their last visible control/pill.
3. Inline stage-reason controls can overflow a contract card and the viewport.
4. Selecting Closed expands the summary strip itself, increasing the white background rather than presenting a contained choice list.

Resolve these with common control geometry and overlay patterns that stay inside the viewport, preserve the existing workflow behavior, and remain usable on narrow screens.

## Technical approach

Treat the filter row as a predictable grid rather than a mix of flex items with per-control padding offsets. Make summary/control surfaces intrinsic-width where they represent a short group of controls. Replace inline-expanding reason and Closed subcategory content with bounded, layered UI: a stage-reason dialog/popover and a floating Closed subcategory menu that does not contribute to the summary-strip height.

## Implementation steps

### 1. Establish one contract-filter control layout

1. Refactor `ContractFiltersBar` markup so Category, Bid Type, Applicable Date, Updated Date, and Sort all use the same control wrapper:
   - one proper-case label/help row;
   - one 38px select beneath it; and
   - the same fixed/minimum column width.
2. Put Reset filters in a matching wrapper with an intentionally blank label row, so its button baseline exactly matches the dropdowns without a magic `padding-top` offset.
3. Replace the current wrapping flex/order rules with a CSS grid for the primary controls. Use uniform columns and gaps at desktop widths, then intentionally wrap full controls at smaller widths; custom From/To date fields and validation messages occupy their own subsequent grid row.
4. Remove obsolete per-control layout rules (`filter-actions` padding alignment, differing label margins, and rules that treat select fields separately) once the shared component class owns the sizing.
5. Confirm all tooltip triggers remain directly beside their respective labels and do not alter the label/select vertical geometry.

### 2. Keep explanation hovers inside the viewport

1. Upgrade `InfoTooltip` to support a safe horizontal placement strategy (left/right/auto) or equivalent CSS modifier classes.
2. Position ordinary tooltips above the control when space permits, but flip below when needed; constrain width with viewport-aware max-width and allow wrapping.
3. For rightmost filter controls, anchor the tooltip from the right edge (or use an auto-placement calculation) so it never runs beyond the right side of the page. For leftmost controls, avoid a negative left overflow.
4. Retain mouse hover and keyboard-focus visibility, existing aria labels, readable contrast, and pointer-event behavior.

### 3. Make compact control surfaces stop at their content

1. Inspect the mode-selector and summary-strip container sizing and remove any full-width surface/background behavior that creates trailing white space after the last item.
2. Use an intrinsic-width inner surface (`fit-content`/`max-content` bounded by the available width) around Contracts/Companies and status pills, while retaining a separate outer scrolling wrapper where narrow viewports need horizontal access.
3. Keep the content aligned with the header/workspace grid and ensure the surface ends after the final visible item, including Companies.
4. Do not remove the border, active treatment, or responsive scrolling behavior merely to eliminate the trailing background.

### 4. Replace inline stage-reason controls with a bounded dialog

1. Replace `ContractActions`' inline `.contract-reason-menu` with a single stage-reason dialog/popover component opened by Not interested, Lost, or Withdrew.
2. The component must display the target stage, reason select, conditional Other-reason input, Cancel, and Save actions in a bounded panel:
   - center or anchor it within the viewport;
   - cap width at the viewport with comfortable padding;
   - stack fields/actions on narrow screens; and
   - prevent background interaction while it is active if using a modal dialog.
3. Preserve the existing validation, reason options, action mapping, close behavior, and persistence call. Closing/canceling must not change a contract.
4. Provide escape/cancel and focus handling appropriate to the selected dialog/popover mechanism.

### 5. Make Closed subcategories a floating menu

1. Keep Closed selected/expanded state but render `.summary-suboptions` as an absolutely positioned menu anchored to its Closed summary pill rather than as normal grid content.
2. Give the Closed pill shell a positioned containing block and adequate stacking order. The menu should open beneath the pill with bounded width, shadow, and a background surface while leaving the summary strip's height unchanged.
3. On constrained widths, keep the menu within the visible viewport/scrolling area; use a responsive placement adjustment or a viewport-level overlay if needed.
4. Preserve all existing subcategory counts, selected state, click behavior, and keyboard access. Add outside-click/Escape dismissal if the chosen menu implementation needs it to prevent a stranded open menu.

## Edge cases and safeguards

- Both date filters can reveal custom date fields; those fields must not disturb the primary dropdown row's alignment.
- Tooltip placement must work for first and last controls as well as a horizontally scrolled/narrow layout.
- Do not change stage reasons, history recording, or stage transition availability while moving the reason UI.
- The Closed popover must layer above cards without increasing the summary strip or creating an oversized white parent background.
- Preserve the disabled Companies and Generate Coming Soon behavior.

## Testing strategy

1. Check the filter row at desktop, intermediate, and narrow widths. Verify label rows, selects, info icons, and Reset filters align exactly; test both custom date selectors.
2. Hover and keyboard-focus every filter help icon at left, middle, and right positions; tooltips must be fully visible and readable.
3. Verify the Contracts/Companies and summary surfaces end with their final item instead of filling unused page width, while horizontal scrolling still works when necessary.
4. Open each reason-required stage action on cards near viewport edges; complete, cancel, use Other, and press Escape. Confirm no overflow and correct history/reason persistence.
5. Select Closed and its subcategories; confirm the list floats over content, the summary strip height/background does not grow, and selection/filtering still works.
6. Run `npm.cmd run lint` and `npm.cmd run build`.

## Success criteria

- Contract dropdowns, label/help rows, and Reset filters have a single consistent alignment system.
- No info tooltip can extend off either page edge.
- White control/summarization surfaces end with their contents rather than filling empty width.
- Stage reasons and Closed subcategories use bounded overlays that never enlarge their parent background or overflow the screen.
- Existing filtering, stage updates, reason history, and responsive accessibility behavior remain intact.
