# Schedule results, history and navigation amendment

Follow-up planned 2026-10-23: [05C1](../done/05C1-county-addendum-identity-and-duplicate-repair.md) addresses proven solicitation/addendum identity and the existing Clearwater duplicate, retaining the original lead's notes/stage. [05C2](05C2-schedule-execution-table-and-metric-clarity.md) supersedes Run-ID-first ordering, the separate Overview occurrence table and ambiguous completeness wording. Use one schedule execution table with date/time first, full ID secondary and preserved no-run attempts/snapshots. Metrics use proper verified/recorded labels and numbers, with incomplete coverage in contextual help rather than appended known/unknown text. Keep configuration-change History separate and global History Submit unchanged. 05C1 is complete/released; 05C2 remains planned. Earlier 05A–05C completion below remains historical.

Status: 05A–05C implemented and accepted; 05A/05B released, 05C verified locally. Phase 6 remains pending. This document alone does not authorize release. Parent: [Admin workspace](admin-workspace-redesign.md). Build 05A → 05B → 05C, then Phase 6. These requirements supersede conflicting presentation/read-control requirements in earlier phases; retain all other requirements.

## Initiating prompt

User invoked `$plan-code`: plan Schedules changes using 05A/05B labels; prefer the attached Stats overview; make Schedule Details History track schedule changes; always show complete breadcrumbs; hyperlink lead counts to those Leads; improve schedule totals; collapse setup initially; show Run ID then date/time in run rows and open details from Run ID; head Run Details with ID/date/time, collapse attributes, replace Overview with Issues first, retain Logs, tabulate Sources with county filtering and resolution instructions; start global History/logs empty with today's dates and Submit; remove the analytics Runs list; preserve unrelated functionality.

Reference: `C:/Users/sherr/AppData/Local/Temp/codex-clipboard-ab35786b-35dd-48c6-ac4f-2d83bbec42ff.png`. Use its horizontal metric hierarchy and compact category line with existing brand CSS, not screenshot sample numbers or a new design system. Netlify production remains unchanged.

## Repository findings

- `ScheduleDetail.tsx` has always-visible schedule facts/settings, `ScheduleAnalyticsSummary`, and `RunHistory`. History currently combines occurrences and sparse change events in `ScheduleHistory.tsx`.
- `procurement-schedules.mjs.events()` selects event `summary`, but the UI drops it. Existing `procurement_schedule_events` stores actor/action/version/time; save/control SQL generally records only action/version, not field differences. Occurrence events share this table. Exact historical edits cannot be reconstructed from today's schedule.
- `Analytics.tsx` already aggregates verified distinct IDs, has seven-day defaults and completeness metadata, but renders metrics as a long facts grid plus paginated Runs. Reuse `admin-analytics.mjs`, including its outcome precedence, category overlap, grouped-state deduplication and snapshot safeguards.
- `verified-reporting-records.mjs` retains verified lead IDs, categories/outcomes/intake IDs; aggregation currently discards the identity sets from public summary output. Those sets, not mutable lead dates/current categories, must power metric links.
- `onViewLeads: () => void` currently opens generic Leads through `AdminScreen`/`src/app/AppShell.tsx`; it does not represent a report cohort. Exact navigation requires an additive read contract and Leads scope integration.
- `RunHistory.tsx` currently fetches on mount/filter changes, with blank initial date filters and date/time as the row link. Shared use means global Submit behavior must not unintentionally make Schedule Details Runs empty.
- `RunDetail.tsx` heads with outcome/status and `overview` route, renders attributes expanded and uses `RequestReview.tsx` for selected county/category results. `RequestReview` already supplies source attention blocker/next-action information and existing guarded workflow actions. Reuse it rather than inventing another collection/retry engine.
- `navigation.ts` preserves owner-scoped URL/session destinations, including schedule/run/source/geography. Extend this; do not replace it with independent local navigation.

## Shared boundaries and decisions

