# Efficiency and duplicate-work review

Implementation scope: the first performance pass addresses duplicate reads, inactive-view polling, log loading, selectors, the log index, concurrent GET sharing and the unrelated state-registry reload. The review below is retained as the original assessment. Broader reporting-storage, catalog, bundle/dependency and retention recommendations remain follow-up work; this file moving to `specs/done/` records completion of this first pass, not implementation of those redesigns.

Reviewed October 23, 2026. Scope: repository inventory, Settings navigation and reads, logs, reporting, scheduler/worker composition, deduplication contracts, packaging, and offline verification. This is a code review and local measurement, not a production trace or certification of deployed configuration. Application behavior and operational data were not changed.

## Assessment

There is substantial avoidable read work in Settings. The strongest evidence points to repeated reporting queries, heavyweight selectors, sequential loading dependencies, and polling retained in hidden views. The large local file count has a separate cause: accumulated deployment/test output and normal installed dependencies. Deleting those files will not remove the backend query overhead.

The code contains meaningful protections against duplicate execution. Keep those protections while simplifying the read side. A rewrite or a second scheduler is not warranted by this review.

## File inventory

Counts are physical paths reported by `rg --files --hidden --no-ignore`, rather than Windows directory entries or a dependency audit. Counts can change during verification.

| Location | Files observed | Interpretation |
| --- | ---: | --- |
| Entire workspace, including Git internals | 49,255 | Explains the reported approximately 50,000 files |
| Git-tracked files | 692 | The maintained repository is much smaller |
| `outputs` | 31,872 | Mostly local evidence, verification and release artifacts |
| `outputs/deployment` | 29,474 | 1,233,892,178 logical bytes, about 1.15 GiB |
| `node_modules` | 13,102 | 425,644,652 logical bytes, about 406 MiB |
| `.git` internals | 3,640 | Repository object/history storage |
| `src` | 78 | Application code and colocated tests |
| `scripts` | 132 | Backend and operational tooling |
| `tests` | 161 | Tests, helpers, fixtures and integration tools |

These rows overlap; do not add them together. Of the deployment paths, 20,558 match temporary-directory naming patterns. Many extensionless files are generated Vitest/Vite transform modules under `temp/.../client` and `ssr`, rather than additional application source. The largest deployment subdirectories are `admin-ui` (13,143), `05C1` (9,083), `05C` (2,486), and `05B` (1,465). There are 58 tracked files under `outputs`; that directory must not be deleted wholesale.

`.gitignore` excludes private deployment output and installed dependencies. `.dockerignore` excludes outputs, dependencies, tests and local machine state from the Docker context. ESLint already ignores outputs. The deployed workflow image copies scripts and shared function source, not the local output archive. Local output accumulation can affect editor indexing, searches, backups and disk use; there is no evidence that serving a log request scans these local files.

Recommendation: inventory disposable temp directories separately from release receipts, snapshots, captures, reviewed packages, fixture dependencies, and private evidence. After confirming they are unused by running processes, remove only a reviewed list of disposable paths. Use OS temporary directories for generated transform caches; put necessary evidence in dated run folders and adopt an explicit retention policy. Add editor/search exclusions for output and dependency trees without hiding them from deliberate operational inspection. No deletion was performed.

## Findings, in recommended order

### 1. [P2] Hidden Settings views can continue polling

Evidence: `src/app/AppShell.tsx:1001` preserves Admin in a `hidden` wrapper and supplies `active`. However, the standalone `RunDetail` rendered near the end of `src/features/admin/AdminScreen.tsx` does not receive that flag, so its default `active=true` remains in effect after returning to leads. Its active-run timer continues. `RequestReview.tsx` also has import/SAM polling effects without an active prop; hiding its containing section does not stop those effects. `RunDetail.tsx` retains previously visited results under a hidden wrapper when Logs is selected.

Impact: a run left open can keep making status/report requests while another workspace is visible. This is real avoidable background work, not React StrictMode alone. Trigger status GETs also call `kick()` in `workflow-http.mjs`; repeated reads can wake the existing serialized worker, though its leases protect execution.

