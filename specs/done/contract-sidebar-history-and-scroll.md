# Contract Sidebar History, Note Editing, and Scrolling

## Problem

The selected Contract side card duplicates note information in a separate `Latest notes` list and hides its inline history behind a `Show history` / `Hide history` toggle. This slows review and separates note editing from the user-visible history context.

The card is also sticky but has no viewport-bounded scrolling container. When its content exceeds the viewport, page scrolling is consumed by the main contract list until the user reaches that list's end, rather than allowing the hovered/focused side card to scroll.

## Objectives

- Remove the Contract side card's separate `Latest notes` heading/list entirely.
- Always render the inline history region; default its filter selection to `Notes`.
- Make the edit affordance a pencil icon on note history rows only. Stage changes, note-edit audit rows, and system rows must never be editable.
- Keep current note creation and persistence behavior intact.
- Make the desktop side card independently scrollable when it is hovered or keyboard-focused, without changing the mobile single-column flow.

## Current implementation

- `ContractContextPanel` passes `inlineHistory`, current `notes`, `history`, and `onEditNote` to the shared `NotePanel` in `src/App.tsx`.
- `NotePanel` currently renders the `Latest notes` list first, gives each note a text `Edit` action, and conditionally displays `.history-list` only after its local `historyVisible` toggle is opened.
- `historyTypes` already defaults to `['note']`; it can remain the default after history becomes always visible.
- `mapProcurementHistory` categorizes records as `note`, `note-edit`, `status`, or `system`; these types are sufficient to restrict editing to `note` records.
- `.detail-panel` is `position: sticky` with no `max-height` or `overflow-y`, so it is not an independent scroll region.

## Technical approach

For Contract mode, treat the visible history list as the sole note/history presentation. The default Notes filter displays current note entries; users can opt into Note edits and Stage changes with the existing checkboxes. The separate `notes` list is not rendered in this mode.

Use one explicit `onEditNote` path on a history row only when `item.type === 'note'`. The row edit editor must preserve existing save/cancel behavior and invoke the same Supabase-backed edit helper with the underlying note ID. Ensure the history model carries that note ID in metadata or a dedicated field rather than assuming a history-row ID is always the note ID; note edit audit rows must not be candidates.

Bound the sticky side card to the viewport and make it an accessible scroll region on desktop. The same element should receive wheel and keyboard scrolling while it has pointer/focus, then return to normal document flow at the existing narrow breakpoint.

## Implementation plan

### Phase 1: Simplify the Contract history presentation

1. Refactor `NotePanel` so Contract inline-history mode does not render `.note-list`, its `Latest notes` eyebrow, or the separate map over `notes`.
2. Remove `historyVisible` state, the Show/Hide button, and its conditional wrapper. Render the existing history filters and `history-list` immediately when `inlineHistory` is true.
3. Keep `historyTypes` initialized to `['note']`, so opening/selecting a Contract presents Notes by default. Preserve the existing user-controlled checkboxes for Notes, Note edits, and Stage changes; do not introduce a second history mode or navigation step.  Everything per functionality in Show history once expanded should work as it currently does (without the option to Show/Hide history)
4. Continue showing a concise empty state such as `No notes yet.` when Notes is selected but there are no matching rows. When other filter combinations are selected, use context-appropriate empty copy rather than presenting duplicate latest-note content.
5. Keep the new-note textarea and `Save note` action above the always-visible history region. After successful save, the existing history reload should add the entry to the Notes-filtered list immediately.
6. Scope this simplification to the Contract inline-history path. Keep the Company side card's existing note list/history behavior unchanged unless it shares harmless structural cleanup.

### Phase 2: Make only note rows editable with a pencil

1. Extend `LeadHistoryItem` or its mapping to retain the original `lead_notes.id` for `note` rows. For note-added rows this can be the source row/note id; for `note-edit`, `status`, and `system` entries it must be absent or explicitly non-editable.
2. In the always-visible Contract history list, render an icon-only pencil button next to a row only when all are true:
   - `item.type === 'note'`;
   - a writable `noteId` is present; and
   - the Contract panel supplied `onEditNote`.
3. Give the control an accessible name, such as `Edit note from {timestamp}`, plus a visible focus state and tooltip/title. Do not use a pencil for creating a new note or for editing Stage changes, Note edits, or system history.
4. On pencil click, replace only that note row's display with its editor and Save/Cancel controls. Save calls the existing `editContractNote(contractId, noteId, text)` path; Cancel restores the original text with no database call.
5. Disable duplicate saves, retain draft text on save failure, and close the edit editor only after the persistence call and history reload succeed. Ensure switching filters/contracts clears a stale editor safely.

### Phase 3: Create a usable independent sidebar scroll region

1. Update desktop `.detail-panel` / `.context-panel` CSS to use a viewport-aware maximum height, for example `max-height: calc(100vh - 36px)`, with `overflow-y: auto`, `min-height: 0`, and stable internal padding.
2. Add `overscroll-behavior: contain` so scrolling inside an overflowing side card is not immediately chained to the main page. Keep horizontal overflow hidden unless a specific control requires it.
3. Add `tabIndex={0}` and an accurate `aria-label` to the Contract side-card scroll container (or a contained designated scrolling element) so it can receive keyboard focus and Page Up/Page Down/arrow scrolling. Verify focus styling is visible but quiet.
4. Keep the sticky top offset consistent with the maximum-height calculation so the card stays fully reachable at desktop widths.
5. At the existing `max-width: 860px` single-column breakpoint, reset the card to normal height and `overflow: visible`; this prevents a nested scroll trap on mobile/smaller layouts.

### Phase 4: Verification

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. On a Contract with notes and stage history, confirm there is no `Latest notes` heading/list and no Show/Hide control.
3. Confirm Notes is visible by default; toggle Note edits and Stage changes independently and verify each row appears once with the correct type.
4. Confirm only a current note row has a pencil icon. Edit it, Save, and confirm the current note updates plus one non-editable Note edited audit row appears; Cancel must make no write.
5. Verify a stage-change row and a note-edit row have no pencil/action that can mutate them.
6. On desktop with enough content to overflow, hover the side card and use the mouse wheel; then keyboard-focus it and use keyboard scrolling. The side card should scroll independently before the main contract list. Verify the narrow layout has normal page scrolling and no clipped sidebar content.

## Success criteria

- The Contract side card has one always-visible, Notes-default history area and no duplicate Latest Notes section or Show/Hide toggle.
- A pencil edit action exists only for editable current-note rows.
- Note edits preserve persistence, audit history, and error/draft behavior.
- The desktop side card scrolls independently when hovered or focused; smaller layouts remain natural single-page scrolling.
