# Contracts Filter Advanced Disclosure Layout

## Problem

The current Contracts filter bar renders Advanced filters as a bordered button inside the flex row. In the screenshot, this causes “Hide advanced,” Changed stage, and Changed date to float above and beside the primary controls, creating an awkward broken hierarchy.

The desired design is a small text disclosure directly beneath the Category dropdown:

```text
CATEGORY                 BID TYPE       APPLICABLE DATE       SORT
[ All ]                  [ All ]        [ All dates ]          [ Applicable date ]
⌄ Advanced filters

when expanded:
Changed stage             Changed date
[ All ]                   [ All dates ]
```

The disclosure should use a caret and text, not a bordered button. The expanded content should flow below the primary row and not push historical controls into the same visual row as Sort.

## Objectives

1. Place `Advanced filters` directly under Category.
2. Use a text/caret disclosure with clear expanded/collapsed state.
3. Remove the current bordered “Hide advanced” button styling.
4. Keep Category, Bid type, Applicable date, Sort, and Reset filters visually aligned as primary controls.
5. Keep Changed stage and Changed date inside the expanded Advanced area.
6. Preserve active-filter discoverability, keyboard accessibility, mobile behavior, and existing filter behavior.

## Current implementation to change

- `ContractFiltersBar` in `src/App.tsx` currently renders `.advanced-filter-control` inside `.filter-controls-row`.
- `.filter-controls-row` is a wrapping flex layout in `src/styles.css`, which allows the advanced content to appear beside and above the primary controls.
- Historical filter state, presets, queries, and reset behavior already work and should not be redesigned.

## Implementation approach

### Phase 1: Restructure filter markup

Update `ContractFiltersBar` into explicit layout regions:

1. Search row.
2. Primary controls row containing Category, Bid type, Applicable date, Sort, and Reset filters.
3. An Advanced disclosure block positioned immediately beneath the Category control. The disclosure itself should remain in the Category column on desktop and span the available width on narrow screens as appropriate.
4. Expanded Advanced content rendered below the primary row or below the Category column without changing the primary controls’ alignment. It should contain only Changed stage, Changed date, and custom From/To inputs.

Use a real `<button>` for accessibility but style it as text:

```tsx
<button
  className="advanced-filter-disclosure"
  aria-expanded={advancedOpen}
  aria-controls="contract-advanced-filters"
>
  <ChevronDown aria-hidden="true" />
  <span>Advanced filters</span>
</button>
```

Rotate or swap the caret when expanded. Do not show “Hide advanced”; keep the label `Advanced filters` and let the caret communicate state. If historical filters are active while collapsed, add a subtle text indicator such as `(active)` or a small accessible status, without creating a badge-heavy treatment.

### Phase 2: Styling and responsive behavior

Add scoped styles in `src/styles.css`:

- `.advanced-filter-disclosure`: borderless, background transparent, compact typography, left-aligned, brand color only on hover/focus, visible keyboard focus ring.
- `.advanced-filter-control`: position/layout container under Category; no bordered panel around the disclosure.
- `.advanced-filter-panel`: a quiet secondary row/grid with consistent spacing and the same select/date heights as the existing controls.
- Ensure the panel does not overlap Sort or Reset filters.
- At narrow widths, stack the primary controls and advanced content in document order.
- Preserve the existing 38px control height and existing visual tokens.

Do not change the established visual treatment of Search, Applicable date, Sort, or Reset filters beyond alignment needed for the new layout.

### Phase 3: State and interaction QA

- Keep Advanced collapsed by default.
- Automatically open it when a historical filter is active so the active filter is visible.
- Reset filters must clear historical state and collapse Advanced.
- Keyboard Enter/Space must toggle it.
- `aria-expanded` and `aria-controls` must accurately reflect state.
- Existing historical date presets and validation behavior must remain unchanged.

## Testing strategy

1. Run ESLint and the production build.
2. Verify desktop layout against the supplied screenshot intent: disclosure directly beneath Category; no large Hide advanced button; Sort remains in the primary row.
3. Verify expanded layout for Changed stage/date and Custom From/To.
4. Verify active historical filters automatically reveal Advanced.
5. Verify Reset filters collapses Advanced and clears values.
6. Verify keyboard focus and toggling.
7. Verify mobile/narrow layout has no overlap or horizontal overflow.

## Success criteria

- The user sees text `Advanced filters` with a caret directly below Category.
- The disclosure is not styled as a large bordered control.
- Changed stage/date controls appear only in the expanded Advanced area.
- The primary filter row remains visually orderly and aligned.
- Existing filtering, reset, accessibility, and responsive behavior continue to work.
