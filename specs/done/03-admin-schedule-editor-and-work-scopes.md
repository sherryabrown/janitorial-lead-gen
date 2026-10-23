# Phase 3 amendment — Schedule editor, work reservations and multiple state sources

Status: implemented locally, 2026-10-20; verification complete, release pending. Parent: [Settings/Admin requirements](admin-workspace-redesign.md). Builds on [completed Phase 3 amendment](../done/03-admin-redesign-detail-revision.md).

Baseline: released `8e80b13`, plus the current **uncommitted visual alignment correction**. That correction changes AdminScreen, ScheduledTable, ScheduleDetail, RunHistory, admin.css, tests and documentation. Preserve and incorporate those changes; do not reset the workspace to the released commit or restore its older layout. This plan supersedes conflicting earlier requirements only for the changes explicitly specified here. Netlify production stays unchanged.

## Initiating request

User invoked plan-code for another Phase 3 amendment:

- Wrap source names as shown in the attachment (long text currently overlaps adjacent columns).
- Remove confirmation when changing Schedule target; say **type** instead of **target**.
- Remove Back to contracts; users can use the Contracts stage navigation.
- Reposition Back to schedules; rename Admin to Settings and make its placement clearly non-interactive.
- On Add schedule: collapse Work at the bottom; default only Check for lead updates. Counties may belong to separate schedules for different work; prohibit the same county in schedules for the same work.
- Remove duplicate schedule-name presentation. Put name first, then frequency, lead types and date window; default the date window to 120 days and Enabled on.
- Replace the oversized/confusing scheduling rows and Add time interaction with intuitive controls.
- Show a county's cities as soon as it is selected.
- Allow multiple state sources in one schedule; show affected counties in Included geography using county disclosures with city counts next to county names, without a redundant header/summary line.
- Use the same layout for Counties, State and SAM.gov, adapting their geography appropriately.

Confirmed follow-up decisions:
1. Saved counties remain fixed after creation; archive and create another schedule to change them.
2. Both active and paused schedules reserve county/work combinations; archive releases them. Eligible deletion also releases them.
3. Selected state sources belong to **one named schedule with shared timing**, not independently created schedules.

## Objectives and boundaries

Provide one understandable editor and reliable server-enforced work reservations. Reuse the existing schedule engine, trigger coordinator, state-source associations, geography resolver, run reporting, preview/save hashes, idempotency and version checks. Do not replace the scheduler, introduce a paid provider or change source collection/import policy. Preserve manual operations, SAM/county automatic imports, validation, duplicate detection, notes/stages, AI settings/budgets, Companies/email previews and unrelated behavior. Bonfire access work remains separate.

This is a real backend extension: the current state-source contract and unique scheduling index support one association, and there is currently **no county/work uniqueness constraint**. A UI checkbox list alone cannot satisfy these requirements.

## Current implementation audit

| Area | Current finding | Required reuse/change |
| --- | --- | --- |
| ScheduledTable/admin.css | Fixed-width columns; schedule-name button can inherit non-wrapping text. Attachment says source name but shows a long schedule name colliding with Geography/Frequency. | Wrap both schedule names and state-source names; constrain buttons/labels to their column. Preserve full text, all ten fields and floating actions. |
| AdminScreen/ScheduleDetail/ScheduleEditor | Admin heading is adjacent to selectable nav. Header has Back to contracts; Back to schedules is a separate button before the title. | Settings as non-interactive context label, proper breadcrumb within the list/detail/editor heading, remove only redundant Contracts-return header action. |
| ScheduleEditor | Common editor exists. choose() uses window.confirm then resets the draft; Schedule target labels; one state association in a select. Saved names appear in heading and input. | Remove type-switch confirmation and silent draft loss. One editable name field. Multi-source selection and shared editor sections. |
| TriggerForm/ScheduleFields | TriggerForm bundles Work, lead categories, windows and ScheduleFields; ScheduleFields bundles name, recurrence and Enabled. This encourages duplicated headings and prevents requested ordering. | Extract small field groups from these existing components; share validation/state, not a second form/recurrence implementation. Preserve other callers. |
| model.initialDraft | Shared manual/schedule initial state is paused, both work flags true and 0–365 offsets; SAM lookback starts at 30. | Add a schedule-only defaults factory; do not globally rewrite initialDraft or overwrite existing/restored drafts. |
| CountySelector/registry | Selection UI uses county IDs/names. Full schedule preview resolves cities, but only after the whole schedule is valid. | Geography display must work before name/cadence/window validation. Reuse registry/resolveGeography with a bounded optional scope projection. |
| procurement-schedules/save and SQL | Shared management advisory lock, versioned mutation, immutable county guard, audit-preserving never-run tombstone. No county/work overlap guard. | Extend atomic save/update/resume/lifecycle validation. Preserve county lock and delete eligibility. |
| county-triggers preview/submit | One state_trigger_id, exactly its single category; state SQL creates one source request using the first county as context. | Normalize legacy single state ID to an array, validate every selected association and create existing child requests per selected source/category. No collection per affected county. |
| State scheduling/status | Unique non-archived schedule index on config.state_trigger_id; status SQL joins that scalar. Scope hash uses scalar plus county snapshots. | Durable multi-association membership/ownership, compatible singleton backfill, grouped status/read projections and hashes. No silent duplicate state updates. |
| Trigger coordinator/reporting | Existing parent trigger already runs multiple child requests, shares AI ledger limits and collects status/evidence. Baseline helper filters each state child by workflow_control.source_id. | Reuse parent/children, per-child source/category restriction and existing reporting, never sum parent plus children or multiply budgets. |

