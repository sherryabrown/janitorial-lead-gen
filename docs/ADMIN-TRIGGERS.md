# Admin trigger execution API

Parts 01/02 backend contract, updated October 18, 2026. Admin/scheduling migrations are installed; host rollout is documented in [the deployment record](ADMIN-SCHEDULING-DEPLOYMENT.md). The recurring dispatcher is activated and live-accepted; the Admin screen is implemented locally in part 03, pending release. [UI/release notes](ADMIN-UI.md) identify the accompanying API changes.

All endpoints use the existing Supabase bearer authentication and exact allowed origins. Every signed-in user can manage triggers; no extra Admin role is introduced. Tables, audit records, research checkpoints, usage reservations and submission/control RPCs remain server-only. Existing standalone geography/SAM/lead APIs keep their behavior.

## Routes

| Method/path | Purpose |
| --- | --- |
| GET `/v1/counties` | Active county IDs/names, no map geometry. |
| GET `/v1/state-triggers` | Independently managed saved state-source targets and related counties/latest run. Includes configured schedule/next-due state. |
| POST `/v1/triggers/preview` | Read-only resolved county/city scope, current revision hash and planned routes. No external fetch or AI call. |
| POST `/v1/triggers` | Confirm preview and submit immutable run with `Idempotency-Key`. Returns 202 and `trigger_id`. |
| GET `/v1/triggers?offset=0&limit=50` | Recent runs; maximum limit 100. The part 03 projection adds origin/schedule name, county count, distinct candidate/evidence counts and aggregate actual usage; no config/private artifacts. |
| GET `/v1/triggers/:id` | Frozen scope, child request IDs, related state-source run references, state, usage and controlled next action. |
| GET `/v1/triggers/:id/steps?limit=50&cursor=...` | Monotonic sequence cursor, sanitized step outcomes/times/counts and actual usage. |
| POST `/v1/triggers/:id/cancel` or `/resume` | Durable controls and actor audit; preserves evidence. Unknown outcomes require reconciliation. |

Preview body:

```json
{
  "target_kind": "county_scope",
  "county_ids": ["05001", "05003"],
  "maintain_sources": true,
  "check_updates": true,
  "requested_categories": ["opportunity"],
  "search_windows": {
    "opportunity": {"from": "2026-10-13", "to": "2027-10-13", "date_basis": "deadline"}
  }
}
```

Run submission sends the same inputs plus `preview_hash` and `confirmed_scope:true`. Preview includes all active incorporated city IDs and names grouped by county. A changed municipality selection/revision requires preview again. Same key/input replays the saved run even after a later registry change; changed input under that key is rejected. Unknown submission response must be retried with that same key.

For an independent state-source run, use `target_kind:"state_source"`, the saved `/v1/state-triggers` item's ID as `state_trigger_id`, its single category and associated county IDs. The backend uses the saved source identity and one state route; the work-location scope remains those counties, not statewide geographic certainty. Each run uses current methods from the shared source planner. Source-target schedules use the part 02 API below.

## Execution and review

The existing request builder creates frozen child scopes in one submission transaction. County child requests contain all selected cities and the county, with no recurring state collection target. First-time county/category/revision research gets a separate state-research child. Later county run UUIDs reuse its durable checkpoint. Partial research stays available through its original request/trigger; it does not create another research child.

Registered state category sources are associated to one stable source/category target shared by related counties. Finding a source does not establish a verified method or actual county work coverage. Missing methods/official seeds remain reviewable gaps. Independent state runs provide saved result references for county review; current location/date/evidence checks still govern interpretation and import. No source fetch is started merely by reading those references.

Maintain sources delegates missing/expired methods to existing bounded official-link research, retaining packet-bound human review before method activation. Maintain-only requests do not collect verified category pages. Check updates delegates verified source captures, comparisons, extraction/cache/optional AI and staging to the existing workflow. Admin does not automatically invoke the hosted authenticated browser, so deferred Bonfire access remains a handoff. Supported public/API adapters retain their existing limits and behavior.

