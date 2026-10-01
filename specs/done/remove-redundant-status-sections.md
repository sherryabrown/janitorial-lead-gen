# Remove Redundant Status Sections Plan

## Problem Statement

The current prototype shows workflow status controls in two places:

- A top-right status summary list without icons
- A left workflow rail with icons and counts

It also shows a thin notice/confirmation bar under the header. The provided screenshots indicate these sections should be simplified:

- Remove the notice bar shown in `Screenshot 2026-08-27 140114.png`
- Remove the left icon status list shown in `Screenshot 2026-08-27 140157.png`
- Move the workflow icons from the left status list into the top-right status list

The result should keep the UI decision-focused and reduce duplicate controls.

## Current Repository Context

- `src/App.tsx` contains the full React app.
- `workflowConfig` already maps each workflow to a Lucide icon.
- The top-right status list is rendered by `.summary-strip` / `.summary-pill`.
- The left status list is rendered by `QueueRail`.
- The notice bar is rendered as `<section className="notice">`.
- `src/styles.css` contains styles for all of these sections.

## Objectives

1. Remove the notice/confirmation bar under the header.
2. Remove the left workflow rail from the main workspace.
3. Add the existing workflow icons to the top-right status summary pills.
4. Preserve the same workflow filtering behavior from the top-right status list.
5. Keep the layout clean, fast to scan, and not overly orange.

## Technical Approach

This is a small UI refinement. Do not change mock data, action transitions, backend behavior, routing, or project structure.

### Phase 1: Update React Structure

In `src/App.tsx`:

1. Remove `CheckCheck` import if it is only used by the notice bar or replace its remaining usage with another imported icon if needed for empty state.
2. Remove `notice` state unless it is still needed elsewhere.
3. Remove all `setNotice(...)` calls from `selectWorkflow` and `applyAction`.
4. Delete the rendered notice section:

```tsx
<section className="notice" aria-live="polite">
  <CheckCheck size={18} />
  <span>{notice}</span>
</section>
```

5. Remove `QueueRail` from the workspace render:

```tsx
<QueueRail counts={counts} onSelect={selectWorkflow} workflow={workflow} />
```

6. Delete the `QueueRail` component if it is no longer used.
7. Update top-right summary pills so each pill renders its configured icon:

```tsx
{workflowOrder.map((item) => {
  const Icon = workflowConfig[item].icon;

  return (
    <button
      className={`summary-pill ${workflow === item ? 'is-active' : ''}`}
      key={item}
      onClick={() => selectWorkflow(item)}
      type="button"
    >
      <Icon size={18} aria-hidden="true" />
      <span>{workflowConfig[item].shortLabel}</span>
      <strong>{counts[item]}</strong>
    </button>
  );
})}
```

8. Keep `selectWorkflow` behavior intact:
   - Changing status from the top-right list should still update `workflow`.
   - Clear bulk selection.
   - Select the first lead in the chosen workflow when available.

9. If `CheckCheck` is still used by `EmptyQueueState`, keep it imported. Otherwise remove it.

### Phase 2: Update CSS Layout and Styling

In `src/styles.css`:

1. Remove `.notice` and `.notice svg` styles.
2. Remove `.queue-rail`, `.queue-button`, and related active/icon/count styles.
3. Update `.workspace` from three columns to two columns:

```css
.workspace {
  display: grid;
  grid-template-columns: minmax(540px, 1fr) 360px;
  gap: 16px;
  align-items: start;
  max-width: 1480px;
  margin: 0 auto;
}
```

4. Remove `.queue-rail` from shared panel styles:

```css
.lead-worklist,
.detail-panel {
  ...
}
```

5. Restyle `.summary-pill` to support an icon, label, and count cleanly:

```css
.summary-pill {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  min-width: 130px;
  gap: 8px;
}
```

6. Add icon color rules:

```css
.summary-pill svg {
  color: var(--muted);
}

.summary-pill.is-active svg {
  color: var(--brand-strong);
}
```

7. Review responsive rules:
   - Remove mobile `.queue-rail` rules.
   - Keep `.summary-strip` horizontally scrollable on small screens.
   - Keep the workspace single-column below `1180px`.

## Edge Cases

- If all leads in a workflow are processed, the empty state should still render and suggest the next queue.
- If the selected lead is outside the current visible workflow, existing selection fallback should continue working.
- Removing `notice` must not remove the ability to act on leads or bulk selections.
- Top-right status pills must remain large enough for icons, text, and counts without overlap.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. The thin confirmation/notice bar is gone.
2. The left workflow rail is gone.
3. The top-right status list shows the workflow icons.
4. Clicking each top-right status pill still filters the lead list.
5. Single actions still update the current lead and move selection forward.
6. Bulk actions still work after selecting visible leads.
7. Desktop layout uses lead list plus detail panel, with no empty left-column gap.
8. Mobile layout does not reference or reserve space for the removed rail.

## Success Criteria

- There is only one workflow status list.
- That list is in the top-right area and includes the original workflow icons.
- The notice bar and left rail sections from the screenshots are removed.
- The prototype remains quick to scan and keeps the same workflow behavior.
