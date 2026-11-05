# 01 — Persist verified run results

Completed and released November 5 after explicit owner authorization; see [production release](../../docs/reviews/2026-11-05-scheduling-read-decoupling-release.md). Atomic publication/recovery and lifecycle integration passed local/native tests. All 84 historical runs were qualified from saved evidence; 53 supported projections were published, with 31 unsupported histories unavailable. No original evidence or execution state was rewritten. Earlier planning prohibitions below are superseded for this release only.

Part of [Decouple saved scheduling reads from Render](decouple-scheduling-reads-from-render.md). Read that plan and its initiating prompt first. This spec covers phases 1–2 of six. Do not deploy or backfill production during implementation without separate release authorization.

## Phase 1: Establish the evidence and compatibility contract

1. Recheck repository changes and preserve the deployed startup fix. Extend the existing read-only inventory into a private per-run eligibility report sufficient to run and verify a bounded backfill. Use explicit read-only transactions with statement timeouts; never update parent/job state to make it eligible. No new approval-manifest subsystem is required.
2. For each parent and linked request, classify target/work flags, source-maintenance-only runs, relevant imports, verified receipts, versioned/legacy record shapes, empty-result evidence, incomplete jobs/usage holds, malformed references, and missing historical classifications. Record evidence hashes and reasons. Standalone imports need inspection only to establish whether they contribute to an in-scope run; do not migrate their separate workflows.
3. Build golden fixtures using the existing functions in `verified-reporting-records.mjs`, `reporting-identities.mjs`, `schedule-reporting.mjs`, `admin-analytics.mjs`, and `canonical-reporting.mjs`. Capture null vs zero, known subtotal, independent category completeness, source maintenance, SAM no-import completion, legacy aggregate-only receipt counts and their differing availability across screens.
4. Record all completion/reopen paths: `checkpoint_procurement_trigger`, `control_procurement_trigger`, `county-triggers.wake`, import verification, import reconciliation, new child/job attachment, cancellation, late receipts and outstanding usage reservations. A parent `completed` flag alone is insufficient.
5. Produce the impact/decision list required by the parent plan. Scope any necessary behavior changes explicitly before implementing them. Respect the owner's decision to keep known subtotals.

### Finalization eligibility

Separate three properties: execution state, membership verification, and collection coverage. A verified saved lead is not proof that every source was checked.

- Complete membership requires parent state `completed`, a stable complete child set, no pending/running/partial/failed/blocked/outcome-unknown **relevant** collection/import work, no unresolved relevant receipt uncertainty, and valid identities for the work whose lead totals are claimed. Do not change execution states to satisfy this rule.
- Identify irrelevant legacy coordinator/research jobs using the existing worker's explicit completion rules and evidence, not a blanket rule that every historical job must succeed. Document and test each exclusion. A genuinely failed collection/import must prevent a fully verified result.
- Maintenance-only work remains `not_applicable` for lead metrics, rather than a successful zero-lead collection.
- A proven successful no-result run can have an empty member set and Known zero. An empty/missing array alone does not establish this; retain the existing evidence-backed SAM no-import case only with complete saved disposition evidence.
- Partial/Needs-review/Cancelled/Unknown work may expose supported member facts and known subtotals. It cannot be labeled a fully verified completed run. Missing categories may permit known identities while category totals remain unavailable.

## Phase 2: Add current-result persistence and recoverable publication

### Proposed schema, with necessity test

Use existing trigger/job/status/usage/audit/source tables as authoritative inputs. Do not create another jobs queue or duplicate captured evidence. Propose only these two new tables, both prefixed `procurement_`:

| Table | Purpose and minimum fields |
| --- | --- |
| `procurement_run_results` | One current header per `trigger_id`: result revision/fingerprint, generated time, source fingerprint, execution state at projection, completeness/reasons, existing metric counts and identity snapshot. No permanent revision history. |
| `procurement_run_result_members` | Current indexed, deduplicated members per `(trigger_id, lead_id_at_finalization)`: matching result revision, outcome, as-imported categories, historical-opportunity flag, and contributing original/alias IDs needed for reconciliation. No copied full payloads, capture bodies or credentials. |

Before creating them, verify no existing structure can support the needed current-result header and indexed verified members. `procurement_request_leads`/`procurement_intake_leads` are relationships, not currently a verified outcome/category contract. Evaluate extending an existing relation or a header field on the parent instead of automatically adding both tables. The reason for normalized members is bounded filtering/paging without repeatedly expanding all job checkpoints; prior-generation storage is not a requirement.

Use foreign keys where appropriate; no cascading deletion from a mutable lead/job may erase the original historical evidence. Index current members by run/lead and outcome only as justified by existing query requirements. Reuse existing trigger date/schedule indexes; measure before adding redundant indexes. Keep raw result tables inaccessible to browser writes/reads; expose only safe RPC projections in spec 02.

Use the smallest source-revision/invalid marker needed to distinguish a current result from changed evidence, preferably on the parent/header. Advance only for relevant evidence/topology/state changes; log appends and unrelated usage events must not rebuild membership. A fingerprint/revision is for consistency and retry, not a new result-history feature.

