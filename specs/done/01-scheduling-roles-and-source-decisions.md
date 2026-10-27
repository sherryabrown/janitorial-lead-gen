# Phase 1: Scheduling roles, source decisions and shared presentation contracts

Parent and initiating prompt: [Scheduling release clarity plan](../todo/00-scheduling-release-clarity-and-source-resolution.md). The user requires separate Users/Admins with enforced launch permissions and meaningful source outcomes. Confirmed: Users manage schedules in the existing shared team workspace; Admins manage source repairs/technical work; No website/Won't address excludes the affected future check until an Admin re-enables it. Preserve the current working tree, including the uncommitted efficiency pass.

## Objective

First complete the parent's mandatory purpose/duplication audit of every `procurement_*` table, reconciling live schema, repository declarations and proposed schema. Then establish one trusted permission boundary and one persisted interpretation of source problems before changing the screens. Keep current execution and reporting facts authoritative; admin review decisions are an additional audited dimension.

The audit register and justified remediation are phase-1 deliverables, not optional cleanup. Verify actual SQL/cron/trigger/operator consumers, not just UI imports. Record retain-operational, retain-history/retention, consolidate, retire or unresolved for each table. Unresolved/unexplained duplication keeps the gate open. Preserve unrelated behavior and require a concrete dependency/data-preservation manifest before removals. Use the parent's full audit criteria; do not certify a table as necessary solely because a fixture or migration names it.

## Pertinent existing code

- `scripts/workflow-server.mjs`: authentication composition; trusted backend database client.
- `scripts/lib/workflow-http.mjs`: all schedule/run/request/import/access/catalog management routes.
- `src/features/auth/AuthGate.tsx`, `src/app/AppShell.tsx`: session gating and entry to Settings.
- `src/lib/procurement.ts`: direct source cache reads, lead/detail/history and metric lead loading.
- `scripts/lib/county-source-attention.mjs`, `hosted-attention.mjs`, `schedule-reporting.mjs`, `admin-run-history.mjs`, `admin-catalog.mjs`: existing bounded projections, attention and verified counts.
- `src/features/admin/types.ts`, `source-results.ts`, `model.ts`: client contracts and currently scattered labels.
- Current baseline and applicable forward migrations; `tests/helpers/admin-trigger-db.mjs` and the native harness migration list. Do not rewrite applied migrations.

## 1. Agree and enforce capabilities

Use the existing `public.profiles.role` values for User and Admin inside the existing shared team workspace. Do not create a separate procurement role/membership authority, require `procurement_members` membership, introduce private user datasets or add an organization/tenant hierarchy. This follows the parent's October 26 role-authority clarification.

| Capability | User | Admin |
| --- | --- | --- |
| Work permitted leads/notes/stages | Existing business access and ownership rules; no legacy membership requirement | Existing business access, not a bypass of note ownership |
| Read permitted schedule results, source impact and schedule changes | Yes | Yes |
| Read safe source names/official links and schedule scope | Yes | Yes |
| Create/edit/pause/run schedules | Yes; preserve existing owner/activity/version/scope constraints | Yes, subject to existing constraints |
| Record a source decision, verify/apply a source fix | No | Yes |
| View detailed operational evidence/technical logs | No by default | Safe, redacted projection only |
| Change protected credentials, apply arbitrary SQL, bypass portal verification | No | No new UI permission; retain existing private operator procedures |

Inspect and reuse `public.profiles` and its existing Auth foreign key, role definition and trusted role-assignment/onboarding process. Verify actual field names, role values/casing, defaults, uniqueness and update policies before writing migrations or fixtures; the current sanitized procurement baseline omits this table. Do not assume the profile primary key is the Auth user ID. Build authoritative capability helpers over the existing role; do not introduce another role table or infer authority from `procurement_members`, email strings, client storage, editable user metadata or a UI toggle.

Verify current Admin profile assignments rather than creating a new procurement bootstrap list. Missing/unrecognized profile roles fail closed for protected Scheduling/Admin actions and show a useful access state; do not invent a separate membership-approval workflow. Ensure ordinary Users cannot change their own role through direct table/API calls or profile-edit operations. Preserve legitimate non-role profile edits and the existing trusted role management process. Any existing self-promotion path must be closed as part of this release's enforcement work.

Provide a minimal authenticated capability read, preferably through Supabase RPC so the existing Leads workspace does not acquire a dependency on the separate workflow service merely to determine access. Return role, scope and role revision, not other users' privileged metadata. Client state is a display hint; enforce current permission on every HTTP mutation/read and relevant database boundary. Fail closed for unassigned accounts and display an understandable access-pending state.

