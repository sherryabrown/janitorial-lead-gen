# Automatic validated SAM imports

## Initiating prompt

> Please remove the manual approval steps so valid SAM results are automatically added or updated in the database, for both manual and scheduled runs. Keep duplicate checks and validation.

Planning date: October 19, 2026. Build checkpoint: implementation and isolated verification complete; authorized coordinated release/live acceptance pending. No new schema migration or provider API is required.

## Outcome and boundaries

A manual or scheduled statewide SAM opportunity/award run collects evidence, validates candidates, inserts or updates canonical leads, and reports verified results without asking the user to select candidates, enter a reason, approve new leads, classify each notice, prepare an import or approve a tested hash. A scope confirmation before starting a search/saving a schedule is not a per-record import approval and remains unchanged. Existing schedules inherit this behavior; there is no approval opt-in or additional schedule setting.

Use the current SAM collector, shared worker, persisted jobs, scheduler, import planner, PostgreSQL rehearsal, transaction, duplicate identities and readback. Do not create another importer or scheduler. Keep SAM separate from county/state searches. Do not change approval requirements for non-SAM source workflows, direct reviewed-import clients, Companies, email previews, Bonfire gates, AI settings/budgets, queues or sales fields. No new AI calls are required. Netlify production must not be deployed as part of implementation without separate authorization.

Invalid or ambiguous records remain saved with specific validation reasons; they do not become leads merely because a run succeeded. A validation failure is an exception to resolve, not a mandatory approval step for valid results. Preserve evidence even when collection is partial or access fails.

## Current code and observed failure

- `scripts/lib/hosted-sam.mjs`: `sam_stage` saves immutable intake via `samIntakeRows()`, then ends at blocked `sam_review`. `packet()` only accepts that checkpoint and hardcodes `canonical_writes: 0`.
- `scripts/lib/hosted-import-jobs.mjs`: `prepare()` binds request/current hashes/exact saved SAM runs; `import_prepare` creates a tested package then blocks at `import_awaiting_approval`. `approve()` authorizes its exact hash, and `import_apply` uses the existing transaction/readback. Unknown writes retain `import_reconcile`.
- `scripts/lib/reviewed-batch.mjs`: `planReviewedBatch()` already matches canonical identities, protects existing fields, enforces notice/date/location/award evidence and requires explicit `approve_new`, `new_bid_type` for new notices, and `request_match_reason`. `samIntakeRows()` currently labels every non-award notice as an opportunity, which is not proof that it is open.
- `scripts/lib/hosted-import.mjs`: `prepareImport()` validates current candidates, captures a baseline, builds SQL, runs the private native rehearsal and hashes the package. `applyImport()` checks that exact package, schema, current data and permissions before writing and verifying. Retain these controls.
- `scripts/lib/hosted-workflow.mjs`, `scripts/workflow-server.mjs`: SAM and import stages already execute through the same leased worker and audit.
- `scripts/lib/county-triggers.mjs`: SAM parents currently become `needs_review` after their children stop; this must distinguish automatic processing, verified completion and exceptions.
- `src/features/admin/RequestReview.tsx`: generic candidate selection/reason/new-lead/test/approval controls are shown for SAM, but do not supply all required notice/location decisions. Recent attempts failed on missing new-lead authorization, notice classification and request-location explanation. The DeQueen notice has now been successfully imported through the existing tested pipeline under explicit user instruction; do not duplicate or reset it.

## Phase 1 — Server-owned policy and automatic continuation

