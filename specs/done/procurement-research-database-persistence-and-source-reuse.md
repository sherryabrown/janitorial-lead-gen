# Procurement research database persistence and geography source reuse

## Initiating prompt

User invoked `$plan-code`:

> Where are the findings stored that you just found? If they are local, why aren't they in the database? Certainly the information needs to be part of the skill or a skill that is called to import the verified findings into the application. The process used to do this so what's going on here? Also, have the sources for the requested geography been captured so when they are requested again, the sources to go to are already known?

## Problem and intended outcome

Restore the expected application workflow: a procurement research request for an Arkansas city/county reuses known database sources, saves newly discovered sources and unresolved findings, and imports evidence-backed findings with truthful classifications and provenance. Local files remain evidence/checkpoints, not the only home of application data. A task cannot be reported complete merely because local JSON was written.

Extend the existing `arkansas-procurement-leads` skill and its existing runner; do not create a competing importer or depend on an informal instruction to use a second skill. The user has expressed the intended database behavior here. During implementation, honor that scoped authority and subsequent application-research requests without requiring the user to repeat a generic import instruction. Explicit research-only/export-only requests still stop at their stated boundary. Preserve concrete review decisions, tests and package hashes without equating those internal controls with an automatic requirement for another user confirmation.

This turn creates a plan, not a live import. Implementation must include both the reusable workflow repair and migration of the September 30 findings/sources. No UI redesign, deployment, signup, Gmail permission changes, email or recurring monitor is required.

## Verified current state — September 30, 2026

Read-only live snapshot: `outputs/procurement-access/planning-before-research-persistence-20260930.json`, project `zreplhkoxswtzxlchtjf`. It has 29 procurement sources, 324 leads, 102 intake items, 78 intake links, and one search request: the legacy statewide Arkansas janitorial pilot. The new SSC/DHS findings were not located in the lead snapshot. Existing records are baseline user data to preserve.

Current research artifacts:

- `outputs/procurement-access/sources.json`: 12 real source/access records, with 9 associated with Ouachita County and 7 with Texarkana, Arkansas; shared sources explain the overlap. Contains coverage/access status, official URLs, scope associations and next actions. It is Git-ignored, local and not synchronized to the application database.
- `outputs/procurement-access/evidence/2026-09-30-ouachita-texarkana/findings.json`: five finding/evidence records, not five independent verified leads.
- Same directory: `report.md`, `sam-review.json`, original DHS and TASD PDFs, extracted pages and sanitized retrieval audits.
- `outputs/sam-search/<run-id>.json`: ten API captures. SAM wrote database response audits, not these findings into lead/intake tables. All eleven distinct opportunity notices returned were excluded from local service/geography scope; do not import them as local leads.

Why the path stopped:

1. The completed API/access-tracking plan explicitly selected local access files, excluded Supabase writes, and instructed against automatic source synchronization. Its completion did not implement database source reuse.
2. `SKILL.md`, `references/runner-and-import.md`, and `docs/PROCUREMENT-WORKFLOW.md` distinguish research from import; the agent interpreted the user's research request too narrowly and stopped there. This was a workflow/interpretation failure, not missing Supabase/SAM access.
3. `scripts/procurement-workflow.mjs stage` accepts SAM run captures only. It does not stage the document-derived `findings.json` format or create new sources/requests.
4. `scripts/lib/reviewed-batch.mjs` already supports review of manual intake payloads once staged. Reuse that path; it does not establish city/county scope automatically.
5. `src/lib/procurement.ts` loads `procurement_leads` and `procurement_sources`; local JSON and intake-only rows are not application contract/source records. Its displayed bid types are forecast/opportunity/award/unknown, so historical and provisional meanings must survive mapping and notes.

## Existing database structures to reuse

- `procurement_sources`: observed fields include `id`, `code`, `name`, `url`, `identity_key`, `source_coverage_areas`, `config`, classification fields and timestamps. Store sanitized research coverage, request associations and provenance in existing coverage/config fields where supported. Do not introduce another source table by default.
- `procurement_search_requests`: observed fields include requested areas, boundary mode, service scope, search windows, scope resolution state and agency levels. Create/reuse the actual Ouachita countywide and Texarkana Arkansas city requests; do not substitute the statewide pilot UUID.
- `procurement_intake_items`: source/external identity, payload, review reason and pending/processed/ignored status. Preserve candidates here with reasons; existing pending/ignored/processed rows must not be silently overwritten or revived.
- `procurement_intake_leads`, `procurement_request_leads`, versions/events: reuse the current transaction, geographic relationship and history mechanisms.

