# Saved scheduling read release — November 5, 2026

The owner explicitly requested commit and production deployment, superseding the build-only restriction. Release is coordinated across Supabase, the existing Render Free worker and the locked Netlify frontend. Final deployment identifiers and verification are recorded below after publication. Private receipts are in ignored `outputs/deployment/scheduling-read-decoupling-release/`.

## Qualification and data

Before changes, production held 338 leads, 4,653 captures, 84 runs and 14 schedules, with no running jobs. Current production frontend was locked deployment `6aea5d0ccb5cc3a094a8357b`; the prior Render state/deployment and SQL function definitions/grants were retained privately for recovery. The original immutable receipts remain unchanged.

The eight November 4 additive migrations were applied atomically and recorded in the migration ledger. A dry run examined all 84 run identities using current saved evidence. The qualified projection cohort was 53 runs: 11 verified identity results, 33 partial known subtotals, three aggregate-only results and six maintenance/not-applicable results. There are 44 per-run member records, not 44 distinct leads across runs. The remaining 31 unsupported histories remain unavailable. No historical work was resumed, source/provider called, original receipt rewritten, or missing classification inferred from a current lead. The same validator prepared derived source-readiness metadata for 61 existing capabilities.

Actual authenticated User/Admin database-role probes and anonymous denial passed in rolled-back read-only transactions. They checked hidden helper/raw result denial, Admin-only usage/logs, summary/member count agreement and incomplete subtotals. These are database enforcement checks; browser checks use the existing signed-in account rather than pretending to create independent sessions for every role.

The production-data draft test caught a statistics timeout before frontend publication. Migration `20261105000100_bound_saved_reporting_work.sql` removes unnecessary full run-detail construction from analytics, retains the existing interval-union timing/fallback, and scopes source-attention evidence to the task's owning request before inspecting checkpoints. This corrects query work, not report semantics. The migration was locally tested and then applied/ledger-recorded; permission/count probes and signed-in draft checks passed afterward. Original November 4 migrations were not rewritten after application.

## Tests and preview support

All 215 app tests, 417 workflow tests, SQL import gates, lint and the production build passed. Native PostgreSQL 15/PostgREST acceptance passed, including private dispatch with the browser closed, role protection, imports, canonical merges/classification retention, historical gaps, reopened results, saved progress and zero read mutations. After the reporting optimization, the focused SQL parity/recovery tests passed again; final native regression evidence is retained in `release-native-final.log`.

The local preview now prepares its disposable schema/sample data directly rather than running the entire regression suite first. Startup captures PostgREST output through pipes, excludes external gateway/database environment overrides, detects process exit, and waits for the schema refresh before sample publication. The separate `npm run test:access` gate is retained. The native public-detail fixture uses a future test deadline so its November 5 closing date does not break import acceptance as the calendar advances; application date rules were not relaxed.

Draft `6aece4b09feb2ce221e9ade0` at the existing `bonfire-review` alias has six exact verified production-configured assets. Signed-in saved schedules, statistics and submitted history passed with every Render request blocked and zero product mutations. No private key or local-preview configuration entered the build. Production publication, worker identifiers and final live checks are appended after completion.

## Recovery

Restore the captured locked frontend deployment if needed; existing Render read endpoints remain. Restore the captured prior Render worker deployment if lifecycle integration needs rollback. Keep result tables, original receipts and invalidation markers. Restore saved reader definitions/grants when necessary rather than granting private tables. Wrong projections can be rebuilt atomically from verified evidence. Schema deletion, lead rollback, lease resets, broad history replay and hosting upgrades are not part of this release.