Recommendation: pass a single visibility/active contract through standalone run detail and its result reviewers, cancel in-flight reads and suspend timers when inactive, then perform one fresh lightweight read on return. Preserve component state and navigation context. Suspending UI reads must not cancel a server job or change scheduled execution. Test switching to leads, Logs and an inactive browser document while an import is pending.

### 2. [P2] A single run status request repeats the same database work

Evidence: `scripts/lib/county-triggers.mjs:90` loads children and usage, calls `countyPresentations`, then calls `reportRunHistory`. That calls `reportSchedules`, which reloads children/usage/jobs and invokes `countyPresentations` again. The presentation loader reuses only the seeds explicitly supplied; the first status call supplies children but not its already loaded usage. It therefore reads usage again.

A local synthetic query-count probe exercised the actual `countyTriggers({db}).status(id)` function with a recording Supabase-shaped database stub: one completed county run, one child, no tasks/jobs/usage, no schedule. It recorded **17 database/RPC calls**, including:

| Relation | Calls |
| --- | ---: |
| Trigger children | 2 |
| Usage ledger | 3 |
| Jobs | 3 |
| Request targets | 2 |
| Search requests | 2 |
| Interpretations | 2 |
| Trigger row, state-source RPC, step timing | 1 each |

This is a structural count for that synthetic case, not a live latency measurement or a universal request count. Real data adds pagination, canonical identity lookups and other relationships.

Recommendation: establish one request-scoped reporting loader with shared relationship batches and indexes in memory. Feed its complete data to pure presentation/count functions. Provide a lightweight progress projection for polling; load full historical metrics and related-source context only when needed. Preserve safe public projections, unknown/partial results, canonical identity resolution and verified lead attribution. Add query-count regression checks using both small and multi-county fixtures.

### 3. [P2] Selectors compute full reports before logs can open

Evidence: `ScheduleActivity.tsx:20` calls `/v1/admin/history` for up to 50 run choices. `admin-run-history.mjs:28` computes verified lead reports, source attention and step timings for that page. Only then can `ScheduleActivity.tsx:48` mount the selected `RunDetail`. A saved selection outside the page adds another history request. `HistoryScheduleFilter.tsx:12` uses `/v1/schedules` just to display schedule names, but `procurement-schedules.mjs:64` also computes reporting and deletion eligibility for the page.

Impact: selecting a run waits for metrics on many other runs. History/Stats schedule pickers incur the schedule table's reporting cost even though they display only identity/name/archive status. These are unnecessary dependencies on the critical path.

Recommendation: add bounded, authenticated lightweight choice projections for schedules and runs. Fetch only identity, name, timestamps, origin and enough state to label choices. Validate selected-run schedule membership in the selected-run endpoint, and let the log request start alongside the choices request. Retain archived selections, saved IDs, pagination, access checks and the existing default selection behavior.

### 4. [P2] Polling replays log pages and makes logs wait for status

Evidence: `RunDetail.tsx:75` waits for `Promise.allSettled([status, logs])` before publishing either response. The logs branch starts from the beginning and follows cursors until it has reloaded the previously viewed count. The timer starts at 2.5 seconds and backs off to 15 seconds. That same read path loads logs even when another run section is selected. `admin-run-history.mjs:29` separately reads step intervals for reporting timing.

Impact: a fast log page remains withheld behind expensive status reporting. After viewing many pages, every poll repeats the page sequence. Server-side timing reconstruction also rereads step history. Cost grows with browsing depth and run history.

Recommendation: publish successful status and log results independently. Keep loaded log pages keyed by owner/run/cursor. Refresh only mutable running-step records and fetch subsequent records incrementally; an append-only cursor by itself is insufficient because an existing step can change from started to completed. Avoid reading log pages for an unvisited section. Use a lightweight progress revision to decide when metrics require refresh. Preserve independent errors/retries, sequence ordering, cursor integrity and partial timing semantics.

### 5. [P2] Schedule Overview recomputes all-time analytics on entry

