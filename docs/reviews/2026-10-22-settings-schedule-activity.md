# Settings schedule activity — 04B local acceptance

Completed locally October 22, 2026. Build request: implement `specs/todo/04B-settings-schedule-activity-and-acceptance.md` using the updated wireframes, preserve unrelated behavior, complete automated and desktop/mobile/keyboard verification, and keep Netlify production unchanged.

## Result

- Overview keeps all-time available metrics, saved settings and one actual run list. Latest run remains its first normal row; no separate latest-run panel.
- History shows compact, separate occurrence and schedule-change tables, retaining immutable snapshots, actor/origin/timing/missed-interval details and independent pagination. A failure retains the other dataset; Retry targets only failed resources/pages.
- Logs selects an existing schedule run and displays the shared six-column RunStepLog directly. Sources uses the same selection and renders the existing county/source/child selector and RequestReview directly. Neither tab repeats the run-history table or nests standalone run navigation.
- One ReadAction belongs to the visible schedule workspace, coordinating existing readers through the small schedule-scoped ReadWorkspace/read-owner contract. This is a presentation/read registry, not a data cache, application event bus or reporting store. Explicit run/source/import/reconciliation actions keep their guards.
- Reused RunDetail in an embedded presentation, preserving status/log paging, active-run backoff, evidence/review state and all existing services. Embedded Sources retains one parent View leads navigation action; standalone results retain their own navigation. No import action was removed.
- `scheduleRunId` / `adminScheduleRun` is distinct from standalone `runId`. The owner-scoped selected run and loaded choice pages survive tabs, Back/Forward and reload. Newest is selected only when there is no prior selection. Refresh/newer arrivals do not replace an explicit selection.
- Membership is checked against existing filtered history, including a targeted read for older saved selections outside loaded pages. Missing/foreign selections require an explicit safe choice. Embedded status readback also verifies schedule membership before rendering children or logs; obsolete replies are aborted/ignored.
- Saved evidence loads on the first Sources visit and remains mounted across tab changes to preserve review drafts. Hidden schedule panels pause their read polling. Run-picker source children remain independent for grouped state schedules. Schedule tab keyboard focus now remains on the tab rather than jumping back to the heading.
- Preserved the full ten-column schedule index, floating menus, lifecycle/editor/county-work rules, all five approved tabs, manual county/state/SAM functionality, metrics/unknown usage, validation/import guards, notes/stages, budgets, Companies and email previews. Related geography remains the existing read-only saved scope; Phase 5 catalogs are not implemented.

20 implementation/test files changed for this child, plus plan/evidence updates. Existing uncommitted 04A/planning changes were preserved. No application files were deleted. No backend/API/schema changes or migrations; no provider access work, commit, push or deployment.

## Verification

- `npm run check` passed: lint, 135 frontend tests at that checkpoint, all 370 offline workflow tests, intake/import SQL constraint/rollback/concurrency/provenance checks, SAM SQL checks and production build. After the final frontend-only refinements, the full frontend suite passed 139 tests in 18 files; final lint and build passed again. Backend/SQL files were unchanged throughout.
- Native `test:access` was not applicable: no database contract or data path changed. Existing Vite large-chunk warning remains; bundle splitting is outside this amendment.
- New focused tests cover county, grouped state and SAM, never-run schedules, retained review text, newer run arrivals, older paging/remount, missing/foreign IDs and foreign status responses, rapid selection/late replies, independent totals/changes/results/choice failures, recovered page dedupe, lazy evidence loading, keyboard tab focus, session cleanup, and one navigation/read owner. Existing mutation/validation tests pass.
- Rendered application at 1440/390/320px with authenticated intercepted fixtures: Overview/run drill/Back focus; separate History tables and partial recovery; direct Logs, older-run paging/reload; Sources/evidence recovery; failed choices with healthy content retained; read-only Related geography; one visible read owner; no page overflow; keyboard tab focus and index row focus. Screenshots of context/content and errors were visually inspected. No browser script errors or workflow POSTs.
- Integrated existing Settings browser checks passed at all three widths: full schedule list/floating menu, Stats → run → Logs → Back, global History navigation/recovery, references and Back/Forward. Existing analytics browser checks passed filters, sorting, paging, drill/Back/reload and five schedule detail tabs. All use fixture-only reads; no production writes.
- Signed-in local Sources DOM was also inspected without clicking any execution/import action: the real Pulaski schedule and saved run loaded, including 37 saved pages, 14 checked sources and verified unchanged lead results. Existing source attention/access blockers remain separate from this UI work. No real collection was launched.
- `git diff --check` passed. Netlify production, Netlify preview and Render were not deployed or reconfigured.

Ignored local artifacts: `outputs/deployment/admin-ui/04B-check.log`, `04B-final-app-tests.log`, `04B-lint.log`, `04B-build.log`, `04B-browser.log`, `04B-integrated-browser.log`, `04B-analytics-browser.log`; `04B/verification.json`, context/content/error screenshots and `04B/local-saved-source-results.png`. Windows workers used a workspace-local TEMP/TMP; browser fixtures used isolated loopback ports. The existing local app/backend was left running.

## Remaining scope / review

No product decision or acceptance blocker remains for 04B. Please review the local tab layout and run selector against your daily workflow; automated and browser checks cover the behavior described above. Missing historical metrics remain honestly unknown/partial, per existing contracts. Phase 5 (Sources/related geography catalogs), Phase 6 and any release remain separate. No fresh research/import or external provider access acceptance is claimed.

Proposed commit message: `fix: focus schedule history logs and sources`.
