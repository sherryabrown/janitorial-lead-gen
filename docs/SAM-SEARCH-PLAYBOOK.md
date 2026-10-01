# SAM search and capture — verified September 16, 2026

## Current reusable procedure

Use [PROCUREMENT-WORKFLOW.md](PROCUREMENT-WORKFLOW.md) and `node scripts/procurement-workflow.mjs help` for new batches. The original research CLI also exposes `workflow --repo REPOSITORY help`. Both the original Python CLI and its `WORKFLOW.md` were updated after reflecting on the completed import.

The current process uses explicit batch/run/request IDs and reviewed process/defer decisions, binds approvals to exact SQL/schema artifacts, requires offline transaction tests, checks live schema before apply, and verifies readback. It reports preparation separately from committed results and blocks blind retries after uncertain outcomes. Staging remains distinct from canonical import. No new search or live database changes were performed while implementing this reusable update.

The remainder of this document is the historical September 16 run and the still-valid SAM search guidance. Its batch-specific preparation commands are archived, **not instructions for a future import**. The two historical preparation scripts now refuse to run without `--historical-batch`; use the reusable workflow instead. The original CLI was search-only at the time of the historical text below; it now forwards the reviewed workflow too.

## Applied intake reconciliation — September 16, 2026 (September 17 UTC)

The approved processing batch is now committed and verified: **321 → 324 leads**, three new awards, 74 existing-lead evidence enrichments, and 78 intake-to-lead links with matching intake statuses set to `processed`. Of these links, 77 come from the current SAM capture and one backfills the older ARBuy `S000000473` detail-page snapshot. Intake totals: 78 processed, 23 pending, one ignored. No intake records were deleted. The GSA forecast and historical unmatched notice remain pending; no forecast was inserted.

`procurement_intake_leads` stores `(intake_id, lead_id)` provenance; `procurement_intake_items.status` stores processing state. Several intake records can support one lead. Processing means the captured evidence was retained and linked, **not** that every location/date uncertainty has been resolved. The three new awards retain their uncertainty notes and `needs_location_review` request classification.

### Separate capture, prepare, apply, and verify

Search and `prepare-sam-upserts.mjs --capture` still do not change canonical leads. The original research CLI's `sam-search` forwarding command remains search-only; its existing help accurately states that it does not change leads. Use the separate processing CLI for approved reconciliation:

```powershell
# Read-only database snapshot; use new filenames each time.
node scripts/intake-snapshot.mjs outputs/sam-search/intake-before-NEXT.json
# Offline preparation from the saved snapshot and explicit ten-run manifest.
node scripts/prepare-intake-processing.mjs outputs/sam-search/intake-before-NEXT.json outputs/sam-search/NEXT_reviewed
# After inspecting manifest, exclusions, SQL, and test results, apply explicitly:
npx.cmd --yes supabase db query --linked --file outputs/sam-search/NEXT_reviewed.sql
# Read back live state and verify, rather than assuming an empty CLI result means success.
node scripts/intake-snapshot.mjs outputs/sam-search/intake-after-NEXT.json
node scripts/verify-intake-processing.mjs outputs/sam-search/intake-before-NEXT.json outputs/sam-search/intake-after-NEXT.json outputs/sam-search/NEXT_reviewed.json outputs/sam-search/NEXT_verification.json
```

These commands illustrate the reviewed batch workflow, not a general-purpose auto-approval system. The preparation implementation is deliberately restricted to the ten run IDs, three approved award identities, reviewed notices, and one reviewed historical ARBuy detail page. Future batches require an explicitly reviewed scope. Never add a lead merely because it is unmatched.

The artifact actually applied was **`008_intake_processing_final.sql`**, rendered from `008_intake_processing_reviewed.json`. `008_intake_processing.sql` and `008_intake_processing_reviewed.sql` are superseded preparation drafts; do not apply them. Likewise, the old `007_incremental_sam_capture_2026_09_16.sql` includes an unapproved forecast addition and is not this processing batch. Preserve these artifacts for audit only. To render an existing manifest with the current generator without changing IDs, use `prepare-intake-processing.mjs --render MANIFEST.json NEW_SQL_PATH`.