Before writes, inspect current live columns, constraints, triggers, RLS and enum behavior. Repository migrations do not fully describe these current tables. Prefer existing fields; propose a small migration only for a proven missing constraint/representation that cannot safely be handled by existing structures. Do not seed/recreate tables or run historical full-load SQL.

## Phase 1 — Connect the skill to database-backed research and source reuse

1. Update skill entrypoint, discovery, API/access tracking, runner reference and maintained workflow documentation together. Define the default for this application's authorized geographic procurement requests as discover/reuse → collect → persist source/intake → review → import verified records → live readback. Explicit standalone research-only requests remain supported.
2. At task start, read database source coverage/request associations as well as the local access ledger. Match canonical official source/provider/agency identities and current jurisdiction/service scope before discovery. Reuse known URLs and current access; recheck freshness/coverage and continue discovery for missing agencies. A known source does not establish complete coverage or actual work-site geography.
3. Add a reviewed source/request registration operation to the existing CLI, using its trusted Supabase access. Match existing sources by verified identity/aliases and URL/agency evidence, not name alone. The local `arkansas-dhs-public` record should map to the existing `dhs` source if confirmed. SAM ledger identity must map explicitly to the appropriate existing `sam` and `sam-awards` database sources; do not collapse notice/award identities. Review shared USACE/GSA/state entries against existing rows and split distinct official agency sources where necessary.
4. Union source coverage areas and request associations without replacing earlier geography, provider configuration, user changes or richer metadata. Distinguish where a source can discover work from where a specific contract performs. Keep independent forecast/opportunity/award status, checked time, query/document references, limits and next action.
5. Use `config` for versioned, sanitized scope/coverage metadata if current schema supports it; preserve existing keys. Keep secrets, tokenized URLs, mailbox contents, Gmail/Resend connection credentials and legal/tax information out of source rows. Local evidence paths may be audit references but are not cross-machine URLs: store authoritative URL, relevant excerpt/page, content hash and retrieval time in database provenance.
6. Create/reuse explicit geographic requests by resolved normalized scope, service/date windows and existing identity conventions. Do not invent database UUIDs from a prose local request reference. Registration must be idempotent and reconcile uncertain outcomes/races before retrying. Return source/request mappings and a verified receipt; persist confirmed IDs into the local ledger without discarding history.
7. Inspect permissions exposed by the application loader before placing metadata in `config`. Persist only metadata suitable for that access level; credentials remain in the existing secure store. No new public write policies or frontend service key.

## Phase 2 — Stage document findings and import the September 30 results

