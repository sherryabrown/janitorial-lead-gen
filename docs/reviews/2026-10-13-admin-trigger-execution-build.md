# Admin trigger execution and audit build — October 13, 2026

Part 01 of the [Admin county-trigger effort](../../specs/todo/admin-county-triggers.md). Implementation is local; no production migration, deployment, source research, provider call, AI activation, commit or push was performed. Scheduling and the Admin/map screen belong to parts 02/03.

## Result

- Added authenticated county listing, read-only scope preview, confirmed manual submission, run/status/step paging, cancellation/resumption and independent state-target listing. All signed-in users retain the agreed shared access. No Admin role gate was added.
- Parent submission is atomic and idempotent, including sorted county/category identity. It freezes all incorporated city names/IDs and dataset revisions per county. Stale previews are rejected. Interrupted submission retries reconcile the same key/run without another child request. Parent submissions have a ten-per-hour actor limit; one allowed parent can cover all 75 counties without multiplying legacy child submission rate limits.
- Child creation reuses `create_procurement_geography_request`; execution reuses the source planner/adapters, official-link research, interpretation/cache/staging, guarded registration and reviewed import/rehearsal/readback. New code coordinates existing services rather than implementing another collector/importer.
- County runs exclude state update routes and sources with state-category methods. Initial county/category/revision research has durable shared checkpoints. Found state sources get one independent source/category target with many county associations. Later county requests expose saved state-run references instead of dispatching another state update. Independent source runs create one state route with the associated counties' work-location scope.
- Missing official seeds, expired/unsupported methods and unresolved evidence remain reviewable gaps. Source finding is not automatic activation or county lead coverage. Maintain-only requests do not collect verified pages; empty maintain-only plans record reuse without calling the existing nonempty-plan RPC.
- Added private persisted step attempts around resolve/research/revalidation, page/API/document fetch, compare, extraction/cache/AI, staging, import testing/apply/readback and user controls. Actor, trigger origin, user/worker execution, source/task/job/county identity where available, controlled phase/counts/outcomes, timestamps and diagnostic UUIDs are available. Unfinished earlier leased job attempts become interrupted on retry. No arbitrary exception text, URLs with private state, SQL or raw payload is exposed in step projections.
- Audit start failure prevents a new external action. Audit completion precedes HTTP acknowledgment; an uncertain audit completion returns a sanitized failure rather than a premature success response. Existing capture/import/billing guards remain the reconciliation authority.
- Usage stays in the original ledger, now linked to step and trigger. All children share the existing $1/four-call/32k-input/8k-output envelope and configured monthly cap. PostgreSQL serializes reservations, requires a matching active step and blocks outstanding billing. No new spending authorization or model/provider was introduced.
- Actual tokens/cost are distinct from reservation estimates, held funds and unknown billing. Provider credits appear only when actual entries consistently report an amount/unit; otherwise null. County/step totals derive from the ledger without copying/double-counting usage. Admin child status uses actual-only usage; standalone status behavior remains unchanged.

## Verification

`npm run check` passed: lint, 21 app tests across four files, 244 offline workflow tests (zero failures/skips), both standalone SQL suites, TypeScript and production Vite build. JS 495.51 kB / gzip 142.34 kB; CSS 24.84 kB / gzip 5.40 kB. The frontend was unchanged.

Final focused Admin tests and lint verify the subsequent narrow coordinator/audit hardening: county-order replay, shared-budget attribution, private phase filtering, interrupted-step recovery and registry/state-target reuse. Ten Admin tests use the real baseline and forward migration chain in offline PGlite with the shared planner and an SQL-backed API protocol adapter.

The real isolated PostgreSQL 15/PostgREST gate passed, including prior queue/auth/note/history tests plus new private-table/RPC denial, atomic Admin replay, concurrent shared parent reservations/four-call cap, private state summary and unresolved-usage resume rejection. `production_contacted:false`. Vite and PostgreSQL required execution outside Windows sandbox restrictions; no application permission or deployment setting changed.

Private logs:
- `outputs/deployment/code-review-2026-10-12/admin-trigger-check.log`
- `outputs/deployment/code-review-2026-10-12/admin-trigger-final-tests.log`
- `outputs/deployment/code-review-2026-10-12/admin-trigger-access.log`

Whitespace and changed-document link checks passed. No whole-file deletion or dependency addition occurred.

## Files and rollout

Forward migration: `supabase/migrations/20261013000100_admin_county_triggers.sql`. Five private tables, usage-ledger links, guarded submission/control/audit functions, worker mutual exclusion and indexed latest state-run status are additive. Apply this reviewed migration before deploying the backend code; existing environments without it cannot serve the new routes. Existing restricted import/rehearsal credentials and settings are preserved.

New libraries: `county-triggers.mjs`, `workflow-audit.mjs`. Existing server/HTTP, AI, worker, source collection/API, discovery, supporting capture and import services gained integration hooks. New tests: `admin-triggers.test.mjs` and SQL fixture adapter; isolated access runner extended. Current contracts: [ADMIN-TRIGGERS.md](../ADMIN-TRIGGERS.md), [PROCUREMENT-BACKEND.md](../PROCUREMENT-BACKEND.md). Plans and coordinator record the completed dependency. Twenty-two paths including the completion records and sibling-plan dependency pointers were touched in this build.

## Remaining scope

No decision blocks this local part. Production migration/deployment and live acceptance remain rollout work. Part 02 must provide durable scheduling and wake/continuation; request-driven execution here is not browser-independent scheduling. Part 03 must provide map/form/activity/review UI. Official-seed and method-evidence gaps remain legitimate operational handoffs. Bonfire/Euna remains deferred; Admin does not automatically invoke its authenticated browser. Companies/email and canonical sales behavior are preserved.

Next: `$build-code specs/todo/02-admin-county-trigger-scheduling.md` using the parent requirements and this established API/audit layer.
