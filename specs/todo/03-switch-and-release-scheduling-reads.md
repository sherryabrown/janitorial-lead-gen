# 03 — Switch, backfill and release saved scheduling reads

Local frontend switch and release preparation implemented November 4; see [build review](../../docs/reviews/2026-11-04-scheduling-read-decoupling-build.md). Both owner behavior decisions are resolved as recorded in the parent. No production migration, backfill, deployment or hosting change was executed. Release phases remain pending separate authorization, so this spec remains in `todo`.

Part of [Decouple saved scheduling reads from Render](decouple-scheduling-reads-from-render.md). Depends on specs 01–02; covers phases 5–6 of six. No production deployment/backfill is authorized by the planning request.

## Phase 5: Frontend read separation and compatibility

1. Add a typed `src/lib/scheduling-reads.ts` adapter over authenticated Supabase RPCs. Keep command transport in `procurement-workflow.ts`. Use explicit named methods/allowlisted read contracts rather than silently redirecting every GET by URL. Unknown methods fail visibly; they must not fall back to Render.
2. Reuse in-flight sharing/cancellation semantics from `shared-read.ts` with keys scoped by account/session, RPC and normalized parameters. No new long-lived cache/freshness policy. Clear mounted/request state on account changes as today. Ensure `.abortSignal()` reaches RPC transport and session/auth failures preserve existing drafts and sign-in behavior.
3. Switch `SchedulingRole.tsx` to `procurement_capabilities()` while retaining active/visible polling, focus recheck, private-panel unmounting and privileged draft cleanup. Missing/unknown role fails closed. A Supabase read failure is distinct from a verified access denial. Trace and retain the existing Render waking/connection treatment wherever Render remains necessary. The recent 90-second exception applies specifically to capabilities, not to all commands; this split does not authorize a global command-timeout or retry-policy change.
4. Switch bootstrap reads in `AdminScreen.tsx`, `ScheduleEditor.tsx`, schedule choices/history filters, and saved source choices. The initial Admin scheduler/runtime GET must not keep a Render dependency in the background. Resolve the parent runtime-configuration decision first.
5. Switch saved detail/activity/audit/history, `RunDetail.tsx`, `use-run-logs.ts`, analytics, source-status/setup and only the embedded saved fields needed by those views. Independent review/import/SAM/source-repair workflows remain Render-backed. Preserve routes/legacy links, tab selection, scroll/context, pagination retry ownership, loaded page depth, keyboard interaction and mounted drafts. Validate expected schedule membership on run selection as today.
6. Switch `MetricLink.tsx` and report-scoped membership in `AppShell.tsx` to the new member RPC. Continue fetching current canonical Contracts with existing Supabase lead/RLS helpers; preserve unavailable/deleted-lead notices and filtering semantics. Do not add Render to ordinary Contracts or change its queue counts/notes/stages.
7. Preserve previews, Save/Pause/Resume/Archive/Delete/Run now, source verification/apply/reconcile, import commands and provider operations on Render. Keep their idempotency keys, versions, explicit uncertainty handling and backend-startup messages. Following successful commands, refresh the affected saved Supabase context in place; no unnecessary navigation or automatic replay of uncertain writes.
8. Leave existing Render readers in place during rollout for comparison and frontend rollback. New frontend saved reads never call them, even when Supabase is failing. Roll back by restoring the prior frontend deployment; do not add feature-flag infrastructure or a hidden runtime fallback.

### Required offline and browser acceptance

Run meaningful focused regressions plus repository gates: `npm run lint`, `npm run test:app`, `npm run test:workflow`, `npm run test:sql`, `npm run build`, and the applicable native access fixture/integration tests. Extend existing analytics/schedule-reporting/identity tests, native fixtures (`tests/helpers/analytics-db.mjs`, scheduling/access helpers), UI tests (`SchedulingWorkspace`, `SchedulingAccess`, `MetricLink`, `EfficiencyReads`, history/detail/metrics suites), and isolated browser checks. Do not claim a mock-based test proves real RLS or real database publication.

Required browser scenarios:

- Fresh User and Admin sessions with Render network access **blocked**, rather than merely a warm worker: load ordinary Contracts, Schedules, saved run/attempt history, change audit, Stats, lead/issue drilldowns, source status, and permitted saved run logs/embedded fields. Assert no automatic Render request from these saved views, including hidden/bootstrap effects. Independent workflow consoles are outside this no-Render acceptance boundary.
- Active progress updates arrive from database fixture writes while Render stays blocked. Display pending/partial honestly; no browser-caused work execution, state mutation or finalization. Recheck hidden-document/inactive-view reads and duplicate focus events.
- A normally finalized run remains readable after the worker exits. If it exits between the source-state commit and result publication, show the existing unavailable/incomplete treatment and recover through the same idempotent finalization retry, without repeating collection/import. Reopen invalidates complete results before later publication.
- Count/member agreement across pages, repeated jobs, two runs sharing a lead, category transitions, zero-result proof, missing historical identities, later merge and intervening issue/ledger updates.
- Role downgrade, missing profile, expired session, account switch and malicious private flags: private data never appears, cached privileged responses do not leak, drafts follow existing cleanup rules.
- An actual command still goes through Render, shows startup/connection handling when delayed, and retains uncertainty/idempotency behavior. Verify the next saved read uses Supabase and keeps its navigation context.
- Existing execution still completes with the browser closed, using current accepted command kicks and private dispatch; test in an isolated fixture rather than starting arbitrary production collection.