Use existing child request packet/interpret/discovery review and exact import endpoints in [PROCUREMENT-BACKEND.md](PROCUREMENT-BACKEND.md). Reviewed import remains explicit; canonical sales fields, schema checks, rehearsal, unknown-commit reconciliation and readback are preserved. Request mutations wake the related parent summary without resuming a cancelled parent. Parent `needs_review` is separate from verified import or complete county coverage.

Worker traffic runs bounded stages as before; it also reconciles parent runs. Part 02 adds durable schedule CRUD and private wake, described below. Production browser-independent scheduling passed part 02 live acceptance; the local part 03 UI does not provide or replace the scheduler wake.

## Audit and billing

Audit starts commit before a shared phase executes. A failed start prevents a new send. Attempts record job/task/source/county where available, actor, trigger origin and user/worker execution, phase, times, safe counts/outcome and diagnostic UUID. Retried leased jobs mark earlier unfinished job attempts interrupted; existing capture/billing guards prevent blind external retries. Failed audit completion yields an uncertain action response rather than an early success acknowledgment.

The original usage ledger remains authoritative. Admin children share one $1/four-call/32k-input/8k-output envelope, plus the configured monthly cap. Reservations require an active matching step and are serialized across children in PostgreSQL. No AI provider/model/budget is enabled or increased by this build.

Step/trigger usage shows `ai` as `not_used`, `used` or `unknown`; actual input/output tokens; known actual USD; held reservation separately; nullable actual cost when billing is unknown. Unbilled quota rejection is not fabricated token usage; fallback attempts remain separate calls. Provider credits/unit are present only when every actual billed entry reports a valid consistent unit; current providers normally leave these null. the UI must label USD cost and never invent Codex credits. Legacy request status behavior is unchanged; Admin child status uses actual-only projections.

## Local verification

The Admin tests use the real baseline/migration chain in offline PGlite and the shared planner. The real isolated PostgreSQL/PostgREST gate also verifies private access denial, atomic replay and concurrent shared AI reservations. No production/provider action is needed for these local gates. The forward migrations/backend are deployed and part 02 passed production scheduling acceptance; part 03 consumes this API.

## Durable scheduling API (part 02)

Schedules reuse trigger preview, coordinator, source adapters, step audits and usage envelopes. Production activation/live acceptance passed October 18; see [deployment record](ADMIN-SCHEDULING-DEPLOYMENT.md). No Admin screen is introduced in this part.

Authenticated routes: GET/POST `/v1/schedules`; POST `/v1/schedules/preview`; GET `/v1/schedules/:id`; GET `/:id/occurrences` and `/:id/events`; POST `/:id/update`, `/:id/pause`, `/:id/resume`, `/:id/archive`, `/:id/run-now`. Create and Run now require `Idempotency-Key`; edits/controls/Run now require `expected_version`. Save requires `confirmed_scope:true` and the schedule `preview_hash`. Lists use offset/limit (maximum 100). GET `/v1/scheduler/status` reports activation/extension/delivery state and whether the backend private key is configured; it exposes no secrets.

Schedule preview/save accepts `name`, boolean `enabled`, the existing trigger `config`, `recurrence` and `window_policy`. Example recurrence: `{"timezone":"America/Chicago","frequency":"daily","local_times":["09:00","16:00"]}`. Weekly uses one local time and unique `weekdays` (Sunday 0–Saturday 6); monthly uses one time and `month_day` (1–31). Dates 29–31 use the last valid day of shorter months. DST gap times run at the first valid minute afterward; repeated times run once at their first instant. `window_policy` maps each requested category to `from_offset_days`, `to_offset_days`, `date_basis`; offsets are bounded -366 through 1096 and resolve from the occurrence's Central local date. The same trigger preview validates windows and shows county/cities. Changed registry scope pauses for a new reviewed preview.

State targets use `target_kind:"state_source"` and the saved `state_trigger_id`. Discovery does not create/enable a recurrence; at most one unarchived schedule exists per saved source/category target. Associated counties share one source occurrence; recurring county collection excludes state sources and reuses initial state-research checkpoints.

