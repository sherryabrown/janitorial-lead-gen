# Contracts Default Selection, Note Layout, and Lead Identification History

## Prompt used to initiate this plan

> - how is the system deteriming which main card to select as a default. it's very confusing to the user to not see the main card related to the displayed side card
> - the layout of the notes is awful. the original date should be to the left. as it is. the note should be to the right like it was before the last change. the updated date/time should be in italic below the the original date.
> - also, is it possible to show the procurement_leads.updated date noted as "Lead identified". i don't think we need a toggle for this one so it should always show

## Problem and objectives

The Contract side card and selected main card now use the same visible-list lookup, but their initial selection remains confusing. On initial load, `selectedContractId` is set from the raw Supabase result, ordered by `created_at DESC`; the main list is then sorted by Applicable Date ascending. Because that ID is still visible, the repair effect leaves it selected instead of selecting the displayed list’s first card. The current behavior is deterministic, but it does not match the user’s visual expectation.

The recent note update-time addition also placed the timestamp as a separate grid child. That creates a third column-like item and pushes note content out of the established date-left/content-right layout.

Finally, `procurement_leads.updated_at` is used for Updated Date filtering but is not shown in the Contract side-card history. It should appear as a persistent `Lead identified` entry without adding another history filter/toggle.

Objectives:

- Default the selected Contract to the first card actually displayed under the current list sort and filters.
- Keep explicit user card selection until that card is no longer visible.
- Restore a two-column note-history row: original date/time at left, note content at right.
- Render the note’s updated date/time in italic beneath its original left-side date/time.
- Always show `procurement_leads.updated_at` as `Lead identified` in side-card history, independent of the existing Notes/Note edits/Stage changes filters.

## Current implementation

- `loadProcurementContracts` requests leads in `created_at DESC` order, and the load effect assigns `mappedContracts[0].id` to `selectedContractId`.
- `visibleContracts` subsequently applies `compareContracts`, whose default is Applicable Date ascending. `selectedContract` uses the visible list correctly, but selects the loaded ID when it remains visible; the repair effect only replaces IDs that are absent from that list.
- `NotePanel` renders `item.at`, then the new `note-updated-at` span, then the content `<div>` as three direct children of `.history-row`. `.history-row` has a two-column CSS grid, so the timestamp is placed into an unintended grid cell instead of under the original date.
- `loadProcurementLeadHistory` fetches only notes, edits, and stage changes. The Contract lead’s `updated_at` is available during list loading but is not included in the history query/model. The inline history filters include only `note`, `note-edit`, and `status` types.

## Technical approach

Make selection initialization derive from the same `visibleContracts` array the list renders. Do not select the raw fetched first row; leave the initial ID empty and let the existing visible-list reconciliation choose `visibleContracts[0]`. Explicit click and post-action selection paths remain unchanged, so a user-selected visible card stays selected.

Restore the existing two-column history row by grouping original and updated timestamps in a left-side date stack. Keep note title/detail/edit action in the right content column. The updated label remains display-only and does not affect the raw `occurred_at` ordering already returned by `loadProcurementLeadHistory`.

Extend the history loader with a read of the lead’s `updated_at`, map it to a dedicated non-toggleable `lead-identified` history item, and include it in the chronologically sorted history array. Render this type regardless of the user-controlled history-type checkboxes. Do not create database records or change `procurement_leads.updated_at`; this is a read-only representation of the existing column.

## Implementation plan

### Phase 1: Make default card selection match the displayed list

1. In the Contracts initial-load effect in `AppShell`, remove the `setSelectedContractId(mappedContracts[0]?.id ?? '')` assignment. Store loaded contracts and sources only.
2. Retain the visible-selection reconciliation effect, which assigns `visibleContracts[0]?.id` whenever no selected ID is in the visible list. With the initial ID empty, this selects the first item after `visibleContracts` has applied the active filter and sort.
3. Keep `selectedContract` derived solely from `visibleContracts`, preserving the no-results state and preventing a hidden/filtered Contract from driving the side card.
4. Preserve explicit selection from `ContractList.onSelect` and intentional post-action/generated-lead selection. Do not reset a selection merely because the list reorders while the selected Contract remains visible.
5. Add concise code comments or a narrowly named helper only if needed to make the rule clear: default means first *displayed* Contract; a valid user selection wins.

### Phase 2: Restore the note history layout

1. In inline `NotePanel` history markup, replace the two direct timestamp spans with a single left-column wrapper (for example, `.history-time`). It contains:
   - the existing original `item.at` timestamp; and
   - for current note rows, `Updated {formatHistoryTimestamp(item.updatedAt)}` beneath it.
2. Keep the existing content `<div>` as the right-column child, with its label, note body, edit controls, and edit editor unchanged.
3. Update the current `note-updated-at` styling to use `display: block`, italic font style, muted but readable color, a compact line-height, and no layout rule that makes it its own grid column.
4. Scope date-stack styling to Contract history rows. Preserve the current original date/time left alignment, two-column grid, responsive behavior, and Company/standalone HistoryPanel layout unless it shares the same safe semantic markup.
5. Keep original-note sorting by `occurred_at`; the current-note `updatedAt` remains metadata solely for the second line of its left column.

### Phase 3: Add persistent Lead identified history

1. Add a distinct `lead-identified` history type to the client model (or equivalent non-filterable marker) and its display mapping. Its label is exactly `Lead identified`.
2. In `loadProcurementLeadHistory`, concurrently fetch the selected `procurement_leads` row’s `id,updated_at` alongside notes, edits, and stage changes. Preserve current error handling and return no Lead identified item when `updated_at` is null.
3. Convert a non-null lead `updated_at` into a history row with `occurred_at = updated_at`, `event_type`/metadata sufficient to map it to `lead-identified`, and no note ID or editable content. Merge it with the existing raw entries before the existing descending `occurred_at` sort.
4. In `mapProcurementHistory`, map that row to a non-editable `LeadHistoryItem` with the standard localized timestamp. It must never receive a pencil/edit affordance.
5. Change inline history visibility so `lead-identified` items are always included, in addition to whatever the user has selected among Notes, Note edits, and Stage changes. Do not add a checkbox, button, or toggle for it; preserve the three existing controls unchanged.
6. Ensure the history loading/reload paths after stage actions, note saves, and note edits retain this item and that a temporary loader failure does not leave stale selected-card content visible.

### Phase 4: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Load Contracts with default Applicable Date sorting. Confirm the first displayed main card is selected and the side card title/source/history match it. Change sort/filter/queue with no explicit selection and confirm the first displayed card becomes selected; explicitly select another visible card and confirm it remains selected through harmless rerenders/reordering.
3. With a note that has been edited, verify its original date/time is in the left column, its content is in the right column, and the italic updated date/time is directly below the original date. Confirm no third grid column or horizontal crowding appears at desktop and narrow widths.
4. Confirm `Lead identified` appears with the lead’s `updated_at` timestamp when all history checkboxes are off, when each individual filter is enabled, and when Notes is the default. Confirm it is chronologically placed, never editable, and omitted only when `updated_at` is null.
5. Verify note save/edit, stage history, Updated Date filtering, and selected-card context continue to work after reloads.

## Success criteria

- The initial side card always corresponds to the first currently displayed Contract card, and visible user selection remains stable.
- Contract note history has exactly the familiar date-left/content-right structure, with an italic updated line beneath the original date.
- `Lead identified` reflects `procurement_leads.updated_at`, is chronologically placed in the side-card history, and remains visible without a toggle.
- Lint and production build pass.
