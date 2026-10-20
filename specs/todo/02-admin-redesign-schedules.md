# Phase 2 — Scheduled list and management

Status: planned. Parent: [requirements/metric dictionary/decisions](admin-workspace-redesign.md).
Initiating instruction: build the requested compact schedule list and complete schedule management by reusing existing scheduler services.
Dependency: phase 1. D1/D2 confirmed: new leads plus separate updates; AI usage reflects last run. No independent scheduler implementation.

## Scope and existing code

Reuse ScheduleList, ScheduleFields, TriggerForm, CountySelector, SamSection, AdminScreen editor/model, workflowRequest/mutationKey/acknowledged. Server: procurement-schedules, county-triggers, workflow-http, workflow-audit, import outcome helpers. SQL: schedules/occurrences/events and existing version/idempotency/owner/overlap RPCs. Styling: admin.css/styles.css and shared primary/secondary/text buttons.

## Implementation

1. Replace prose/rows with semantic desktop table: Name; Geography type + scope; Frequency; Last run time + outcome; Last run new leads + separate updates (D1); Next run time; AI credits; AI spent (D2); schedule Status; Quick actions. Include every requested field, not just currently returned data. Show readable multi-time/weekly/monthly recurrence and CT timezone, no cron editor.
2. Add search, target (county/state-source/SAM), geography, lifecycle/blocker filters, validated column sorts and server pagination. Stable secondary ID ordering. Filters and totals operate on the full result set; show empty/error/loading states separately. Default name sort preserves current server ordering.
3. Add a shared bounded reporting helper and backward-compatible list projection: latest actual linked trigger plus latest occurrence, verified new/update/unchanged outcomes, completeness and usageSummary. Reuse batched queries/chunked IN behavior from county-triggers; do not fetch every trigger/job for every table row or call status N times. Add optional filter/sort parameters to existing schedule list route; cap limits/allowlists. Preserve legacy callers and existing field shapes.
4. “Never run”, “Running”, “Unknown results” and real complete zero are distinct. Skipped/blocked last occurrence has no fabricated run/counts. Manual schedule Run Now is included in last run; standalone county/SAM run is not linked by name/geography. No guessing from candidate_count/current mutable Leads totals.
5. Row name opens detail; Run Now visible; overflow provides Edit, Pause/Resume, Archive, Stats, History/Logs, Related geography, Details, Sources. Until final views ship, these route to meaningful scoped existing sections in a detail surface. No dead buttons or fake analytics. Keyboard menu behavior and unique row labels.
6. Add schedule reuses current editor and previews selected county/cities or independent state/SAM scope. Preserve paused-by-default behavior, scope changes, rolling date policies and separate SAM lookback. Daily up to 24 unique times; weekly selected weekdays at one time; monthly one time/day with last-day clamping. Timezone remains CT, no new selectable unsupported zones.
7. Archive is the requested delete behavior: label “Archive schedule”, concise impact confirmation, preserve logs/history. Never hard delete. Explain current pause/archive effect on scheduled work and retained manual-origin execution. Keep existing owner inactivity rules, optimistic versions and idempotent acknowledgment reconciliation. Duplicate clicks reuse same operation key.
8. After save, return to the edited row/details with notice and obvious Run Now/Resume; after Run Now, open created run or show exact skipped/blocked reason; after archive, preserve current context and access via Archived filter. Stale version offers reload without discarding an unsaved draft.

## Data/API limits

No replacement scheduler or new schedule table. Add only reporting queries/optional indexes justified by query plans on existing tables, with authenticated server access. Full category analytics arrives in phase 4; required row new/update/usage totals must be real in this phase or explicitly incomplete. Unknown historical records are acceptable if honestly labeled, not blank placeholders passed as implemented.

## Acceptance

- All fields/actions work for county, independent state source and statewide SAM; geography distinguishes target from reach.
- Search/sort/filter and last run correct across multiple pages, equal timestamps, archived/deleted-owner schedules, manual run, active run, blocked/skipped occurrence, partial/uncertain result.
- Test version conflicts, missing/stale preview, ack loss/retry, archive history, pause with work in progress, overlapping Run Now, same-key replay, timezone DST/month-end, no state-trigger duplication.
- Existing schedule/HTTP tests + meaningful new reporting tests; native access/auth denial and replay checks for changed SQL. npm run check; affected native test:access scenarios.
- Desktop/390/320/keyboard verification: every field reachable, sensible actions menu, no paragraph dumps, no page-wide overflow; add/edit/cancel preserve map/search/drafts.
- Parent D1/D2 implemented as confirmed. No production deploy; phase can be reviewed independently and remains usable before phases 3–5.
