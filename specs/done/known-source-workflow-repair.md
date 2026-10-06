# Repair the known-source workflow

## Initiating request

> Use `docs/reviews/2026-10-04-workflow-and-redundancy-review.md` to create one concise repair plan for the existing known-source workflow. Cover findings 1–7, including regression tests and end-to-end verification. Reconcile superseded plans. Preserve working adapters and import logic. Exclude new sources, Phase 3, UI changes, and optional code cleanup. Keep implementation manageable without separate plans per finding.

## Outcome and boundary

One implementation phase makes the current Arkansas chat/CLI path trustworthy and resumable:

`confirmed geography → registered method → audited capture → interpretation → staged intake → explicit reviewed import → accurate report`.

Reuse `sam-search`, `public-fetch`, `ardot-table`, the existing intake planner, and `procurement-workflow.mjs` approval/readback. The chat agent still interprets public evidence and a human still approves canonical import. No new source onboarding, Phase 3 discovery/learning, application screen, background runner, generic browser framework, legacy Generate activation, or unrelated code cleanup.

**Current evidence:** [the review](../../docs/reviews/2026-10-04-workflow-and-redundancy-review.md) reproduced an empty HTML shell becoming `reviewed_no_results` and a valid public method appearing unsupported in geography preview. It also identified revision, recovery, status, CLI argument, and completion-evidence gaps. Preserve existing source records, captures, intake and migration history.

## One phase: repair and verify the shared path

### 1. Make method readiness and coverage honest (findings 1, 2)

- In `scripts/lib/geography-routing.mjs`, use the same verified adapter check as `scripts/lib/known-source-execution.mjs` for SAM, `public-fetch`, and `ardot-table`. Keep source-entry availability separate from category coverage. A preview and a plan for the same request/capability must agree on `known`, missing method, and unsupported runner.
- In `scripts/lib/known-source-workflow.mjs` and the public capture/review path, distinguish **retrieval complete** from **content sufficient to conclude zero**. A successful HTTP response or terminal page count alone cannot prove an empty listing. Reject or keep partial a login page, error page, empty JavaScript shell, unreadable PDF, or uninspected linked document. To record `reviewed_no_results`, require an explicit evidence-backed zero basis tied to saved run(s) and the exact reviewed listing/scope (for example, a verified empty-state marker or an inspected complete listing). Validate its locator/excerpt against saved content; if a source offers no verifiable zero basis, report partial/unknown. Do not use arbitrary page-length thresholds as proof. Keep a genuinely empty, verified listing eligible for zero.
- Add regression tests in `tests/geography-routing.test.mjs`, `tests/known-source-execution.test.mjs`, `tests/known-source-workflow.test.mjs`, and focused capture tests for shell, login/error, valid empty listing, linked-document uncertainty, stale capabilities, and all three adapter families.

### 2. Let a saved interpretation be corrected and safely resumed (findings 3, 4)

- Add a forward migration after `20261004000300_known_source_interpretations.sql`. Keep prior decisions and receipts. Support an explicit new revision for the *same* packet when the agent corrects a finding or completes a partial review; make the current revision unambiguous under concurrent attempts. Replaying the current result is a no-op. Changed capture, method version, or request scope continues to produce a new packet. Preserve the old decision as history; do not silently retract a processed canonical lead.
- Update `scripts/known-source-workflow.mjs` and `scripts/lib/known-source-workflow.mjs` so staging identity includes the accepted interpretation revision/result, not just `packet_hash`. Reuse existing manual amendment and `source_id`/record identity rules in `scripts/lib/research-persistence.mjs`; stage only a new or changed observation. A removed or corrected earlier finding must remain visible for explicit review rather than being presented as a completed correction to an already imported lead.
- Make finalization replay-safe: storing the staging receipt and setting the coverage task outcome must both eventually complete. A retry after failure at either write reconciles the missing state without another intake insert. A transaction/RPC is acceptable if it preserves existing authorization; a guarded, idempotent readback/reconcile is also acceptable. Detect conflicting concurrent revisions instead of choosing one silently.
- Test unchanged replay, partial-to-complete revision, corrected finding on unchanged bytes, amended intake, failure after staging and after receipt persistence, concurrent revision conflict, and canonical lead preservation.

### 3. Report the real next action and repair the one CLI defect (findings 5, 6)

