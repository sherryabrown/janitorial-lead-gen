# Phase 3: Clear User/Admin scheduling workspaces and final release acceptance

Parent and initiating prompt: [Scheduling release clarity plan](00-scheduling-release-clarity-and-source-resolution.md). Depends on [phase 1 authorization/contracts](../done/01-scheduling-roles-and-source-decisions.md) and [phase 2 source resolution](../done/02-scheduling-guided-source-resolution.md). Confirmed: shared team schedules/leads; Users create/edit/pause/run schedules; Admins repair sources and manage technical work; No website/Won't address skips affected checks until an Admin explicitly re-enables them.

## Objective and navigation

Deliver one final Scheduling release built around Results, Sources and Schedule changes. Keep schedule scope in a compact setup disclosure and detailed logs/GIS under contextual Admin technical detail. Sources and Needs attention open the same repair workspace. Avoid creating separate User/Admin copies of the scheduler or divergent source-state logic.

### User experience

- Schedule list defaults to business information: name, location, next run, latest result, with a concise limitation indicator where relevant. Keep existing filters/pagination and truthful empty/error states.
- Results defaults to one selected run and its verified lead outcomes. Show a short source-impact explanation when relevant, the responsible role, and a primary View leads action. Preserve category/identity drilldowns and make unknown/partial totals understandable.
- Show recent run attempts below the result. Preserve skipped/blocked/no-run attempts as distinct from actual runs; they do not acquire fabricated steps, results or durations.
- Explain a run using short business stages where facts support them. Full step tables and raw diagnostic terms do not become the ordinary progress view.
- Sources shows the websites supporting this schedule now, with a relevant last check/state. A source assessment and a historical run result carry explicit time/scope labels. User action is View status where appropriate; do not show a nonfunctional Repair or contact-admin action that sends nothing.
- Schedule scope shows saved counties/cities or statewide SAM scope on demand. Explain a material saved/current difference only where relevant. Do not suggest that mapped places establish verified service coverage.
- Schedule changes gives readable before/after values, actor and time. Display human-readable actor labels when available, without exposing other users' private profile data; keep historical unknown actor honest.
- Users can create, edit, pause and run schedules in the existing shared team workspace, subject to current activity/ownership/version/scope checks. Source repair, technical controls and re-enabling excluded checks remain Admin actions. Explain excluded sources before Run now so Users know what will be checked.

### Admin experience

- Add a small Admin entry for Needs attention and current source management, visible only with verified capability.
- Needs attention defaults to unresolved work with columns such as **Source / problem**, **Impact**, **Responsibility**, **Action**. Keep reviewed outcomes in a secondary filter/list. Do not use a giant table of reason codes, UUIDs, stages and unknowns.
- Use the same phase-1 item ID/decision projection from all entry points. Keep categories/locations distinct where necessary, and group repeated observations only when they share a confirmed problem identity.
- Review source opens the phase-2 workflow. Completing a decision refreshes that item and the related summary, retains filter/order/context, and offers the next unresolved source without returning to an unrelated dashboard.
- Technical details links to the relevant run/step/source evidence, with errors or the relevant step initially focused. Detailed success steps, timing/AI usage, references and GIS method evidence stay accessible on request. Do not repeat a meaningless `Next: Not recorded` on every log row.
- No-website/no-issue/won't-address states show what was decided and by whom; they do not all become a green fixed status. No website/Won't address clearly show **Checks disabled by admin decision**, coverage impact and the Admin Re-enable action. No issue leaves check eligibility unchanged. Reopening a review alone does not silently re-enable a check.

## Concrete code changes

