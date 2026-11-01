# Scheduling 00 production release — November 1, 2026

**Released:** https://spin.aptimap.tools. The owner explicitly answered “Approve coordinated production cutover now” after accepting the [backup scope](2026-11-01-scheduling-release-backup-acceptance.md). This supersedes the earlier production prohibition for this coordinated release only. No general automatic publishing permission was inferred.

## Deployed artifacts and execution

| Item | Verified result |
| --- | --- |
| Application baseline | `c37bcc2bc42d7901bdb9764fc7e5d4acfe7e2b65`; unchanged application and migration inputs |
| Pinned deployment | `fa216c0986d16506cd1fcb8184984a0acd1cd904` |
| Atomic SQL SHA-256 | `32a82e7196d362b44a414625b313e7d2fb4d8442333c679e65bbdafcb703b992` |
| Maintenance frontend | `6ae77d735ace0f128099b846`; visible and locked before DDL |
| Render hold | `dep-dbjnrtmc6qcc73c3bslg`; live 18:00:30 UTC; marked health and 503 business route verified |
| Render normal | `dep-dbjntgks728c738b0e2g`; live 18:03:45 UTC; exact pinned commit |
| Production frontend | `6ae77e1f142b7d53192354fd`; published 18:04:16 UTC; ready and locked |
| Preview | https://bonfire-review--janitorial-lead-gen.netlify.app; same verified frontend |
| Interruption | Maintenance approximately 17:57–18:04 UTC (12:57–1:04 PM EST), within the approved 45-minute window |

The trusted Management API operator preflight returned `postgres` with the necessary schema, role-guard and ledger privileges, inside an explicit read-only transaction. Scheduler dispatch was paused from its saved original `true` value. The hold was live and active leases were zero before DDL. The private prestate and final pre-DDL protected-data hashes were captured. Accepted encrypted backup/recovery receipts were retained; no complete production snapshot or lossless whole-project rollback is claimed.

The exact eight inputs in the [runbook](2026-10-28-scheduling-production-cutover.md) committed in one transaction, once. Only their eight approved ledger versions were reconciled, with all prior versions preserved, followed by a PostgREST schema reload. No table push, forced dependency removal or DDL retry was used.

## Completed production checks

- Final procurement inventory is **41 base tables**. `procurement_members` is retired. Its **two complete records** match the saved prestate and internal archive exactly. Roles come from `public.profiles.role`; the protected role trigger and safe source-label view are present.
- All **3,985 captures** remain. No capture deletion, consolidation or content update occurred. The earlier independent encrypted backup preserves every record and complete body with encoded/decoded SHA-256 verification.
- Pre/post counts and aggregate row hashes match for leads, lead notes/edits/stage changes/links, runs, schedules and profiles. The failed self-promotion check and all role probes ran in a rolled-back transaction.
- Using existing profile identities with actual `authenticated` database role and JWT claim settings: User capabilities permit schedule management and deny technical/source management; raw source reads return no rows while safe website labels are readable. Admin capabilities and raw source reads succeed. A User's attempted own-role promotion raises insufficient privilege. These are database enforcement probes, **not signed-in browser sessions**.
- Backend normal health returns 200/version 1. Unauthenticated capabilities return 401. Both Production and the retained preview origin pass CORS preflight; an unapproved origin returns 403. A browser-origin private scheduler wake returns 403 without invoking the worker.
- Every preview asset matches the verified build. On Production all four JS/CSS hashes match, and the original HTML bytes match exactly before Netlify's hosting-added public HUD script. The initial strict whole-HTML hash detected that injection; it was inspected rather than ignored. Hosting settings were not changed to remove it.
- Production browser smoke reaches the expected sign-in form with no page runtime errors. Production deploy is ready and locked; Render auto deploy remains off. No private key/local preview configuration was published.
- Before restoring dispatch, the unchanged claim predicates found **zero eligible API workflow jobs and zero eligible triggers**. The 14 outcome-unknown jobs and four outcome-unknown triggers remain untouched; no historical work was mass-resumed. The original scheduler flag is restored to `true`; required scheduler extensions are ready. The latest recorded delivery at verification was the earlier accepted 202 response at 16:06 UTC, **not a new post-cutover occurrence**.

Private execution receipts are under `outputs/deployment/scheduling-backup-readiness/cutover-execution/`; Netlify receipts remain in its parent. Those files, backup contents, original exports and credentials are not committed. The owner's original backup folder remains read-only and unchanged.

## Verification limits and next use

Prior full qualification passed **208 UI tests, 406 workflow tests, SQL gates, lint/build**, native PostgreSQL/PostgREST and isolated browser Admin repair/apply/re-enable acceptance. After cutover, the atomic rollback/archive/ledger, hold-route, encrypted capture-recovery and bounded read-only retry tests passed again (five tests); operator PowerShell syntax passed. No application change was introduced during deployment.

No new signed-in User/Admin browser session, live repair mutation, test schedule Run now, natural test occurrence or import was fabricated. No specific live source/test scope or account session was provided. Those mutations remain covered by the isolated acceptance evidence, not newly claimed production executions. Normal authorized schedules are restored under their existing eligibility, provider and budget rules. Full database/Auth restore, hosted Edge runtime restoration, Storage-service import and independent offsite secret escrow remain unverified within the owner's accepted backup scope; they are not reopened as deployment blockers.

Next: refresh the site, sign in normally, and check schedule visibility/Stats as a User and Sources → Review/fix as an Admin. Use an actual issue when performing a repair; do not disable a healthy source just to test re-enable. This is post-release observation, not another broad Scheduling redesign.

The parent and phase 3 specs are moved to `specs/done/` for the approved, deployed release. Earlier pending-GO/backup statements are historical and superseded by this record. Phases 1/2 remain done. Audit-only follow-up commits do not change the pinned live application revision.
