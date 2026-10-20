# Admin workspace redesign — parent requirements

Status: planning complete, 2026-10-20. No application implementation, data writes or release authorized by this plan. The user confirmed metric choices D1–D3 below; the six child plans are ready for sequential implementation.

Implementation checkpoint: phase 1 was subsequently authorized with build-code and completed locally. Header/profile/Settings and the retained Admin section shell are verified; phases 2–6 remain planned. See the phase-1 done plan for exact checks and limits. No release or production change.

## Initiating request

User invoked plan-code: “Plan the Admin UI redesign described in my preceding message and attached layout. Create a parent requirements document and numbered, independently buildable child plans in specs/todo/. Do not implement yet.”

Full requirements carried forward:
- Replace top-right email with an accessible profile icon; signed-in email on hover/focus/tap; retain sign-out. Settings icon immediately left opens Admin; remove existing Admin menu entry once replacement works.
- Views: Schedules, Stats/analytics, History/logs, Sources by geography, Related geography.
- Schedule list: schedule name, geography type (state/county), frequency, last run date/time, last run number of leads, next run date/time, AI credits used, AI money spent, status. Quick actions: Run Now, Go to Stats, Go to History/Logs, Show Related Geography (county municipalities; counties/cities using a state source), View Details, Go to Sources.
- Detail: summary, stats (total successfully found leads; forecasts/opportunities/awards; leads needing attention; per-run counts and run duration), history, logs, related geography, sources.
- Use current CSS/components/brand. Attached “Screenshot 2026-10-19 174641.png” is a compact table-layout reference, not a request for cron syntax, its sample data, icons or colors. Replace paragraph-like presentation with concise labels, structured data and contextual help.
- Retain manual county map and separate state/SAM triggers. Add/edit, pause/resume, Run Now, archive with history. Preserve multiple daily times, weekly/monthly recurrence and timezone semantics. Retaining the map to select/deselect counties, triggering something manually should have the same layout as when scheduling something. 
- Define metrics, periods, statuses, geography/source sharing and unknown usage from an audit of stored data. Separate new leads, updates, duplicates, validation failures, sources needing attention.
- Six self-contained implementation phases: navigation; schedules; details/history/logs; analytics; sources/geography; integrated acceptance/release.
- Reuse services; preserve all unrelated behavior, import validation/deduplication, notes/stages, AI settings/budgets, and what you've already learned, Companies and email previews. Bonfire access work separate; Netlify production unchanged. Identify unresolved decisions before final implementation.

## Build sequence and boundaries

| Phase | Build plan | Depends on |
| --- | --- | --- |
| 1 | [Navigation and Settings shell — completed locally](../done/01-admin-redesign-navigation.md) | Parent; no other child |
| 2 | [Schedules and management](02-admin-redesign-schedules.md) | 1 |
| 3 | [Details, history and logs](03-admin-redesign-details-history.md) | 1–2 |
| 4 | [Stats and analytics](04-admin-redesign-analytics.md) | 2–3 reporting contracts |
| 5 | [Sources and related geography](05-admin-redesign-sources-geography.md) | 1–3; 4 optional for statistics links |
| 6 | [Acceptance and release](06-admin-redesign-acceptance-release.md) | 1–5 |

Each child is one build-code unit with its own backend/UI/tests and acceptance. Earlier phases keep existing working controls accessible; a future view must not show fabricated data or a dead quick action. Phase 2 can link Stats/Sources/Geography to useful existing scoped detail sections until their final views ship. Phase 3 installs the complete context framework; phases 4–5 replace those scoped sections without losing navigation. Do not move parent to done until all children and acceptance pass. Do not move the unrelated Saline continuation plan or claim its external blockers resolved.

## Current implementation audit

Repository baseline: d218166; source code audit only, not confirmation that this commit/migrations are deployed.

