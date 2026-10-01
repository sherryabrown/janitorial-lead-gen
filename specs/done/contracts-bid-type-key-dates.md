# Contracts Bid-Type Key Dates

## Problem statement

The Contracts main card currently treats every procurement lead as either due or expiring. That is not correct for the live procurement model: the useful dates depend on whether `bid_type` identifies a Forecast, Opportunity, or Award. The card should use the space below the header to show the appropriate dates and should show the bid type beside the stage instead of an expiration label.

## Objectives

1. Carry `procurement_leads.bid_type` into the frontend contract presentation model.
2. Normalize bid types into `Forecast`, `Opportunity`, and `Award` for display, with a safe fallback for unknown/null values.
3. Replace the expiration/due bubble to the right of stage with the normalized bid type.
4. Use the card area below the header to render only the meaningful key dates for the record’s bid type.
5. Preserve exact text for `planned_advertisement_period`; do not convert fiscal-quarter text into an invented date.
6. Preserve response-deadline time and timezone when displaying an Opportunity deadline.
7. Avoid rendering empty labels, placeholder dates, or dates from another bid type.

## Key-date rules

| Bid type | Card date fields and labels |
|---|---|
| Forecast | `publication_date` → Published; `planned_advertisement_period` → Expected advertisement; `contract_start_date` → Expected start |
| Opportunity | `publication_date` → Published; `response_deadline` → Response deadline; `contract_start_date` → Anticipated start; `contract_current_end_date` → Current end; `contract_potential_end_date` → Potential end |
| Award | `publication_date` → Award notice published; `contract_start_date` → Contract start; `contract_current_end_date` → Current end; `contract_potential_end_date` → Potential end |

The implementation should use the dedicated columns already present in `src/lib/procurement.ts` and retain payload fallbacks only where the current mapper already supports them. `planned_advertisement_period` remains a text value. Date-only fields should be formatted as local calendar dates. `response_deadline` should be formatted as a date plus time and timezone-aware value when parseable.

## Current implementation findings

- `src/lib/procurement.ts` already selects `bid_type`, `publication_date`, `response_deadline`, `planned_advertisement_period`, `contract_start_date`, `contract_current_end_date`, and `contract_potential_end_date`.
- `ProcurementContract` does not currently expose `bid_type` or the dedicated key dates.
- `mapProcurementLead` currently chooses `response_deadline` as a generic due date, otherwise `contract_current_end_date` as a generic expiration date.
- `ContractOpportunity` in `src/App.tsx` currently has `dateType`, `date`, and `dateLabel`, which support the old due/expiring behavior and should be replaced or supplemented with bid-type key-date data.
- `ContractList` currently renders the stage and a `contract-date-bubble` in the title row, then summary/contact content below. The new date block belongs below the header information and before the summary/contact content.
- Existing filters use `dateType` and date buckets. The build phase must decide whether those filters should remain as compatibility behavior or be adapted to a bid-type-aware primary date. The requested visual change must not silently break existing filters.

## Technical approach

### Phase 1: Data model and mapping

1. Add a `ContractBidType` union such as `'forecast' | 'opportunity' | 'award' | 'unknown'` in the frontend model.
2. Add a key-date type containing a stable key, display label, raw value, and whether the value is date-only, datetime, or plain text.
3. Extend `ProcurementContract` and `ContractOpportunity` with `bidType` and `keyDates`.
4. Normalize `lead.bid_type` case-insensitively, accepting common variants such as `forecast`, `opportunity`, `solicitation`, `award`, and `contract`. Map null/unknown values to `unknown` rather than guessing.
5. In `mapProcurementLead`, select date values by normalized bid type:
   - Forecast: publication, planned advertisement period, contract start
   - Opportunity: publication, response deadline, contract start, current end, potential end
   - Award: publication, contract start, current end, potential end
