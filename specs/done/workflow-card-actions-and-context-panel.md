# Workflow Card Actions and Context Panel Plan

## Problem Statement

The current lead detail panel is too generic. For Vetting, Calls, and Follow up, the right-hand panel should no longer repeat basic lead information. It should instead support the selected task context: notes, history, and opportunity close actions. For Email approval, the right-hand panel should focus only on the email being reviewed and managed.

The main company cards should carry the fast decision controls and contact information so each workflow can be handled with fewer clicks.

This remains a Phase I UI-only prototype. Do not add real integrations, email sending, calendar scheduling, calling, persistence, or backend APIs.

## Current Repository Context

- `src/App.tsx` contains all React components, local state, workflow actions, mock leads, and email preview logic.
- `src/styles.css` contains all visual styling.
- The current right-hand `LeadDetailPanel` includes lead header, contact details, next-action card, actions, conditional email preview, and history.
- `LeadTable` currently renders compact lead cards/rows with company info, reason, next action, and last touch.
- `EmailApprovalPreview` already renders To, From, Subject, Body, mock scheduling choices, custom callback input, and mock scheduled-call feedback.

## Objectives

1. Move workflow-specific primary actions onto each main company card.
2. Replace the reason/next-action area on main cards with contact name + phone and email.
3. Add note and history affordances on main cards.
4. Show latest note along the bottom of the company card when present.
5. Show added date and time, not just relative wording.
6. Convert the right-hand panel into a context panel:
   - Email: only email approval/management content.
   - Vetting: note editor or history for the selected lead.
   - Calls: note editor/history plus opportunity actions.
   - Follow up: note editor/history plus opportunity actions.
7. Add reject/close confirmations where destructive or final.
8. Keep the UI short, scannable, warm, and not overcrowded.

## Data Model Changes

Replace the `history: string[]` field with typed entries, or introduce helper conversion if minimizing changes. Prefer typed entries:

```ts
type LeadHistoryItem = {
  id: string;
  at: string;
  label: string;
  detail?: string;
  type: 'status' | 'note' | 'system';
};

type LeadNote = {
  id: string;
  at: string;
  text: string;
};

type Lead = {
  ...
  addedAt: string;
  notes: LeadNote[];
  history: LeadHistoryItem[];
};
```

Use simple local display strings for this prototype:

- `Today, 9:18 AM`
- `Yesterday, 3:42 PM`
- `Mon, 11:05 AM`

No date library is needed.

## Action Model

Extend `LeadAction` and transitions to support the requested card buttons and close reasons:

```ts
type LeadAction =
  | 'approveVetting'
  | 'approveVettingAndReviewEmail'
  | 'approveEmail'
  | 'rejectLead'
  | 'followUp'
  | 'won'
  | 'closedTooSmall'
  | 'closedNoBudget'
  | 'closedHasProvider'
  | 'closedBadFit'
  | 'closedNotInterested';
```

Status mapping:

- `approveVetting` -> `ready-for-email`
- `approveVettingAndReviewEmail` -> `ready-for-email` and switch active workflow to `email`
- `approveEmail` -> `needs-call`
- `rejectLead` -> `dismissed` after confirmation
- `followUp` -> `follow-up-needed`
- `won` -> `qualified`
- close reasons -> `dismissed`

For UI-only history, append entries such as:

- `Lead approved`
- `Email approved`
- `Follow-up set`
- `Won`
- `Closed: No budget`
- `Note added`

## Main Company Card Plan

Update `LeadTable` into a richer but still compact card list. Keep the list dense and avoid excessive badges.

Each card should show:

- Checkbox
- Fit dot
- Business name
- Category, location, distance
- Estimated size
- Contact line: `{contactName} · {phone}`
- Email line: `{email}`
- Added date/time: `Added Today, 9:18 AM`
- Latest note row if present
- Small icon button to add note, using `Pencil` from `lucide-react`
- Small icon/button to show history, using `History` from `lucide-react`
- Workflow-specific action buttons on the right

Replace the old area currently showing `reason` and `nextAction` with contact info.

### Vetting Card Actions

Buttons:

- `Approve lead`
- `Approve + review email`
- `Reject lead`

`Reject lead` must use `window.confirm(...)` before applying the dismissal.

### Email Card Actions

Buttons:

- `Approve email`
- `Reject lead`

Per clarification, do not include `Approve email and vet` or `Approve email and call`.

### Calls Card Actions

Buttons or compact menu-style actions:

- `Follow up`
- `Won`
- Close/lost reason options:
  - `Too small`
  - `No budget`
  - `Has provider`
  - `Bad fit`
  - `Not interested`

The quick why options can be shown as a compact row/dropdown-style group, but no external menu library is needed.

### Follow Up Card Actions

Use the same opportunity actions as Calls:

- `Follow up`
- `Won`
- close/lost reasons listed above

Do not use `Approve lead` or `Approve lead and review email` on Follow up.

