# Phase 4 — Stats and analytics

Integration note: use the [completed Phase 3 detail revision](../done/03-admin-redesign-detail-revision.md) for focused details, tabs and row actions. Do not restore a separate latest-run panel or extra row-menu shortcuts when adding analytics.

Status: planned. Parent: [metric definitions and decisions](admin-workspace-redesign.md).
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
