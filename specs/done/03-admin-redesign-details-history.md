# Phase 3 — Schedule detail, run history and logs

Status: completed locally, 2026-10-20. Parent: [requirements](../todo/admin-workspace-redesign.md). No commit, push or external deployment performed for this phase.
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

## Implementation checkpoint

- Added a shared schedule-detail surface: summary, lifecycle/blocker, recurrence, last/next occurrence, saved identity/version/update time, existing edit/Run Now handlers and floating pause/resume/archive controls. Overview/Stats, History, Logs, Related geography and Sources provide scoped content and independent loading/error states.
- Reused existing schedule reads, occurrence/change history, RunDetail, RequestReview, SourceReview and guarded mutations. Related geography shows the saved county/city scope; Sources links to a run's retained evidence and review controls. All three per-run actions retain their own destinations in every section.
- Added `GET /v1/admin/history` through the existing authenticated transport and schedule service. Optional `schedule` (UUID or `none`), `run` (UUID), `target`, `geography`, `origin`, `outcome`, `from`, `through`, `limit`, `offset` filters apply server-side before pagination/counts. CT dates use inclusive calendar days converted to half-open UTC bounds, including DST. Stable ordering is run creation descending, then ID. No new tables, migrations, providers or scheduler.
- Global history includes manual standalone county/state/SAM and schedule-linked runs. Schedule names reflect the current record; run/occurrence configuration remains historical. Occurrences without a trigger and schedule edits remain separate from run outcomes. Selecting a schedule in global history offers a direct link to its occurrences/changes, with Back preserving filters.
- Batched history reporting reuses the verified lead and AI summaries. Timing is explicitly created-to-finished when reliable and union of recorded completed step intervals; missing finish/start/category attribution stays Unknown. No import replay or lifecycle changes populate reporting fields.
- Step logs retain adaptive active-run polling, sequence cursors/deduplication, manual refresh and generation guards. Log pages, history pages and schedule pages restore owner-scoped context; refresh retains loaded ranges. A failed run-metadata read does not hide loaded logs, and failed logs do not hide loaded run progress. Schedule occurrence/change failures retain successful panels.
- URL/History API context supports schedule/run/section deep links, Back/Forward and reload without executing work. Existing shell and owner-scoped drafts/filters are reused; sign-out clears the added context. Closing details returns focus to the originating control. Navigating between run sections retains the mounted evidence review.
- Public reporting uses a field whitelist. Step summaries/reasons and schedule event/baseline projections omit arbitrary private traces; diagnostic UUIDs remain references. Internal trigger checkpoints, leases, credentials and artifact paths are not included in the new reporting DTO.

## Verified limits and later phases

- Category breakdown and exact unresolved-candidate counts cannot be reconstructed reliably from all historical verified receipts; they are explicitly unavailable. Saved candidate validation/evidence remains accessible through the existing review. Source-attention presentation counts affected checks/routes, so this UI labels it **Source checks needing attention**, not a fabricated distinct-source total. Distinct source/gap and period/all-time aggregation remain the later reporting/catalog work.
- Outcome filters use recorded run lifecycle values; rows retain the existing derived “Finished — some sources need attention” presentation. Source-only runs are not treated as zero imported leads. Historical missing timing remains Unknown; no prospective timing instrumentation was added.
- Full analytics and the source/geography catalog remain phases 4–5. Leads navigation remains the existing queue entry point; no invented run-specific Leads filter. No blanket approval removal or import policy change.
- No unresolved product decision or change to scheduling, collection, AI budgets, validation/deduplication, notes/stages, Companies, email previews or Bonfire access behavior. These are planned historical-data limits rather than failed acceptance.

## Verification receipts

- `npm run check` passed: full UI suite at that checkpoint, **348 workflow tests**, SQL constraints/date/history/protected-field/replay tests, lint and build. Final UI suite: **94 tests across 14 files**; the final destination refinement also passed all **7 focused detail/history tests**. Final lint/build clean apart from the existing bundle-size advisory.
- Final isolated `npm run test:access` passed PostgreSQL 15/PostgREST checks, including filtered authenticated history, invalid-filter/anonymous denial, safe reporting fields and retained scheduler/SAM/county import/rollback/replay protections. No production contact in native tests. Targeted final reporting tests additionally passed full pagination, CT/DST bounds, immutable snapshots, private-field exclusion, safe summaries and nested/overlapping interval unions.
- Local fixture browser acceptance passed desktop 1440px, mobile 390/320px, touch and keyboard. Covered all detail sections, occurrence snapshots, diagnostic logs, evidence, Back/Forward/reload, contextual history shortcut, owner filters, retained county selection/drafts, menu stability and no page-wide overflow. Screenshots visually inspected; zero production mutations.
- Matching local backend restarted using the existing configuration. Health 200; authenticated local `/v1/admin/history?limit=1` returned 200 and omitted private fields. This check was read-only. Render/Netlify were not deployed or reconfigured; Netlify production remains unchanged.
- Private receipts: ignored `outputs/deployment/admin-details/` (`check.log`, `app-accepted.log`, `detail-actions-final.log`, `reporting-safe.log`, `native-accepted.log`, `browser-accepted.log`, final lint/build receipts). Screenshots: ignored `outputs/deployment/admin-ui/detail-*.png`, `global-history-*.png`.
- User spot-check: refresh the local app, open a real schedule, traverse History → run → Logs/Sources → Back, and confirm the expected saved scope and readable unknown metrics. Local automated/browser coverage passed; live preview release/acceptance is not claimed for this phase.

Proposed commit: `feat: add schedule details and run history`.
