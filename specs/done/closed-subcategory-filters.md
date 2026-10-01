# Closed Subcategory Filters Plan

## Problem Statement

Both `Contracts` and `Companies` currently expose `Closed` as a single selectable status category. The user needs `Closed` to show a total count on the main closed card, while also exposing selectable closed subcategories:

- Won
- Lost
- Not Interested
- Withdrew

Each subcategory should show its own count and be selectable. This remains UI-only and should use local mock state only.

## Current Repository Context

- `src/App.tsx` owns all data, filters, summaries, actions, notes, and history.
- `src/styles.css` owns the visual system and summary/filter styling.
- Contract closed status data already maps cleanly to `ContractStatus` values:
  - `won`
  - `lost`
  - `not-interested`
  - `withdrew`
- Companies currently use:
  - `statusCategory: 'closed'`
  - `closedReason?: CompanyClosedReason`
- `CompanyClosedReason` currently includes more reasons than the requested closed subcategories:
  - `won`
  - `lost`
  - `not-interested`
  - `too-small`
  - `no-budget`
  - `has-provider`
  - `bad-fit`
- Summary cards are rendered by `SummaryPill`.
- Contract filtering is driven by `contractFilters.status`.
- Company filtering is driven by `companyFilters.status`.

## Objectives

1. Keep the main `Closed` summary card for both modes.
2. Show the total number of closed records on the main `Closed` card.
3. When `Closed` is selected, show subcategory controls for:
   - `Won`
   - `Lost`
   - `Not Interested`
   - `Withdrew`
4. Show a count beside each closed subcategory.
5. Allow each closed subcategory to filter the visible results.
6. Preserve the current compact, at-a-glance UI style.
7. Avoid real integrations, persistence, databases, or backend changes.
8. Remove the note/edit and history icon buttons from main cards except company cards in `Ready to email`.
9. Move each record's status bubble to the first line beside the contract/company name and amount/square footage.
10. For contract cards, move contact name and contact info below the contract description using the same contact layout as company cards.

## Data Model Approach

### Contracts

Contracts already have the exact statuses needed:

```ts
type ContractClosedSubcategory = 'all' | 'won' | 'lost' | 'not-interested' | 'withdrew';
```

Add this to `ContractFilters`:

```ts
type ContractFilters = {
  category: 'All' | ContractCategory;
  dateType: 'All' | ContractDateType;
  dateBucket: DateBucket;
  query: string;
  status: ContractStatusFilter;
  closedSubcategory: ContractClosedSubcategory;
};
```

When `status !== 'closed'`, ignore `closedSubcategory`.

### Companies

Companies need a normalized display mapping because `closedReason` currently includes several sales close reasons. Add a display subcategory type:

```ts
type ClosedSubcategory = 'all' | 'won' | 'lost' | 'not-interested' | 'withdrew';
```

Update `CompanyClosedReason` to include `withdrew`:

```ts
type CompanyClosedReason =
  | 'won'
  | 'lost'
  | 'not-interested'
  | 'withdrew'
  | 'too-small'
  | 'no-budget'
  | 'has-provider'
  | 'bad-fit';
```

Add this to `CompanyFilters`:

```ts
type CompanyFilters = {
  status: CompanyStatusCategory;
  query: string;
  closedSubcategory: ClosedSubcategory;
};
```

For company closed filtering:

- `won` matches `closedReason === 'won'`
- `lost` matches `closedReason === 'lost'`
- `not-interested` matches `closedReason === 'not-interested'`
- `withdrew` matches `closedReason === 'withdrew'`

Existing detailed close reasons like `too-small`, `no-budget`, `has-provider`, and `bad-fit` can remain in the data model, but they should not be counted in one of the four requested subcategories unless the product explicitly maps them later. For now, they remain included in the `Closed` total and visible when the subcategory is `all`.

## UI Approach

Add a compact closed subcategory row below the summary strip or above the results list, only when the selected mode is on `Closed`.

Recommended placement:

- Keep the top summary strip unchanged except the `Closed` card remains selected and shows total count.
- Render `ClosedSubcategoryBar` immediately below the mode summary strip or at the top of the list before the existing filter bar.

Controls:

- Use small pill buttons, not large cards.
- Label counts tersely:
  - `Won 2`
  - `Lost 1`
  - `Not interested 3`
  - `Withdrew 0`
- Optionally include `All 6` as the first pill. This is useful so selecting `Closed` can return to all closed records.

Suggested component:

```tsx
function ClosedSubcategoryBar({
  value,
  items,
  onChange,
}: {
  value: ClosedSubcategory;
  items: Array<{ key: ClosedSubcategory; label: string; count: number }>;
  onChange: (value: ClosedSubcategory) => void;
}) {
  return (
    <div className="closed-subcategory-bar" aria-label="Closed subcategories">
      {items.map((item) => (
        <button
          className={value === item.key ? 'is-active' : ''}
          key={item.key}
          onClick={() => onChange(item.key)}
          type="button"
        >
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </div>
  );
}
```

