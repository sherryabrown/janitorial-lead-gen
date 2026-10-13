# Pre-integration code review — October 12, 2026

## Conclusion

Keep the existing procurement model and reviewed import engine. The app already reads canonical leads and persists stages and notes. The next integration should use the hosted collection/review interfaces rather than revive the disabled spin generator. Resolve note failure handling, unnecessary reads, history completeness, and documentation drift first. Scheduling needs its own explicit execution contract.

This is a repository review and cleanup assessment, not an implementation or deletion. Companies and email previews are retained as future functionality, explicitly confirmed by the user during this review.

## Scope and evidence

The starting working tree was clean. Inventory: 436 tracked files. Reviewed the application startup/auth/data/mutation paths; hosted HTTP, worker, collection, interpretation, cache, AI budget, discovery/access, import/rehearsal and recovery boundaries; database baseline and relevant forward permissions/queue/job definitions; deployment/build configuration; tests, current docs, historical reports and outstanding plans. Searched callers and file references before identifying removal candidates. Historical review findings were not assumed to remain current.

This does not claim a line-by-line audit of every adapter, historical SQL literal, private operational artifact or dependency. No live provider, database, email, signup, deployment or paid AI operations were performed. Current deployed state was not independently rechecked; dated acceptance reports are historical evidence. Ignored private outputs were considered for retention and check contamination, not exhaustively inspected or copied into this report.

Validation on the current checkout:

| Check | Result |
| --- | --- |
| `npm run check` | Fails at lint: ignored `outputs/deployment/render/update-bonfire-evidence.mjs:9:82` has a parsing error. Subsequent stages do not run. |
| `npx eslint src scripts tests supabase/functions` | Passed. |
| `npm test` | Passed: 15 app tests, 228 workflow tests, both SQL suites. |
| `npm run build` | Passed, including TypeScript build. JS output 494.50 kB / 141.93 kB gzip. |
| Initial sandbox tests/build | Windows `realpath` EPERM; rerun outside the sandbox succeeded. This is an environment failure, not a code defect. |

Tests exercise offline evidence, rollback, replay, concurrent changes, permissions simulations, cache and workflow recovery. They do not establish hosted Auth lifecycle, present external-source availability or scheduler behavior. Separate disposable access integration suites were not run in this review.

## Findings

### F1 — P1: failed note creation discards the draft

`src/app/AppShell.tsx:893` catches write failures without rethrowing or returning a failure result. `NotePanel` awaits that callback at line 2132 and clears `noteText` at line 2133. A rejected `create_lead_note` RPC therefore produces an error message but loses the user's draft. The callback type at `ContractContextPanel` also describes this asynchronous operation as returning void.

The same handler wraps the write and history refresh in one catch. A committed note followed by a failed history read is reported as "Unable to save note", inviting a duplicate retry. The edit path similarly reports an edit failure after a committed edit if refresh fails. Stage mutations already avoid this through `saveLeadChange`; reuse the confirmed-write/separate-refresh pattern.

Verification to add: failed write retains text; committed note with failed refresh clears only the submitted draft, shows "saved; refresh failed", and does not repeat the write; failed edit retains edit text. This finding is established by the call chain, not by an existing failing test.

### F2 — P2: every queue operation rereads the complete source registry

`src/lib/procurement.ts:112–136` calls the queue RPC and then pages through all sources, including full `config` and coverage metadata, on every search, filter, page and refresh. AppShell invokes this loader on those changes and realtime/focus refreshes. Most registry fields are used to derive sidebar information, not queue membership.

Separate registry/detail reads from queue reads. Cache public source projections within the signed-in workspace or fetch the sources needed by the page and selected lead. Define invalidation for source updates and clear cached state on logout. Preserve selected-source context and existing fallback mapping; do not silently omit sources when changing the loader.

Acceptance: moving between queue pages/search terms does not refetch the entire registry; a changed source is still reflected through an explicit invalidation/refresh path. No arbitrary performance rewrite or new client cache dependency is required.

### F3 — P2: history queries can silently omit records beyond API row limits

`src/lib/procurement.ts:186` retrieves notes, note edits and stage changes without pagination or stable database ordering. Once a lead's history exceeds the server response limit, the resulting sorted list looks complete while omitting records. The edit lookup also builds one potentially large `in(note_id, ...)` query.

