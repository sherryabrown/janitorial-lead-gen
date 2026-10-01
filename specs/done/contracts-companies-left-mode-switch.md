# Place the Contracts/Companies Switcher in the Left Header Position

## Problem and objective

The header currently uses the left side only to display the active workspace name (Contracts or Companies), while the actual Contracts/Companies selection control sits with account actions on the right. This separates the label from the control that changes it.

Move the existing icon-labelled workspace switcher into the left header position, sized to occupy the visual space currently used by the active-workspace heading. Keep account and sign-out controls on the right. The selected switch option remains the clear page context, so a separate duplicate `h1` is no longer needed.

## Technical approach

This is a presentation-only update in `src/App.tsx` and `src/styles.css`. Reuse `ModeSwitch`, its existing icons, state, and `selectWorkMode` handler. Do not change contract/company data, filtering, selection reset behavior, or accessibility semantics beyond preserving the existing labelled control.

## Implementation steps

1. Update the `AppShell` top bar in `src/App.tsx`.
   - Replace the static left eyebrow/`h1` block with `<ModeSwitch workMode={workMode} onChange={selectWorkMode} />`.
   - Remove that same `ModeSwitch` from `.topbar-actions`, leaving the signed-in label and Sign out action grouped on the right.
   - Keep the existing `ModeSwitch` button text and `FileCheck2`/`Building2` icons; they provide both recognizable and textual workspace choices.

2. Refine header/switch styling in `src/styles.css`.
   - Give the left-positioned mode switch the footprint and visual weight of the former workspace title area, rather than leaving it as the compact utility control it was when placed beside account actions.
   - Preserve the active orange-tinted treatment, neutral inactive option, readable icon/text spacing, and visible keyboard focus behavior.
   - Keep the top bar balanced: mode selector at start, account/sign-out actions at end; avoid changing the summary/workspace layout below it.
   - Confirm the existing narrow-screen stack still leaves the mode switch first and the account actions reachable without horizontal clipping. Adjust only the relevant responsive rules if the new placement changes alignment.

3. Validate both workspace choices.
   - Select Contracts and Companies from the left switcher and confirm each still uses `selectWorkMode`, including reset of bulk selection/closed expansion and appropriate context-panel mode.
   - Verify the active option is visually distinct and the header no longer displays a redundant standalone Contracts/Companies title.

## Testing strategy

1. Run `npm.cmd run lint`.
2. Run `npm.cmd run build`.
3. Manually check desktop and narrow layouts for the left selector, right account actions, icon visibility, active state, and switching behavior.

## Success criteria

- Contracts and Companies are selected from an icon-labelled control on the left side of the header.
- The selector fills the visual role/scale of the former left workspace heading.
- Sign out and the signed-in identity remain on the right.
- No duplicate active-workspace heading remains.
- Existing workspace switching behavior and responsive usability remain intact.
