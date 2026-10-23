# Phase 2 — Scheduled list and management

Status: completed locally including the floating Quick actions menu amendment, 2026-10-20. Parent: [requirements/metric dictionary/decisions](admin-workspace-redesign.md). Release remains separate; the reporting migration must precede the matching backend/UI release.
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

## Completed amendment — floating Quick actions menu

User request: opening the three dots must not expand the schedule row. Change only the menu presentation and interaction; preserve all existing actions, safeguards, schedule data and navigation context.

- Use a button-triggered floating actions menu anchored to the three dots, visually above adjacent rows. Open on click/tap or keyboard activation, not hover. Hover may highlight the button or show a short label, but must not open the action list.
- Remove the menu content from normal table layout so opening/closing it changes neither row height nor column width and does not move neighboring rows. Reuse an existing suitable accessible overlay primitive if available; otherwise use a small shared implementation with no new dependency unless justified.
- Keep the menu within the viewport: align to the trailing edge, flip above when necessary, constrain height with internal scrolling. Avoid clipping by the table's overflow container, using a portal/top-layer approach as appropriate. Reposition or close safely on scroll/resize. Same floating behavior on desktop and mobile; no page-wide overflow.
- Only one row menu may be open. Clicking the trigger again, selecting an action, clicking outside, pressing Escape or tabbing outside closes it. Escape returns focus to its trigger; actions that open an editor/detail move focus to that destination. Preserve archive confirmation and disabled/busy behavior.
- Follow the [WAI-ARIA actions menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/): real button with a unique schedule-specific accessible name, aria-haspopup and aria-expanded; Enter/Space opens and focuses an item; arrow keys navigate, Home/End reach boundaries, Escape closes, Tab exits without trapping focus. Retain visible focus and current CSS/brand styling.
- Automated acceptance: verify activation, one-open-menu behavior, outside dismissal, selection, Escape/focus return, keyboard navigation, archived/busy actions and unchanged action dispatch.
- Browser acceptance at desktop/390/320: assert row/column and neighboring-row bounding boxes remain unchanged when open; test first/middle/last rows, viewport edges, scroll/resize, no clipped items or horizontal overflow, tap and keyboard operation. Recheck existing schedule actions and draft/context preservation. No backend/schema changes or deployment required for this amendment; Netlify production unchanged.

## Data/API limits

No replacement scheduler or new schedule table. Add only reporting queries/optional indexes justified by query plans on existing tables, with authenticated server access. Full category analytics arrives in phase 4; required row new/update/usage totals must be real in this phase or explicitly incomplete. Unknown historical records are acceptable if honestly labeled, not blank placeholders passed as implemented.

## Acceptance

- All fields/actions work for county, independent state source and statewide SAM; geography distinguishes target from reach.
- Search/sort/filter and last run correct across multiple pages, equal timestamps, archived/deleted-owner schedules, manual run, active run, blocked/skipped occurrence, partial/uncertain result.
- Test version conflicts, missing/stale preview, ack loss/retry, archive history, pause with work in progress, overlapping Run Now, same-key replay, timezone DST/month-end, no state-trigger duplication.
- Existing schedule/HTTP tests + meaningful new reporting tests; native access/auth denial and replay checks for changed SQL. npm run check; affected native test:access scenarios.
- Desktop/390/320/keyboard verification: every field reachable, sensible actions menu, no paragraph dumps, no page-wide overflow; add/edit/cancel preserve map/search/drafts.
- Parent D1/D2 implemented as confirmed. No production deploy; phase can be reviewed independently and remains usable before phases 3–5.

## Implementation and verification checkpoint

