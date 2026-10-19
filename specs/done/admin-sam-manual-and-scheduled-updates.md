# Admin SAM manual runs and scheduled updates

## Initiating prompt

> $plan-code please add SAM to the Admin screen so I can run it manually and schedule updates. Reuse the existing SAM backend and keep it separate from county searches.

Planning date and completion: October 19, 2026. Implemented, verified, committed and pushed; released to the existing Supabase/Render infrastructure and approved Netlify draft preview under explicit user authorization. Netlify production unchanged. Live acceptance passed; see [deployment evidence](../../docs/ADMIN-SAM-DEPLOYMENT.md).

## Outcome and scope

Add a concise **SAM.gov — Arkansas statewide** section to Admin, independent of the county map and State sources. Users can run SAM manually, create/edit/pause/resume/run/archive its schedules, inspect progress and saved evidence, and review candidates through the existing exact-package import workflow.

Reuse the existing SAM service, private Supabase function, tables/storage, shared worker, scheduler, recurrence controls and authentication. This is an extension to the deployed architecture, not a replacement scheduler, new provider integration or migration of the backend into another hosting platform.

Preserve county/city searches, state-source associations, queue behavior, Bonfire access gates, Companies, email previews, existing credential resolution, AI configuration/budgets and canonical field protections. SAM must never be enqueued by selecting a county, county research or state-source discovery. No Production Netlify deployment under this plan.

## Current implementation and gaps

| Component | Existing behavior | Required change |
| --- | --- | --- |
| `scripts/lib/hosted-sam.mjs` | `statewideSam.submit` accepts one `opportunity` or `award` category and explicit `publication_window`; fixed AR work-state and NAICS 561720 filters. Durable collect/reconcile/stage/review checkpoints, saved artifacts and immutable candidates. | Reuse submission, paging, staging and packet logic; add only missing orchestration/audit/reconciliation bindings. |
| `supabase/functions/sam-search/index.ts` | Private server-to-server SAM opportunity/contract-award API capture with audit and credential redaction. | Preserve endpoints, filters, credential handling and 100-row/10-page worker bounds. No frontend key or direct upstream request. |
| `workflow-http.mjs` | `POST /v1/sam/requests`, `GET /v1/sam/requests/:id/packet`, generic request/status/control and reviewed import routes already exist. | Preserve existing direct SAM clients. Add an Admin parent submission binding through shared trigger routing, and bounded request history/readback where missing. |
| `submit_procurement_sam_request` | Creates one request/job atomically and idempotently, with hourly request limit and actor binding. | Reuse its transaction inside Admin parent/occurrence creation; do not create an alternate job producer. Existing manual callers stay compatible. |
| `procurementSchedules`, recurrence helpers and scheduler Cron | Durable daily/multiple-times, weekly and monthly occurrences, versions, replay, inactive owners and pause gates. Enqueue currently calls county/state `submit_procurement_trigger`. | Add a distinct SAM target dispatch using the same schedule/occurrence/worker infrastructure. A UI button alone cannot schedule SAM. |
| Admin types/forms/lists | County/state-source configuration and activity; no SAM section. | Add separate SAM controls and target-aware labels/editing/activity, retaining county draft/context. |
| `RequestReview` and `hosted-import-jobs.mjs` | Generic review currently submits `run_ids: []`. SAM import preparation requires the exact saved SAM run IDs and matching current candidates. | Add a SAM review adapter; do not send SAM candidates through the generic category-packet form or omit their run binding. |
| `workflow-audit.mjs` | Parent/child request links attach audit steps and pause/cancel enforcement to Admin runs. | Link SAM requests to their own parent without fictitious counties and audit SAM external stages. |

Read pertinent existing tests: `tests/hosted-sam.test.mjs`, `hosted-workflow.test.mjs`, `hosted-workflow-sql.test.mjs`, `procurement-schedules.test.mjs` and scheduling/trigger SQL tests (locate exact current filenames), current import/SAM tests, and `src/features/admin/{AdminScreen,AdminReview}.test.tsx`. Reuse `tests/integration/admin-ui-browser.mjs` and isolated `test:access` acceptance.

## Product decisions for implementation

