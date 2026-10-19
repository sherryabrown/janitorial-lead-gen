# Durable scheduling deployment record

Production activation and live acceptance passed October 18, 2026 (America/New_York). Part 02 is complete; the Admin screen is part 03. Bonfire/Euna remains deferred. No new paid infrastructure or AI budget was introduced.

## Active infrastructure

Activation/live acceptance used existing free Render service `srv-db2q9mmi0phs738v7f80` at commit `4ea88e883120fefd92d40fd27c6ded6d237b1bc5`; its key-configuration deployment was `dep-dbanvfu1egvs73bf1up0`. Later documentation-only releases do not change that acceptance record. Supabase project `zreplhkoxswtzxlchtjf` has Vault 0.3.1, pg_cron 1.6 and pg_net 0.14.0 installed. The three Admin migrations were installed and recorded October 18; older migration-history gaps were left untouched.

One active Cron job, `procurement-scheduler-dispatch` (ID 2), runs `* * * * *` and executes only `select public.procurement_scheduler_dispatch();`. Business recurrence stays in schedule rows. The fixed destination is `https://janitorial-procurement-backend.onrender.com/internal/procurement-scheduler/tick`.

Vault secret `procurement_scheduler_wake_key` matches Render variable `PROCUREMENT_SCHEDULER_KEY`; no value is stored in source, receipts or logs. User JWTs are not saved for future runs. All other Render environment values, including AI enabled=true and monthly AI USD=10, match the pre-activation snapshot exactly. Existing per-trigger envelopes and provider/model/rate settings are unchanged. No production recurrence is enabled: both acceptance schedules are archived, and the dispatcher is idle until real work is due/pending.

## Activation, access boundary and rollback

Use [activation SQL](../supabase/activate-procurement-scheduler.sql) only after the matching backend key is live and authorization/health are verified. It installs extensions if needed, verifies the Vault reference, and creates/updates one named job. It must not be used to create one job per county. The migrations themselves leave dispatch disabled.

Scheduling tables and submission/control/dispatch RPCs deny anonymous and authenticated direct Data API access. Management routes use ordinary user authentication; the private tick rejects user JWTs, anonymous and invalid callers. Correct private authorization was verified separately.

Supabase manages pg_net's PUBLIC transport grants and does not support revoking them per project. The supported boundary was verified with both anonymous and authenticated clients: `net` is excluded from exposed Data API schemas (PGRST106), and browser database roles are NOLOGIN. SQL login roles must remain trusted: pg_net temporarily queues request credentials in headers. Never expose `net` through the Data API. See [Supabase's grant constraint](https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16). Vault remains browser-private, and no privileged service key is used as the wake credential.

[Pause SQL](../supabase/pause-procurement-scheduler.sql) disables future dispatch and unschedules only this named job, preserving evidence and all other jobs. Pause relevant schedules to stop further automatic sends from already-pending scheduled runs. In-flight sends may finish; use explicit Stop run for cancellation. Schedule edits/archive retain immutable occurrence snapshots and history. Explicit manual work/reconciliation is independent of the recurrence's pause state.

## Live acceptance evidence

No browser/frontend action queued or advanced the scheduled occurrence. A dedicated temporary acceptance account saved a maintenance-only independent ARDOT state-source schedule associated with Pulaski County. The existing verified method required no source collection/research; the shared planner produced zero external tasks. This tests scheduling/execution/audit, not live collection completeness. No provider calls, paid inference, imports or canonical lead changes were initiated.

| Origin | Trigger | Outcome | Completed audit steps | Worker audit span |
| --- | --- | --- | --- | --- |
| scheduled | `7e58c64a-88c9-4990-8a37-9f7bca057c50` | completed | 3 | 2633 ms |
| manual | `dc933262-6a6f-4c3e-a24f-a713c0f80f15` | completed | 3 | 2725 ms |

- The natural due instant was `2026-10-19T02:36:00.000Z`; Cron/pg_net queued and executed it. Each step's actual-usage projection reported AI not used, zero input/output tokens and zero USD; provider credits remain absent rather than invented.
- Two concurrent duplicate ticks produced no extra occurrence. Render recorded a real `server_restarted` event at `2026-10-19T02:36:12.333843Z` (event `evt-dbao470m7kps739k8iug`). Genuine manual work was then persisted through the shared Run now service without an HTTP worker kick; a later Cron tick recovered it while the schedule was paused and had no next due time. This verifies pending-only wake and restart persistence without browser polling.
- Pause preceded the next due instant, `2026-10-19T02:38:00.000Z`. Observation continued at least 75 seconds beyond that instant with exactly one scheduled occurrence, no automatic send and no paid usage. Manual Run now preserved the paused recurrence.
- Cron executions succeeded, HTTP 202 outcomes were persisted, and restart/duplicate checks retained the same saved scheduled occurrence. Final needs_wake=false and dispatch=idle verified no artificial keepalive.
- Both test schedules are archived and both temporary accounts soft-deleted to retain audit foreign keys. The genuine saved ARDOT/Pulaski source association remains unscheduled; no fake source/method was inserted. All 260 original pending jobs were compared with the preflight snapshot and remained unchanged. Other schedules and environment values were preserved.

One initial acceptance attempt completed the scheduled run but the harness incorrectly expected a JSON restart response. Its fixture was cleaned up and dispatch paused; the harness was corrected and the complete acceptance sequence above passed. Its evidence remains retained. Render restart events are the lifecycle evidence; the configuration deploy's finished time is not treated as a restart timestamp.

## Bounds, measurements and recovery semantics

Each tick reads at most five due schedules. The existing serialized worker uses a 120-second kick budget and ten-minute leases; adapter/provider calls retain their existing individual bounds. HTTP timeout is 90 seconds; a missing wake response becomes outcome_unknown after three minutes, with a one-minute send cooldown. Tick scheduling checks occur once per minute. These configured ceilings are not worst-case latency guarantees.

An explicit warm-service idle tick probe completed in 349 ms (HTTP 202, zero queued work). pg_net response timestamps are retained as transport evidence; their transaction timestamps are not treated as end-to-end latency measurements. The successful run's first completed step took 1055 ms. Worker audit spans are listed above; the isolated HTTP wake plus shared planning stage measured 113 ms. No cold-start performance guarantee is claimed.

Atomic schedule/occurrence keys prevent response-loss duplicates. Outages coalesce to one latest due occurrence with missed-range evidence; overlapping active/unknown prior work is skipped. Existing billing/capture unknowns still require reconciliation. Rolling windows resolve from each occurrence's America/Chicago date. Latest matching source/category/capability/parser/window observation metadata is retained alongside the occurrence, while existing any-historical-fingerprint comparison and reviewed-import guards remain unchanged.

## Verification and retained records

`npm run check` passed: lint, 21 app tests, 257 workflow tests, SQL preservation/replay/rollback gates and production build. `npm run test:access` passed against isolated PostgreSQL 15/PostgREST, including private scheduling access and browser-independent HTTP/worker/audit/replay/pause. Live API privacy/auth, natural Cron execution, pending-only recovery, restart, duplicate wake, pause, cleanup and final idle checks passed.

Sanitized live acceptance, lifecycle, timing and environment-preservation receipts are private under `outputs/deployment/admin-scheduling/activation/` and ignored by Git. No credential values are present in the committed record. The completed plan is [02 durable schedules](../specs/done/02-admin-county-trigger-scheduling.md); next is [03 Admin UI](../specs/todo/03-admin-county-trigger-ui.md).
