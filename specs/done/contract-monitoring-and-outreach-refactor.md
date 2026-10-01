# Contract Monitoring and Outreach Refactor Plan

## Problem Statement

The current UI prototype assumes one linear company outreach workflow: approve lead, approve email, call, then follow up. The product direction now has two lead sources with different workflows:

- Contract monitoring for government, school, municipality, county, city, and similar bid opportunities.
- Companies to contact directly, where email may be unavailable and the workflow may continue with a call.

The prototype should introduce contract monitoring and refactor company outreach so queues remain entry points into a shared work surface, not workflow silos. This remains UI-only. Do not add bid-site integrations, scraping, APIs, email sending, calling, persistence, databases, or background jobs.

## Current Repository Context

- The app is a Vite + React + TypeScript prototype.
- `src/App.tsx` contains all mock data, local state, status transitions, filters, lead cards, right-side context panels, note/history behavior, and mock email preview.
- `src/styles.css` contains the reusable visual system and responsive layout.
- Current data model is named around `Lead`, `Workflow`, and `LeadStatus`.
- Current workflow tabs are `Needs vetting`, `Email approval`, `Calls to make`, and `Follow up`.
- Current actions move leads between local statuses only and append local history.
- Existing mock locations are in or near Little Rock, AR and should stay that way.

## Objectives

1. Add a contract monitoring workspace with mock government, medical office, and school contract data.
2. Preserve company outreach, but refactor it away from a forced email-first path.
3. Make the default results view contract-focused and sorted by due date or expiration date.
4. Support contract opportunity statuses:
   - `new`
   - `interested`
   - `not interested`
   - `applied`
   - `won`
   - `lost`
   - `withdrew`
5. Support contract source maintenance as UI-only website records:
   - requested county, city, municipality, school, or agency
   - bid website URL or placeholder URL
   - last checked / needs update state
   - source category and location
6. Support company outreach statuses as broader categories:
   - open / new
   - ready to email only when email exists
   - needs call
   - in progress
   - closed
7. Make `follow up` a status inside `in progress`, not a top-level silo.
8. Provide a way to view closed opportunities for both contracts and company outreach.
9. Keep the interface terse, scan-friendly, warm, and appropriate for a small-business owner.

## Product Model

Use one top-level mode selector:

```ts
type WorkMode = 'contracts' | 'companies';
```

Contracts should be the default mode:

```ts
const [workMode, setWorkMode] = useState<WorkMode>('contracts');
```

Keep the app as one screen. The mode selector changes the dataset and controls shown in the same workspace shell.

## Contract Data Model

Introduce contract-focused types in `src/App.tsx`:

```ts
type ContractCategory = 'School' | 'Government' | 'Medical';

type ContractStatus =
  | 'new'
  | 'interested'
  | 'not-interested'
  | 'applied'
  | 'won'
  | 'lost'
  | 'withdrew';

type ContractDateType = 'due' | 'expiring';

type BidSource = {
  id: string;
  name: string;
  agencyType: 'County' | 'City' | 'Municipality' | 'School district' | 'Agency';
  location: string;
  category: ContractCategory;
  url: string;
  status: 'needs-review' | 'current';
  lastChecked: string;
};

type ContractOpportunity = {
  id: string;
  projectName: string;
  agencyName: string;
  category: ContractCategory;
  location: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  dateType: ContractDateType;
  date: string;
  dateLabel: string;
  estimatedValue?: string;
  status: ContractStatus;
  sourceId: string;
  summary: string;
  nextAction: string;
  notes: LeadNote[];
  history: LeadHistoryItem[];
};
```

For sorting, use ISO-like strings in `date` such as `2026-09-10` and display the shorter `dateLabel` in the UI.

Mock examples should stay around central Arkansas:

- Pulaski County Facilities
- Little Rock School District
- North Little Rock City Procurement
- Bryant Public Schools
- Saline County Courthouse
- UAMS / medical facilities category as mock medical opportunity

## Company Outreach Data Model

Refactor the existing `Lead` model into a company-oriented name, or keep `Lead` internally if that lowers implementation risk. Prefer clearer names if the edit is manageable:

```ts
type CompanyStatusCategory = 'new' | 'ready-to-email' | 'needs-call' | 'in-progress' | 'closed';

type CompanyProgressStatus =
  | 'waiting-on-customer'
  | 'follow-up-in-2-days'
  | 'follow-up-next-week'
  | 'quote-sent'
  | 'decision-pending';

type CompanyLead = {
  id: string;
  businessName: string;
  category: string;
  location: string;
  distance: string;
  contactName: string;
  phone: string;
  email?: string;
  estimatedSqFt: string;
  fit: Fit;
  statusCategory: CompanyStatusCategory;
  progressStatus?: CompanyProgressStatus;
  closedReason?: 'won' | 'lost' | 'not-interested' | 'too-small' | 'no-budget' | 'has-provider' | 'bad-fit';
  nextAction: string;
  reason: string;
  addedAt: string;
  notes: LeadNote[];
  history: LeadHistoryItem[];
};
```