| Area | Current implementation | Reuse / missing work |
| --- | --- | --- |
| Header/navigation | src/app/AppShell.tsx: signed-in-label, separate Sign out, Admin summary-pill, lazy AdminScreen; contract filters and Companies live in same shell | Reuse auth/session, lucide-react, lazy boundary, existing back-to-Leads behavior. No router library currently required. |
| Admin state/forms | AdminScreen.tsx, CountySelector, TriggerForm, ScheduleFields, SamSection, model/types, admin.css | Owner-keyed sessionStorage drafts, scope preview/confirmation, registry recovery and generation guards already exist; preserve them. Avoid second schedule engine/editor. |
| Schedule API | procurement-schedules.mjs; workflow-http.mjs /v1/schedules preview/list/get/save/update/pause/resume/archive/run-now/occurrences/events | Existing writes use version checks, idempotency, active actors and preview hashes. List lacks requested last-run metrics/filter/sort projections. |
| Recurrence | schedule-recurrence.mjs; 20261013000200_procurement_schedules.sql and subsequent migrations | America/Chicago only; daily 1–24 distinct times; weekly multiple weekdays at one time; monthly one date/time, 29–31 clamp to last day. DST gap advances, fold chooses first instant. No new timezone/cron engine. |
| Scheduling execution | Existing private scheduler tick + RPC enqueue, occurrence, trigger/child requests, leases/worker | Previous active/uncertain run yields skipped occurrence; missed interval is coalesced by existing policy. Pause/archive can prevent subsequent scheduled work. Preserve these semantics and explain them at affected controls. |
| Runs/history | county-triggers.mjs list/status/steps; ScheduleHistory, RunDetail, RequestReview | Occurrence queued/skipped/blocked is NOT run outcome. Read versioned schedule snapshots/config, trigger origin/IDs, steps and schedule events separately. Existing pagination is offset for history and sequence cursor for steps. |
| Import outcomes | countyImportStatus; hosted-import-jobs county_records; hosted-sam automaticStatus; verified batch receipts; intake/lead/request links | New/update/unchanged available with verified receipts. candidate_count is intake count, not successfully imported lead count. Need shared batch reporting projection and reliable distinct/category attribution. |
| AI | procurement_usage_ledger; workflow-audit usageSummary; workflow_steps | Provider tokens/cost, known subtotal and reservations already modeled. Credits only if all relevant provider rows report same unit. Do not convert tokens/USD to invented credits. |
| Source/geography | geography-routing/service, sourceInventory, known-source-execution capability validation; state trigger associations | Reuse GIS counties/municipalities and many-to-many place/counties. Shared coverage and associations differ from actual work-site evidence. No general paginated Admin source/geography browse API today; request source options are not a substitute. |
| Styling/testing | src/styles.css tokens, admin.css, shared controls/InfoTooltip; Admin*.test, IntegrationRemediation, SamSection tests, tests/integration/admin-ui-browser.mjs, native access tests | Extend existing patterns; no framework replacement or unrelated Leads layout cleanup. |

### Reporting gaps and smallest extensions

1. Add a shared server reporting module over existing tables/checkpoints/receipts, called by schedule list, detail and analytics. No browser service-role credentials, separate analytics service, warehouse, new cron or whole-history browser fetch.
2. Batch schedule-page last run/usage/results; add validated server filters/sorts and stable tie-break ID. Aggregates apply to full filtered scope, not just visible rows. Retain legacy API response fields and pagination compatibility.
3. Verified receipt counts can establish totals but do not always preserve category or per-lead historical attribution. County records retain IDs/flags; SAM often has aggregate counts. Inspect immutable saved import packages/manifests through existing server artifact access when needed; do not infer old category from today's mutable lead. If trustworthy reconstruction is unavailable, label historical breakdown incomplete.
4. For future reliable breakdowns, extend the existing verified import receipt/checkpoint at both automatic import success AND reconcile paths with reporting version, lead ID, observed category, outcome and originating request/job. Add only safe reporting metadata after readback; no import decisions, validation, queue semantics or user-field writes change. Read paths must not replay imports. A new durable table is unnecessary unless existing bounded receipt projections demonstrably cannot satisfy query needs; document evidence before proposing one.
5. Trigger started_at/finished_at exist, but current checkpoint function sets finished_at only for completed/cancelled; finished source-attention runs may have null. Show exact elapsed duration only with reliable timestamps; active elapsed is explicitly live. Compute “recorded activity duration” from union of valid completed step intervals (avoid nested/parallel double count), separately labeled. Missing historical completion is Unknown. Do not silently alter run lifecycle merely to populate a column; any additive future timing instrumentation must be scoped and tested.
6. Source-attention is a presentation derived from jobs/tasks/usage; reuse county-source-attention.mjs, not raw needs_review strings or all task rows. Distinct sources, source-category routes and candidate blockers are separate counts.
7. Diagnostic IDs and sanitized blockers exist; arbitrary server stack traces/private artifacts are not a public logs API. No unrestricted log-file browser.

## Information architecture and interactions

Settings opens Admin on Schedules by default; preserve last view/context on return during the session. The workspace has five clearly named views. “Run now” at workspace level opens existing manual county/state/SAM controls in a compact task surface, distinct from row Run Now (uses that saved schedule). “Add schedule” opens the reused scoped editor. Keep forms, county-map preview and existing evidence/import actions available while replacing the long page.