- Replaced the schedule rows with a semantic desktop table and labeled mobile rows. Added server search, geography/target/lifecycle/blocker filters, allowlisted sorting, exact filtered totals and stable pagination. The default continues to exclude archived schedules; All/Archived exposes retained history.
- Added target-specific Add schedule entry points and contextual actions/details. Reused existing county/state/SAM editors, previews, version checks, mutations, occurrence history, run details and scheduler. Saved edits return to details even when excluded by the current filter. Late editor responses cannot overwrite newer scope changes. SAM in-flight draft protection and owner-scoped filters are retained.
- Added a service-role-only reporting view/index on existing tables, plus bounded batched reporting. Latest actual linked run is separate from latest skipped/blocked occurrence. Verified receipts supply new/updated/unchanged counts; malformed, missing or uncertain evidence remains Unknown. Source-only runs show Not applicable. AI usage uses existing audit summaries, with unknown credits and reservations separate from actual USD.
- Stats, Sources and Related geography actions currently open meaningful saved-run/saved-scope sections. Full reporting-period analytics and geography/source catalogs remain phases 3–5. No recurrence, collection, import, budget or access-policy behavior was replaced.
- `npm run check` passed: 346 workflow tests, SQL validation/rollback/concurrency checks, UI tests and production build. Final UI suite after draft/filter refinements: **84 passed across 12 files**. Final targeted schedule/SAM/reporting tests: 13 passed; stricter reporting checks: 2 passed. Final lint and build passed; existing large-chunk advisory remains.
- `npm run test:access` passed against isolated PostgreSQL/PostgREST: reporting-view access denial for anon/authenticated, authenticated filtered HTTP reporting readback, invalid-sort rejection, existing scheduler replay/wake and automatic import protections. No production contact.
- Local Playwright acceptance passed at desktop, 390px and 320px with keyboard navigation, schedule actions/history, manual run confirmation, paused multiple-daily-time schedule and independent SAM workflows. Inspected table screenshots at desktop/mobile; no page-wide overflow. Fixture HTTP only, zero production mutations. Receipts: ignored `outputs/deployment/admin-schedules/`; screenshots: ignored `outputs/deployment/admin-ui/`.
- User spot-check after an authorized release: manage real county/state/SAM schedules, verify real historical metrics and confirm archived history. Automated local coverage passed; live account/migration/deployment verification is not claimed here.
- No commit, push, live migration or deployment performed. Netlify production unchanged; Bonfire access work untouched. No unresolved product decision or functional scope deviation. Historical records without reliable receipts/timing remain explicitly unknown.

## Floating menu amendment verification

- Replaced inline row-expanding details with a shared, controlled portal actions menu; no new dependency. Only one menu opens at a time. It is anchored to the trigger, flips above at the viewport edge, constrains height with internal scrolling and wraps long labels. Click/tap/keyboard activation works; hover alone does not open it.
- Preserved existing action callbacks and archive confirmation. Disabled items remain keyboard discoverable but cannot execute. Escape restores trigger focus; Tab exits, outside interaction dismisses, scrolling that moves the anchor and resizing dismiss safely. Opening saved editors/details moves focus to that destination. No backend, schema, scheduler or collection changes were needed for the amendment.
- UI suite: 87 tests across 13 files, including portal/one-open-menu behavior, keyboard navigation/dismissal, unchanged dispatch and explicit busy/archive safeguards. Lint and production build passed; existing bundle-size advisory remains.
- Real local browser fixture acceptance passed at 1440/390/320 widths, mouse/touch/keyboard, first/middle/last rows and top/bottom viewport edges. Bounding-box assertions confirm all rows/cells retain position and size while opening. Labels do not clip, menus stay in the viewport, and scrolling/resizing dismiss safely. Existing county/SAM/manual/schedule/history/draft workflows also passed; zero production mutations. Desktop and mobile screenshots visually inspected.
- Amendment receipts: ignored `outputs/deployment/admin-schedules/menu-app-verified.log`, `menu-lint-verified.log`, `menu-build-verified.log`, `menu-browser-complete.log`; screenshots: ignored `outputs/deployment/admin-ui/floating-menu-*.png`. Automated local browser coverage is complete; live preview/account acceptance was not run in this amendment. User can spot-check the three-dot menu in the existing local app.
- No amendment scope deviations, unresolved decisions, commits, pushes, migrations or deployments. Existing unrelated working-tree changes retained; Netlify production unchanged.

Proposed commit for the complete uncommitted phase: `feat: redesign schedule management`.
Menu-only commit, if separated from the earlier phase changes: `fix: float schedule quick actions without expanding rows`.
