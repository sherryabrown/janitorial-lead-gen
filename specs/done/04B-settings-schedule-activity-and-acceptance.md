# 04B — Focused schedule activity and integrated acceptance

Status: completed locally, October 22, 2026. Depends on completed [04A](../done/04A-settings-read-controls-and-run-navigation.md). Use the [amendment and initiating prompt](04-settings-workspace-simplification.md), [parent](admin-workspace-redesign.md) and current Phase 3 amendments. Implemented and verified locally; no release performed.

## Objective

Make schedule Overview, History, Logs and Sources distinct views rather than different headings over repeated run tables. Apply 04A's single read owner throughout. Preserve the five approved tabs, current management/editor behavior, all metric meanings and all source/import guards.

Initiating prompt: plan fixes for repetitive Settings controls and repeated Refresh/Retry/View Logs destinations, based on comparable interfaces, using numbered amendments and revised wireframes. Full original text is in the amendment.

## Implementation

1. `ScheduleDetail.tsx`: keep breadcrumb, identified schedule, existing Run now/Edit/Disable, saved scope/frequency/next run, and Overview/History/Logs/Related geography/Sources tabs. Distinguish management actions from the single read/freshness toolbar. No new Settings landing page or changes to schedule permissions, work reservations, recurrence, delete/archive policy or immutable county membership.
2. Overview: keep all-time available analytics and schedule settings, with clear section headings, followed by one actual run list with the newest run as its first regular row. Use the identity-link row pattern from 04A. Do not add a separate latest-run panel or another totals Retry button.
3. History: keep occurrences and schedule changes as separate compact sections under one read owner. Represent skipped/missed/no-run outcomes honestly, retain version/config snapshots and actor data in contextual disclosure, and preserve separate pagination. A partial failure keeps the other successful dataset; the toolbar Retry targets the failed dataset/page. Do not show an additional execution-history list here merely because other tabs use it.
4. Logs: replace the full `RunHistory` table with a run selector and the selected run's logs, using the existing history read for choices and `RunStepLog` for content. Show run identity/date/origin/outcome and loaded step count. Choose the newest existing run on first entry only; retain an explicit selection thereafter, even when a new run arrives. Never implicitly run a schedule or choose a run from another schedule. Empty schedule: “No runs yet”, no fake selector/logs. Include older runs through existing pagination; retry choices through the one owner.
5. Sources: use the same selected-run context, then render its existing county/source/child selector and saved `RequestReview`/source evidence. Do not display another generic run list or nested run Overview/Logs/Sources navigation. Keep all source-specific actions, unsupported/access states, immutable evidence and automatic/nonautomatic import contracts. This is **saved run evidence**, not the Phase 5 geography/source catalog.
6. Reuse the appropriate read/presentation portions of `RunDetail` rather than cloning its polling, cursor or review state. If needed extract small `RunLogPanel`/`RunResultsPanel` components from existing code. Standalone RunDetail remains the owner in standalone mode; ScheduleDetail owns embedded mode. Pass explicit ownership props to avoid nested refresh buttons. Preserve review drafts/selections and abort obsolete reads; do not reset them just because users switch tabs.
7. Extend the existing owner-keyed `navigation.ts` context/URL handling with a distinct schedule-selected-run field if needed, without overloading `runId` (which opens standalone run detail). Validate selected run membership against the existing saved run/schedule data. Old deep links to schedule Logs/Sources still resolve. Back from a standalone run opened from schedule Logs restores that schedule/tab/run selection, paging and focus.
8. Related geography remains read-only and uses current saved scope. Apply consistent read-state presentation only; do not implement Phase 5 relationships/catalogs or change geography inference.
9. Review all visible Settings screens against the action inventory: one visible equivalent Refresh/Retry per owner; no duplicate nested headers/tabs, three-action run rows, or list above selected detail. Preserve direct external official-record/evidence links and distinct mutation actions. No new backend service, migration, polling interval or collection behavior.

## Acceptance and tests

- Extend `DetailHistory.test.tsx`, `Analytics.test.tsx`, `AdminReview.test.tsx`, `IntegrationRemediation.test.tsx`, `ScheduledTable.test.tsx`, `AdminScreen.test.tsx`, `navigation.test.ts` for embedded versus standalone ownership, source mutations unchanged, and context restoration.
- For county, grouped state and SAM schedules: Overview contains one run list; History has occurrences/changes; Logs opens actual selected steps immediately; Sources opens that run's existing saved evidence. Latest run appears once in the Overview list. No repeated run table in Logs/Sources.
- Test never-run, archived, paused, long-name, missing historical metric and unknown AI cases. More than one history page must allow selecting an old run. Selected run survives refresh/newer runs, tab change, browser Back/Forward and reload; invalid/foreign/missing selection receives a scoped message and safe selection flow, not silently unrelated evidence.
- Test independent occurrence/event/status/steps/results/choice failures, successful empty data, stale same-scope reads, auth expiry, late responses and rapid run selection. Retain successful panels and loaded pages without presenting them as fresh. One owner Retry, no source/execution POST side effect.
- Run `npm run check`. Native `npm run test:access` is required only if implementation actually changes backend/data contracts; otherwise document that none changed. Any unplanned backend expansion requires a scoped decision before implementation.
- Actual desktop 1440px, mobile 390/320px and keyboard verification: complete Stats → run → Logs → Back; History → run → Sources → Back; schedule Overview → run → Back; schedule Logs run selection/paging; schedule History partial failure; schedule Sources recovery; no reset draft/selection. Verify ARIA/tab behavior, focus return, live status, wrapping, no page-level overflow and a single visible read action in each state. Capture and inspect screenshots of every wireframe view and error state. Use fixtures/read-only signed-in navigation; do not start research/imports for visual testing.
- Verify existing schedule management and manual county-map/state/SAM entry points remain reachable with the same behavior. Keep Companies/email previews and collection/import validation/notes/stages/AI budgets untouched. Bonfire/provider work remains separate.

## Completion and release

Record all tests/screenshots, the final action inventory, limitations and proposed commit. Move 04B to done only after these gates pass, and mark the amendment complete once both children pass. Leave Phase 5/6 pending. No production Netlify publish/unlock; commit/push and Render/preview releases require their own current authorization after a reviewable result is ready. Proposed subject: `fix: focus schedule history logs and sources`.


## Review amendment — preserve index and reuse tabular logs

Use the parent's follow-up prompt and 04A's schedule-index/log-table amendment. Schedule Logs must reuse the shared semantic `RunStepLog` table from 04A, immediately below the selected-run control; do not reintroduce paragraph step cards or a repeated execution history table. Retain all log fields/reference disclosures, unknown usage, pagination and active-run polling. The Schedules breadcrumb returns to the full approved index with its ten columns, filters, floating Quick actions and preserved context. No editor/lifecycle redesign.

Integrated acceptance adds Schedules as an eighth primary wireframe/view: index → Details → Logs → run selection → References → Back, at 1440/390/320px and with keyboard. Verify full index context, stable menu/row layout, direct log table rendering and unchanged source/import actions. Parent and 04A define the exact columns and preservation contract.


## Completion record

Implemented and accepted locally. See [changes, action inventory and verification](../../docs/reviews/2026-10-22-settings-schedule-activity.md). Final frontend suite 139 passed; workflow suite 370 passed; SQL checks, lint/build and 1440/390/320 keyboard/browser acceptance passed. No API/schema change, migration, live collection, commit or deployment. Both 04A and 04B are complete locally; Phase 5/6 remain pending.