Relevant files: `src/features/admin/{AdminScreen,ScheduleEditor,ScheduleFields,TriggerForm,CountySelector,ScheduledTable,ScheduleDetail,ScheduleList,RunHistory,types,model}.tsx/ts`, `admin.css`, `scripts/lib/{procurement-schedules,county-triggers,schedule-recurrence,schedule-reporting,admin-run-history,workflow-http}.mjs`, latest definitions from migrations `20261013000100`, `20261013000200`, `20261019000100`, `20261019000200`, `20261020000200`, `20261020000300`. Inspect newer wrappers before changing an RPC; do not reinstall an older definition over SAM/public-source fixes.

## Product and presentation contract

### Names, navigation and wrapping

- All user-facing Settings labels use **Type**, **Schedule type**, or **Run type** as appropriate. Values: Counties / State / SAM.gov. Keep internal `target_kind`, existing filter query parameter names and stored values compatible; this is not a database-wide terminology migration.
- Place a small, non-interactive **Settings** context label above the workspace title/navigation, with no button styling, hover affordance or tab stop. Do not leave it inside the row of selectable navigation items. Settings/Profile icons and actual view navigation remain functional.
- Remove Back to contracts from the Settings header only. Retain Contracts stage navigation, and retain existing explicit View leads/results actions and their callbacks.
- Detail/editor heading starts with a breadcrumb, e.g. **Schedules / Pulaski** or **Schedules / Add schedule**. Schedules is the return link with accessible name Back to schedules; the current crumb is text. No isolated Back button stranded above the workspace or beside unrelated controls. Restore the list filters/page/scroll/focus and originating-row highlight. Cancel from edit returns to the same schedule tab; Cancel from add returns to the list. Existing URL/back/reload and owner-context rules continue.
- Heading says Add schedule/Edit schedule rather than repeating the editable name. One Name field at the top; the read-only schedule name remains normal identity on the detail page.
- Long schedule and source names wrap naturally at spaces and, for long unbroken strings, at safe overflow opportunities. Use local `white-space:normal; overflow-wrap:anywhere; min-width:0; max-width:100%` on the actual button/text wrapper, not just the cell. Full names remain readable; no ellipsis as the only access, no fixed row height or text overflow into another column. Test the attachment's long acceptance name plus multi-line source names in list/editor/details.

### Shared editor order and controls

The same structure applies to all three types; unsupported lead/work operations remain unavailable rather than fabricated.

```text
Settings
Schedules / Add schedule

Schedule type   [ Counties ] [ State ] [ SAM.gov ]

Schedule name  [______________________________________]

Frequency     [ Daily v ]      Timezone: Central (CT)
Run at        [ 09:00  x ] [ 14:00  x ] [+ Another time]
              Weekly: day toggles + one time
              Monthly: day-of-month + one time

Lead types    [ ] Forecasts  [x] Opportunities  [ ] Awards
Date window   [ Next 120 days v ]  [custom options]

Geography / sources
[county map + searchable list] OR [state source checklist]
Included geography
  > Saline County (N cities)
  > Pulaski County (N cities)
    expanded: city names from the saved/current registry basis

> Work · Check for lead updates
  [ ] Maintain sources     [x] Check for lead updates

[x] Enabled                  [Save schedule]  Cancel
Next run: <computed CT timestamp, or explicit reason>
```

