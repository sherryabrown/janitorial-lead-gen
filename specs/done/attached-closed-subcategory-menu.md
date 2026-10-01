# Attached Closed Subcategory Menu Plan

## Problem Statement

The current `Closed` subcategory options are clickable buttons, but their presentation is still not right. When the user clicks `Closed`, the subcategories should feel attached to the `Closed` pill and display vertically, like an expanded connected menu under that pill.

This applies to both Contracts and Companies. This remains UI-only.

## Current Repository Context

- `src/App.tsx` already has the correct interaction state:
  - `expandedClosedMode`
  - `isClosedSubcategoryExpanded`
  - `SummaryPill`
  - `summary-suboptions`
- Clicking `Closed` toggles the subcategory options.
- Clicking a subcategory applies filtering.
- `src/styles.css` currently renders `.summary-suboptions` as a horizontal flex-wrap row:

```css
.summary-suboptions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0 2px 3px 22px;
}
```

The request is primarily presentation: make the subcategories attached to the `Closed` pill and vertical.

## Objectives

1. Keep the existing click behavior.
2. Make the subcategory options visually attached to the `Closed` pill.
3. Display subcategories vertically.
4. Keep the selected subcategory visually clear.
5. Avoid a native dropdown/select.
6. Keep layout compact and stable in the summary strip.

## Design Approach

Use the existing `summary-pill-shell` wrapper as the connected container.

When the closed menu is expanded:

- The main `Closed` pill should visually connect to the vertical subcategory menu below it.
- The menu should align with the `Closed` pill width.
- Subcategory rows should be stacked vertically.
- Each row should show:
  - Subcategory label on the left.
  - Count on the right.
- The top of the menu should touch or nearly touch the bottom of the `Closed` pill.

Recommended visual:

- Main `Closed` pill: top corners rounded, bottom corners slightly reduced when expanded.
- Menu: same background family, same border color, no gap or only 1px overlap, bottom corners rounded.
- Active subcategory: soft brand background or left accent, not heavy orange.

## Markup Approach

The current `SummaryPill` structure is already appropriate:

```tsx
<div className="summary-pill-shell has-subfilter is-active">
  <button className="summary-pill summary-pill-main">...</button>
  <div className="summary-suboptions">
    <button>...</button>
  </div>
</div>
```

Avoid changing behavior unless necessary. Add one optional class if useful:

```tsx
className={`summary-pill-shell ${hasSubfilter ? 'has-subfilter' : ''} ${
  item.isClosedSubcategoryExpanded ? 'is-expanded' : ''
} ${isActive ? 'is-active' : ''}`}
```

This gives CSS a reliable hook for connected styling.

## CSS Plan

Replace the horizontal suboption styles with a vertical attached menu.

Suggested CSS:

```css
.summary-pill-shell {
  display: grid;
  gap: 0;
  align-self: start;
}

.summary-pill-shell.has-subfilter {
  min-width: 184px;
}

.summary-pill-shell.is-expanded .summary-pill-main {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
  background: var(--soft);
  color: var(--brand-strong);
}

.summary-suboptions {
  display: grid;
  gap: 0;
  margin-top: -1px;
  padding: 5px;
  border: 1px solid rgba(255, 145, 77, 0.35);
  border-top: 0;
  border-radius: 0 0 7px 7px;
  background: #fffaf6;
  box-shadow: 0 8px 18px rgba(44, 37, 31, 0.06);
}

.summary-suboptions button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-align: left;
}

.summary-suboptions button.is-active {
  background: var(--surface);
  color: var(--brand-strong);
}
```

Counts can keep the small circular style already in `.summary-suboptions button strong`, but adjust sizing if needed so rows stay clean.

## Responsive Considerations

- Summary strip already scrolls horizontally on mobile.
- The vertical attached menu will increase the height of only the `Closed` shell.
- Ensure the menu does not overlap the workspace below. It should participate in layout normally, not position absolute.
- If the summary strip height grows, that is acceptable because the menu is expanded intentionally.

## Implementation Steps

1. Add `is-expanded` class to `summary-pill-shell` when `item.isClosedSubcategoryExpanded` is true.
2. Update `.summary-pill-shell` to use `gap: 0` and align itself to the top.
3. Update `.summary-pill-shell.is-expanded .summary-pill-main` so the main pill visually connects to the menu.
4. Replace `.summary-suboptions` flex styles with a vertical grid attached menu.
5. Update `.summary-suboptions button` from pill-like horizontal buttons to full-width vertical menu rows.
6. Keep `.summary-suboptions button.is-active` clear but understated.
7. Run lint and build.

## Edge Cases

- Clicking `Closed` again should still hide the attached vertical menu.
- Clicking a subcategory should still apply the filter.
- The attached menu should not use absolute positioning that could overlap the worklist.
- Long labels like `Not interested` should fit within the attached menu row.
- Counts should remain visible and aligned right.
- Contracts and Companies should share the same presentation.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Contracts: clicking `Closed` shows a vertical menu attached to the `Closed` pill.
2. Contracts: clicking `Closed` again hides the menu.
3. Contracts: subcategory rows filter correctly.
4. Companies: clicking `Closed` shows a vertical menu attached to the `Closed` pill.
5. Companies: clicking `Closed` again hides the menu.
6. Companies: subcategory rows filter correctly.
7. The menu feels connected to `Closed`, not like a separate horizontal row.
8. Mobile/narrow layout remains usable with horizontal summary scrolling.

## Success Criteria

- Closed subcategories display vertically.
- The subcategory menu is visually attached to the `Closed` pill.
- Existing filtering behavior remains unchanged.
- No native dropdown/select is used.
