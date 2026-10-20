# Automatic validated county imports

Status: release authorized; the live manual Saline run automatically saved a verified lead. The repeat lineage fix passes automated/native verification and awaits release/live continuation plus disposable scheduled acceptance. Keep in todo until those checks pass. No production frontend deployment. See [implementation evidence](../../docs/reviews/2026-10-19-county-automatic-imports.md).

## Initiating prompt

> Please automatically import valid county results into Leads for manual and scheduled runs, keeping duplicate checks, evidence and location/date validation, and existing notes and sales stages protected. Keep Netlify production unchanged.

This supersedes earlier requirements to preserve manual approval for **county results**. It does not remove validation or authorize automatic imports for every non-SAM workflow.

## Problem and desired behavior

County collection currently validates official evidence and stages candidates, but users must prepare and approve an import before those candidates appear in Leads. Manual Saline verification demonstrated a valid LRWRA opportunity saved in intake rather than Leads. Manual and scheduled county runs must automatically create or update canonical leads after validation, without candidate selection, written reasons, new-lead checkboxes or approval-hash actions.

Apply this policy to confirmed Admin `county_scope` requests, including their confirmed city selections and whichever supported categories/windows the user requested. Both manual and scheduled triggers use the same server policy. Valid records from a partially covered county may be saved; inaccessible sources and unresolved records must remain visibly incomplete. A source-only run must remain source-only.

Preserve all behavior outside this scope: SAM automatic imports, independent state-source/state-research workflows, standalone reviewed-import tools, geography membership, AI settings/budgets, source discovery limits, Companies, email previews and existing queues. Keep protected Bonfire access work paused. A normally collected, valid, accessible Bonfire result in a county request follows the same county policy; this feature does not unblock protected collection. Add no paid search provider or new import infrastructure.

## Current implementation and reuse

- `scripts/lib/hosted-workflow.mjs` validates interpretation/evidence/bounds and calls the existing intake planner. Its interpretation loop currently stops after staging. `known-source-workflow.mjs` binds packets to saved captures and confirmed cities; `interpretation-intake.mjs` retains immutable observations and stable record identities.
- `hosted-import-jobs.mjs` already owns durable import prepare/apply/reconcile stages. Its server-only SAM entry point bypasses human approval after policy validation and native rehearsal. Its automatic authorization checks are presently SAM-specific.
- `hosted-import.mjs`, `reviewed-batch.mjs`, `intake-reconcile.mjs`, `native-sql-rehearsal.mjs` and `batch-verification.mjs` provide bounded snapshots, canonical identity matching, native transaction rehearsal, protected-field writes, exact package binding, concurrency guards and readback. Reuse these services; do not insert directly from the collector or browser.
- `sam-automatic-import.mjs` is a useful policy-builder precedent, but its NAICS, run-set and request-wide single-import assumptions must not be applied to county evidence. County discovery can produce additional interpretation waves after the initial collection.
- `county-triggers.mjs` currently treats any candidates/non-success jobs as `needs_review`. `RequestReview.tsx` renders candidate approval controls, and `RunDetail.tsx` polls results. Both need county-specific automatic status.
- Scheduler baseline functions retain non-SAM capture provenance, with a SAM wrapper. Inspect current applied definitions, including the shared-route changes and private read-reconciliation migration, before changing skip/overlap behavior.

Existing review code supports stable manual record identities, amendment parents and `supersedes_pending_intake_id`. It rejects ignored records, ambiguous identities, unproven cross-source merges and expired/undated open solicitations. Preserve those checks rather than adding a permissive upsert.

## Phase 1 — Server policy and automatic persistence

