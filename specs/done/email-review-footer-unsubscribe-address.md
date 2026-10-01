# Email Review Footer Unsubscribe Address Plan

## Problem Statement

The email shown for review should include a basic footer with `Unsubscribe`, `Contact Us`, and the physical mailing address `123 Main St Little Rock, AR 72221`. This is a Phase I UI-only prototype, so the footer must be display-only/mock-only and must not introduce real unsubscribe handling, contact routing, email delivery, CRM behavior, tracking, or integrations.

## Current Repository Context

- `src/App.tsx` owns the mock lead data, workflow state, email draft generation, and the `EmailApprovalPreview` component.
- `getEmailDraft(contactName, email)` starts around `src/App.tsx:439` and currently returns `to`, `from`, `subject`, `body`, and `slots`.
- `EmailApprovalPreview` starts around `src/App.tsx:1052` and renders the reviewed email in the right-side panel for leads in the `ready-for-email` status.
- The reviewed email body renders from `editableDraft.body`; scheduling controls and callback input are separate UI elements below the body copy.
- `src/styles.css` contains the related `.email-preview`, `.email-body`, `.schedule-*`, `.callback-field`, `.scheduled-note`, and `.email-panel-actions` styles.

## Objectives

1. Add a footer to the email being reviewed.
2. Include an `Unsubscribe` item in the footer.
3. Include a `Contact Us` item in the footer.
4. Include the physical address exactly as: `123 Main St Little Rock, AR 72221`.
5. Keep the footer visually subordinate to the email body and scheduling actions.
6. Preserve the existing edit/review behavior without building real unsubscribe or contact functionality.
7. Keep the UI concise and consistent with the current warm, small-business-oriented visual system.

## Technical Approach

Add footer data to the derived email draft and render it as a dedicated footer block inside `EmailApprovalPreview`. Prefer a structured draft field over hard-coding footer text directly in JSX so the footer remains part of the reviewed email model.

Because the current body editor only edits `editableDraft.body`, keep the footer separate and stable in this small change. That avoids making the edit form broader than requested while still ensuring every reviewed email visibly includes the required footer.

## Implementation Steps

1. Update `getEmailDraft` in `src/App.tsx`.
   - Add a `footer` object or fields:

   ```ts
   footer: {
     unsubscribeLabel: 'Unsubscribe',
     contactUs: 'Contact Us',
     address: '123 Main St Little Rock, AR 72221',
   },
   ```

   - Keep the address in or near Little Rock as required by the project instructions.

2. Update `EmailApprovalPreview` in `src/App.tsx`.
   - Render a footer block after the body/scheduling controls and before `scheduledCall` or panel actions.
   - Use a semantic but simple structure such as:

   ```tsx
   <footer className="email-footer" aria-label="Email footer">
     <div className="email-footer-links">
       <button className="email-footer-link" type="button">
         {draft.footer.unsubscribeLabel}
       </button>
       <button className="email-footer-link" type="button">
         {draft.footer.contactUs}
       </button>
     </div>
     <span>{draft.footer.address}</span>
   </footer>
   ```

   - Make both footer controls mock-only. They should not navigate, call an API, or open a real mail client.
   - If useful for prototype clarity, clicking either footer control can set the existing `scheduledCall`-style status text or a new local status such as `Mock unsubscribe link` or `Mock contact link` rather than using `window.alert`.

3. Preserve edit mode behavior.
   - When `isEditing` is true, leave the footer visible below the editable body textarea.
   - Do not add footer fields to `editableDraft` unless the product explicitly needs footer editing later.
   - Confirm switching leads still resets the editable draft correctly through the existing `useEffect`.

4. Add styles in `src/styles.css`.
   - Add `.email-footer` near the existing email preview styles.
   - Keep it compact, muted, and separated from the main body with a subtle border:

   ```css
   .email-footer {
     display: grid;
     gap: 4px;
     padding-top: 10px;
     border-top: 1px solid var(--border);
     color: var(--muted);
     font-size: 0.78rem;
   }

   .email-footer-links {
     display: flex;
     flex-wrap: wrap;
     gap: 8px;
   }

   .email-footer-link {
     min-height: 0;
     padding: 0;
     border: 0;
     background: transparent;
     color: var(--brand-strong);
     font: inherit;
     font-weight: 800;
     text-decoration: underline;
     text-underline-offset: 3px;
     text-transform: lowercase;
   }
   ```

   - Ensure the address wraps cleanly on narrow screens.

## Edge Cases

- Long edited email body text should not visually merge with the footer.
- The footer should stay visible in both read and edit modes.
- The unsubscribe and Contact Us items should be clearly non-primary and should not compete with `Approve email`.
- The unsubscribe item must not perform real unsubscribe behavior in this prototype.
- The Contact Us item must not perform real contact, email, or support routing behavior in this prototype.
- The address should remain exactly `123 Main St Little Rock, AR 72221`.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Open the Email approval queue.
2. Confirm the right-side reviewed email shows the unsubscribe item.
3. Confirm the right-side reviewed email shows the Contact Us item.
4. Confirm the footer shows `123 Main St Little Rock, AR 72221`.
5. Toggle edit mode and confirm the footer remains visible.
6. Select another email lead and confirm the footer is still present.
7. Confirm clicking unsubscribe, if interactive, only produces mock UI feedback and does not navigate.
8. Confirm clicking Contact Us, if interactive, only produces mock UI feedback and does not navigate.
9. Confirm the primary approval action remains the most prominent action.

## Success Criteria

- Every reviewed email draft includes `Unsubscribe`.
- Every reviewed email draft includes `Contact Us`.
- Every reviewed email draft includes `123 Main St Little Rock, AR 72221`.
- The footer is compact, readable, and visually subordinate.
- No real integrations, unsubscribe behavior, or contact routing are added.
- Existing email approval flow and mock scheduling behavior remain unchanged.
