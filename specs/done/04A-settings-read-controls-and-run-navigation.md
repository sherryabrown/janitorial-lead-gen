# 04A — Settings read controls and focused run navigation

Status: completed locally, October 22, 2026. Dependency: existing Phase 4; use [amendment requirements and initiating prompt](../todo/04-settings-workspace-simplification.md) and [parent](../todo/admin-workspace-redesign.md). No implementation/release is authorized by this plan alone.

## Objective and scope

Remove duplicate Refresh/Retry affordances from Stats, global History, run details and their embedded results. Open one focused run workspace at a time. Leave the approved schedule list/editor/lifecycle and five schedule detail tabs intact; replacing the schedule Logs/Sources composition is 04B.

Initiating prompt: plan a cleanup of repetitive Settings pages, repeated Refresh/Retry and View Logs actions, informed by comparable websites, with 04A/04B plans and updated wireframes. Full wording and cited research are in the amendment.

## Implementation

1. Audit visible action ownership in `AdminScreen`, `Analytics`, `RunHistory`, `RunDetail`, `RequestReview`, `ScheduleHistory`, `ScheduleAnalyticsSummary`, `ScheduledTable`, `HistoryScheduleFilter` and `RunStepLog`. Distinguish duplicate **read** actions from actual guarded workflow mutations; record the owner/resource mapping from the amendment in tests.
2. Add a small shared read-action presentation if it reduces repetition: input state and `onRefresh`/`onRetry`, one native button, accessible scope label, stable position and pending state. Keep data ownership in the existing components. Use props/scoped callbacks for embedded children; do not add a global event bus/cache/query framework.
3. Analytics: replace permanent Refresh stats plus inline Retry stats with one toolbar action. Preserve default seven CT days, all existing filters/sorts and consistent snapshot/as-of pagination. Retry invalid/expired reports through the existing full-report reset. Keep all metric definitions, partial/unknown labels and timings. Do not invent charts/metrics.
   Show reporting period, schedule and type first; expose geography/category/origin in a More filters disclosure with an active-filter count. Custom dates reveal the existing from/through controls. History similarly prioritizes schedule/date range/outcome and discloses remaining filters. Retain existing defaults and every filter/sort capability; collapsing controls must not clear their values or silently change scope. The wireframe's compact More filters field illustrates this grouping, not a new API filter.
4. History: one toolbar action, resource-specific state, existing server filtering/paging and owner-keyed restoration. Make the run identity/date a semantic link/button to the existing run destination; remove its three-action View run / Logs / Sources cluster. Remove duplicated inline identity disclosures where the focused detail already contains those fields, while preserving access to those fields in detail. Keep occurrence-to-run links and schedule context links where they serve different destinations.
5. `AdminScreen`: when `selected` is set, suppress the originating list/Stats/schedule workspace visually and from accessibility. Retain its navigation/state for Back; prefer the existing mounted-state/context mechanisms rather than a second store. Hidden parents must not trigger repeated reads because child polling or its read action changes a broad parent revision. Restore original row/filter/scroll/focus on Back and browser Back/Forward; do not replace the list permanently.
6. `RunDetail`: separate read errors for run status, log pages and embedded request results; keep successful independent data. One toolbar read action refreshes the current workspace's visible resources and retries failed reads. Reuse existing `AbortController`, generation, cursor/dedup and active-run backoff logic. A status failure must not discard loaded logs or disable viewing them. Loading is not failure.
7. `RequestReview`: accept an embedded presentation/read-owner contract so its Refresh results button is absent under a parent owner. Keep standalone behavior. Preserve selected candidates, draft review text, evidence/supporting previews, packet/hash invalidation and import guards. Keep actual Retry source, execution resume, reconcile and tested import controls; label them as execution/data actions, never generic Retry. Avoid moving a single complex review into multiple simultaneous mounts.
8. Propagate filter-choice lookup failures to the correct workspace owner. Scope the existing shell connection notice to true prerequisites; do not let an unrelated county-registry failure block a usable Stats/Logs workspace. Keep existing auth/permission error handling. No new API/migration or backend behavior.
9. Preserve current CSS tokens, buttons, headings, `InfoTooltip`, responsive tables and tab/focus styles. Add one concise freshness/status line; initial load/refresh/partial/error states must not shift the primary action unpredictably. No hover-only interaction or icon-only unlabeled refresh.

Pseudo-contract (adapt naming to existing conventions):

```ts
type ReadState = 'loading' | 'ready' | 'refreshing' | 'error' | 'partial';
// Each owner coordinates its existing reads. Child panels report scoped read
// state; workflow POST actions remain separate and keep their existing guards.
const readLabel = failedVisibleReads ? 'Retry' : pendingRead ? 'Refreshing…' : 'Refresh';
```

Do not solve duplicate controls by hiding errors, removing pagination or disabling existing actions. Do not move source-specific recovery into a global Retry.

## Verification

