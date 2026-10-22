# Settings read controls and focused run navigation — 04A

Completed locally October 22, 2026. No commit, push, data migration or deployment performed.

## Implemented

- Preserved the existing ten-column Schedules index, filters/defaults, Add schedule, direct Run now, accessible floating ActionMenu and all lifecycle/editor rules. Added one schedule read owner, including retrying a failed next page without dropping loaded rows.
- Added ReadAction presentation with Loading, Refreshing, Refresh and Retry in one location. Last loaded is browser-read time in America/Chicago, not publication/source freshness. Same-scope stale views remain explicitly labelled.
- Stats and global History have compact primary filters and More filters without changing query semantics. Custom Stats dates appear for the custom period; default remains seven days. Kept snapshot/paging/sort/unknown metrics and independent schedule-choice retry.
- Run identity/date opens a focused run; the originating list stays mounted but hidden from display/accessibility. Back/Forward restores context and row focus. Run tabs replace the current history entry rather than adding an obstacle between the run and its originating list. Hidden parent lists are not invalidated by active-run polling; their own read controls refresh saved data.
- Progress, log and saved-result read failures remain independent. Healthy saved data and review drafts/selections are retained. Embedded results use the run read owner; standalone RequestReview keeps its own read control. Cursor failures retain prior steps and retry their failed page. Existing active-run backoff remains; session expiry stops automatic run polling and preserves its sign-in message.
- RunStepLog is now one six-column semantic table: step/status, geography/source, started/duration, result/next action, AI usage, References disclosure. Preserved all prior fields, usage formatters, ordering, pagination and copyable diagnostic references. Unknown timing/usage remains unknown. No per-step next action is currently provided by the step DTO/mapping, so it is explicitly Not recorded; no text-based inference or new backend field was invented.
- Read failures now describe the failed resource, instead of suggesting an unconfirmed import or schedule mutation. Mutation errors, POST guards and explicit workflow actions are unchanged.
- Removed obsolete paragraph-step styling and redundant run-row action clusters. No application source files deleted.

## Ownership retained / changed

| Workspace | Read owner | Distinct task actions retained |
| --- | --- | --- |
| Schedules list | One Refresh/Retry; failed page recovery | Add, Run now, Details, Edit, Disable submenu |
| Stats | Filtered report and failed choice lookup | Run identity link, sorting/paging |
| Global History | Filtered history and failed choice lookup | Run identity and scoped schedule-history link |
| Run | Progress, steps and visible saved-results reads | Stop/resume, View leads, source/evidence/import/reconciliation controls |
| Standalone saved results | Existing local control, loading/retry state | All existing guarded source/import actions |

Schedule Overview totals and Schedule History/Logs/Sources composition remain 04B scope. Their existing services and five approved tabs are retained; this child does not claim the entire amendment is complete.

## Verification

- Full frontend suite: 17 files / 119 tests passed, after page-recovery and navigation regressions were added. Final additional session-expiry regression: DetailHistory suite 12/12 passed (includes the added test). This was a frontend-only change; native database tests were not applicable.
- npm run lint passed. npm run build passed. Existing Vite large-chunk warning remains; bundle splitting is outside this scope.
- Real rendered app with authenticated fixture HTTP, not the mockup: desktop 1440px, mobile 390px and 320px, keyboard Enter/Escape, focus return, browser Back/Forward, preserved schedule columns/actions, long schedule names, floating menu row height, six log columns, expandable references, retained stale data and read recovery. Screenshots visually inspected. Zero workflow mutations and zero browser script errors.
- Existing analytics browser acceptance also passed: filters, sorting, paging, drill/Back/reload and unchanged five schedule detail tabs, all three widths; zero workflow mutations.
- git diff --check passed. No production Netlify, Render or database operations were performed.

Ignored verification artifacts: outputs/deployment/admin-ui/04A-final-tests.log; 04A-auth-tests.log; 04A-lint.log; 04A-build.log; 04A-browser.log; 04A-analytics-browser.log; 04A/verification.json and screenshots. Windows test workers required a workspace-local TEMP/TMP; browser verification required frontend and browser in the same loopback context on an unused port. Neither workaround changes app configuration.

## User review and remaining work

Review the local Schedules → Details → run → Logs → Back flow and the wording/column density. Automated tests cover data/navigation/guard preservation; fixture browser checks cover desktop/mobile/keyboard presentation. Live collection/import execution was deliberately not run for UI acceptance. 04B is next for direct selected-run content inside schedule Logs/Sources and coordinated schedule History/Overview reads. No new product decision or migration is required for 04A.

Proposed commit: `fix: unify Settings refresh and run navigation`.
