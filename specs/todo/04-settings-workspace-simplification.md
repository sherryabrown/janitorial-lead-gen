# Phase 4 amendment — focused Settings workspaces

Status: 04A and 04B completed and verified locally October 22, 2026. No release or deployment.
Parent: [Admin workspace requirements](admin-workspace-redesign.md). Baseline: `cd0d61c`; recheck the checkout before building.

## Initiating prompt

“There are issues with the latest changes, mostly that the Settings pages are repetitive in what they offer and there are too many options to ‘Refresh’. Examples: Stats / analytics page: ‘Refresh stats’ and ‘Retry stats’; View Logs, etc is in multiple places; History / logs page: ‘Refresh…’ and ‘Retry…’ is there multiple times. Please review websites like this and determine a plan to make this better. You can use 04A-…, 04B-…, etc labels for the files with the work if/as needed for the plan. Please show me updated wireframes accordingly.”

## Recommendation

Keep the existing Settings navigation and approved schedule detail tabs. Give every visible workspace one clearly owned read action. Its label is **Refresh** normally, **Refreshing…** during a read, and **Retry** after a recoverable read failure. Use that same toolbar position; error notices explain the affected resource without adding a second equivalent button. First-load skeleton/status is not an error and must not show Retry.

Open a run in a focused workspace, replacing its originating list rather than stacking both. Use the run's name/date as the list's primary link. Logs and Sources are destinations inside that run; do not repeat a View run / Logs / Sources action cluster in every table and tab. Existing meaningful task actions—Run now, Stop, resume execution, Retry source, reconcile imports, review evidence, View leads—remain distinct and available in their appropriate context. **Reading saved data must never be presented as retrying execution.**

## Audit of the current implementation

| Current code | Observed duplication / consequence | Planned correction |
| --- | --- | --- |
| `Analytics.tsx` | Refresh stats stays visible alongside Retry stats; compact totals add Retry totals | One read-action owner for the visible Stats workspace or Schedule Overview |
| `AdminScreen.tsx` | History renders even when a selected RunDetail is displayed; shell connection failure can coexist with child errors | Show one focused workspace; scope prerequisite errors to the resource they actually prevent |
| `RunHistory.tsx` | Refresh history plus Retry runs, with three navigation actions per row | One toolbar read action; run identity opens details |
| `ScheduleHistory.tsx` | Refresh occurrences plus Retry history despite two separately loaded datasets | One History read action; occurrences and changes retain independent results and failure labels |
| `ScheduleDetail.tsx` | Logs and Sources render the same full RunHistory table under different headings; Overview also renders it | Keep Overview's actual run list; Logs/Sources select a run and show the selected content directly |
| `RunDetail.tsx` | Refresh progress, initial Retry progress, Logs tab and nested review actions; status/log failures share one error | One coordinated read action; distinguish status, steps and visible child-result read failures |
| `RequestReview.tsx` | Refresh results can appear inside a workspace that already offers Refresh progress | Parent owns reading when embedded; preserve standalone mode and actual source/import actions |
| `RunStepLog.tsx` | Empty text tells users to Refresh progress regardless of load/error state | Show loading, empty, unavailable or stale state accurately; use the owning toolbar action |

`ScheduleList.tsx` is a re-export of `ScheduledTable.tsx`; change the actual implementation when required. Reuse `workflowRequest`, navigation/session restoration, request cancellation/generation guards, `HistoryScheduleFilter`, existing data tables, `InfoTooltip`, `RunStepLog`, current CSS and metric formatters. Do not introduce a router, state library, design-system dependency or backend reporting store.

## Research used

Reviewed official product/design documentation on October 22, 2026:

- [Grafana dashboard use](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/): dashboard-level toolbar controls queries and refresh; pending queries are cancelled when refreshing. Apply the consistent ownership/location principle, not Grafana's dense visual styling or new polling behavior.
- [GitHub workflow history](https://docs.github.com/en/actions/how-tos/monitor-workflows/view-workflow-run-history) and [run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs): history leads into a specific run and its job/log detail. Apply the list → identified run → logs hierarchy.
- [Carbon data tables](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines): table toolbar groups table utilities; object-level actions belong to the object. Use a consistent toolbar, concise identity links and contextual detail.
- [Carbon empty states](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states): differentiate missing data, no results and errors. Avoid showing failed-load controls in successful empty states.
- [Shopify resource indexes](https://shopify.dev/docs/api/app-home/latest/patterns/templates/resource-index): searchable/filterable resource lists link into resource details. Preserve context rather than rendering repeated lists beneath different headings.

These are design references, not dependencies or requirements to reproduce their interfaces. The one-control rule is this plan's recommendation synthesized from those patterns and the repository audit.

## Ownership and navigation contract

| Visible workspace | One read action refreshes | Principal navigation |
| --- | --- | --- |
| Schedules list | Current schedule list query, preserving loaded list context | Schedule name → details; approved Run now / Details / Edit / Disable unchanged |
| Stats / analytics | Current filtered report; reset its snapshot anchor/paging as the existing reporting contract requires | Run name/date → run Overview; Back restores Stats filters/report context |
| History / logs list | Current filtered execution history | Run name/date → run Overview; Logs tab is then explicit |
| Standalone run | Run status plus visible tab's read data | Overview / Logs / Sources; one breadcrumb back to origin |
| Schedule Overview | Current schedule and all-time totals plus its visible run list | Run name/date → run Overview |
| Schedule History | Occurrences and changes | Linked occurrence → identified run; skipped occurrence has no fake run link |
| Schedule Logs | Current selected run's status and loaded log pages | Run picker → logs directly, without another View Logs action |
| Schedule Sources | Current selected run's source/results evidence | Run picker → existing RequestReview; retain category/child selector where needed |
| Schedule Related geography | Existing saved schedule/geography read | Existing read-only geography; no new catalog work |

Changing a tab, filter or run selection loads the matching data automatically using existing services. Refresh is not an Apply/Accept step. Keep Back context, sort/filter values, loaded pages where valid, selected schedule/run/child, scroll and focus. Keep existing URL parameters/deep links and translate legacy destinations into the focused view. Schedule Logs/Sources need a saved selected-run ID in the existing owner-keyed navigation context; validate it belongs to that schedule before loading.

### Read states

- Initial loading: disabled toolbar control, “Loading…” status; no Retry.
- Success/valid empty: Refresh; show the dataset's existing as-of time or accurately labelled last-loaded time. Do not imply source freshness from browser load time.
- Refresh failure with a prior successful result for the **same scope**: keep it visible with “Saved view · update failed”; toolbar becomes Retry. Never present the retained view as current.
- Initial failure: resource-specific empty/error state plus the same toolbar Retry. Authentication failures use the existing sign-in flow, not endless retries.
- Partial failure: retain successful independent panels, identify failed panels and let the one toolbar Retry reload failed reads. A failure fetching more pages retries that page without discarding earlier rows or appending duplicates. Do not blank all history when only changes failed.
- Changed filters/entity: never show old-scope values as if they belong to the new selection; reset/invalidate using existing guards. Analytics invalid snapshot retains its existing consistent-report reset behavior.
- Mutation failures/unknown outcomes: preserve their separate guards, confirmation/reconciliation and draft recovery. The shared Refresh/Retry control issues no POST, resubmission, import, schedule change or source retry. Existing backend behavior attached to status GETs is unchanged.
- Preserve existing active-run polling/backoff. No new global auto-refresh, interval settings, automatic source retries or scheduler changes.

Do not suppress a failed control's accessible name or hide critical errors merely to reduce button count. Error copy and the toolbar action must identify the same scope. If an independent subordinate lookup (e.g. schedule filter choices) fails, show a scoped notice and retry it through the same workspace owner; do not advertise an unrelated global connection retry.

## Buildable phases

1. [04A — Read controls and focused run navigation](../done/04A-settings-read-controls-and-run-navigation.md). Independently buildable against today's code. Normalize refresh/retry behavior and stop list/detail stacking without changing schedule detail composition yet.
2. [04B — Focused schedule activity and integrated acceptance](../done/04B-settings-schedule-activity-and-acceptance.md). Depends on 04A. Replace duplicate Logs/Sources run tables with selected content, reuse the read-action contract, complete integrated verification.

Wireframe: [Settings workspace revision](../../docs/mockups/settings-workspace-simplification.html). It shows Stats, History, Run logs, Schedule Overview/History/Logs/Sources plus healthy/error/loading and mobile states. Values are illustrative; it makes no API calls. It supersedes only the repetitive read/navigation presentation in the earlier Phase 3 mockup; it does not replace the approved editor/list/lifecycle behavior.

Planning-artifact checks passed for the original seven screen sketches at 1440/390/320px: 21 original viewport/view combinations, one visible read action, simulated failed-read recovery, no page overflow, and keyboard run drill/tab/back. Screenshots were visually inspected. Evidence: ignored `outputs/deployment/admin-ui/settings-planning/verification.json`; preview images are beside the HTML. These checks validate the sketches only; implementation acceptance remains required by each child.

## Scope, decisions and acceptance

No unresolved product decision blocks building this recommendation. Recommended choices are explicit: keep labels and the five approved schedule tabs; keep refresh manual except existing active-run polling; use one identity link per run row; show one workspace at a time; keep Sources scoped to saved run evidence until Phase 5 supplies catalogs. User may revise these choices in the wireframe review before building.

Preserve all collection/import behavior, validation and duplicate checks, user notes/stages, AI budgets, Companies/email previews, scheduling/county work reservations, immutable saved counties and state/SAM independence. Provider access work is outside this UI amendment. No data migration or API endpoint is expected; if the audit finds a missing required read, document the gap and ask before expanding backend behavior. Keep Netlify production unchanged. This planning request authorizes no commit, push or deployment.

Acceptance: exactly one equivalent Refresh/Retry control per visible read workspace; no Retry during successful initial loading; no history list above opened run detail; no full run list repeated inside Schedule Logs/Sources; direct selection reveals the intended data; all existing mutations and guardrails remain available; desktop/390/320px/keyboard and stale/partial/error paths pass. Each child specifies concrete tests and preservation checks.


## Review amendment — restore full Schedules list and tabular logs

Initiating prompt: “Many improvements with this, thank you. There are other changes for this. We lost the good Schedules list view for existing schedules. Please reinstate that (with similar patterns you've got with these latest wireframes). Also, why are the logs in paragraph form? I am expecting more of a table form.”

The earlier sketch omitted the existing Schedules table and used paragraph rows to illustrate log content. Neither is the intended final design. The live list is still implemented in `ScheduledTable.tsx`; preserve its approved structure and lifecycle controls. The revised sketch now includes Schedules as a first-class screen and navigation destination, all ten existing columns, compact filters, wrapped names and a floating action menu. One list Refresh/Retry remains governed by 04A; do not add a second inline retry.

Logs must be semantic tables in both standalone and schedule contexts, using the same `RunStepLog` presentation. Columns: Step / status; Geography / source; Started / duration; Result / next action; AI usage; References. Use compact stacked values within cells rather than prose combining unrelated fields. Keep all saved reference fields behind a keyboard/touch-operable row disclosure. Preserve current step order, pagination, polling and honest unknown usage/timing. Do not infer a next action from free-form error text or create new execution controls.

This is an amendment to the existing two children, not a third implementation phase: 04A preserves/restores the list and implements the shared log table; 04B reuses it for schedule Logs. No backend contract, migration, collection or scheduling changes. The interactive sketch now contains eight primary screens. Mock schedule rows and actions are illustrative, not a replacement for the current real data or management services.

Updated planning checks: eight views × 1440/390/320px = 24 combinations passed; single read action, failed-read recovery and no page overflow. Keyboard run drill/back, log References disclosure, and floating menu open/Escape with unchanged row height passed. Desktop list/log screenshots inspected. These checks apply to the wireframe only.


04A local completion: see [verification record](../../docs/reviews/2026-10-22-settings-read-controls-and-navigation.md). 04B is also completed locally; Phase 5/6 remain pending. Original planning-artifact checks above are separate from actual implementation acceptance.


04B local completion: [schedule activity acceptance](../../docs/reviews/2026-10-22-settings-schedule-activity.md). Both implementation children passed their acceptance gates. The main workspace parent stays active for Phase 5/6; release remains separate.
