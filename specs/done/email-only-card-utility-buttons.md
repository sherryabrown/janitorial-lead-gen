# Email-Only Card Utility Buttons Plan

## Problem Statement

The pencil and history buttons currently appear on every main company card. The requested behavior is to remove those buttons from Vetting, Calls, and Follow up views, while leaving them available on the Email view.

This should reduce clutter on the non-email queues and keep the Email view as the place where deeper review/editing affordances are most useful.

## Current Repository Context

- `src/App.tsx` renders card utility buttons in `LeadTable`:

```tsx
<div className="lead-utility-actions" ...>
  <button ...>
    <Pencil />
  </button>
  <button ...>
    <History />
  </button>
</div>
```

- `LeadTable` already receives the current `workflow`.
- The utility handlers `onNote` and `onHistory` are still needed for Email cards.
- `src/styles.css` uses a dedicated utility column in `.lead-row`:

```css
grid-template-columns: 26px 10px minmax(220px, 1fr) 64px minmax(160px, 210px);
```

The `64px` column exists mainly for the utility buttons.

## Objectives

1. Show pencil/history utility buttons only when `workflow === 'email'`.
2. Remove the visual gap created by the utility column on Vetting, Calls, and Follow up cards.
3. Keep Email cards unchanged enough that note/history actions still work.
4. Preserve selection, disabled action buttons, bulk selection, notes, history, and right-sidebar behavior.

## Technical Approach

### Phase 1: Conditional Utility Rendering

In `LeadTable`, define:

```ts
const showCardUtilities = workflow === 'email';
```

Then render the utility block only when true:

```tsx
{showCardUtilities ? (
  <div className="lead-utility-actions" onClick={(event) => event.stopPropagation()}>
    ...
  </div>
) : null}
```

For non-email workflows, render nothing in that area.

### Phase 2: Add Workflow Layout Classes

Add a workflow class to each card:

```tsx
className={`lead-row lead-row-${workflow} ${isSelected ? 'is-selected' : 'is-muted'}`}
```

Then update CSS so Email keeps the utility column and non-email cards use the reclaimed space:

```css
.lead-row {
  grid-template-columns: 26px 10px minmax(220px, 1fr) minmax(160px, 210px);
}

.lead-row-email {
  grid-template-columns: 26px 10px minmax(220px, 1fr) 64px minmax(160px, 210px);
}
```

Adjust medium-width rules similarly:

```css
@media (max-width: 1050px) {
  .lead-row {
    grid-template-columns: 26px 10px minmax(190px, 1fr) minmax(150px, 190px);
  }

  .lead-row-email {
    grid-template-columns: 26px 10px minmax(190px, 1fr) 60px minmax(150px, 190px);
  }
}
```

Keep mobile stacking simple; the utility block will only exist in Email view.

### Phase 3: Verify Handlers and Right Panel

No handler removal is needed because Email still uses `onNote` and `onHistory`.

Confirm:

- Vetting cards no longer show pencil/history.
- Calls cards no longer show pencil/history.
- Follow up cards no longer show pencil/history.
- Email cards still show pencil/history and they still open the right-hand note/history modes.

## Edge Cases

- The right-hand note/history panel can still be accessed from Email cards.
- Vetting, Calls, and Follow up still default to the note panel when selected by workflow, but do not expose card-level pencil/history buttons.
- The card action column should not shift awkwardly between selected and non-selected cards within the same workflow.
- Non-selected card action buttons remain disabled as previously implemented.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Vetting cards do not show pencil/history buttons.
2. Calls cards do not show pencil/history buttons.
3. Follow up cards do not show pencil/history buttons.
4. Email cards still show pencil/history buttons.
5. Email pencil opens notes in the right sidebar.
6. Email history opens history in the right sidebar.
7. Card action buttons remain aligned after utility removal.
8. Non-selected card actions remain disabled.

## Success Criteria

- Pencil/history buttons appear only on Email view company cards.
- Other workflow cards are visually cleaner and do not reserve empty utility space.
- Existing selection, action, note, history, and sidebar behavior remains intact.
