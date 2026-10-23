# Phase 6 — Integrated Admin acceptance and coordinated release

05C1 local build is verified; its [rollout/repair checklist](../../docs/reviews/2026-10-23-county-addendum-identity-and-repair.md) is still required. Include the compatible queue-read migration, exact targeted repair/readback and immutable-receipt/current-canonical membership checks before completion. No shared repair or release has occurred as part of the build checkpoint. Record the pre-existing mobile Leads status-strip overflow without silently expanding 05C1 scope.

New pending dependencies (2026-10-23): [05C1 identity/repair](05C1-county-addendum-identity-and-duplicate-repair.md) and [05C2 execution/metric clarity](05C2-schedule-execution-table-and-metric-clarity.md). Include original/addendum/repeat manual and scheduled import identities, protected original sales data, auditable repair/canonical metric members, one paginated schedule execution table with no-run attempts, date-first run navigation, dispatch versus run outcomes, and proper verified/recorded metric labels plus numeric values, with completeness in accessible contextual help. Any native schema or targeted live repair must have its own tested manifest/rollback and applicable authorization; this dependency does not authorize live writes. Preserve completed global Submit/read-control behaviors. Resolve these children before declaring the parent complete.

Verify the confirmed 05A–05C distinction: valid manual/scheduled results still automatically save to `procurement_leads` without added approval; validation, duplicate checks and protected notes/stages remain intact. Saved-lead counts open the exact filtered Leads; collection/validation issue counts open their corresponding details and next actions and are labeled as issues. No issue counts inflate lead totals.

Additional dependencies: accept [05A audit/lead drilldowns](../done/05A-schedule-audit-and-lead-drilldowns.md), [05B schedule/run clarity](../done/05B-schedule-and-run-detail-clarity.md) and [05C History Submit/analytics](../done/05C-history-submit-and-analytics-overview.md) before final integrated acceptance. Include exact metric-to-Leads cohorts, transactional schedule-change history, full breadcrumb return paths, collapsed setup/attributes, Issues-first runs and source tables, global History's empty/today/Submit flow, and analytics without a Runs list. These replace conflicting earlier presentation/read-control assertions; retain all unrelated regression requirements. Re-resolve links to done when children complete.

05C acceptance checkpoint (2026-10-23): [local verification](../../docs/reviews/2026-10-23-history-submit-and-analytics-overview.md) passed. Include draft/applied History query isolation, failed-page Retry, empty fresh entries, CT today dates, exact metric cohorts with limit=1, and unchanged automatic schedule Runs in the integrated matrix. Historical unavailable fields remain unknown. No 05C migration; coordinated release is still pending authorization.

Status: planned. Parent: [requirements](admin-workspace-redesign.md).
Initiating instruction: verify complete redesigned Admin and release only through authorized Render/Netlify preview workflow, leaving Netlify production unchanged.
Dependencies: phases 1–5 accepted; verify confirmed D1–D3 in parent (new/separate updates, last-run usage, seven-day default). No new feature scope.

## Preflight and regression matrix

1. Record exact branch/commit, working tree, applied migration list and live backend/preview versions. Current repository d218166 includes unactivated Saline continuation work; explicitly identify release inclusion/compatibility. Do not apply its reviewed source package or queue migration merely because files exist. Coordinate required dependencies with the user if this changes planned release scope.
2. Verify each child acceptance receipt, shared DTOs and authentic data sources. No mock UI metric left behind; no hidden future view masquerading as complete. Check header sign-out, Companies/email previews, Leads notes/stages and automatic import policies outside Admin redesign remain unchanged.
3. npm run check, npm run test:access, node tests/integration/admin-ui-browser.mjs extended end-to-end. Use existing harness/native disposable auth/DB instead of a parallel infrastructure. Verify at desktop, 390px, 320px, 200% zoom, keyboard only, long labels, empty/error/loading and slow/offline/reconnect states.
4. One chain: Settings → Schedules → add paused county schedule using map/city confirmation → edit → Run Now → run/detail → stats → source blocker → related municipality → back to original row; preserve page/filter/scroll/editor state. Repeat independent state-source and SAM paths. Confirm profile email access/tap/focus/sign-out.
5. Exercise daily multiple times, weekly and monthly, DST/month-end, pause/resume/archive, skipped overlap, scope-version drift, concurrent edit and ack loss using existing idempotency. Archived schedule retains history. No role/owner/recurrence behavior change.
6. Verify real counters against safe receipt/link readback and AI ledger: new/update/unchanged, category coverage, candidates versus source attention, zero versus unknown, cost/credits, last actual run versus skipped occurrence. Do not require a fabricated matching opportunity or extra AI spend to make a dashboard look populated. Captured positive native tests + honest live empty/blocker results are valid.
7. Confirm no source/geography reads start collection, duplicate state-trigger updates, expose private artifacts, or change notes/stages.

## Authorized rollout

Prepare concrete migration/API/UI compatibility and rollback notes before asking for release authority if absent. This planning prompt does not itself authorize commit/push, live migrations, schedules or deployments. Reuse earlier authorization only if it clearly covers this exact release.

After authorized:
- Record Netlify production deployment ID, current lock/publish state and preview/backend versions without printing secrets.
- Apply only tested additive reporting migrations required by this release in backward-compatible order. Existing UI/backend must remain usable during rollout.
- Deploy matching Render backend first; verify exact commit, health and authenticated reporting routes/old mutation contracts. Do not change AI policy, CORS or secrets unnecessarily.
- Deploy approved Netlify draft/preview, verify exact assets and existing allowed origin. Never publish/unlock Production Netlify.
- Live preview acceptance with authorized active test account: small manual schedule Run Now and one disposable naturally due scheduled occurrence with browser closed, verify history/metrics/source relationships and readback, then archive. No bulk historical resumes, new accounts, provider subscriptions or unrelated portal probes.
- Record safe IDs/counts/as_of, actual usage and any external source blockers. Check production ID/lock unchanged after rollout. Confirm test schedules archived and existing schedules untouched.

Rollback: use prior compatible Render/preview release; pause/archive only disposable test schedule as required. Preserve additive history/evidence; do not delete production reporting data or roll back canonical leads to undo UI changes. If a new migration cannot coexist safely, stop rollout and report exact compatibility issue.

## Completion

Update each child with checks/releases, move only accepted children to specs/done without overwriting existing files. Parent moves last when all requirements and required live acceptance pass. Preserve unresolved Saline/Bonfire plans in their own todo files. Report actual changes/deletions, tests, unknown historical metrics, source access limits, release receipts, remaining decisions and proposed/actual commit message. Netlify production remains unchanged.