- One category per manual run/schedule, matching the existing backend: **Opportunities** (default) or **Contract awards**. Users can save separate schedules for each. Do not expose Forecasts or silently run both categories. Opportunity notices still retain their actual source notice classification; an award notice is not automatically an open solicitation.
- Fixed scope: Arkansas work location and the existing janitorial NAICS filter. No county selection required, no county coverage credit, and no new geographic/service filter editor. Explain this once next to the controls.
- Manual default: **last 30 calendar days, including today**, editable dates. This is a proposed SAM-specific default; the county screen's next-12-month deadline default remains unchanged. Label opportunities **Posted dates** and awards **Last modified dates**, matching existing filters.
- Scheduled default: rolling last 30 calendar days through occurrence effective date, with editable lookback. Use Arkansas `America/Chicago` calendar dates and the existing DST/month-end rules. Never reuse deadline/renewal windows or search future publication dates as an implicit default.
- Show the resolved category, scope, actual dates and next occurrence in existing confirmation UI. Freeze the resolved window on the occurrence so acknowledgment loss/restart cannot shift it. New schedules start paused, consistent with Admin today.
- Cadences match existing Admin: daily with multiple times, weekly with chosen days and one time, monthly with one day/time and current short-month behavior. Keep county selection/draft intact while editing SAM.
- Missing credentials, provider denial/quota, unavailable awards access, partial captures and uncertain outcomes have distinct safe actions. Availability of one SAM category is not proof that the other works.
- No automatic lead imports. No new access restrictions beyond current authentication. Preview/live results must distinguish captured records, candidates, imported leads and complete/partial coverage.

## Phase 1 — Shared target, persistence and execution

1. Read current SAM, scheduler, trigger, workflow/audit and import code before editing. Inventory existing SAM request/candidate history using safe projections if live readback is needed; do not start upstream calls merely to inspect configuration.
2. Introduce `target_kind: 'sam'` as an explicit shared Admin target. Recommended canonical shape:

   ```text
   target_kind: sam
   requested_categories: [opportunity | award]  # exactly one
   scope: Arkansas statewide, existing janitorial filters
   publication_window: {from, to}              # manual resolved window
   ```

   Scheduled storage uses a rolling lookback policy, resolved to the existing `publication_window` input. Canonical hashes include target/category/scope/window policy. Reject county IDs, city selections, state-trigger IDs, source-maintenance flags and arbitrary upstream filters for SAM. Do not reinterpret old stored county/state configs.
3. Extend existing trigger preview/submission/dispatch with a SAM branch before county validation. Preview must not call SAM. Reuse the existing `statewideSam.submit` validation/filter builder and `submit_procurement_sam_request`; factor a small shared pure input normalizer if needed rather than copying filter/date logic into SQL, scheduler and UI.
4. Add forward-only migrations for the minimal shared-schema changes: trigger target constraint, a SAM child-link role, and nullable geographic fields with checks requiring real county IDs for existing county roles and no county for SAM. Inspect step/association constraints too. Never substitute a fake county, attach SAM to county targets or put it in state-source discovery associations.
5. Create parent, SAM request/job, request link and occurrence binding atomically. Reuse the existing SQL submission function inside that transaction and preserve existing direct `/v1/sam/requests` semantics. Failure must not leave an orphan request or an occurrence falsely marked queued. Persist category/actor/origin/schedule/occurrence references and stable idempotency keys; replays return the original request/run.
6. Extend `procurementSchedules.preview/enqueue` and `enqueue_procurement_schedule` with target-aware dispatch. Keep existing tables, private Cron tick, five-due-schedule batch, recurrence math, owner checks, version checks, dedupe and missed-occurrence policy. Use a target-specific stable scope hash; do not require `config.counties` for SAM. Do not add a second Cron, worker loop or schedule table.
7. Extend parent status/counts/completion and schedule baseline logic to understand SAM saved run/checkpoint evidence instead of category coverage tasks/public captures. `sam_review` is collection complete/needs review, not a fetch failure. It need not prevent later updates merely because a candidate awaits import. Active collection, uncertain upstream attempts or import uncertainty retain the existing overlap guards. Expose original SAM request IDs/history with bounded pagination; retain direct pre-Admin SAM history separately where no parent exists, without fabricating parent records.
8. Preserve existing SAM pagination, terminal detection and partial outcomes. Server-side date validation must match documented provider contracts. Opportunities allow at most a one-year posted-date span; verify the awards endpoint's distinct range and offset rules before choosing its maximum. Do not silently change both adapters to one assumed pagination contract. Existing page bounds remain limits, not proof of complete statewide coverage.
9. Use existing audit phases around each SAM API page, staging, link resolution and import/readback as applicable. Link parent before worker execution so audit and pause/cancel guards apply from the first call. Recheck scheduled runnable/cancellation state before the next external stage, including award-link requests; a mid-flight response may finish saving but must not start the next call after pause. Native serialized worker/leases remain authoritative.
10. Preserve `sam_reconcile` before external sends. Add a narrowly scoped existing-action continuation if required to reconcile actual audited response/run artifacts into that same saved request. Unknown outcome cannot trigger an automatic resend, a fresh manual request on acknowledgment loss, or a new scheduled fetch masking the unresolved attempt. Use stable original identities, bounded evidence and compare-and-set updates. No client-provided capture JSON as proof.
11. Record actual non-AI usage as zero; if future existing inference is genuinely invoked, use the current ledger and parent limits. Do not invent tokens/credits or mark a SAM API call as AI. No added inference or change to monthly/request settings in this feature.