1. `AdminScreen.tsx`, `navigation.ts`, `breadcrumb-context.ts`, `run-breadcrumbs.ts`: adapt visible sections/labels and Admin entry while retaining safe canonical navigation and existing location restoration. Keep backend recurrence/workers out of the UI refactor.
2. `ScheduleDetail.tsx`, `ScheduledTable.tsx`, `ScheduleHistory.tsx`: render the three primary sections, readable setup/scope and schedule changes. Preserve current paused/archive/never-run behavior and owner/version constraints.
3. `ScheduleActivity.tsx`, `RunHistory.tsx`, `RunDetail.tsx`: own one selected run, stable summary and attempt list. Compose business result, source review and technical detail from shared state; do not mount multiple hidden full reports/independent run selectors.
4. `RequestReview.tsx`, `source-results.ts`: consume the shared presentation contract and phase-2 workspace. Remove duplicate issue/source tables from the ordinary experience once equivalent data/actions are accessible. Keep required candidate validation, manual approval and uncertain-import reconciliation flows available to their authorized audience.
5. `Catalog.tsx`, `SourceReview.tsx`: retain current registry, supported reviewed operations and useful GIS/evidence under an intentional Admin drilldown; reuse the new guided repair entry. Do not delete these capabilities simply because they leave the main navigation.
6. `RunStepLog.tsx`, `model.ts`, `types.ts`, `admin.css`: move technical rows behind disclosure; replace raw/default state prose with tested labels. Use fixed public copy, actual timestamps and safe links. Keep neutral styling and one clear primary action.
7. Use the phase-1 capability reader, derived from existing `public.profiles.role` and its Auth relationship, for entry gates and server-authorized actions. No separate procurement role list or legacy membership gate is introduced. Role/scope changes clear privileged cached panels. A User direct link to an Admin-only view shows a safe explanation/return action and performs no privileged read.

Old URL compatibility must be explicit and tested. Map History to Schedule changes, Logs to the permitted selected-run detail, and Geography to read-only saved scope or the permitted Admin detail. Do not open a mutating editor merely to replace a read-only geography link. Retain run/schedule/source identities, Back behavior, breadcrumbs, focus and filters. Existing links must not become a permission bypass or silently switch to a different run.

## Content and state inventory

Before building screen layouts, approve a compact inventory covering at least:

- Never run, queued, running, stopped, completed, completed with source gaps, and uncertain operation.
- Source checked with matches, checked without matches, checking, no verified website, unsupported listing, unavailable site and access needed.
- Fixed and verified, recorded no website, reviewed no issue, accepted won't-address, needs developer and any explicit check exclusion.
- Scope drift, no readable historical actor/timestamp, archived schedule, unavailable historical evidence, read failure and permission loss.

For each, specify exact heading, impact sentence, available action, role, responsible party and evidence basis. An unknown state must map to a readable limited-information state, not title-case an internal enum. Category entry capture and actual opportunity checks retain separate facts.

## Acceptance scenarios and release freeze

Validate a small reference prototype or rendered fixtures using the scenarios below before coding the final layout. Use representative states, not only a successful empty run. The same fixtures become automated acceptance cases, preventing another subjective round of restructuring.

| Scenario | Expected understanding/action |
| --- | --- |
| User opens a partly successful county run | Finds saved leads and understands the missing source scope without reading a log |
| Admin sees an unknown bid site | Supplies an official URL, sees verification/apply result, continues in context |
| Admin records each requested review outcome | Understands difference between verified fix and review/accepted gap; no repetitive unreviewed duplicate |
| User runs or edits a schedule containing an excluded source | Affected check stays excluded; other checks continue; only an Admin can explicitly re-enable it |
| Portal requires unsupported automation/access | Admin understands the limitation and developer/operator responsibility without a technical form |
| Admin fixes a source used by several schedules | Sees shared impact before applying; unrelated sources/schedules and old run snapshots remain intact |
| User views a reviewed gap | Sees truthful effect and admin decision without a false complete-coverage indicator |
| Import outcome is unknown | User sees limited status; authorized Admin uses existing reconciliation before any resend |
| User forges Admin route/role or guesses an ID | Server/database deny access; no private content or action leaks |
| A new run arrives while an older run is open | Current selection remains stable, with an explicit way to view the newer run |
| Back, refresh, mobile, keyboard and role change | Retained context/notes, correct focus, one clear next action and no hidden polling |

