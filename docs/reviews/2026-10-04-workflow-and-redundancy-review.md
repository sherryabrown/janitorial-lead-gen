# Workflow and redundancy review

Reviewed October 4, 2026. Scope: the current local working tree, including uncommitted work; source retrieval, interpretation, intake/import, application integration, related access controls, tests, and all five plans in `specs/todo/`.

## Conclusion

The reusable workflow exists as connected CLI components, with chat interpretation and reviewed import requiring explicit steps. It is not yet a reliably resumable, fully reported end-to-end workflow. Calling the single-phase plan complete was too broad.

The main problem is accumulated layers and conflicting status: source-specific onboarding scripts, overlapping planners/reports, old plans still in `todo/`, and a new wrapper whose completion checks are incomplete. More source-by-source implementation is not the next priority.

## Findings, in priority order

P1 = correctness issue to resolve before trusting workflow results. P2 = functional or recovery defect to resolve before calling the shared workflow complete.

### 1. P1 — An empty application shell can become a verified zero

**Files:** [packet completeness](C:/Users/sherr/janitorial-lead-gen/scripts/lib/known-source-workflow.mjs:30), [interpretation validation](C:/Users/sherr/janitorial-lead-gen/scripts/lib/known-source-workflow.mjs:59), [public retrieval](C:/Users/sherr/janitorial-lead-gen/scripts/lib/public-source-check.mjs:36).

Completeness checks successful job/page accounting, but not whether the captured page contains the intended listing. HTTP 200 HTML is accepted by retrieval. An agent can submit a complete empty interpretation of a JavaScript shell and persist `reviewed_no_results`.

**Reproduced offline:** `<html><body><div id="app"></div></body></html>` with successful capture metadata returned `reviewed_no_results`. The readable-capture warning does not prevent this.

**Needed:** distinguish retrieval completion from usable category evidence; prevent shell/login/error pages from supporting a verified zero. Add a regression covering a previously verified URL that now returns a shell, plus a genuine empty listing that is allowed to conclude zero.

### 2. P2 — Two planners disagree about supported sources

**Files:** [geography planner](C:/Users/sherr/janitorial-lead-gen/scripts/lib/geography-routing.mjs:68), [geography command output](C:/Users/sherr/janitorial-lead-gen/scripts/geography-request.mjs:73), [execution adapter contract](C:/Users/sherr/janitorial-lead-gen/scripts/lib/known-source-execution.mjs:21).

The geography planner recognizes only SAM as runnable. The execution planner supports SAM, `public-fetch`, and `ardot-table`. A verified public method is therefore reported as needing implementation when a request is created, although execution supports it.

**Reproduced offline:** a current public-fetch capability produced `known: []`, `needs_research: false`, `needs_implementation: true`.

**Needed:** use one adapter-support/verification policy in both paths. Test matching routing and execution decisions for all three adapter families, expired methods, and entry-only sources.

### 3. P2 — A partial or mistaken interpretation cannot be revised on the same evidence

**Files:** [immutable decision check](C:/Users/sherr/janitorial-lead-gen/scripts/known-source-workflow.mjs:162), [packet identity](C:/Users/sherr/janitorial-lead-gen/scripts/lib/known-source-workflow.mjs:33), [unique checkpoint](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20261004000300_known_source_interpretations.sql:13).

A second result with different decisions for the same packet is rejected. Recreating the packet from unchanged evidence yields the same identity. There is no interpretation revision/supersession path. Correcting an AI error or completing a partial review of already-saved evidence therefore requires a changed packet or an external workaround.

**Needed:** preserve previous decisions while accepting explicit revisions; make the current decision identifiable and stage only new/amended observations. Test partial-to-complete and corrected interpretation without recapturing unchanged content or duplicating intake.

### 4. P2 — A failure between checkpoint writes leaves recovery stuck

**File:** [interpretation finalization](C:/Users/sherr/janitorial-lead-gen/scripts/known-source-workflow.mjs:172).

