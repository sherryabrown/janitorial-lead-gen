# Contract Card and Closed Dropdown Refinements Plan

## Problem Statement

The latest prototype has the right two-mode structure, but a few interaction and presentation details need adjustment:

- Contract cards should make the bid website link directly available from the agency/source line.
- Contract status summary should not show all closed statuses as top-level pills.
- Closed subcategories should live under the `Closed` pill, not as a separate bar.
- Contract card footers should not repeat the bid source name next to the last update time.
- New contracts should allow direct `Applied` selection instead of showing an unavailable `Withdrew` action.
- Company main-card close action should again reveal close reasons.

This remains UI-only. Do not add real bid-site integrations, API calls, email sending, calling, persistence, or databases.

## Current Repository Context

- `src/App.tsx` contains all state, mock data, filters, summaries, lists, actions, notes, and history.
- `src/styles.css` contains the visual system and card/filter styling.
- Contracts currently use:
  - `ContractStatusFilter = 'open' | 'closed' | ContractStatus`
  - `contractStatusOrder` including `not-interested`, `won`, `lost`, and `withdrew`
  - `closedSubcategoryConfig`
  - `ClosedSubcategoryBar`
  - `ContractList`
  - `ContractActions`
- Companies currently use:
  - `CompanyClosedReason`
  - `CompanyActions`
  - `closedSubcategoryConfig`
  - `ClosedSubcategoryBar`
- Contract cards currently receive `sources`, use the source for display, and render a footer like `{source.name} - {source.lastChecked}`.
- Company cards currently have one `Close` button mapped to `closed-lost`.
- `.closed-subcategory-bar`, `.summary-pill`, `.contract-meta`, `.lead-touch`, and `.quick-close-actions` already exist in CSS.

## Objectives

1. Put the contract bid URL hyperlink over the second line of each contract card.
2. Remove `Not interested`, `Won`, `Lost`, and `Withdrew` from the top status summary bar for contracts.
3. Keep the main contract `Closed` pill with the total closed count.
4. Move closed subcategories into a dropdown/popover on the `Closed` pill for both Contracts and Companies.
5. Remove the bid source name from the contract card footer. Keep only the day/time of the last update.
6. For contracts with status `new`, show selectable `Applied` instead of `Withdrew`.
7. Bring back selectable company close reasons from the main card `Close` interaction.
8. Preserve the UI-only prototype and existing local-state behavior.

## Contract Summary Bar Changes

Update contract summary to show only operational entry points:

- `Open`
- `New`
- `Interested`
- `Applied`
- `Closed`

Remove these top-level summary pills:

- `Not interested`
- `Won`
- `Lost`
- `Withdrew`

Implementation options:

- Replace `contractStatusOrder` with a smaller list for summary rendering, for example:

```ts
const contractSummaryStatusOrder: ContractStatus[] = ['new', 'interested', 'applied'];
```

- Keep `contractStatusOrder` if used elsewhere, but do not use it to render the summary strip.

The `Closed` pill count should still be:

```ts
contracts.filter((contract) => closedContractStatuses.includes(contract.status)).length
```

## Closed Dropdown Approach

Replace the separate `ClosedSubcategoryBar` rendered above the filters with a dropdown attached to the `Closed` summary pill.

Recommended approach:

- Extend `SummaryItem` with optional closed subcategory metadata:

```ts
type SummaryItem<T extends string> = {
  key: T;
  label: string;
  shortLabel: string;
  count: number;
  icon: typeof Building2;
  closedSubcategories?: Array<{ key: ClosedSubcategory; label: string; count: number }>;
  selectedClosedSubcategory?: ClosedSubcategory;
};
```

- Extend `SummaryPill` props:

```ts
onClosedSubcategoryChange?: (value: ClosedSubcategory) => void;
```

- When `item.key === 'closed'`, render the subcategories inside that pill as a compact dropdown area.

Because this is a prototype, a native `<select>` inside the closed pill is acceptable and robust:

```tsx
{item.closedSubcategories ? (
  <select
    aria-label={`${item.label} subcategory`}
    onClick={(event) => event.stopPropagation()}
    onChange={(event) => onClosedSubcategoryChange?.(event.target.value as ClosedSubcategory)}
    value={item.selectedClosedSubcategory}
  >
    {item.closedSubcategories.map((subcategory) => (
      <option key={subcategory.key} value={subcategory.key}>
        {subcategory.label} ({subcategory.count})
      </option>
    ))}
  </select>
) : null}
```

Interaction rules:

- Clicking the `Closed` pill selects the closed category.
- Changing the dropdown selects that subcategory and keeps `Closed` active.
- Selecting any non-closed summary pill resets `closedSubcategory` to `all`.
- Remove the separate `ClosedSubcategoryBar` component and its rendering, or leave it unused only if cleanup is risky. Prefer removal.

Styling:

- The closed pill may become a slightly wider pill.
- Keep the dropdown visually subordinate to the main label/count.
- The dropdown must fit on mobile without overlapping neighboring summary pills.

## Contract Card Bid Link

Update `ContractList` so the second line contains a hyperlink for the bid source/agency.

Current second line resembles:

```tsx
{contract.agencyName} - {contract.location} - {contract.category}
```

Desired behavior:

- Use the linked source URL when available.
- Anchor text should be the agency/source name that the user recognizes, such as `Pulaski County Facilities` or `Little Rock School District`.
- Keep this UI-only; clicking opens the mock URL in the browser because it is a normal anchor, but no app integration should be built.

Suggested markup:

```tsx
<p className="contract-source-line">
  <a href={`https://${source?.url ?? ''}`} target="_blank" rel="noreferrer">
    {contract.agencyName}
  </a>
  <span>{contract.location} - {contract.category}</span>
