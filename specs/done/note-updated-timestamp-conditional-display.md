# Conditional Note Updated Timestamp

## Original prompt

> please only show the updated date/time on the side card history if it's different from the created/added date/time. btw, what fields are these coming from?

## Revision prompt

> why would you have an edited_at date/time? that should just be updated_at. we can get fancy later about capturing what actually changed when leads are added to the database and maybe or not include it then. for now, please just compare procurement_lead_notes.created_at <> procurement_lead_notes.updated

## Observed current behavior

> the updated date/time is displayed when a note is added for the first time

## Lead identified reconciliation

> please also update specs/todo/note-updated-timestamp-conditional-display.md to reconcile how a Lead can be identified (i.e., added to the database) AFTER a note is added. is the updated_at being displayed where the created_at should be for the "Lead identified" situation?

## Problem and objective

The Contract side-card history currently shows an `Updated` line for every current note. That is misleading for notes that have never changed because the loader falls back from a null `updated_at` to the note's `created_at`.

The display uses only two note fields:

- Original/added time: `procurement_lead_notes.created_at`
- Updated time: `procurement_lead_notes.updated_at`

The objective is to show the italic Updated time only when `procurement_lead_notes.created_at <> procurement_lead_notes.updated_at`. Do not add, query, display, or depend on a separate edit timestamp in this scope.

`Lead identified` is a separate history event. It means the procurement lead was added to the database, so it must use `procurement_leads.created_at`. A note cannot predate its lead because `procurement_lead_notes.lead_id` references `procurement_leads(id)`. The current implementation incorrectly uses `procurement_leads.updated_at` for that event, which can make Lead identified appear after a note or other later activity.

## Current implementation

- `loadProcurementLeadHistory` selects `created_at` and `updated_at` from `procurement_lead_notes`.
- It currently maps `metadata.updated_at` as `row.updated_at ?? row.created_at`, causing a new note to look updated.
- `mapProcurementHistory` maps that value to `LeadHistoryItem.updatedAt`.
- `NotePanel` renders the italic label whenever `item.updatedAt` exists.
- The current Lead identified loader selects `procurement_leads.id, updated_at` and maps `updated_at` into the Lead identified row's `occurred_at`. This is the wrong source for an identification/creation event.

This observed behavior is expected until this plan is implemented: the fallback supplies `created_at` as `updatedAt`, and the current render condition checks only whether a value exists.

## Technical approach

Preserve the actual nullable value of `procurement_lead_notes.updated_at`. Render the side-card Updated line only for current notes whose original `created_at` and actual `updated_at` differ. Continue sorting current notes by their original `created_at`; the Updated line is display context only.

Load `procurement_leads.created_at` for Lead identified and place that event in the shared history stream by its creation time. A later change to a lead's `updated_at` must never move or relabel its identification event.

## Implementation plan

### Phase 1: Preserve the source fields unchanged

1. In `src/lib/procurement.ts`, map `metadata.updated_at` directly from `row.updated_at`, with no fallback to `row.created_at`.
2. Retain `occurred_at: row.created_at` for current note rows and the existing descending raw sort by `occurred_at`.
3. Do not add or use an `edited_at` field, query, label, or comparison. This direct mapping is required so a newly inserted note with a null `updated_at` cannot satisfy the display condition.

### Phase 2: Apply the exact display condition

1. In `NotePanel`, add a small predicate/helper for current note rows that returns true only when all are true:
   - `item.type === 'note'`;
   - `item.updatedAt` is present; and
   - `item.occurredAt !== item.updatedAt`, directly representing `procurement_lead_notes.created_at <> procurement_lead_notes.updated_at`.
2. Use that predicate for the existing italic `Updated {formatHistoryTimestamp(item.updatedAt)}` line within the left-side `.history-time` stack.
3. Preserve the two-column history layout: original added timestamp at left, note content/actions at right, and the updated line below the original timestamp only when the condition is true.
4. Do not add a toggle or a separate history entry for note updates.

### Phase 3: Correct the Lead identified source timestamp

1. In `loadProcurementLeadHistory`, change the selected lead fields from `id,updated_at` to `id,created_at` and update the local row type accordingly.
2. Create the existing non-toggleable `lead_identified` history item only from a non-null `leadRow.created_at`, with `occurred_at: leadRow.created_at`.
3. Keep the existing label exactly `Lead identified`, its non-editable behavior, and its inclusion regardless of selected history checkboxes.
4. Do not use `procurement_leads.updated_at` for Lead identified. That field remains available for Updated Date filtering and record sorting only; it is not evidence of when the lead was added to the database.
5. Preserve descending history sorting by each event's real `occurred_at`. This guarantees Lead identified is at or before any note associated with that lead, apart from malformed legacy data.

### Phase 4: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Create a note with `updated_at` null and confirm it shows only the original added date/time.
3. Update a note so `updated_at` differs from `created_at`; confirm the same current-note row retains its creation-time position and shows its actual `updated_at` in italic below the added date/time.
4. Confirm no separate edit timestamp is queried or rendered and that history filters/layout remain unchanged.
5. Confirm Lead identified uses `procurement_leads.created_at`, appears at the lead's creation point in history, remains visible without a toggle, and does not move when `procurement_leads.updated_at` later changes.

## Success criteria

- A note displays Updated only when `procurement_lead_notes.created_at <> procurement_lead_notes.updated_at`.
- The side-card display uses only the two specified note columns.
- Lead identified uses `procurement_leads.created_at`, never `procurement_leads.updated_at`.
- Original chronology and the date-left/content-right layout remain unchanged.
