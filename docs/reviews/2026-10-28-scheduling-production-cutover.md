# Scheduling 00 production cutover runbook

Prepared October 28, 2026. **Preparation only: no live SQL, deployment, publishing, unlocking, scheduler changes or backup restore is authorized by this document.** The current prohibition on Netlify Production deployment remains in force, including publishing a maintenance page.

This is the operational appendix to [00](../../specs/todo/00-scheduling-release-clarity-and-source-resolution.md) and [phase 3](../../specs/todo/03-scheduling-workspaces-and-release-acceptance.md), not a fourth implementation phase. Phases [1](../../specs/done/01-scheduling-roles-and-source-decisions.md) and [2](../../specs/done/02-scheduling-guided-source-resolution.md) retain their local completion status.

## Frozen application and observed baseline

Application acceptance baseline: `c37bcc2bc42d7901bdb9764fc7e5d4acfe7e2b65` on `codex/admin-county-trigger-ui`. Its final checks passed 208 UI tests, 406 workflow tests, both SQL gates, lint/build, native PostgreSQL/PostgREST and actual preview browser acceptance. The full Admin website/method apply and explicit re-enable flow passed with protected run/lead data unchanged.

The preparation commit adds operator tools and this runbook; it does not change normal application startup. Generate the package after that commit. `manifest.json.deployment_commit` must be a committed revision containing the hold server; it must not be null. The generator rejects changes to the tested application/migration inputs. Review/merge first, then regenerate/pin the exact resulting revision if a merge changes the SHA; do not deploy a moving branch head.

Read-only observations at 2026-10-28 23:23 UTC; recheck immediately before execution:

| Component | Observed state |
| --- | --- |
| Supabase | Project `zreplhkoxswtzxlchtjf`; 42 public procurement base tables, all matched to the purpose register; membership still present; safe source-label view, guided-repair/attention functions and profile role trigger absent |
| Render | `srv-db2q9mmi0phs738v7f80`, `janitorial-procurement-backend`; main branch, auto deploy off; live `617442642c6fee33f7fa18c289d808e809351a60`, deploy `dep-dbdrah0m7kps73beh9gg` |
| Netlify | Site `425d7e19-1179-4ca3-b187-0bcbb8c332b1`, `janitorial-lead-gen`; Production `https://spin.aptimap.tools`; main branch; locked published deploy `6ad583d1b9bb1b307abcf1fd`; published Git SHA unavailable |
| Existing preview/CORS | Render currently permits only `https://bonfire-review--janitorial-lead-gen.netlify.app`; retain it and add **`https://spin.aptimap.tools`** for Production. No wildcard or localhost origin |

## Recommended release shape

Reserve a **45-minute full-application maintenance window**, subject to approval. This is a booking allowance, not a guaranteed outage maximum. The frontend maintenance page temporarily replaces Contracts, Companies, Settings and other app pages. Notify users beforehand and have them save/copy drafts. The operator does not send notifications automatically.

The old frontend reads raw sources; the new permissions restrict those reads. The new frontend needs the safe view and matching API. These are separate services and cannot be switched atomically as one deployment. Do not promise zero downtime or deploy schema-first behind an otherwise usable older Production UI.

