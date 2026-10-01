# Intake-to-lead links, status backfill, and three award promotions

## Completion — September 16, 2026 local / September 17 UTC

SUCCESS. Applied `outputs/sam-search/008_intake_processing_final.sql` to the linked Supabase project and verified live readback against the pre-application snapshot. Canonical leads: 321 → 324. Three awards inserted; 74 existing leads enriched; 78 intake links created and matching statuses processed. Intake totals: 78 processed, 23 pending, one ignored. No UI changes or additional API calls.

The older-intake inventory yielded one proven match (ARBuy `S000000473`); 21 page-level snapshots remain pending. The historical forecast and unmatched solicitation were not promoted. Three new awards retain uncertainty notes and location-review request classifications.

Implementation adds a separate, explicit `prepare-intake-processing.mjs` workflow; ordinary search/capture stays unchanged. The reviewed manifest and original captures remain auditable. Existing sales fields and all dedicated source fields were preserved. Offline tests exposed a production payload-sync trigger that otherwise would overwrite a saved location; the final transaction preserves existing dedicated fields across this trigger while still deriving fields for newly inserted awards.

Validation: 12 unit/capture tests; transaction tests using actual live columns, constraints, parsers, and lead-history triggers; rollback after upsert; concurrent intake/evidence/link/duplicate conflicts; preservation of concurrent sales edits; unchanged-payload provenance linking; exact no-op replay. Production build passed after sandbox-related read restrictions were resolved through approved escalation. Live verification confirmed all 78 links/statuses, preserved user/source fields, and 77 appropriate history events/versions. No production replay was necessary.

Results and new lead IDs: `outputs/sam-search/RESULTS.md` and `intake-processing-verification.json`. Updated the repository playbook and added preparation/snapshot/verification CLI commands. The original research workflow already links this playbook and its search-only forwarding help remains accurate; it did not need modification. The remaining document records the approved implementation plan.

## User prompt

> [$plan-code] okay, please proceed with creating these links and status change in procurement_intake_leads, backfilling accordingly, and with processing the three new leads

Context: retain source intake records, link them to canonical leads, and mark successfully processed intake records `processed`. Existing contracts are identified by full contract identity, not similar titles or locations. No UI changes.

## Outcome and scope

Implement and apply a guarded backend-only reconciliation that adds the three approved award candidates, saves captured evidence for matching existing leads, creates intake-to-lead links, and completes intake processing atomically. Preserve raw intake records and all user-owned sales data.

This document is a plan only. No production writes were performed while planning. A subsequent build of this plan includes the scoped production application and verification, not merely delivery of unapplied SQL.

Status lives in `procurement_intake_items.status`, not `procurement_intake_leads`. Do not add a redundant status column to the link table.

Not in scope: UI work, Netlify deployment, additional SAM requests, new integrations or schedules, automatic resolution of conflicting canonical facts, deleting intake, or promoting the historical forecast/unmatched solicitation. The prior prepared forecast insert must not be applied incidentally with this batch.

## Verified starting point

Read-only live inspection during planning found:

- 321 canonical leads, 102 intake records, zero intake-to-lead links.
- `procurement_intake_items`: UUID `id`, required `source_id`, `external_id`, `payload`, `review_reason`, `status`, `updated_at`; unique `(source_id, external_id)`; status values `pending`, `processed`, `ignored`.
- `procurement_intake_leads`: UUID `id` defaulting to `gen_random_uuid()`, required `intake_id` and `lead_id` foreign keys, unique `(intake_id, lead_id)`; no status column.
- Current capture contains 74 award groups, five notices, and one forecast. The other 22 intake records predate this capture.
- `scripts/prepare-sam-upserts.mjs` currently stages captures, proposes 73 existing-lead evidence enrichments and one forecast addition, and deliberately excludes unmatched awards. It does not generate intake links/status updates.
- Exact award matching already compares SAM full identity with USAspending `CONT_AWD_${identity}` or the same identity under `sam-awards`. Existing canonical values are retained, with differences captured in `sam_api_evidence`.
- Three notice intakes can be linked: two existing notices plus the multi-site award notice attached to an existing contract. The last shares its canonical lead with an award intake; this is legitimate many-to-one provenance.
- `tests/sam-upsert-sql.mjs` validates lead-only SQL against a minimal local schema. It must be expanded for intake/link constraints and atomic rollback; it does not currently simulate all production triggers.

Pertinent files: `scripts/prepare-sam-upserts.mjs`, `scripts/lib/sam-normalize.mjs`, `tests/sam-capture.test.mjs`, `tests/sam-upsert-sql.mjs`, `docs/SAM-SEARCH-PLAYBOOK.md`, and the captured evidence under `outputs/sam-search/`.