Release gate: at least one representative nontechnical User and one representative Admin can state the result, impact and correct next action from these fixtures without developer coaching or raw logs. Record actual observation; do not invent user testing. Proposed acceptance target is correct interpretation within about 10 seconds for ordinary list/summary states, not a performance guarantee. Final business sign-off on the reference states freezes structure/copy; remaining work fixes observed failures rather than redesigning navigation again.

## Verification

- Component/helper tests for shared vocabulary, safe links, each role/action, every disposition, counts and uncertainty, preserved notes, old links and failed-read retries.
- Extend existing `ScheduleActivity`, `DetailHistory`, `DetailClarity`, `IntegrationRemediation`, catalog/metric, navigation and efficiency regressions rather than creating duplicate behavior suites.
- Native PostgreSQL/PostgREST tests for enforcement of existing profile roles, direct data access, source-decision audit/CAS/replay, scoped exclusions and Admin-only re-enable, URL verification/apply/readback, worker lease sharing and import protections. Include missing/malformed profiles, prevention of self-promotion and independence from legacy membership. Prove repeated scheduled runs, rediscovery/retries, ordinary User Run now and schedule edits honor exclusions without stopping unrelated sources; No issue must not disable checks.
- Real app browser tests with User/Admin sessions: desktop, 390px, 320px, 200% zoom, keyboard-only, long names, offline/slow/error/permission-loss states. Verify meaningful names, focus, non-colour status meaning and no page overflow.
- `npm run check`, `npm run test:access` and extended existing browser harness after final relevant changes.
- Retain inactive-view polling suspension, single in-flight GET sharing, incremental mutable-step logs, choice projections and bounded reads. Results/source review must not reload all immutable evidence per poll or start source collection merely from a read.
- Reconcile every live/repository/proposed `procurement_*` table against phase 1's purpose register and remediation manifest. Require a distinct operational or explicit retention need for retained tables, verified dependency/data migration for consolidated/retired tables, and a reuse assessment for new storage. Unresolved consumers or unexplained duplication block this release gate; passing UI tests alone does not satisfy it.

## Implementation and automated acceptance record — October 28, 2026

Implementation is complete for the isolated dev preview. Users have Results, Sources and Schedule changes, safe Bid website details, preserved schedule actions and truthful business status. Admins use one canonical source review workspace from the schedule or Needs attention; technical logs/configuration are disclosed separately. Trusted profile capabilities gate mounting and are refreshed on visibility/focus; confirmed role loss clears privileged panels/drafts. Saved selections, legacy links, failed-step focus and inactive-view read suspension are preserved. The first-load run-selection race is fixed without increasing test timeouts.

Current setup and selected-run facts have separate labels. Pending checks do not imply an issue. Decisions, actors, exclusions and developer responsibility remain readable; later successful checks retain review history. Bounded projections reuse existing tables and preserve review identity across website registration and first/replacement listing methods. The procurement audit remains at 41 post-retirement base tables with no duplicate issue/role storage.

The full release gate passed lint, 201 UI tests, 406 workflow tests, both SQL scripts and TypeScript/Production build before final targeted refinements. Final component/layout and SQL receipts accompany this phase commit. Native PostgreSQL/PostgREST verifies actual profile permissions, protected role edits, membership archive/retirement, guided verify/apply/readback, scoped exclusions, schedule/lease/import protections and unchanged historical/user lead fields. A rolled-back native entry/history fixture confirms final lineage and queue behavior. Actual browser acceptance exercises the application against the isolated local API/database, including guided repair, role denials, keyboard, 1440/390/320px and 200% zoom. See [preview and verification guide](../../docs/reviews/2026-10-28-scheduling-dev-preview.md) and [reference states](../../docs/reviews/2026-10-28-scheduling-reference-states.md).