## Right-Hand Context Panel Plan

Introduce a panel mode:

```ts
type ContextPanelMode = 'note' | 'history' | 'email';
```

State:

```ts
const [contextMode, setContextMode] = useState<ContextPanelMode>('note');
```

Behavior:

- Clicking note pencil on a company card selects that lead and opens `note` mode.
- Clicking history on a company card selects that lead and opens `history` mode.
- Selecting the Email workflow should default the panel to `email`.
- Selecting Vetting, Calls, or Follow up should default the panel to `note`, unless the user clicked history.
- After adding a note, keep context and show the new latest note on the company card.

### Email Right Panel

For `ready-for-email` leads, show only:

- `EmailApprovalPreview`
- `Approve email`
- `Edit`
- `Save` when editing

Remove from the Email right panel:

- Selected lead header
- Fit label
- Contact detail grid
- Next action card
- Secondary action buttons
- Generic history block

`Edit` can toggle the preview into editable form fields for To, From, Subject, and Body, but it does not need to persist beyond local component state. If implementation time is short, allow editing in local state inside `EmailApprovalPreview` and show `Save` as a no-op that exits edit mode.

Update the schedule slots from generic day labels to full mock labels:

- `Tue, Sep 1, 10:00 AM`
- `Wed, Sep 2, 2:30 PM`

### Note Right Panel

For Vetting, Calls, and Follow up, show only:

- A compact header with selected business name
- A textarea for note entry
- `Save note` button
- Latest existing notes, if any

No generic contact details or next-action card.

When saving:

- Ignore blank notes.
- Add a note with current display time string such as `Just now`.
- Add a history item `Note added`.
- Clear the textarea.
- Keep the selected lead and current workflow.

### History Right Panel

When history mode is selected:

- Show selected business name
- Show chronological history with date/time beside each status change and note
- Include note text in history rows where relevant

No action buttons are required in history mode except a subdued `Add note` button to return to note mode.

### Calls and Follow Up Right Panel Actions

For Calls and Follow up, include opportunity buttons in the note panel:

- `Follow up`
- `Won`
- Quick close reasons: `Too small`, `No budget`, `Has provider`, `Bad fit`, `Not interested`

These may duplicate card-level actions intentionally, because the right panel is the deeper context surface for note-taking while acting.

## Bulk Actions

Keep existing bulk actions working, but update labels only if needed:

- Vetting: approve selected leads
- Email: approve selected emails
- Calls: mark selected as follow-up or won if simple to support
- Follow up: mark selected won or close if simple to support

Do not let bulk behavior block this plan. The main requested changes are single-card actions and the right-hand context panel.

## Styling Plan

In `src/styles.css`:

1. Expand lead rows into action-capable cards while preserving compact scan density.
2. Add `.lead-contact`, `.lead-card-actions`, `.lead-utility-actions`, `.latest-note`, and `.note-button` styles.
3. Keep card action buttons visually hierarchical:
   - Primary: approve/won
   - Secondary: review email/follow up
   - Danger/subdued: reject/close reason
4. Add `.context-panel`, `.note-panel`, `.history-panel`, `.history-row`, and `.quick-close-actions`.
5. For Email, make the right panel look like a document approval surface, not a generic CRM card.
6. Keep responsive behavior:
   - Desktop: lead list and context panel.
   - Mobile: lead card actions wrap below lead details; right panel follows the list.

## Edge Cases

- Rejecting or closing a lead should remove it from the current workflow after confirmation.
- If an action removes the selected lead from the current queue, select the next visible lead.
- If there are no more visible leads, show the existing empty state.
- Notes should not be added if textarea is blank or whitespace.
- Long notes should clamp or wrap cleanly on cards; show full content in the right panel/history.
- Long emails and phone/name lines should wrap or truncate without overlapping action buttons.
- Email editing should not imply real persistence or sending.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Vetting cards show contact name/phone and email instead of reason/next action.
2. Vetting cards have `Approve lead`, `Approve + review email`, and confirmed `Reject lead`.
3. Email cards show contact info and only `Approve email` plus confirmed `Reject lead`.
4. Email right panel shows only the email approval surface and email actions.
5. Email scheduling links show full mock date/time labels.
6. Calls cards show contact info and opportunity actions.
7. Follow up cards show contact info and opportunity actions, not vetting approval buttons.
8. Clicking pencil opens note mode in the right panel.
9. Saving a note shows it across the bottom of the company card.
10. Clicking history opens date/time history in the right panel.
11. Status changes and notes appear in history with date/time.
12. Lint and build pass.

## Success Criteria

- The main cards support the stage-specific decisions directly.
- The right panel changes purpose by workflow and user intent.
- Email approval has a focused email management panel with edit/save and approve.
- Vetting, Calls, and Follow up use the right panel for notes/history instead of generic lead details.
- Notes and history are visible enough to support fast decisions without adding navigation.