## Phase 6: Qualified backfill, staged rollout and rollback

### Backfill preparation and limits

The November 4 aggregate inventory in the parent plan is the planning baseline, not approval to reconstruct all 79 runs. Refresh it and produce a private dry-run report: run ID/source fingerprint, applicable work flags, supported version-1 or legacy evidence, independently qualified counts/identities/categories, canonical validity, exclusions and proposed completeness/reason. Do not put private IDs or raw job checkpoints into tracked docs. This report supports a one-time data migration, not a new manifest/approval system.

Classify each run:

| Evidence | Allowed treatment |
| --- | --- |
| Completed, fully verified version-1 identity evidence | Complete generation after all eligibility checks |
| Verified legacy IDs/outcomes with unknown categories | Supported identity/outcome subtotal; categories explicitly unavailable; complete only for independently proven metrics and eligible completed execution |
| Partial/Needs-review/Unknown with verified identities | Known subtotal, never fully verified completion; do not resume or reconcile the run |
| Verified aggregate-only receipts | Preserve proven count-only information where already supported; identity drilldowns unavailable |
| Proven successful no-result disposition | Known zero with recorded evidence basis |
| Maintenance-only | Lead metrics not applicable |
| Missing, malformed, uncertain or unsupported evidence | Explicit unavailable/unknown reason; no synthetic zero, inferred identity or new provider call |

Do not infer old categories/outcomes from current lead payloads, treat intake counts as imported leads, reinterpret unknown imports as success, or change original receipts. Keep the eight completed SAM runs with some identities as **candidates**, not an assumed complete cohort. Review the 13 verified jobs without identity arrays and the maintenance/no-result possibilities separately.

Use a small operator script following existing repository migration conventions to process the reviewed run IDs. It calls the same atomic finalization operation with matching source fingerprints and writes derived results only, in bounded per-run transactions. Recompute changed inputs instead of applying stale results. Re-running the script is safe; a separate backfill checkpoint framework is unnecessary because saved fingerprints identify completed work. Record counts/reasons/hashes and skipped runs. No collection, imports, lease reset, schedule update, source repair, financial/provider calls or backfill-triggered worker kicks.

### Release order

1. Complete local/native/browser qualification and resolve the parent behavior questions. Record explicit exceptions to old reporting completeness and any token/runtime-display compatibility behavior.
2. Prepare reviewed additive SQL migrations, grants and reversibility checks. Record actual production prestate, object definitions/grants, trusted recovery evidence and deployment IDs. Follow existing project release/backup conventions; do not repeat unrelated historical cutover operations or claim whole-project rollback without evidence.
3. Obtain separate authorization for production migrations, the reviewed projection backfill and publication. A build request alone does not authorize deployment. Keep Render Free and its existing execution configuration.
4. Install additive tables/functions/hooks and security changes before switching readers. Exercise denied/read-only role probes. Backfill only reviewed eligible evidence, compare existing vs projected counts/membership with documented approved completeness differences, and check active writes/reopen behavior. Dirty/missing projections must be explicit, not hidden by a Render fallback.
5. Publish a preview frontend using the existing allowed preview origin/configuration. Verify exact build assets, no local configuration or secrets, real signed-in read-only User/Admin paths where accounts are available, and Render-blocked saved-read behavior.
6. Deploy the qualified Render lifecycle/finalization integration before switching frontend readers, with existing free-plan/settings unchanged. Publish the qualified frontend to `spin.aptimap.tools` only after authorized GO. Retain the Netlify production lock and record file hashes/deploy IDs. Use the existing deployment/release process; do not build a new release approval system.
7. Production verification: exact assets, direct Supabase saved-read requests, real-role permission checks, known-subtotal/unavailable cases, correct report links and no automatic Render requests. Verify Render's plan/settings unchanged. Prove natural execution only with a specifically authorized test scope or existing legitimate occurrence; a read-only smoke is not proof of a new scheduled collection.

### Rollback and operational recovery

- Frontend: restore the saved previously locked Netlify deployment. Keep result tables/evidence intact. Existing Render read endpoints remain usable, with their old startup dependency, during a controlled rollback.
- SQL readers: retain additive versioned functions until old/new clients are accounted for. Restore saved function/grant definitions if needed; do not loosen RLS or grant raw tables to get the UI working.
- Lifecycle integration: restore the previous worker/functions if the new finalization integration affects execution. Retain source receipts and any out-of-date marker needed for later retry. Do not alter original checkpoint/lease rules or discard verified imports.
- Projections/backfill: preserve original source receipts. If derivation is wrong, mark the affected current results unavailable and atomically rebuild them after correction. No permanent derived-result generation history or version-management system is required. Do not roll back leads, delete original history, or overwrite category/outcome evidence.
- Schema removal is not the routine rollback. Remove additive structures only after a reviewed dependency/client inventory and separate authorization; historical result retention is otherwise unchanged.

### Completion record

Write a dated review with changed files/RPCs, migrations, exact release IDs, aggregate eligibility/backfill outcomes, parity exceptions, test commands/results, production-vs-isolated verification limits, no-Render request evidence, role probes, recovery/rollback readiness and unchanged Render Free configuration. Move completed implementation specs to `specs/done/` only after their required work is actually finished; retain the parent until all phases and agreed release acceptance are satisfied.