Use stable bounded pagination and chunk dependent ID queries. Preserve the current full-history filter behavior unless a separately approved UI pagination change is requested. Test more than 1,000 events and timestamp ties, including edits on notes from later pages. This threshold defect is inferred from the unpaged queries; no oversized live lead was queried.

### F4 — P2: a worker error can bypass HTTP error sanitization through saved status

`scripts/lib/hosted-workflow.mjs:211` stores arbitrary `error.message` in `checkpoint.next_action`; status returns that value at line 131. The comment assumes all messages are controlled, but `known-source-collection.mjs:16–30` embeds raw database `error.message`, and `interpretation-store.mjs` does the same. A worker database error therefore reaches the signed-in status API despite `workflow-http.mjs` sanitizing direct exceptions.

Use a controlled public error code/action at the persisted status boundary. Keep diagnostics in a private channel with a correlation ID, and do not append raw SQL/provider/database text to public next actions. Test an injected error containing a private marker across the actual worker-save-status path, including import job status and attention projections. The leak path is demonstrated statically; this review did not provoke a live sensitive error.

### F5 — P2: the default lint gate includes disposable operational scripts

`eslint.config.js` ignores only `dist`; Git ignore rules do not define ESLint's scope. `eslint .` parses a malformed ignored deployment helper, so `npm run check` fails before tests or build even though maintained sources lint cleanly.

Explicitly exclude generated/private output and machine state from lint, while retaining `src`, `scripts`, `tests`, configuration and Edge Function coverage. Do not repair or publish the private deployment helper merely to pass application lint. This failure was reproduced by the default check.

### F6 — P2: repeated collection/status reads grow with accumulated evidence

`known-source-collection.mjs` has a separate unbounded pagination helper with no stable order. Every execution rereads the full geography/capability/source registries and reads historical captures/runs to calculate changes. `hosted-workflow.mjs:110` returns a paginated candidate list but first loads all request targets/tasks/interpretations/jobs/usage; `hosted-store.rows` blocks once its 10,000-row bound is reached. Thus response paging is not equivalent to bounded query work.

Consolidate safe paging conventions and use narrow projections/scoped queries on touched paths. Preserve complete geographic routing, canonical identity checks, referenced-request FKs and import concurrency guards. For history comparisons fetch only required hashes/latest relevant records, with a stable order. Measure query counts and representative saved-data sizes before choosing larger refactors. Do not remove required import baselines to gain speed.

### F7 — P2: maintained API documentation contains contradictory present-tense instructions

`docs/PROCUREMENT-BACKEND.md` combines current acceptance notes with sections saying import transport is unconfigured, native rehearsal/memory fit is still blocked, AI must remain disabled, discovery only produces a handoff, and no import occurred. Later/current sections report those milestones completed. Historical labels cover some sections but not all operational instructions.

The actual server injects collection into `discoveryService`, selecting `publicDiscovery`; the generic no-collector blocked fallback is not the deployed composition's normal branch. Current discovery is bounded saved-official-link research and review, not paid general web search. Current browser continuation/session/capture/reconcile routes also exceed the early handoff-only description. Some session/capture routes are absent from the route table.

Create one concise current contract/status section based on code and dated acceptance evidence. Move superseded checkpoints into clearly dated history, preserving receipts and unresolved external-source limitations. No live deployment status should be invented from local code.

## Current functionality and integration boundaries

| Responsibility | Present implementation | Treatment |
| --- | --- | --- |
| Authenticated queue/search/filter/page/counts | Supabase `procurement_queue_page`, current queue migrations, typed mapping | Reuse; do not replace with hosted intake lists. |
| Stages/bulk stages/notes/history | Browser RPCs, dedicated history tables, stage commit-before-refresh helper | Reuse; fix F1/F3. |
| Geography requests and bounded collection | Hosted `/v1` API, durable jobs/leases and saved methods | Wire new UI to existing services. |
| Interpretation/candidates | Packet-bound evidence validation, persisted current interpretations/intake, extraction cache | Keep pending candidates distinct from canonical lead queues. |
| Canonical persistence | Exact reviewed package, native rehearsal, restricted transaction, readback/reconciliation | Preserve all guards and approval boundaries. |
| Discovery | Saved official-host links, reviewed evidence/method registration; no configured paid search implementation | Present actual scope and blockers. |
| Access | Encrypted portal sessions, constrained recipes/captures, exact human handoffs | Keep credentials/private records out of client projections; provider blockers remain real. |
| SAM | Separate statewide manual request/capture/review/import path | Preserve separation from city/county requests. |
| Scheduling | No recurring update service or schedule CRUD in current UI/API; request/status traffic wakes a bounded worker | New feature, not cleanup. |
| Companies/email preview | Disabled workspace, mock company state and local preview interactions | Retain as future functionality per user. |
| Legacy Generate | Disabled UI; retained invocation/function still targets `spin_*` | Retire only in coordinated replacement scope. |