Run now uses the saved current scope, produces a manual occurrence even while paused and preserves next due. Reusing its key replays the original occurrence. Edit/pause/archive use CAS; active snapshots and history remain intact. Pause/archive blocks further automatic sends, while explicit manual review/reconciliation and already-sent outcomes remain available. Resume computes the next future time and does not replay paused backlog. Owner deletion/revocation disables automatic execution. Active/unknown prior outcomes skip overlapping occurrences.

The private POST `/internal/procurement-scheduler/tick` accepts an empty JSON object and only the separately configured `x-procurement-scheduler-key`, rejecting browser origins and user JWTs. One server-side dispatcher wakes due schedules and pending shared work, with no browser timer or new collector. Tables and all scheduling RPCs remain server-only.

## SAM target extension — October 19, 2026

The existing preview/submit and schedule services accept a distinct `target_kind: "sam"`, exactly one `requested_categories` entry (`opportunity` or `award`) and `publication_window: {from: "YYYY-MM-DD", to: "YYYY-MM-DD"}`. Preview is read-only; submit requires its reviewed hash and existing idempotency identity. County IDs, state-source IDs and arbitrary upstream filters are rejected. Normalized AR/561720 filters are computed server-side. SAM children have role `sam`, no county ID and no geography coverage task.

Schedules reuse the existing recurrence/table/dispatcher contract, with one category-specific `lookback_days` policy (1–366 inclusive days), resolved in America/Chicago per occurrence. The request date span is bounded to 365 elapsed days for both categories as an application safety limit. Existing direct SAM submission remains available. SAM does not start from county/state-source triggers.

Migration `20261019000100_admin_sam_triggers.sql` wraps existing atomic submission/baseline RPCs, retains non-SAM implementations, and binds SAM run writes to the live leased job/page/attempt. Overlapping unresolved SAM work in the same category blocks new submission rather than concealing an unknown outcome. Reconciliation consumes one matching audited response with compare-and-set state; it does not contact SAM again. The shared audit, pause guards, worker, import approval and AI settings remain authoritative.

Release order: forward migration, private `sam-search` function, matching Render backend, then Netlify draft preview. Check existing rows against the new constraints before migration. The matching release, both real manual categories and one browser-closed scheduled occurrence passed; see [live evidence](ADMIN-SAM-DEPLOYMENT.md).

## Automatic SAM persistence extension

No schedule config/opt-in or schema change is required. The existing SAM worker stages immutable evidence, then internally creates a deterministic automatic import job. Its server-owned policy binds exact audited runs/current intake hashes, factual scope/classification decisions and initiating identity. It uses the original planner, native rehearsal, exact tested package hash, restricted transaction and readback. Public reviewed-import preparation cannot grant automatic authority with a client flag; non-SAM/direct reviewed imports still await approval.

`POST /v1/sam/requests/:id/process` is authenticated and resumes only eligible saved staged SAM results without any fetch or broad workflow restart. It checks cancellation/scheduled runnable state, preserves import identities and wakes the shared worker. It does not resume unrelated failed manual import jobs.

SAM packets retain saved evidence after automatic processing and expose safe `automatic` status, verified write counts, exclusions and continuation availability. SAM parents stay pending through active import work, complete after verified processing and report partial/unknown outcomes separately. Superseded definite manual preparation failures do not keep a successfully auto-processed SAM parent in needs-review; uncertain writes are never ignored.

The automatic SAM extension is released to the existing Render backend, local backend and approved Netlify draft preview. [Live acceptance and recovery evidence](ADMIN-SAM-AUTOMATIC-DEPLOYMENT.md) records actual canonical readback, scheduled execution and cleanup. Netlify production remains unchanged.

## Automatic county discovery — pending preview release

See [the current build checkpoint](reviews/2026-10-19-automatic-county-build.md). County and county state-research discovery use durable `discovery_resolve`, `discovery_capture`, `discovery_verify`, `discovery_save` and `discovery_collect` stages with `county-public-v1` provenance. Existing registry rehearsal/readback and collection/interpretation services are reused; no schema or budget change is required. Request status adds `automatic_county`, `check_updates` and task `source_name`, `location_name`, `discovery_state`, `discovery_action` fields. Old clients may ignore these additive fields. Unknown formats/access/scope conflicts remain blocked; collection does not bypass non-SAM import approval.