Schedule detail uses summary + section navigation: Overview/Stats, History, Logs, Related geography, Sources. Sections load independently; one failure must not blank unrelated data. Schedule name opens detail; row Run Now is immediately visible, other quick actions in one accessible overflow menu. Editing and pause/resume/archive are available there and in details. No seven equal-weight buttons per row.

Use a semantic desktop table with all requested fields, short headers and contextual scope labels. Group last-run timestamp/outcome and new/update counts sensibly; usage columns are explicit. Narrow layouts use readable labeled rows or a contained table region with a pinned identifying field, not a clipped whole document. At 320/390px no required action depends on hover, no data silently disappears, no page-wide overflow. Do not copy raw cron strings from attachment. Status has text/icon, never color alone.

Keep contextual state (view, schedule/run/source/geography IDs, section, filters, sort, page/cursor, scroll return target, draft) in a small typed Admin navigation model; use existing shell state and History API if needed for reload/back/forward, without a new routing dependency. Parse/validate URL inputs. Session storage remains owner-scoped; sign-out clears prior-user UI state. Pending requests abort on context change; stale results cannot overwrite a new selection. Returning restores results rather than rerunning a trigger. Mutations preserve preview hashes, versions, acknowledgments and retry idempotency.

## Metric dictionary and aggregation contract

All values carry completeness: known, partial, unknown, or not_applicable, with a concise reason and as_of. Zero requires complete evidence. Pending/running values are provisional. Receipt verification takes precedence over attempted writes. Unknown results are never counted as success.

| Metric | Definition |
| --- | --- |
| Last run | Latest trigger actually linked to schedule, manual or scheduled origin, ordered created_at then ID; never silently use last successful run. Show separate current progress/last occurrence skipped or blocked so they do not conceal an earlier real run. |
| Last run leads | D1 confirmed: distinct newly added canonical lead IDs from verified receipts; separately show updated existing leads. Candidates are separate. |
| Successfully found/processed | Distinct verified canonical leads handled within the scope; partition new, updated, unchanged per run, with new winning over updated then unchanged if multiple verified batches touch same ID. Caption this as “Validated leads”; “New leads” remains distinct. |
| Category counts | Forecast/opportunity/award as observed at verified import, not current lead classification. Historical opportunities grouped under Opportunities with subtype retained in drilldown. Unknown classification disclosed; category totals must reconcile to known distinct validated leads. Cross-period category changes must not be presented as mutually exclusive unique all-time people/leads. |
| Updated / unchanged | Verified pre-existing canonical payload changed / unchanged; a repeat observation with no write is not another new lead. Do not add unchanged and duplicate counts as if disjoint. |
| Duplicates | Only positively identified duplicate observations/identities from existing dedupe decisions. Otherwise show “Existing unchanged,” not a fabricated duplicate count. Raw records minus imports is not duplicates. |
| Leads needing attention | Distinct saved intake candidates with current unresolved validation/evidence/identity blockers. Use “Candidates needing attention” to avoid implying they are already Leads. Validation failures are reasons/subsets, not an extra additive total. Irrelevant/elapsed exclusions are not automatically actionable. |
| Sources needing attention | Distinct affected source IDs, with unmapped missing-source geography/category routes separately counted as gaps. Use existing safe blocker and next action, preserve Finished — some sources need attention. |
| Total over period | Distinct validated lead IDs across runs for “Unique validated leads”; new lead creation counted once. Updated counts across runs are events unless explicitly distinct. Show run totals separately; summing per-run distinct counts is not unique period total. |
| Time to run | Queue wait, reliable start-to-finish elapsed, live elapsed and recorded activity duration are different labeled measures. Never sum overlapping/nested steps or replace missing finish with updated_at. |
| AI credits | Provider-reported value + unit only. Missing/mixed units = Unknown/not comparable; no AI used = Not used, not a fabricated provider credit value. |
| AI money spent | Existing actual_usd semantics; show known_actual_usd subtotal if incomplete, reservation/held_usd separately. Not the model's estimate, token count or provider invoice total. |
| Usage attribution | Once per ledger row for a trigger; sum exact scoped step rows only. Never add parent run usage plus its steps. No AI usage counted as zero tokens/$0 where current ledger completeness supports that claim. |
| Period | CT calendar boundaries converted to UTC half-open intervals. Attribute run-result reporting by trigger creation, displayed clearly; step/provider spend by ledger event time, labeled so cross-period differences are understandable. All-time has available-history bounds, never assumed lifetime coverage. |

Use common DTOs for list/detail/analytics: identity/scope, latest actual run, latest occurrence, execution status, lead outcomes + completeness, usage, timestamps/duration basis, as_of. Keep IDs available in details/logs rather than dominating every row.

Proposed read contracts (extend existing routes where possible; names finalized with implementation, not a second API):

