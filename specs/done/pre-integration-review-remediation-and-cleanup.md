# Pre-integration review remediation and cleanup

## Original prompt

> we're about to start wiring up the UI to the backend functionality of getting, updating, using, and persisting the leads and scheduling the updates. before we do that, please do a complete code review to ensure the efficient, effective use of code. as part of this code review, determine what code, docs, references, etc are present that do not represent what is currently occurring in the code (or being used for the basis of future functionality) so that we can delete them.

User clarification: **Keep the disabled Companies and email-preview features as future functionality.**

## Problem and objectives

The procurement queue already has persisted reads/stages/notes/history. Hosted collection/review/import exists separately, and recurring scheduling has not been implemented. Before wiring these together, fix review findings and make current contracts/documentation unambiguous. Remove only material established as unused or superseded with no remaining future/test/audit purpose.

Evidence and exact file anchors: `docs/reviews/2026-10-12-pre-integration-code-review.md` (F1–F7 and deletion/retention table).

This plan changes no deployment, live data, schema history, product permission rules or import approval boundary. It does not authorize UI collection wiring, new schedules, bulk archive deletion or removal of retained future prototypes. Follow AGENTS.md: ask about unrequested affected behavior; preserve queues, selection context and next useful action.

## Phase 1 — correctness and dependable validation

1. Fix F5 by excluding private/generated output and machine state from ESLint. Keep maintained scripts, tests, frontend, config and functions in scope. Verify `npm run check` no longer parses ignored output helpers.
2. Fix F1 using the existing `saveLeadChange` pattern or an equivalent typed result. A confirmed write must be distinguishable from a failed refresh. Note write failure propagates to the editor and retains its text; a successful write with failed history refresh reports saved state and clears only the submitted draft. Apply the same distinction to edits; handle rejected edit promises in the editor rather than leaving unhandled rejections. Correct asynchronous callback types.
3. Prevent an in-flight response from clearing text entered for another lead or newer draft. Before implementation, confirm the draft-switch behavior if changing the current cross-lead draft handling is required. Do not assume drafts should be discarded on selection changes.
4. Fix F4 at the persisted public-status boundary. Use stable error codes and user actions; send private diagnostics only to a private channel. Trace collection/interpretation/import/discovery exceptions through worker checkpoint, status and attention. Do not weaken existing exact evidence/approval/reconciliation checks.

Targeted tests: rejected note RPC retains draft; successful note/edit followed by failed history refresh is not a write failure; retry refresh performs no second write; edited text survives rejected mutation; injected private marker never appears in public persisted status. Reuse stage-failure regression conventions.

## Phase 2 — reduce unnecessary reads without changing results

1. Resolve F2: separate queue paging from source registry/detail loading. Prefer a small scoped source projection or session-local cache over introducing a dependency. Define source update/manual refresh invalidation and logout cleanup. Preserve page source labels and selected sidebar context, including leads lacking dedicated agency/category facts.
2. Resolve F3 with stable database ordering and bounded full pagination/chunked note IDs. Preserve the present complete history view and filters. A new paginated history UI is a separate product choice.
3. Resolve the concrete query hotspots in F6. Introduce/shared-use bounded stable pagination where appropriate; narrow selected columns and relevant source/task scopes. Keep safe explicit failure if a required complete baseline exceeds a reviewed limit. Preserve all records needed for actual FK/replay/identity/concurrent-change guards.
4. Extract touched contract orchestration/presentation into existing feature directories if this reduces duplication. Keep company/email prototypes intact and isolated; do not turn this into a full AppShell rewrite. Consolidate default filters only if output is identical.

Verification: count calls across page/search/filter/refresh; source changes still invalidate; logout removes cached protected state; >1,000 history events and tied timestamps retain all entries; large request status remains truthful. Existing queue stale-response, cross-page selection, SQL concurrency and import rollback/replay tests must remain passing. Measure representative saved-data query counts before claiming an efficiency improvement.

## Phase 3 — cleanup and authoritative documentation

