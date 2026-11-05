# 02 — Secure Supabase scheduling and report reads

Local implementation prepared November 4; see [build review](../../docs/reviews/2026-11-04-scheduling-read-decoupling-build.md). Protected RPCs and consumers, native roles, reducer parity fixtures, canonical merges and blocked-execution browser checks are implemented. Production query-plan/distribution checks and representative historical-cohort comparisons remain release gates. Retained in `todo` until those qualification gates are satisfied.

Part of [Decouple saved scheduling reads from Render](decouple-scheduling-reads-from-render.md). Depends on spec 01; covers phases 3–4 of six.

## Phase 3: Protected saved-data RPCs

### Access model

Reuse `public.procurement_capabilities()` and `profiles.role` as the authority: User and Admin have shared-team schedule access; only Admin has technical/source-management access. Missing profile, missing session and unknown role fail closed. Do not reintroduce membership lists or owner-only restrictions on shared-team reads.

The October 26 migrations intentionally restrict raw procurement tables to Admin. Granting Users raw tables, current full-JSON schedule views, or service-only source-review functions would undo that protection. Keep those grants/policies intact. Create explicit allowlisted JSON RPCs that derive the actor from `auth.uid()`; do not accept a caller-supplied actor, role or `p_private` flag that can enable Admin output.

Where a privileged function is needed to read private tables, use fixed `search_path`, schema-qualified references, static SQL, explicit role checks and validated filters/limits. Revoke default PUBLIC/anon execution and grant only the intended authenticated entrypoints. Internal helpers and finalization/backfill RPCs remain service-only; enabling an authenticated read does not enable writes or private helper calls. Verify effective grants after migrations, including overloads and default privileges.

Return an allowlist, rather than recursively removing a few secret keys. User responses omit checkpoints, evidence, packets, artifacts, usage/cost/provider configuration, diagnostics and source-management actions according to current `businessResponse` and route permissions. Admin technical projections must still exclude credentials/session cookies and raw private bodies. Preserve safe source website labels and first/last-name actor labels without profile emails.

### Saved read contracts

Define explicit RPCs with `procurement_` names for these response groups; use typed filters, UUIDs and enum/range validation. Retain current browser-facing DTOs where possible:

| Suggested RPC group | Existing behavior to preserve |
| --- | --- |
| Schedule page/detail/choices | `scheduleFilters`, name escaping, target/geography/lifecycle/blocker filters, stable ID tie-break, can-delete flags, latest occurrence/run, projected counts |
| History/run choices and schedule activity | `historyFilters`; `schedule='none'`; run-vs-attempt rows; boundary/as_of; queued/skipped/blocked attempts; reasons; linked-run checks |
| Run detail/progress | Trigger identity/config/schedule context; child request mapping; safe persisted progress; lighter active projection; related saved state-source information |
| Schedule audit and occurrences | Existing public reason/ID allowlists, sanitized baseline, actor display-name fallback; never `to_jsonb` an entire private row |
| Geography and saved source setup/status | County/city/state choices and saved source labels/status; User read-only controls; Admin repair links use existing context |
| Saved run logs and embedded status fields | Preserve existing role checks and log cursor/sequence refresh. Move only saved fields rendered by in-scope run/report panels; no new review console or candidate-management API |

Port calculation contracts from `scheduling-presentation.mjs`, `county-source-attention.mjs`, `source-decisions.mjs`, `schedule-activity.mjs`, `admin-run-history.mjs` and the relevant status services. Reuse existing safe SQL helpers internally after auditing their output and privileges; do not grant unsafe helper access wholesale.

Trace GETs reached from saved schedule/run/report screens, including nested components, to remove incidental Render dependencies from those existing views. This is a dependency audit, not authorization to migrate every `requests/*`, `imports/*`, `sam/*` or source-repair endpoint. Independent Admin workflow consoles, their previews, packet/artifact operations and workflow status remain Render-backed. If an embedded component shares both responsibilities, split only its saved-data input from its existing command/workflow path; do not redesign the component or add controls. If preserving an existing passive display is impossible within that boundary, identify the specific change and ask before proceeding. No hidden Render fallback may satisfy an in-scope saved read.

Use persisted trigger/job states for active progress and saved source/task statuses. Pending totals stay partial/unknown; polls cannot trigger finalization or work. Preserve current progressive/backoff polling and stop on hidden/inactive tabs. A sleeping worker can legitimately leave saved progress pending; never infer healthy/completed from a stale timestamp.

## Phase 4: Report and member queries

Replace all-run checkpoint reconstruction with queries over the current persisted run members from spec 01. Use one internal SQL selection/reduction relation for summary metrics and member pages so equality is structural, not two separate implementations. Do not sum per-run distinct counts to obtain cross-run unique leads.

