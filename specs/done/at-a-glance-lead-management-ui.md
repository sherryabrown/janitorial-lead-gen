# At-a-Glance Lead Management UI Plan

## Problem Statement

Build a Phase I UI-only prototype for a janitorial lead-generation product that helps a small-business owner quickly decide what to do with leads. The UI must support these workflows without treating them as isolated pages:

- Vetting approval, single and bulk
- Email approval, single and bulk
- Calls to make, single and bulk
- Follow up needed

Queues should be entry points into the same lead workspace. After each action, the app should preserve context and expose the next logical action with minimal navigation.

## Current Repository Context

- The app is a Vite + React + TypeScript project.
- `src/main.tsx` imports `./App` and `./styles.css`.
- `src/App.tsx` and `src/styles.css` are currently missing and should be created.
- `lucide-react` is available and should be used for UI icons.
- This is a UI-only prototype. Do not add backend services, real email/calling integrations, persistence, maps, geocoding, enrichment, or API clients.

## Objectives

1. Create a complete single-screen lead management prototype.
2. Use mock janitorial lead data in or near Little Rock, AR.
3. Make workflow queues usable as filters/entry points, not hard page boundaries.
4. Support single lead actions and bulk actions for vetting, email approval, calls, and follow-up.
5. Keep information terse and scannable for at-a-glance decisions.
6. Establish a reusable visual system using `#FF914D` strategically.

## Technical Approach

Create a self-contained React app in `src/App.tsx` with local component state and typed mock data. Use `src/styles.css` for a polished, reusable visual system.

Recommended layout:

- Top summary bar: product name, concise queue counts, and current selected workflow.
- Left workflow rail: compact queue buttons for `Needs vetting`, `Email approval`, `Calls to make`, `Follow up`.
- Main lead table/list: dense, readable rows with checkboxes, priority signal, company, location, fit reason, next action, and last touch.
- Right detail/action panel: selected lead context, single-lead primary action, secondary actions, brief history, and suggested next logical action.
- Bulk action bar: appears when one or more leads are selected and offers only actions that make sense for the current selection.

Do not create a marketing landing page. The first viewport should be the actual management workspace.

## Data Model

Use local mock data similar to:

```ts
type Workflow = 'vetting' | 'email' | 'call' | 'follow-up';

type LeadStatus =
  | 'needs-vetting'
  | 'ready-for-email'
  | 'needs-call'
  | 'follow-up-needed'
  | 'qualified'
  | 'dismissed';

type Lead = {
  id: string;
  businessName: string;
  category: string;
  location: string;
  distance: string;
  contactName: string;
  phone: string;
  email: string;
  estimatedSqFt: string;
  fit: 'High' | 'Medium' | 'Low';
  status: LeadStatus;
  nextAction: string;
  reason: string;
  lastTouch: string;
  history: string[];
  selected?: boolean;
};
```

Mock locations should stay in or near Little Rock, AR. Example areas:

- Downtown Little Rock
- Riverdale
- North Little Rock
- Maumelle
- Bryant
- Sherwood
- Conway
- Benton

Example lead types:

- Medical office
- Daycare
- Small law office
- Fitness studio
- Dental clinic
- Church office
- Property management office
- Retail showroom

## Workflow Behavior

### Queue Entry Points

Queue buttons filter the shared lead list by current workflow status:

- `Needs vetting`: `status === 'needs-vetting'`
- `Email approval`: `status === 'ready-for-email'`
- `Calls to make`: `status === 'needs-call'`
- `Follow up`: `status === 'follow-up-needed'`

Changing queues should not reset the overall app or navigate away. It should update the current filtered list and select the first relevant lead if the previous selected lead is no longer visible.

### Single Actions

In the detail panel, expose one clear primary action based on selected lead status:

- Needs vetting: `Approve lead`
- Ready for email: `Approve email`
- Needs call: `Mark call complete`
- Follow-up needed: `Log follow-up`

Secondary actions can include:

- `Dismiss`
- `Needs call`
- `Follow up later`

After a single action:

- Update the lead's status locally.
- Append a short history line.
- Keep the user in the same workspace.
- Move selection to the next lead in the current queue when available.
- If no leads remain in that queue, show a compact empty state with the next recommended queue.

Suggested status transitions:

