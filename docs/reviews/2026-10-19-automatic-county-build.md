# Automatic county discovery build — October 19, 2026

Implementation and preview release report for [the plan](../../specs/todo/automatic-county-source-discovery-and-collection.md). Release and manual/repeat/single-scheduled execution verification are complete. Full coverage and unattended recurrence acceptance remain blocked; the plan stays in todo. Netlify production is unchanged.

## Current release

- Code commit: `816d00fa70757c10f9f9db75237e5f0ad14997f4` — `fix: complete county result interpretation`, pushed to `codex/admin-county-trigger-ui`.
- Render deploy `dep-dbb5ndei0phs73f289gg` became live at `2026-10-19T18:05:51.538Z`, before Netlify preview deploy `6ad65c556d6ad4aaeac06d71`.
- Preview: <https://bonfire-review--janitorial-lead-gen.netlify.app>. Preview HTTP 200, backend health 200 and authenticated browser-origin preflight 204 passed; the bundle points to Render.
- Production Netlify deployment remains `6ad583d1b9bb1b307abcf1fd`, locked and unchanged. Render environment hashes match the pre-release values; AI settings/budgets were not edited.
- Final `npm run check` passed: 69 UI tests, 301 workflow tests, SQL regression checks, lint, TypeScript and Vite build. `npm run test:access` and desktop/390px/320px/keyboard browser acceptance passed. The pre-existing large Admin bundle warning remains.

## Fresh live verification

Manual trigger `d2e845f4-9ccb-4ee0-85c4-81d6f5d508fc`, county request `fe2f9092-f3de-4176-a225-c521c68dd22d`, was submitted through the released Admin screen with Saline and its nine included cities, Opportunities, both work options, and the deadline window October 19, 2026–October 19, 2027. All jobs settled without workflow exceptions. Benton and Bryant each completed a bounded check with no matching opportunities; duplicate county/city associations count as two unique sources, not four. No candidates were staged and no canonical request/intake links were written.

The parent remains `outcome_unknown` because Alexander and Shannon Hills source-entry fetches did not confirm completion. Other incomplete entry fetches include Haskell/Bauxite redirects, the Little Rock School District byte bound and Benton School District's empty response. There are no active jobs in the finished manual run. Three AI calls recorded 10,179 input tokens, 2,208 output tokens and $0.01757025 actual cost; all usage outcomes are completed. Provider credits were not reported. Directory and method-verification steps do not use AI.

**Recurring-run blocker:** the existing `create_procurement_schedule_occurrence` function in `20261013000200_procurement_schedules.sql` skips a later occurrence with `previous_run_active` while the prior trigger or any child job is `outcome_unknown`. Thus one successful server-side dispatch does not prove unattended future cadence for these incomplete Saline runs. Public read-only fetch failures need a bounded terminal/reconciliation path that preserves true unknown AI/write/import holds. The overlap guard was not weakened in this release. The return checkpoint in the plan requires a second-occurrence regression after a harmless fetch failure.

The Saline County procurement page, Little Rock Housing Authority and UA Little Rock were captured but their AI interpretation did not pass literal evidence validation for janitorial scope, actual work location and dates. Deterministic evidence was retained, and coverage stays partial. Little Rock's existing Bonfire listing still requires supported project-detail access; protected-access work remains paused. These are remaining coverage gaps, not proof that no opportunities exist.

| Run | Trigger ID | Actual input/output tokens | Recorded USD |
| --- | --- | --- | --- |
| Manual | `d2e845f4-9ccb-4ee0-85c4-81d6f5d508fc` | 10,179 / 2,208 | 0.01757025 |
| Repeat | `e4170033-1636-471e-a8ee-b2a9bd0b1f77` | 10,194 / 1,168 | 0.01290150 |
| Scheduled | `3cbb7e71-d0a9-4b5b-82e6-974c63b385cf` | 10,189 / 967 | 0.01199325 |

All three runs settled with two unique checked sources, zero candidates, zero canonical request/intake links, no workflow exceptions and no active jobs remaining. Each has one county child and no repeated state-source child. The registry remains at 97 sources across these runs; initial bootstrap added four official websites to the original 93. Nine AI calls completed with 30,562 input tokens, 4,343 output tokens and $0.042465 recorded actual cost. No unknown AI charges or reservations remain; the overall unknown statuses are source-entry fetch outcomes.

Disposable schedule `358c2800-1b68-45af-8e40-b2d6c1abac02` produced exactly one scheduled occurrence, `7b9cdf18-8b9c-4a36-9c56-0c798b33e3d2`, at 18:25 UTC / 2:25 p.m. Eastern with the browser closed. Native baseline readback reused the existing saved sources/methods. Cleanup readback confirms `enabled=false`, `next_due_at=null` and archival at `2026-10-19T18:32:18.564Z`; the temporary actor was soft-deleted. Render configuration remained unchanged throughout. Private receipts are `live-accepted.json`, `final-audit.json` and `final-release-check.json`; live screenshots are `live-scope.png` and `live-results.png` in the ignored deployment directory.