Render's built-in [maintenance mode requires paid compute](https://render.com/docs/maintenance-mode). The current blueprint uses the free plan. No paid upgrade is proposed: the prepared `scripts/scheduling-cutover-hold.mjs` can be explicitly selected using Render's [Docker Command override](https://render.com/docs/docker). It returns a marked 200 only for health and 503 for business routes/private wakes, and imports no database, auth or worker code. Normal startup remains `node scripts/workflow-server.mjs`.

The maintenance page is **not a security boundary or a global database write freeze**. Already-open clients can still make permitted direct Supabase business writes. The API hold stops backend work; pausing dispatch and draining leases stops new scheduler/worker work. Migrations do not rewrite lead data. Roll-forward is the default recovery after commit; do not promise a lossless whole-database rollback while concurrent legitimate business writes are possible. If a hard write freeze or zero-downtime cutover is required, stop and prepare/test those additional controls first.

## What is needed from the owner

1. Final acceptance of the latest User/Admin preview, and confirmation of the intended existing Admin assignments. Identify one existing User and one Admin for live checks. No automatic promotions, invitations or credential emails.
2. A maintenance date/start time in America/New_York and approval of the full-app interruption and required client refresh. Existing eligibility/lease rules will be preserved when the recorded scheduler state is restored; unexpected or uncertain work is a stop condition, not permission for blind replay.
3. A trusted Supabase backup/migration operator session through the approved secure mechanism, plus confirmation of an available backup/isolated restore target. Current importer/rehearsal connections are intentionally insufficient for schema administration. Do not put passwords or service keys in chat, Git, command lines or the frontend. No new paid resources without separate approval.
4. **Approved:** the owner granted the narrow Supabase migration-history bookkeeping exception (`supabase_migrations.schema_migrations`) for only the eight listed versions. The prepared SQL deliberately contains no history writes. Do not remove or rewrite unrelated history. This does not authorize live execution before the separate final GO.
5. Approval of one county/source and existing test identities for bounded live checks: one paused test schedule, one Run now and one naturally due occurrence, then archive it. For a real repair, identify an existing problem/official URL and shared scope; otherwise keep repair mutations in isolated rehearsal. Never disable a healthy live source merely to demonstrate re-enable. Preserve current AI/budget/provider policies and approve no extra spend by default.
6. A separate final **GO** explicitly allowing Supabase migrations, the temporary Render command/CORS changes, approved preview validation, and Netlify Production maintenance/final publishing for the pinned revision. Preparation is not that GO.

No new business-policy or role-model decisions are needed. Existing authorization to protect `profiles.role` and retire membership after lossless archival is retained; it need not be granted again.

## Prepare and verify artifacts locally

Run `node scripts/prepare-scheduling-cutover.mjs`. It reads versioned SQL/Git, checks source hashes and writes only:

- `outputs/deployment/scheduling-cutover/reviewed-cutover.sql`
- `outputs/deployment/scheduling-cutover/manifest.json`
- `outputs/deployment/scheduling-cutover/maintenance/` containing a static page, redirects and no-store headers

It never loads `.env`, connects to a service, executes SQL or deploys. Review the manifest and bundle SHA-256. Its preparation-only authorization flag remains false; a separately recorded owner GO authorizes execution of the reviewed bytes, not editing the package to manufacture approval. Build frontend assets from the pinned deployment revision with the real project public key, pinned Supabase URL and `VITE_PROCUREMENT_API_URL=https://janitorial-procurement-backend.onrender.com`; do not publish the sample preview entry. Reject `local-preview-public`, `/preview/session`, `127.0.0.1:8091` or other local API/session configuration in production assets.

The offline cutover rehearsal deliberately introduces a dependency on membership, proves that all earlier role/view/schema changes roll back with the failed retirement, then removes only that test dependency and proves lossless retry and a final 41-table inventory. A second test checks the hold handler's health/503 behavior. Rehearse the exact package against an isolated native PostgreSQL restore before live execution; the existing native suite validates individual migrations, not the new combined production transaction against a live clone.

## Backup and recovery evidence: required before the window

- Verify the actual Supabase plan, available backup/PITR coverage, recoverable timestamp, retention and restore permissions; these are **not yet verified**. Default recovery objective is no unapproved data loss. A recent backup without a demonstrated restore is insufficient.
- Restore a representative complete database snapshot into an approved isolated target. Verify Auth/profile identity relationships, procurement rows/constraints/functions/policies/grants, canonical lead links, notes/stages, scheduler state and immutable audit. Rehearse the exact cutover package there, including a failure/rollback case, signed User/Admin access and the new backend import/rehearsal role contracts.
- Preserve a separate encrypted export of every `procurement_members` record and its count/digest before retirement, plus pre-change policies/function definitions, migration history, scheduler enabled state/cron IDs, queue/lease inventory, deployment IDs and configuration references. The migration also archives every membership record internally and refuses a non-equal archive. Do not publish membership records or credentials in Git/logs.
- Database backups contain Storage metadata, **not stored object bytes**. Preserve and verify referenced `procurement-private` artifacts separately, including content hashes. Preserve required existing encryption keys via the approved secret store. Do not rotate keys or delete objects during cutover. See [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).
- After work is held/drained, establish the final pre-DDL recovery point **C0**, verify backup completion and record UTC time. If recovery coverage or isolated restore verification is unavailable, stop before DDL.

## Exact migration order and transaction boundary

The generator combines these source files into **one** outer transaction, removing only their individual outer BEGIN/COMMIT wrappers. It does not edit the authoritative migrations. Never concatenate the original transactional files under `psql --single-transaction`: their inner commits would defeat the intended all-or-nothing boundary.

| Order | Source migration | Purpose |
| --- | --- | --- |
| P0 | `20261023000400_workflow_step_sequence_index.sql` | Existing log-pagination index prerequisite; IF NOT EXISTS |
| 1 | `20261026000100_protect_profile_role.sql` | Approved profile-role protection; preserve other profile edits |
| 2 | `20261026000200_procurement_profile_capabilities.sql` | Profile capabilities, restrictive technical reads and safe source-label view |
| 3 | `20261026000300_procurement_source_decisions.sql` | Canonical decisions, audit, CAS/replay and scoped exclusions |
| 4 | `20261026000400_procurement_source_exclusion_claims.sql` | Planner/worker exclusion enforcement |
| 5 | `20261026000500_retire_procurement_members.sql` | Replace five legacy policies, archive/reconcile every member and RESTRICT retirement |
| 6 | `20261027000100_procurement_guided_source_repairs.sql` | Guarded repair, explicit application, verified readback and re-enable semantics |
| 7 | `20261028000100_procurement_source_attention.sql` | Canonical attention projection and repair lineage |

The package takes an advisory lock, uses a 10-second lock timeout and 120-second per-statement timeout, requires the expected 42-table prestate, supported profile roles, paused dispatch and no active leases, and verifies 41 tables plus archived membership equality and required views/functions before commit. It stops on a partial/unexpected release. Never delete an unexpected dependency or use CASCADE to force success.

After explicit bookkeeping approval, reconcile only these versions in Supabase's standard migration history using the supported operator tooling. P0 may already be recorded; verify before marking anything. Do not push the entire migration directory or re-run data DDL to repair history. A committed bundle with incomplete history remains in maintenance until fingerprints and history are reconciled. Source hashes and the external execution receipt must identify exactly what ran.

## Ordered execution: only after GO

| Step | Operator action | Must pass before continuing |
| --- | --- | --- |
| A | Re-read live versions/lock, pin reviewed deployment SHA, confirm backups/access/roles and run `scripts/scheduling-cutover-preflight.sql` through the trusted operator connection. Review queue/uncertain outcomes and all unexpected dependencies. | No drift, approved work scope, recovery evidence, two test identities, no missing permissions |
| B | Publish only the prepared maintenance artifact to Netlify Production under explicit authorization; keep automatic publishing disabled. Capture its deploy ID. Save the original scheduler flag, set only `procurement_scheduler_settings.enabled=false` and verify no new private deliveries. | Maintenance visible; users notified; pending/in-flight deliveries understood |
| C | Select the committed hold script via temporary Render Docker Command `node scripts/scheduling-cutover-hold.mjs`; deploy the pinned revision containing it, with auto deploy still off. Wait until old instances are gone and leases finish; do not force-clear leases or restart uncertain imports. | `/health` reports `scheduling_cutover_hold`; business routes and private tick return 503; no active/unbounded leases; C0 backup captured |
| D | Apply the reviewed bundle once using the approved admin connection with `psql -X -v ON_ERROR_STOP=1 -f <reviewed-cutover.sql>` or an equivalently controlled SQL session. Verify commit and postconditions; reload PostgREST schema cache through the approved operator path. Reconcile approved migration history. | Atomic commit known; lossless membership archive; 41-table manifest; role guard/view/functions/grants/policies verified |
| E | Restore Render's recorded normal Docker Command/default Dockerfile CMD and deploy the same pinned revision. Retain the preview CORS origin and add only `https://spin.aptimap.tools`. Preserve all credentials, AI policy and budgets. | Exact deploy SHA; normal health, correct User/Admin capabilities, restricted persistence/rehearsal connectivity and no hold marker |
| F | Deploy/validate the matching frontend at the already allowed `bonfire-review` preview alias; keep Production on maintenance. Use real scoped sessions for permitted/denied checks below. | Correct API/project/public configuration and origin behavior; no local preview configuration or private data leak |
| G | Manually publish only the verified frontend deploy to Production and verify/restore the intended lock state; do not enable broad automatic publishing. Require client refresh. | Correct immutable deployment/assets and User/Admin reads; smoke checks pass before declaring service restored |
| H | Perform only approved bounded mutations/wake checks; restore the original scheduler flag only after confirming the existing queue is eligible under its unchanged rules and no uncertain replay is being introduced. Verify one naturally due test occurrence and archive the test schedule. | No blind replay/duplicate imports; archive retained; delivery and persistence readback recorded |

Updating Render configuration may itself deploy: merge/pin the preparation revision containing the hold script **before** changing its Docker Command. Do not configure an older image to run a file it does not contain. Do not resume a suspended older API against the new restrictive schema. Render supports [specific-commit deployment](https://render.com/docs/deploys); Netlify's frontend publishing is [atomic but separate from the database/API](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/).

Manual/clock wakes can claim pre-existing eligible jobs, not just the test request. If the queue contains unapproved historical or uncertain work, stop before a wake; do not mass-reset states. Browser/private scheduler keys are distinct: never place service/scheduler/import credentials in Vite configuration or logs.

## Live acceptance record

Record the timestamp, environment, account role, exact revision, operation, expected/actual result and a non-sensitive receipt/reference. Do not fabricate leads or coverage to obtain a green screen.

| Check | Required result |
| --- | --- |
| Identity/role | Existing `profiles.user_id → auth.users.id` relationship and intended assignments; no membership gate. Self-promotion is denied; verify without persisting a role change. Other profile data is not edited by the operator |
| User | Shared schedules/leads readable; permitted create/edit/pause/run rules remain; safe Bid website name, agency type/location and URL visible; Stats filters work |
| Direct denials | User cannot access private registry/configuration/evidence, repair/decision/re-enable actions, steps, raw technical RPCs or private wake; forged URLs/client role cannot grant access |
| Admin/source | Existing supported source gets exact-location verification, shared-impact confirmation, explicit apply/readback; any existing exclusion remains until explicit re-enable; verified decision survives re-enable; unrelated sources and old runs stay unchanged |
| All decisions | No website/Won't address exclude only the approved scope; No issue does not disable; developer handoff records internally and sends nothing. Do not manufacture these changes on healthy live sources; use isolated rehearsal where no suitable approved live case exists |
| Scheduling | Approved paused schedule Run now, one natural due occurrence, delivery/lease/idempotency/readback; no duplicate parent/child jobs or blind uncertain-save retry; archive the test schedule |
| Data/UX | Known lead stages/notes/links unchanged; correct historical/current distinction, selected run retained; refresh/Back/mobile/keyboard; role loss clears private panels and server denial is immediate |
| Final catalog | 41 procurement base tables, no extra issue tables; exact archived member equality, five replaced policy dependencies, safe grants/view and all migration versions reconciled |

If a live account session is needed, the owner signs in through the normal secure UI. Do not send password resets, magic links or invitations without separate explicit instructions. Do not execute the fixture-only preview repair script against a hosted database.

## Abort and rollback decision tree

- **Before live changes:** cancel freely; leave current published frontend/backend/schema untouched.
- **Hold active, bundle fails before COMMIT:** its entire transaction rolls back, including role/policy/view changes and membership archival/retirement. Verify the old schema/row equality and lack of an open transaction. Once confirmed, keep the maintenance frontend visible while restoring the recorded normal command and explicitly deploying the old pinned backend. Verify old-schema compatibility/health before republishing the previous frontend deploy; only then restore scheduler state if safe. Keep maintenance if any outcome is uncertain.
- **Connection lost at COMMIT:** do not rerun. Inspect the all-old/all-new postconditions and bundle fingerprints via a fresh trusted session; reconcile history/execution receipt. Treat partial/unknown state as a hold requiring operator review.
- **Bundle committed, API/frontend validation fails:** keep/reinstate the prepared maintenance frontend and API hold, with dispatch paused. Preserve role protection, safe permissions, new decisions/exclusions, membership archive, evidence and user data. **Roll forward to a corrected compatible API/frontend.** The recorded old Production UI/API is not a safe drop-in rollback for the new schema; do not reopen User technical access or resurrect membership as role authority.
- **Database recovery required:** restore first into an isolated target and establish the exact recovery scope and all post-C0 user/audit changes. A whole-project production restore can affect Auth and unrelated data and may lose later writes; it requires separate explicit authorization, recovery-point/data-loss agreement and provider/operator access. It is not an automatic rollback in this runbook. Do not delete retained evidence or undo role protection to recover UI availability.

## Completion and current holds

Preparation does not satisfy business sign-off, production backup/restore verification, native restored-production-clone rehearsal or final GO. The narrow migration-ledger exception is approved. No provider backup/PITR recovery-point guarantee has been asserted. Current local preview remains separate from production. See the follow-up below for the CLI authentication caveat.

Record successful deployed versions, backup/recovery references, migration/archive checks, live role/scheduler/source receipts and owner acceptance. Only then complete phase 3 and the parent and move their specs to `specs/done/`. Keep phases 1/2 history intact. No further broad Scheduling redesign is part of this cutover.

Preparation verification: the two new offline tests pass (read-only preflight, whole-package dependency-failure rollback, lossless retry, duplicate/partial-release stop and hold-handler routes). A real loopback HTTP smoke check also returns the expected hold health marker and 503 responses without starting a database client or worker. Lint passes. The normal application files and migration inputs are unchanged from the accepted application baseline. Generated SQL, manifest and maintenance files are preparation artifacts only; no application role assignment, scheduler setting, Render command/CORS setting, Netlify publishing or live schema migration was changed.

## Backup verification follow-up

See [backup and isolation evidence](2026-10-28-scheduling-backup-rehearsal.md) for the passing synthetic native dump/restore/cutover rehearsal, six verified Edge Function source exports, the remaining seventh export failure, rejected database credential, Storage/secret escrow gaps and the earlier CLI login-role initialization caveat. Production recovery readiness remains a blocking gate. Database Functions and deployed Edge Functions are explicitly separate backup items.