Inventory every existing endpoint, not just new ones. Preview/run-now, discovery review/resume, captures, SAM processing, import approval/apply/reconcile and registry/access paths must have an explicit decision. Preserve ordinary-user metric-to-lead navigation: `/v1/admin/metric-members` is currently called by the lead workspace, so its path name alone must not cause a blanket denial.

Audit direct Supabase grants/RLS/functions and storage URLs alongside HTTP routes. Where ordinary Users currently read full source/config rows, provide the safe projection required for lead labels/links and adapt `createProcurementSourceCache()` rather than either breaking Leads or leaving a raw-data bypass. Preserve note authorship, active-account restrictions and service-only credentials. Ordinary business access must not acquire a `procurement_members` gate; replace any remaining legacy membership checks that conflict with the confirmed profile-based policy.

Inventory `procurement_members` dependencies in policies, functions, views, grants, operational integrations and fixture setup. The baseline's older `staff_read` policies used this allow-list; later authenticated-access changes removed membership as a business-access requirement. Do not delete or rewrite historical migrations. Remove the live table only through a separately reviewed forward migration after all dependencies are migrated and tested; until then it is legacy data, never an authority or synchronized role copy.

On logout, role/scope change or a permission-denied response, remove privileged panels and owner/role-scoped cached evidence, stop their polls, and refresh capabilities. Do not discard unrelated business drafts on a transient backend failure. A remembered Admin view never grants access.

## 2. Persist source review decisions separately from check facts

Storage design is conditional on the completed table-purpose audit. Evaluate existing `procurement_action_requests`, `procurement_events` and relevant audit structures against the required cross-run identity, human decisions, exclusions, CAS and retained facts. Prefer extending a suitable existing structure; justify any new table by a distinct unmet need. The following minimal model is illustrative, not a directive to create redundant tables:

- `procurement_source_issues`: one current episode for a well-defined problem scope; ID, stable scope/problem key, source/route/category/geography references as applicable, observed revision, current handling decision, version/CAS, verification reference, actor/timestamps, and explicit scoped check exclusion with re-enable audit data.
- `procurement_source_issue_events`: append-only observation/decision/repair/reopen events with originating run/request/task and evidence references. Unique idempotency/event keys prevent duplicate observations and repeated decision writes after an interrupted acknowledgement.

Use a partial unique active-episode key or equivalent transactional protection. Derive the key from trusted source/method/route scope and a stable reason class, not from displayed text or timestamp. No-source gaps need a geography/entity/category identity. Never merge different category/location failures merely because they share HTTP status. When a shared underlying cause cannot be established, keep the smaller task scope and label it honestly.

Do not store an ever-growing list of run IDs in a single JSON field. Link observations through the existing request/task IDs in event rows. Retain historical observations after repair or a changed decision. An identical observation in a later run updates the same current problem; material source/scope/config/failure changes can reopen/create an episode under explicit rules.

Keep these dimensions distinct:

```ts
type SourceDecision =
  | 'unreviewed' | 'repair_in_progress' | 'fixed_verified'
  | 'no_website' | 'no_issue' | 'wont_address' | 'needs_developer';

type SourceReviewItem = {
  id: string; version: number;
  scope: { sourceId?: string; routeId?: string; category?: string; geographyId?: string };
  title: string; impact: string;
  check: { state: string; observedAt: string | null; lastSuccessAt: string | null };
  decision: SourceDecision;
  allowedActions: string[];
  verificationReference?: string;
};
```

This is illustrative, not permission to send arbitrary backend exception text. Generate public titles/impact/actions from a shared enum-backed projection. Keep diagnostic identifiers separate and Admin-only. Expand the contract only for actual implemented actions.

Counts distinguish unreviewed action items, accepted gaps and verified source checks. A no-issue decision removes the reviewed observation from the unreviewed queue; it does not turn a failed check into successful collection. No-website/won't-address decisions retain their reason and coverage impact. Source triage must not waive lead validation, mark an uncertain import safe, or approve an import package.

## 3. Current source state versus historical results

Use the same projection and identity for Admin attention, Sources and run issue links. A run remains an immutable account of the checks performed at that time. A current repair/decision can be linked as a separate, dated update. Do not recompute historical completeness as if a newly registered site was checked in the old run.

Write decisions with expected version and stable mutation identity. Recheck Admin authority, referenced task/source membership and current source revision in the transaction. A concurrent change or stale review returns a useful conflict that preserves the written note. Read back persisted events before confirming success.

Accepted/no-issue decisions remain searchable under Reviewed. Provide explicit Reopen/change-decision actions with audit history. Do not introduce timed snooze or external notifications: neither was requested as the selected outcome model.