</p>
```

If `source` is missing, render `contract.agencyName` as plain text without an empty link.

Add CSS:

```css
.contract-source-line {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.contract-source-line a {
  color: var(--brand-strong);
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

## Contract Card Footer

Remove bid source text from the footer that currently appears to the left of the day/time of last update.

Current footer logic:

```tsx
{source ? `${source.name} - ${source.lastChecked}` : contract.nextAction}
```

Desired footer:

```tsx
{source?.lastChecked ?? contract.dateLabel}
```

This removes source names like `UAMS Vendor Opportunities` from the main card while preserving the update timing.

## Contract Actions

For a contract with `status === 'new'`, replace the current disabled `Withdrew` option with a selectable `Applied` action.

Desired new-contract actions:

- Primary: `Interested`
- Secondary/selectable: `Applied`
- Danger: `Not interested`

For `interested`:

- Primary: `Applied`
- Secondary: `Withdrew`
- Danger: `Not interested`

For `applied`:

- Primary: `Won`
- Secondary: `Withdrew`
- Danger: `Lost`

Closed contracts remain read-only on the main card.

Implementation detail:

- In `ContractActions`, conditionally render `Applied` as a secondary button when `contract.status === 'new'`.
- Do not render disabled `Withdrew` for new contracts.

## Company Close Reasons

Bring back selectable close reasons on the company main card when `Close` is clicked.

Recommended reasons:

- `Lost`
- `Not interested`
- `Too small`
- `No budget`
- `Has provider`
- `Bad fit`
- `Withdrew`

Update `CompanyAction` to include actions if needed:

```ts
type CompanyAction =
  ...
  | 'closed-too-small'
  | 'closed-no-budget'
  | 'closed-has-provider'
  | 'closed-bad-fit'
  | 'closed-withdrew';
```

Add action metadata mapping each reason to:

- `statusCategory: 'closed'`
- matching `closedReason`
- short history label
- `nextAction: 'No action'`
- confirmation text

In `CompanyActions`:

- Add local `showCloseReasons` state.
- `Close` toggles the reason list instead of immediately applying `closed-lost`.
- Render reason buttons using `.quick-close-actions`.
- Selecting a reason applies the corresponding company action and hides the list.

Closed company cards can keep the current `Reopen` behavior.

## Filtering Behavior

Closed subcategory filtering should continue working exactly as it does now:

- Contracts filter by actual closed status.
- Companies filter by `closedReason`.
- `All` includes all closed records, including detailed company reasons like `too-small` and `no-budget`.

Only the control placement changes from a separate bar to a dropdown on the `Closed` pill.

## Styling Plan

Update CSS for:

- Closed summary pill dropdown.
- Contract source hyperlink line.
- Company close reason list, reusing existing `.quick-close-actions`.

Suggested CSS:

```css
.summary-pill.has-subfilter {
  grid-template-columns: 20px minmax(88px, 1fr) auto;
  min-width: 180px;
}

.summary-pill select {
  grid-column: 2 / -1;
  width: 100%;
  min-height: 30px;
  margin-top: 3px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fffdfb;
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 750;
}
```

Remove or leave unused `.closed-subcategory-bar` styles after deleting the component. Prefer removing unused styles if straightforward.

## Implementation Steps

1. Replace contract summary rendering so the contract status bar excludes `Not interested`, `Won`, `Lost`, and `Withdrew`.
2. Extend `SummaryItem` and `SummaryPill` to support a closed subcategory dropdown.
3. Pass closed subcategory items and selected values into the `Closed` summary item for contracts and companies.
4. Remove rendering of `ClosedSubcategoryBar` above filters.
5. Remove the `ClosedSubcategoryBar` component if no longer used.
6. Update closed dropdown `onChange` handlers to set the correct mode filter and keep `Closed` active.
7. Update `ContractList` second line to link `contract.agencyName` to the mock bid URL from `source.url`.
8. Update contract card footer to show only `source.lastChecked` or a fallback date.
9. Update `ContractActions` so `new` contracts show selectable `Applied` instead of disabled `Withdrew`.
10. Add company close reason actions and metadata.
11. Update `CompanyActions` so `Close` toggles selectable close reasons.
12. Update CSS for the summary dropdown and contract source link.
13. Remove unused `.closed-subcategory-bar` CSS if the component is removed.

## Edge Cases

- Closed dropdown changes should not trigger the parent pill click twice; stop event propagation on the dropdown click/change path.
- `Closed` total should remain the total closed count regardless of selected subcategory.
- A subcategory with zero records should still be selectable and show the existing empty state.
- Missing contract source should render plain agency text, not an invalid empty link.
- Source URLs are mock strings; normalize to `https://` if they do not already start with `http`.
- Contract footer should not show source names; only update time or fallback date.
- New contracts should be able to move directly to `Applied`.
- Company close reason buttons should hide after a reason is selected.
- Confirm destructive/final close actions as the current app already does for similar actions.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Contract summary bar shows only `Open`, `New`, `Interested`, `Applied`, and `Closed`.
2. Contract `Closed` pill shows total closed count and has a closed subcategory dropdown.
3. Company `Closed` pill shows total closed count and has a closed subcategory dropdown.
4. Selecting closed dropdown values filters visible rows in each mode.
5. No separate closed subcategory bar appears above filters.
6. Contract second line shows agency/source name as a hyperlink when source URL exists.
7. Contract card footer no longer includes bid source names like `UAMS Vendor Opportunities`.
8. New contract cards show selectable `Applied`, not disabled `Withdrew`.
9. Company `Close` reveals selectable close reasons.
10. Selecting each company close reason updates `closedReason`, history, and closed filtering.
11. Lint and build pass.

## Success Criteria

- Closed subcategories are accessed from the `Closed` pill dropdown in both modes.
- Contract top-level status summary is simplified to active work plus closed.
- Contract cards expose bid URLs through the agency/source line and no longer repeat bid source names in the footer.
- New contracts can be marked applied directly.
- Company cards restore reason-specific close behavior.
- The prototype remains local UI-only.
