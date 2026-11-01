# Lean codebase review and cleanup

## Original prompt

> [$plan-code] please do a full code review. the goal is to remove superfluous code and make this a lean, efficient, and effective code base.

Created November 1, 2026 using the plan-code skill. This plan prepares implementation; it does not authorize production deployment or a change in product behavior.

## Problem and objectives

The codebase has accumulated a few superseded UI paths, duplicated types and pagination scaffolding, large frontend loading units, and repeated registry projection work. Preserve the current queues, schedules, source repairs, permission boundaries, and user drafts while removing proven maintenance overhead and reducing unnecessary loading/work.

Evidence and retention decisions: [review report](../../docs/reviews/2026-11-01-lean-codebase-review.md). Follow [AGENTS.md](../../AGENTS.md), [review guide](../../docs/CODE-REVIEW-GUIDE.md), and [development workflow](../../docs/development-workflow.md). Historical cleanup reports are evidence, not current commands to execute.

Three bounded phases are sufficient. Implement and validate each independently; do not turn this into a framework migration or general application rewrite.

## Constraints

- Keep existing UI text, visual hierarchy, brand, navigation, filtering, pagination, counts, and next actions unless a separate request specifies a change.
- Keep Companies/email code and data. Do not enable, delete, or silently change their mounted state lifetime.
- Preserve owner-specific session storage, drafts, history depth, checked selections, focus restoration, stale-response rejection, and retry/idempotency semantics.
- Keep full import/rehearsal/apply/readback safeguards and separate SAM/county/manual policies.
- Do not modify applied migrations, remove tables, run fixed historical batches, prune operational archives, or deploy.
- Preserve unrelated working-tree changes, including `supabase/.temp/cli-latest`.
- Search imports, dynamic references, tests, package commands, deployment, current documentation, and active specs before each removal. Record removed symbols/files and their replacement in a deletion manifest.

## Phase 1 — remove confirmed source redundancy

Before editing, establish a dependable test baseline. This review's isolated schedule-editing case at `AdminScreen.test.tsx:289` exceeded its existing 5,000 ms limit. Determine whether the delay is environment load, expensive map/DOM work, or an actual unresolved async transition. Do not globally increase timeouts or remove the assertion to make cleanup green. Record a separately scoped defect if product behavior needs to change. The review's workflow run was partial, not a complete suite pass.

### 1. Remove unreachable UI implementations (R3)

1. Recheck references to `ActivityList` and `ScheduleAnalyticsSummary` across source/tests/docs/active specs.
2. Remove `ActivityList` from `src/features/admin/ScheduleList.tsx`. Retain `StateSourceList` and the live re-export from `ScheduledTable`.
3. Update `IntegrationRemediation.test.tsx`: move useful source-attention/navigation assertions from `ActivityList` to the real `RunHistory`/`ScheduleActivity`/`RunDetail` flow. Keep all unrelated review/mutation coverage.
4. Remove `ScheduleAnalyticsSummary` from `Analytics.tsx` and only imports that become unused. Retain `AnalyticsSummary`, which has real callers, and its metric/permission coverage.
5. Remove the obsolete wrapper's dedicated test in `Analytics.test.tsx`. Verify existing schedule-detail tests cover the actual selected-run result behavior. Do not introduce an all-time totals panel as its replacement.

### 2. Simplify schedule pagination scaffolding (R4)

In `AdminScreen.tsx`, replace `loaded.current.schedules` plus unused `triggers` restore depth with a schedule-only ref. Change the inner generic `range<T>(kind)` into a schedule-specific loader returning `Page<AnySchedule>`.

Preserve the `spin-admin-schedule-page:${owner}` key, restore bounds, abort controller, collection generation, initial-page restoration loop, failed-page retry, existing merge order, and filter reset behavior. All callers should still request the same schedule URLs with the same parameters.

Do not touch `/v1/triggers` execution, preview, status, or history routes; only the unused branch of this local loader is redundant.

### 3. Reuse existing shared types (R5)

Import `HistoryType`, `ClosedSubcategory`, `LeadHistoryItem`, and `LeadNote` from `features/shared/types` in AppShell. Remove the local declarations. Keep transport models separate from UI models and avoid changing field optionality.

### 4. Remove the unused schema-query export (R6)

Remove `duplicateRepairSchemaQuery` and its now-orphaned comment from `scripts/lib/schema-query.mjs`. Preserve `procurementSchemaQuery`, repair inventories, native rehearsal, and historical table-purpose reports. No SQL migration is needed.

### Phase 1 checks

- Run affected app suites: `IntegrationRemediation`, `Analytics`, `SchedulingWorkspace`, `AdminScreen`, `ScheduleActivity`, `DetailClarity`, and `AppShell`, narrowed further when a step touches only one area.
- Run `node --import ./tests/offline-only.mjs --test tests/county-duplicate-repair.test.mjs tests/reviewed-workflow.test.mjs` for schema-export/reference safety.
- Run lint and typecheck. Confirm removed symbols have no executable references.
- Do not add tests that merely assert a symbol/file no longer exists. Preserve behavior assertions on actual entry points.

## Phase 2 — reduce unnecessary frontend and deployment loading

### 1. Defer exact county geometry until needed (R2)