## Implemented

- Existing discovery jobs now resolve official starting websites, verify supported published listings, persist methods through the existing native registry rehearsal/readback, collect and continue the common interpretation worker. County and county state-research jobs carry `county-public-v1`; standalone human review remains available.
- Directory resolution follows observed Association of Arkansas Counties profile links and the Arkansas Municipal League's public filtered table. The municipal form uses its current page-issued nonce, not stored credentials or a private API. HTTPS upgrade of a published HTTP URL keeps its host; subsequent capture must succeed. Captures are private immutable artifacts. Missing/ambiguous entries remain gaps, not invented URLs.
- Supported automatic methods recognize bounded explicit-count tables, explicit EvoGov empty listings, published Revize bid tables and the observed City Bids table format. These are structural recognizers, not county-name switches or generated executable code. Existing registered JSON/API/PDF/portal runners remain available through their current contracts. Unknown formats are not automatically activated.
- Activation preserves source identity/coverage, records the immutable discovery packet hash and policy, rehearses writes and verifies readback. Unknown write outcomes do not retry blindly. An existing shared endpoint retains its original route and adds server-verified route associations in its verification evidence; this neither duplicates its source nor asserts a contract work location.
- Existing interpretation verifies actual work location/date evidence and stages candidates. Non-SAM canonical import approval remains required. SAM automatic imports, AI settings and shared budgets are unchanged; directory lookup and method verification do not call AI.
- Explicit retry can advance older county review/missing-seed checkpoints and refresh expired captures using new page indexes while retaining old packets/runs. Persistence intents are never reset. Deployment does not bulk-resume old jobs. Separate state triggers remain separate; an expired/unusable registered state method no longer suffices to mark state research complete.
- County results identify location/source, distinguish source-only runs and incomplete coverage, expose saved evidence without a technical method form, and provide contextual retry. Existing source-only schedules are not changed.
- Live follow-up fixes retain verified listing evidence even when an unrelated linked detail fails, preserve requested/final URL provenance for canonical redirects, and allow the bounded www/non-www canonical host pair. Other cross-host portals remain unsupported by this discovery path.
- Invalid AI interpretations fall back to validated deterministic evidence for automated county requests; they are not staged or retried. A definite database budget refusal allows deterministic work to continue, labels unresolved items and stops further AI attempts for that process checkpoint. Unknown provider/billing outcomes retain existing holds. No cap or AI setting changed.

## Verification evidence

- Current `npm run check` passed 69 UI and 301 workflow tests plus SQL/lint/build. New tests cover identity/terminal validation, explicit empty versus shell/error, changed layouts, unsafe URLs, directory provenance/ambiguity, automatic stage continuation, dynamic municipal lookup and structured zero-result whitespace handling.
- `npm run test:access` passed against real disposable PostgreSQL/PostgREST. New absent-source fixture resolved an official directory entry, rehearsed/applied/read back registration, captured a structured opportunity, and staged one candidate. A browser-independent scheduled run reused that method, staged one candidate, and duplicate ticks created one occurrence. Source count remained one; canonical writes remained zero. Existing SAM native writes/deduplication and access/budget/scheduler checks also passed. This fixture is Arkansas County, demonstrating that execution is not hardcoded to Saline.
- Browser fixture acceptance passed at 1440, 390 and 320px with keyboard focus, named county/source results, source-only message and read-only evidence. Screenshots inspected; no overflow or production mutations. Queue/draft/history/SAM checks remain in the same harness.
- Read-only public checks: the directory resolved Saline County and Alexander. The municipal filtered lookup works, but Traskwood's returned directory records contain no website. On saved actual public pages the supported recognizers read 21 published Saline bid records, an explicit Benton empty listing and one Bryant record. These are **not** counts of current janitorial leads: archived records, service relevance, requested dates and actual work sites still require interpretation. No live county trigger/import was started by these read-only checks.
- Private logs/captures: `outputs/deployment/automatic-county/`; browser screenshots: `outputs/deployment/admin-ui/automatic-county-{1440,390,320}.png`.

## Remaining acceptance and limitations

The matching Render backend and Netlify preview have been released and the three fresh execution checks are complete. The original six source gaps and nineteen method gaps are reconciled below. Full acceptance remains blocked by read-only unknown outcomes holding subsequent recurrences, incomplete structured interpretation of captured sources, unsupported cross-host/listing formats and missing directory entries. The plan's return checkpoint lists the next implementation work. Canonical source/intake deduplication works; identical acquisitions across geography routes still need sharing to reduce repeat fetches.