Evidence: `Analytics.tsx:45` requests `period=all&limit=1`. `admin-analytics.mjs` explicitly computes the full filtered selection before pagination. It loads runs, children, ledger events, steps, jobs, canonical lead records, targets, tasks and excluded intakes, then aggregates in JavaScript. `limit=1` reduces response rows, not the work needed to compute totals. Schedule Overview also starts an independent activity/history report over overlapping data. Each additional analytics/member page repeats the full calculation.

Impact: overview cost grows with schedule history. The explicit 2,000-run and 10,000-relation read bounds eventually make all-time reporting unavailable rather than silently truncating it. Those bounds are good safeguards, but not a long-term reporting strategy.

Recommendation: persist versioned verified per-run reporting data, including lead identities and timing inputs, and aggregate from that projection. Cache reports by scope, reporting revision and snapshot; invalidate after imports, reconciliation and canonical redirects. Keep active/unsettled runs dynamic. Do not sum per-run distinct counts to produce all-time unique leads: the same lead can appear in multiple runs. Preserve usage event-date attribution and snapshot/member consistency. Show schedule setup promptly while totals load separately.

### 6. [P2] Log pagination lacks the matching composite index in repository schema

Evidence: `county-triggers.mjs:138` filters by `trigger_id`, applies `sequence > cursor`, and orders by `sequence`. `20261013000100_admin_county_triggers.sql:42` creates `(trigger_id, started_at, id)`, while `sequence` is unique globally. Neither is a composite index matching this query.

Impact: as the shared step table grows, PostgreSQL may sort a run's steps or scan/filter the global sequence index. A production plan is needed to quantify the cost; the review did not run production EXPLAIN.

Recommendation: evaluate a forward migration for `(trigger_id, sequence)` using `EXPLAIN (ANALYZE, BUFFERS)` on representative first and later pages. Retain existing indexes until their other consumers are checked. Historical applied migrations should not be edited. Verify deployed indexes first because production may have additional indexes absent from source.

### 7. [P2] Re-entering a view replays all previously loaded pages

Evidence: `AdminScreen.tsx` restores a schedule page depth up to 5,000 and refetches pages sequentially. Its collection effect also reloads state sources whenever the schedule query changes, and waits for both before publishing results. `ScheduleActivity.tsx` and `RunHistory.tsx` similarly restore prior depth by replaying pages from offset zero. Switching between Logs/Sources and Overview changes `active`, causing reads to restart. Schedule search and `HistoryScheduleFilter` issue requests on every keystroke without a debounce.

Impact: context preservation becomes repeated network work. A user who has loaded 500 items can trigger ten sequential page requests when returning, and typing a schedule search launches unrelated state-source reads. Aborting a browser request does not prove already started server/database work stopped.

Recommendation: keep an owner-scoped query/page cache with explicit refresh and mutation invalidation. Restore selection, scroll position and cached pages immediately, and revalidate the relevant first page in the background. Separate state-source registry reads from schedule filtering, publish independent results as they arrive, and debounce text search. Keep the present filter behavior, retry guarantees and stale-response rejection. Any change to freshness or automatic refresh policy should be agreed before implementation.

### 8. [P2] Read fan-out also multiplies authentication round trips

Evidence: every authenticated workflow HTTP request awaits `authenticate` in `workflow-http.mjs:39`; the composition in `workflow-server.mjs:74` implements that with `db.auth.getUser(token)`. The browser's `workflowRequest` has no shared in-flight GET deduplication and no request deadline beyond a caller-provided cancellation signal. Four initial Admin reads, selector requests and status/log polling each independently pay that boundary cost.

Recommendation: first reduce unnecessary endpoints and share identical in-flight reads within one owner/session. Measure authentication time separately from database time. Investigate verified-token reuse only with an explicit revocation/account-status policy; never replace authentication with unverified JWT decoding. Add bounded read deadlines and readable retry states without automatically replaying uncertain writes. The HTTP server's request-body timeout is not a complete end-to-end database/read deadline.

## Secondary improvements