```ts
const nextStatusByAction = {
  approveVetting: 'ready-for-email',
  approveEmail: 'needs-call',
  completeCall: 'follow-up-needed',
  logFollowUp: 'qualified',
  dismiss: 'dismissed',
  needsCall: 'needs-call',
  followUpLater: 'follow-up-needed',
} as const;
```

### Bulk Actions

When leads are selected, show a sticky bulk action bar above or below the table:

- Selected count
- Primary bulk action for the current queue
- Secondary bulk action such as `Dismiss selected` or `Move to follow-up`
- `Clear selection`

Bulk action labels should be specific:

- `Approve 5 leads`
- `Approve 3 emails`
- `Mark 4 calls complete`
- `Log 2 follow-ups`

After a bulk action:

- Update all selected leads locally.
- Clear selection.
- Keep the current queue active.
- Show the next visible lead or a short empty state with the next best queue.
- Show a small, non-intrusive confirmation message such as `5 leads moved to Email approval`.

## Visual System

Use a clean neutral foundation:

- Background: warm off-white or very light neutral
- Surfaces: white
- Text: near-black neutral
- Borders: light neutral gray
- Muted text: medium gray
- Brand: `#FF914D`

Use orange only for:

- Primary action button
- Active queue state
- Selected row accent
- Important count or focus indicator

Avoid:

- Heavy gradients
- Futuristic AI visuals
- Enterprise CRM density
- Excess badges
- Orange-dominated screens
- Nested card layouts

Suggested CSS tokens:

```css
:root {
  --brand: #ff914d;
  --brand-strong: #e36f2d;
  --bg: #f8f6f3;
  --surface: #ffffff;
  --text: #24211f;
  --muted: #746d67;
  --border: #e6dfd8;
  --soft: #fff2ea;
  --success: #277a4b;
  --danger: #b42318;
}
```

## Component Plan

Implement in `src/App.tsx`:

- `mockLeads`: typed local data array.
- `workflowConfig`: labels, icons, filters, primary action labels, empty-state copy.
- `App`: owns selected workflow, leads, selected lead ID, checked lead IDs, and confirmation message.
- `QueueRail`: queue entry points with counts.
- `LeadTable`: compact scannable lead rows with checkbox support.
- `LeadDetailPanel`: selected lead details, primary action, secondary actions, history, and next action.
- `BulkActionBar`: contextual bulk controls.
- `EmptyQueueState`: compact next-step prompt when a queue is clear.

Keep the implementation simple. Avoid routing and global state libraries.

## Interaction Details

- Clicking a row selects the lead and keeps the queue context.
- Checkboxes support bulk selection without opening a separate bulk page.
- `Select visible` should select only the currently filtered queue.
- Primary action should be visually dominant; secondary actions should be subdued.
- History should be lower hierarchy than the next action.
- Use short, concrete text throughout:
  - `Good fit`
  - `Owner listed`
  - `Call today`
  - `No website form`
  - `Near current route`

## Responsive Behavior

Desktop:

- Three-column workspace: queue rail, lead list, detail panel.
- Bulk action bar remains visible near the list when selections exist.

Tablet/mobile:

- Stack queue buttons horizontally.
- Lead list appears first.
- Detail panel follows selected lead.
- Keep primary action reachable without excessive scrolling.

## Accessibility

- Use real `button` elements for actions.
- Label checkboxes clearly with lead/business names.
- Maintain readable contrast, especially for orange buttons.
- Provide visible focus states.
- Do not rely on color alone for status; pair color with text.

## Testing Strategy

Run:

```bash
npm run build
npm run lint
```

Manual checks:

1. App loads without missing module errors.
2. Each workflow queue shows the expected mock leads.
3. Single primary actions move leads to the next status.
4. Bulk actions update all selected leads and clear selection.
5. Selection moves to the next logical lead after an action.
6. Empty queue state suggests the next useful queue.
7. Mock data locations are in or near Little Rock, AR.
8. Orange is used strategically and the screen is not visually dominated by it.
9. Layout remains usable on desktop and narrow mobile widths.

## Success Criteria

- A user can open the prototype and immediately see what needs attention.
- Vetting approval, email approval, calls, and follow-up are all supported in single and bulk flows.
- The user never has to navigate to separate pages to continue the workflow.
- After each action, the next logical action is visible.
- The implementation remains UI-only with local mock data.
- The visual system feels modern, clean, warm, and small-business appropriate.