- No extra Schedule summary heading/count paragraph duplicating Included geography. Put county name and city count in each disclosure summary; expanded content lists its cities. Show Next run once in the scheduling/footer context. Unknown/loading/error is distinct from zero cities.
- The selector remains an existing Arkansas map/checklist for Counties. After selection, show the included county/cities immediately; a name or valid recurrence is not a prerequisite. For saved county schedules show their frozen membership and archive/recreate help, not an editable map.
- Type changes do not invoke confirm/alert or discard common values. Preserve name, recurrence, enabled state, and compatible lead/window choices; retain county and state selections in separate owner-scoped type drafts. Restore each when switching back. SAM-only settings remain separate and cannot leak county/source IDs into a SAM submission. Abort/invalidate prior previews on type change. No mutation, registration, research or provider call occurs merely by switching type.
- New schedules default to Enabled, Check for lead updates only, Opportunities and a 120-day window. The Work disclosure is collapsed at the bottom, with its current selection visible in the summary. Maintain sources remains available; existing saved work selections are preserved, including both flags. Zero work is invalid.
- Schedule-only defaults must not be copied from a manual draft's disabled/both-work/365-day settings. Preserve explicit saved values and previously restored unsaved edits, including intentionally paused schedules. Do not rewrite existing schedules, old snapshots or manual-run defaults.
- Define 120 calendar days explicitly in America/Chicago: county/state future window includes today through day +119; SAM retains posted/modified-date semantics and uses the last 120 days (today minus119 through today). Label direction clearly. Retain category-specific date bases and custom controls. No future SAM posted-date search or conversion of quarter-precision forecasts into invented exact dates.
- SAM uses the same name/timing/lead/date/scope/footer order. Keep existing single-category Opportunities/Awards contract; Forecasts are unavailable for SAM. SAM work is collection/update only, not an invented SAM source-maintenance path. Show Arkansas statewide; do not imply every Arkansas city was separately searched or force a map click. County/city associations shown for state sources are routing context, not verified work locations.

### Compact recurrence interaction

- Reuse `validateRecurrence`, `nextOccurrence` and current timezone semantics: daily1–24 distinct times, weekly selected weekdays with one time, monthly1–31 with one time/short-month clamp. No cron entry or new timezone engine.
- Initial time is already a schedule entry: a normal time input/chip labeled Run at, with an explicit remove icon when multiple entries exist. **+ Another time** adds another editable time entry only; it is visually secondary, beside the time collection, and never looks like an acceptance/save action. Remove the old tall Local time1/Remove time/Add time line-per-control treatment. The existing Save button commits the whole schedule.
- Times update the draft immediately. Keep blank/new/duplicate/invalid times visibly invalid, and block Save; do not silently discard a blank extra row or normalize duplicates into a different schedule. Keep at least one time. Day toggles and monthly day input appear next to the selected cadence; retain concise short-month/DST contextual help.
- Layout should fit a compact horizontal group on desktop and wrap cleanly on mobile, with real labels, adequate touch targets, per-time accessible remove names and stable focus after add/remove. Weekly/monthly still use one time; do not expand capabilities as a styling side effect.

## County/work reservation rule

- Scope of this rule: `county_scope` schedules only. State-source routing associations and statewide SAM must not reserve their related counties or block county schedules.
- Reservation key is **county ID + work kind**, independent of schedule frequency, lead category, date window or schedule name. Work kinds correspond exactly to existing `maintain_sources` and `check_updates`, not Forecast/Opportunity/Award. Do not weaken the rule by including category in the key.
- A schedule selecting both work flags reserves both keys for every selected county. A different schedule for Saline with the other work is allowed; a schedule overlapping even one reserved county/work combination is rejected with the county, work and safe conflicting-schedule identity/link. Never silently remove counties/work or save a partial selection.
- Active and paused schedules reserve keys. Archive/eligible delete release them. Disabled due to an existing owner/scope blocker remains a paused non-archived reservation; a blocker is not an unrequested release. Saved county membership remains immutable.
- Preview returns an early actionable conflict, but SQL mutation must enforce the same rule atomically. Reuse the schedule-management advisory lock and consistent lock-before-row order across save/edit/resume/archive/delete. Validate changes to work and lifecycle as well as initial creation. Exclude the schedule itself on edit. Future APIs or direct private-RPC callers cannot bypass the rule. No new browser table/RPC privileges.
- Prefer a small, service-only reservation projection over existing schedule JSON and an SQL guard under the management lock. A normalized reservation table is acceptable if its unique key and lifecycle maintenance are simpler after auditing current data; do not invent a parallel scheduler. Any reservation record must change in the same transaction as the schedule, never a browser precheck followed by an unprotected write.
- **Preflight existing conflicts before migration/backfill.** Existing test/disposable/user schedules may overlap. Produce a read-only report; do not silently archive, delete, disable, merge or change their work. Current valid schedules must not start failing routine worker timestamp/version updates. If existing conflicts prevent enabling a global constraint, retain this plan in todo and obtain the user's explicit resolution before the conflicting enforcement/backfill is released. Ordinary name/cadence edits must not bypass checks on newly claimed work, nor inadvertently erase a legacy conflict. A migration cannot claim successful enforcement while hiding unresolved collisions.