1. Remove confirmed unused `findLeadIdsByActivityDate` and its guide reference. Remove root `prompts/procurement-bid-site-finder.md`; update references to the function-local copy, whose hash currently matches and whose loader is active in retained legacy code.
2. For test-only client filtering/sorting helpers, first move useful coverage to authoritative queue SQL/mapping tests. Then remove helper/private dependencies and obsolete assertions. Retain live date parsing/formatting/default/URL utilities.
3. Produce an exact cleanup manifest for remaining candidates: path, hash where duplicated, runtime/test/doc references, unique future intent, audit/recovery use, decision and replacement pointer. Inventory ignored artifacts by metadata without exposing private contents. Delete only approved-by-scope unused items; retain unresolved rows.
4. Keep Companies/email code, source-method verifier configs, sanitized fixtures, baseline/migrations, outstanding workflow/provider plans and historical acceptance evidence. Do not delete tables/data or private approval/recovery evidence. Historical fixed-batch scripts may be archived only with a preserved reproduction path and reference updates; shared reconciliation stays.
5. Rewrite `docs/PROCUREMENT-BACKEND.md` into one concise current route/behavior/config/limitations contract plus clearly dated history links. Include session/capture/reconcile routes; describe the actual injected official-link discovery branch. Reconcile deployment/AI/import/native-rehearsal status using dated reports and label facts not independently verified live. Remove conflicting present-tense instructions, not evidence of earlier failures.
6. Update `docs/CODE-REVIEW-GUIDE.md`, workflow/access docs and related todo/deferred plan pointers where touched. Preserve unique future requirements and explicit user decisions; unfinished plans stay unfinished. Do not treat the SAM playbook's clearly labeled historical commands as current execution instructions.
7. Remove the ignored obsolete SQL template only after reference verification. Local `dist`/dependencies are regenerable but do not need deletion to complete this work. Keep generated verification logs private/ignored.

## Decisions before dependent implementation

- Legacy generator: retire its UI invocation/form/mappers and Edge Function together after replacement acceptance, or preserve an operator-only historical entry point? Existing UI remains disabled until this is resolved. No spin table/migration deletion is proposed.
- Draft changes: retain one draft across lead switches, maintain per-lead drafts, or explicitly discard with user awareness? Only ask if the chosen fix needs to change this behavior.
- Historical artifacts: which audit/rebuild evidence needs permanent retention before removing operational duplicates? Provide a concrete manifest, not a blanket delete request.
- Scheduling, for subsequent work: cadence/timezone, due-run wake mechanism, missed-run behavior, shared budget, and whether collection stages candidates for review or performs explicitly authorized persistence. Existing exact import approval remains until a separate requested change defines otherwise.

These choices do not block the confirmed unused-helper/prompt cleanup or the independently scoped fixes.

## Testing and success criteria

- Run targeted new failure/large-history/query tests, then `npm run check` once after the final changes.
- Run disposable access integration when permissions/auth/query contracts change and the local runtime is available; never substitute the production project.
- Run whitespace/reference checks and inspect deletion diffs; no surviving code/doc link targets a removed file.
- No public status leaks a private injected diagnostic; failed notes preserve text and committed notes remain committed in the UI.
- Queue counts/filtering/order/selection/source context and protected import fields are unchanged.
- Current operational docs describe actual current code; historical material is explicitly historical.
- Every deleted item has reference and future-intent evidence; retained prototypes, tests and migration history remain available.
- Report exact tests and remaining decisions; do not claim scheduler or live integration acceptance from offline tests.

Next: review the implementation diff; commit only if explicitly requested. Scope UI wiring and scheduling separately against the reviewed API.


## Completion — October 13, 2026

All three cleanup phases completed locally. F1–F7 are addressed; [build evidence](../../docs/reviews/2026-10-13-review-remediation-build.md) and [exact deletion/retention manifest](../../docs/reviews/2026-10-13-cleanup-manifest.md) record implementation and practical bounds. No Bonfire/Euna access work, deployment, migration or production change was performed. Companies/email remain future functionality.

Final gate: lint, 19 app tests, 231 workflow tests, both SQL suites and TypeScript/production build passed. Separate real isolated PostgreSQL/PostgREST access checks passed; production was not contacted. Maintained link/whitespace checks passed.

Deleted only the confirmed duplicate prompt, unused local SQL template and unused/test-only helper symbols. Preserved all shared import guards, fixtures, schema history, private evidence, disabled legacy code and unresolved historical-artifact candidates. Shared drafts retain their current cross-lead behavior; in-flight saves cannot clear a newer/switched-lead draft. No product decision blocks this cleanup. Legacy generator retirement, historical audit retention and future UI/scheduling remain separate choices.
