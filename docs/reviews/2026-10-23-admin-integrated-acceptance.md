# Phase 6 — Integrated Admin acceptance

Status: local/native and deployed browser/API verification passed. Live manual/scheduled acceptance is blocked by an existing county worker state loop; Phase 6 remains in todo. Netlify production unchanged.

## Preflight

- Checkout: `codex/admin-county-trigger-ui`, documentation HEAD `155a72c`; initial working tree clean. Existing deployed runtime is `65a0d8e`.
- Render: `dep-dbdq8jfavr4c7391afeg`, live. Netlify preview: `6adba51409181c06a791e070`. Production remains locked at `6ad583d1b9bb1b307abcf1fd`.
- Backend configuration hash: `7c6e8222f163f9bdeba42b8a87921d0d2f72edfc59511620d29addb317c40903`. No configuration changes proposed.
- Shared overview, work-reservation, grouped-state and activity views exist. Read-only migration-history inventory is retained privately. Migration history alone is not a complete ledger of manually applied SQL; object/API verification and prior receipts establish the applied reporting dependencies.
- No new migration is required. The old `d218166` pre-redesign checkpoint is historical. Existing code includes the previously accepted Saline/public-source continuation; this phase neither reapplies its packages nor activates deferred provider work.

## Changes and cleanup

1. Run status now includes its saved schedule name, looked up only after the trigger establishes schedule membership. This fills the existing breadcrumb contract, including renamed/archived schedules. No trigger state, collection, import, budget, owner, queue or recurrence behavior changes.
2. Replaced the default browser scenario that still expected the removed Admin heading, Review/Confirm schedule steps, old action menus and second occurrences table. The current default reuses the same app/auth/HTTP fixture harness and follows the accepted editor/detail/read-control behavior. Other amendment-specific scenarios remain available.
3. Corrected the older schedule-revision acceptance assertion to expect the unified run plus no-run attempt. Removed its obsolete default scenario code and unused imports/counters; no runtime feature or saved data was deleted.
4. Fixed management acknowledgments leaving an archived schedule visibly Active when another schedule was previously created. The acknowledged version now takes precedence over older list data and survives filtering; unit and integrated browser regressions cover it.
5. Updated stale parent/umbrella checkpoints and links. Phase 6 and the parent stay in todo until live acceptance passes.

## Verification matrix

| Area | Evidence |
| --- | --- |
| Complete regression | `npm run check` passed: lint, 169 frontend tests/23 files, 388 workflow tests, SQL validation/import/replay/concurrency checks, TypeScript/Vite build. Existing large-bundle advisory only. |
| Native database | `npm run test:access` passed on disposable PostgreSQL 15/PostgREST, including the new schedule-name read assertion, audit/actor/RLS/privacy, recurrence/concurrency/ack loss, native manual/scheduled positive SAM/county imports, original sales data, grouped state scope, reporting identities and paging. No production fallback. |
| Integrated browser | Actual built app with intercepted fixture HTTP: Settings/Profile/email/keyboard/touch/sign-out; paused county creation through map/city disclosure; immutable saved counties; edit/Run Now/run detail; Stats → current source blocker/method → related municipality → original filtered schedule list; pause/re-enable/archive/audit retention; separate weekly State and monthly SAM schedules; multiple daily times; disconnected read/Retry; 1440/390/320 and 200% zoom. Fixture writes never reach shared services. |
| Amended browser matrix | Existing editor/menu, single-read-owner, schedule Logs/Sources, source/geography catalog, analytics, Issues/log tables, unified execution/metric completeness, submitted History, exact lead/issue cohort, and duplicate canonical redirect suites. Per-scenario receipts are retained privately. |
| Preserved behavior | No changes to actual collection/import/scheduler implementations, validations, duplicate decisions, protected notes/stages, budgets/rates, Companies or email preview code. Current-source/related-geography reads remain read-only; state/SAM schedules remain independent from county work. |
| Timing/usage integrity | Last actual run remains distinct from skipped dispatch; unioned completed intervals are not wall time. Seven-day report defaults, exact canonical membership/precedence, overlapping categories, partial recorded usage, measured zero versus absent measurements and provider credit units retain existing semantics. |

