# Contracts Card and Notes/History Refinements

## Problem statement

Refine the Contracts page so the main contract cards are faster to scan and the selected-contract notes panel is focused on notes and useful history. The current UI still contains placeholder-oriented contact text, a Bid Sources section, a separate History mode/header, and frontend-synthesized history that does not represent a complete persisted audit trail.

The live procurement schema currently exposes `procurement_leads.detected_change_at` for the contract change timestamp. The frontend must continue using the live column rather than querying the unavailable `contract_last_updated_at` column.

## Objectives

1. Remove `search_term_used` from all Contracts-page presentation and avoid displaying it as card metadata.
2. Place the expiration/due date to the right of the stage in the card title row. Keep a date bubble only if it remains visually useful after implementation; otherwise use a compact date label with clear due/expiration wording.
3. Display time as well as date for Added and Updated timestamps, preserving the user’s local timezone and an accessible full datetime value.
4. Give the agency stronger visual emphasis, preferably with a semibold/bold treatment that remains subordinate to the project title.
5. Make linked titles visibly recognizable as links through styling and/or a small external-link affordance while preserving keyboard accessibility and the existing `source_url` target.
6. Make the card search fields for project, location, and contact also match the agency name.
7. Suppress placeholder contact labels when contact name, phone, or email data is absent. Render only fields that exist; if no contact data exists, omit the contact row rather than showing “Contact pending” or “Contact email pending.”
8. Remove the Bid Sources section from the contract notes/details panel.
9. Remove the notes-panel stage/History header treatment and remove Next Action from the contract details panel.
10. Put a Show history/Hide history control under Latest Notes so history is revealed in-place without switching the panel into a separate history screen.
11. Represent history with real action timestamps and details where the database supports them. Determine whether `procurement_events` is readable through the current Supabase client and map its rows into the existing history model. Do not invent historical timestamps or actions when the database does not provide them.

## Current implementation findings

- Main contract cards are rendered by `ContractList` in `src/App.tsx`.
- Contract card fields currently include title, value, stage bubble, agency/location/category, date, summary, contact, latest note, and Added/Updated metadata.
- The title already links to `contract.sourceUrl`, but the current styling does not clearly communicate link affordance.
- Contract filtering/search logic is in `src/App.tsx`; agency must be added to the existing normalized search haystack for project/location/contact.
- The selected contract panel is rendered by `ContractContextPanel` and `NotePanel` in `src/App.tsx`.
- `Bid Sources`, `Next action`, and the separate History mode are currently rendered in `ContractContextPanel`.
- `NotePanel` currently places a History button in the header and renders Latest notes below it.
- `HistoryPanel` renders the existing `LeadHistoryItem[]` model, but contract history is currently created by `makeHistory` from frontend values and `history: ['Loaded from procurement_leads']`.
- `src/lib/procurement.ts` currently loads procurement lead rows and source rows. It maps `detected_change_at` to `contractLastUpdatedAt`, but does not query `procurement_events` or a persisted notes table.
- Existing database migration files include older `spin_` tables, while the live user-provided schema refers to `procurement_events`; the build phase must verify the live readable columns before adding a query.

## Technical approach

### Phase 1: Contract-card data and presentation

1. Keep `search_term_used` out of the `ContractOpportunity` presentation model unless it is needed for nonvisual behavior; do not add any card output for it.
2. Preserve the existing due/expiration calculation, but expose an explicit compact date label such as `Due Jan 12, 2027` or `Expires Jan 12, 2027` beside the mapped stage in the title-row status cluster.
3. Update `formatCardTimestamp` to include date and time, for example `Mon, Jan 12, 2027, 2:35 PM`, and use `<time dateTime="...">` where the source is a valid ISO timestamp. Keep a sensible fallback for legacy/mock display strings.
4. Style the agency span as a distinct semibold element. Keep agency plain text, not a link.
5. Add an external-link icon or CSS underline/arrow affordance to linked titles. Use an accessible label such as `Open source for {title}` and retain `target="_blank"`, `rel="noreferrer"`, and click propagation prevention.
6. Ensure missing contact data is omitted field-by-field. Do not substitute “Contact pending” in the production procurement mapping; use an empty/undefined contact name when there is no contact name or email.
7. Update the contract search haystack so it includes `agencyName` alongside project name, location, and contact name/phone/email. Preserve existing status/category/date filtering.

### Phase 2: Notes-panel simplification

1. Remove `sources` rendering from `ContractContextPanel` for contracts, including the Bid Sources heading and rows. Leave unrelated Generate/source UI untouched unless it shares a component and removal can be scoped safely.
2. Remove the contract panel’s Next Action block.
3. Refactor `NotePanel` to accept an inline history list and a history visibility state, or keep the state local to `NotePanel` if it only applies to that panel.
4. Keep the status/stage as a small contextual label if useful, but remove the current header History button/header treatment.
5. Under Latest Notes, add a text control labeled `Show history` / `Hide history`. When expanded, render the history list immediately below the notes. The control must be keyboard accessible and expose `aria-expanded` and an associated region.
6. Continue allowing note creation. A locally added note should immediately appear in Latest Notes and in the expanded history list with the same timestamp.

