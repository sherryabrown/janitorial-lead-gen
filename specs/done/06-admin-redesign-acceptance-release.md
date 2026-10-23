# Phase 6 — Integrated Admin acceptance and coordinated release

Accepted runtime 6174426 is deployed to Render and the approved preview. All implementation phases/amendments and required live acceptance passed; no new migration. Earlier checkpoints below are historical.

Status: complete; integrated local/native, released browser/API and real manual/naturally due acceptance passed. Netlify production unchanged.

Parent: [requirements](admin-workspace-redesign.md).
Initiating instruction: verify complete redesigned Admin and release only through authorized Render/Netlify preview workflow, leaving Netlify production unchanged.
Dependencies: phases 1–5 accepted; verify confirmed D1–D3 in parent (new/separate updates, last-run usage, seven-day default). No new feature scope.

## Preflight and regression matrix

1. Record exact branch/commit, working tree, applied migration list and live backend/preview versions. Historical audit baseline `d218166` is superseded by the current preflight above; identify existing Saline inclusion/compatibility without reapplying source packages. Do not apply its reviewed source package or queue migration merely because files exist. Coordinate required dependencies with the user if this changes planned release scope.
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

## Current execution record

See the integrated acceptance report for complete checks, the narrow schedule-name breadcrumb correction, retired obsolete browser scenario, prepared disposable live test, release/rollback scope and explicit user authorization. No new migration required. Parent moves last only after required live checks pass.

Initial release `27f79fc` exposed the queue blocker recorded in the report. The authorized correction is released at `6174426`; manual and naturally due checks passed, and the disposable schedule is archived. Parent/Phase 6 are accepted.

## Authorized queue-blocker continuation

User approved fixing the queue blocker and completing live acceptance on 2026-10-23. Restrict the correction to run aggregation when the exact request collection coordinator is blocked at `collect` with a saved error: untouched pending captures do not keep the parent Pending. Keep child jobs/evidence unchanged and expose the existing attention outcome. Real running jobs, other pending processing and uncertain outcomes retain their current guards. Do not retry failed collection, cancel older work, change queue order/leases, or alter budgets/import policies. Add isolated starvation and pending/running/uncertain regressions; rerun full/native checks; commit/push, release Render first and preview second, then finish the existing disposable manual/naturally due acceptance and archive it.

## Final integrated acceptance

Completed with Phase 6 at runtime `6174426`; see [release and verification](../../docs/reviews/2026-10-23-admin-integrated-acceptance.md). Netlify production unchanged.