No general paid web-search capability was introduced. Locations without an authoritative directory website remain incomplete. Unknown listing formats, unsupported cross-host portals and uncertain captures remain explicit limitations. Expired evidence is refreshed on explicit retry. Existing access accounts and protected Bonfire work were not resumed. This build does not promise every public body publishes procurement opportunities online.

Earlier live checks exposed shared-route registration, later-request seed authorization, rejected/truncated AI output and parent aggregation problems. Their fixes are in the current release and covered by native regressions. Discovery accepts server-owned saved-route seeds while rejecting arbitrary client IDs. Known billed output rejections retain deterministic evidence without another provider attempt in the same checkpoint; unknown usage retains its hold. Earlier disposable schedules were archived and temporary actors soft-deleted. Their receipts remain private historical diagnostics, not evidence of complete county coverage.

Function-only migration `20261019000200_verified_shared_source_routes.sql` was applied and recorded in the existing Supabase project before this release; readback verified all three function definitions and private execution permissions. It aligns native plan validation, gap reconciliation and the non-SAM schedule baseline with the server-verified route associations. No tables, client grants, dependencies, provider accounts or budgets change. Existing anonymous/authenticated denial and service-role execution are preserved; the SAM baseline wrapper remains intact. Roll back the backend to the preceding canonical-route-only implementation before restoring the previous three function definitions; do not remove source records or verification evidence. The pre-migration definitions are retained privately with the release artifacts.

Native migration acceptance proves collection on an additional verified route, preservation of the original method identity, gap reconciliation, scheduled execution and rejection when trusted policy provenance is removed. A separate parent-status regression prevents a failed planning job with zero tasks from appearing completed. Keep the plan in todo until required acceptance passes, and record remaining blockers rather than treating them as zero results.

The final interpretation correction normalizes whitespace in structured county listing evidence before testing literal exclusion quotations. It retains the requirement for explicit empty-listing evidence or exclusions for every listed record. A regression covers formatted JSON review text and rejection when exclusions are absent. Current county results omit superseded historical gaps while preserving their database records; parent aggregation treats these resolved tasks as terminal. Captured website entries are labeled separately from opportunity checks and cannot be mistaken for checked-empty sources. Final UI and workflow suites passed 69 and 301 tests respectively; native access acceptance and desktop/mobile/keyboard browser acceptance passed. One sandboxed Vitest attempt failed on temporary-file access; the unrestricted rerun passed all UI tests.

Initial implementation commit message: `feat: automate county source collection`

## Original-gap reconciliation

Snapshot: finished repeat run e4170033-1636-471e-a8ee-b2a9bd0b1f77. Website registration is separate from verified opportunity collection. Four of six original source gaps now have registered websites; two of nineteen original method gaps now complete verified checks. Other routes remain incomplete.

### Original six source gaps

| Location | Current result |
| --- | --- |
| Tull | Official directory has no unique website; bounded research capability remains missing |
| Alexander | Official website registered; opportunity listing remains unverified |
| Bauxite | Official website registered; opportunity listing remains unverified |
| Shannon Hills | Official website registered; opportunity listing remains unverified |
| Traskwood | Official directory has no unique website; bounded research capability remains missing |
| Haskell | Official website registered; opportunity listing remains unverified |

### Original nineteen method gaps

| Source | Route | Current result |
| --- | --- | --- |
| City of Alexander public notices | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| City of Haskell public records | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Benton School District procurement research | Saline County | Empty response body |
| Clinton National Airport forecast March 2026 | Little Rock | Source could not be verified automatically; supported listing evidence is missing |
| City of Benton bid listings | Saline County | Checked; no matching opportunities in requested window |
| Little Rock Water Reclamation Authority | Little Rock | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Saline County Library public procurement records | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Little Rock School District Procurement | Little Rock | Document exceeds verified byte bound |
| Central Arkansas Water Procurement | Little Rock | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading; No verified records or explicit empty listing |
| City of Bryant bid listings | Saline County | Checked; no matching opportunities in requested window |
| Bryant Public Schools procurement research | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| City of Shannon Hills public records | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Benton Utilities public procurement records | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Little Rock financial reports and capital plans | Little Rock | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Clinton National Airport Procurement | Little Rock | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Bauxite Public Schools procurement research | Saline County | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| Little Rock public contracts | Little Rock | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| UAMS procurement | Little Rock | Source could not be verified automatically; supported listing evidence is missing — No supported opportunity listing heading |
| UA Little Rock bids and awards | Saline County | Document exceeds verified byte bound — No supported opportunity listing heading |
