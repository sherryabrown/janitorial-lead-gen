# 01 — County trigger execution and step audit

Parent requirements/prompt: [Admin county triggers](../todo/admin-county-triggers.md). Read that document before implementing. This part establishes the API contract used by scheduling and UI; preserve existing single-request API behavior.

## Model and API

Add forward migrations and shared server module scripts/lib/county-triggers.mjs. Use existing procurement_geographies county FIPS IDs and source/task/job/request records. Proposed private tables:
- procurement_triggers: id, target_kind (county_scope/state_source), source identity when applicable, immutable configuration snapshot, manual/scheduled origin, initiator, schedule/occurrence references, state, created/started/finished times, shared usage budget group, submission key/hash.
- procurement_county_state_research: county/category/scope revision, durable first-research status/evidence/checkpoint. Completed checkpoints prevent ordinary county runs repeating state research; partial/failed states remain resumable.
- procurement_state_trigger_associations: one durable independently managed state-source trigger per source/category/method scope, related county IDs and evidence-backed relevance; uniqueness/CAS prevents duplicate triggers under concurrent county onboarding.
- procurement_trigger_requests: parent/child request links with county ID and frozen confirmed city IDs, selection token/dataset hash, category/windows, unique trigger/county membership.
- procurement_workflow_steps: id, trigger/request/job/task/source/county references as applicable, phase, logical attempt key, outcome, started/finished timestamps, sanitized summary/result counts, evidence/diagnostic references, AI disposition (not_used/used/unknown), reason (deterministic/cache/manual/provider), actor/automated origin.
Use immutable start/completion events or CAS transitions with durable attempt identity; retries append attempts, never overwrite the fact of a sent inference. No raw payloads, credentials, SQL or private browser state in public summaries.

Service-authorized writes; RLS denies anonymous/direct browser writes. Read through authenticated sanitized HTTP projections. All signed-in users may manage Admin triggers under the confirmed no-additional-restrictions policy. Do not introduce an admin role gate or alter existing shared lead access policies. Keep actor attribution and anonymous denial.

Proposed routes: GET /v1/counties (id/name plus current municipality selection revision, no geometry); POST /v1/triggers/preview (resolve sorted unique county IDs, confirmed scope/city IDs, planned coverage/actions and hash); POST /v1/triggers (Idempotency-Key and preview-bound config); GET /v1/triggers (paged recent saved runs); GET /v1/triggers/:id; GET /v1/triggers/:id/steps (stable cursor paging); POST cancel/resume. Existing request/task/import routes serve detailed review, interpretation and exact approval; expose child identifiers in parent results. Limits/body validation and additive CORS method changes must be explicit.

Preview is read-only; no discovery/model call. Parent submission atomically persists exact config, child intentions and first coordinator job. Use sorted county IDs for request hashing. Same key/same input returns same run; changed input rejected. Child submission failures reconcile saved identities before retry; never duplicate a committed child after a lost response. Snapshot county city selection and relative dates; do not infer that a map county is a work site.

## Automatic workflow

One durable coordinator progresses selected counties in bounded stages:
1. Resolve source registry and current capability/coverage for county plus all incorporated cities by default. Return/display city names grouped by county; freeze confirmed IDs/revision. State routes are onboarding research only, not collection jobs implicitly repeated by county runs. Reuse provider accounts without conflating agency tenants.
2. With Maintain sources selected: reuse existing verified methods; revalidate expired/changed methods; route missing-source vs missing-method gaps to bounded official discovery. Resolve trusted seeds from saved official identities/verified seed registry. If none exists, persist Needs official source evidence; do not invent a URL or require the operator to classify new/known.
3. Keep saved public research packets awaiting evidence-backed review before registering/activating new methods. Resume through existing discovery review/rehearsal/guarded persistence, then collect newly activated methods.
4. With Check for lead updates selected: collect current verified methods for selected categories, use existing change probes/cache and verified interpretation/staging. Existing leads, newly identified candidates, changed evidence and unchanged matches remain separate counts. Link actual requested scope through existing reviewed services; no automatic canonical import.
5. Present partial/blocked per-source coverage without blocking other counties. Stop new sends on cancel or exhausted shared budgets; preserve committed evidence and unknown outcomes. Deferred Bonfire routes remain explicit gaps.