## Phase 2 — Admin controls and saved-result review

1. Add a clearly separate **SAM.gov — Arkansas statewide** section in `AdminScreen.tsx`, independent of county registry loading and selections. A registry connection error must not disable otherwise available SAM controls. Reuse existing visual classes, form controls, buttons, notices, mutation identities and authenticated HTTP client.
2. Add a focused SAM form/component and discriminated target types rather than forcing SAM into `county_ids` or scattering county-null assumptions through every component. Keep category/window policy separate from recurrence so the existing cadence editor is reusable. Use existing confirmation and preserve county/manual/state-source editor context and restored session drafts.
3. Offer **Run now** and **Save schedule**. Show only the active form/confirmation, with safe retry identity preserved until acknowledgment. After submission, reveal its saved run immediately in context; next actions are progress, evidence/candidates and existing leads. No navigation to a hidden queue is needed.
4. Extend shared schedule/activity rows and `RunDetail` labels with target-aware rendering: SAM category and statewide scope, never “0 counties.” Editing a SAM schedule restores a SAM form. Keep correct paging when distinguishing SAM and county/state rows; do not client-filter only the first page and falsely claim no SAM history. Existing schedules and county source associations remain visible and unchanged.
5. Show safe stage, page/record counts, terminal/partial status, usage, blocker and exact continuation action. Avoid frequent polling once blocked, review-ready or terminal. Schedule actions use current expected versions and occurrence IDs; concurrent edits reload instead of silently overwriting scope. Pause/resume/run/archive keep the existing explicit behavior.
6. Fetch saved SAM review using `GET /v1/sam/requests/:id/packet`. Display category, resolved window, captured pages, actual record/candidate counts, source evidence and work-site/date/classification review. Handle partial data and unavailable packets without inventing a successful empty run.
7. Reuse `RequestReview` import controls through a small SAM adapter or shared review component. Import preparation must pass the exact SAM `run_ids`, chosen intake IDs/current hashes, explicit review decisions and partial-capture authority where the existing package requires it. Reuse native package testing, exact tested hash approval, current-hash recheck, reconciliation and verified readback. No automatic promotion/import, no fake county coverage, no new import engine. Preserve source/canonical identities and user-maintained sales fields across overlapping SAM updates.
8. Do not add credential fields, API keys, raw artifacts or backend secrets to the frontend. Existing bearer authorization/CORS boundaries apply. API status/error messages must be safe even if upstream diagnostics contain sensitive values.

## Phase 3 — Verification, rollout evidence and documentation

### Automated and browser checks

- Extend current SAM tests for manual validation/filters and unchanged direct clients; preview sends no provider call; opportunity versus award filters/date bounds; current record IDs and notice classification; category-specific credential/quota failures.
- Extend native SQL/scheduler tests for atomic SAM parent/request/job/occurrence creation, CAS, idempotent lost acknowledgment, two concurrent ticks, inactive owners, paused/archived schedules, no county link, exact frozen windows, overlap/uncertain guards, and failure rollback. Existing county/state scenarios must still pass.
- Exercise DST, multiple daily times, weekly/monthly and short-month cadence through shared recurrence tests; avoid copying already adequate recurrence tests into a new harness. Add SAM-specific rolling calendar lookback cases.
- Saved page/candidate hash readback, restart/second-page recovery, max-page partial state, zero versus nonterminal empty, stage replay/no duplicate intake, canonical dedupe on repeated imports, paused/cancelled next-stage prevention, and no automatic retry after unknown response.
- Review/import tests must prove that omitted/stale/foreign SAM run IDs cannot prepare an import, prior user fields remain protected, exact approval hash is required and unknown outcomes reconcile without reapplication.
- UI tests for independent county/SAM state and load failures, form restoration, no forecast, manual/scheduled confirmations, all schedule actions, target labels, paging, clear errors, actual usage and no secret exposure. Include existing SAM history without fabricated county activity.
- Run `npm run check`, `npm run test:access` and the extended existing fixture browser checks. Inspect desktop, 390px/320px and keyboard/focus behavior; confirm no horizontal overflow and preserved county selection. No production API call/import in the fixture harness.

### Live acceptance and deployment boundary

Implementing the plan does not authorize changing hosting architecture or Netlify production. Reuse the existing Render backend, Supabase Cron/tables/functions and the approved Netlify preview connection. Record any necessary backend/function/migration release as an explicit deployment prerequisite; do not claim local fixtures establish live scheduling.

For live acceptance, use the smallest useful Arkansas publication/modification window and existing private credentials. One scoped manual opportunity run and award-category check must either save/read back real evidence or retain a precise provider permission/quota blocker. Do not replace real denial with a mocked success. No new subscription/key request or privilege expansion without authorization.