### Semantics to port exactly

- Run creation dates select lead results; custom windows use America/Chicago midnight boundaries, inclusive From and exclusive day-after Through, including DST. All-time is restricted to a specific run or schedule as today. Preserve filter validation, default seven-day period, maximum custom interval and stable sort/null placement.
- Apply schedule/run/target/origin/outcome/geography/category scope at the same stages as `analyticsFilters` and `aggregateAnalytics`. Keep statewide-vs-county meaning and requested-category checks.
- Within the selected per-run category population, resolve current canonical IDs and reduce globally with `added > updated > unchanged`, category union, historical flag, and separate per-run event totals. Category totals may overlap while total distinct leads do not.
- Stored header counts describe identities at publication. After a later merge, displayed current counts and drilldowns must both come from the same canonicalized persisted-member relation, not one from the old header and the other from current IDs. Existing receipts retain original facts; do not add historical result generations or rebuild all job receipts to answer this read.
- Preserve `value`, `known_subtotal`, completeness/reason and `not_applicable`. Missing facts do not become zero, and count-only historical evidence does not become a clickable identity list. Respect the confirmed known-subtotal decision.
- Usage remains live saved-ledger aggregation by **ledger event date**, including matching older runs with events inside the reporting period. It is not divided among categories. Retain reserved/unknown spend handling, quota/not-sent exceptions and Admin-only output. Do not freeze financial totals forever at run finalization.
- Timing remains the union of completed step intervals, distinct from created-to-finished duration, with current state eligibility and independent partial/unknown completeness. The live inventory has 67,796 steps: preserve bounded per-selection fallback rather than hiding lead totals or returning truncated timing. Do not materialize every log entry into a result row.
- Issue counts/drilldowns remain current saved source/task/intake disposition projections. A later repair/ignore/processed status can remove an issue without rewriting historical lead results. Reproduce actionable-validation rules, source/gap deduplication and category uncertainty; do not freeze open issues forever in a completed-run header.
- Preserve current presentation and coverage descriptors. A verified lead count does not imply complete procurement coverage.

### Snapshot consistency and bounded reads

Summary and member requests carry `as_of`, `snapshot`, `identity_snapshot`, and expected count as today. Bind fingerprints to normalized filters, selected run revisions/completeness, canonical mappings, issue disposition and relevant timing/usage data. Each RPC must read its inputs under one consistent statement/transaction snapshot. A concurrent run completion, reopen, merge, repair or ledger change must either match the same population or produce the current explicit refresh/unavailable result. Do not silently mix old totals with new member pages.

Do not treat `as_of` as an invented historical MVCC snapshot: current code bounds creation times but rejects later changes via fingerprints. Preserve that refresh-on-change contract. Arbitrary report snapshot tables and indefinite materialized filter combinations are unnecessary.

Existing identity snapshots use SHA-256 of deterministic, stable JSON. PostgreSQL `jsonb::text` is not byte-for-byte equivalent to `JSON.stringify(stable(...))`. Preserve/test the existing identity-token encoding rather than introducing a new token protocol. Preserve report URLs/filter fields and the existing refresh-on-change behavior; if a compatibility exception proves necessary, document it and ask before switching readers. No new token negotiation or version-management framework is required.

Preserve current hard bounds (fewer than 2,000 period runs and 10,000 rows per existing bounded relation) unless an improvement is separately approved with query-plan evidence. Use indexed filters before relation expansion, bounded member pages (maximum 100), stable ID tie-breaks and statement timeouts. Never compute a total from only a returned page. Surface the current narrow-scope/unavailable message when the safe bound is exceeded.

### Security and parity acceptance

- Native Postgres/PostgREST tests use actual anon, authenticated User/Admin, missing/invalid profile and service roles/JWT claims. Exercise forged IDs/roles/private flags, invalid cursors/filters, excessive limits, hidden helper RPCs and base-table grants.
- Compare RPC responses with golden JavaScript fixtures for every filter, period boundary, outcome/category transition, duplicate lead across jobs/runs, aggregate-only and incomplete history, canonical reconciliation, issue resolution, timing fallback and ledger attribution.
- Force updates between summary/page/member calls; assert deterministic consistency or an explicit refresh result with no truncated/fabricated count.
- Read-only calls cannot mutate jobs, triggers, audit records, result revisions or provider state. Verify this with database snapshots, not just absence of POST requests: Supabase RPC transport uses POST for reads.

Deliverable: additive secured SQL read contracts, generated/maintained TypeScript DTOs, parity/security fixtures and query-plan evidence. Existing Render readers remain available for controlled rollback and operator comparison until spec 03 completes.