Private test logs/screenshots: `outputs/deployment/06-admin-release/` and `outputs/deployment/admin-ui/06/`; prior accepted-child receipts remain separate. The native and fixture suites establish positive imports without requiring a live matching opportunity or manufactured data.

## Prepared live acceptance

Requested authorization: commit/push `fix: verify integrated admin workflows`, deploy matching Render backend first and Netlify draft preview second, then one disposable Arkansas County (`05001`) opportunity schedule for updates only. This county/work key was free at read-only preflight; recheck before creation. Use existing current AI settings/budgets, 120-day window, registered sources, validations and automatic imports. Do not initiate source-maintenance research or provider-access work.

Create paused, run once manually, wait for its saved outcome, then enable one near-future daily time using the existing CT recurrence service. Close the browser and let the existing Cron/dispatcher create one naturally due scheduled occurrence; do not manually tick or backdate it. Verify occurrence/run/steps/usage/metrics/source links and readback, then archive the disposable schedule. Preserve its evidence and audit. Compare existing schedule configuration/version/ownership and production deployment/lock with the preflight baseline. Honest no-results/source-attention outcomes are acceptable; a pending, unreadable or unverified outcome is not a passed check.

The user explicitly authorized the exact commit/push, Render-first/preview release and disposable manual/naturally due acceptance schedule on 2026-10-23. If live acceptance is blocked, retain the parent and Phase 6 in todo and report the exact remaining requirement. Do not resume unrelated pending historical work to force a passing result.

Rollback: return Render/preview to the prior compatible `65a0d8e` release if required. Archive only the disposable acceptance schedule. Preserve existing history/evidence and canonical leads. No schema rollback is needed for this phase.

## Released build and live blocker

- Committed/pushed `27f79fc` — `fix: verify integrated admin workflows`. Render `dep-dbdqv8om7kps73bdeql0` verified live first; Netlify preview `6adbb046de7263a00464e3d7` deployed second. Five deployed assets match the build. Production remains locked at `6ad583d1b9bb1b307abcf1fd`; full backend configuration hash unchanged. No new migration.
- Authenticated API reporting, private projections/anonymous denial, grouped state preview and existing schedule contracts passed. Read-only real preview checks passed at 1440/390/320, keyboard and 200% zoom with zero workflow writes/page errors.
- Disposable paused Arkansas County schedule `aa0e19ee-5a85-4e34-8532-9f68286a513b`; manual run `7b9dd68a-4371-4f47-b786-b2d9d9d5cdf5` remains pending with no steps/AI usage. No naturally due test was enabled while manual work remained pending.
- Earlier county run `c006d0c2-1781-439d-83fc-2b1ff85e2de5` has its exact `api-workflow:<request>` coordinator blocked at collection with `workflow_stage_failed`, 18 pending child captures and no pending/running process job. Trigger aggregation treats those captures as active work, returns Pending, and oldest-first claiming repeatedly reclaims it. Waiting through lease expiry showed the same run reclaimed again.
- Offline PGlite reproduction confirms two claims both select that stalled run while the newer run retains zero attempts. Existing artifact/lease protections stay intact. Proposed narrow correction: blocked collection-coordinator captures must not keep the run live Pending; report attention and let independent work proceed. Do not auto-retry failed collection or alter budgets, leases, schedule definitions or queue order. Worker behavior is outside the narrow UI acceptance corrections, so explicit user clarification was requested before implementation under repository instructions.

Local private diagnostics/reproduction are retained under `outputs/deployment/06-admin-release/`. Do not mark the parent or Phase 6 done until real manual and naturally due outcomes are verified and the disposable schedule is archived.