### Phase 3: Persisted history investigation and integration

1. Inspect the live `procurement_events` schema and access behavior using the existing Supabase client/session. Confirm available columns, especially lead ID, event timestamp, event type, detail, and dedupe key. Do not use anonymous/service-role credentials in frontend code.
2. If the authenticated staff user can read `procurement_events`, add a narrowly scoped query for the selected contract’s events, ideally in `loadProcurementContracts` or a separate `loadProcurementContractHistory` function. Select only required fields and order newest first.
3. Map event rows into `LeadHistoryItem`:
   - event timestamp -> `at`
   - humanized event type -> `label` (for example, `Added contract`, `Contract changed`, or the mapped action)
   - event detail JSON -> concise `detail`, preserving meaningful note/action information
   - event category -> `system`, `status`, or `note`
4. If a separate persisted notes table exists and is readable, load notes by lead ID and merge them with events by timestamp. If no persisted notes table exists, retain local note behavior but label it as session/UI state in the implementation notes; do not claim it is durable history.
5. If `procurement_events` is unavailable, blocked by RLS, or lacks the required timestamp/action columns, keep a truthful fallback history containing only the known record creation/update timestamps and clearly avoid fabricated actions. Surface a non-blocking empty/history-unavailable state if needed.
6. Avoid fetching full event history for every card in the list. Prefer loading history for the selected contract, or batch only if the existing page architecture requires it.

## Files likely to change

- `src/App.tsx`
  - contract search haystack
  - `ContractList` card layout and contact rendering
  - `ContractContextPanel` and `NotePanel`
  - history visibility and event display wiring
  - timestamp formatting/accessibility
- `src/lib/procurement.ts`
  - contact fallback behavior
  - optional event/history query and mapping
  - types for procurement event rows
- `src/styles.css`
  - title link affordance
  - agency emphasis
  - date/stage cluster alignment
  - inline Show/Hide history and history region styling
- Possibly a new focused data module under `src/lib/` if event loading should remain separate from lead loading.

## Edge cases

- A lead may have no expiration date; do not render an empty date bubble.
- A lead may have a due date but no contract end date; label the available date correctly as Due.
- A lead may have no title URL; render the title as plain text without a misleading link affordance.
- A lead may have no agency; omit the agency emphasis rather than showing a placeholder.
- A lead may have only a phone or only an email; render only the available value.
- Timestamps without timezone information must not be silently treated as local time if the database marks them as unzoned; preserve the database value and use the existing safe formatter behavior.
- Events may contain null or non-object detail JSON; show the event label and timestamp without crashing.
- RLS may allow `procurement_leads` but deny `procurement_events`; contract cards must still load and history must degrade gracefully.
- Existing mock company cards and the Generate tab should not be changed by contract-only requirements.

## Testing strategy

1. Run lint and production build.
2. With a live signed-in Supabase user, verify Contracts loads using `detected_change_at` and that the page does not query `contract_last_updated_at`.
3. Verify card layout at desktop and narrow widths: stage and expiration/due date remain aligned and readable.
4. Verify Added and Updated show both date and time and have accessible datetime values.
5. Verify agency is visually emphasized, linked titles are visibly recognizable, and titles without URLs are not styled as links.
6. Verify search matches project title, location, contact name/phone/email, and agency.
7. Verify missing contact values produce no “pending” placeholders.
8. Verify Bid Sources and Next Action are absent from the contract notes panel.
9. Verify Show history/Hide history toggles inline history and works with keyboard navigation.
10. Verify notes appear with timestamps and do not break when event history is empty or denied.
11. If live events are available, verify at least one persisted event renders with its database timestamp and action/detail. If unavailable, document the exact RLS/schema limitation rather than treating the fallback as a complete audit trail.

## Success criteria

- Contracts cards contain no visible `search_term_used`.
- Date/status placement, timestamps, agency emphasis, link affordance, and search behavior meet the requested interaction and scanning goals.
- Missing contact data is omitted without placeholder text.
- Contract notes panel contains notes plus an inline Show/Hide History control, with Bid Sources and Next Action removed.
- History displays real persisted event timestamps/actions whenever the authenticated Supabase schema permits it, and otherwise communicates a truthful graceful fallback.
- Lint and production build pass.

## Open implementation decision

The requested history behavior depends on whether the live Supabase `procurement_events` table is readable to the signed-in staff user and what its exact columns are. The build phase should verify this first. If it is not readable or does not contain enough information, implement the UI toggle and truthful fallback, then create a separate database/RLS task rather than fabricating an audit trail in the frontend.
