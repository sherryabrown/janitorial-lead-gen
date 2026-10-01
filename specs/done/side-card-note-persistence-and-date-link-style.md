# Preserve selected-contract notes during refresh and refine the lead-date link

## User prompt

> `$plan-code for the side card:`
>
> `- the notes are disappearing sometimes. they will show back up if i add a note`
>
> `- i'm not loving the CSS of the Show/Hide Lead-Related Dates/Times label: can you show it as a hyperlink (or is this not best practices) and make it smaller and left aligned and a little closer to the 'Save note' button`

## Diagnosis

The notes disappearing is a client-state race introduced by refresh behavior, not a request to add a database integration.

- The main contract reload maps `procurement_leads.notes` into each contract’s `notes` array.
- Side-card notes are actually loaded from `procurement_lead_notes` by `loadProcurementLeadHistory`.
- A selected lead’s history query correctly replaces that array with the note-table rows.
- Later manual, focus, or Realtime-triggered contract refreshes replace the same contract object with the main-query version, which can have an empty or stale `procurement_leads.notes` field.
- Adding a note invokes `loadProcurementLeadHistory` again, so the missing side-card notes reappear.

## Product decision

Use a real `<button type="button">` styled as a hyperlink for **Show/Hide Lead-Related Dates/Times**. This is the accessible pattern for revealing content in place: it has button semantics, keyboard behavior, and `aria-expanded`, while visually reading as low-priority link text. Do not use an anchor because it does not navigate anywhere.

Place it directly below the Save note button and before the regular history controls. Make it smaller, left-aligned, muted/underlined, and closer to Save note without adding a new side-card section.

## Objectives

1. Prevent background reloads from erasing already-loaded selected-contract notes/history.
2. Ensure a refresh eventually reads the authoritative notes/history data, including notes added elsewhere.
3. Preserve current selection, filters, and note-edit state while data is refreshed.
4. Make the Show/Hide control visually lightweight and clearly interactive.

## Current implementation findings

- `refreshContracts` in `src/App.tsx` recreates every contract and its `notes` from `loadProcurementContracts`.
- `loadProcurementContracts` maps the canonical `procurement_leads.notes` column, while `loadProcurementLeadHistory` loads the side-card’s `procurement_lead_notes`, note edits, and stage changes.
- The selected-lead history effect currently reruns only when the selected ID changes. It does not rerun after a background contract refresh for the same ID.
- The Show/Hide control is already a semantic `button` with `aria-expanded`; it currently inherits the general `.text-button` styling, including a 38px minimum height and centered utility-button treatment.

## Phase 1 — Make refresh and side-card history coexist safely

1. Extract the selected-lead history loading logic into one guarded helper in `AppShell`, for example `refreshContractHistory(leadId)`. It should load `loadProcurementLeadHistory`, map history/notes exactly as today, and merge only the target contract into current state.
2. Add a monotonically increasing contract-refresh version (or equivalent request token) after each successful `refreshContracts` result. Include it in the selected-history effect dependencies so the current selected contract’s notes/history are reread after a successful background refresh.
3. When `refreshContracts` receives the main contract list, merge existing client-loaded `notes` and `history` into rows with the same contract ID instead of replacing them with the potentially incomplete `procurement_leads.notes` mapping. Main record fields (stage, title, dates, timestamps) still come from the fresh result.
4. Protect both list and history requests from stale completion:
   - A prior refresh may not overwrite a newer contract list.
   - A prior history request may not overwrite a later note save, contract refresh, or selection change.
   - Never clear an existing note/history array while a history refresh is loading or fails.
5. Keep `procurement_leads.notes` as optional legacy/canonical note content, but do not allow its absence to erase persisted `procurement_lead_notes` in the side card. Define and document the merge precedence so a duplicate visible note is avoided.

Pseudo-code:

```ts
setContracts((current) => {
  const existingById = new Map(current.map((contract) => [contract.id, contract]));
  return freshContracts.map((fresh) => {
    const existing = existingById.get(fresh.id);
    return existing
      ? { ...fresh, notes: existing.notes, history: existing.history }
      : fresh;
  });
});

// After successful list refresh, rerun the selected contract's history loader.
```

## Phase 2 — Refine the Show/Hide control

1. Keep the existing button element, label behavior, `aria-controls`, and `aria-expanded` state. Do not change the lifecycle date data or disclosure behavior.
2. Add a dedicated class such as `.lead-related-dates-toggle` rather than changing global `.text-button` behavior used elsewhere.
3. Place the control immediately after the Save note button and before the inline history list. This brings it closer to the note action without making it part of the checkbox group.
4. Style it as a compact hyperlink:
   - `justify-self: start` and left-aligned text;
   - smaller type (about 0.8–0.85rem);
   - no fixed 38px button height or surrounding button fill;
   - underline on default/hover/focus-visible states with readable contrast;
   - a small negative/controlled top margin only if necessary to visually associate it with Save note while preserving tap target and focus outline.
5. Verify the focused state remains obvious and the target is usable with keyboard and touch. The visual link treatment must not remove button accessibility.

## Phase 3 — Validate

1. Reproduce the note-loss sequence against a selected lead:
   - load history with at least one persisted note;
   - trigger manual Refresh, focus revalidation, and a Realtime refresh where available;
   - confirm existing notes remain visible throughout and are still present after the history reread.
2. Add a new note, then immediately trigger a refresh. Verify the persisted note survives and appears once, with no duplicate.
3. Test an externally added/edited note, then refresh. Verify the selected side card picks up the authoritative history after the refresh completes.
4. Test selection changes while list/history requests are in flight. Verify no other lead’s notes appear in the selected card.
5. Verify the Show/Hide control:
   - begins hidden;
   - toggles with mouse, Enter, and Space;
   - is left-aligned, smaller, and visually link-like;
   - remains close to Save note;
   - does not affect Notes, Note edits, or Stage changes checkboxes.
6. Run `npm run lint` and `npm run build`.

## Success criteria

- Persisted `procurement_lead_notes` no longer disappear after any list refresh.
- A new or externally changed note appears after the authoritative selected-history refresh without requiring the user to add another note.
- No stale request can replace newer selected-card history.
- The Lead-Related Dates/Times control is an accessible button styled as a compact hyperlink, left-aligned and visually close to Save note.
- No new side-card section, database schema change, or checkbox is introduced.