6. Use dedicated columns first. Use existing payload fallback values only for matching fields. Do not use `contract_current_end_date` as an expiration substitute for Forecast or Opportunity response deadlines.
7. Keep the existing `date`/`dateType` fields only if needed by filters and legacy components; if retained, derive them from the bid-type-aware primary actionable date without using that legacy label in the card header.

### Phase 2: Main card presentation

1. Replace the title-row expiration/due bubble with a bid-type pill/text label beside the stage, for example `Opportunity`, `Forecast`, or `Award`.
2. Add a compact key-date section below the agency/location header and before the summary. Render each available date as `Label: value` in a readable grid or stacked group that fits the card width.
3. Use `formatDateOnly` for date-only fields with month/day/year. Use `formatDateTime` for `response_deadline`, including time and timezone when the source contains timezone information. Keep `planned_advertisement_period` unchanged as text.
4. Add `<time dateTime="...">` for parseable dates and a plain text span for fiscal-quarter/text values. Include accessible labels where compact visual labels could be ambiguous.
5. Remove the old generic `contract-date-bubble` output from the header. Do not render a key-date section when no applicable values exist; show a concise `Key dates unavailable` state only if that empty state is useful and consistent with the existing UI.
6. Leave Added/Updated timestamps and the prior agency/link/contact refinements intact.

### Phase 3: Filtering and compatibility

1. Audit `matchesContractFilters` and date-bucket calculations. Define the primary filter date by bid type without changing the user-facing filter labels unless required:
   - Forecast: publication date, falling back to contract start
   - Opportunity: response deadline, falling back to publication/start
   - Award: contract current end, falling back to start/publication
2. Ensure records with text-only advertisement periods do not crash date filtering and are not treated as exact dates.
3. Keep mock contracts compiling. Add bid-type/key-date values to representative mock contracts or provide a mapper fallback so existing mock UI remains usable.

## Files likely to change

- `src/lib/procurement.ts`
  - bid-type normalization
  - key-date type and mapping
  - dedicated-column/payload fallback logic
- `src/App.tsx`
  - `ContractOpportunity` and related unions
  - production-contract conversion
  - header bid-type display
  - key-date rendering below header information
  - date filtering compatibility
- `src/styles.css`
  - bid-type pill/label styling
  - compact key-date grid/stack
  - responsive behavior for narrow cards

## Edge cases

- `bid_type` may be null, uppercase, underscored, or use a synonym; normalize safely.
- A date field may be null, malformed, or an unzoned timestamp; omit malformed values and do not invent timezone information.
- `planned_advertisement_period` may be `FY27 Q2` or another non-date string; display it verbatim.
- Opportunity records may have a response deadline but no current/potential end dates; show only available fields.
- Award records may have end dates but no publication date; show the remaining available dates.
- Unknown bid types must not be silently presented as Award or Opportunity.
- Existing mock records may not have all key-date fields; the card must remain visually stable.

## Testing strategy

1. Run lint and production build.
2. Verify a Forecast card shows Published, Expected advertisement, and Expected start only when present.
3. Verify an Opportunity card shows Published, Response deadline with time, Anticipated start, Current end, and Potential end only when present.
4. Verify an Award card shows Award notice published, Contract start, Current end, and Potential end only when present.
5. Verify the header displays bid type beside stage and no longer displays a generic Expires/Due bubble.
6. Verify fiscal-quarter advertisement text remains text and is not converted into a date.
7. Verify missing/malformed fields are omitted without layout or runtime errors.
8. Verify existing date filters continue to behave predictably using the bid-type-aware primary date.
9. Verify narrow card layouts remain readable.

## Success criteria

- The main card identifies Forecast, Opportunity, or Award beside the stage.
- The area below the header shows the correct bid-type-specific dates and no misleading generic expiration date.
- Date-only fields include year; response deadlines include time and timezone where supplied; advertisement-period text remains unchanged.
- Existing search, status, and date filtering remain functional.
- Lint and production build pass.
