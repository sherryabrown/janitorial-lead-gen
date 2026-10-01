# Contract Interested and Hold Card Actions

## Problem

The Contract card action menu currently treats Interested as a direct path to Applied and renders Withdrew for nearly every non-New stage. There is no card-level `hold` action, even though Hold is a valid production stage and workflow queue.

The requested workflow is:

| Current stage | Full-width top action | Paired actions |
| --- | --- | --- |
| Interested | none | Hold, Not interested |
| Hold | Interested | Applied, Not interested |

Withdrew must not appear in either requested stage menu.

## Objectives

- Change Interested cards to offer only Hold and Not interested as their paired actions.
- Change Hold cards to offer Interested as the full-width action, with Applied and Not interested beneath it.
- Preserve the required-reason flow for Not interested.
- Persist Hold transitions through the existing stage RPC/history pipeline.
- Leave New, Applied, terminal-stage, bulk-stage, and Company action behavior unchanged unless shared code requires a harmless refactor.

## Current implementation

- `ContractActions` in `src/App.tsx` renders action buttons based on `contract.status`.
- `ContractAction` and `getContractActionMeta` do not currently include `hold`.
- `.contract-card-actions > button:first-child` spans both grid columns, while later buttons naturally render side by side.
- `applyContractAction` already sends stage updates to `update_procurement_lead_stage`, refreshes history, and updates local `stageReason`/status only after successful persistence.

## Implementation plan

### Phase 1: Add the Hold transition model

1. Add `hold` to the `ContractAction` union.
2. Add a `hold` entry to `getContractActionMeta` with:
   - `status: 'hold'`;
   - concise history/next-action values such as `Put on hold` and `Follow up later`;
   - no terminal-stage confirmation or reason requirement.
3. Keep all actual persistence routed through the existing `applyContractAction` / `updateProcurementLeadStage` path so the database clears an obsolete terminal reason when moving back to Hold.

### Phase 2: Rebuild only Interested and Hold menus

1. In `ContractActions`, make the Interested branch render, in this DOM order:
   - secondary `Hold` button;
   - danger `Not interested` button that opens the existing reason selector.
2. Do not render Applied or Withdrew for Interested.
3. Add a Hold branch that renders, in this DOM order:
   - primary `Interested` button first, so existing CSS gives it full width;
   - secondary `Applied` button;
   - danger `Not interested` button that opens the existing reason selector.
4. Do not render Withdrew for Hold.
5. Refactor the unconditional non-New Withdrew button and unconditional Not interested button into explicit stage branches so New, Interested, Hold, and Applied retain only their intended controls. Preserve Applied's existing Won/Lost workflow unless changing it is necessary to prevent duplicated controls.
6. Keep the reason menu local to the card, reset stale reason/detail state when a terminal action is opened, and retain the existing Other-detail validation and disabled-state behavior.

### Phase 3: Verify layout and persistence

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Verify Interested displays exactly Hold and Not interested side by side, with no Withdrew or Applied.
3. Verify Hold displays Interested full width above Applied and Not interested side by side, with no Withdrew.
4. Select Hold from an Interested card and confirm the record moves to the Hold queue, gets a correct stage-history entry, and shows the Hold next action.
5. Select Interested/Applied from a Hold card and confirm the corresponding stage/history updates.
6. For Not interested from both stages, verify Save is blocked without a reason, Other requires detail, and the persisted stage reason/history are correct.
7. Confirm selected/unselected card disabled states and narrow card layout still work.

## Success criteria

- Interested has only Hold and Not interested actions.
- Hold has Interested, Applied, and Not interested in the requested full-width/pair arrangement.
- Neither stage menu presents Withdrew.
- Each stage change remains durable and recorded through the existing stage-history mechanism.