No website/Won't address must atomically record an explicit, scoped audited exclusion. Evaluate it in the existing planner/worker before scheduled collection, automatic retries and source rediscovery. Report **Not checked by admin decision**; preserve its coverage impact and actor/reason. A no-source gap uses the assessed entity/route/category identity so exclusion does not depend on having a source ID.

Do not delete history/tasks, disable whole schedules or skip unrelated state/SAM work. Confirm shared impact before applying a source-wide exclusion. Explicit Admin re-enable restores eligibility only after required source/method validation. Ordinary User Run now, schedule edits, new runs and UI refreshes cannot bypass or clear the exclusion. Preserve already-running work under the existing lease/cancellation policy; explain that in-flight work may finish rather than silently changing cancellation semantics.

## Tests and acceptance

- Positive and negative profile User/Admin/missing-profile/unrecognized-role/expired-account tests over real HTTP and direct database roles/RPCs; spoofed role payloads, guessed IDs, stale privileges and private evidence requests are denied appropriately.
- A profile User without `procurement_members` membership retains permitted business/schedule access. A profile Admin without membership retains Admin access. A legacy membership row never elevates a profile User to Admin or substitutes for a valid profile role. Direct ordinary-user role edits are denied while permitted non-role profile edits still work.
- Lead source labels/links, notes/stages and metric drilldowns continue to work for authorized Users.
- Concurrent decisions, lost acknowledgements, repeat observations, multiple runs, category/geography separation, reopened episodes and immutable old evidence.
- Reviewed/no-website/won't-address decisions never fabricate lead counts, coverage or successful checks. Unknown imports retain reconciliation requirements. No website/Won't address skips only affected future checks; No issue leaves check eligibility unchanged; only an authorized Admin can re-enable an exclusion.
- Seed/migration tests use disposable databases with the verified representative `profiles` schema/FK/role values. Adapt existing member/non-member fixtures to preserve their business-access regressions under profile roles; do not create a second production role model just to fit the old harness. Add new migrations to the shared harness; deny anonymous/browser privilege escalation and protect triage persistence as designed.
- Audit/remediation tests exercise affected SQL functions, triggers, cron/worker paths, CLIs and any identified integrations, plus FK/grant/policy dependencies, migration replay, lossless mappings and recovery. Reconcile the post-migration catalog against the approved table-purpose register and prove consolidated/retired tables no longer have active dependencies. Retained immutable history still reads correctly.
- Preserve request-scoped shared reporting inputs, bounded choice reads and prior query-count regressions. Permission checks must not become per-row database calls.

Deliver the complete procurement table-purpose register, approved remediation manifest and verified local changes, profile-based authorization, justified source-decision schema/API/client contracts, and endpoint permission matrix for phase 2/3. No live role assignments, migrations, table deletions or deployments are performed merely by completing this local build phase.

## Phase 1 completion — October 27, 2026

Implemented locally; coordinated deployment remains in phase 3. The user authorized only the narrow profiles.role protection exception to the procurement-table boundary, and explicitly approved retiring procurement_members after preserving its assignments.

- Audited all 42 live procurement base tables and their SQL/application/deployment consumers. The supported deployed code matches the inspected base. Retire membership through lossless Admin-only event archival, equality reconciliation and RESTRICT; retain the other 41 tables for documented operational/history/compatibility purposes.
- Use profiles.user_id → auth.users.id and the verified user/admin enum. Enforce current permissions on the production HTTP composition and restrictive database reads. Preserve ordinary profile edits; deny self-promotion. No role assignments, second role authority or tenant model added.
- Reuse action_requests and events for scoped current review state, revision/version checks, idempotency, history and explicit exclusions. Do not create the two proposed issue tables. Material source/check changes require renewed review; old run facts remain unchanged.
- Enforce exclusions at collection/research lease boundaries. Active leases, imports, unrelated categories and state/SAM work retain their existing rules. Reopen does not re-enable. Only explicit Admin re-enable restores eligibility; the planner still requires valid source/method evidence.
- Preserve the earlier efficiency implementation as a prerequisite: shared reads/reporting inputs, inactive-view polling suspension, incremental logs and query-count regressions.
- Verification: lint; 183 UI tests (one worker, unchanged timeouts); 399 offline workflow tests; both historical SQL scripts; production build; real disposable PostgreSQL/PostgREST acceptance including source decisions, scoped claim rejection, membership archive/retirement, role denial and stale privilege removal. An unexpected dependency proves retirement rollback. No production database or site changes were made.

Evidence: docs/reviews/2026-10-26-procurement-table-purpose-audit.md and docs/reviews/2026-10-27-scheduling-permission-matrix.md. Phase 2 provides the guided UI/website verification; phase 3 completes workspace gates, browser acceptance and coordinated rollout. Those phases and the parent remain open.
