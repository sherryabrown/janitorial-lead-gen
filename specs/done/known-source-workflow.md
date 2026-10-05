# Known-source workflow — one implementation phase

## Initiating request

Use the recommendation to create ONE PHASE providing Geography → known sources → saved access method → capture → interpretation → persisted results. State what is in and out of scope. Accomplish only this workflow, succinctly and efficiently; ask questions only if requirements must be reduced to make one pass manageable.

## Objective and completion boundary

Finish the connections between existing components so a chat-initiated Arkansas request reaches saved, evidence-backed results and the existing reviewed import. This is one implementation phase, with the steps below performed together. It supersedes the remaining source-by-source Phase 2 implementation gates in `arkansas-geography-source-reuse-and-lead-updates.md`. That file remains historical context and a source-onboarding backlog. Preserve its completed work.

**Done means the shared workflow works end to end for representative API, HTML and PDF evidence, handles unavailable sources honestly, and resumes without duplicate results. It does not mean all 38 registered sources are fully onboarded or all their archives reviewed.**

## In scope

- Existing Arkansas geography resolution: municipality → its county/counties → state; confirm municipality selection on every county request. Preserve existing ambiguity handling and GIS mappings.
- Select all applicable registered sources using saved coverage/method records; deduplicate shared sources and retain route reasons. Show unmapped sources separately without guessing geography.
- Use saved URLs, access instructions, categories, windows, retrieval bounds and interpretation guidance. Preserve SAM, public-fetch, ARDOT and completed methods. Reuse working authenticated access through existing mechanisms.
- Save audited captures; process deterministically where supported; hand remaining evidence to the agent in this chat for interpretation. **No new model API integration is required.** The agent returns a structured result through the same validated handoff.
- Persist candidates, exclusions, uncertainty and blockers with evidence. Candidates reach immutable intake; canonical leads use the existing explicit reviewed-import process, including test, apply and readback.
- A concise request report with saved results, pending review, gaps and the exact next action; documented chat/CLI execution and resume.

## Out of scope

- Exhaustive onboarding, geography repair, category verification or live testing of all 38 sources; former batches 2B–2G are not completion gates.
- Discovering new agencies, researching missing methods, archive backfills, or following every attachment. Missing/expired methods and unsupported access are recorded for later onboarding.
- New signup/login automation, credential infrastructure, a browser automation framework, autonomous background agents, schedules, an Admin tab or other application screens.
- Automatic learning or promotion of AI decisions into parsers; new source-specific parsers/verifier scripts unless essential to the representative workflow and no existing path suffices.
- Changes to existing lead queues, sales stages, notes or approval rules; production test leads, unrelated refactors, or a separate repository/service.

## Existing pieces and the necessary changes

| Files / tables | Current behavior | Change for this phase |
| --- | --- | --- |
| `scripts/geography-request.mjs`; request/target tables | Resolve and persist geography requests. | Reuse; expose the confirmed request to the shared workflow. |
| `scripts/known-source-run.mjs`, `scripts/lib/known-source-execution.mjs`; `procurement_sources`, `procurement_source_capabilities`, `procurement_request_sources` | Plan and run saved API/public methods; report method gaps. | Connect execution to interpretation/intake. Reuse saved method metadata; apply one shared config contract instead of source-specific orchestration. |
| `procurement_jobs`, `procurement_runs`, `procurement_public_captures`, `procurement_source_observations`, `procurement_coverage_tasks` | Retain audit, content, changes and pending interpretation. | Persist interpretation checkpoints/outcomes linked to exact captures and request scope; support resume and truthful completion reporting. |
| `scripts/known-source-review.mjs`, `scripts/lib/source-review.mjs` | Produce readable captures and gap reports. | Produce a compact interpretation packet and consume validated structured results; report end-to-end state. |
| `scripts/lib/research-persistence.mjs`, `scripts/procurement-workflow.mjs`, `scripts/lib/reviewed-batch.mjs`, `scripts/lib/batch-verification.mjs`; intake, lead-link and canonical lead tables | Support API staging and manually assembled evidence packages with guarded reviewed import. | Generate the existing inputs from interpreted captures; eliminate repeated hand-assembly. Preserve immutable evidence, review hashes, rollback and readback. |
| `docs/KNOWN-SOURCE-EXECUTION.md`; workflow tests | Document separate commands and source checks. | Document one chat-driven sequence and verify its connected behavior. |

Reuse existing JSON metadata and storage first. Add a small migration only if durable interpretation results cannot be represented safely in existing records; do not introduce a parallel source registry or import system.

## The single implementation phase