### Verified safeguards and lessons

- Full contract identity, source/notice IDs, and reviewed official detail-page identifiers establish matches. Page-level indexes are not contract identities: 21 older snapshots remain pending. The one older match was proven by the same source, exact detail URL, and solicitation `S000000473` explicitly present in the page.
- Link/status reconciliation is independent of payload changes: an unchanged lead can still need provenance backfill.
- A single transaction guards canonical payloads, intake contents/statuses, existing links, and cross-source duplicates. Locks have a ten-second timeout; unexpected changes reject the batch instead of overwriting them. Reuse the exact manifest for a replay, not a newly generated set of IDs.
- The live `procurement_sync_lead_columns` trigger can overwrite dedicated dates/locations from older payload facts even when only evidence is added. Offline testing caught an Ozark/Russellville difference. The transaction preserves existing dedicated fields across that trigger; new awards still receive derived fields normally. No trigger or UI changes were necessary.
- Source evidence additions correctly generated 77 history events/versions (three new leads, 74 enrichments). Link-only processing does not create false source-change events or change lead timestamps. Observation IDs are excluded from canonical SAM evidence.
- Offline tests use the captured live columns, constraints, date parsers, and both lead-write triggers, and cover rollback after the upsert, concurrent edits, duplicate protection, unchanged-payload linking, and exact no-op replay including history. They do not simulate network failures, RLS, or competing database sessions; production readback independently verified the committed state.
- `intake-before*.json`/`intake-after*.json` snapshots contain user-managed fields and are excluded from Git. Keep them local for verification, not as broad overwrite/restore scripts. After commit, use reviewed forward corrections, never a wholesale snapshot restoration over later user edits.
- The repository playbook is the current procedure linked by the original research workflow. No changes to the original search-only forwarding behavior were needed.

Test commands:

```powershell
node --test tests/intake-processing.test.mjs tests/sam-capture.test.mjs
$env:PROCUREMENT_RESEARCH_DIR='C:/Users/sherr/Documents/Codex/2026-09-09/browser-plugin-browser-openai-bundled-the'
node tests/intake-processing-sql.mjs
```

The following collection sections preserve the original search procedure. References below to unprocessed candidates and `007` describe the **pre-processing** stage; the committed `008` results above supersede those statuses.

The real SAM Opportunities and Contract Awards APIs were tested successfully with `SAM_GOV_API_KEY` stored in Supabase. No local copy of that key, app sign-in, frontend change or Netlify deployment is required.

## Run a search

From this repository, with Node and an authenticated Supabase CLI:

```powershell
node scripts/sam-search.mjs opportunities '{"postedFrom":"09/17/2025","postedTo":"09/16/2026","state":"AR","ncode":"561720","limit":1000,"offset":0}'
node scripts/sam-search.mjs awards '{"dateSigned":"[09/17/2025,09/16/2026]","placeOfPerformStateCode":"AR","naicsCode":"561720","limit":100,"offset":0}'
```

Use current, explicit dates on future runs. The examples reproduce the tested scope, not an automatically moving window.

The CLI reads the existing new-style Supabase server key into memory through the authenticated management CLI. It sends that key only to this project's private `sam-search` function. The function reads the SAM key inside Supabase and sends it only to the hard-coded `api.sam.gov` endpoints. Neither key is printed or saved. The function is not browser-accessible with a publishable key and has no UI integration.

Each invocation makes ONE SAM request. It first records a pending audit in `procurement_runs`, then saves the sanitized response, exact filters, upstream status, count and pagination status. The local response is saved under `outputs/sam-search/<run-id>.json`. Both APIs use a zero-based PAGE INDEX (`offset`), not record count. If `complete_for_query` is false, review the response and continue the next page; never claim a first-page response is complete. Do not retry blindly after a timeout: inspect the saved audit first.

## Search scope and limits