The two-minute worker loop in `workflow-server.mjs` is request-driven and can leave pending work until another wake. This is an explicit existing contract, not proof of unattended scheduled execution. Before scheduling, define timezone/cadence, due-run claim/deduplication, durable wake source, missed-run/restart policy, cancellation and budget handling. Decide whether schedules only collect/stage for review or also apply previously authorized updates; exact import approval must not be silently removed.

## Deletion and retention assessment

| Item | Evidence / classification | Proposed action |
| --- | --- | --- |
| `findLeadIdsByActivityDate` in `src/lib/procurement.ts` | No runtime/test caller found; queue RPC owns live activity-date filtering. | Remove helper and its stale guide reference. |
| `prompts/procurement-bid-site-finder.md` | Exact SHA-256 duplicate of the function-local prompt. `spin_generate_contracts/index.ts:344` reads its local copy. Root copy appears in documentation, not executable loading. | Delete root copy; update guide link. Retain function-local copy while generator exists. |
| `matchesContractFilters`, `matchesContractDateRange`, `compareContracts` and private dependencies in `contract-utils.ts` | Used by tests, not the live server-filtered queue. | Remove only after porting useful filter/sort assertions to authoritative SQL/mapping tests. Keep live date/format/default/URL utilities. |
| `sql-validation-template.tar.gz` | Ignored local generated artifact; hosted Docker/native preparation no longer loads it. | Regenerable deletion candidate after confirming no operator command needs it; do not delete offline PGlite dependencies. |
| `dist`, build metadata/cache, `node_modules` | Generated output/installed dependencies. | Optional local housekeeping, not dead product code; do not erase dependencies as a prerequisite to integration. |
| `outputs/skill-drafts/arkansas-procurement-leads` | Draft counterpart to installed repository skill. | Compare with `.agents/skills/arkansas-procurement-leads` before deleting; preserve any unique future instructions. |
| Historical `prepare-sam-upserts.mjs`, `prepare-intake-processing.mjs`, `verify-intake-processing.mjs` | Documented fixed-batch tools; historical-batch guards; shared reconciliation and fixtures still tested. | Archive or retire entry points only after documenting reproducibility and updating references. Do not delete shared `intake-reconcile.mjs`. |
| Superseded SQL drafts in `outputs/sam-search` (`008_intake_processing.sql`, `008_intake_processing_reviewed.sql`, old `007` etc.) | Historical provenance; maintained docs explicitly say not to execute. Tests use sanitized copies under `tests/fixtures`. | Remove from normal workflow documentation; optional archive after confirming audit/rollback provenance retention. Never apply them. |
| Duplicate SAM captures/baselines in tracked `outputs/sam-search` and `tests/fixtures/sam` | Operational archive versus sanitized regression evidence; not interchangeable. | Retain fixtures; produce exact hash/reference/retention manifest before deleting output copies. Do not infer redundancy from a shared basename. |
| `outputs/arkansas-*` municipality evidence | Dated geographic import/review evidence. | Retain until authoritative dataset provenance/rebuild path is confirmed. |
| `source-methods/*.json` | Live verifier input and documented operational methods; database registrations are execution authority. | Keep; not dead just because browser does not import JSON. |
| `supabase/baselines` and all applied migrations | Development reconstruction, forward changes, test/bootstrap and migration history. | Keep. Historical definitions remain dependencies, even when replaced by later definitions. |
| `specs/todo/*` | Shared workflow/UI acceptance and provider-specific unfinished work. | Keep; reconcile stale progress and ownership rather than delete unfinished scope. |
| `specs/deferred/*` | Explicitly marked deferred/historical; integration plan partly obsolete, some geography intent retained. | Replace obsolete implementation instructions with pointers only after preserving unique future requirements. |
| `specs/done`, `specs/archive`, `docs/reviews` | Dated history, not current operating contract. | Keep as history; consolidate entry links. Age does not prove dead material. |
| Legacy spin UI/function/schema | Disabled runtime path, deferred replacement, function-local prompt still loaded. | Coordinated retirement candidate; keep historical database data/migrations. No table deletion in this plan. |
| Companies/email prototype, styles and types | User explicitly retained for future functionality. | Keep, optionally isolate from AppShell without changing behavior. |
| Private outputs, receipts, sessions and local `.env` | Evidence, recovery/approval provenance and secrets; not application source. | Do not bulk-delete or copy into documentation. Define retention separately. |