The CLI saves `staging_receipt`, then updates the coverage task. If the second write fails, rerunning sees the receipt and skips the entire block, including the task update. Persisted intake and task/report state can disagree permanently through normal replay.

**Needed:** atomic finalization or independently replayable task reconciliation. Inject failure after the receipt write and verify the next run repairs the task without staging duplicates.

### 5. P2 — The report does not track the final import, and misses SAM's next action

**File:** [workflow report](C:/Users/sherr/janitorial-lead-gen/scripts/known-source-workflow.mjs:189).

The report reads coverage tasks, interpretations, sources, and local SAM receipts. It does not read current intake disposition or canonical import linkage/readback. It can keep suggesting review after records have been processed. Its next-action condition considers public interpretation intake IDs but not SAM receipts; a SAM-only request can be told to inspect gaps or start a new request while candidates still need review.

**Needed:** derive intake and import status from persisted records, for both API and public findings. Test SAM-only pending review, deferred intake, successful import, and replay after import. Do not equate a staging receipt with a finished lead.

### 6. P2 — State-listing registration rejects its documented apply command

**File:** [argument validation](C:/Users/sherr/janitorial-lead-gen/scripts/verify-state-listing.mjs:5).

`node scripts/verify-state-listing.mjs CODE RUN_UUID --apply` has six `process.argv` entries. The guard rejects lengths greater than five, so the advertised apply form cannot reach registration.

**Needed:** validate the sliced arguments and test both preview and apply parsing without a real database. Finding established by static inspection. Automatic approval review rejected an attempted invocation because `--apply` could write to the configured database; it was not executed or bypassed.

### 7. P2 — The completed plan claims more than its verification demonstrates

**Files:** [completion criteria](C:/Users/sherr/janitorial-lead-gen/specs/done/known-source-workflow.md:11), [checked acceptance](C:/Users/sherr/janitorial-lead-gen/specs/done/known-source-workflow.md:60), [workflow tests](C:/Users/sherr/janitorial-lead-gen/tests/known-source-workflow.test.mjs:1).

The plan requires reliable resume and separate capture/interpretation/intake/import status. Findings 3–5 show gaps in those requirements. Tests exercise helpers and reviewed-import planning; the PDF fixture is a short `%PDF-1.4` string, not a representative parsed document. They do not run the new CLI through persisted canonical import/readback. The recorded live check reused saved captures, created zero new jobs, and staged secondary intake; it did not complete canonical import.

**Needed:** reopen the narrow workflow acceptance items. Add bounded integration coverage for API, real HTML and real PDF evidence through staging and reviewed import/readback in a disposable database, plus the recovery regressions above. Production import is not required to prove this.

## What actually happens today