1. Trace all imports of `CountySelector`, including AdminScreen, TriggerForm, and ScheduleEditor. A single remaining static importer defeats the intended boundary.
2. Add a shared lazy wrapper around the existing selector module. Keep metadata types available without loading geometry. Use the existing React `lazy`/`Suspense` convention; add no dependency.
3. Mount the lazy selector only on the first display that needs it. A `hidden` parent alone still mounts children and starts imports. Once visited, keep the relevant workspace mounted to preserve drafts and focus/context.
4. Provide a concise, accessible loading state inside the current layout. Follow existing application error/retry conventions for a failed chunk load; avoid a new global error framework.
5. Preserve exactly the existing geometry and county ID authority. Do not rerun the network-dependent GIS generator or introduce topology simplification.
6. Verify direct links, new/edit county schedules, manual county runs, state-source restricted county selection, inactive tabs, role changes, and return navigation.
7. Compare a production build with the baseline: entry 507.20 KB / 146.65 KB gzip; Admin 816.72 KB / 193.14 KB gzip. Verify the map is absent from the initial Admin import graph and loads when county selection is first needed. Report both initial cost and total bytes so splitting is not presented as code elimination.

Use a focused browser interception check for chunk loading and one desktop/mobile/keyboard pass of affected selector flows. Reuse existing map identity and path tests; preserve all 75 counties. If delayed mounting cannot retain a current draft/focus guarantee, document the impact and ask before that subchange.

### 2. Classify build tools accurately (R7)

Move `@vitejs/plugin-react`, `typescript`, and `vite` to devDependencies and update `package-lock.json` using the installed npm version without dependency upgrades. First establish that the frontend build environment installs devDependencies. If this cannot be established, leave the move pending and state the required deployment decision.

Keep backend `jsdom`, `pg`, `playwright`, and PDF parsing dependencies. Retain PGlite because the documented CLI loads it dynamically. Keep the matching Playwright image/package contract. Do not broadly remove dependencies based only on frontend imports.

Validate a clean full install/build and a disposable production-only install with backend import/startup smoke coverage using fixture configuration. Check production dependency contents and Docker behavior when Docker is available. If not available, explicitly record Docker as unverified; do not claim an image-size improvement.

## Phase 3 — simplify catalog projection and close verification

### 1. Index the current per-request registry data (R8)

In `scripts/lib/admin-catalog.mjs`, replace repeated relation scans with local indexes built once in `catalogProjection`:

```js
const sourceById = new Map(data.sources.map(source => [source.id, source]));
const capabilityById = new Map(data.capabilities.map(cap => [cap.id, cap]));
// Build linksByCounty, linksByPlace, associationsBySource, associationsByCounty
// in original array order. Do not overwrite one-to-many relationships.
```

Keep these helpers local unless a second real caller justifies sharing. Continue using `sourceInventory` and current execution coverage rules. Do not add persistent caching, combine unrelated catalogs, or change the database query scope in this phase.

Preserve multi-county city memberships, inactive geographies, missing state associations, saved-vs-current scope, SAM separation, expired/unsupported methods, unsafe URL handling, optional history failure, all filter semantics, sorting ties, and paging. Retain current bounds and public response shapes.

Use the existing catalog fixtures to compare complete outputs at a fixed time before and after indexing. Exercise one-to-many membership and tied sort values explicitly if not already covered. An ad hoc repeated-projection timing comparison may support the result; do not add timing-threshold tests or claim an unmeasured speedup.

### 2. Final checks and evidence

1. Run targeted catalog Node tests and lint. Run relevant browser acceptance only for changed loading/selector flows.
2. Run `npm run check` once after the final relevant code change. It includes lint, app/workflow/SQL tests, and a typechecked production build; do not append redundant typecheck/build commands.
3. If app collection reports missing temporary transform files, distinguish environment failure from assertion failure. This review saw the former; isolated reruns passed. Use a workspace-local ignored temp directory for a diagnostic retry if needed, without changing product code or relaxing test assertions.
4. Record dependency categories, removed symbols, test counts/results, bundle bytes, verified behavior, and any remaining blockers in a dated build report. Update current guide pointers only where they changed. Keep historical reports intact.
5. Review the diff for unintended behavior and unrelated files. No commit, deployment, migration application, or external write is part of this plan.

## Separate decision: scoped analytics (R1)

Do not silently change reporting scope/availability as cleanup. The finite-period usage read currently loads global ledger rows, then applies selected run scope. A future approved fix should query ledger events through matching trigger scope while retaining ledger-date attribution for older matching runs. It must test that unrelated high-volume events cannot exhaust a small scoped report, while global reports retain their current bounds and spend totals.

Impact to confirm before implementing: narrow reports previously rejected by the global ledger bound would become available. This is a reporting behavior change. Do not substitute creation-date filtering or remove the bound to make the query cheaper.

## Success criteria

- Confirmed dead components, dead query export, duplicated shared types, and unused trigger-loader branch are gone; useful tests exercise live entry points.
- No existing reachable action, queue context, draft, selection, permission, import safeguard, or source-evidence behavior changes.
- County geometry is deferred until its first needed screen; exact map data and interaction remain intact. Initial and total bundle costs are reported honestly.
- Build-tool classification is corrected only after build/deploy compatibility is verified; actual backend dependencies remain installed.
- Catalog projection returns equivalent public results with less repeated relation scanning and no persistent cache.
- Required checks pass, or specific environment/tool limitations are recorded without claiming success.
- Retained future features, migration/audit history, operational evidence, and unrelated user changes remain intact.

Completed November 1, 2026. See the [build report and removal manifest](../../docs/reviews/2026-11-01-lean-codebase-cleanup-build.md). The dependency move used the plan's permitted fallback: keep existing placement because frontend install behavior could not be established. Scoped analytics remains deferred as requested. Two pre-existing test-fixture assumptions were stabilized without changing production safeguards. Final `npm run check` passed (207 app tests, 414 workflow tests, both SQL regressions, lint, and build), along with focused built-browser acceptance.
