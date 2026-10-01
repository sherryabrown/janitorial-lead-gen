# Contracts Filters and Applicable-Date Sorting

## Problem statement

The Contracts page currently filters dates using the old `Due`/`Expiring` distinction and fixed windows (`Next 7 days`, `Next 30 days`, `Expired/overdue`). It also sorts every contract by one generic `date` field. That does not match the bid-type-aware model: Forecast, Opportunity, and Award records have different meaningful dates, and the user should not need to know which underlying date column applies.

## Recommendation

Use three coordinated controls:

1. `Bid type`: All, Forecast, Opportunity, Award.
2. `Date range`: All dates, Today, This week, This month, Custom range.
3. `Sort`: Most relevant date first/last, Newest added, Oldest added, Recently updated.

For `Most relevant date`, the system should choose the first populated date in a bid-type-specific priority list. The user sees one understandable concept—“Applicable date”—rather than raw database fields.

Recommended applicable-date priority:

- Forecast: expected advertisement period when it is an exact date is not possible, so use publication date first, then contract start date. Keep the fiscal/text period available for display but exclude it from date arithmetic.
- Opportunity: response deadline, contract current end, contract potential end, publication date, contract start date.
- Award: contract current end, contract potential end, publication date, contract start date.
- Unknown: publication date, response deadline, current end, potential end, contract start date.

When sorting ascending/descending, compare the first parseable date from the relevant priority list. Records with no parseable applicable date sort last. Text-only `planned_advertisement_period` values must not be parsed as dates.

## Objectives

1. Add bid-type filtering to the Contract page.
2. Replace the old Due/Expiring filter with bid-type-aware date ranges.
3. Offer useful presets—Today, This week, This month—plus a custom From/To date range.
4. Add sorting controls that let the system apply the correct date fields per bid type.
5. Preserve status, category, search, closed-subcategory, and existing production Supabase behavior.
6. Make the active filter/sort state understandable and easy to clear.

## Current implementation findings

- `ContractFilters` currently contains `category`, `dateType`, `dateBucket`, `query`, `status`, and `closedSubcategory`.
- `ContractFiltersBar` renders the old Date and Window dropdowns.
- `visibleContracts` filters through `matchesContractFilters` and then sorts by `contract.date.localeCompare(...)`.
- `matchesDateBucket` uses a fixed `TODAY` constant and only supports All, Next 7 days, Next 30 days, and Expired/overdue.
- `ContractOpportunity` already carries `bidType` and `keyDates` from the previous bid-type implementation, but the filter/sort layer does not yet use them.
- `ProcurementKeyDate` contains a stable key, label, raw value, and kind (`date`, `datetime`, or `text`). This should be the source of truth for applicable-date logic rather than reparsing card labels.
- The existing clear-filters action constructs a complete `ContractFilters` object and must be updated when new fields are added.
- Contracts are currently sorted ascending by a generic date, so the new default should be explicit and stable rather than relying on incidental string ordering.

## Technical approach

### Phase 1: Filter and sort state model

1. Replace `dateType` and `dateBucket` with explicit fields, for example:

```ts
type ContractBidTypeFilter = 'All' | ProcurementBidType;
type ContractDateRangePreset = 'all' | 'today' | 'this-week' | 'this-month' | 'custom';
type ContractSortKey = 'applicable-date' | 'added' | 'updated';
type ContractSortDirection = 'asc' | 'desc';

type ContractFilters = {
  category: 'All' | ContractCategory;
  bidType: ContractBidTypeFilter;
  dateRangePreset: ContractDateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  query: string;
  status: ContractStatusFilter;
  closedSubcategory: ClosedSubcategory;
  sortKey: ContractSortKey;
  sortDirection: ContractSortDirection;
};
```

2. Choose a clear default: `bidType: 'All'`, `dateRangePreset: 'all'`, `sortKey: 'applicable-date'`, `sortDirection: 'asc'` so the soonest actionable/relevant date appears first.
3. Keep date input values in `YYYY-MM-DD` form. Treat custom dates as calendar dates in the user’s local timezone, not UTC midnight strings.
4. Update all initial state, clear-filter state, Generate navigation state, and any filter updates to preserve the new fields.

### Phase 2: Bid-type and date-range filtering

