# Show/hide lead-related dates and times in the selected contract card

## User prompt

> `$plan-code specs/todo/lead-related-date-side-card-explanation.md is NOT what i intended. i don't want to add any other section persay to the side card. i only want to make sure that the side card for the selected card shows the updated lead-related dates in addition to when the lead was created. i want to do this by having a 'Show/Hide Lead-Related Dates/Times' link that defaults to being hidden. please include productement_leads.updated_at and the procurement_leads.created_at (the latter already present) when this is shown. the updated_at entries should say 'Lead updated'.`

## Problem statement

The selected Contract side card already includes a `Lead identified` history item sourced from `procurement_leads.created_at`. It does not surface the record-level `procurement_leads.updated_at` timestamp. Users need to see those two lead lifecycle timestamps without adding more permanent card content or mixing them into the Notes, Note edits, and Stage changes checkboxes.

The requested interaction is one text link that defaults closed: **Show Lead-Related Dates/Times**. When opened, it displays the creation and update timestamps. The update row must be labelled **Lead updated**.

## Scope

Included:

- `procurement_leads.created_at` displayed as `Lead identified`.
- `procurement_leads.updated_at` displayed as `Lead updated`.
- One collapsed/expanded link inside the existing selected Contract side-card history area.
- Full local date-and-time formatting using the same formatter as history.

Excluded:

- No additional side-card section, card, filter, badge, or checkbox.
- No notes, note edits, stage changes, note text, or activity-date-query metadata in this disclosure.
- No change to how the Lead-Related Date filter determines which contracts appear.
- No database migration or new integration.

## Current implementation findings

- `loadProcurementContracts` already maps `procurement_leads.created_at` to `addedAt` and `procurement_leads.updated_at` to `updatedAt` in `src/lib/procurement.ts`.
- `ContractOpportunity` already preserves both optional values in `src/App.tsx`.
- `loadProcurementLeadHistory` synthesizes the existing `Lead identified` row from `procurement_leads.created_at`.
- `NotePanel` renders inline contract history in the selected side card. Its current checkbox group must remain limited to Notes, Note edits, and Stage changes.

## Technical approach

Use a small disclosure within the existing inline history flow. It receives the selected contract’s `addedAt` and `updatedAt`, rather than expanding the activity-date filter query or fetching any new data.

### Interaction and content

- Position the link immediately above the existing history checkbox row, without adding a heading or a new visual container.
- Initial label: **Show Lead-Related**.
- Expanded label: **Hide Lead-Related**.
- Default state is hidden for every selected contract.
- Expanded rows, newest first:
  1. `Lead updated` — format `procurement_leads.updated_at` with the existing local date-and-time formatter.
  2. `Lead identified` — format `procurement_leads.created_at` with the same formatter.
- If `updated_at` is absent or invalid, omit only the `Lead updated` row.
- If `created_at` is absent or invalid, omit only the `Lead identified` row.
- If both values are absent, do not render the link.
- If both timestamps are identical, only render the created_at row.
- Remove the synthesized `Lead identified` item from the ordinary inline history output for Contracts, so the same creation timestamp is not shown twice. Leave full history-screen behavior unchanged unless it shares the same inline-history renderer.

## Phase 1 — Thread the existing timestamps to the inline card

1. Confirm the selected `ContractOpportunity` contains the mapped `addedAt` and `updatedAt` values after initial load and refresh.
2. Extend `ContractContextPanel` and `NotePanel` props only as needed to provide those values to the inline-history rendering path. Do not change Company side-card props or behavior.
3. Use `formatHistoryTimestamp` (or extract a shared equivalent) so creation and update values have the same locale, date, and time representation as other history timestamps.
4. Add a small type/helper that turns valid lead timestamps into two presentation rows. Keep the source labels fixed: `Lead updated` and `Lead identified`.

## Phase 2 — Add the minimal disclosure

1. Add `showLeadRelatedDates` local state to the selected Contract inline-history view, defaulting to `false`.
2. Reset that state to `false` when the selected contract ID changes, so opening one contract cannot leave dates open for the next one.
3. Render a `text-button` directly before `.history-filters`:

```tsx
<button
  aria-controls={`lead-related-dates-${contractId}`}
  aria-expanded={showLeadRelatedDates}
  className="text-button"
  onClick={() => setShowLeadRelatedDates((shown) => !shown)}
  type="button"
>
  {showLeadRelatedDates ? 'Hide' : 'Show'} Lead-Related Dates/Times
</button>
```

4. When open, render the two compact lifecycle rows immediately below the link, using the existing history-row typography and spacing rather than a new card/section treatment.
5. Update the inline-history visibility rule so `lead-identified` is not automatically included there; its creation timestamp now appears only through the disclosure. Do not alter the Notes, Note edits, and Stage changes checkbox state or their defaults.
6. Add minimal responsive/accessibility styling only if needed for the link and two timestamp rows. Do not introduce a new primary action or use orange as a container treatment.

## Phase 3 — Verify

1. Test a selected contract with both database timestamps:
   - initial view shows neither lifecycle timestamp;
   - Show reveals exactly `Lead updated` and `Lead identified` with date and time;
   - Hide collapses them;
   - selecting another contract returns to the hidden state.
2. Test missing/invalid `updated_at`, missing/invalid `created_at`, and equal timestamps. Confirm valid rows still display individually and no blank disclosure is rendered.
3. Verify Notes, Note edits, and Stage changes checkboxes continue to affect only their respective ordinary history entries; no lifecycle timestamp is added to that checkbox group.
4. Verify the full History mode continues to show existing history correctly and does not duplicate entries unexpectedly.
5. Run `npm run lint` and `npm run build`.

## Success criteria

- The selected Contract side card has one hidden-by-default Show/Hide Lead-Related Dates/Times link.
- Showing it displays `Lead updated` from `procurement_leads.updated_at` and `Lead identified` from `procurement_leads.created_at`, each with date and time when valid.
- No note text, stage data, activity query results, new section, or new checkbox is added.
- The existing checkbox group remains fast to scan and unchanged in purpose.
