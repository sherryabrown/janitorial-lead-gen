# Admin trigger execution API

Local code contract, October 13, 2026. Part 01 only: no Admin screen or scheduler is released here. The forward migration is prepared and tested locally; this document does not claim production deployment.

All endpoints use the existing Supabase bearer authentication and exact allowed origins. Every signed-in user can manage triggers; no extra Admin role is introduced. Tables, audit records, research checkpoints, usage reservations and submission/control RPCs remain server-only. Existing standalone geography/SAM/lead APIs keep their behavior.

## Routes

| Method/path | Purpose |
| --- | --- |
| GET `/v1/counties` | Active county IDs/names, no map geometry. |
| GET `/v1/state-triggers` | Independently managed saved state-source targets and related counties/latest run. Scheduling is unavailable in this part. |
| POST `/v1/triggers/preview` | Read-only resolved county/city scope, current revision hash and planned routes. No external fetch or AI call. |
| POST `/v1/triggers` | Confirm preview and submit immutable run with `Idempotency-Key`. Returns 202 and `trigger_id`. |
| GET `/v1/triggers?offset=0&limit=50` | Recent runs; maximum limit 100. |
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

For an independent state-source run, use `target_kind:"state_source"`, the saved `/v1/state-triggers` item's ID as `state_trigger_id`, its single category and associated county IDs. The backend uses the saved source identity and one state route; the work-location scope remains those counties, not statewide geographic certainty. Each run uses current methods from the shared source planner. Source-target scheduling belongs to part 02.

## Execution and review

The existing request builder creates frozen child scopes in one submission transaction. County child requests contain all selected cities and the county, with no recurring state collection target. First-time county/category/revision research gets a separate state-research child. Later county run UUIDs reuse its durable checkpoint. Partial research stays available through its original request/trigger; it does not create another research child.

Registered state category sources are associated to one stable source/category target shared by related counties. Finding a source does not establish a verified method or actual county work coverage. Missing methods/official seeds remain reviewable gaps. Independent state runs provide saved result references for county review; current location/date/evidence checks still govern interpretation and import. No source fetch is started merely by reading those references.

Maintain sources delegates missing/expired methods to existing bounded official-link research, retaining packet-bound human review before method activation. Maintain-only requests do not collect verified category pages. Check updates delegates verified source captures, comparisons, extraction/cache/optional AI and staging to the existing workflow. Admin does not automatically invoke the hosted authenticated browser, so deferred Bonfire access remains a handoff. Supported public/API adapters retain their existing limits and behavior.

Use existing child request packet/interpret/discovery review and exact import endpoints in [PROCUREMENT-BACKEND.md](PROCUREMENT-BACKEND.md). Reviewed import remains explicit; canonical sales fields, schema checks, rehearsal, unknown-commit reconciliation and readback are preserved. Request mutations wake the related parent summary without resuming a cancelled parent. Parent `needs_review` is separate from verified import or complete county coverage.

Worker traffic runs bounded stages as before; it also reconciles parent runs. This part has no browser-independent recurring wake, schedule CRUD or always-on execution guarantee. Those are part 02 requirements.

## Audit and billing

Audit starts commit before a shared phase executes. A failed start prevents a new send. Attempts record job/task/source/county where available, actor, trigger origin and user/worker execution, phase, times, safe counts/outcome and diagnostic UUID. Retried leased jobs mark earlier unfinished job attempts interrupted; existing capture/billing guards prevent blind external retries. Failed audit completion yields an uncertain action response rather than an early success acknowledgment.

The original usage ledger remains authoritative. Admin children share one $1/four-call/32k-input/8k-output envelope, plus the configured monthly cap. Reservations require an active matching step and are serialized across children in PostgreSQL. No AI provider/model/budget is enabled or increased by this build.

Step/trigger usage shows `ai` as `not_used`, `used` or `unknown`; actual input/output tokens; known actual USD; held reservation separately; nullable actual cost when billing is unknown. Unbilled quota rejection is not fabricated token usage; fallback attempts remain separate calls. Provider credits/unit are present only when every actual billed entry reports a valid consistent unit; current providers normally leave these null. the UI must label USD cost and never invent Codex credits. Legacy request status behavior is unchanged; Admin child status uses actual-only projections.

## Local verification

The Admin tests use the real baseline/migration chain in offline PGlite and the shared planner. The real isolated PostgreSQL/PostgREST gate also verifies private access denial, atomic replay and concurrent shared AI reservations. No production/provider action is needed for these gates. Apply the forward migration and deploy the reviewed backend separately when authorized; parts 02/03 depend on this API.