## Maintainability recommendations

### Bonfire/Euna navigation clarification — October 12

The user reports a working manual route: **Opportunities → Agency Explorer → Arkansas → City of Little Rock or Murphy USA → Portal**. They currently see no leads for Murphy USA. This is a useful alternative navigation path, not observed hosted capture or proof of complete zero results.

The October 9 saved blocker was narrower than general Bonfire availability: hosted Chromium/Playwright sign-in/session reuse had succeeded, but project-detail navigation encountered Cloudflare security verification. Human-assisted capture/import had also succeeded. See `docs/reviews/2026-10-09-bonfire-supported-access-handoff.md`. The current `hosted-browser.mjs` verifies the tenant and navigates directly to saved method URLs; it does not implement the supplied Agency Explorer traversal. This is a possible navigation/session-context gap to investigate, not a demonstrated cause of the challenge.

Official Euna material corroborates the feature and distinguishes the supplier network from organization portals: [Agency Explorer for standard vendors](https://eunasolutions.com/euna-supplier-network-information-for-standard-vendors/) and [organization portal login](https://eunasolutions.com/login/). Neither source verifies this user's exact Arkansas selections, Murphy USA's destination, current listings, automated-read permission or hosted compatibility.

October 13 scope update: bounded route verification is owned by the separate `specs/todo/bonfire-euna-agency-explorer-access-verification.md` plan, not the cleanup plan. Cleanup can proceed and complete independently. Verify this route before assuming a provider support response is the only next step. Observe the exact Portal destinations and session transitions, compare portal/listing/project/document access through the supplied route versus saved direct links, and retain useful methods. Reuse the existing account; discovery/navigation through the existing supplier network does not itself authorize aggregator signup, a paid upgrade, new registration or procurement submission. Murphy USA is a route/tenant comparison example; its Arkansas directory placement is not proof of actual work geography or a reason to create a new source/request.

If the route establishes a working supported collection method, retain the tenant-specific destination and bounded navigation as reviewed reusable method/recipe data, validate redirects/hosts and session isolation, and prove hosted capture plus second-request reuse. If it works only interactively, preserve the assisted path and a precise hosted blocker; do not label unattended capture fixed. Keep the prepared support request unsent unless separately authorized. Earlier "support inquiry next" conclusions remain historical and should be reconciled with this new route evidence rather than deleted as though they never occurred.

AppShell still combines roughly 3,000 lines of live procurement orchestration, presentation and disabled prototypes. Extract contract queue/history/mutations and presentation in small behavior-preserving steps; isolate the retained company/email prototype. Avoid a framework/state-library rewrite. The existing shared CLI/host services, immutable artifacts, exact approval checks and independent server-only transports are useful separations, not duplicates to merge away.

Deployment configuration deliberately starts with AI disabled and zero spend, while private existing host configuration can enable approved spending. `render.yaml` is therefore a safe bootstrap, not evidence that the current deployment is disabled. Document required native rehearsal/session/provider settings without putting actual credentials in examples. Consider moving build/test-only packages out of runtime dependencies after verifying Docker's real imports; retain Playwright, PDF parsing, jsdom, pg and Supabase where used. No dependency upgrade is required by this review.

## Next action

October 13: the cleanup implementation is complete in `specs/done/pre-integration-review-remediation-and-cleanup.md`. See [build evidence](2026-10-13-review-remediation-build.md) and [cleanup manifest](2026-10-13-cleanup-manifest.md). The findings above retain the October 12 review snapshot. UI wiring/scheduling, legacy generator retirement and Bonfire/Euna work remain separately scoped.
