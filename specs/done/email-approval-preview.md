# Email Approval Preview Plan

## Problem Statement

When a lead is in the `Email approval` stage, the user needs to see the actual email being approved. The current detail panel shows lead details and generic actions only. Add a concise email preview with To, From, Subject, Body, and mock scheduling links so the approval decision can be made at a glance.

This remains a Phase I UI-only prototype. Do not build real email sending, calendar scheduling, call scheduling, backend persistence, or integrations.

## Current Repository Context

- `src/App.tsx` owns all mock data, workflow state, selected lead state, and actions.
- `LeadDetailPanel` renders the right-side selected lead details and primary action.
- `workflowConfig.email` already represents the `Email approval` stage with `status: 'ready-for-email'` and `primaryLabel: 'Approve email'`.
- `src/styles.css` contains all app styling.
- The current top-right status pills already include icons.

## Objectives

1. Show an email approval preview only when the selected lead is in `ready-for-email`.
2. Include clear `To`, `From`, `Subject`, and `Body` fields.
3. Use the requested subject direction: `Cleaning not where you want it to be`.
4. Use the requested body direction with the lead contact and a live-person message about John Doe.
5. Offer three call scheduling choices inside the email body:
   - `Day 1 Time 1` with a made up Day 1 Time 1
   - `Day 2 Time 2` with a made up Day 2 Time 2
   - `Ask John to call me`
6. For `Ask John to call me`, provide a text input for when to call with placeholder guidance such as `between 2pm and 5pm on Wednesday`.
7. Links should be mock-only and indicate a scheduled call for now.
8. Keep the UI terse, readable, and decision-oriented.

## Technical Approach

Add a small email draft model and a dedicated `EmailApprovalPreview` component. Render it in `LeadDetailPanel` only when `lead.status === 'ready-for-email'`.

Do not change workflow routing or status transitions. The existing `Approve email` primary action should still move the lead to `needs-call`.

## Data Model Changes

Add optional email-draft fields to `Lead` or derive the draft from the lead. Prefer deriving the draft to avoid repeating mock text across every lead:

```ts
const senderName = 'John Doe';
const senderEmail = 'john@janitorialleadgen.example';

function getEmailDraft(lead: Lead) {
  return {
    to: `${lead.contactName} <${lead.email}>`,
    from: `${senderName} <${senderEmail}>`,
    subject: 'Cleaning not where you want it to be?',
    body: [
      `Hi ${lead.contactName},`,
      `You have so much on your plate as a small business it's hard to do the research to find an outstanding cleaning service.`,
      `${senderName} is a live person who would be interested to hear how you're managing your cleaning now.`,
    ],
    slots: ['Day 1 Time 1', 'Day 2 Time 2'],
  };
}
```

Keep the user-requested wording close, but use punctuation and line breaks that read naturally in the preview.

## Component Plan

### Update `LeadDetailPanel`

Add an `isEmailApproval` check:

```tsx
const isEmailApproval = lead.status === 'ready-for-email';
```

Render the preview between the next-action card and the action buttons:

```tsx
{isEmailApproval ? <EmailApprovalPreview lead={lead} /> : null}
```

This keeps the approval button visible near the preview without hiding the rest of the lead context.

### Add `EmailApprovalPreview`

Create a component in `src/App.tsx`:

```tsx
function EmailApprovalPreview({ lead }: { lead: Lead }) {
  const [customWindow, setCustomWindow] = useState('');
  const draft = getEmailDraft(lead);
  const scheduleMessage = (label: string) => {
    window.alert(`Scheduled call selected: ${label}`);
  };

  return (
    <section className="email-preview" aria-label="Email draft for approval">
      ...
    </section>
  );
}
```

Use local state only for the custom callback window. This is UI-only state and should not be saved.

Because `EmailApprovalPreview` uses `useState`, it can live in the same file using the existing React import.

### Email Preview Content

Render fields:

- `To`: lead contact and lead email
- `From`: `John Doe <john@janitorialleadgen.example>`
- `Subject`: `Cleaning not where you want it to be?`
- `Body`: concise paragraphs with requested content

Render scheduling choices as inline link-style buttons:

```tsx
<button type="button" className="schedule-link" onClick={() => scheduleMessage('Day 1 Time 1')}>
  Day 1 Time 1
</button>
```

For custom callback:

```tsx
<label className="callback-field">
  <span>Ask John to call me</span>
  <input
    value={customWindow}
    onChange={(event) => setCustomWindow(event.target.value)}
    placeholder="between 2pm and 5pm on Wednesday"
  />
  <button
    type="button"
    className="schedule-link"
    onClick={() => scheduleMessage(customWindow || 'Ask John to call me')}
  >
    Use this time
  </button>
</label>
```

The link/button behavior should be visibly mock-only. Use alert text such as:

```ts
window.alert(`Mock scheduled call: ${label}`);
```

No calendar links, `mailto:` links, API calls, or external navigation.

## Styling Plan

Add styles in `src/styles.css`:

- `.email-preview`: bordered white/neutral section, not visually louder than the primary approve button.
- `.email-meta`: compact grid or stacked rows for To/From/Subject.
- `.email-body`: readable but compact body copy.
- `.schedule-options`: small grouped links/buttons.
- `.schedule-link`: button styled like a link using brand color, with clear focus state.
- `.callback-field`: small stacked control with hint-style placeholder.

Keep the preview dense enough to scan quickly. Avoid large cards inside cards. The detail panel is already a framed panel, so the email preview should feel like a contained document section rather than a decorative card.

## Edge Cases

- If a non-email-stage lead is selected while the Email approval queue is active, the preview should depend on `lead.status`, not just the selected workflow.
- If the custom callback input is empty, clicking its mock link should still show a clear mock message.
- Long email addresses should wrap without breaking the detail panel.
- Scheduling links must not navigate away from the prototype.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Select the `Email` status in the top-right header.
2. Confirm the selected lead detail panel shows the email preview.
3. Confirm To, From, Subject, and Body are visible.
4. Confirm the body mentions John Doe as a live person.
5. Click `Day 1 Time 1` and confirm a mock scheduled-call indication appears.
6. Click `Day 2 Time 2` and confirm a mock scheduled-call indication appears.
7. Enter a custom callback window such as `between 2pm and 5pm on Wednesday`; click the mock link and confirm the indication uses that value.
8. Approve the email and confirm the lead moves to `Calls to make`.
9. Confirm non-email stages do not show the email preview.

## Success Criteria

- Email approval leads show the exact email being approved.
- The preview includes To, From, Subject, Body, and three scheduling options.
- The custom callback option has an input with helpful placeholder guidance.
- All scheduling actions are mock-only and clearly indicate a scheduled call for now.
- The approval workflow remains fast and unchanged.