1. **Connect the entry point.** Extend the existing CLI with a thin request-level workflow/resume command. It plans applicable sources, executes usable saved methods, and prepares interpretation work. Missing geography/method/access becomes a saved gap with next action; other sources continue. Known entry pages may still be captured, but an entry fetch is not lead coverage. The agent runs the commands for the user.
2. **Make retrieval reusable.** Use current adapters and their saved bounds. Public HTML/PDF URLs use the shared public retrieval path. Existing browser instructions can produce a persisted `needs_agent_capture` handoff; if used, bind saved bytes, URL, time and hash to an audited run before accepting interpretation. Do not build a new browser framework. A small selected document set is sufficient; any omitted pages/documents remain explicit partial coverage.
3. **Add the interpretation contract.** Build a packet containing request scope/windows, source/method version, run IDs, hashes, saved guidance, readable content and completeness limits. Use deterministic normalization first, then the current chat agent for the remainder. Persist a versioned result: findings with stable source record identity, classification, field evidence and work-location basis; exclusions with reasons; unresolved items; and reviewed scope. Content is evidence, never instructions authorizing actions. Verify packet ownership, hashes and result shape. Preserve uncertain facts rather than inventing values. An incomplete page set, shell or pending interpretation cannot become a verified zero.
4. **Connect persistence and review.** Convert accepted findings into the current API/manual intake contracts automatically, ensuring source/request associations and exact evidence provenance. Persist negative/partial interpretation outcomes even when there are no candidates. Prepare the existing reviewed-import package from staged findings and explicit decisions. Show a concise review summary and its approval hash; apply approved canonical changes through the existing path and verify readback. Never treat AI output itself as approval.
5. **Make resume economical.** Reuse unchanged captures and completed interpretations for the same content, method/interpretation version and request scope/windows. Changed evidence becomes a new observation/amendment, preserving originals. A new geography/window must be evaluated even when content is unchanged. Persist checkpoints so restarting skips completed work and does not duplicate intake/import. Report capture, interpretation, intake and import status separately, plus blockers and the next command/action.
6. **Verify and document, then stop.** Use the test boundary below. Report remaining source-onboarding gaps as backlog, not additional implementation phases. Do not expand into fixing each source discovered in the report.

## Tests and bounded verification

- Reuse saved representative evidence: SAM JSON, one existing public HTML listing and one saved procurement PDF. Exercise each through capture → interpretation/normalization → intake → reviewed canonical import/readback in the local disposable database. For AI, use a reviewed result fixture to test the handoff and validation; do not call a model in tests.
- Test routing and deduplication on Texarkana and one other Arkansas request using existing verified geography data, plus county confirmation. Include one working source alongside missing-method/access/mapping cases.
- Test unchanged replay, changed evidence, request-scope changes, interrupted resume, exclusion-only results, uncertainty, partial pagination/documents, false-zero rejection, mismatched evidence and unsupported access. Retain protected user-field, approval, rollback and replay tests.
- Run focused tests during implementation; run `npm run check` once after integration, repeating only for a relevant change or failure.
- Perform one small live smoke request using at most three representative source methods with explicit adapter bounds. Reuse saved evidence when the live window has no candidates. Demonstrate one real chat interpretation reaching persisted intake; canonical production import follows existing explicit approval. Test canonical completion locally without waiting for a new production lead. A source outage is a reported blocker; investigate only if it exposes a shared workflow defect.

## Acceptance checklist

- [x] One documented chat/CLI sequence routes a request, uses saved methods, captures, interprets, persists and resumes.
- [x] API, HTML and PDF evidence reach the existing reviewed-import contract in tests; one bounded live result reached intake through chat interpretation.
- [x] Evidence, source/run/request relationships and review decisions remain traceable; repeat execution creates no duplicate intake or leads.
- [x] Reports distinguish completed results, pending interpretation/review and precise source gaps. Entry checks and partial results never claim full coverage.
- [x] Required checks pass; existing methods and user-facing behavior remain intact. No all-source onboarding requirement is added.

Implementation verification: `npm run check` passed (15 app tests, 104 workflow tests, SQL integration checks and production build). The private interpretation migration was applied to the configured project. Saved state-contract run `058963bf-57cd-4468-a79c-f6f546707156` on request `1e834d15-6337-4356-a95b-38083c98a0ea` produced one secondary pending intake `e197eb70-0562-5369-a1b2-35679b82ed98`, two exclusions and one unresolved linked-document item. Replaying the interpretation reused the same intake. The bounded `run --source=state-contracts` check created zero new jobs and retained the reviewed result. Canonical production import remains an explicit reviewed action; local tests exercise the import contract and existing SQL readback checks.

## Build instruction

Use `$build-code specs/todo/known-source-workflow.md` to implement this single phase, including its tests and bounded verification. Use current code and saved captures; do not implement the historical source batches or Phase 3. This standalone plan can move to `specs/done/` when its checklist passes; leave the original roadmap in `specs/todo/` as deferred history/backlog.