- Extend `Analytics.test.tsx`, `DetailHistory.test.tsx`, `IntegrationRemediation.test.tsx`, `AdminScreen.test.tsx`, `AdminReview.test.tsx`, `navigation.test.ts` and relevant shared-control tests. Assert one equivalent visible read control for initial load, success, empty, refresh failure, partial failure and recovery.
- Test separate status/log/result failures and schedule-choice lookup failure; keep healthy data and retry only the failed reads/pages. Rapid filters/run selection, aborts, stale replies and load-more/refresh overlap must not mix scopes, duplicate rows or regress cursor handling. Never retain a stale analytics snapshot under new filters.
- Assert run details replace the visible History list; Back/Forward returns to the same filters, page, row and focus. Preserve entry from Stats, schedule Overview and deep links. Assert hidden sections expose no controls or polling-triggered parent reloads.
- Refresh/Retry must not send frontend POSTs, rerun a source, change schedules or import leads. Existing explicit guarded actions remain tested and reachable. Preserve current GET/status backend semantics.
- Run affected UI tests, `npm run lint`, `npm run build`; `npm run check` is the final 04B gate. No native DB test is required for a purely frontend change; if an actual data path changes, run its applicable native acceptance before claiming success.
- Verify actual implementation at 1440, 390 and 320px; keyboard Tab/Enter/Space, focus visibility, announcements, loading disabled state, browser Back and long/wrapped labels. Capture healthy and failed Stats, History list and Run Logs. Do not run live collection/imports as UI verification.

## Completion

Pass the scoped cases above, document changed/retained controls and limits, and move only this child to done. Keep 04B pending. Do not deploy Netlify production; release remains separately authorized. Proposed subject: `fix: unify Settings refresh and run navigation`.


## Review amendment — existing schedule index and structured step logs

Use the full user prompt in the parent review amendment. These requirements supersede the abbreviated schedule index and paragraph log sketches.

### Scope and implementation

1. Retain `ScheduledTable.tsx` as the actual schedule index; `ScheduleList.tsx` re-exports it. Preserve Add schedule, search, Type, Geography, Schedule status, More filters (Blocker, Sort, Order), loaded count, pagination and all existing defaults. Keep columns Name, Geography, Frequency, Last run, Last run leads, Next run, AI credits, AI spent, Status, Quick actions. Lead and AI figures remain last-run metrics with existing incomplete/unknown labels. Names and source labels wrap without colliding with adjoining cells.
2. Keep direct Run now and the existing floating `ActionMenu`: Details, Edit, Disable submenu with the current eligible actions. Preserve resume, never-run-only deletion, archival/history retention and current disabled rules. Do not reproduce the wireframe's illustrative menu in React; reuse the existing accessible component. Opening it must not expand a row or move adjacent rows. Maintain viewport placement, outside click, Escape and focus return. Preserve schedule editor scope locking, work reservations and all existing add/edit behavior.
3. The main Schedules navigation and detail breadcrumb return to this full index, not a placeholder or Overview. Preserve filters, loaded pages, row focus and scroll when returning. Apply 04A's single owner read-action contract to list reads/errors, not a new independent refresh mechanism.
4. Replace `RunStepLog.tsx`'s `.admin-step-list` paragraphs with a semantic table and existing responsive table styles. Reuse one component everywhere: standalone run Logs and embedded schedule Logs. Add a caption and scoped column headers. The table rows remain keyed by step ID and in the existing server/sequence order; do not add new sorting/filter APIs.
5. Map existing fields: Step / status = phase and state; Geography / source = existing county resolution plus source name/ID fallback; Started / duration = existing `formatLocal` and `duration` calculations with in-progress/unknown states; Result / next action = saved reason/outcome and an existing structured next-action mapping only where supported; AI usage = existing `usageText`, credits/unit, actual/held spend without dropping reported token fields; References = disclosure retaining sequence, origin, source ID and diagnostic reference. Do not expose raw payloads/secrets. Unknown and not used remain distinct; missing finish/start or invalid timestamps must not become zero duration. Keep existing labels/usage formatters authoritative.
6. Separate reason, outcome and next action within the result cell using concise labels if all are present. Never fabricate a next action or report none when it is unknown. No new source retries, mutation buttons or AI calculations. A compact row disclosure handles long diagnostics/technical references; meaningful result/blocker information stays visible. Preserve copyable references and stable focus through polling.
7. At desktop, use aligned table columns. At 390/320px reuse the current labelled stacked-row presentation (or a contained table scroller if required for readability), retaining every field and association; no page-level overflow, hover-only content or prose-only fallback. Long source names and IDs wrap. Keep More steps and read/error states under their existing ownership; no per-row Refresh.

### Verification and success criteria

Extend `ScheduledTable.test.tsx`, existing RunStepLog/DetailHistory tests and navigation tests: all ten schedule columns/filters/actions retained; list return restores context; one read control; semantic log headers and every existing step field remain available; unknown AI/duration stays unknown; references open by keyboard/touch; cursor pagination deduplicates steps; current active-run refresh retains selection/focus. Reuse existing fixtures and services; no new API/migration/native database tests expected.

Desktop/mobile/keyboard screenshots must include full Schedules, long names, open floating menu, standalone log table, populated/error/empty logs, and References disclosure. Verify opening a menu leaves row heights unchanged, Escape restores trigger focus, and list → schedule → Back preserves context. Run the existing 04A test gate. Implementation acceptance is not satisfied by the standalone mockup checks.


## Completion record

Implemented and verified locally. See [changes, retained controls, tests and limitations](../../docs/reviews/2026-10-22-settings-read-controls-and-navigation.md). Full frontend suite 119 passed; final added session-expiry regression passed in the 12-test DetailHistory suite. Lint/build and rendered-app desktop/390/320/keyboard checks passed, with zero fixture workflow mutations. No API/schema/native DB path changed. 04B remains in todo; no release performed.