1. Add a documented manual-capture normalization/staging command to `scripts/procurement-workflow.mjs`, with a focused library such as `scripts/lib/manual-capture.mjs`. Input must bind the configured project, source/request mappings, explicit finding IDs, source documents/URLs, hashes and collection scope. Reuse intake uniqueness and existing review/package machinery rather than append ad hoc database inserts.
2. Require real evidence for each normalized field. Preserve published versus inferred dates/values; source URL/page, normalized capture hash, agency, service relevance, geographic evidence, primary/secondary confidence, unresolved facts and observed record stage. Missing values remain null. Local discovery IDs are not verified agency solicitation/contract numbers.
3. Manual staging saves official findings and secondary candidates with explicit pending/deferred review reasons. Preserve existing intake originals and links. Changed evidence uses the existing supported evidence update/version strategy or an explicit amendment identity; do not silently replace a processed original. Store stable document/record identities; a revised attachment must not duplicate the same contract, and a whole index page must not become a lead.
4. Extend preparation/package verification only where necessary to bind selected manual evidence to current captures. Existing manual review code accepts already-staged payloads; retain that support and tests. Allow a manual-only package to use no unrelated SAM captures. Reuse current user-field protection, trigger-aware dedicated-field preservation, rollback/replay tests, hash integrity and transaction readback.
5. Apply the user's expressed application-persistence intent through explicit internal review decisions for verified additions and an auditable authorization reference. Do not fabricate a user-issued hash. Explain concrete intended counts before writing, generate/review/test the actual package, then use the existing guarded apply. Ask only if a genuinely new scope, irreversible commitment or unresolved choice requires it; existing authorization is not erased by CLI approval flags.
6. Backfill the actual September 30 records as follows, after source/request mapping and geography review:

   | Saved record | Treatment |
   |---|---|
   | TASD SSC district-wide custodial contract | Eligible as a board-approved award finding, with `award_stage=board_approved_contract`, amount $1,697,356.08, observed approval May 19, 2026 and July 1 start. Do not represent signed execution as verified. Preserve the one-year term/four annual renewal options; June 30, 2027 is calculated, not proof of an announced rebid or exercised option. Retrieve/verify school work sites or mark the request relationship as needing location review. |
   | DHS IFB 710-25-028 Ouachita work site | Eligible historical solicitation with primary page-9 county/address evidence. Expired bid, proposed start/term and unknown current incumbent must remain explicit. Verify amended deadline evidence before canonicalizing it; otherwise retain it as an attributed/unresolved field. |
   | DHS sustained protest | Attach as evidence/history to that solicitation after exact identifier corroboration; not a separate winning contract. No inferred Aquamen/O.J.'s incumbent. |
   | Bearden floor-maintenance candidate | Save as pending intake/source discovery until primary solicitation/award verification; no verified canonical lead yet. |
   | TASD secondary RFP candidate | Preserve as pending related history until original RFP identity is corroborated; avoid a second canonical SSC contract based on title/term similarity. |

7. Canonical classifications and application presentation must remain truthful: a past solicitation cannot be an open bid; board approval cannot be signed-contract verification; options are not forecasts. Inspect existing mapping/filter behavior and use supported status/evidence fields. If a small mapping correction is needed to prevent a misleading open label, implement/test it without redesigning UI. Preserve unknowns and evidence notes visibly where existing UI permits; report any remaining display limitation.
8. Capture database preconditions and run appropriate offline SQL tests before registration/import operations. Apply only reviewed deltas; read back sources, requests, intake, canonical records, associations and evidence. Verify application loader results and filter behavior from persisted rows. Report actual created/reused/enriched/deferred counts and IDs. Failed/uncertain commit means reconcile readback, not rerun blindly.

## Phase 3 — Prove repeat requests reuse sources without duplicates

1. Add meaningful tests alongside `tests/reviewed-workflow.test.mjs` and existing capture/SQL tests for manual-only normalization/staging, missing evidence, primary versus secondary classification, invalid project/source/request mappings, protected intake/user fields and rollback/replay.
2. Source tests must cover an existing DHS mapping, SAM notice/award aliases, shared sources associated with both jurisdictions, different agencies sharing a portal, canonical URL variants, preserving old coverage/config/history and duplicate/concurrent-registration outcomes. Unmatched/conflicting identity is deferred, not guessed.
3. Scope tests must prove the Ouachita request is countywide and Texarkana is Arkansas city work; Texas, Lake Ouachita, Ouachita National Forest and buyer/vendor-address-only matches stay excluded. Source scope associations never automatically approve a lead match.
4. Use the real captured SSC/DHS evidence as integration fixtures or private local verification inputs, sanitized and minimal. Do not introduce mock database records or synthetic local lead content into the application. Existing unrelated mock data is outside this repair.
5. Verify a repeated identical authorized research/import run creates no duplicate source, request, intake, contract or false change event. A changed document or meaningful coverage update has retained provenance and does not erase user fields. Reuse the guarded package testing/readback rather than performing unnecessary production writes merely to test repeatability.
6. Validate skill links/wording and whitespace; run affected CLI/library and mapping tests. Use current live-schema SQL tests for the actual backfill. No deployment required for database records to appear in the existing connected app; refresh and inspect filters.

## Expected files

- `.agents/skills/arkansas-procurement-leads/SKILL.md`
- Its `references/discovery.md`, `api-access-and-tracking.md`, `runner-and-import.md`; add one focused database-persistence reference if needed to keep entrypoint concise.
- `docs/PROCUREMENT-WORKFLOW.md`
- `scripts/procurement-workflow.mjs`, focused manual/source-registration helpers, and affected review/verification/SQL-test libraries.
- Existing/new focused tests; `src/lib/procurement.ts` only if truthful existing presentation requires a mapping fix.
- Private output receipts, mapping manifests, revised local source IDs, reviewed package and live verification report. Preserve all previous evidence.

