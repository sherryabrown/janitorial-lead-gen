# Right Sidebar and Dim Unselected Cards Plan

## Problem Statement

The context panel is currently collapsing below the lead list at widths under `1180px`, which can make it appear like a bottom sidebar. The requested behavior is to make sure it remains a right-hand sidebar. The main company cards also need stronger visual focus by greying out non-selected cards.

This is a UI-only refinement. Do not change workflow behavior, mock data, notes, history, email editing, or lead transitions.

## Current Repository Context

- `src/App.tsx` renders a two-column `.workspace` with:
  - `.lead-worklist`
  - `<ContextPanel />`
- `LeadTable` marks the selected card with:

```tsx
className={`lead-row ${selectedLeadId === lead.id ? 'is-selected' : ''}`}
```

- `src/styles.css` defines:
  - `.workspace { grid-template-columns: minmax(540px, 1fr) 360px; }`
  - `.detail-panel { position: sticky; top: 18px; }`
  - `@media (max-width: 1180px)` changes `.workspace` to one column and makes `.detail-panel` static.
  - `.lead-row.is-selected` adds the orange selected accent.

## Objectives

1. Keep the context panel as a right-hand sidebar across reasonable desktop and tablet widths.
2. Only stack the panel below the list on truly narrow mobile screens where a right sidebar would be unusable.
3. Grey out non-selected main company cards when there is a selected lead.
4. Keep selected card readable and clearly active.
5. Preserve accessibility and avoid making non-selected cards look disabled or unclickable.

## Technical Approach

### Phase 1: Keep Sidebar on the Right

In `src/styles.css`:

1. Remove or revise the current `@media (max-width: 1180px)` rule that collapses `.workspace` to one column.
2. Keep the two-column layout down to a smaller breakpoint, such as `900px` or `860px`.
3. Use responsive column widths so the right panel remains usable:

```css
.workspace {
  grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
}
```

4. Add a medium-width adjustment if needed:

```css
@media (max-width: 1050px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}
```

5. Only stack on narrow mobile:

```css
@media (max-width: 860px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}
```

This preserves the right sidebar for normal browser widths while still avoiding a broken mobile layout.

### Phase 2: Add Non-Selected Card Dimming

Update `LeadTable` in `src/App.tsx` to apply a class when a card is not selected:

```tsx
const isSelected = selectedLeadId === lead.id;

<article
  className={`lead-row ${isSelected ? 'is-selected' : 'is-muted'}`}
  ...
>
```

Because there is always a selected lead when visible leads exist, this can be simple. If a future empty/no-selection state is introduced, avoid muting all rows.

In `src/styles.css`, add:

```css
.lead-row.is-muted {
  background: #f5f2ef;
  border-color: #e2dbd4;
  color: #5f5851;
  opacity: 0.72;
}

.lead-row.is-muted:hover {
  opacity: 0.92;
  background: #fbfaf8;
}

.lead-row.is-selected {
  opacity: 1;
  background: var(--surface);
}
```

Keep action buttons and text legible. Do not set `pointer-events: none`; muted cards must remain clickable.

### Phase 3: Tune Responsive Card Layout

Because the sidebar remains visible at narrower widths than before:

1. Confirm lead card action buttons do not overflow in the remaining list column.
2. If needed, reduce `.lead-row` action column width:

```css
grid-template-columns: 26px 10px minmax(220px, 1fr) 64px minmax(160px, 210px);
```

3. Ensure `.lead-contact`, `.latest-note`, and card actions truncate/wrap cleanly.
4. Keep mobile stacking rules under the final narrow breakpoint.

## Edge Cases

- Non-selected cards should be visually muted but still obviously clickable.
- Bulk-selected cards that are not the selected detail lead should still show checkbox state clearly.
- The selected card should remain high contrast and easy to identify.
- On very narrow screens, the panel may stack below the list because a right sidebar would not fit.
- Sticky positioning should not cause the right panel to overlap the header or list.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. At normal desktop width, the context panel appears on the right, not below.
2. At medium widths around 1000px, the context panel still appears on the right.
3. At narrow mobile width, the layout may stack cleanly without overlap.
4. The selected company card remains bright/active.
5. Non-selected company cards are greyed out but readable.
6. Clicking a greyed-out card selects it and makes it active.
7. Checkboxes remain clear on greyed-out cards.
8. Card action buttons remain usable and do not overflow.

## Success Criteria

- The context panel remains a right-hand sidebar except on narrow mobile.
- Non-selected main company cards are visually greyed out.
- The selected card clearly owns the right-hand context panel.
- The change does not alter workflow behavior or add integrations.
