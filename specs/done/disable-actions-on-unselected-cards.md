# Disable Actions on Unselected Cards Plan

## Problem Statement

Non-selected company cards are now visually greyed out, but their workflow action buttons are still active. The requested behavior is to disable the corresponding action buttons when a main company card is not selected.

This should reinforce that the right-hand context panel belongs to the selected card and reduce accidental actions on muted cards.

## Current Repository Context

- `src/App.tsx` renders lead cards in `LeadTable`.
- `LeadTable` already computes:

```ts
const isSelected = selectedLeadId === lead.id;
```

- The card class currently uses:

```tsx
className={`lead-row ${isSelected ? 'is-selected' : 'is-muted'}`}
```

- Workflow decision buttons are rendered by `LeadCardActions`.
- Note/history icon buttons are rendered separately in `.lead-utility-actions`.
- `src/styles.css` already has muted card styling and a global `button:disabled` rule.

## Objectives

1. Disable workflow decision buttons on non-selected cards.
2. Keep the non-selected card itself clickable so selecting it is still easy.
3. Keep checkboxes usable for bulk selection on non-selected cards.
4. Decide whether note/history icon buttons should remain available. Recommendation: keep them enabled, because clicking either already selects the card and opens the relevant right-panel mode.
5. Make disabled card action buttons visually subdued but readable.

## Technical Approach

### Phase 1: Pass Selection State Into `LeadCardActions`

In `src/App.tsx`, pass `isSelected` from `LeadTable`:

```tsx
<LeadCardActions
  disabled={!isSelected}
  lead={lead}
  onAction={onAction}
  workflow={workflow}
/>
```

Update the component props:

```ts
function LeadCardActions({
  disabled,
  lead,
  onAction,
  workflow,
}: {
  disabled: boolean;
  lead: Lead;
  onAction: (ids: string[], action: LeadAction) => void;
  workflow: Workflow;
}) {
  ...
}
```

### Phase 2: Disable Decision Buttons

Apply `disabled={disabled}` to these buttons:

- Vetting:
  - `Approve lead`
  - `Approve + review email`
  - `Reject lead`
- Email:
  - `Approve email`
  - `Reject lead`
- Calls / Follow up:
  - `Follow up`
  - `Won`
  - `Lost`
  - each expanded lost reason button

For the `Lost` toggle:

```tsx
<button
  disabled={disabled}
  onClick={() => setShowLostReasons((value) => !value)}
>
  Lost
</button>
```

For lost reason buttons:

```tsx
<button disabled={disabled} ...>
```

Optional cleanup: if a card becomes disabled/non-selected while lost reasons are expanded, let the disabled styles make them inert. No extra state sync is required for this prototype.

### Phase 3: Improve Disabled Styling

In `src/styles.css`, refine disabled styling for buttons inside muted cards:

```css
.lead-row.is-muted .lead-card-actions button:disabled {
  background: #eee9e4;
  border-color: #ddd5cd;
  color: #928980;
  opacity: 1;
}
```

Keep global disabled cursor behavior. Do not disable row click behavior.

If action buttons look too prominent on muted cards, reduce contrast only for `.lead-card-actions`; do not globally dim all buttons.

## Edge Cases

- Clicking a muted card should select it and then enable its action buttons.
- Clicking a checkbox on a muted card should still toggle bulk selection.
- Clicking note/history icons on a muted card should still select that lead and open the right panel.
- Disabled buttons should not trigger `window.confirm`.
- The selected card should have fully active buttons.
- Bulk action bar should remain usable independently of selected card state.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Non-selected cards are greyed out and their workflow action buttons are disabled.
2. Selected card action buttons are enabled.
3. Clicking a non-selected card selects it and enables its buttons.
4. Checkboxes still work on non-selected cards.
5. Note/history icons still work on non-selected cards.
6. Disabled reject/lost reason buttons do not open confirmations.
7. Bulk actions still work.

## Success Criteria

- Muted company cards cannot be actioned directly.
- The user must select a card before using its workflow decision buttons.
- Selection, notes, history, and bulk selection remain fast and usable.
