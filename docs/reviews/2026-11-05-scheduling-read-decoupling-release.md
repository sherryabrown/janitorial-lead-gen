# Saved scheduling read release — November 5, 2026

The owner explicitly requested commit and production deployment, superseding the build-only restriction. Released to https://spin.aptimap.tools across Supabase, the existing Render Free worker and the locked Netlify frontend. Private receipts are in ignored `outputs/deployment/scheduling-read-decoupling-release/`.

## Qualification and data

Before changes, production held 338 leads, 4,653 captures, 84 runs and 14 schedules, with no running jobs. Current production frontend was locked deployment `6aea5d0ccb5cc3a094a8357b`; the prior Render state/deployment and SQL function definitions/grants were retained privately for recovery. The original immutable receipts remain unchanged.

The eight November 4 additive migrations were applied atomically and recorded in the migration ledger. A dry run examined all 84 run identities using current saved evidence. The qualified projection cohort was 53 runs: 11 verified identity results, 33 partial known subtotals, three aggregate-only results and six maintenance/not-applicable results. There are 44 per-run member records, not 44 distinct leads across runs. The remaining 31 unsupported histories remain unavailable. No historical work was resumed, source/provider called, original receipt rewritten, or missing classification inferred from a current lead. The same validator prepared derived source-readiness metadata for 61 existing capabilities.

Actual authenticated User/Admin database-role probes and anonymous denial passed in rolled-back read-only transactions. They checked hidden helper/raw result denial, Admin-only usage/logs, summary/member count agreement and incomplete subtotals. These are database enforcement checks; browser checks use the existing signed-in account rather than pretending to create independent sessions for every role.

The production-data draft test caught a statistics timeout before frontend publication. Migration `20261105000100_bound_saved_reporting_work.sql` removes unnecessary full run-detail construction from analytics, retains the existing interval-union timing/fallback, and scopes source-attention evidence to the task's owning request before inspecting checkpoints. This corrects query work, not report semantics. The migration was locally tested and then applied/ledger-recorded; permission/count probes and signed-in draft checks passed afterward. Original November 4 migrations were not rewritten after application.

## Tests and preview support

All 215 app tests, 417 workflow tests, SQL import gates, lint and the production build passed. Native PostgreSQL 15/PostgREST acceptance passed, including private dispatch with the browser closed, role protection, imports, canonical merges/classification retention, historical gaps, reopened results, saved progress and zero read mutations. After the reporting optimization, the focused SQL parity/recovery tests passed again; final native regression evidence is retained in `release-native-final.log`.

The local preview now prepares its disposable schema/sample data directly rather than running the entire regression suite first. Startup captures PostgREST output through pipes, excludes external gateway/database environment overrides, detects process exit, and waits for the schema refresh before sample publication. The separate `npm run test:access` gate is retained. The native public-detail fixture uses a future test deadline so its November 5 closing date does not break import acceptance as the calendar advances; application date rules were not relaxed.

Draft `6aece4b09feb2ce221e9ade0` at the existing `bonfire-review` alias has six exact verified production-configured assets. Signed-in saved schedules, source setup, statistics, submitted history and a verified report-to-Contracts drilldown passed with every Render request blocked and zero product mutations. No private key or local-preview configuration entered the build.

## Published artifacts and final checks

- Application/worker commit: `34fb33c3ae42c38aafcfc4f00c17442944aac1f3`, pushed to the existing `codex/admin-county-trigger-ui` branch for the authorized Render deployment.
- Render deployment: `dep-dbmecquc6qcc73e8hr00`, verified live on that exact commit. Plan remains `free`; automatic deployments remain `no`. Environment, recurrence/private dispatch configuration and hosting tier were not changed.
- Netlify production deployment: `6aece4b09feb2ce221e9ade0`, published and locked. All six production assets match the qualified build, allowing only the previously inspected Netlify public HUD HTML addition.
- Signed-in production browser verification repeated saved schedules, source setup, statistics, submitted history and a real Contracts drilldown with Render blocked. Ten saved-read operation types were observed; zero Render requests or product mutations were attempted. This proves read independence while Render is inaccessible to that browser, not a claim that the service was deliberately stopped.
- Final read-only production inventory: 338 leads, 4,653 captures, 84 runs and 14 schedules, matching pre-release counts. All nine migration versions are recorded; 53 headers/44 member records are present; 31 unsupported histories remain without reconstructed projections. No stale projections or pending source-readiness fingerprints remain. Browser roles have no raw result-table grants.
- The actual Admin analytics query over the default production reporting selection completed in 1,922 ms under `EXPLAIN ANALYZE` in a rolled-back read-only transaction. Member lookup completed in 0.037 ms. These are observed query timings, not a broad load/concurrency benchmark.
- The final native suite passed after the query optimization. The four implementation/release plans are moved to `specs/done/`; their original planning prohibitions and pending-GO notes are historical and superseded by this owner-authorized release.

No live test collection, repair, schedule change, import, lease reset or historical workflow resume was fabricated. Execution remains covered by the isolated browser-independent dispatch/import tests and the deployed worker's exact commit; this release does not claim a newly observed natural production occurrence. The unrelated Supabase CLI cache modification remains uncommitted.

## Recovery

Restore the captured locked frontend deployment if needed; existing Render read endpoints remain. Restore the captured prior Render worker deployment if lifecycle integration needs rollback. Keep result tables, original receipts and invalidation markers. Restore saved reader definitions/grants when necessary rather than granting private tables. Wrong projections can be rebuilt atomically from verified evidence. Schema deletion, lead rollback, lease resets, broad history replay and hosting upgrades are not part of this release.
