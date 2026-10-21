# Phase 4 analytics implementation

Scope: Stats, compact schedule Overview totals, and verified reporting metadata. Collection, scheduling, automatic/manual import authority, protected notes/stages, budgets and provider access remain unchanged. No release or shared database writes were performed.

## Data audit and compatibility

Reviewed the existing schedule/history reporting, verified import manifests/readback receipts, county/SAM automatic checkpoints, source-attention classification, step timestamps and usage ledger. The retained shared schema snapshot at `outputs/procurement-research/planetbids-return/schema.json` and migrations through `20261020000400_schedule_work_and_state_groups.sql` already contain all required tables and JSON checkpoint fields. No migration, new table, analytics store or external service is required.

Imports now retain `checkpoint.reporting_records = {version: 1, records: [...]}` **only after verified readback**, on ordinary success and explicit reconciliation. Records contain canonical lead ID, as-imported classification, outcome and intake IDs. Both paths use the same manifest-derived helper. Import SQL, its native rehearsal and validation, sales-field protection and reconciliation authority are unchanged. Historical jobs are never replayed or backfilled from current Leads payloads.

## Reporting contract

Authenticated read-only `GET /v1/admin/analytics` accepts schedule, run, type (`target` on the existing API), geography, origin, lifecycle outcome, category, CT dates, sort/direction, limit/offset, as_of and snapshot. All-time reporting requires a schedule. The default is seven Chicago calendar days, including today, bounded by as_of. Schedule Overview uses all-time **available** history.

| Metric | Meaning / limits |
| --- | --- |
| Distinct leads and outcome totals | Verified canonical IDs, deduplicated across requests, receipts, grouped state members and repeated runs. Per run and period precedence: new, updated, unchanged. Period outcomes are not sums of run-event counts. |
| Run events | Distinct lead/outcome observations per parent run, then summed across runs. A later update counts as an event even if that lead was new earlier in the period. No separate additive duplicate count. |
| Categories | As imported. Historical opportunities remain Opportunities and also have a separate subtype subtotal. Category transitions may overlap, so category columns are not additive partitions. Intent-to-award and other unclassified types do not become executed awards. |
| Missing history | Unknown total plus known subtotal; identity coverage and available first/last run timestamps are explicit. Old county identity records can establish lead outcomes but not past categories. Old aggregate-only SAM receipts cannot establish period-unique lead IDs. |
| Candidates needing attention / validation failures | Distinct unresolved intake IDs with recognized evidence/identity/validation blockers. Validation failures are a subset, not an additional total. Resolved/ignored/processed intake and irrelevant/out-of-scope/expired exclusions are omitted. Unsupported historical dispositions remain unknown. SAM zero-write validation retains its saved exceptions. |
| Sources / unmapped gaps | Source IDs counted distinctly; missing-source routes deduplicated by saved geography/category. Counts describe saved checks in the reporting period, not a promise of complete geographical coverage. Existing source-attention rules and run presentation are reused; View run opens the existing blocker/evidence/next-action workflow. |
| AI | One count per ledger ID, attributed by ledger event date, including events from older runs. Type/schedule/geography/category filters select matching runs; category does not allocate a fraction of a multi-category run's cost. Actual spend, known subtotal and held reservations are separate. Mixed/unreported credit units remain unknown/not comparable; no provider inference is added. |
| Duration | Average/median only over completed/cancelled runs with trustworthy created/finished boundaries; sample/excluded counts shown. Recorded activity unions completed step intervals and is separately labeled. Missing finish timestamps never use updated_at. |

Period queries read the requested run-creation interval and ledger-event interval, not full historical job bodies. Only compact checkpoint projections are loaded server-side; no private artifacts, raw evidence, candidate titles, arbitrary error text or lead identities are returned to the browser. Full filtered aggregates precede stable page sorting. A pinned as_of excludes newly created runs/events; a report fingerprint detects changed results while paging and requires refresh. This is optimistic read consistency, not a historical database snapshot.

Safety bounds: fewer than 2,000 period runs (or schedule all-time runs), fewer than 10,000 rows per related data set, and at most 367 inclusive calendar dates per custom period. Oversized selections fail explicitly with a narrow-period/scope action; **no truncated aggregates are displayed**. Large all-time selections may require a future SQL aggregate extension. A narrow period continues to work when older history exceeds the all-time bound.

Release verification on 2026-10-21 found 31,201 saved step logs across 39 runs. The timing-only bound now follows History's existing fallback: an indexed count preflight avoids downloading oversized intervals; recorded activity becomes explicitly unknown with a View run logs action. Lead, source, usage and trustworthy created-to-finished metrics remain available. A concurrent count/read expansion also falls back safely; truncated intervals are never used as timing. Native regression fixtures cover this case.

## UI and preservation

Stats uses existing Settings navigation, filter controls, InfoTooltip, structured metric rows and responsive history table styling. Filters are owner scoped and cleared at sign-out; stale reads abort. Run drilldown preserves mounted filters, sort, page, scroll/focus and browser Back; filters survive reload. Schedule Overview adds compact all-time totals without moving its tabs, replacing the run list or adding another latest-run panel. Schedule list usage stays last-run based.

## Verification

- Automated: CT default and spring/fall DST; distinct IDs/precedence/grouped parents/repeated receipts; category transitions/legacy unknowns; attention/route deduplication; mixed credits/unknown cost/held reservations/no AI; safe manifest projection; authentication and bounded HTTP errors; full totals beyond the current page; changed snapshots; event-date spend from older runs; large older histories; owner-scoped filters, aborts, paging/refresh and all-time scope.
- Native PostgreSQL 15 + PostgREST: actual county and SAM manual/scheduled imports and protected sales fields; positive success and reconciliation metadata equality without replay; private tables/JWT/RPC guards; reporting JSON projections; 31-run full aggregation/paging; historical spend; explicit oversized all-time rejection with period reporting still available.
- Browser fixture acceptance: 1440/390/320px, actual screenshots inspected; keyboard filters, sorting, paging, run drill/back/reload, detail tabs, zero overflow within Stats controls and zero workflow mutations. Evidence: ignored `outputs/deployment/admin-ui/analytics-*.png` and `analytics-summary.json`.

Final command results and plan completion are recorded in the Phase 4 plan after acceptance finishes. Preview/live release remains a separate authorized step. Netlify production is unchanged.

Proposed commit: `feat: add verified admin analytics`.
