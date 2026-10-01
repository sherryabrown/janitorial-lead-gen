# Contracts Selection, Updated Filtering, and History Details

## Problem and objectives

The Contracts side card can resolve its content from the full Contracts collection even when its selected ID is no longer in the displayed list. This makes the card appear unrelated to the first displayed card after filtering or queue changes.

The Updated Date filter currently finds stage, note-create, and note-edit activity, but it omits direct updates recorded in `procurement_leads.updated_at`. The remaining changes refine bulk-update feedback, make an Other reason useful on the main card, and show the current note update time without changing history chronology.

Objectives:

- Keep the Contract side card attached to the first visible main card until the user selects another visible card.
- Include `procurement_leads.updated_at` in Updated Date results.
- Explain bulk no-ops on hover while retaining the compact `# will change` text.
- Display an Other reason's entered detail, rather than the word Other, on the main card.
- Display each current note's updated date/time in the side card while sorting its history by its original creation/event time.

## Current implementation

- `AppShell` derives `selectedContract` by searching all `contracts` before `visibleContracts`; its selection-repair effect runs after render. The side card can therefore briefly or persistently display a filtered-out record.
- `findLeadIdsByActivityDate` in `src/lib/procurement.ts` queries stage-change, note, and note-edit tables only.
- `ContractBulkStageBar` derives `changeableContracts` but only renders its count. It already omits same-target records from the submitted IDs.
- `procurement_leads.stage_reason` is the value rendered by `getContractStageDisplay`. Both stage RPCs currently save the reason code there, so an Other detail exists only in the stage-history `reason_note` field.
- `loadProcurementLeadHistory` sorts raw records by `occurred_at` before `mapProcurementHistory` formats them. Current-note metadata already includes `updated_at`, but that timestamp is not represented in `LeadHistoryItem` or rendered.

## Technical approach

Make the currently visible list the only source of the active Contract context. Reconcile the selected ID to its first item whenever the visible list changes, but never select a record merely because it exists in the unfiltered cache.

Extend the existing activity helper with a fourth read from `procurement_leads`, preserving its inclusive local-date bounds and distinct-ID result. Keep no mock data or client-only approximations.

Use the existing no-op calculation to produce an accessible hover/focus tooltip. Store the entered Other detail in the existing current-state `stage_reason` field, while retaining `reason_code = 'Other'` and `reason_note` in stage history. This lets current cards render the detail without a second lookup or a schema addition.

Carry two timestamps for current note history items: immutable chronological `occurredAt` for sorting and the note row's `updated_at` for display. Continue sorting raw entries by original occurrence timestamp; an edit audit event remains separate and does not reorder the current note.

## Implementation plan

### Phase 1: Stabilize visible-card and side-card selection

1. In `AppShell`, derive the Contracts active context from `visibleContracts` only:
   - use the current `selectedContractId` if it is present in `visibleContracts`;
   - otherwise use `visibleContracts[0]`;
   - return no selected Contract when there are no visible records.
2. Update the selection-repair effect to set `selectedContractId` to the first visible ID when the stored selection is absent, including after queue, search, date, and activity-filter changes. Do not overwrite an ID that remains visible.
3. Keep `selectedSource`, history loading, Contract context rendering, and row selection driven by this visible selection. When results are empty, render the existing no-contract context rather than stale details from another queue.
4. Preserve explicit card-click selection and post-action `selectNextContract` behavior. Verify a user-selected second/third visible card remains attached to the side card until it leaves the visible list.

### Phase 2: Include lead-record timestamps in Updated Date

1. Update `findLeadIdsByActivityDate` in `src/lib/procurement.ts` to query `procurement_leads` for `id` as well as the existing stage, note, and note-edit sources.
2. Apply the same bounds to `procurement_leads.updated_at` that are applied to event columns:

```ts
leadQuery = leadQuery.gte('updated_at', `${dateFrom}T00:00:00`);
leadQuery = leadQuery.lte('updated_at', `${dateTo}T23:59:59.999`);
```

3. Execute the four independent reads together, preserve existing error propagation, and return a de-duplicated union of lead IDs (`lead.id` for the new query; `lead_id` or resolved note lead IDs for the others).
4. Leave the `all` filter behavior unchanged: `AppShell` must continue to use no historical-ID restriction when Updated Date is All. Existing preset/custom validation and cancellation guards remain intact.

