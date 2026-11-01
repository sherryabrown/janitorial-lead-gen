# Codebase cleanup review — November 1, 2026

## Outcome and scope

The best cleanup opportunities are obsolete UI implementations, duplicated types and pagination scaffolding, frontend loading boundaries, and repeated backend projection work. Most backend modules have real runtime, CLI, or verification callers; a broad deletion campaign would remove useful behavior and safeguards.

This is a repository-wide static review with focused reading of application composition, authentication, queue reads/writes, scheduling and review state, HTTP authorization, worker composition, imports, reporting, source catalogs, deployment, and test configuration. An import/reference inventory covered maintained TS/TSX/MJS under `src`, `scripts`, `tests`, and Edge Functions. SQL review considered the baseline/forward-migration convention and selected current access/reporting migrations. It is not a line-by-line certification of every historical migration, provider adapter, or operational artifact, nor live production verification.

This review pass changed no application code, database objects, dependencies, or deployment settings. The existing modification to `supabase/.temp/cli-latest` was left alone. The subsequent authorized implementation is recorded in the [completed plan](../../specs/done/lean-codebase-review-and-cleanup.md) and [cleanup build report](2026-11-01-lean-codebase-cleanup-build.md); scoped analytics and dependency relocation remain deferred.

## Findings, ordered by practical impact

### R1 — P2: scoped analytics loads unrelated ledger history

Evidence: `scripts/lib/admin-analytics.mjs:100–114`, `:76`. The trigger query applies schedule/run/target/geography/category filters. For finite periods, the usage query applies only ledger dates, loads up to the shared 10,000-row bound, then loads older trigger IDs and applies scope afterward. Aggregation discards unmatched ledger entries only after those reads.

Impact: even a narrow schedule or run report reads other schedules' usage events. A period with 10,000 unrelated ledger rows can make a small scoped report unavailable. This is a structural observation; production volume and elapsed-time impact were not measured.

Disposition: separate behavior decision. Preserve ledger-event-date attribution, including events from matching runs created before the selected period. A scoped-query fix would also change which reports cross the current bound, so do not silently include it in mechanical cleanup. Add a focused approved follow-up with a fixture containing many unrelated events and an older matching run.

### R2 — P2: county geometry loads with every Admin entry

Evidence: `src/features/admin/AdminScreen.tsx:14` imports `CountySelector`; `CountySelector.tsx:2` statically imports `data/arkansas-counties.json` (604,290 bytes). Other editor paths also import the selector. Admin already has one outer lazy boundary in `src/app/AppShell.tsx:38`, but its internal screens share the same initial Admin chunk.

Measured production build: entry JS 507.20 KB / 146.65 KB gzip; Admin JS 816.72 KB / 193.14 KB gzip. Vite emits its large-chunk warning. These sizes are build observations, not user latency measurements or guaranteed savings.

Recommendation: isolate county selection behind a lazy boundary shared by all actual selector callers. Load on first needed display and retain visited components so drafts, selection, and focus survive navigation. Keep exact geometry, all 75 county IDs, labels, and keyboard behavior. Do not simplify boundaries or fetch replacement map data as cleanup. Do not merely raise the warning threshold.

### R3 — P2: obsolete components remain maintained only by tests

Evidence:

- `src/features/admin/ScheduleList.tsx:76`: `ActivityList` has only a test caller in `IntegrationRemediation.test.tsx`. Current activity/history is implemented through `RunHistory`, `ScheduleActivity`, and `RunDetail`.
- `src/features/admin/Analytics.tsx:44`: `ScheduleAnalyticsSummary` has only a test caller in `Analytics.test.tsx`. Current `ScheduleDetail` composes `ScheduleActivity` and does not import it.

Impact: tests maintain UI and read logic that users cannot reach. Useful assertions can give false confidence if they exercise the obsolete component instead of the production path. These exports may already be removed by bundler tree shaking; source removal is chiefly a maintenance improvement.

Recommendation: remove the two components and now-unused imports after final reference checks. Move source-attention and navigation assertions to current run/history components. Remove the obsolete summary's dedicated fetch test; retain `AnalyticsSummary` metric tests and current schedule-detail result tests. Retain the live `StateSourceList` and `ScheduleList` re-export.

### R4 — P3: the schedule loader still models a retired collection

Evidence: `src/features/admin/AdminScreen.tsx:178`, `:239–250`. `loaded` contains `triggers:50`; the generic loader accepts `'schedules' | 'triggers'`, but its only caller passes `'schedules'`. Trigger execution routes elsewhere are active and unrelated.

Recommendation: use a schedule-specific restore-depth value and loader. Remove unreachable endpoint selection and generic types. Preserve initial page depth, stable deduplication, error/retry behavior, and storage keys. Do not remove trigger API routes or the current history workspace.

### R5 — P3: shared UI types are redeclared in AppShell

Evidence: `src/app/AppShell.tsx:57–93` redeclares `HistoryType`, `ClosedSubcategory`, `LeadHistoryItem`, and `LeadNote`, already defined in `src/features/shared/types.ts`. Contract feature types import that shared module, while AppShell relies on structurally equivalent local copies.

