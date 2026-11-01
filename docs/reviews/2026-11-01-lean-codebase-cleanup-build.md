# Lean codebase cleanup build — November 1, 2026

Status: **SUCCESS**. Plan: [lean codebase review and cleanup](../../specs/done/lean-codebase-review-and-cleanup.md). Findings: [review](2026-11-01-lean-codebase-review.md).

## Implemented

- Removed the obsolete activity list and all-time schedule summary wrapper. Source-gap labels and run navigation are now tested through the current `RunHistory` and `RunDetail` components. The shared metric renderer and actual schedule results remain intact.
- Reused the existing shared history/note/filter types in AppShell and made the schedule page-restoration loader schedule-specific. Storage keys, restore bounds, abort/generation guards, and failed-page retry semantics are unchanged.
- Added a shared lazy boundary for the exact county selector. Manual controls defer the geometry until first visible use and remain mounted afterward. New county schedules use the same boundary. A local error boundary retries a failed chunk without discarding the owning form.
- Replaced repeated catalog relation scans with request-local source/capability maps and ordered one-to-many link/association indexes. No response cache, query-scope change, migration, or change to source-inventory authority was introduced.

## Removal manifest

No entire source file, database object, historical report, fixture, or operational artifact was deleted.

| Removed item | Evidence / retained replacement |
| --- | --- |
| `ActivityList` in `src/features/admin/ScheduleList.tsx` | Only its old test called it; current history/navigation assertions now use `RunHistory` plus `RunDetail`. Live `StateSourceList` and the table re-export remain. |
| `ScheduleAnalyticsSummary` in `src/features/admin/Analytics.tsx` | Only its dedicated test called it. Current schedule details use selected-run results; `AnalyticsSummary` and its real callers remain. |
| AppShell's local `HistoryType`, `ClosedSubcategory`, `LeadHistoryItem`, `LeadNote` definitions | Imported from existing `src/features/shared/types.ts`; field optionality and UI/transport model boundaries retained. |
| Unused trigger restore depth and generic trigger branch in AdminScreen's local schedule loader | Schedule-only loading retains the same URLs and pagination/storage behavior. All trigger APIs remain. |
| `duplicateRepairSchemaQuery` in `scripts/lib/schema-query.mjs` | No executable/test caller. Routine schema query, county repair inventory, and native rehearsal remain. Historical mentions remain dated evidence. |

Executable reference checks cover source, scripts, tests, package/deployment commands, current docs, and active specs. The plan and dated review naturally still mention the removed names.

## Timeout investigation

Before application edits, the schedule-editing test passed its existing 5,000 ms limit in repeated isolated runs. A temporary timing probe measured one global Schedules-button query at 211.9 ms versus 6.2 ms scoped to the navigation. Repeated broad role queries traverse the 75 SVG map controls and increase sensitivity to concurrent load. This supports a test-query cost explanation; it does not prove a production scheduling defect.

Removed the probe and scoped that test's navigation/editor/list queries to the owning containers. All assertions, the saved-version check, and the original timeout remain. Later selector tests await the asynchronously loaded county control instead of assuming synchronous availability. Phase 1's seven targeted app files passed 103 tests; the selector editor suite then passed all nine tests after those async waits were updated.

The first complete workflow gate also exposed two existing fixture assumptions: six hosted-import tests used an October 30 solicitation deadline with a wall-clock snapshot, and the historical cutover test rejected any current application change through its pinned-release guard. Test-only fixes bind constructed snapshot dates to the fixture's October 4 date (real timeout/worker clocks remain real) and run cutover preparation in a disposable local checkout of the pinned runtime. A new test still rejects an expired solicitation; the cutover fixture explicitly introduces runtime drift and verifies rejection before proceeding. All 14 hosted-import tests and both cutover tests passed individually. Production deadline validation, cutover scripts, acceptance hashes, and release guards are unchanged. Generated cutover packages now stay in the disposable fixture instead of the operator's output folder.

## Bundle observations

Same geometry and existing styles; no simplification, GIS refresh, or added dependencies. Sizes are Vite's decimal KB observations, not latency measurements.

