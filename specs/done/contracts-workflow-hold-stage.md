# Add Hold to the Contracts Workflow Bar

## Problem

`hold` is a fully supported Contract stage: it is mapped from production data, can be selected in historical and bulk stage controls, and has a label. It is missing only from the Contracts workflow summary order, which currently renders New, Interested, Applied, then Closed.

## Objective

Add a clickable `Hold` workflow pill between `Applied` and `Closed`, with the correct count and existing queue-selection behavior.

## Implementation plan

### Phase 1: Update workflow ordering

1. In `src/App.tsx`, update `contractSummaryStatusOrder` from:

```ts
['new', 'interested', 'applied']
```

to:

```ts
['new', 'interested', 'applied', 'hold']
```

2. Do not add a new status type, label, data mapping, or migration. Those already exist.
3. The existing `contractSummary` map will then calculate the Hold count, render its standard `SummaryPill`, and use `selectContractSummary('hold')` to filter the Contracts list.

### Phase 2: Verify presentation and behavior

1. Confirm desktop order is New → Interested → Applied → Hold → Closed.
2. Confirm the Hold pill shows zero when no records are on hold and the accurate count when records are on hold.
3. Click Hold and verify only `status === 'hold'` Contracts display; verify selection clears through the existing summary-selection behavior.
4. Confirm Closed subcategories and responsive horizontal workflow-bar scrolling remain unchanged.
5. Run `npm.cmd run lint` and `npm.cmd run build`.

## Success criteria

- Hold appears between Applied and Closed in the Contracts workflow bar.
- Its count and filtering use the existing production-backed stage state.
- No other workflow, stage, or responsive behavior regresses.