## Phase 1 — Build a deterministic reconciliation manifest

1. Re-read live leads, intake items, links, relevant request links, and source registry, with pagination. Inspect relevant live triggers/constraints before constructing write SQL. Do not assume planning-time counts remain current.
2. Use an explicit capture/run manifest for this September 16 batch rather than silently ingesting every future JSON file in the directory. Preserve existing captures and prior SQL as audit artifacts.
3. Separate canonical lead changes from intake processing decisions. A lead with identical payload still needs its missing link/status backfilled. Do not derive the link worklist solely from the filtered payload delta.
4. Each processing decision records intake ID and source/external identity, expected intake payload/status/review reason/update timestamp, target lead identity/ID, matching basis, expected existing links, canonical evidence action, and a concise processing reason. Include expected canonical payload/search term and resolved source IDs.
5. Use full four-part award identity: PIID, awarding subtier, referenced IDV PIID and referenced IDV subtier. Preserve existing source/external IDs on cross-source matches. A missing parent identifier is not a wildcard. Multiple exact candidates, PIID-only matches, or contradictory prior links must be held for review.
6. Match the two existing notices by source and notice ID. Link the award notice only through its verified full-identity award relationship. Do not infer relationships from names, titles, locations, or the fact that a solicitation and award sound related.
7. Inventory the 22 older intake records for backfill as well. Backfill only uniquely proven relationships to existing leads, with evidence already retained or a reviewed non-destructive evidence merge. Report exact matches and exclusions individually. Do not create additional canonical leads from older intake, manufacture intake for older leads, overwrite prior reviewed payloads, or revive ignored items. Uncertain records remain untouched. Respect legitimate existing multi-lead relationships; do not impose a new one-to-one schema restriction.

### Approved award promotions

Use `sam-awards` source and these exact external identities if still absent across both award sources:

| Identity | Classification and retained uncertainty |
| --- | --- |
| `12444026C0006_12C2_-NONE-_-NONE-` | Forest Service Poteau/Cold Springs janitorial; incumbent FORTAZO CORP. Retain reported Hot Springs National Park performance location and explicitly note facility-location uncertainty. Retain reported 2031 completion values without interpreting all options as exercised. |
| `W519TC26CA043_9700_-NONE-_-NONE-` | Pine Bluff Arsenal custodial; incumbent A&M JV LLC. Preserve reported Little Rock location and explicitly record conflict with the named Pine Bluff facility. Preserve current versus potential completion dates separately. |
| `697DCK24C00028_6920_-NONE-_-NONE-` | FAA QXR ARSR janitorial/grounds; incumbent UNIQUE CLEANING SERVICE, INC. Preserve NAICS 561210, reported Little Rock location, and uncertainty about exact facility/mixed service scope. |

- These are approved for creation as awarded-contract/incumbent research leads, not verified open solicitations. Uncertain details do not disappear merely because intake is processed.
- Reuse `awardPayload` plus captured evidence and explicit factual uncertainty notes in payload; do not overwrite user notes or stage reason to store these qualifications.
- No annual revenue inferred from obligations, contract totals, options, or the 50/50 funding description. Use normal database defaults for sales fields.
- Link all three to the existing Arkansas pilot search request, with `needs_location_review` and specific reasons while facility uncertainties remain. Verify that this existing match status is permitted by the current schema.
- If a candidate has since been created under either source, resolve it as an existing lead rather than inserting a duplicate. If ambiguous, stop that planned application for review instead of guessing.

## Phase 2 — Generate and test one guarded transaction

Extend the preparation code proportionally (extract pure reconciliation/SQL helpers if needed for testing). Keep the search function search-only and preserve the current prepare-versus-apply distinction. Add a clearly named processing mode/manifest so ordinary search capture cannot unexpectedly promote awards.

Generate a new versioned SQL artifact for this batch, separate from `007_incremental_sam_capture_2026_09_16.sql`. Its write set must exclude the historical forecast insert. Do not run both old and new batches as a sequence.

Transaction order:

1. Load manifest into temporary tables; acquire consistent locks protecting canonical cross-source identity checks, affected intake, existing links, and request links. Use bounded lock timeouts and fail clearly on contention.
2. Validate expected baseline against current state. Reject changed/deleted/replaced intake, unexpected links, canonical payload changes, new cross-source duplicates, missing sources, or invalid request targets. Accept the exact already-applied desired state for safe replay. Recheck cross-source identities inside the transaction, not only during preparation.
3. Insert the three absent awards; enrich the 73 existing leads with the captured evidence without replacing established dates, incumbent, contacts, locations, or user sales fields. Older-intake matches must have a separately reviewed minimal evidence action, if any.
4. Resolve canonical IDs and insert `(intake_id, lead_id)` links with `ON CONFLICT (intake_id, lead_id) DO NOTHING`. Reject unapproved conflicting links before this point rather than treating conflict avoidance as identity validation.
5. Insert missing scoped request links without overwriting prior manual classifications.
6. Mark only successfully reconciled intake records `processed` after verifying their expected links and persisted evidence. Preserve raw payload and original review rationale; any appended processing explanation must be deterministic, non-duplicating on replay, and baseline guarded. Change `updated_at` only when status/reason actually changes.
7. Assert all manifest postconditions before committing. An error at any stage rolls back leads, links, request links, statuses, and database-triggered history together.

Existing lead `created_at`, owner, stage/reason, notes and note history, follow-up, annual estimate, and attribution fields must remain unchanged. Lead source timestamps change only for actual source/evidence changes, not simply because a provenance link was added. Preserve existing comparison behavior and its limited search-window caveat; do not claim conflicts have been resolved.

### Tests

- Full contract identity matching; same PIID with different subtier/parent does not merge; malformed identity is rejected.
- Repeated actions group into one contract; cross-source match does not create another lead.
- Three approved identities promote, but arbitrary unmatched awards do not.
- Two intake records can legitimately link to one canonical award (award API + award notice).
- Unchanged canonical payload still gets missing provenance link and processing status.
- Preexisting desired links/statuses are no-ops; replay leaves all IDs, counts, payloads, timestamps and history unchanged.
- Ambiguous matches, ignored intake, unrelated pending records, historical forecast, and unmatched historical solicitation remain untouched.
- Older exact matches are backfilled only when evidence retention is established; no invented intake records.
- SQL test schema includes real intake/link foreign keys, unique constraints and status checks, plus relevant lead/request constraints. Use captured real data; synthetic conflict fixtures stay strictly offline.
- Force a failure after canonical upsert but before status completion and verify full rollback.
- Concurrent intake edits, conflicting links, changed canonical evidence and a newly inserted cross-source duplicate reject safely. Concurrent sales-field changes are preserved, never overwritten.
- Verify production trigger behavior in proportion to risk before application; disclose any offline simulation limitations.

## Phase 3 — Apply, verify, and document

1. Produce an operator-readable dry-run summary: new leads, existing evidence updates, links, status changes, older-intake matches, and unresolved items. Explain the scope before application. No extra API calls are necessary.
2. Save a scoped pre-application snapshot of all affected rows and links without credentials. Use authenticated server-side tooling only; never expose keys or route this through the browser/UI.
3. Execute the reviewed SQL against linked project `zreplhkoxswtzxlchtjf` using the existing CLI, subject to normal environment approval requirements. If live state diverged, regenerate/review rather than bypassing the guard. On uncertain command completion, read back transaction postconditions before retrying.
4. Verify live canonical rows, preserved sales fields, link relationships, intake statuses, request classifications, and generated history. From the planning baseline, expected canonical count is **324** (321 + three awards), not 325: the historical forecast is excluded.
5. The current capture should yield **77 processed/linkable intake records**: 74 award intakes and three notice intakes linked to 76 canonical leads (74 contracts and two standalone notices). The forecast and unmatched historical solicitation remain pending; bridge-deck construction remains ignored. Exact older-intake backfill adds to these counts and must be reported separately, not guessed.
6. Verify replay safety offline first; a controlled production replay may validate a true no-op only after successful readback. Never restore wholesale snapshots over later user edits. Failed transactions require no compensating deletion; any post-commit correction needs a scoped, reviewed forward change.
7. Update `outputs/sam-search/RESULTS.md` and `docs/SAM-SEARCH-PLAYBOOK.md` with actual applied counts, uncertainties, processing rules, commands, and the distinction between capture and promotion. Only after the workflow succeeds, update the original research playbook/CLI forwarding help if needed; changes outside the repo require the applicable filesystem approval. Do not broaden CLI search into automatic canonical writes.
8. Report the three created (or already-found) lead IDs, counts of new links/processed records, evidence updates, unresolved records, and whether the transaction committed. No UI changes, deployment, commit, or new scheduling is included.

## Success criteria

- All three approved awards exist exactly once and remain accurately labeled as awards with uncertainties retained.
- Proven existing-lead intake relationships are backfilled, including safe older matches, without duplicate canonical contracts.
- Every intake record processed by this batch has its approved link(s) and retained evidence; no unrelated record changes status.
- Intake is retained, not deleted; status resides on intake items and provenance resides in the existing link table.
- Transaction, concurrency guards, no-op replay, and preservation tests pass; live postconditions are verified and documented.
- App source files and user-managed sales information are unchanged.