| Step | Actual behavior | Main files | Stored data |
|---|---|---|---|
| Geography | Chat supplies an Arkansas municipality/county. County requests require city selection each time; ambiguous cross-county municipalities require county selection. | `scripts/geography-request.mjs`; `scripts/lib/geography-routing.mjs`; `scripts/lib/arkansas-municipalities.mjs` | `procurement_geographies`, `procurement_place_counties`, `procurement_search_requests`, `procurement_request_targets` |
| Find known methods | Match target/category to registered capabilities; schedule supported methods, entry checks, or gaps. | `scripts/known-source-run.mjs`; `scripts/lib/known-source-execution.mjs` | `procurement_sources`, `procurement_source_capabilities`, `procurement_coverage_tasks`, `procurement_jobs` |
| Capture API evidence | Call SAM using saved method/query bounds; audit pages and normalize observations. | `supabase/functions/sam-search/index.ts`; `scripts/lib/known-source-execution.mjs`; `scripts/known-source-run.mjs` | `procurement_runs`, `procurement_source_observations`; local capture artifacts |
| Capture public evidence | Fetch saved HTML/PDF URLs or ARDOT pages within saved bounds. Entry checks establish accessibility only. | `scripts/lib/public-source-check.mjs`; `scripts/lib/ardot-table.mjs`; `scripts/known-source-run.mjs` | `procurement_runs`, `procurement_public_captures`, task/job status |
| Prepare interpretation | `packet` produces saved bytes, readable review, hashes, scope and guidance for one category task. | `scripts/known-source-workflow.mjs`; `scripts/lib/known-source-workflow.mjs`; `scripts/lib/source-review.mjs` | Local packet/raw/review files under `outputs/known-source/` |
| Interpret public evidence | The chat agent reads evidence and writes structured findings/exclusions/unresolved items; `interpret` validates and persists the result. The CLI does not invoke a model. | Same workflow files; `scripts/lib/research-persistence.mjs` | `procurement_interpretations`, `procurement_intake_items`, coverage task outcome |
| Stage API candidates | The wrapper stages completed SAM route captures through the existing intake command. | `scripts/known-source-workflow.mjs`; `scripts/procurement-workflow.mjs`; `scripts/lib/research-persistence.mjs` | `procurement_intake_items`, local SAM receipts |
| Review and import | `review-template` collects candidates. The agent fills explicit decisions, then uses snapshot/schema/prepare/test/apply/readback. Canonical apply requires the existing reviewed approval. | `scripts/procurement-workflow.mjs`; `scripts/lib/reviewed-batch.mjs`; `scripts/lib/batch-verification.mjs`; `scripts/lib/intake-reconcile.mjs` | `procurement_leads`, `procurement_intake_leads`, `procurement_request_leads`, versions/events/receipts |
| Use leads in the app | Signed-in users see canonical leads and update stages/notes. Pending public captures/intake are not the lead queue. | `src/features/auth/AuthGate.tsx`; `src/app/AppShell.tsx`; `src/lib/procurement.ts`; `src/features/contracts/save-lead-change.ts`; queue/history/access migrations | Canonical lead queue, notes, stage changes |

The wrapper reduces command coordination, but does not remove interpretation and import decisions. No Admin screen, background scheduler, automatic source discovery/learning, or generic browser-session capture engine is implemented by this workflow. The plan mentions an optional `needs_agent_capture` handoff; no implementation of that state was found in scripts/tests.

## Redundant code versus necessary separation

| Area/files | Assessment | Recommended treatment |
|---|---|---|
| `geography-routing.mjs` and `known-source-execution.mjs` | Duplicate eligibility logic has diverged; finding 2. | Share one method-support policy. |
| `known-source-workflow.mjs`, `known-source-review.mjs`, `ardot-review.mjs` | Overlapping reports/review entry points; ARDOT also has useful table aggregation. | Give the workflow one authoritative status/next-action report; retain reusable extraction/review helpers. |
| `known-source-workflow.mjs`, `known-source-run.mjs`, `procurement-workflow.mjs` | Layers, not wholesale duplicates: orchestration, capture, and reviewed intake/import. | Keep responsibilities; expose one documented normal path. Do not rewrite the import engine. |
| `verify-state-listing.mjs`, `verify-state-record.mjs`, `verify-arbuy-open-method.mjs`, `verify-ardot-method.mjs`, `verify-dhs-method.mjs`, `verify-uaht-method.mjs` and verification libraries | Repeated registration plumbing around different source-specific evidence checks. | Eventually share lookup/registration/readback plumbing. Preserve completed validators and methods. Not a prerequisite to add more adapters. |
| Pagination helpers in geography/run/review/workflow scripts; repeated artifact-writing helpers | Small utility duplication. | Consolidate when touching those paths; lower priority than correctness. |
| `prepare-sam-upserts.mjs`, `prepare-intake-processing.mjs`, `verify-intake-processing.mjs` | Historical fixed-batch tooling, outside the normal reusable workflow. | Clearly archive/document as historical; preserve fixtures and audit value. |
| `scripts/lib/intake-reconcile.mjs` | Historical batch constants coexist with functions still used by reviewed import. | Split historical material if cleaning up; do not delete the module. |
| `src/lib/procurement.ts:236` `findLeadIdsByActivityDate` | No caller found in source/scripts/tests. | Candidate for removal after confirming no external consumer. |
| `prompts/procurement-bid-site-finder.md` and `supabase/functions/spin_generate_contracts/prompts/procurement-bid-site-finder.md` | Exact duplicate; SHA-256 hashes match. | Select one authoritative prompt if the legacy generator is retained. |
| `spin_generate_contracts/index.ts`, Generate components/types in `AppShell.tsx`, legacy `spin_*` tables | Separate, dormant generation path; Generate is disabled. It is not the new known-source workflow. | Keep clearly dormant or retire separately. Do not activate it as a shortcut: its prior documented authentication/cost/import gates remain. Live deployment was not checked in this review. |
| Database migrations and baseline schema | Earlier definitions are history, even when later migrations replace functions. | Retain applied migrations. Do not deduplicate migration history. |
| Sources, capabilities, captures, interpretations, intake, leads | Different responsibilities, not redundant tables. | Preserve: directory → access recipe → evidence → interpretation → candidate → reviewed lead. |

