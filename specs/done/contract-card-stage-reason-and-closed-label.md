# Contract Card Stage Reasons and Closed-Label Removal

## Problem

Contract records already load and retain `stageReason` from `procurement_leads.stage_reason`, but the main card displays only the stage label. This hides the context behind terminal stages such as Lost, Not interested, and Withdrew.

Closed Contract cards also render a separate right-side `Closed` block from `ContractActions`, even though the card's stage pill already communicates the actual terminal state.

## Objectives

- Display a stage reason on the main Contract card only when one exists, using the concise format `Stage - reason`.
- Preserve the stage-only display for records without a reason.
- Remove the redundant right-side `Closed` label/block from closed Contract cards.
- Keep closed queue/filter behavior, stage history, selection, and non-closed action controls unchanged.

## Current implementation

- `ContractOpportunity.stageReason` is loaded from `ProcurementLead.stage_reason` in `src/lib/procurement.ts` and refreshed after a successful stage write in `App.tsx`.
- `ContractList` currently renders `<span className="status-bubble">{statusLabels[contract.status]}</span>` without `stageReason`.
- `ContractActions` detects `closedContractStatuses` and returns `<div className="... closed-state">Closed</div>`.
- `.closed-state` in `src/styles.css` styles that redundant right-side block.

## Implementation plan

### Phase 1: Render stage and reason together

1. Add a small display helper near the existing status-label utilities, for example `getContractStageDisplay(contract)`.
2. The helper must return:

```ts
contract.stageReason?.trim()
  ? `${statusLabels[contract.status]} - ${contract.stageReason.trim()}`
  : statusLabels[contract.status]
```

3. Use this helper exclusively for the Contract card's stage pill. Do not change Company status pills, filter values, database stage codes, or stage-history formatting.
4. Preserve the current status-pill visual treatment and allow long reason text to wrap or truncate accessibly within the card's responsive title cluster; it must not force horizontal overflow.
5. Confirm newly saved terminal-stage reasons appear after the existing successful update/history refresh and that a subsequent move to a stage without a reason returns to the stage-only label.

### Phase 2: Remove the redundant closed action block

1. Change the closed-state branch of `ContractActions` to return `null` rather than a visual `Closed` container.
2. Remove the now-unused `.closed-state` CSS rule if no other component references it.
3. Confirm the card layout handles the missing action child naturally. If the desktop card grid leaves a visually misleading empty action column, add a scoped closed-card modifier/class and adjust only the closed-card grid placement; do not change active-card action layout or mobile behavior.
4. Preserve all closed queue summary counts, filtering, stage pills, history visibility, and card selection behavior. This request removes only the redundant right-side label, not terminal-state information.

### Phase 3: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Verify cards with Lost, Not interested, and Withdrew reasons display formats such as `Lost - Another vendor` and `Withdrew - Bad timing`.
3. Verify cards without `stageReason`, including New, Interested, Applied, and Won, show only the stage name.
4. Verify closed cards show no right-side `Closed` block while their actual stage/reason remains visible in the stage pill.
5. Verify desktop and narrow card layouts have no clipping, overflow, or unexpected blank action treatment.

## Success criteria

- A present Contract stage reason is immediately visible as `Stage - reason` on the main card.
- Stage-only cards remain concise.
- Closed cards no longer display the redundant right-side `Closed` label.
- Existing workflow actions, queues, filters, and history behavior continue to work.
