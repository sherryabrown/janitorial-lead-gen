# Scheduling dev preview and Production cutover

The preview runs at **http://127.0.0.1:5174** on this computer. Start it with `npm run preview:scheduling`. It first runs the disposable native acceptance gate, then seeds a fresh sample workspace and serves the built application. Startup can take several minutes. It does not read Production connection settings or change `.env` files.

## What is real and what is simulated

- Real application components, API authorization from `profiles.role`, PostgreSQL RLS/RPCs, schedule writes, decision history, worker leases, guided verification/application and native SQL rehearsal/readback.
- Disposable local sample users, leads, schedules and source evidence. The clearly labeled **Test as User/Admin** control selects only these local sample identities. It is not included in the Production entry point and does not assign any real account role.
- Website responses are local fixtures. `https://repair.example/bids` demonstrates the supported two-stage website/listing repair. Other destinations are refused; no external collector, provider or AI spend occurs. SAM/provider execution and unsupported technical operations are not simulated as successful imports.
- Recurring clock dispatch is not activated in this disposable preview; use Run now. The native gate separately verifies scheduled dispatch, ownership, replay and browser-independent execution.
- Changes persist while the preview process runs. A restart creates a new disposable workspace. Its native cluster/artifact diagnostics remain local and ignored by Git. This is not a live source repair or release receipt.

## User acceptance

1. Start as **User**. Confirm the lead's Bid website shows the website name, agency type/location and URL.
2. Open Settings → Schedules → Weekly Arkansas County leads. Find Results, Sources and Schedule changes. Explain the selected run's result and what needs attention without opening a log.
3. Inspect Sources: distinguish current setup from what was checked in the selected run. Edit/pause/run schedules using the existing rules. Admin exclusions stay excluded when a User runs a schedule.
4. Switch to **Admin**. Open Needs attention or Review source from the same schedule. Try each decision with a short reason. No website/Won’t address requires confirming the affected scope and disables only that check; No issue leaves checking enabled. Needs developer records a handoff and sends nothing.
5. Provide `https://repair.example/bids`. Verify the website, review affected schedules, explicitly use it, then review/apply the verified listing method. A homepage alone is not a fixed listing. A successful repair leaves an existing exclusion in place until explicit Re-enable checks.
6. Return to the same source/run, try Next source, switch roles, use Back, keyboard tabs and a narrow window. Written review notes and selection should retain context. Users must not gain technical details or repair controls.

Please record actual nontechnical User/Admin interpretation and any confusing state. Automated checks do not substitute for this acceptance. Production remains on hold.

The running handoff sample has already completed an automated guided repair and an explicit **Won’t address** decision. To find it from Needs attention, select **Show → Reviewed decisions**, or open the schedule’s Sources section. An Admin can explicitly re-enable that affected check. Website verification has a four-per-hour limit; avoid repeating the entire repair just to inspect the layout. Restarting the disposable preview resets its sample data.

## Automated verification record — October 28, 2026

The full release check passed lint, 201 component tests, 406 workflow tests, both historical SQL gates and the TypeScript/Production build. Subsequent role-loss, pending-check presentation and review-lineage refinements have their own final regression receipts. Native PostgreSQL/PostgREST acceptance verifies signed sample User/Admin permissions, profile self-promotion denial, preserved personal edits, membership archival/retirement, scoped exclusions, guided repair/readback and protected historical/lead fields. An additional rolled-back native fixture proves new-entry identity, exclusion and reviewed/handoff retention with 41 procurement base tables.

The actual app browser test uses the local API/database without intercepted API fixtures: safe User Bid website fields, server denials, legacy links, guided verify/apply/readback, reviewed exclusion, role changes, keyboard, 1440/390/320px and 200% zoom. The final layout-only rerun checks the corrected decision-control spacing and ensures pending checks do not invent an Admin issue; it does not repeat source writes. Receipts and screenshots are under ignored `outputs/deployment/scheduling-preview/`; the complete release check is under `outputs/deployment/admin-scheduling/activation/final-release-check.log`.

Final changed-component verification: **27 tests passed** across SchedulingWorkspace and ScheduleActivity, including permission-read failure followed by confirmed role loss, pending source presentation, retained selection and the initial-load race. The final source-decision SQL regression and native entry/history spot check also passed. A subsequent broad UI rerun was stopped after varying existing AdminScreen/ScheduleEditor cases missed their original timing deadlines on this host, including under a single thread worker; it is **not** recorded as a clean final full-suite pass. No deadlines/assertions were relaxed. Preserve this distinction from the earlier complete 201-test pass when assessing release readiness.

## Coordinated Production release (not executed)

The old Netlify Production UI reads `procurement_sources` directly. Applying the new restrictive policies first would hide its Bid website summary from Users. The new UI reads `procurement_source_labels`, which preserves name, agency type/location, URL and bounded business coverage facts while excluding private configuration.

Before cutover:

1. Obtain explicit authorization for the Production frontend deployment; the existing prohibition remains in force. Verify the locked Netlify Production deploy and its main-branch mapping without unlocking or publishing it.
2. Back up/reconcile the bounded membership history and dependency manifest. Verify current `profiles.user_id → auth.users.id`, role values, approved Admin assignments and existing personal profile edits. Do not create another role list.
3. Rehearse the complete ordered migration/API/UI bundle on an isolated hosted environment if one is required. The local preview is already isolated; it does not justify applying migrations to the live shared database.
4. Coordinate the frontend switch with the new backend and migrations: role-protection exception `20261026000100`; procurement capability/source labels `26000200`; decisions `26000300`; exclusion claims `26000400`; membership history/retirement `26000500`; guarded repair `20261027000100`; source review projection/lineage `20261028000100`. Preserve existing prerequisite migrations, including the workflow-step sequence index.
5. Verify allowed/denied actions with real scoped User/Admin accounts, raw-table/RPC denial, immediate role loss, safe Bid website reads, schedule ownership/version rules, explicit exclusions and a bounded authorized repair. Verify historical outcomes, protected lead stages/notes and unknown-save reconciliation remain intact.
6. Reconcile the expected **41 procurement base tables**, no duplicate issue tables, five replaced legacy read policies and lossless membership archive. Record exact deployed frontend/backend commits and migration/readback receipts.

Rollback must retain audit/capture evidence and safe permission enforcement. Do not restore unrestricted source mutation access or revert role protection to make an old UI appear functional. Keep the matching frontend/API pair or disable the new repair entry while preserving business reads. No bulk historical resumes or unapproved live imports belong in the cutover.