1. Add a small county policy builder, analogous to the SAM builder, using a distinct version such as `county-automatic-v1`. Its input is the server-loaded request, current persisted interpretations/staging receipts, matching packets/captures, supporting evidence and a fresh canonical snapshot. No browser-supplied `automatic`, `approve_new` or policy flag grants authority.
2. Verify the request belongs to a confirmed county trigger, permits opportunity collection and is not cancelled or disallowed by the current owner/schedule controls. Restrict eligible IDs to **current** interpretation receipts for this request. Reject arbitrary intake IDs, stale/superseded interpretations, entry-page snapshots, ignored records and unsupported legacy evidence.
3. Reuse interpretation validation, literal evidence-span checks, signed supporting-capture verification and `validateFindingBounds` before authorizing a canonical decision. Bind the exact current packet, candidate payload hashes, method/category, date window and confirmed county/city scope. An agency/contact address is insufficient work-location proof. Keep service/category qualification, primary-evidence requirements, forecast/award distinctions and deadline expiry checks at write time. Do not relabel an expired opportunity to force it through validation.
4. Construct server-owned decisions for eligible records, including `approve_new: true` only under this validated policy, factual system-generated reasons and request-match evidence. Run the existing `planReviewedBatch` for individual identity groups and then the combined batch. Isolate known record-level validation failures so one bad record does not discard unrelated valid records; infrastructure, signature, schema or unknown-outcome failures must remain explicit holds. Publish safe reason codes/messages, not raw database errors.
5. Match canonical identity using source plus stable record identity, including `manual_capture.record_external_id` for observations. Repeated requests, shared city/county routes and schedules must enrich/link the same canonical lead. Never match by title similarity. Preserve existing exact-evidence requirements for cross-source mappings; ambiguous mappings remain exceptions.
6. Handle pending observation chains explicitly. Where supported, use the existing validated pending-parent supersession decision to let a current valid observation establish the first canonical lead. For an existing canonical lead, validate its parent/provenance links before enriching it. Do not blindly import every ancestor, revive ignored parents, overwrite intake evidence, or use observation suffixes as canonical business identities. Cover the saved LRWRA record `1642` and multi-level pending chains in tests.
7. Extend `importJobs` with an internal county entry point and narrowly generalize shared automatic-stage dispatch to the two known policies. Keep separate eligibility/authorization validation for SAM and county; retain the reviewed-import HTTP contract elsewhere. Reuse prepare → native rehearsal → exact package binding → apply → readback. A system policy authorizes the tested package; it must not simulate human approval or weaken the package hash checks.
8. Key county work by request, policy version, current interpretation/receipt set and candidate hashes. Serialize competing batches for a request, preserve the saved intent before sending SQL, and deduplicate repeated callbacks. Unlike the SAM shortcut, a prior completed county batch must not hide candidates discovered later in the same run. Recheck currentness before send and schedule a new wave only for eligible remaining evidence.
9. Use the existing SQL update allowlist/merge rules to preserve notes, sales stages, owner-managed fields and concurrent sales edits. Keep immutable provenance/history and request/intake links without duplicate rows or duplicate history on replay. Older evidence must not replace newer verified facts.
10. Retain the existing bounded reprepare path for a definite pre-send baseline change. After an uncertain send, persist reconciliation state and verify actual database effects before any further application. Never reset an uncertain job, silently resend it or turn a failed write into success. Scope overlapping automatic-import holds to affected identities/requests while retaining existing SAM isolation.

Wire the policy through the existing workflow-server composition, not a new writer, endpoint family or queue:

```text
validated county interpretation -> existing immutable intake staging
  -> server-owned county policy for current eligible evidence
  -> existing native-tested import job
  -> atomic canonical save and verified readback
  -> recorded counts and Leads links

new discovery wave -> same idempotent policy entry point
invalid record -> saved exception; independent valid records continue
uncertain database effect -> reconcile; never blind retry
```

## Phase 2 — Coordination, schedules and concise results

1. Invoke the internal county continuation after durable staging waves and reconcile it in the trigger coordinator before declaring completion. It must also run when the browser is closed. No callback cycle or worker starvation: the import queue owns its durable job; the parent waits on its state and readback.
2. Update county parent aggregation and request status to distinguish saving, verified saves, validation exceptions, incomplete source coverage and uncertain outcomes. A saved candidate count alone must no longer force an approval state. Do not mark a parent completed while its eligible import is pending or unverified. Preserve strongest-state precedence across multiple counties and independent state children.
3. Inspect scheduled baseline/unchanged-skip logic. A capture baseline must not suppress a pending/unverified county import, newly eligible observation or necessary reconciliation. Reuse saved evidence where current; do not re-fetch simply to resume a write. Retain overlap protection for uncertain effects and test unchanged, failed and late-discovery cases. Introduce a narrow versioned private function migration only if required; preserve the SAM wrapper, privileges and read-reconciliation behavior.
4. Expose a compact automatic-saving status and verified counts: Added, Updated, Unchanged, Not saved, with reasons and evidence. Derive counts from actual verified manifests/readback and count business identities rather than immutable observation versions. Distinguish validation exceptions from unavailable sources and from database failures.
5. In `RequestReview.tsx` / `RunDetail.tsx` and applicable types/model components, remove normal county selection/reason/prepare/approve controls for automatic-policy requests. Keep evidence available and make **View leads** the clear next action after a verified save. Preserve unrelated operator/state review tools through explicit server-reported policy context, rather than treating all non-SAM requests as automatic. Retain selection, county/map state, schedule drafts, result pagination and queue refresh/context.
6. Allow an idempotent server-owned continuation for eligible existing saved county results without a new search or manual approval. Rollout should inspect a bounded identified set, record processed/excluded request IDs, and exclude cancelled requests, paused work, inactive owners and uncertain prior imports. The earlier verification requests used subsequently soft-deleted temporary actors; do not reactivate them or rewrite their ownership. Use a fresh authorized county request to validate their underlying public opportunity when necessary. Do not bulk-process all historical intake or reset failed manual jobs.

