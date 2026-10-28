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
4. Switch to **Admin**. Open Source issues & repairs or Review / repair from the same schedule. Try each decision with a short reason. No website/Won’t address requires confirming the affected scope and disables only that check; No issue leaves checking enabled. Needs developer records a handoff and sends nothing.
5. Provide `https://repair.example/bids`. Verify the website, review affected schedules, explicitly use it, then review/apply the verified listing method. A homepage alone is not a fixed listing. A successful repair leaves an existing exclusion in place until explicit Re-enable checks.
6. Return to the same source/run, try Next source, switch roles, use Back, keyboard tabs and a narrow window. Written review notes and selection should retain context. Users must not gain technical details or repair controls.

Please record actual nontechnical User/Admin interpretation and any confusing state. Automated checks do not substitute for this acceptance. Production remains on hold.

The sample includes prior repair and review history; its current decision can change during testing. If no unresolved issues appear in Source issues & repairs, choose **Review decisions and disabled checks**, or open the schedule’s Sources section and choose **Open source issues & repairs**. Use **Back to schedule sources** to return to the same schedule. An Admin can explicitly re-enable that affected check. Website verification has a four-per-hour limit; avoid repeating the entire repair just to inspect the layout. Restarting the disposable preview resets its sample data.

## Automated verification record — October 28, 2026

The final `npm run check` passed lint, **203 UI tests across all 27 files**, **406 workflow tests**, both historical SQL gates and the TypeScript/Production build. This includes the final role-loss, pending-check presentation and review-lineage refinements. The complete receipt is `outputs/deployment/scheduling-preview/full-check-timing-fixed.log`. Native PostgreSQL/PostgREST acceptance verifies signed sample User/Admin permissions, profile self-promotion denial, preserved personal edits, membership archival/retirement, scoped exclusions, guided repair/readback and protected historical/lead fields. An additional rolled-back native fixture proves new-entry identity, exclusion and reviewed/handoff retention with 41 procurement base tables.

The actual app browser test uses the local API/database without intercepted API fixtures: safe User Bid website fields, server denials, legacy links, guided verify/apply/readback, reviewed exclusion, role changes, keyboard, 1440/390/320px and 200% zoom. The final layout-only rerun checks the corrected decision-control spacing and ensures pending checks do not invent an Admin issue; it does not repeat source writes. Receipts and screenshots are under ignored `outputs/deployment/scheduling-preview/`; the earlier pre-refinement release check is retained under `outputs/deployment/admin-scheduling/activation/final-release-check.log`.

The earlier broad UI timing qualification is **resolved**. Repeated global button queries traversed the real 75-button county map while looking for unrelated form controls, including during `waitFor` retries. Tests now scope accessible queries to their owning form/fieldset, use input labels for county selection, and poll the mounted Save button's disabled state. The map, keyboard/accessibility checks, actual debounce, all assertions and original deadlines remain intact; no retries or skips were added. Application behavior is unchanged.

One local diagnostic measured three global Run now lookups at 23–40 ms versus 3–4 ms within the form. The same two affected suites passed all 40 tests before and after the change; observed combined run time fell from 40.55 seconds to 29.98 seconds. These are local observations, not performance guarantees. The final complete UI run passed in 98.12 seconds using the standard `npm run check` command, without timeout overrides. Baseline/fixed JSON receipts are `timing-baseline.json` and `timing-fixed.json` in the same ignored output directory.

The fresh complete `npm run test:access` also passed on disposable PostgreSQL 15/PostgREST, including native role enforcement and both repair-lineage scenarios (`native-timing-fixed.log`). The existing preview remained running throughout and passed the actual-app layout/role/browser smoke check again (`browser-timing-fixed.log`). No live database or external website was contacted. Human business acceptance and authorized Production cutover remain outstanding; the timing-test hold is cleared.

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

## Admin repair discovery follow-up

Admins have an explicit **Source issues & repairs** navigation entry and a primary entry point above current source setup in each schedule's Sources section. Opening it preserves the schedule/run context and provides **Back to schedule sources**. **Review decisions and disabled checks** makes reviewed gaps discoverable even when the unresolved queue is empty; it performs the existing reviewed read only when selected. Rows expose **Review / repair**, opening the same guarded website verification, decision and re-enable workflow. No new repair path, role authority, schema or polling was introduced. Users retain read-only source status and do not see these Admin actions.

Verification: all 207 UI tests pass, including empty-queue discovery, lazy reviewed reads, preserved schedule context and unchanged User restrictions. Lint/type-check/build pass. The real preview browser gate verifies the Admin entry and return path at desktop/390px/320px, plus User statistics, role denials, keyboard and 200% zoom. Scoped screen-reader label styling prevents repair-button overflow. The read-only smoke check preserves current sample decisions instead of resetting them. Receipts: `repair-discovery-final.log` (all UI tests) and `repair-discovery-preview-final.log` (final build/browser), under ignored `outputs/deployment/scheduling-preview/`. No backend/database or Production deployment changes.

## Full Admin repair and re-enable acceptance

`node tests/integration/scheduling-repair-e2e.mjs` exercises the running disposable preview through real Admin UI actions: verify the fixture website, confirm/apply it, verify/confirm/apply the listing method, retain the existing exclusion until explicit re-enable, confirm the affected scope, then reload and inspect current setup as Admin and User. This command intentionally changes the sample source and leaves its verified check enabled. Use the layout-only browser smoke test for inspection without changing source decisions; repeated fresh verifications retain the existing hourly limit.

The flow exposed a confirmation race: terminal verification became actionable before its authoritative scope read finished, and that read could clear a freshly checked confirmation. The UI now keeps confirmation/decision controls disabled during the scope refresh and announces that refresh. The changed scope still requires confirmation; no server checks were bypassed. A deterministic delayed-read regression covers the race.

The complete real preview flow passed, including fresh verification and both explicit apply actions, native persistence readback, explicit re-enable, reload, and User-visible verified current setup. Original selected-run check facts, schedule config/version and existing lead payloads/stages/notes remained unchanged. Receipt: `outputs/deployment/scheduling-preview/repair-e2e-receipt.json`; screenshots share the `repair-e2e-` prefix. The preview uses allow-listed fixture website responses; no Production or real external website was contacted.

Final verification for this follow-up: all **208 UI tests**, lint and the TypeScript/Vite build pass (`repair-e2e-final-check.log`). A final fresh API read also confirms the `fixed_verified` decision is retained after re-enabling. The running sample source is verified and enabled; no live deployment or database changes were performed.