Key behavior changes:

- A company without email can go directly from `new` to `needs-call`.
- A company with email can move to `ready-to-email`, but email approval should no longer be assumed for every lead.
- `follow up` becomes one of several `in-progress` statuses.
- Closed opportunities must be visible from a status-category filter.

## Information Architecture

Keep a single workspace:

- Topbar: `Janitorial leads`, headline, and a compact mode switch for `Contracts` and `Companies`.
- Summary strip: show status/category counts for the selected mode.
- Filter bar: concise filters relevant to the selected mode.
- Main results list: compact rows/cards for the selected mode.
- Right context panel: selected record detail, notes, history, and next action.

Do not add routing. Do not create a landing page.

## Contract Results View

Contracts should be the default result view. Sort by nearest `date` ascending.

Each contract row should show, at minimum:

- Project name
- Agency/source name
- Category: `School`, `Government`, or `Medical`
- Due or expiring date
- Location
- Contact name
- Current status
- Terse summary
- Next logical action

Required filters:

- Category
- Due or expiring date type
- Date range or quick date buckets
- Project name search
- Location search/filter
- Contact name search
- Status, including closed states

Implementation can start with simple local controls:

```ts
type ContractFilters = {
  category: 'All' | ContractCategory;
  dateType: 'All' | ContractDateType;
  dateBucket: 'All' | 'Next 7 days' | 'Next 30 days' | 'Expired/overdue';
  query: string;
  status: 'open' | 'closed' | ContractStatus;
};
```

Use one search input for project name, location, and contact name if that keeps the UI simpler. Label it clearly, for example `Search project, location, contact`.

## Contract Source Maintenance UI

Add a compact source section or panel in contract mode. It should not look like a separate integration setup flow.

Show source records with:

- Source name
- Agency type
- Project name
- Location
- Category
- Bid website URL as display text only
- Contact name, email, phone number
- Last checked
- Source status

Actions are UI-only local state changes:

- `Mark current`
- `Needs update`
- `Add note`

Suggested placement:

- In the right context panel, show a `Bid sources` tab or section when no contract is selected.
- Simpler option: show source status under selected contract detail by linking the opportunity to its mock source.
- Include a compact `Sources` button/toggle above the list if needed.

Do not implement real website fetching, scraping, polling, account auth, or upload.

## Contract Actions

For selected contract rows, provide stage-appropriate actions:

- `Interested` moves `new` or `not-interested` to `interested`.
- `Not interested` moves open contracts to `not-interested`.
- `Applied` moves `interested` to `applied`.
- `Won` moves `applied` to `won`.
- `Lost` moves `applied` or `interested` to `lost`.
- `Withdrew` moves `interested` or `applied` to `withdrew`.

After each action:

- Update local mock state.
- Append a history item.
- Preserve the active mode and filters.
- Select the next visible contract.
- If the selected filter becomes empty, show an empty state with the next logical action, such as `Review new contracts` or `Show closing/closed`.

Use confirmation for final negative actions:

- `Not interested`
- `Lost`
- `Withdrew`

## Company Outreach View

Update company queue labels to match the less-linear workflow:

- `New`
- `Ready to email`
- `Needs call`
- `In progress`
- `Closed`

For company cards:

- Show email only if available.
- If no email exists, show phone as the primary contact path and expose `Call` / `Move to call`.
- Keep note and history utilities.
- Show progress status for `in-progress`, for example `Waiting on customer` or `Follow up in 2 days`.
- Closed filter should show won/lost/not-interested and other close reasons.

Company actions:

- New with email: `Review email`, `Call`, `Close`
- New without email: `Call`, `In progress`, `Close`
- Ready to email: `Approve email`, `Call instead`, `Close`
- Needs call: `In progress`, `Won`, `Close`
- In progress: `Waiting on customer`, `Follow up`, `Won`, `Close`
- Closed: no primary mutation needed; show history and subdued `Reopen` only if simple

This is still a prototype, so button actions can simulate status changes locally.

## Component Plan

Refactor `src/App.tsx` into local components while keeping the single-file prototype if preferred:

- `App`: owns mode, datasets, selected IDs, filters, checked IDs, and context mode.
- `ModeSwitch`: switches between `Contracts` and `Companies`.
- `SummaryStrip`: renders status counts for current mode.
- `ContractFiltersBar`: category/date/query/status filters.
- `ContractList`: compact contract rows and row-level actions.
- `ContractContextPanel`: selected contract notes, history, source info, and next action.
- `BidSourcePanel` or `SourceSummary`: mock bid source maintenance controls.
- `CompanyFiltersBar`: status and optional search filters for outreach.
- `CompanyList`: existing lead-card pattern adapted to optional email and new statuses.
- `CompanyContextPanel`: notes/history/email preview when applicable.
- `BulkActionBar`: keep reusable but make labels mode-aware.
- `EmptyQueueState`: keep reusable with mode-specific next steps.

Avoid new global state libraries. Avoid new dependencies unless the existing code cannot reasonably support the UI with React state.

## Styling Plan

Keep the existing warm neutral visual system in `src/styles.css`:

- Continue using `#ff914d` for primary actions, selected rows, active mode/filter state, and focus accents.
- Keep white surfaces, light borders, warm off-white background, and restrained shadows.
- Avoid making every status a bright badge.
- Make contract rows denser than marketing cards and easy to scan in bulk.
- Use clear hierarchy:
  - Primary action: one prominent button.
  - Secondary actions: bordered neutral buttons.
  - Information: compact row text.
  - History/context: right panel, muted tone.

Likely CSS additions:

- `.mode-switch`
- `.filter-bar`
- `.contract-row`
- `.contract-meta`
- `.status-select`
- `.source-list`
- `.source-row`
- `.context-tabs` if tabs are used
- `.closed-state`

Responsive behavior:

- Desktop: results list plus sticky right context panel.
- Tablet/mobile: filters wrap, cards stack, context panel follows the list.
- Long project names, locations, contacts, and URLs must truncate or wrap without overlapping action buttons.

## Filtering and Sorting Implementation

Use `useMemo` for derived lists:

```ts
const visibleContracts = useMemo(() => {
  return contracts
    .filter((contract) => matchesContractFilters(contract, contractFilters))
    .sort((a, b) => a.date.localeCompare(b.date));
}, [contracts, contractFilters]);
```

Keep filter helpers pure and near the component:

```ts
function matchesContractFilters(contract: ContractOpportunity, filters: ContractFilters) {
  const query = filters.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    contract.projectName.toLowerCase().includes(query) ||
    contract.location.toLowerCase().includes(query) ||
    contract.contactName.toLowerCase().includes(query);

  return (
    matchesQuery &&
    (filters.category === 'All' || contract.category === filters.category) &&
    (filters.dateType === 'All' || contract.dateType === filters.dateType) &&
    matchesStatusFilter(contract.status, filters.status) &&
    matchesDateBucket(contract.date, filters.dateBucket)
  );
}
```

For the prototype, date buckets can be implemented with simple string comparisons against fixed mock dates, or by constructing `Date` objects from ISO strings. No date library is needed.

## Edge Cases

- Contracts missing email or phone should still display a contact name and not leave awkward blank separators.
- Company leads missing email should not enter the email approval-only queue.
- Closed filters should include all final statuses and close reasons.
- Applying an action that removes the current row from the visible list should select the next visible row.
- If filters hide all records, show a compact empty state and a clear filter action.
- Bulk selection should clear when switching mode.
- Bulk actions should only apply to visible records in the selected mode.
- Notes should ignore blank input.
- History entries should be appended for status changes and notes.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. App opens in `Contracts` mode by default.
2. Contract results are sorted by due/expiring date.
3. Contract filters work for category, due/expiring, date bucket, query, and status.
4. Contract rows show project name, location, contact, category, date, source/agency, status, and next action.
5. Contract status actions move records locally and append history.
6. Closed contract statuses remain visible through closed/status filters.
7. Bid source maintenance appears as UI-only mock data and has no real integration behavior.
8. Company mode no longer assumes every lead goes through email.
9. Company records without email can go straight to call.
10. `In progress` contains follow-up-like statuses such as waiting on customer and follow-up in X days.
11. Closed company opportunities can be viewed.
12. Notes and history still work in both modes.
13. Layout remains clean on desktop and mobile widths.
14. Mock location-related data is in or near Little Rock, AR.

## Success Criteria

- The prototype clearly presents the two lead sources: contract monitoring and company outreach.
- Contract monitoring is the default workspace and supports source maintenance, opportunity review, status management, and due/expiration-based sorting.
- Company outreach supports optional email and non-linear progression into calls, in-progress states, and closed outcomes.
- Queues and filters act as entry points while preserving context and next logical action.
- The implementation remains UI-only with local mock data and no integrations.