## One schedule with multiple state sources

### Identity and preview

Keep target kind `state_source`. Add canonical `state_trigger_ids` (sorted, unique saved association UUIDs) and immutable per-selected-association snapshots to the state schedule config. Treat legacy `state_trigger_id` as a singleton input/read representation; existing schedules, standalone state runs and history remain readable/runnable. Preserve singleton compatibility fields where retained callers need them; never take only the first ID from a multi-source selection.

The current state-source list is association/category based, not necessarily one row per physical source. Group visible choices by canonical `source_id`, show the full wrapped source name and supported category information, and resolve chosen lead types to existing association IDs. Every selected source must contribute at least one chosen supported category; every chosen category needs a matching selected association. Show exact coverage instead of silently skipping a source/category or starting generic state research. Missing/inactive/mismatched associations block Save with precise feedback.

Use a searchable checkbox list, selected-source count and removable selections in **one editor**, not a native single-select or one independently saved schedule per source. Include all selected associations in preview/hash/CAS, recurrence expansion and saved scope snapshots. Common name/cadence/work/windows apply to the group. Validate current source associations again on Save and before enqueue. The user has not requested changing existing run snapshots or automatically accepting expanded geography/source sets.

### Membership and scheduling compatibility

The existing scalar unique index and `procurement_state_trigger_status` join must be extended. Proposed minimal durable relation: service-only `procurement_schedule_state_memberships(schedule_id, state_trigger_association_id, ...)` with one current ownership/reservation per association, synchronized transactionally with schedule lifecycle. Backfill legacy singleton membership without changing its ID/recurrence/enabled state; inspect duplicates first. Archived/deleted membership must remain historical or be released without losing the saved config snapshot. Paused schedules retain the existing non-archived ownership behavior. Association/category ownership is separate from the county/work rule.

Update source status, detail/list labels, preview hashes, schedule baselines, geography filters and state-schedule links to use all memberships. Old singleton consumers still show the correct shared schedule link; multi-source rows show a concise source count and full wrapped names in details. Do not duplicate the schedule row for each member or double-count its run/usage.

### Execution and reporting

- Reuse one saved schedule → one occurrence → one parent trigger → existing state-source child requests for the chosen associations. Extend current preview/submission SQL to loop selected source/category associations instead of choosing only one association/first county. Each child retains `source_id`, category, association ID and its own geographic snapshot. No new job engine, scheduler or external service.
- Keep the existing source-only route filter: a state child must never collect an unrelated source. Create no duplicate update per affected county. Reuse existing immutable evidence/import processing and content reuse where supported.
- Preserve existing parent budget/call caps across all children; do not grant each selected source a fresh copy of the budget. Retry/resume uses stable association-based child identity and existing checkpoints, not positional array indexes. A failure or access blocker on source B leaves source A's evidence/results available; do not mark the whole group successful because one child succeeded.
- Baseline helpers already use child `workflow_control.source_id`; extend source/category identity where necessary while preserving SAM wrappers and county behavior. Parent usage/counts remain once-per-existing-reporting-identity; do not sum parent totals plus children. Show source-specific progress/blocker/next action within the existing run detail/evidence views.
- Historical runs retain their original singleton/group config. Scope changes stay explicit under current scope-change guards; no automatic fanout to newly associated sources/counties. Budget exhaustion/uncertain billing stays reconcile-first and cannot be bypassed by splitting work into new children.

## Included geography data contract

Reuse the current county registry, `resolveGeography`, municipality/county links and saved snapshot shapes. Add the smallest bounded read projection if the existing registry response cannot provide cities before full schedule validation (for example, optional `GET /v1/counties?include=scope` with cities/count/revision, retaining legacy fields). No full source catalog or new GIS service is required.

