# Simplify Duplicate Actions and Lost Reasons Plan

## Recommendation

The duplicated action buttons are adding friction and visual noise.

For this prototype, the main company card should be the place for fast decisions because the user is scanning a queue. The right-hand panel should be for deeper context:

- Email view: review/edit the email draft.
- Vetting, Calls, Follow up: write notes or inspect history.

That means `Approve email` should not appear in both places at equal weight. Likewise, `Follow up`, `Won`, and all lost reasons should not appear in both the main card and the right-hand note panel unless the user has explicitly opened a decision surface there.

For lost reasons, use a two-step pattern:

1. User clicks `Lost`.
2. Reason choices appear: `Too small`, `No budget`, `Has provider`, `Bad fit`, `Not interested`.

This is better than showing every lost reason all the time. It reduces clutter, keeps close/lost actions from competing with primary actions, and adds a light safety step before a final/disqualifying action.

## Current Repository Context

- `src/App.tsx` contains `LeadCardActions`, `ContextPanel`, `NotePanel`, `OpportunityActions`, and `EmailApprovalPreview`.
- `Approve email` currently appears:
  - In `LeadCardActions` for the Email workflow.
  - In `EmailApprovalPreview` in the right-hand panel.
- `Follow up`, `Won`, and lost reasons currently appear:
  - In `LeadCardActions` for Calls and Follow up.
  - In `OpportunityActions` inside the right-hand note panel.
- Lost reasons are currently always visible as compact reason buttons.
- `src/styles.css` already has `.quick-close-actions`, `.lead-card-actions`, and context panel styles.

## Objectives

1. Keep fast queue decisions on the main company cards.
2. Remove duplicated action buttons from the right panel.
3. Keep the Email right panel focused on reviewing/editing the email draft.
4. Present lost reasons behind a `Lost` button instead of always showing every reason.
5. Preserve confirmation for final close/reject actions.
6. Keep the interface quick to scan and not overcrowded.

## Interaction Decisions

### Email View

Main company card:

- Keep `Approve email`
- Keep `Reject lead`

Right-hand email panel:

- Keep `Email to approve`
- Keep `Edit`
- Keep `Save` while editing
- Remove right-panel `Approve email`

Reasoning: approving from the card supports fast queue work. The right panel should help inspect/edit the email. If the user wants to approve, the card action remains visible beside the company row.

### Calls View

Main company card:

- Keep `Follow up`
- Keep `Won`
- Replace always-visible lost reasons with `Lost`
- On `Lost`, show reason choices for that card

Right-hand note panel:

- Remove duplicate `Follow up`, `Won`, and lost reasons.
- Keep notes and history access only.

### Follow Up View

Use the same pattern as Calls:

- Card: `Follow up`, `Won`, `Lost`
- Expanded lost reasons after clicking `Lost`
- Right panel: notes/history only

## Technical Approach

### Phase 1: Adjust Card Actions

In `src/App.tsx`, update `LeadCardActions`:

1. Add local state to track whether lost reasons are expanded for that card:

```ts
const [showLostReasons, setShowLostReasons] = useState(false);
```

2. For Calls and Follow up, render:

```tsx
<button className="secondary-button compact" onClick={() => act('followUp')} type="button">
  Follow up
</button>
<button className="primary-button compact" onClick={() => act('won')} type="button">
  Won
</button>
<button className="danger-button compact" onClick={() => setShowLostReasons((value) => !value)} type="button">
  Lost
</button>
{showLostReasons ? (
  <div className="quick-close-actions" aria-label="Lost reasons">
    ...
  </div>
) : null}
```

3. Keep existing confirmation behavior in `applyAction` for close reasons.
4. Optionally reset `showLostReasons` after a reason is clicked.

### Phase 2: Simplify Right-Hand Panels

In `ContextPanel` / `NotePanel`:

1. Remove `showOpportunityActions`.
2. Remove the `OpportunityActions` component or leave it unused only if lint allows; prefer deleting it.
3. Remove `onAction` from `NotePanel` if it is no longer needed.
4. Keep `NotePanel` focused on:
   - Business name
   - Note textarea
   - `Save note`
   - `History`
   - Latest notes

In `EmailApprovalPreview`:

1. Remove the `onApprove` prop.
2. Remove the right-panel `Approve email` button.
3. Keep `Edit` and `Save`.
4. Rename `.email-panel-actions` if needed to reflect edit-only controls, or keep the class if it still fits.

### Phase 3: CSS Cleanup

In `src/styles.css`:

1. Ensure `.lead-card-actions` can accommodate the new `Lost` button.
2. Style expanded `.quick-close-actions` as a secondary row beneath card actions.
3. Remove unused `.opportunity-actions` / `.opportunity-main-actions` styles if `OpportunityActions` is deleted.
4. Adjust `.email-panel-actions` so edit/save does not imply there is a primary approval action inside the email panel.

## Edge Cases

- Clicking `Lost` should not immediately close the lead.
- Clicking a lost reason should still show the existing confirmation.
- Lost reasons should not remain visible for a lead after it is removed from the queue.
- Email approval should still work from the main card.
- Bulk email approval should still work from the bulk bar.
- Note saving and history mode should continue working unchanged.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Email view cards still show `Approve email` and `Reject lead`.
2. Email right panel no longer shows `Approve email`.
3. Email right panel still supports `Edit` and `Save`.
4. Calls cards show `Follow up`, `Won`, and `Lost`.
5. Follow up cards show `Follow up`, `Won`, and `Lost`.
6. Clicking `Lost` reveals reason choices.
7. Clicking a lost reason asks for confirmation and then removes the lead from the queue.
8. Calls/Follow up right panels no longer duplicate opportunity action buttons.
9. Note and history flows still work.

## Success Criteria

- There is one clear place for fast queue decisions: the main company card.
- The right panel is context-only: email editing, notes, or history.
- Lost reasons are hidden until the user chooses `Lost`.
- The UI is easier to scan and less crowded without removing needed workflow actions.