1. Add a Bid type filter with All, Forecast, Opportunity, and Award. Unknown/null bid types should be included only under All unless an explicit Unknown option is later requested.
2. Replace the old Date and Window controls with one Date range control containing All dates, Today, This week, This month, and Custom range.
3. For presets, calculate boundaries from the current local calendar date rather than the hard-coded prototype `TODAY` constant. Define the week start consistently (recommend Monday) and make the end boundary inclusive.
4. For Custom range, show From and To date inputs only when Custom range is selected. Validate that From is not after To; show an inline accessible error and avoid applying an invalid range.
5. Filter against the contract’s applicable date returned by a helper such as `getApplicableContractDate(contract)`. This helper returns the selected priority date and its source key, or null.
6. If a contract has no parseable applicable date, exclude it from an active date range but include it under All dates.
7. Keep `planned_advertisement_period` visible on Forecast cards, but do not treat values such as `FY27 Q2` as exact dates for Today/week/month/custom filtering.

### Phase 3: Applicable-date sorting

1. Add a Sort control with:
   - Applicable date: soonest first
   - Applicable date: latest first
   - Added: newest first
   - Added: oldest first
   - Updated: newest first
2. Implement `getApplicableContractDate` using the bid-type priority lists above. Only `date` and `datetime` key dates participate; `text` dates do not.
3. Return both the parsed timestamp and source key from the helper so future UI can explain why a record sorted where it did without exposing raw database-column names now.
4. Sort missing dates last in either direction. Use a stable tie-breaker such as `projectName` or `id` so cards do not jump unpredictably when dates match.
5. For Added/Updated sorting, use the existing raw ISO timestamp fields retained in the contract model. These fields do not need to be displayed on the card.
6. Ensure generated contracts with only legacy `date`/`dateType` values still sort predictably by providing a fallback applicable date until the Generate tab is fully migrated.

### Phase 4: UI and accessibility

1. Update `ContractFiltersBar` labels and controls so the visible language is Bid type, Date range, and Sort.
2. Render custom From/To controls conditionally with labels, `type="date"`, and validation feedback.
3. Preserve search and category controls.
4. Add a compact active-filter summary or count when a non-default range, bid type, or sort is active. Keep the existing Clear filters action as the obvious next action.
5. Ensure controls wrap cleanly at narrow widths and remain keyboard accessible.
6. Do not change Company filters.

## Files likely to change

- `src/App.tsx`
  - filter types/defaults/state resets
  - `ContractFiltersBar`
  - applicable date helper and date-range predicates
  - `visibleContracts` sorting
  - clear-filter and Generate navigation updates
- `src/lib/procurement.ts`
  - only if shared bid-type/key-date types or fallback mapping need adjustment
- `src/styles.css`
  - custom date fields, range validation, sort/filter layout, responsive wrapping

## Edge cases

- Forecast `planned_advertisement_period` may be text such as `FY27 Q2`; display it but never treat it as an exact day.
- `response_deadline` may include a timezone; compare its actual instant while displaying it in the existing user-facing format.
- Date-only fields should compare as local calendar dates to avoid off-by-one behavior.
- A bid type may be unknown/null; include it in All and use the unknown fallback priority for sorting.
- A custom range with only From or only To should work as an open-ended range.
- From after To must be rejected visibly without throwing or silently swapping values.
- Missing applicable dates sort last and do not match a bounded date range.
- Changing bid type should not reset search, category, or status filters.
- Existing closed subcategory filtering must continue to work.

## Testing strategy

1. Run lint and production build.
2. Verify each bid-type filter shows only Forecast, Opportunity, or Award records.
3. Verify Today, This week, and This month use the current local calendar boundaries.
4. Verify custom From/To filtering, open-ended ranges, invalid-range validation, and clear behavior.
5. Verify fiscal-quarter advertisement text does not match a date range accidentally.
6. Verify Applicable date sorting chooses response deadline for Opportunities, current/potential end for Awards as prioritized, and publication/start for Forecasts.
7. Verify missing dates sort last and tie-breaking remains stable.
8. Verify Added/Updated sorting uses raw timestamps without reintroducing those values into card presentation.
9. Verify search, category, status, and closed subcategory filters still combine correctly.
10. Verify narrow layouts and keyboard navigation for all controls.

## Success criteria

- Users can filter Contracts by bid type.
- Users can select Today, This week, This month, or a custom date range without knowing the underlying date columns.
- Users can sort by a system-selected applicable date, with the priority changing appropriately by bid type.
- Published, response, current-end, potential-end, and contract-start fields are used accurately and text-only advertisement periods are not misinterpreted.
- Existing filters and production Supabase data loading remain intact.
- Lint and production build pass.