Use the existing orange only for the active subcategory, similar to summary active state.

## Card Layout Updates

Update both `ContractList` and `CompanyList` so the first line follows this pattern:

- Contracts: `{projectName} {estimatedValue | Value TBD} {status bubble}`
- Companies: `{businessName} {estimatedSqFt} {status bubble}`

Keep the status visually formatted as the current small rounded bubble style. The implementation can reuse `.contract-meta span` styling by introducing a clearer shared class, for example:

```tsx
<div className="lead-title-line">
  <h3>{contract.projectName}</h3>
  <span>{contract.estimatedValue ?? 'Value TBD'}</span>
  <span className="status-bubble">{statusLabels[contract.status]}</span>
</div>
```

For companies:

```tsx
<div className="lead-title-line">
  <h3>{company.businessName}</h3>
  <span>{company.estimatedSqFt}</span>
  <span className="status-bubble">{companyStatusLabels[company.statusCategory]}</span>
</div>
```

If a company is closed and has a close reason, prefer the more specific visible bubble text:

```ts
company.closedReason ? closedReasonLabels[company.closedReason] : companyStatusLabels[company.statusCategory]
```

If a company is in progress and has a progress status, prefer the progress label:

```ts
company.progressStatus ? progressLabels[company.progressStatus] : companyStatusLabels[company.statusCategory]
```

### Main Card Icons

Remove the note/edit and history icon buttons from all main cards except company cards with `statusCategory === 'ready-to-email'`.

Contracts:

- Do not render `.lead-utility-actions` in `ContractList`.
- Notes and history remain available in the right context panel after selecting a contract.

Companies:

- Render `.lead-utility-actions` only when `status === 'ready-to-email'`.
- Other company statuses should not show the pencil or history icons on the main card.
- Notes and history remain available in the right context panel after selecting a company.

Suggested conditional:

```tsx
const showUtilityActions = status === 'ready-to-email';
```

Then render the utility action block only when `showUtilityActions` is true.

### Contract Contact Placement

Contract cards currently show contact name in `.contract-meta`. Move that contact information under the contract description instead.

Desired contract content order:

1. First line: project name, estimated value, status bubble.
2. Agency/location/category line.
3. Due or expiration date bubble.
4. Contract description.
5. Contact block in the same format as company cards:

```tsx
<div className="lead-contact">
  <strong>
    {contract.contactName}
    {contract.contactPhone ? ` - ${contract.contactPhone}` : ''}
  </strong>
  {contract.contactEmail ? <span>{contract.contactEmail}</span> : <span>Contact email pending</span>}
</div>
```

Avoid awkward punctuation when phone or email is missing.

After moving status and contact:

- `.contract-meta` should contain the date bubble only, unless another non-status compact fact remains useful.
- The status should no longer appear in `.contract-meta`.
- The contact name should no longer appear in `.contract-meta`.

## Filtering Behavior

### Contracts

Update `matchesStatusFilter` or add an additional check:

```ts
function matchesContractClosedSubcategory(
  status: ContractStatus,
  subcategory: ClosedSubcategory,
) {
  if (subcategory === 'all') return true;
  return status === subcategory;
}
```

Then apply it only when `filters.status === 'closed'`:

```ts
const matchesClosedSubcategory =
  filters.status !== 'closed' ||
  matchesContractClosedSubcategory(contract.status, filters.closedSubcategory);
```

When selecting the main `Closed` summary card:

- Set `contractFilters.status = 'closed'`.
- Preserve `closedSubcategory` if already set, or default to `all`.

When selecting any non-closed contract summary card:

- Set `contractFilters.status` to that selected status.
- Reset `closedSubcategory` to `all`.

### Companies

Update `matchesCompanyFilters`:

```ts
const matchesClosedSubcategory =
  filters.status !== 'closed' ||
  filters.closedSubcategory === 'all' ||
  company.closedReason === filters.closedSubcategory;
```

For companies, selecting `Closed` should show all closed opportunities by default unless a closed subcategory is already selected.

Selecting any non-closed company status should reset `closedSubcategory` to `all`.

## Count Calculation

Add a shared closed subcategory config:

```ts
const closedSubcategoryConfig = [
  { key: 'all', label: 'All' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'not-interested', label: 'Not interested' },
  { key: 'withdrew', label: 'Withdrew' },
] as const;
```

Contract counts:

```ts
const contractClosedSubcategories = closedSubcategoryConfig.map((item) => ({
  ...item,
  count:
    item.key === 'all'
      ? contracts.filter((contract) => closedContractStatuses.includes(contract.status)).length
      : contracts.filter((contract) => contract.status === item.key).length,
}));
```

Company counts:

```ts
const companyClosedSubcategories = closedSubcategoryConfig.map((item) => ({
  ...item,
  count:
    item.key === 'all'
      ? companies.filter((company) => company.statusCategory === 'closed').length
      : companies.filter(
          (company) =>
            company.statusCategory === 'closed' &&
            company.closedReason === item.key,
        ).length,
}));
```

