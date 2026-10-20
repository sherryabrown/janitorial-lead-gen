# Phase 3 — Schedule detail, run history and logs

Status: planned. Parent: [requirements](admin-workspace-redesign.md).
Initiating instruction: provide schedule detail summary, stats, history, logs, sources and related-geography sections with preserved context.
Dependency: phases 1–2. Stats uses verified overview counts now; full aggregation is phase 4. Read-only source/relationship sections can use current saved scope/associations until phase 5's catalog.

## Reuse and scope

Reuse ScheduleHistory, RunDetail, RequestReview, SourceReview, existing automatic import/SAM status and source-attention presentation. Server: procurement-schedules get/events/occurrences; county-triggers status/steps; workflow-http; workflow-audit. Keep existing evidence actions and import guards. Do not redesign the Leads queue or expose raw server diagnostics.

## Implementation

1. Detail header: schedule name, target/scope, lifecycle/blocker, concise recurrence/timezone, next occurrence, last run, version/updated time in secondary details. Edit, Run Now and overflow pause/resume/archive use phase 2 handlers.
2. Add section navigation: Overview/Stats, History, Logs, Related geography, Sources. Each deep link carries schedule/run/section and return context. Global History/logs includes standalone manual county/state/SAM runs as well as scheduled/manual schedule runs, with schedule, run, target, geography, origin, outcome and time filters. Schedule events and execution history remain visually distinct.
3. Overview shows verified new/updated/unchanged and category availability/completeness, candidates needing attention separately from source attention. Show per-run table and honest timing basis. Phase 4 reuses the same reporting projection for full period/all-time reporting.
4. History includes queued/skipped/blocked occurrences (including no-run reasons), actual linked run outcome, scheduled/manual origin, due/effective/start/finish timestamps where known, missed intervals, scope/config version snapshot, schedule edits/pause/resume/archive actor/time. Never rewrite historical scope from latest editor.
5. Logs show paginated sequence steps, timestamp, phase, state, source/geography, recorded elapsed, AI used/not used/unknown, tokens/credits/actual cost and diagnostic reference. Concise safe blocker + next action; advanced evidence expands on demand. Keep full nonpublic traces, credentials, session artifacts and unsanitized errors server-side. Existing diagnostic ID is a reference, not a promise that raw logs are downloadable.
6. Extend existing GET history/run endpoints with validated optional filters/fields; add only a small authenticated global history read endpoint if schedule/run lists cannot meet cross-schedule filtering. Reuse cursor semantics and safe public projection. Do not paginate a full page in the browser and call it full history.
7. Preserve active-run adaptive polling, manual refresh, in-flight cancellation/generation guards, cursor deduplication and focus return. Refresh must not create an operation. Source attention shows “Finished — some sources need attention” only through existing presentation rules; uncertain outcomes remain reconcile-first.
8. Reuse saved result navigation into Leads/evidence; do not claim new schedule/run filtering exists in Leads unless actually supported. If needed show a read-only result-ID list with existing Lead detail links rather than changing queue semantics. No blanket import approval removal.

## Timing/reporting gap

Expose existing trigger timestamps, but show Unknown for attention runs missing trustworthy finish. Step interval union can be “Recorded activity”, not exact end-to-end run time. Any prospective timing metadata must be additive reporting only and include resume/reconcile semantics; no lifecycle/state-machine change hidden in UI work. Historical gaps remain documented.

## Acceptance/tests

- Every requested detail section exists and provides real scoped content, honest empty state or evidence-backed unavailable reason.
- Schedule list → detail → run → source evidence → back restores selected row, filters/page/scroll and unsaved draft. Refresh/reload/back/forward do not execute work.
- Distinguish skipped occurrence with no trigger, completed zero, source attention, validation candidate blocker, active run, cancelled, stale version and outcome_unknown.
- Test histories beyond first page, live changing steps, section switch during fetch, partial endpoint errors, renamed/archived schedule, actor unavailable, null timestamps, overlapping/nested intervals, safe XSS/error rendering.
- Affected UI/HTTP tests plus native access checks for read contract changes; npm run check. Extend existing browser harness desktop/390/320, keyboard tabs/menus/focus restoration and concise expanded evidence. No unrelated layout fixes.
- Update contracts/checkpoint. No migrations or deploy beyond what is explicitly required/authorized; do not claim future analytics/catalog completion here.
