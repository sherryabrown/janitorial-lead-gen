# Restore the Janitorial Leads Header and Simplify Contract Filters

## Problem and objectives

The current header uses the Contracts/Companies selector as the left-side title and does not show the product name. The restored Janitorial Leads heading must use the established orange text color used elsewhere in the interface. The Contracts Generate entry point is active even though it is not ready, and Companies should be visibly unavailable as well.

The contract filter row also separates related controls through an Advanced filters disclosure, misaligns the date/sort fields against Category and Bid type, and visually separates Sort from Reset. Replace the disclosure with a single aligned filter row containing Category, Bid type, Applicable Date, Updated Date, Sort, and Reset filters. Updated Date must communicate that it concerns stage and note activity made in this screen.

## Technical approach

Use the existing `ModeSwitch`, summary-pill Generate button, `ContractFiltersBar`, and date filtering state rather than introducing new navigation or filter components. This is primarily a UI restructuring, with one data-layer correction: the renamed Updated Date filter should locate leads changed by either a stage action or note activity, not only stage transitions as the current `findLeadIdsByStatusChange` helper does.

## Implementation steps

### 1. Rebalance the application header

1. In `AppShell`, restore a left-side title block with `Janitorial Leads` as the page heading.
   - Apply a dedicated header-title class and style it with the existing `var(--brand-strong)` orange token (`#d95f1f`), rather than introducing a new orange value.
2. Move `<ModeSwitch>` back into `.topbar-actions`, after the account/sign-out controls, so the Contracts/Companies choice is on the right.
3. Adjust only the header-specific CSS so the product title and right actions remain balanced on desktop and stack cleanly at narrow widths. Remove the prior topbar-only enlarged selector rule, since it is no longer in the title position.

### 2. Mark unavailable destinations as Coming Soon

1. Disable the Contracts summary-strip Generate button.
   - Remove its actionable `onClick` behavior and make it unavailable to keyboard activation. Do NOT lose the underlying functionality as it will be utilized soon.
   - Preserve its icon, label, and non-active visual hierarchy, with a wrapper or tooltip implementation that still exposes `Coming Soon` on hover and focus despite the disabled button.
2. Disable the Companies option in `ModeSwitch` using the same Coming Soon treatment.
   - The Contracts option stays enabled and remains the only selectable workspace.
   - Prevent its click handler from changing `workMode`; leave existing Companies UI/data code untouched for future enablement.
   - Convey the unavailable state semantically (`disabled` or equivalent accessible disabled behavior), not only through faded styling.
3. Add shared disabled/tooltip styling with adequate contrast and predictable pointer/focus behavior. Do not use the brand color to imply the disabled controls are primary actions.

### 3. Flatten and align the Contracts filter row

1. In `ContractFiltersBar`, remove the `advancedOpen` state, its effect, the Advanced filters disclosure, and the advanced panel markup.
2. Place these controls in this order within the primary `filter-controls-row`:
   1. Category
   2. Bid type
   3. Applicable Date
   4. Updated Date
   5. Sort
   6. Reset filters
3. Rename the existing Changed date control to **Updated Date**, retain its preset values and custom From/To fields, and replace the tooltip copy with:
   `Date/time of changes made on this screen, such as stage and note changes.`
4. Remove the Changed stage selector from the visible filter UI. Simplify `ContractFilters` and reset/filter state so there is no hidden stage criterion influencing results; the Updated Date filter should be the sole historical/activity filter.
5. Keep custom date validation and conditional date inputs. Ensure both Applicable Date and Updated Date custom ranges retain separate From/To fields and accessible labels.
6. Refactor the filter CSS into one shared control contract for `FilterSelect`, Applicable Date, Updated Date, and Sort:
   - Each has the same label row height, uppercase label typography, info-icon placement where applicable, control width, select height, and top alignment.
   - Remove the category stack, advanced panel ordering rules, and the `border-left`/extra offset that currently creates the separator before Reset filters.
   - Keep the row wrapping intentionally at narrower widths, with each control staying internally aligned rather than moving an unrelated control below a disclosure panel.

### 4. Make Updated Date reflect stage and note activity

1. Replace/refactor `findLeadIdsByStatusChange` in `src/lib/procurement.ts` into an activity-date helper (for example, `findLeadIdsByActivityDate`) that returns the distinct lead IDs having any qualifying activity in the selected interval:
   - stage changes;
   - note creation; and
   - note edits (resolved through the note's lead ID).
2. Apply the same inclusive day boundaries currently used for custom date ranges and preserve the existing `all` behavior by returning no ID restriction when no Updated Date filter is active.
3. Update the `AppShell` filtering effect and its dependencies to call this helper only for a non-`all` Updated Date preset; remove the now-unused changed-stage argument/state.
4. Use the actual deployed table identifiers consistently. If [rename-procurement-lead-history-tables.md](C:\Users\sherr\janitorial-lead-gen\specs\todo\rename-procurement-lead-history-tables.md) is built first, query the `procurement_lead_*` tables; otherwise apply that rename plan in the same release before switching the helper to those names. Do not introduce mock activity data.

## Edge cases and safeguards

- A native disabled button does not consistently expose hover tooltips, so the Coming Soon message must be attached to an enabled wrapper/tooltip trigger while the actual control remains non-actionable.
- Selecting a date preset must continue to update filtered results correctly; custom range validation must handle each date pair independently.
- Do not leave a hidden Changed stage value filtering the list after its control is removed.
- Switching is intentionally limited to Contracts while Companies is Coming Soon; do not delete Companies state or components because they are temporarily inaccessible.

## Testing strategy

1. Manually verify header layout on desktop and narrow widths: Janitorial Leads appears in the existing brand-orange text treatment at left, with account actions and mode switch at right/stacked as needed.
2. Hover and keyboard-focus Generate and Companies to confirm each announces/displays `Coming Soon`, and attempt click/keyboard activation to confirm neither changes app state.
3. Verify the Contracts filter row shows all six controls in the requested order with matching label/select alignment and no divider before Reset filters.
4. Test all, preset, and custom values for Applicable Date and Updated Date; confirm an Updated Date result can be triggered by a stage change, a new note, and a note edit.
5. Run `npm.cmd run lint` and `npm.cmd run build`.

## Success criteria

- The header reads Janitorial Leads in the shared brand-orange text color on the left, with the Contracts/Companies choice on the right.
- Generate and Companies are unavailable and both expose `Coming Soon` on hover/focus.
- Advanced filters and Changed stage are gone from the screen.
- Category, Bid type, Applicable Date, Updated Date, Sort, and Reset filters align consistently, with Updated Date positioned between Applicable Date and Sort and no separator before Reset filters.
- Updated Date accurately filters both stage and note activity, and lint/build pass.