**Remaining external release gates:** representative nontechnical User/Admin interpretation and explicit authorization for coordinated Production cutover. Automated testing does not claim human acceptance. No live migration, Render deployment or Netlify Production deployment was performed. Phase 1 and 2 specs are in done; this phase and the parent stay in todo until their agreed complete release gate is satisfied. This is a documented rollout hold, not missing implementation or unanswered business-policy questions.

Final regression qualification **resolved**: the complete standard `npm run check` passes 203 UI tests across all 27 files, 406 workflow tests, both SQL gates, lint and the TypeScript/Production build. Form/fieldset-scoped accessible queries avoid repeatedly scanning the 75-button map, and Save-button state waits reuse the mounted control. The real map, debounce, assertions and original deadlines remain unchanged; no retries or skips were added. The affected two suites pass all 40 tests, with an observed combined run time reduction from 40.55 to 29.98 seconds on this host. The previous UI timing hold is cleared; actual User/Admin acceptance and authorized Production cutover remain open. See `outputs/deployment/scheduling-preview/full-check-timing-fixed.log` for the final full-suite receipt.

## Coordinated rollout and completion

Use the prepared [production cutover runbook](../../docs/reviews/2026-10-28-scheduling-production-cutover.md). It does not authorize execution. Keep this phase open through real acceptance, restored-clone rehearsal, approved coordinated release and live readback; do not treat preparation as deployment.

Prepare the exact schema/API/UI compatibility, existing profile-role verification, migration/backfill, live verification and rollback checklist before requesting any missing release authority. Reuse the existing trusted profile-role assignment process; do not create a procurement-specific role bootstrap. Follow the repository's established Render/backend then approved Netlify preview process; preserve existing production audience/lock and do not infer authority to publish production from this planning request.

The backend must enforce the new permissions from `public.profiles.role` before the new UI is considered released. Preserve needed old projection compatibility during rollout, but never keep an old mutation route open to Users merely for cosmetic backward compatibility. Verify existing Admin profiles and authorized User access before exposing the new controls. Any retirement of `procurement_members` requires its own dependency/readback checklist; do not bundle an unchecked table drop into a UI rollout.

After authorized deployment, verify role-denied and allowed reads/actions with real scoped accounts, one bounded source-decision/repair scenario and authentic persistence readback. Any live collection, import, external handoff or test schedule must have its applicable authorization; no bulk historical resumes, surprise messages or extra provider spend. Rollback preserves additive audit/evidence and safe permissions; it does not reopen User access to Admin actions.

Document exact deployed versions, migration IDs, test receipts, final table-purpose inventory/dispositions and known source limitations. Move all accepted child specs and parent to `specs/done/` only after the complete agreed release gate, including the procurement table audit and its agreed remediation. Unrelated efficiency and local output-file retention work remains in its existing follow-up file.


### Backup and isolation follow-up (October 28, 2026)

The narrow migration-history exception is approved, but production cutover is not. See [backup/restore evidence](../../docs/reviews/2026-10-28-scheduling-backup-rehearsal.md): synthetic native restore/atomic rollback/retry passed; all seven deployed Edge Function source exports passed encrypted file recovery verification; all 116 public database routine definitions were exported and all 2,013 private Storage objects passed independent encrypted-byte recovery. The actual production database backup/restore, isolated Edge runtime deployment, Storage recovery and independent secret/key recovery remain release gates. Current pooler settings match the owner-provided string; direct access is blocked by missing IPv6 routing. The direct read-only database credential probe was rejected. Keep this spec open until production recovery and release acceptance gates pass.


October 29: [manual export inspection](../../docs/reviews/2026-10-29-manual-backup-inspection.md) confirms the owner-provided folder is unchanged. A partial native restore of 102 source rows passed; missing Auth/type/security exports, membership and populated procurement tables prevent complete snapshot recovery. Release acceptance remains open.