- In `scripts/known-source-workflow.mjs`, share candidate collection between `report` and `review-template`. Include public interpretation receipts **and** SAM candidates found by their saved run provenance. Read `procurement_intake_items.status`, `procurement_intake_leads`, `procurement_request_leads`, and canonical leads/verified import receipts as needed to distinguish captured, awaiting interpretation, staged/pending review, processed/imported, and blocked/partial. A local staging receipt alone is not an import. If an explicit deferral is not durably recorded, show it as still pending rather than inventing a completed review state. Show one actionable next command from this state.
- In `scripts/verify-state-listing.mjs`, fix argument parsing so the documented preview and `--apply` forms are accepted and extra arguments rejected. Unit-test the parser without calling the configured database; do not run `--apply` as part of planning or verification.
- Add report tests for SAM-only pending intake, public-only intake, mixed request, processed import, no-results, gaps, and interrupted-recovery state. Preserve the existing reviewed approval hash requirement.

### 4. Prove completion and reconcile plan status (finding 7)

- Add one bounded **local** integration scenario through the existing capture/interpretation/intake/import interfaces, with representative saved SAM JSON, meaningful HTML listing, and a valid saved procurement PDF. Use an agent-reviewed result fixture for HTML/PDF; do not invoke a model in tests. Exercise persisted staging and `procurement-workflow.mjs` reviewed package, local SQL test, and canonical readback/links. Verify replay does not duplicate intake or leads. Keep real network and production canonical writes outside this test.
- Retain existing approval, protected-field, and rollback tests. Run focused regressions during development and `npm run check` once after integration; repeat only for a relevant failure/change. A small read-only live report against an existing confirmed request may check deployment compatibility, but cannot substitute for the local import test. Document any unverified live behavior.
- Update `docs/KNOWN-SOURCE-EXECUTION.md` with **one** normal chat/CLI sequence and the manual interpretation/approval boundaries. Correct `specs/done/known-source-workflow.md` with an audit note that its original checkmarks exceeded the evidence and link this repair; do not rewrite its historical verification record as if it never happened.
- Reconcile the five old `specs/todo/` entries without executing their deferred work: move the superseded security and API-key plans to historical `specs/done/` with explicit status; move the old connectivity test to a non-executable reference or replace it with a concise read-only troubleshooting note; preserve the mixed UI/generator and Arkansas source-roadmap documents as clearly **deferred** references outside the active `todo/` queue. Keep outstanding generator and source-discovery decisions visible in their headers. After this repair plan is implemented and moved by `build-code`, `specs/todo/` should contain no stale instructions to rerun 2A–2G or reactivate Generate.

## Acceptance checks

- [x] Preview and execution agree for every supported adapter; entry checks never imply lead-category coverage.
- [x] Shell/login/error/unreadable evidence cannot produce `reviewed_no_results`; a supported true empty listing can.
- [x] Same-packet corrections preserve history, stage amendments once, and require explicit review for changes to canonical leads.
- [x] A retry after each interrupted write repairs task/receipt state without duplicate intake.
- [x] Report and review template agree on API/public candidates and show whether intake has reached canonical import, with an accurate next action.
- [x] State-listing preview/apply arguments parse correctly in offline tests.
- [x] API, HTML, and valid PDF fixtures pass one local reviewed-import/readback flow, plus replay and approval/rollback checks; `npm run check` passes.
- [x] Documentation and five stale todo plans have explicit current status. Existing adapters and UI behavior remain intact.

Implementation evidence (October 5, 2026): `npm run check` passed 15 app tests, 111 workflow tests, SQL checks, lint and production build. The focused repair suite passed again after its final canonical-preservation assertion. The local SQL scenario imported reviewed SAM, HTML and valid PDF evidence with rollback, readback and replay checks; `pdfinfo` accepted the one-page PDF fixture. The forward migration was applied to project `zreplhkoxswtzxlchtjf`, recorded as version `20261005000100`, and a read-only report plus review-template check agreed on one pending public candidate. Production canonical import was not invoked. Older migration-history discrepancies shown by `supabase migration list` predate this repair and were not changed.

## Build instruction

Use `$build-code specs/todo/known-source-workflow-repair.md` to implement this **single phase** and its tests. Apply any forward migration through the normal reviewed deployment process. Do not run a production reviewed import without its existing explicit approval. Move this plan to `specs/done/` only when every acceptance check is evidenced; otherwise leave it in `specs/todo/` with the remaining check named.