### Phase 3: Clarify bulk skips and persist Other detail for cards

1. In `ContractBulkStageBar`, derive `unchangedContracts` whenever a target is chosen: selected contracts whose current stage already equals the requested stage. Keep `changeableContracts` as the actual submitted set.
2. Wrap the existing `# will change` output in the project’s accessible tooltip pattern. On hover and keyboard focus, show a concise message only when there are skips, for example: `3 already have the Applied stage and will not be updated.` Include the target stage and singular/plural grammar; do not add a tooltip when all selected records will change.
3. Give the count trigger an accessible label that conveys both counts, so the reason for the difference is available without pointer hover. Preserve the existing confirmation count and disabled state when no records would change.
4. Add a forward-only Supabase migration that replaces both `update_procurement_lead_stage` and `bulk_update_procurement_lead_stage`:
   - retain their current authentication, stage, ID, and terminal-reason validation plus grants;
   - for a terminal Other choice, set `procurement_leads.stage_reason` to the trimmed `p_reason_note`; for all named reasons retain the named reason code; clear it for non-terminal stages;
   - continue inserting `reason_code = 'Other'` and `reason_note = <entered detail>` in `procurement_lead_stage_changes`, so history preserves both the classification and explanation;
   - compare against the normalized value saved to `stage_reason` to avoid creating a no-op history row for an unchanged Other detail.
5. Keep client `ContractStageReason` as `{ code: 'Other', note: detail }` and existing RPC calls. After their current refresh path, `getContractStageDisplay` will render `Lost - <detail>` naturally, never `Lost - Other`.
6. Confirm the changed current-state behavior also covers individual card updates. Existing historical rows with only `stage_reason = 'Other'` may continue to display that legacy value; do not attempt a speculative data rewrite in this UI change.

### Phase 4: Show note update time without reordering history

1. Extend `LeadHistoryItem` with explicit original and optional update timestamp values (for example `occurredAt` and `updatedAt`) rather than relying only on its formatted `at` text.
2. In `loadProcurementLeadHistory`, retain current-note `metadata.updated_at` and raw `occurred_at`; maintain the existing descending sort by `occurred_at` before returning history. Do not sort current note rows by `updated_at`.
3. In `mapProcurementHistory`, map current `note_added` entries to their note ID from `metadata.note_id`, their original occurrence time, and the stored `updated_at`. Keep note-edit, stage, and system events non-editable and without a current-note update value.
4. In the inline `NotePanel` history row, show a compact updated timestamp for current note rows, such as `Updated Sep 11, 2026, 10:45 AM`; use the existing localized formatter. Show it even when the timestamp equals creation time, because the side card must expose updated date/time. Keep the original history row placement/time semantics unchanged.
5. Ensure editing a note refreshes history as it does today: the original note remains in its creation-time position but shows its new update time, while the separate Note edited audit row remains positioned by its edit event time.

### Phase 5: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Filter or change queues until the previously selected Contract is excluded. Confirm the side card immediately shows the first visible card; select another visible card, then confirm its context remains until it is filtered out.
3. Test Updated Date for a lead changed through each source: `procurement_leads.updated_at`, a stage change, note creation, and note editing. Check All, presets, custom inclusive day boundaries, and no-result behavior.
4. Select Contracts with a mixed target stage. Hover/focus the `will change` count and confirm it identifies the same-stage skip count; submit and verify only the stated changeable IDs are passed/updated. Confirm no tooltip appears when there are no skips.
5. For single and bulk Lost/Not interested/Withdrew transitions, choose Other with a detail. Confirm the main card shows the detail without Other, the audit row retains the Other code/detail, and non-Other reasons still render as their selected labels.
6. Create and edit a note. Verify the side card exposes the note update date/time, keeps current note ordering by original creation/event time, and still puts the edit audit entry at its actual edit time.

## Success criteria

- The Contract side card always matches the first visible main card unless the user has selected a different visible card.
- Updated Date includes qualifying `procurement_leads.updated_at` records along with stage and note activity.
- Bulk count hover/focus explains the same-stage records that will not change.
- Other reasons display their entered explanation on the main card, while audit history preserves its reason code and detail.
- Side-card note rows show updated date/time without changing chronological sorting by original date/time.