| JavaScript | Review baseline raw / gzip | Build raw / gzip |
| --- | --- | --- |
| Entry | 507.20 / 146.65 KB | 507.24 / 146.67 KB |
| Initial Admin | 816.72 / 193.14 KB | 209.58 / 56.24 KB |
| Deferred county selector | Included in Admin | 608.34 / 135.93 KB |
| Total | 1,323.92 / 339.79 KB | 1,325.16 / 338.84 KB |

The benefit is reduced initial Admin loading; total raw JS is about 1.24 KB higher in these build observations. The baseline used the local workflow origin, while the acceptance bundle uses Render; that configured string also accounts for a few entry bytes. Large-chunk warnings remain for the entry and map chunks. The warning threshold was not raised. The exact map file remains unchanged (SHA-256 `9e72d3a92022601cf90693a98d8ab28513fb58f2747d7f9608f6ed5424819ba9`).

The acceptance bundle uses the existing Render workflow origin so the browser harness intercepts every workflow request. A default local build had pointed at the user's localhost workflow origin, which the harness correctly rejected as unexpected traffic. No application environment file or deployment setting was changed.

## Verification

- Phase 1: seven targeted app suites, 103 tests passed; lint and typecheck passed.
- Final aggregate app stage: all 27 suites / 207 tests passed with the existing timeouts.
- Import/repair checks: 15 Node tests passed, including rollback, replay, exact cohorts, protected data, and reviewed batch CLI SQL verification.
- Catalog/map checks: 10 Node tests passed, including the new tied-name paging/one-to-many order case, real disposable SQL reads, and all 75 map paths.
- Ad hoc fixed-time comparison: 150 complete catalog output/error comparisons against the pre-index implementation passed across county/state/SAM scopes, expired methods, filters, pages, and projection modes. No performance percentage is claimed.
- Built-browser acceptance: `node tests/integration/admin-ui-browser.mjs --built --county-loading` passed. Verifies no initial geometry request, one induced chunk failure and successful retry with draft retention, keyboard map/checklist selection, search/selection retention on navigation, direct manual entry, and desktop/mobile overflow. Screenshots under ignored `outputs/deployment/admin-ui/county-loading/` were visually inspected at 1440 px and 390 px.
- Browser acceptance required execution outside the local sandbox: Vite listened inside it, but harness loopback readiness timed out. The successful browser run used intercepted fixture HTTP; unexpected external requests remained blocked.
- First complete workflow stage: 406 / 413 passed; the seven failures were the fixture assumptions above. The app stage passed 207 / 207. No complete aggregate pass was claimed from that attempt.
- Final `npm run check` after those test-only fixes: **passed**, exit 0. Lint, 27 app suites / 207 tests, 414 workflow tests (zero skipped, zero failures), both standalone SQL scripts, TypeScript, and Vite production build passed. It ran outside the sandbox because Git's local checkout helper is denied inside it; workflow network blocking remained enabled. Final log: ignored `node_modules/.tmp/build-cleanup/final-check-verified.log`.

## Deliberately retained / limitations

The three build tools (`@vitejs/plugin-react`, `typescript`, `vite`) remain in dependencies. Local Netlify configuration declares `npm run build` but does not establish all build environments' dependency-install behavior. The user asked for review/judgment rather than confirming devDependency installation; the plan's permitted conservative fallback avoids risking a build regression. Package manifests, lockfile, and Docker configuration are unchanged. No fresh install or production-only packaging claim is made. Docker inspection could not connect to its local engine due to pipe permissions; no image was built and no image-size reduction is claimed.

Scoped analytics (R1) remains deferred exactly as requested. Companies/email functionality and data, applied migrations, import safeguards, audit/recovery history, private outputs, and the pre-existing `supabase/.temp/cli-latest` modification are preserved. No live provider call, production mutation, deployment, or commit was performed. Local acceptance does not certify deployed access/RLS or provider behavior.

Suggested commit message: `refactor: remove obsolete UI paths and defer county geometry`.