### Generation algorithm

Reuse existing JavaScript normalization/reduction during Render's gather/import/run-finalization lifecycle. Only saved reads need to be independent of Render; requiring all finalization computation to move into PostgreSQL would add an unnecessary second worker design. Use a small trusted database operation for atomic result replacement and source-revision checks. Move write-side computation into SQL only where demonstrably simpler or required for atomicity, not as an architectural requirement.

```text
existing execution/import/reconciliation boundary
  -> mark the affected saved result out of date if its inputs changed
  -> reduce verified saved job facts using the existing reporting rules
  -> trusted RPC verifies expected source revision and atomically replaces
     the current header and all members
  -> unchanged source fingerprint is an idempotent no-op

saved read
  -> read current stored result and current persisted run state
  -> never run finalization, start work, or fall back to Render
```

Cover the actual completion, partial-result, reopen, cancellation and reconciliation paths found in phase 1. Prefer extending existing trusted lifecycle/checkpoint operations rather than installing a new trigger-driven computation system. If a small invalidation trigger is necessary for an existing direct-write path, keep it limited to that need. Publication must check the current source revision and serialize competing writes per run. Do not run finalization on log appends, progress polls or unrelated jobs.

Projection failure must not convert a successful import into an uncertain import or undo its verified receipt. Keep publication atomic and separate from the already-verified import outcome; leave the derived result unavailable/out of date for retry. Do not expose a partly replaced result or retain a false complete flag. Test the actual transaction/failure boundaries.

Recovery reuses the same idempotent finalization path when the existing worker next legitimately resumes; a bounded operator/backfill script may call it for missed results. Persist only the marker needed to recover interruption after source completion but before publication. A crash in that interval may temporarily leave results unavailable, never falsely complete; qualified retry fills the gap without repeating collection or imports. Do not add a repair UI, generic repair framework, queue, scheduler, keep-alive, or read-triggered finalization. Routine completed runs must have their saved result published at their existing lifecycle boundary rather than depending on later viewing.

### Exact aggregation rules

- Version-1 receipts are produced only after verified readback from the exact manifest. Prefer them over legacy `county_records`; never count both representations of the same job.
- Deduplicate per run using canonical identity at finalization; outcome precedence is `added > updated > unchanged`. Union all as-imported categories; preserve `historical_opportunity` separately while including it under Opportunity.
- Persist the complete per-run population before category filtering. Filter before the appropriate report-level reduction exactly as the existing analytics reducer does; filtering an already reduced cross-run outcome can change a selected-category result.
- Record input provenance/source and identity fingerprints, so duplicate callbacks, changed algorithm versions, new receipts and stale submissions are distinguishable.
- Preserve any legacy aggregate-only counts only in a separately qualified count-only field with identities unavailable. Never manufacture member rows from aggregate counts or current lead data. Keep existing screen differences unless a change is explicitly approved.

### Reopen, late writes and canonical merges

Completed runs can become pending after saved review/reconciliation. Invalidate current completeness when the inputs/run state change; original receipts remain preserved. Active readers see existing persisted progress and supported known subtotals, never a stale completed result masquerading as current. Atomically replace the derived result at the next relevant lifecycle boundary. Do not change recurrence, enqueue, claim or resume rules, add status types, or persist a full result after every progress event.

Canonical reconciliation must preserve the existing `county-ionwave-solicitation-v1` rule: redirect target exists, has the same source, and is not itself a redirect. A missing, chained, cyclic, cross-source or invalid target produces reconciliation-unavailable, not silent omission. Do not add arbitrary recursive merge semantics.

Keep original IDs and frozen classifications/outcomes in the existing source receipts. The current derived result stores the deduplicated grouping and contributing IDs needed for reconciliation. After a later merge, the secured read projection resolves current saved redirects and reduces again where identities now converge. This preserves existing behavior without reconstructing historical import outcomes. Include relevant redirect mappings in existing report fingerprints so a changed merge invalidates its page anchor. Do not rewrite original receipts, add merge history, or infer old facts from the surviving lead's current payload.

### Phase acceptance

- Repeated finalization returns the same revision and exact members/counts; concurrent finalizers publish only one generation for a source fingerprint.
- Crash/timeout before publication exposes no mixed generation; retry repairs it without repeating provider calls or import writes.
- Parent completion before a last receipt, late child insertion, reconciliation, reopen/cancel and uncertain jobs cannot retain a false complete flag.
- Source-maintenance, proven empty SAM, aggregate-only legacy, malformed legacy, duplicate jobs/intakes, category transitions and canonical merges have meaningful native database tests.
- Projection bounds/failures do not invalidate an import receipt or block normal execution; dirty state is observable to trusted operators.

Deliverable: the minimum additive persistence migration(s), reuse of existing gather/finalization reducers, a trusted atomic result-write operation, lifecycle integration/recovery and focused fixtures. Include a dry-run eligibility report; no new manifest subsystem or historical production backfill yet.