## Every plan currently in `specs/todo/`

| Plan | Current mismatch/overlap | Recommended disposition |
|---|---|---|
| `arkansas-geography-source-reuse-and-lead-updates.md` | Top-level note defers source batches, but the long body retains completed work and 2A–2G/Phase 3 instructions. | Archive completed history; retain a compact deferred onboarding/discovery backlog. Do not execute old batches as workflow completion gates. |
| `procurement-tables-ui-integration.md` | Describes an earlier mock/spin UI and missing integration; the current UI already uses procurement queues, stages and notes. Also mixes in a different generator migration. | Supersede the implemented UI portion. Keep any generator retirement/replacement decision separately deferred. Do not call every old objective completed. |
| `reviewed-security-and-maintainability-recommendations.md` | Explicitly superseded by `specs/done/02-code-review-remediation-and-authenticated-data-access.md`; its earlier review scope/access proposals are stale. | Archive as superseded, preserving legacy-generator activation gates. |
| `supabase-new-api-keys-security.md` | Browser already reads `VITE_SUPABASE_PUBLISHABLE_KEY`; edge code uses secret-key configuration. Its premise and old file references are stale. | Close/supersede completed code changes. Treat any actual key rotation/deployment validation as an operational check, not a new code migration. |
| `supabase-connectivity-test.md` | Old troubleshooting instructions include legacy tables/generator paths. | Convert to a short troubleshooting runbook using harmless reads. Do not invoke paid generation or writes merely to test connectivity. |

`specs/done/known-source-workflow.md` is the appropriate place to identify the remaining shared-workflow defects, but its completed status should be corrected before another build request. No plan was moved or rewritten during this review.

## Verification and limits

- Ran the geography-routing, known-source-execution and known-source-workflow suites: **12 tests passed**.
- Ran two additional offline reproductions: empty-shell false zero and unsupported-public-method preview; both reproduced the findings above despite those tests passing.
- Compared prompt hashes and searched helper callers, adapter/state support, plan supersession and application integration.
- Reviewed local auth/client, SAM handler, migration access boundaries, UI read/write integration and dormant generator separation. This was not a live permissions/deployment audit or a line-by-line certification of every UI component.
- The previous implementation recorded a passing full `npm run check`; this review did not rerun the full gate or treat that earlier pass as proof of the uncovered paths.
- No external source requests, live database mutations, deployments, commits, refactors, or plan cleanup were completed for this review. Only this report was added. Existing uncommitted work was preserved.

## Smallest useful next step

Fix the shared workflow's six concrete defects above and add their regression/integration coverage. Correct its completion record and retire misleading todo instructions. Keep existing adapters and reviewed-import machinery. Then verify one representative API, HTML and PDF path; expand source onboarding only when a requested geography needs it.
