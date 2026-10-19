# Durable scheduling deployment record

Prepared October 13, 2026; deployment update October 18 below. Recurring activation pending. No UI changes in part 02. Bonfire/Euna remains deferred.

## Verified infrastructure and activation scope

Read-only linked Supabase inspection: project `zreplhkoxswtzxlchtjf`; Vault installed; pg_cron and pg_net available but not installed. Part 01 trigger tables and part 02 schedules were absent. Private inspection artifacts are under `outputs/deployment/admin-scheduling/` and are ignored by Git. This is evidence of availability, not successful activation.

Fixed destination: `https://janitorial-procurement-backend.onrender.com/internal/procurement-scheduler/tick`. Existing Render free service `srv-db2q9mmi0phs738v7f80`, auto-deploy disabled. No new paid host. Backend variable `PROCUREMENT_SCHEDULER_KEY` must match private Vault secret named `procurement_scheduler_wake_key`; minimum 32 characters, preferably 64 random characters. No user JWT is stored. Do not log or commit its value. Render deployment credentials are supplied privately at rollout; never commit or print them.

Review and apply the forward migration chain (including part 01, 20261013000100, plus 00200 and 00300) through the existing migration process; inspect pending migrations first. Deploy the reviewed backend and set its private environment key. Install the matching Vault secret using the protected dashboard/API. Confirm health and private authorization, then execute [activation SQL](../supabase/activate-procurement-scheduler.sql) as the database operator. It creates one named every-minute Cron dispatcher; recurrence stays in schedule rows. The migration itself leaves dispatch disabled and installs no extensions.

The [pause SQL](../supabase/pause-procurement-scheduler.sql) disables the dispatcher and unschedules only its named job. Individual pause/archive controls retain history; edits affect future occurrences only. Neither archive nor dispatcher rollback cancels already-sent work. Pause prevents further automatic sends from scheduled runs; explicit manual reconciliation remains available. In-flight requests may finish. Use Stop run when cancellation is intended.

## Bounds and delivery semantics

A tick reads at most five due schedules. Existing serialized worker kick runs for at most 120 seconds and uses existing ten-minute job leases; external calls retain existing bounded adapter/provider limits. Dispatcher HTTP timeout is 90 seconds. Pending wake deliveries hold additional sends, and missing outcomes become `outcome_unknown` after three minutes; retries have a one-minute cooldown. These are configured limits; no production cold-start/worker latency is measured yet. Timed-out wake acknowledgment does not imply the worker failed: schedule row locks and unique occurrence keys protect restart/replay. Worker continuations are awakened on later ticks, including without a due schedule. No idle keepalive is issued.

Business/external outcome unknowns stay reconciliation-required through existing reservations/jobs. Occurrence overlap is skipped, not accumulated. Outages coalesce into one latest due occurrence with a recorded missed range and freshly resolved rolling local-date windows. Latest successful comparable observation metadata is frozen alongside the occurrence; original any-historical-fingerprint classification, packets and import safeguards stay in use. Comparability requires source/capability/category/parser/window equality; changed rolling windows can have no comparable baseline and are not presented as an unchanged observation.

## Remaining live acceptance gate

After authorized rollout, use one bounded test schedule owned by an active account and a reviewed existing county/source configuration. Keep AI disabled/monthly cap zero. Close the app; verify a due occurrence, worker continuation and completed step audit/actual usage projection independently through server/operator inspection. Repeat tick/restart and confirm one occurrence. Pause and confirm the next occurrence and pending automatic sends stop. Archive only the test schedule; retain its evidence. Record actual delivery and worker timings and sanitized IDs/statuses here. Restore the prior dispatcher enabled state if it was enabled before the test; do not alter unrelated schedules.

Activation remains blocked until the backend key/deployment and extensions are configured and that gate passes. The plan stays in `specs/todo/`; local tests do not establish browser-independent production execution.

## Local verification result

`npm run check` passed: lint, 21 app tests, 257 workflow tests, SQL preservation/replay/rollback gates and production build. `npm run test:access` passed against isolated PostgreSQL 15/PostgREST, including private scheduling tables/RPCs, no-browser HTTP wake, a real shared planning stage, completed audit with AI not used, duplicate wake and pause. Latest isolated wake plus planning-stage measurement: 164 ms; this is a local measurement, not production cold-start performance. `git diff --check` passed. No production writes, paid calls or canonical live imports were performed.


## Authorized host rollout — October 18, 2026

The user authorized commit, push, and deployment to the existing Render and Netlify services. The three reviewed migrations (20261013000100–20261013000300) were applied atomically and recorded in Supabase migration history. Readback confirmed Admin/schedule tables present and scheduler_enabled=false. Older migration-history gaps were left untouched. No recurring job or new schedule was enabled and no paid provider calls were initiated. Local check/build gates passed again before release. Exact host commit/deploy IDs and live readback are retained privately in outputs/deployment/admin-scheduling/. The production scheduler app-closed acceptance gate remains outstanding; host deployment does not satisfy it.