The implementation must show the requested `+`/`-` file-change notation as it progresses. Do not overwrite unrelated work or the completed access-tracking plan; it records the prior scope honestly. Add a superseding workflow note there if needed instead of rewriting history as if the database feature already existed.

## Success criteria

- Both geographic source sets are discoverable from the database on a later request; local files are supplemental evidence/access checkpoints.
- Verified September 30 findings are saved in the application with correct provisional/historical meaning; uncertain candidates survive in intake with next actions.
- The skill calls the real supported persistence path and reports live verified outcomes, not a local-file completion claim.
- Source/request aliases and identities are stable; previous geography and user data are preserved; repeated work is idempotent.
- The expected two primary lead findings and one attached protest are reconciled against live data, not blindly treated as three new awards. Final inserted/updated/deferred counts come from actual verification.
- No secrets, broad restores, frontend credentials, unrelated integration work or automatic recurring activity are introduced.

## Completed build — September 30, 2026

Implemented the default application research → database source/request reuse → evidence-bound intake → reviewed import → live readback workflow in the existing runner and skill. No schema migration, deployment, signup, email or schedule was needed. Existing user changes were preserved.

Live verification: `outputs/procurement-access/build-verification.json`, project `zreplhkoxswtzxlchtjf`. Counts changed from 29 to 38 sources, 324 to 326 leads, 102 to 106 intake items, 78 to 80 intake links, one to three requests, and 413 to 415 versions/events. Nine sources were added and five existing source rows enriched: 14 physical registry records represent the 12 saved logical source entries, with separate SAM notice/award and USACE entries. Confirmed database mappings were merged into the supplemental source ledger without changing its historical local-only authorization record.

- Ouachita request: `ceed49a2-bdb1-543b-a0aa-e7211cb0b163`.
- Texarkana Arkansas request: `0f489ee6-d60e-526f-a70c-d781fc17ea3b`.
- DHS historical lead: `a53079cb-b47d-5fd6-a1dc-2133bd25ef32`. Exact IFB/protest identity corroborated; primary solicitation and sustained-protest evidence attached to this one lead. The reported amended deadline stays attributed; final county-line contract/current incumbent remain unknown.
- TASD board-approved SSC award: `b0f35657-9a7a-5db0-ad3a-9446772d64e6`. Amount, approved start, one-year term/four options retained with explicit qualifications. Signed execution, exercised options and individual school city boundaries remain unverified; calculated base end is excluded from verified end-date columns.
- Bearden candidate intake: `499d06d2-fed1-5632-a9c8-3fd98c144e1d`, pending.
- Related TASD RFP candidate intake: `66ca7208-1926-5466-a115-37165688d0aa`, pending; no duplicate SSC contract.

All baseline leads/intake/history/relationships were preserved. Actual application loader read 326 leads and 38 sources including both additions. Local mapping/filter tests preserve evidence notes, exclude historical solicitation from the opportunity filter, and show partial source coverage. The existing Open queue denotes sales workflow state; it does not prove an open solicitation. Mapping corrections are built locally and have not been deployed.

Validation: 31 affected Node tests, four Vitest application tests and `npm run build` passed. The four actual registration/staging/canonical packages passed captured-live-schema rollback, readback and no-op replay tests before their verified production applications. Fresh final snapshot plus repeated preparation proves zero source/request/intake/new-lead/evidence/link/status writes for identical inputs; no extra production replay was performed. Production authentication, simultaneous external writers and future source availability are not emulated by the offline engine; uncertain outcomes still require reconciliation.

Private packages/receipts: `outputs/procurement-batches/20260930-geography-registry-v2/`, `20260930-manual-captures/`, `20260930-ouachita-canonical/`, `20260930-texarkana-canonical/`. Original evidence and earlier failed/prepared drafts remain retained. No current open bid or future rebid was verified; recorded partial/blocked/unchecked source coverage remains honest.

## Next action

Refresh the connected application and search for `Historical DHS` or `Board-approved SSC` with Bid Type and date filters set to All. Review the code diff and verified report; commit only when explicitly requested. Resolve pending primary-document/site verification through the maintained database-backed research workflow.