- Preserve existing schedule list/editor/lifecycle, scope locks, cadence/timezone, research, imports, notes/stages, validation, duplicates, budgets, Companies/email previews. No new provider access or paid search. No live research, schedule mutation, release or migration application during planning.
- Schedule History means configuration/lifecycle audit; execution attempts belong with Runs, including skipped occurrences with a reason and no invented Run ID. Existing execution evidence must remain reachable.
- Global History/logs initially shows no run/log rows, today's inclusive America/Chicago date range, and `Set filters, then Submit`. Draft filters do not query results. Submit executes; Retry repeats the failed submitted query; pagination uses that query. Schedule run lists still load automatically. Do not change global Stats filtering to Submit without a separate request.
- Breadcrumbs describe the real origin, e.g. Settings / Schedules / Pulaski / Runs / <run ID> / Issues, or Settings / History & logs / <run ID> / Logs. Use links for ancestors, aria-current for leaf, wrap at narrow widths. Preserve entry origin, filters/page/scroll and keyboard return focus. Do not invent schedule ancestry for standalone runs.
- “All lead counts” includes schedule list, totals, run rows/details, Stats and category breakdowns. Known zero opens an empty scoped result. Unknown is not zero; a known subtotal can link only its verified IDs, visibly labeled partial. Candidate/source counts are not automatically counts of saved Leads.
- Confirmed clarification: all valid leads import automatically into `procurement_leads` through the existing manual/scheduled import services, validation and duplicate checks. Do not add approval or review gates. Saved-lead counts link to the exact corresponding Leads. Collection or validation issue counts link to their matching issue details, including blocker and next action; label these as issues, not “candidates/leads needing attention.” Records lacking required validated information remain issues until valid; do not bypass validation to inflate lead totals. An issue may reference an existing Lead; retain that explicit link without counting the issue as another lead. Preserve all unrelated behavior.
- Keep Run Logs table, columns, paging and behavior unchanged. Rename displayed run Overview to Issues; retain old `overview` deep links as a compatible alias rather than breaking bookmarks/tests.

## Target structure (layout contract)

```text
Settings / Schedules / Pulaski / Overview
Pulaski                                      Run now  Edit  …
[Overview] [History] [Logs] [Related geography] [Sources]
Validated results                       All-time available
New leads          Updated leads      Unchanged       Collection / validation issues
3 ↗                5 ↗                18 ↗            2 ↗ [issue details]
Forecasts 4 ↗   Opportunities 20 ↗   Awards 3 ↗   Categories may overlap ⓘ
> Schedule setup
Runs
Run ID (link) | Created / finished | Outcome | Lead results | Duration | AI

Settings / Schedules / Pulaski / Runs / <ID> / Issues
Run <ID> · Oct 22, 2026, 9:00 AM CT
> Run attributes [status, explanation, scope, timing, totals, usage]
[Issues] [Logs] [Sources]
Issue / source | Blocker | Next action (appropriate link)
Sources: County filter
Source | County/location | Category | Result | Checked | Blocker | Next action

Settings / History & logs
From [today] Through [today] Schedule […] More filters […] [Submit]
Set filters, then Submit to view results.    [No initial rows]

Settings / Stats & analytics
Period [Last 7 days] Schedule […] Type […] More filters […]
Reporting dates · timezone · run count · as of
Validated results [same metric hierarchy as schedule totals]
Processing & attention / AI usage / Timing [concise existing accurate measures]
[No Runs table, sort or run pagination]
```

## Build plans

1. [05A — Audit and exact lead drilldowns](../done/05A-schedule-audit-and-lead-drilldowns.md): additive backend/native verification plus real Leads destination.
2. [05B — Schedule and run details](../done/05B-schedule-and-run-detail-clarity.md): breadcrumbs, compact totals, collapsed attributes/setup, changes history and sources/Issues tables.
3. [05C — History Submit and analytics overview](../done/05C-history-submit-and-analytics-overview.md): global query ownership, screenshot-style Stats and integrated acceptance.

Each child is buildable after its declared dependencies and must leave working screens without stubs. Phase 6 must include these accepted amendments before final parent completion. Use read-only real-data checks and disposable native fixtures; release authority is separate. No deployment to Netlify production.