Recommendation: import the shared types and delete local definitions. Do not unify the full `ProcurementContract` and `ContractOpportunity` models: they intentionally represent different mapping/UI stages and differ in dates, notes, and history.

### R6 — P3: unused repair schema export

Evidence: `scripts/lib/schema-query.mjs:11` exports `duplicateRepairSchemaQuery`. Repository reference search found no executable/test consumer. The county repair CLI/library uses its own repair inventory and native rehearsal; dated table-purpose reports mention this symbol as historical evidence.

Recommendation: remove this export and its adjacent explanation. Keep `procurementSchemaQuery`, current native rehearsal, repair code, and historical reports. Do not delete a database object or rewrite a past audit.

### R7 — P3: build tools ship in the workflow dependency installation

Evidence: `package.json:26`, `:34–35` puts `@vitejs/plugin-react`, `typescript`, and `vite` in dependencies. `Dockerfile.workflow:4` installs production dependencies with `npm ci --omit=dev`; its command runs the Node workflow server and does not build the React application.

Recommendation: move these three build tools to devDependencies and synchronize the lockfile. Keep runtime `jsdom`, `playwright`, `pdfjs-dist`, and `pg`: the backend actually imports them. Retain PGlite pending a separate packaging decision because the supported reviewed-workflow CLI dynamically imports it. Confirm the frontend build host installs development dependencies before moving build tools; its configuration is not established by `render.yaml`.

### R8 — P3: catalog projection repeatedly scans the same relations

Evidence: `scripts/lib/admin-catalog.mjs:24–53` repeatedly filters links for parent/child membership, finds sources/capabilities by ID, filters associations, and tests nested routes. Every page reconstructs a bounded registry projection before slicing.

Recommendation: create local per-call maps for source/capability IDs, links by county/place, and associations by source/county. Keep arrays in their existing order, the existing source-inventory authority, and exactly the same filtering/sorting/pagination/unknown states. Avoid a persistent cache or database migration without measurements. This is a likely CPU/allocation improvement; no speedup percentage is established.

## Keep, or defer until separately requested

- **Companies and email previews:** disabled but explicitly retained in prior cleanup decisions. AppShell contains fixtures, helpers, state, and rendering for them; disabled does not mean authorized for deletion. Separate module extraction can improve clarity, but lazy mounting or removal could reset state and needs explicit design. Do not remove them under this plan.
- **AppShell and RequestReview:** large, coupled modules warrant future decomposition, but splitting files alone does not reduce shipped code. Keep asynchronous ownership, selection invalidation, confirmed-write semantics, mutation identity, and draft lifetime intact. This plan limits extraction to concrete loading boundaries.
- **Backend import validation:** checks repeated during prepare, apply, rehearsal, and readback cover different time/authority boundaries. They are not redundant merely because the predicates resemble each other.
- **SQL migrations, baseline, role checks, audit tables, native PostgreSQL tests, offline PGlite tests:** retain. Different verification layers establish different guarantees.
- **CLI scripts, source-method definitions, dev preview, recovery/cutover tools:** imports alone do not establish liveness. Package commands, operator documentation, deployment/recovery receipts, and active specs are entry points.
- **Historical outputs, completed plans, reports, fixtures, and private operational evidence:** retain. No retention decision authorizes bulk removal.
- **CSS:** no stylesheet deletion is approved by this review. Dynamic classes, hidden retained panels, responsive variants, and preview screens require usage/visual checks; text occurrence counts are insufficient.
- **Dependency upgrades, new frameworks, general-purpose data hooks, global caches, API rewrites, and index removal:** outside this cleanup. No vulnerability audit or live query-plan profile was performed.

## Validation evidence

Local review checks on November 1, 2026:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, with the bundle-size observations above.
- `npm run test:sql`: passed both standalone historical SQL regressions, including rollback, replay, concurrent edits, and protected sales fields.
- Initial `npm test`: app collection failed in 23 of 27 suites with missing sandbox temporary transform files (`ENOENT`); 4 suites / 15 tests passed. Workflow/SQL stages were not reached by that aggregate command.
- Diagnostic isolated runs: `shared-read.test.ts` passed 3 tests; `Analytics.test.tsx` passed 9 tests. This does not make the original aggregate green.
- Full app retry with process-local TEMP/TMP in ignored `node_modules/.tmp/review-vitest`: collected and ran the 32-test AdminScreen suite, reporting one failure, then was stopped after further progress stalled. This retry did not complete the app suite.
- Isolated `AdminScreen.test.tsx -t 'isolates schedule editing'`: failed the existing 5,000 ms test timeout; 31 other tests intentionally skipped by the name filter. Cause is unresolved; the timeout alone does not establish a product defect. No assertions or timeouts were relaxed.
- Separately invoked workflow suite: at least 260 subtests reported passing before it was stopped to bound this planning review. No complete workflow-suite pass is claimed.

Before implementation, establish a reliable app baseline and investigate the schedule-editing timeout. The source review and documentation are complete; aggregate application validation is not green.

No live provider calls, production writes, browser acceptance, Docker build, deployment, or production query profiling were performed. Passing local checks must not be represented as production authorization or release certification.