Counties: selected county disclosures update immediately; show a loading/error/retry at the relevant county if scope cannot resolve. State: union counties from every selected association, deduplicate by canonical county ID, then show each county's cities using the same component. Deduplicate city IDs within a county; a municipality legitimately associated with two counties may appear under both. Label associations as routing geography where needed. No header count sentence, repeated summary section or comma-separated county paragraph. SAM remains accurately statewide, with no invented county/city coverage list.

Cache scoped registry reads for the editor session, cancel stale requests and isolate generation by type/selection. Adding/removing a county/source cannot leave another selection's cities visible. Saved county identity and changed revision guards remain authoritative; a displayed city list must not silently revise the schedule.

## Implementation sequence (one build-code unit)

1. **Audit and policy/membership contracts.** Inventory current duplicates and scalar state consumers; define compatible config/DTOs and private membership/reservation changes. Add forward migrations and atomic conflict/lifecycle tests. Resolve existing conflicting schedules with explicit user direction before activation. Keep all unrelated deployed migrations intact.
2. **Multiple-state execution integration.** Extend existing preview/save/enqueue/submission/status/baseline/read projections for grouped sources, reusing parent/child coordinator and budgets. Preserve legacy singleton routes. Test native SQL, idempotent retries, partial failures, overlap, ledger/receipt counts and schema privileges before UI consumes the extension.
3. **Unified editor/navigation presentation.** Extract and reuse field groups; implement type drafts/no confirmation, single top name, compact recurrence, lead/date controls, immediate included geography, multi-source checklist, bottom Work/Enabled/save. Update Settings/breadcrumb labels and wrapping across list/details/source selectors. Retain the current uncommitted visual correction and existing forms' behavior outside this scope.
4. **Integrated acceptance and release preparation.** Complete the verification below, capture actual app screenshots for all types, document defaults/backfill decisions/migration order and exact remaining blockers. Move to done only when required checks pass. This planning request authorizes no commit/push, shared migration or release. On a later authorized release: migration/compatibility first, Render backend first, Netlify preview second; preserve production deployment ID/lock and never publish Production Netlify.

## Verification and acceptance

- **Wrapping/layout:** exact long name from attachment, names with punctuation/unbroken IDs, multi-line source names; 1440/1024/390/320px; all fields/actions readable, no overlapping adjacent cells, menu row geometry unchanged and no document overflow. Visually inspect screenshots of actual list/detail/editor, not just the mockup or no-overflow assertion.
- **Terminology/navigation:** Settings is context text, not a menu button; no Back to contracts header control; Contracts stage remains reachable. Type visible throughout Settings while APIs stay compatible. Breadcrumb return restores list and originating row; edit Cancel restores the same tab. Deep links/reload/Back/Forward/sign-out owner clearing still work.
- **Editor defaults/order:** exactly one name input; name → recurrence → lead types → window → scope → collapsed Work → Enabled/save. New schedules enabled, updates-only and120 days. Existing/restored disabled/both-work/custom-window schedules unchanged. Manual defaults untouched. SAM window is past-facing and bounded, not a future publication window.
- **Recurrence:** daily one/many24 times, duplicates/blank values/removal/focus, weekly multiple weekdays/one time, monthly29–31 short months, CT DST gap/fold. Another time adds an entry without saving; Save persists the shown complete schedule. Keyboard and touch users can infer this from the control layout, without a paragraph explaining Add time.
- **Type changes/geography:** no confirm dialog or silent common/per-type draft loss; no stale preview wins; no source IDs in SAM. Selected county cities appear before a name is entered, with live selected counts, zero/loading/error distinction and shared-city memberships. State union deduplicates counties and shows disclosure city counts without duplicate headers.
- **County/work rules:** active and paused same-key conflicts rejected; different work allowed; both-work reserves both; multi-county partial overlap rejects whole save; category/window/frequency/name differences cannot evade the rule. Edit existing work, archive/delete release, resume conflict, immutable counties, actor/auth/version/idempotency and concurrent saves/resumes covered in SQL/native HTTP tests. State/SAM do not claim county keys. Legacy conflicts are reported and never silently altered.
- **Multiple state sources:** save one group; all selected associations captured, checked and dispatched once; no last/first-only selection bug. Same physical source/category deduplicated; mixed supported categories validated explicitly. State status/shared schedule links, history, geography filters, baselines, source A success/source B blocked, active overlap, leases/retries/resume/cancellation, reconcile-first usage and fixed parent AI budget tested. Legacy singleton and SAM paths continue to pass.
- **Automation:** affected React, service/HTTP, SQL and native PostgREST/access suites; `npm run check`, `npm run test:access`; extend existing `tests/integration/admin-ui-browser.mjs --schedule-revision` fixtures for grouped states/work conflicts/defaults/type switching and compact time controls. Use disposable fixtures; no real imports, work runs or deletion of user schedules for layout testing.
- **Release readback:** only after authorization, verify exact schema/commit/assets and safe authenticated list/detail/preview/history plus anonymous/private-RPC denial. Browser checks are read-only/background preview unless a specific disposable-run acceptance is authorized. Keep Netlify production unchanged.