| Read | Contract |
| --- | --- |
| GET /v1/schedules | Existing items/next_offset plus optional q, target_kind, geography_id, lifecycle, sort/direction; enrich each row with last_run/latest_occurrence and metric completeness. Old requests still work. |
| GET /v1/schedules/:id | Existing editable config/version plus safe reporting summary; history/events continue through existing paginated routes. |
| GET /v1/admin/history | Only if needed for global filtering: include standalone manual runs and schedule-linked runs, and distinguish schedule events/occurrences; stable pagination and explicit event type. |
| GET /v1/admin/stats | Full filtered aggregates + bounded run page; period, target, schedule, geography/category, origin, completeness and as_of. Manual-only runs remain visible under All runs. |
| GET /v1/admin/sources and /v1/admin/geographies/:id/related | Bounded read-only catalog/relationships, with optional schedule/run snapshot scope and current-versus-saved basis. No GET side effects. |

Example metric envelope: `new_leads: {value: null, completeness: 'unknown', reason: 'Historical verified identity unavailable'}`; never serialize missing as zero. IDs/filters are validated server-side and responses must not include credentials, raw config secrets or private artifact locations. Existing authenticated workflowRequest is the sole browser transport. Additive response fields must not break retained callers.

Schedule lifecycle: Active, Paused, Archived; “Blocked” is an orthogonal actionable condition from saved blocker, not an unrequested scheduler state rewrite. Never call an enabled schedule successful merely because next_due_at exists. Run lifecycle retains pending/running/cancelled/completed/unknown and existing source-attention presentation. Occurrences queued/skipped/blocked are explicit event outcomes. Reconcile uncertain writes through existing controls before any retry.

## Geography/source contracts

- Geography type is County for county_scope (one or multiple named counties), State for state_source and statewide SAM, with a separate target badge/label distinguishing SAM from an individual state source. Never collapse all statewide schedules into a county search.
- Related geography is read-only in this redesign: existing incorporated municipality/county links, multi-county memberships and active flags; no invented hierarchy. This does not add municipality-only scheduling or geography editing.
- County schedules include all cities plus county under current scope-confirmation behavior. Existing selection tokens detect changes; new dataset versions do not silently alter saved schedules.
- State-source associations say which counties use an independent source trigger. Derive related cities through known county/place links, label that relationship as derived, not verified agency service coverage. Show actual capability/coverage evidence separately.
- Source geography (agency/coverage/routing) is not bid work location. Deduplicate a shared source in inventory by source ID while retaining each category/route method. No duplicate state updates from browsing a county.
- Missing/unmapped sources remain visible. Catalog pages must not start discovery, collection, registration or new schedules as a read side effect.

## Decisions and preserved defaults

D1 confirmed by user: last-run leads New + separate Updated, not combined.
D2 confirmed by user: schedule-row AI credits/money reflect the last run. Label the basis explicitly; global Stats period does not silently change row meaning.
D3 confirmed by user: global Stats defaults to last 7 CT calendar days, including today (today minus six days at 00:00 CT through tomorrow at 00:00 CT, with current-day data only through as_of). Detail Overview retains all-time available totals, with per-run/period drilldowns.
No unresolved product decision currently blocks phase 1. Implementation must report newly discovered behavior impacts or data limitations before expanding scope; incomplete historical metrics are handled explicitly above.

Already specified/preserved: archive rather than destructive delete; all active signed-in users retain current Admin access (no new role gate); timezone stays America/Chicago; no schedule ownership transfer; same overlap/missed/DST behavior; manual controls remain. No new product decision is needed for those preservation constraints. Source/geography views are read-only because the request asks for views; propose a separate scoped plan if editing becomes desired.

## Acceptance and release rules

Each phase must run meaningful affected tests plus build/lint as appropriate. Final gate: npm run check, npm run test:access, existing browser harness extended across desktop/390/320/keyboard. Native tests use disposable infrastructure, never production fixtures. Test missing data, full pagination, stale requests, version conflicts, acknowledgment loss, concurrent imports, cross-county/shared sources, mixed AI units and incomplete receipts.

Phase 6 requires exact deployed version/schema audit: d218166 includes unrelated unreleased Saline migration/capability work. Do not automatically apply that package, send more outreach, or resume Bonfire as a side effect of Admin rollout. Record which migrations and commits are included and preserve unrelated behavior. Authorized rollout is additive migration/reporting compatibility, Render first, then Netlify draft preview; no Production Netlify publish/unlock. Request release approval only after concrete verification is ready if not already authorized for that release. Preserve production deployment ID/lock before/after and archive disposable acceptance schedules. Keep plans in todo if required data/UI/live acceptance is blocked.
