# Phase 4 — Stats and analytics

Existing Phase 3 contract extension: [editor/work reservations/multiple state sources](../done/03-admin-schedule-editor-and-work-scopes.md), subsequently released at ec18074. Consume grouped state schedule membership and once-per-parent reporting; do not assume every state schedule has only one source. Preserve the approved visual correction and the parent's terminology/default decisions.

Integration note: use the [completed Phase 3 detail revision](../done/03-admin-redesign-detail-revision.md) for focused details, tabs and row actions. Do not restore a separate latest-run panel or extra row-menu shortcuts when adding analytics.

Status: implemented and verified locally, 2026-10-20. Parent: [metric definitions and decisions](../todo/admin-workspace-redesign.md). No release performed.
Initiating instruction: accurate overall/per-schedule/per-run category, lead-outcome, attention, duration and AI reporting from existing data.
Dependency: phases 2–3 reporting projections and navigation. D1–D3 confirmed: new leads/separate updates, last-run row usage, Stats defaults to last 7 days.

## Design/data approach

Reuse shared reporting helper, countyImportStatus, hosted-sam verified receipt counts, batch-verification, immutable manifests/artifact service, usageSummary, county-source-attention. Inspect exact production schema/version before migration planning; no live credentials/artifact bodies reach browser.

1. Add Stats view with reporting period, schedule/target/geography/category filters, concise summary counts and per-run table. Include run origins and as-of/timezone. Default last 7 CT calendar days including today, following the parent's exact bounds; schedule overview exposes all-time available totals with explicit history coverage.
2. Build distinct-ID aggregation across verified results, not sums of page counts. Partition per-run outcomes new > updated > unchanged; distinguish period unique leads versus run events. Category attribution uses as-imported category, includes historical opportunity subtype without losing meaning, and exposes unknown/unclassifiable remainder.
3. Inspect retained import receipt/package data for reliable per-lead IDs/categories. If necessary extend existing checkpoint/receipt only after successful verify/readback and reconcile (county and SAM) with versioned reporting records. Reuse existing job linkage. Test retries/reconciliation produce same reporting records and never duplicate lead metrics. Preserve import SQL, notes, stages, authority, validation and automatic/nonautomatic policy boundaries.
4. Do not silently backfill by executing old imports, reading present payload as past truth, or changing existing candidates. Historical reconstruction is read-only and evidenced; if incomplete, return null/partial totals with known subtotal and coverage range. Additive SQL/index only if measured need; no separate analytics store by default.
5. Define actionable candidate counts using current persisted unresolved/exclusion reason and evidence; do not treat every exclusion as actionable or call all candidates Leads. Keep sources needing attention separate from route gaps/candidate count. Drills show precise blocker and existing next action.
6. AI totals reuse ledger rows once and existing completeness rules. Credits with incompatible units stay separate/not comparable; missing units Unknown. Actual spend and known subtotal/reservations distinct. Cross-run/step totals never double count nested phases. No budget/model/pricing changes.
7. Reliable elapsed run time and recorded activity union are separately labeled; no exact duration fabricated from last updated timestamp. Avg/median only over complete trustworthy samples, with sample size/excluded missing count. Active runs excluded from finished-duration aggregates.
8. Add bounded authenticated reporting API in workflow-http + shared server module, stable filters/sorts/pagination and full filtered aggregates. Global reporting has explicit period bounds; all-time can query aggregate SQL over existing data rather than returning unbounded full bodies. Keep response small, with freshness/completeness and no raw package download.
9. Reuse current CSS structured metric rows/tables and contextual help. Minimal trend chart only if it helps and uses the same audited data; a chart library is not required. No prose dashboards.

## Acceptance/tests

- Seed native fixtures with multiple receipts for same lead, repeated schedule/manual runs, category transition, county/SAM/state targets, multiple routes/shared source, reversed retry order, incomplete readback and unknown writes. Counts reconcile with verified canonical links while notes/stages are untouched.
- Period boundary/DST tests, zero vs unknown, incomplete historical breakdown, mixed credit units, failed AI/held reservation, no-AI run, rows outside current page, simultaneous new results while paging.
- Positive tests for both success and reconcile reporting instrumentation; old checkpoint compatibility and no automatic replay/backfill. Unauthorized callers denied; no sensitive payload/error exposure.
- npm run check; native test:access for changed data paths; desktop/390/320/keyboard Stats filters, sortable run table, readable metric labels and preserved drilldown/back state.
- Document metrics that remain historically unavailable. Block acceptance if UI labels misleadingly claim complete totals; honest explicitly partial historical data is acceptable under parent contract.
- No Netlify production deployment or new provider/service. Phase 6 owns coordinated preview/live release verification.

## Completion and evidence

- Added authenticated bounded analytics, last seven CT calendar days, full filtered totals before sorting/paging, immutable as-imported reporting metadata and explicit partial history. Existing schedules/details, manual/state/SAM execution and import safeguards remain intact. Schedule Overview has all-time available totals; the latest run remains solely in the run list.
- Metadata is written only after verified import success/reconciliation, using the same helper for county and SAM. No migration or analytics store is required. Existing schema/checkpoint fields suffice; no historical import replay or mutable-payload backfill.
- Verified unique lead precedence, separate run events, category transitions/historical subtype, unresolved actionable candidates versus source/route gaps, ledger-date AI usage, mixed credits/held amounts and trustworthy duration samples. Period reports continue working when older history exceeds the explicit all-time read bound.
- `npm run check` passed: lint, 109 React tests, 360 workflow tests, actual import SQL/replay/concurrency/protected-field regressions, typecheck and Vite build. Final focused reporting suite: 12 passed, including the additional SAM zero-write/intent-classification case. Final focused analytics/details UI: 11 passed. Subsequent final lint/build passed. Existing large-chunk warning remains.
- `npm run test:access` passed on disposable PostgreSQL 15/PostgREST, including actual county/SAM success and reconcile metadata equality, manual/scheduled deduplication and protected notes/stages; reporting JSON projections, 31-run paging/full totals, older-run period spend, oversized all-time rejection and narrow-period success. No production data contacted.
- Actual browser fixture acceptance passed at1440/390/320px with keyboard filters/navigation, sort/paging, run drill/back/reload, existing five detail tabs, all-time Overview and zero workflow mutations. Screenshots were inspected. Evidence: ignored `outputs/deployment/admin-ui/analytics-*.png`, `analytics-summary.json`, command logs and the tracked [implementation review](../../docs/reviews/2026-10-20-admin-analytics.md).
- Limits: old aggregate-only imports lack period-unique identities; old county records lack historical categories; unsupported candidate dispositions/credit units/finish timestamps remain unknown. Oversized reports require a narrower period/scope; all-time SQL aggregation is a future scaling extension. Category filters select requesting runs and as-imported lead classes; whole-run AI usage is not fractionally attributed. No open product decision blocks this phase.
- Netlify production remains unchanged. No commit, push, shared migration or deployment was performed. Coordinated release remains a separately authorized step.

Proposed commit: `feat: add verified admin analytics`.