## Decisions and remaining implementation checks

The user confirmed the three policy choices above; no unanswered product question blocks this plan. Remaining checks are technical/data-dependent: inventory existing conflicting county/work and state memberships, verify latest SQL wrappers, and choose the smallest compatible reservation/membership implementation. Do not treat unknown legacy conflicts as permission to modify them. If resolving a real conflict requires choosing which existing schedule to archive/change, present that concrete choice to the user before mutation and keep acceptance incomplete until resolved.

## Implementation and verification — 2026-10-20

Implemented over the existing uncommitted visual correction. No existing schedule, manual-run default, import policy, notes/stages, budget, Companies/email-preview feature or Bonfire access workflow was changed.

- Settings context/breadcrumbs and Type terminology; wrapped list/source identities; retained list filters/focus/highlight and schedule/run navigation.
- Reused extracted lead/window/work groups and recurrence controls. New schedule-only defaults are enabled, updates-only and120 CT days; saved/restored values remain authoritative. Daily times are immediately editable with explicit Another time/removal and blank/duplicate validation. State/County selections survive type switches; SAM submissions remain independent.
- Optional county scope read returns cities without full-form validation or source catalog reads. Shared Included geography disclosures show selected/union counties and city counts; saved county membership remains locked.
- Forward migration `20261020000400_schedule_work_and_state_groups.sql` adds private work reservations and association membership, transactionally synchronized under the management lock. Save/control/enqueue/delete follow lock-before-row order. Preview conflicts identify/link the owning schedule; SQL rejects overlapping active/paused work atomically. Archive/eligible delete release ownership.
- Grouped state schedules canonicalize association IDs and freeze source/category/routing snapshots. Submission revalidates association snapshots and creates one existing request/job per association beneath one parent. Scalar legacy schedules and SAM wrappers remain compatible. Existing baseline/source filters, parent budgets, reconciliation and approval behavior are reused. Grouped run selection identifies individual sources.

Read-only shared-data preflight found one current schedule, Pulaski, and zero county/work conflicts. No state-schedule ownership collision was present. No schedules were changed. Migration preflight aborts on conflicting legacy data; recheck before later release.

Verification receipts are retained under ignored `outputs/deployment/admin-revision/editor-*` and `outputs/deployment/admin-ui/revision-*`:

- `npm run check`: lint, 104 React tests, 352 workflow tests, actual constraints/import SQL regressions and build passed. Subsequent focused workflow regressions covered reservation variants, grouped dispatch/replay, association ownership, partial outcomes and shared four-call/reconcile-first billing. Final React regression: 105 passed; focused editor: 9 passed. Final lint/build and native readbacks passed. The existing Vite large-chunk warning remains.
- `npm run test:access`: real disposable PostgreSQL15/PostgREST migration, concurrent active/paused ownership, grouped state dispatch/replay/status, private table/RPC denial, existing county/SAM imports and protected sales fields passed. The grouped-state fixture uses a separate disposable account to preserve the existing hourly run limit.
- Real Edge browser fixture acceptance passed at1440/1024/390/320px: list/name wrapping, floating action geometry, detail tabs/context/focus, immutable saved counties, type drafts without dialogs, city disclosures before naming, multi-source union, schedule defaults, compact times and keyboard/touch navigation. Actual screenshots were inspected; cramped time inputs/default fieldset borders were corrected and reverified. No real collection/import/deletion was performed.
- Under simultaneous heavy database/browser workloads an initial browser load and one repeated React run timed out. After separating workloads/limiting React worker concurrency, acceptance passed; timeouts and application rate limits were not weakened.

No product decision remains open. Release is pending separate authorization: recheck preflight, apply004 after003, deploy matching Render first, then Netlify preview and safe authenticated readback. No shared migration, commit/push or deployment was performed. Netlify production remains unchanged.

Proposed commit: `feat: streamline schedule editor and work scopes`.