- Search NAICS and keywords separately; do not combine every keyword with NAICS 561720. This run used opportunity title searches for cleaning, clean, janitorial, custodial and housekeeping, plus a multi-state title search for Arkansas with NAICS 561720.
- Opportunities: `/opportunities/v2/search`, required `postedFrom`/`postedTo`, maximum one-year span. `state` means work location. Office and vendor addresses are NOT evidence of work location.
- Awards: `/contract-awards/v1/search`; response rows are `awardSummary`. A valid zero result can instead be `awardResponse.totalRecords = "0"` with the explicit no-data message. Do not misreport either envelope as an API failure.
- Contract awards are ACTIONS (including modifications). Deduplicate action IDs, then group by PIID, awarding subtier, referenced IDV PIID and referenced IDV subtier. The latest signed action within a window is not guaranteed to be the latest action of all time.
- API `Active` does not mean open for bidding. The Ozark and Pool 2 notices returned by this run had elapsed deadlines.
- Multi-state notices can be missed by a strict state filter. Keep richer manually verified work sites from Friday; absence in a narrow API result is not deletion evidence.
- This bounded run made ten SAM requests. Default daily quotas can be low; inspect actual 429 responses and stop rather than repeatedly retrying. No recurring schedule was created.

## Forecasts are a separate collection path

No SAM forecast endpoint was verified. GSA's public Acquisition Gateway was searched through its UI, without sending it the SAM key. All 75 Arkansas listing summaries were screened using service terms and NAICS. One relevant detail was opened: FWS2025001061 in Crossett. It is an option-exercise forecast with elapsed planned dates, not an open solicitation. The capture records this limitation. This does not replace the existing USACE forecast or establish complete federal forecast coverage.

Official sources:

- https://open.gsa.gov/api/get-opportunities-public-api/
- https://open.gsa.gov/api/contract-awards/
- https://acquisitiongateway.gov/forecast
- https://open.gsa.gov/api/ag-api/ (placeholder documentation; not a verified forecast API)

## Capture and prepare upserts

```powershell
node scripts/prepare-sam-upserts.mjs
node scripts/prepare-sam-upserts.mjs --capture
```

The first command reads the LIVE lead baseline and prepares the SQL and reconciliation files. The second additionally inserts missing captures into existing `procurement_intake_items`, preserving prior reviewed/ignored intake, and records the browser forecast audit. Neither command applies canonical lead upserts. Raw SAM responses remain in `procurement_runs`; the function itself never modifies leads.

The preparation script is scoped to this Arkansas pilot and source registry, including its existing search-request UUID. Do not reuse it for another project/state without adapting that scope. It reads saved UUID-named responses in `outputs/sam-search`; keep only the intended run set there when preparing a different batch. Preserve an archive of prior results first.

The generated SQL follows Friday's source/external-ID upsert pattern, with a live-baseline guard and transaction. Existing USAspending awards are matched by their FULL `CONT_AWD_...` identity; matching only title or PIID is insufficient. Existing canonical values, original creation time, owner, stage/reason, notes, follow-up and annual amount are preserved. SAM evidence is appended, with conflicting dates/incumbents recorded for review rather than silently replacing Friday's richer data. Capture run IDs stay out of canonical payloads to avoid false source-change events.

New unmatched awards and uncertain notice relationships stay in intake for review. The current SQL proposes one GSA forecast and 73 existing-lead enrichments. Review `upsert-records.json`, particularly `review` and `excluded`, before separately applying the SQL. Replay is a no-op; unexpected source changes reject the transaction.

## Verification

Real HTTP 200 responses are saved in the ten run captures. Local tests are additional validation, not a substitute for those live responses:

```powershell
node --test tests/sam-capture.test.mjs
$env:PROCUREMENT_RESEARCH_DIR='C:/Users/sherr/Documents/Codex/2026-09-09/browser-plugin-browser-openai-bundled-the'
node tests/sam-upsert-sql.mjs
```

The SQL test uses the captured real baseline in a local PostgreSQL-compatible engine. It validates SQL syntax, sales-field preservation, replay and conflict rejection; it does not exercise every production trigger or apply anything to Supabase leads.