For new county scopes, research relevant state sources using existing shared registry/evidence first. Persist a resumable county/category onboarding checkpoint. A new request UUID must not reopen completed state research. Once found, create/reuse an independently manageable state-source trigger and persist county associations; a new saved source trigger has no enabled recurrence until explicitly configured. It can run manually through the same coordinator. Subsequent county runs must not enqueue state updates, even across separate triggers/days. Independent state-source runs capture once per applicable source/category/method/query scope, and their saved observations become evidence for related county reviews after fresh location/date checks. Expired/missing state evidence appears as a source-trigger action/freshness gap, not an automatic duplicate county fetch. Method revalidation for that source is owned by its source trigger. Preserve child coverage/evidence links; a state listing alone does not prove county coverage. Do not remove state routing from existing standalone CLI/API calls; add explicit Admin execution policy. Follow existing serialized heavy-stage/lease contract; no parallel browser/native-rehearsal explosion.

## Step and AI accounting

Wrap current execution phases with persisted start/completion records: resolve, reuse/revalidate/research, fetch page/doc, compare, extract/cache/AI interpretation, stage, review/prepare/test/import/readback, failure/cancel/recovery. Logging must survive restart and identify partial writes; a failed audit write before an external send blocks that send.

Extend usage ledger additively with step_id and trigger budget group; current callers without them keep existing behavior. Supply request/task/job/step identity into boundedInterpretation and its reservation RPC. Preserve ledger as the authoritative billing source, not another copy of token sums. Aggregate known actual provider tokens separately from reservation estimates. Input/output reservation fields must not appear as actual consumption on missing usage. Distinguish not_sent, quota rejection, completed and outcome_unknown. A provider fallback is a separate attempt/call on the same step; counts/usage reconcile without double counting. For deterministic/cache/manual steps show AI: No, tokens 0, cost $0; for uncertain sends show AI: Unknown, tokens/cost Unknown and held reservation. Store actual provider credits only if returned, with unit/source, nullable otherwise. UI labels Cost ($) when only dollars are known.

Trigger-level reservation is serialized across all children with existing monthly reservation handling. Keep configured caps; no new model/search provider or automatic AI enablement. Validate budgets before each external inference and log why AI was skipped. A trigger spanning 75 counties must not become 75 independent $1 allowances.

## Tests and completion

Offline service/HTTP/SQL tests: duplicate/changed keys; partial child submission/lost response; map ID validation; invalid preview revision; city scope; registered/new/expired/missing seed classification; no model call for preview; first-county state research; later request UUID does not repeat state work; concurrent counties create one state trigger; new county reuses existing state registry; failed onboarding resumes; county reruns perform zero state update calls; independent state run feeds multiple county reviews with truthful coverage; cancelled/blocked other counties; per-step no-AI/cached/fallback/unknown billing; matching totals from ledger; concurrent child budget reservations; privacy boundaries. Keep existing reviewed import/replay/protected-field regressions.

Run npm run check and real isolated access gate for new tables/RPC and authenticated management boundaries. Extend sanitized status tests to all new projections. Docs describe local contracts without claiming deployment. Done when manual multi-county execution and resumable review are real shared-service paths, logs match saved work and the API contract is tested. No scheduler or frontend release in this part.


## Completion — October 13, 2026

Implemented locally and verified. Shared request/planner/discovery/collection/interpretation/import services are reused. All-city county snapshots, durable first-state-research checkpoints, independent state targets, private step audit and shared parent AI budgets are implemented. Missing official methods/seeds remain truthful handoffs, not successful coverage.

`npm run check` passed (21 app tests, 244 workflow tests, both SQL suites, lint/typecheck/build). Final ten Admin regressions and lint passed after narrow coordinator/audit hardening. Real isolated PostgreSQL/PostgREST access, atomic replay and concurrent budget/unknown-resume tests passed; no production contacted. Whitespace and changed-document links passed. Twenty-two paths changed including this completion record and sibling-plan pointers. No whole-file deletion, dependency addition, live migration, deployment or commit.

[Build report](../../docs/reviews/2026-10-13-admin-trigger-execution-build.md). [API contract](../../docs/ADMIN-TRIGGERS.md). Production rollout requires applying the prepared forward migration before deploying the backend. No scheduling/UI acceptance is claimed; Bonfire/Euna deferred.

Next: `$build-code specs/todo/02-admin-county-trigger-scheduling.md` with the parent requirements.
