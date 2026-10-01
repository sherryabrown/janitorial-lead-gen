# Contracts Sidebar, Stage Reasons, Notes, and Filter Alignment

## Problem

The Contracts page has five related issues:

1. The primary filter controls are vertically misaligned: Category’s Advanced disclosure changes the row height while Bid type remains vertically offset.
2. The side card currently shows a `Change stage` panel that should be removed.
3. Selecting Not interested or Lost must present selectable reasons and persist the selected reason both as the lead’s current stage reason and in stage history.
4. Saving a new note must work reliably and only update the UI after persistence succeeds.
5. The pencil icon should appear only beside an existing note for editing. New-note saving should not be represented by a pencil, and edits must support Save/Cancel while preserving current and edit-history versions.

## Objectives

- Align Category, Bid type, Applicable date, Sort, and Reset filters on a consistent primary control baseline.
- Keep Advanced filters under Category without making neighboring controls drift vertically.
- Remove the sidebar Change stage UI while preserving stage changes through the existing card action buttons.
- Add an easy reason-selection flow for Not interested and Lost.
- Persist stage, current reason, and transition history atomically.
- Make note creation and note editing reliable, clear, and auditable.

## Phase 1: Inspect current behavior and schema

Review `src/App.tsx`, `src/styles.css`, `src/lib/procurement.ts`, and the normalized Supabase migration. Confirm the current stage RPC signature and ensure frontend calls pass `p_reason_code` and `p_reason_note` correctly. Confirm `lead_notes`, `lead_note_edits`, and `lead_status_changes` are the source of truth; do not reintroduce the obsolete JSONB history table.

## Phase 2: Correct filter alignment

Refine the existing `ContractFiltersBar` layout:

- Keep the Advanced disclosure directly beneath Category.
- Use a grid or aligned control wrapper so Category/Bid type/Applicable date/Sort/Reset share the same top label and select baseline.
- Do not let the disclosure’s extra height move Bid type down.
- Keep the expanded Advanced content on its own row below the primary controls.
- Preserve the caret disclosure, keyboard behavior, active indicator, date presets, custom range inputs, and Reset behavior.
- Verify the Changed stage/date controls do not overlap or alter the primary baseline when collapsed.

## Phase 3: Remove sidebar Change stage

Remove the selected Contract side-card `Change stage` section and all related local selector state/UI. Keep stage changes available through the existing main-card quick actions. in the side-card, keep the check box for Stage Changes and its ability to display those.

## Phase 4: Stage reasons and persistence

Use a single reason model for both Not interested and Lost, with selectable options:

- No budget
- Bad timing
- Another vendor
- Too small
- Too large
- Labor/staffing challenge
- Scope not a fit
- Other, with optional reason note

Implementation requirements:

1. Selecting Not interested or Lost opens the reason UI before the RPC call.
2. The Save/confirm action remains disabled until a reason is selected; Other requires nonblank detail if the chosen policy requires it.
3. Call `update_procurement_lead_stage` with `p_reason_code` and `p_reason_note`.
4. The RPC must update `procurement_leads.stage` and `stage_reason`, clear the reason when moving to another stage, and insert one `lead_status_changes` row containing old/new stage and old/new reason.
5. Refresh the contract and timeline only after the write succeeds; show an actionable error and leave state unchanged on failure.
6. Verify both quick actions and any remaining bulk action path use the same reason validation rather than bypassing it.

## Phase 5: Notes creation and editing

Separate new-note and existing-note interactions:

- The new-note textarea has a text-labeled `Save note` action without a pencil icon.
- The pencil icon appears only beside an existing note.
- Clicking the existing-note pencil enters edit mode with the current body in an editor and `Save`/`Cancel` controls.
- Save calls `edit_lead_note`; Cancel restores the read-only note without a database call.
- A note edit updates `lead_notes.body`, `updated_by`, and `updated_at`, and appends a `lead_note_edits` row with old body, new body, actor, and timestamp.
- A new note calls `create_lead_note` and appears only after successful persistence.
- The latest note list displays the current version once; edit history remains available under the existing history filters.
- Saving/error/loading states prevent duplicate submits and preserve unsaved text after failures.

## Testing strategy

1. Run ESLint and production build.
2. Compare the filter bar against the supplied screenshot: primary controls align; Advanced disclosure remains under Category; no vertical drift.
3. Confirm the sidebar has no Change stage section.
4. Select Not interested and Lost, choose each reason category, save, and verify current stage/reason plus history old/new values.
5. Verify missing reasons are rejected and failed writes do not change the UI.
6. Save a new note and confirm it appears only after persistence.
7. Edit an existing note, verify Save and Cancel, current note content, and append-only edit history.
8. Confirm the pencil icon is absent from the new-note control and present only beside existing notes.

## Success criteria

- Filter controls have a clean, consistent baseline.
- Change stage is removed from the sidebar.
- Not interested/Lost reasons are selectable and persisted as current state and history.
- New notes save successfully through Supabase.
- Existing notes can be edited or canceled without losing content.
- Note edits preserve old/new audit history.
- No optimistic success appears for failed writes.