- The production build emits an Admin JavaScript chunk of **792.45 kB** (186.42 kB gzip) and a main chunk of **506.05 kB** (146.24 kB gzip), with a size warning. `CountySelector.tsx:2` statically imports a 604,290-byte county map, and Admin mounts the manual form under a hidden wrapper even when viewing schedules/logs. Lazy-load the map/manual-editor code on first use, retaining mounted state after that. This should reduce first-entry parsing/download work; it does not explain every later backend delay. Do not merely raise the warning threshold.
- Catalog paging (`admin-catalog.mjs:56`) loads the full geography/source/capability registry and projects/filter/pages in memory on each request. It is bounded and acceptable at small scale, but should use a versioned registry cache or scoped queries as the catalog grows. Treat this as lower priority than the log critical path.
- `Dockerfile.workflow` installs production dependencies from a package where TypeScript, Vite, jsdom and PGlite are declared under `dependencies`. Those build/test tools therefore remain eligible for the backend production installation despite `--omit=dev`. Audit runtime imports, then split build/test and backend runtime dependencies. Keep Playwright/PDF/browser/native SQL requirements that the worker actually uses. Measure image size and startup before and after.
- `canonical-reporting.mjs` reads full lead `payload` values to resolve redirect identities. A narrowly projected canonical redirect relation would reduce transferred data while preserving historical receipt immutability. This becomes more useful after request-level duplication is removed.
- Several central components and reporting files compress complex logic into very long lines. Formatting and extracting shared read/pagination helpers would make lifecycle mistakes and repeated work easier to detect. Avoid broad refactoring until the behavioral and performance regression checks exist.
- Add request IDs, endpoint duration, authentication duration, database call count, transferred bytes, report computation time and worker queue/lease timing. Record structured codes and counts, not tokens, private evidence or row payloads. Current generic worker errors do not identify the expensive read stages.

## Duplicate execution: protections already present

The review found one workflow server composition and one serialized `kick()` worker, not two independently configured in-process schedulers. The private scheduler dispatch wakes that same worker. Multiple read-triggered wakes are inefficient but do not by themselves establish duplicate collection.

Preserve and test these existing contracts:

- Client mutation keys survive uncertain acknowledgments; trigger submissions are unique by actor/key.
- Schedule occurrences have unique run keys and a unique scheduled due-time index.
- Worker claims use database advisory locks, row locking and lease tokens; trigger/job claims share the worker lock.
- Schedule enqueue checks prior active/uncertain work; county/work reservations and unique state memberships reject conflicting saved scopes.
- County runs keep state-source updates separate and reuse prior state onboarding where supported.
- Public acquisition reuse is intentionally bounded to a request or county parent run, with saved content/hash/host checks. Do not introduce global stale capture reuse merely to reduce requests.
- Automatic/reviewed imports retain validation, canonical identity, outcome reconciliation and protected-field checks.

These are code-level protections, not proof that the deployed system has only one cron job or backend service. A separate read-only operational check should inventory enabled cron jobs, scheduler delivery history, deployed service instances, overlapping occurrences, active leases, request rates and collection dedupe keys. Do not disable a schedule based on local file count or a repeated GET alone.

## Proposed implementation sequence and acceptance

1. Establish a small performance baseline for schedule list, overview, initial logs, later log pages and returning from leads. Capture warm and first-request timing separately, endpoint counts, query counts and bytes. Check deployed configuration without changing it.
2. Fix inactive-view polling; remove duplicate data loading inside a request; add lightweight choices/progress; release log results independently. This is the highest-value bounded change.
3. Add and verify the log index. Cache already loaded pages and stable registry reads with explicit invalidation.
4. Introduce reusable reporting projections/snapshots, then optimize catalog and production dependencies based on measurements.
5. Perform a reviewed temporary-file cleanup and adopt retention so the count does not immediately grow back.

Proposed acceptance targets, not measured guarantees: warm first-page Settings/log requests below one second at the agreed representative data size; no UI polling when its workspace is inactive; no identical concurrent GETs for the same owner/query; run/schedule choices do not compute lead analytics; revisiting a view does not replay all prior pages; query-count budgets do not grow per visible row except for documented bounded relationship batches. Keep all existing scope, import, history, retry and access regressions green.

## Verification

The initial sandboxed `npm run check` passed lint but Vitest could not read generated temporary transformed modules (ENOENT), so that run did not establish application failures. Verification was restarted outside the sandbox through the supported approval mechanism and **passed**:

- ESLint.
- All 23 application test files: 169 tests.
- Offline workflow suite: 392 tests, zero failures/skips; runner duration about 122 seconds on this machine.
- Both standalone SQL regression scripts, including rollback/replay/concurrent-edit and protected-field cases.
- TypeScript and production Vite build; build completed with the bundle-size warning described above.
- `git diff --check` for tracked changes; the review document is the only added source-tree file.

The local recording-database probe confirmed the 17-call status path independently of network latency. No production endpoint calls, collections, imports, deployments or deletions were performed. No live browser waterfall, production database execution plans, hosting-tier readback or native Supabase/PostgREST integration run was performed in this review; those remain the next measurement step before assigning a production latency budget or asserting deployed duplicate-job behavior.

## Implementation record — first performance pass completed October 24, 2026

- Shared the children, ledger and projected job batches between status reporting and source-attention presentation. The same synthetic one-child fixture now takes **9 calls instead of 17**; a 75-child fixture has the same count. A separate attribution regression ensures reuse does not drop usage totals.
- Added an explicit progress-only projection for active runs: **3 calls** in the fixture. Polls preserve the full displayed report only when the response is marked partial; settled responses replace the report so obsolete attention flags cannot linger.
- Added schedule/run choice projections. Schedule names use one query, and run choices retain source-attention outcome labels while skipping lead identities and timing reconstruction. Default API projections remain available.
- Split status and log read lifecycles. Logs can render before a standalone status report finishes. Already loaded pages remain available across tab/workspace changes. Polling refreshes unfinished or unknown-usage steps in bounded batches and reads subsequent steps without replaying prior pages. Explicit refresh and failed-page retries retain their existing purpose.
- Passed the active-read contract through standalone and embedded run/result readers, including legacy SAM results. Inactive workspaces, hidden browser documents and inactive result sections abort their reads and suspend timers, preserving drafts, selections and server execution.
- Added session/origin/path-scoped in-flight GET sharing with independent cancellation, result copies and a 30-second read deadline. Responses are not cached after completion; mutation identity and uncertain-write behavior are unchanged.
- Separated state-source registry loading from schedule searches and published independent bootstrap responses as they arrive.
- Added the forward `(trigger_id, sequence)` index and bounded sequence refresh query. The offline SQL test uses `EXPLAIN (ANALYZE, BUFFERS)` over more than 10,000 steps to verify the later-page index access path. The disposable native harness also loads the migration and verifies a step changing from started to completed through PostgREST.

No production migration, deployment, scheduling change, collection or evidence deletion is part of this implementation. Deploy the matching backend before the frontend, then apply the additive index through the normal migration process. Production response-time targets remain unmeasured; query-count reductions are not a claim of a particular live latency improvement.

Remaining recommendations are retained in [the follow-up work](../todo/efficiency-reporting-and-maintenance.md).

### Final verification

- `npm run check`: passed ESLint, 25 UI files (182 tests at that gate), all 395 offline workflow tests, both standalone SQL regression scripts, TypeScript and the production build.
- After adding the saved-depth recovery regression, the full UI suite passed **183 tests across 25 files**, and final lint passed again. The production build includes that hook correction.
- `npm run test:access`: final fresh isolated run passed PostgreSQL 15 + PostgREST access, scheduler/worker/replay, automatic county/SAM import and reporting checks. Schedule activity also verified the new log index and mutable-step refresh. Earlier attempts required actor/origin corrections in the new fixture, and one temporary session failed JWT validation during the date change; the final fresh run passed without weakening authentication or constraints.
- `node tests/integration/admin-ui-browser.mjs --schedule-activity --built`: passed desktop, 390px and 320px activity/navigation/retry acceptance. It used intercepted fixture HTTP. Development-server startup first timed out; the built fixture run required the harness's expected public workflow origin instead of this machine's loopback backend setting. No `.env` file was changed.
- `git diff --check`: passed. Production builds still report the pre-existing large-chunk warning; bundle splitting remains in the follow-up scope.

Suggested commit: `Optimize Settings reads and incremental log polling`.