1. Add a focused, versioned SAM automatic decision builder beside the SAM/import services. Use existing capture/normalization/planner functions. Its input is trusted saved SAM request, source identity, exact audited run set, immutable candidate hashes and current canonical baseline, never arbitrary client JSON or a public `auto_approve` flag.
2. Compute the decisions currently required by the existing planner from saved evidence: allow creation only when exact matching finds no existing identity; include a factual service/work-location match reason; derive new notice classification from official notice/award evidence and deadline. An active flag alone does not establish an open solicitation. Awards remain awards, expired notices may be historical opportunities under existing rules, and missing/contradictory facts remain exceptions. Do not introduce unrelated keyword filters or invent dates, city locations or cross-source matches. Arkansas work location must come from performance evidence rather than contracting-office address. Keep original statewide scope/date semantics.
3. Reuse `planReviewedBatch()` for authoritative validation and duplicate matching. Keep SAM notice IDs, routed original identities and full award identities; never merge on title, office, PIID alone or another fuzzy match. Preserve existing sales status, notes, assignments and user-maintained values, source links, request links, history and newer canonical evidence according to current patch rules. Automatic classification does not grant broader authority to rewrite existing lead classifications or promote unsupported award relationships.
4. Represent authorization truthfully as system policy with version, trigger/request origin, initiating user or schedule owner, exact candidates/runs, deterministic reasons and tested package hash. Do not claim a human reviewed or clicked approval. Adapt the internal reviewed-package metadata if needed while keeping original human-reviewed contracts compatible. Do not weaken `approve()` or allow non-SAM/public callers to bypass it.
5. Persist an automatic processing continuation after `sam_stage`, using the shared job/worker rather than an HTTP callback or browser timer. Reuse existing import preparation and apply stages. After successful native rehearsal, automatically authorize only that exact unchanged tested package and enqueue application. Keep preparation and application as durable leased stages, with pause/cancel checks before each external/write boundary. Do not call the public approval route as a workaround or introduce a second transaction writer.
6. Use a deterministic identity based on request, exact run/candidate hashes and policy version for automatic processing. Replays, lost acknowledgments, concurrent workers, overlapping schedules, restarts and repeated captures must not produce duplicate canonical leads or repeated history events. Do not include timestamps/random batch IDs in retry identities. Handle already-processed intakes and the already-imported DeQueen record through existing canonical identity checks.
7. Validate candidates individually using a shared validation/planning path so one invalid record does not prevent other valid records from being added. Reuse the planner's defer representation and keep concrete exclusion reasons. Partition genuine conflicting groups together rather than silently choosing a winner. Do not catch arbitrary DB/provider failures as invalid-candidate skips. Unknown writes are never silently classified as failures eligible for resend.
8. Retain exact saved-run/hash verification, current-baseline recheck, native rollback/readback/replay tests, permission/transaction controls and final live readback. If baseline changes, safely regenerate/revalidate a bounded attempt; do not loop on stale packages indefinitely. If transaction outcome is unknown, reconcile the original package against actual persisted state before any reapplication; an unproven outcome remains blocked. Readback-only reconciliation may run automatically when conclusive.
9. For partial collection, process only successfully audited, hash-verified records that independently meet existing validation. Preserve explicit machine-recorded partial authority for those exact pages; do not fabricate terminal coverage or bypass run continuity checks. Failed/unknown capture attempts retain their separate blocker and prevent collection resends. Zero valid candidates completes without an empty import job; partial/excluded/unresolved counts must remain visible. Confirm supported bounded partial captures against `collectRuns()` rather than adding another parser.
10. Reuse current schedule owner/auth checks, audit phases and work-claim rules. Log validation, prepare/test, apply and reconciliation with actual zero AI use. Record safe stage/error codes and user-readable validation explanations from an allowlist; never expose raw exceptions, credentials or private package paths.

Suggested persisted sequence (names can follow existing conventions):

```text
sam_collect -> sam_stage -> automatic decision/validation
  -> existing import_prepare -> native test -> import_apply -> import_verified
  -> saved SAM summary: inserted / updated / unchanged / excluded / unresolved
```

SAM packet/status must remain readable after these stages, including legacy `sam_review`; use actual receipts rather than hardcoded write counts. Parent completion waits for import/readback, not merely candidate staging. A normal valid automatic run must not stop at `needs_review` or `import_awaiting_approval`.

## Phase 2 — Results-focused Admin UI and compatibility

1. For SAM only, replace the selection/reason/new-lead/classification/prepare/test/hash-approval form with automatic progress and concise saved outcomes: added, updated, unchanged, excluded and failed/unresolved. Link directly to affected leads and retained evidence. Keep county/state/non-SAM review controls unchanged.
2. Update SAM copy in `SamSection.tsx`, `RunDetail.tsx`, activity/history and `publicJobAction()` from imports-require-review to automatic validated saving. State clearly when collection succeeded but database application is pending, blocked or only partially verified. Do not report all returned records as added.
3. Show actionable per-record exception explanations (for example missing Arkansas performance evidence or conflicting award identity). Valid records require no approval. Keep existing access, pause/cancel and outcome-reconciliation actions; do not revive a generic approval button to handle invalid records. Full raw provider objects/private diagnostics stay out of the normal flow.
4. Preserve scope selection, search/schedule confirmations, daily/multiple-time/weekly/monthly cadence, independent county drafts and current authentication. Updating existing SAM schedules must not require users to recreate or re-enable them. Legacy direct SAM collection uses the same automatic SAM processing continuation; existing explicitly reviewed import endpoints keep their contract.
5. Handle saved legacy SAM runs deliberately: expose the same idempotent automatic continuation for eligible saved `sam_review` results without re-fetching SAM. An authorized implementation/rollout command may process these bounded saved results, excluding cancelled/paused work and uncertain prior applications. Do not reset completed imports, restart all failed manual import jobs, or silently resubmit old provider requests. Record which legacy requests were processed or excluded.

## Phase 3 — Verification, docs and rollout

Extend the existing suites rather than duplicating their harnesses:

- `tests/hosted-sam.test.mjs`, `tests/admin-sam.test.mjs`, `tests/hosted-import.test.mjs`, `tests/reviewed-workflow.test.mjs` and the applicable existing import/planner tests: manual opportunity/award and shared scheduled paths reach verified writes without any approval action. Cover all required generated decision fields, trusted policy boundary and unchanged non-SAM reviewed imports.
- New/updated/unchanged identity cases; repeat request/page/worker; overlap; concurrent baseline edits; old evidence; retained sales fields; expired and award notices; missing deadline/location; service mismatch under existing qualification; ambiguous identity; mixed valid/invalid batch; zero results; bounded partial captures; access denial; unavailable rehearsal; cancellation/pause; inactive owner; restart between every durable transition; unknown outcome reconciliation and no duplicate application.
- Native SQL tests prove rollback, exact readback, replay, unchanged protected fields and no duplicate history/request links. No broad weakening of shared validation to make automatic tests pass.
- UI tests prove SAM has no candidate approval/reason/classification/hash gates, shows actual database counts/evidence and links to leads, and displays actionable exceptions. Existing county/state review remains intact. Extend the existing desktop/390px/320px/keyboard browser fixture checks without production mutations.
- Run `npm run check`, `npm run test:access` and the existing extended browser harness. Run targeted tests during development and fix actual failures before declaring acceptance.
- Update `docs/ADMIN-UI.md`, `docs/ADMIN-TRIGGERS.md`, `docs/SAM-SEARCH-PLAYBOOK.md`, `docs/PROCUREMENT-WORKFLOW.md`, SAM release evidence and the completed SAM plan with a pointer explaining that its previous manual-review behavior is superseded by this feature. Keep historical evidence accurate.
- Document a coordinated release of matching Render worker/API and draft frontend, plus any necessary forward-only database change. No new migration unless existing persisted structures actually require it. Prevent old/new worker stages from mishandling jobs during rollout; use compatible staged release or a short verified worker drain, with pending identities preserved. Deployment/commit/push are not performed by this planning task. Preserve Netlify production unchanged unless explicitly authorized later.
- After authorized release, verify a genuine manual SAM result is persisted without approval and one disposable future scheduled occurrence runs with the browser closed and automatically persists/verifies its results. Use a small existing evidence-backed scope, preserve budgets and unrelated schedules, pause/archive the disposable schedule, and prove duplicate-safe repeat/update behavior. A zero-result live query establishes empty handling, not nonempty automatic import acceptance; use genuine saved SAM evidence for a nonempty check. Report provider/validation blockers honestly and keep the plan in todo if required acceptance is incomplete.

## Success criteria

- Valid opportunity and award results automatically create/update canonical leads for manual and scheduled SAM runs with no per-record or batch approval interaction.
- No omitted decision fields or generic preparation blockers for otherwise valid SAM records. Actual database writes/readback, not only staging, establish success.
- Duplicate identities, current hashes, classification/location/date validation, protected fields, tested transactions and reconciliation remain enforced; non-SAM approval behavior is unchanged.
- Mixed results process valid records and retain specific exceptions, accurate partial coverage and actual usage. No endless retries or duplicate leads/history.
- Automated/native/browser and genuine nonempty manual/scheduled acceptance pass; docs reflect deployed behavior and test schedules are cleaned up.

No additional product decision is needed to begin. Use the explicit authorization in the initiating prompt as the product policy for valid SAM automatic writes; do not ask for a second human approval of each result.

Next implementation prompt:

```text
$build-code specs/todo/sam-automatic-validated-imports.md

Remove SAM manual import approval steps. Automatically add/update valid SAM
results for manual and scheduled runs using existing validation, duplicate
checks, tested transactions and readback. Preserve non-SAM approval flows,
county/state behavior, AI budgets and Bonfire gates. Verify actual database
writes and report exceptions. Do not deploy Netlify production.
```

Proposed implementation commit message: `feat: automatically save validated SAM results`.

## Implementation checkpoint — October 19, 2026

Implemented server-owned `sam-automatic-v1` decisions; per-identity validation/exclusions; exact-run deterministic automatic import jobs; existing native rehearsal/tested hash/transaction/readback; honest system-policy provenance; no SAM approval form; automatic progress/counts and guarded saved-result continuation. Non-SAM reviewed import contracts remain unchanged. Partial known-success pages retain partial scope; unknown collection/write outcomes are not resent.

Verification: aggregate `npm run check` passed (59 UI, 272 workflow tests, SQL rollback/readback/replay/protected-field checks, lint and build). Final targeted tests passed (32, including automatic award identity, policy provenance, partial-page failure and existing protections). Real PostgreSQL/PostgREST access suite passed with nonempty manual and scheduled automatic imports, mixed valid/invalid records, no duplicate canonical lead and paused legacy continuation rejection. Browser suite passed desktop/390px/320px/keyboard with no SAM approval controls and preserved county selection. Existing large lazy Admin/map bundle warning remains.

The native harness now retains startup diagnostics, bounds startup wait and uses one Haskell runtime capability; it also installs the existing public-record-link migration to match the code under test. Initial startup and obsolete-schema fixture failures were diagnosed and fixed rather than counted as passes.

User authorized commit/push and matching Render/draft preview release plus live verification. Production Netlify remains excluded. Keep this plan in todo until genuine nonempty live/manual/scheduled acceptance and cleanup are recorded.