## Phase 3 — Verification, documentation and release

Extend existing test harnesses rather than duplicating them:

- Policy/unit tests: correct county-only authority; untrusted client flags rejected; all requested supported categories/date bases; exact primary/supporting evidence; wrong or contact-only location; confirmed cities versus county-only scope; expired deadlines; changed captures; ignored and stale intake; mixed valid/invalid records; zero results; valid subset of partial coverage; no new AI calls solely to approve imports.
- Identity/protection tests: new/updated/unchanged; one source/record across county and city routes and later requests; pending observation chains; same-record conflicts; ambiguous/cross-source identities; older evidence; preserved notes/stages and all currently protected fields; concurrent sales/canonical edits; request associations and replay without duplicate leads/history.
- Durable workflow/native integration: manual and scheduled county collection reaches canonical database write/readback **without any approval action**; later discovery waves also save; restart at each boundary; duplicate worker callbacks; cancellation/pause; inactive owner; unavailable rehearsal; pre-send schema/baseline drift; rollback; timeout/unknown send; successful and unsuccessful reconciliation; overlapping runs; unchanged scheduler baselines cannot hide unfinished imports. Existing SAM automatic-import and standalone/state approval regressions remain passing.
- UI/browser: verified Added/Updated/Unchanged counts, exceptions, partial coverage, uncertain outcomes and Leads refresh; no approval/reason gates on automatic county runs; unchanged state/operator review tools. Desktop, 390px, 320px and keyboard verification using the existing Admin harness.
- Run `npm run check`, `npm run test:access` and `node tests/integration/admin-ui-browser.mjs`. Use real saved public-page fixtures and the native PostgreSQL harness to prove meaningful positive writes and protected-field behavior, not only mocked status text.
- Update `docs/ADMIN-UI.md`, `docs/ADMIN-TRIGGERS.md`, `docs/PROCUREMENT-WORKFLOW.md`, the current Saline research report and relevant active county requirements with a dated supersession note: earlier non-SAM approval preservation remains historical and is superseded **only for this county policy**. Keep independent workflow requirements accurate; do not rewrite historical receipts as automatic saves.

After authorized implementation release, deploy the matching Render backend before the Netlify draft preview. Apply any necessary tested private function migration in a compatible order; do not add tables merely to duplicate existing jobs/receipts. Preserve old in-flight reviewed packages and unknown outcomes during rollout. Record rollback/compatibility steps; rollback must not delete correctly saved leads or provenance. Verify production deployment ID/lock before and after; **never publish Netlify production**.

Live acceptance must show a real Saline manual run automatically writes a valid opportunity to Leads, followed by a repeat that reuses its canonical identity. Use the current verified LRWRA record only if it still passes current evidence/window/location checks; it is Little Rock work within the existing selected-city scope, not proof of a physical Saline County site. Verify one disposable future scheduled occurrence with the browser closed and automatic canonical readback; archive the disposable schedule afterward. Use isolated tests for destructive failure injection and sales-edit protection; do not modify a user's real notes/stage merely to demonstrate preservation. Record actual added/updated/unchanged identities, usage, linked evidence, import receipts, trigger/occurrence IDs and cleanup. Zero results or candidate-only staging do not satisfy nonempty automatic-import acceptance.

## Success criteria and remaining decisions

- Valid county results automatically reach Leads from manual and scheduled requests, with no per-run approval, reason or checkbox.
- Duplicate identity, evidence, actual location, date/category and native SQL checks remain enforced; notes and sales stages remain protected.
- Saved results are traceable to official evidence and verified receipts; repeats and observation chains do not create duplicate canonical leads.
- Invalid/ambiguous records and inaccessible sources have clear separate outcomes; valid independent records still save. Uncertain writes retain reconciliation holds.
- Existing behavior outside county automatic imports and Netlify production remain unchanged. No new paid provider or AI budget increase.
- Required automated, visual and nonempty live acceptance pass before moving this plan to `specs/done/`. Report exact blockers if acceptance cannot complete.

No product decision is required before implementation. The user has explicitly requested automatic county imports; retain validation failures as exceptions, not another routine approval gate.