After the necessary release is authorized/applied, create one disposable narrowly scoped SAM schedule through Admin, enable one future occurrence, verify it executes with the browser closed through existing Cron/worker/audit, and pause/archive it afterward. Preserve unrelated runs/schedules and budgets. Verify effective date window, category, request links, terminal/partial evidence, zero product AI use and absence of county-trigger side effects. Do not create a broad enabled schedule or apply a production lead import merely to demonstrate the UI; isolated import tests and prior genuine readback may establish that integration.

Update `docs/ADMIN-UI.md`, `docs/ADMIN-TRIGGERS.md`, current workflow/SAM API docs and relevant parent plan pointers with actual contracts and acceptance evidence. Record source restrictions, dates and remaining blockers plainly. Keep Bonfire's unfinished plan separate.

### Done criteria

- SAM is obvious in Admin and works without selecting counties; both existing categories are represented accurately.
- Manual and persisted daily/multiple-times, weekly and monthly SAM schedules use the existing shared infrastructure and original SAM backend.
- County/state-source/manual direct SAM behaviors remain compatible; no county search starts SAM.
- Saved progress, partial/access failures, audit/usage and exact reviewed-import actions are usable from SAM results.
- Required automated and visual checks pass; a real browser-closed scheduled occurrence is evidenced after the required release.
- No secrets, unexpected AI spend, uncontrolled retries, orphan requests or duplicate canonical leads; test schedules cleaned up.

Keep the plan in `specs/todo/` if required deployment/live acceptance or provider access remains blocked. Record exactly which checks passed and which did not. Do not move to done solely because controls render or mocked schedules pass.

## References and remaining implementation checks

- [GSA Get Opportunities Public API](https://open.gsa.gov/api/get-opportunities-public-api/): posted-date window semantics and maximum span; upstream offset is a page index. Existing repository limits may be tighter and must remain bounded.
- Confirm the award API's current allowed modification window, pagination, credential availability and rate limits independently; opportunity access does not confer award access. This is implementation verification, not a reason to introduce another provider.
- Proposed UI defaults are opportunities and a 30-day lookback; no additional product decision is required before implementation unless those defaults conflict with a newly discovered existing requirement.

Original implementation prompt (completed):

```text
$build-code specs/todo/admin-sam-manual-and-scheduled-updates.md

Add separate statewide Arkansas SAM manual runs and scheduled updates to Admin.
Reuse existing SAM services, Supabase persistence, scheduler, audit and reviewed
imports. Preserve county/state-source behavior, AI settings/budgets and Bonfire
gates. Complete verification and report remaining access/deployment blockers.
Do not deploy Netlify production. Report the proposed commit message.
```

## Build checkpoint — October 19, 2026

Implemented phases 1 and 2: separate statewide SAM preview/manual submission and shared schedules; strict category/date/filter validation; atomic parent/request/job linkage and leased run proof; saved history/packets, audit and non-AI usage; audited unknown-response reconciliation; exact SAM run IDs for guarded imports; reused schedule controls and independent drafts.

Verification completed: UI suite (59 tests), targeted SAM/function/workflow/import tests (29), native PostgreSQL/PostgREST access suite including SAM HTTP wake, leased capture, pause/resume, audit and duplicate prevention. Browser fixtures passed desktop, 390px, 320px and keyboard checks with county selection preserved and no production mutation. The initial native gateway startup timed out; both the retry and extended SAM scenario passed. Final aggregate check results are recorded below when complete.

Live acceptance completed after the authorized forward migration, private function, Render and draft-only Netlify release. Both real manual categories saved terminal zero-result responses for October 16–18. The one-day future schedule executed once through Cron with the browser closed, saved terminal evidence and zero AI usage, and was paused/archived afterward. The acceptance account was soft-deleted. Original SAM jobs, AI/environment settings and locked Netlify production were verified unchanged. No production lead import was performed; exact reviewed import tests and prior genuine readback establish that integration. No remaining product decisions or required acceptance blockers.

Proposed commit message: `feat: add SAM Admin runs and schedules`.

Final aggregate verification: `npm run check` passed (59 UI tests, 270 workflow tests, SQL import/upsert checks, lint/typecheck and production build). A Windows sandbox module-cache failure was resolved by rerunning the complete command outside the sandbox. Forward migration/private function, Render and draft preview deployed after successful production-row preflight. Live acceptance passed under explicit user authorization. Final Cron evidence: one accepted HTTP 202 delivery, four successful Cron executions in the acceptance window, and exactly one saved scheduled occurrence. See the deployment evidence for run IDs and cleanup.

Follow-up: [automatic validated SAM imports](sam-automatic-validated-imports.md) replaces the SAM-only manual review/approval behavior described in this historical implementation. Existing import validation, deduplication and non-SAM approvals remain.
