# Move the Workspace Switcher Below the Header and Refine Filter Help

## Problem and objectives

The Contracts/Companies workspace selector is currently grouped with account actions inside the App page header. Move that selector into its own row directly below the header so the product heading and account actions remain uncluttered.

Keep Generate unavailable while ensuring its existing `Coming Soon` hover/focus treatment remains intact. Add explanatory info icons to Category and Bid Type, and make all filter labels and info-tooltip explanations display in proper case rather than being forced to all caps.

## Technical approach

Reuse the existing `ModeSwitch`, `ComingSoon`, and `InfoTooltip` components. Add a small workspace-switch row between `.topbar` and the summary strip, enhance the shared `FilterSelect` component to optionally render an `InfoTooltip`, and use a single label-row treatment for every contract filter control.

## Implementation steps

### 1. Place Contracts/Companies below the header

1. In `AppShell`, remove `<ModeSwitch>` from `.topbar-actions` while preserving the signed-in identity and Sign out on the right side of the header.
2. Render `<ModeSwitch>` in a new page-width row immediately after the header and before the status summary strip.
3. Add a dedicated CSS wrapper that shares the existing content maximum width, aligns the selector with the main content on desktop, and wraps/positions predictably on narrow screens.
4. Keep the existing Contracts active state and Companies disabled `Coming Soon` behavior unchanged.

### 2. Retain and verify Generate’s Coming Soon affordance

1. Keep the disabled Generate summary control wrapped in `ComingSoon`; do not restore navigation to the Generate panel.
2. Preserve the wrapper’s hover and keyboard-focus trigger so `Coming Soon` is still visible even though the button itself is disabled.
3. Verify the summary-strip layout still accommodates the disabled Generate control and its tooltip without clipping.

### 3. Add filter help and proper-case label treatment

1. Extend `FilterSelect` with optional help/tooltip properties, rendering its visible label in the same `.filter-label-row` structure used by Applicable Date, Updated Date, and Sort when help is supplied.
2. Configure the Contract filter controls:
   - **Category** info tooltip: `Business Category`
   - **Bid Type** info tooltip: `Lead Stage`
3. Update visible filter labels to proper case (for example, `Applicable Date`, `Updated Date`, and `Sort`) and remove CSS `text-transform: uppercase` rules that force filter label/explanation text to all caps.
4. Ensure tooltip body copy is explicitly written in proper sentence/title case, including the existing Applicable Date, Updated Date, and Sort explanations. Do not alter their filtering behavior or accessible control names except to keep them accurately matched to the visible labels.
5. Keep the label rows aligned: icon placement, label height, gap, and select top edge must match for Category, Bid Type, Applicable Date, Updated Date, and Sort.

## Edge cases and safeguards

- The Companies control remains semantically disabled and must not switch the workspace even after being moved.
- Because disabled buttons do not reliably receive hover/focus events, retain the focusable `ComingSoon` wrapper rather than attaching a tooltip only to the Generate button.
- Do not change date-range filtering, reset behavior, current status summaries, or the underlying Generate handler while changing presentation.
- Preserve accessible names for all filter selects and tooltip buttons.

## Testing strategy

1. Check desktop and narrow layouts: product header first, workspace selector directly below it, account controls retained in the header, and status pills below the selector.
2. Hover and keyboard-focus Generate and Companies; each must display `Coming Soon` and remain non-actionable.
3. Hover/focus the Category and Bid Type info icons to confirm the exact requested messages.
4. Verify all contract filter labels and tooltip explanations appear in proper case and their controls share a consistent baseline/alignment.
5. Run `npm.cmd run lint` and `npm.cmd run build`.

## Success criteria

- Contracts/Companies appears in a dedicated row below the App page header.
- Generate continues to show `Coming Soon` on hover/focus and remains disabled.
- Category and Bid Type have the requested info-icon messages.
- Filter labels and all info-tooltip explanations use proper case, with no unintended all-caps filter text.
- Existing workspace, filtering, and accessibility behavior remains intact; lint and build pass.