This makes the main `Closed` card total independent of the selected subcategory.

## Mock Data Updates

Add enough mock closed records to make the subcategory counts meaningful.

Contracts should include at least one each:

- `won`
- `lost`
- `not-interested`
- `withdrew`

Companies should include at least one each:

- `closedReason: 'won'`
- `closedReason: 'lost'`
- `closedReason: 'not-interested'`
- `closedReason: 'withdrew'`

All added mock locations should remain in or near Little Rock, AR.

Keep any existing detailed company close reasons if useful, but be aware they will only show under `All` unless mapped to a requested subcategory.

## Styling Plan

Add CSS for a compact closed subcategory bar:

```css
.closed-subcategory-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 2px 12px;
}

.closed-subcategory-bar button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-weight: 800;
}

.closed-subcategory-bar button.is-active {
  border-color: rgba(255, 145, 77, 0.45);
  background: var(--soft);
  color: var(--brand-strong);
}
```

Keep it visually subordinate to the main summary strip. The main `Closed` card remains the category entry point.

Add or adjust card-status styles:

```css
.status-bubble {
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fbfaf8;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
}
```

Update `.lead-title-line` if needed so long names, amount/square footage, and status do not overlap:

- `h3` should keep `min-width: 0`.
- amount/square footage and status bubble should be `flex: 0 0 auto`.
- On narrow widths, allow the title line to wrap rather than clip the status bubble if needed.

Because removing utility icons leaves less need for the utility column on most rows, simplify carefully:

- Keep the existing grid columns if it avoids risky CSS churn.
- Prefer an empty utility column only if layout stability is better.
- If removing the utility column from contract rows, update responsive CSS at the same time.

## Implementation Steps

1. Add closed subcategory types and config in `src/App.tsx`.
2. Add `closedSubcategory` to both `contractFilters` and `companyFilters` state.
3. Add closed subcategory count derivations for contracts and companies.
4. Render `ClosedSubcategoryBar` when:
   - `workMode === 'contracts' && contractFilters.status === 'closed'`
   - `workMode === 'companies' && companyFilters.status === 'closed'`
5. Update summary card click handlers:
   - Closed keeps or defaults subcategory to `all`.
   - Non-closed resets subcategory to `all`.
6. Update `matchesContractFilters` to apply closed subcategory filtering only under `status: 'closed'`.
7. Update `matchesCompanyFilters` to apply closed subcategory filtering only under `status: 'closed'`.
8. Add or adjust mock data so all four subcategories have representative records for both modes.
9. Add CSS for the closed subcategory bar.
10. Update contract cards so status appears in the first line and contact details appear below the description.
11. Update company cards so status/progress/closed reason appears in the first line beside square footage.
12. Remove main-card note/history icon rendering except for company `Ready to email`.
13. Add or adjust `.status-bubble` and title-line CSS so the new first line remains readable on desktop and mobile.

## Edge Cases

- `Closed` total should not change when a subcategory is selected.
- `All` should show every closed record, including company close reasons outside the four requested subcategories.
- Subcategories with zero records should still be selectable and show an empty state.
- Switching away from `Closed` should reset the subcategory filter to `all`.
- Switching modes should preserve each mode's own filter state.
- Bulk actions in closed views should still work with the currently visible subcategory only.
- Missing contract phone should not render a trailing separator after the contact name.
- Missing contract email should show a short fallback such as `Contact email pending`.
- Removing main-card icons must not remove note/history access from the right context panel.
- Company `Ready to email` remains the only main-card status with pencil/history icons.
- Long status labels such as `Not interested` and `Waiting on customer` should fit without overlapping the name or amount.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Contracts `Closed` card shows total closed contracts.
2. Contracts closed subcategory bar appears only when `Closed` is selected.
3. Contract subcategory counts are correct for Won, Lost, Not Interested, and Withdrew.
4. Selecting each contract subcategory filters the visible contract list.
5. Companies `Closed` card shows total closed companies.
6. Companies closed subcategory bar appears only when `Closed` is selected.
7. Company subcategory counts are correct for Won, Lost, Not Interested, and Withdrew.
8. Selecting each company subcategory filters the visible company list.
9. Selecting `All` shows every closed record in that mode.
10. Switching to non-closed statuses hides the subcategory bar and resets subcategory state.
11. Contract cards show project name, amount, and status bubble on the first line.
12. Company cards show business name, square footage, and status/progress/closed reason bubble on the first line.
13. Contract contact name and contact details appear below the description in the company contact format.
14. Contract cards do not show pencil/history icons.
15. Company cards show pencil/history icons only in `Ready to email`.

## Success Criteria

- Both Contracts and Companies keep a main `Closed` status card with total count.
- Both modes expose selectable closed subcategories with counts.
- Subcategory selection filters the visible rows correctly.
- The added controls are compact and visually subordinate to the main status cards.
- Main card layout is cleaner: status is immediately visible in the first line, and contract contact details sit below the description.
- Only `Ready to email` company cards retain main-card note/history icons.
- The prototype remains UI-only with local mock data.
