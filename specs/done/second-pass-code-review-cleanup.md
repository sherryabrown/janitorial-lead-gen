# Second-pass code review and cleanup

Date: October 13, 2026. Status: complete; all five findings implemented and verified.

## User request

“Please perform another code review to make sure there is no unused code (that is not for the future like Companies) and there is no documentation that is not applicable to the utilized code. Please also make sure the code is efficient and effective.”

## Scope and outcome

Review the current working tree, including the uncommitted first cleanup. Preserve Companies, email previews, current user behavior, data, migrations and existing changes. Bonfire/Euna remains deferred under its separate plan. This plan makes no deployments or provider requests and does not add scheduling or UI/backend integration.

The review found five actionable follow-ups below. It does not establish that every possible unused branch or operational artifact is absent. Static references cannot establish external CLI use or deployed state. Historical evidence and explicitly retained future functionality are distinct from dead runtime code.

## Review evidence and coverage

- Inventoried source, script, function, test, configuration, current documentation and plan paths. Scanned 181 JavaScript/TypeScript files for exported declarations and references, then checked same-file callers to avoid treating internally used exports as dead code.
- Checked library filenames against code and documentation references: no additional entirely orphaned `scripts/lib/*.mjs` module was identified by that scan. CLI, Edge-function and build entry points cannot be classified by imports alone.
- Inspected queue/source loading, history pagination and refresh sequencing, hosted workflow status/interpretation, attention projection, database helpers, source-change probes, geography resolution/routing, deployment configuration and the prior deletion manifest.
- Checked literal source paths in all 12 top-level current docs. The only missing literal detected was the intentional `src/PATH.test.ts` example. This is a path check, not proof that every instruction is current.
- Reviewed current backend/workflow/access/geography/known-source guidance and the active UI-managed plan. Historical reports and retained artifacts remain governed by the first cleanup manifest; private contents and external collectors were not audited again.
- `npm run lint`: passed.
- `npx tsc -p tsconfig.app.json --noUnusedLocals --noUnusedParameters --incremental false`: passed. This checks local declarations, not all exported or dynamically reached code.
- Offline targeted tests: 14 passed, zero failures/skips across `geography-routing`, `public-source-check`, and `workflow-public-errors`.
- The previous full check/access results are historical evidence from the preceding implementation, not newly repeated checks for this review. No runtime code changed during this review.

## Findings

### R1 — P2: obsolete geography instructions conflict with current adapters

`docs/GEOGRAPHY-REQUEST.md:25` says only the SAM runner is recognized and that public methods and discovery are future phases. Current `scripts/lib/geography-routing.mjs` uses `adapterContract` for supported methods and the tests establish public methods as runnable, with SAM excluded from geography collection. The document's `requested_at`-only search-window example also does not provide the category bounds required for subsequent collection, even though the legacy create command accepts it.

`docs/KNOWN-SOURCE-EXECUTION.md` correctly says SAM is separate, but its numbered setup procedure still embeds SAM capability registration alongside public geography execution. This mixes legacy setup and current operation. `docs/SOURCE-ACCESS.md` embeds deployment/pilot claims without an as-of qualifier in its opening contract. `specs/todo/ui-managed-procurement-workflow.md` retains multiple conflicting “current”/“next” continuation statements, including already superseded deployment holds and credential diagnoses.

Fix current guidance and give historical evidence explicit dates/owners. Preserve the user's Bonfire decisions and link the separate deferred plan; do not reopen its work. Keep historical reports and requirements that explain implemented or future functionality. Do not delete whole documents merely because some sections are old.

### R2 — P2: geography preview reads unused registries

`scripts/lib/geography-service.mjs:17` eagerly loads all geographies, county links, capabilities and sources before resolving preview or county ambiguity. Preview and `needs_county` return without consuming capabilities or sources. Every preview therefore pays two unnecessary paginated full-registry reads and can fail because an unrelated registry read failed.

Read geographies/links first; resolve geography; return previews/ambiguities immediately. For a create request, validate selection and scope, then read sources/capabilities before creating the request. Keep these reads before the write so registry failures cannot become a new post-commit failure. Preserve stable pagination, routing, outputs and explicit county confirmation. Avoid a new persistent/global cache or arbitrary row cap.

### R3 — P2: obsolete history failures can overwrite current UI feedback

`src/app/AppShell.tsx:587–607` checks the history request sequence only after both reads succeed. Its effect catch sets a global refresh error unconditionally. Reproduction: select A, select B, allow B's history to succeed, then reject A's delayed read. A's obsolete error appears while B is current. A late failure after effect cleanup has the same missing guard.

Apply the existing request/effect lifetime guard to rejection as well as success. Keep genuine current failures visible and preserve the confirmed-write/failed-refresh distinction in note/stage handlers. Do not suppress real save failures or change cross-lead draft behavior. Start with the effect race; inspect mutation refresh callbacks for the same ownership issue before broadening the fix.

### R4 — P2: database errors lose the diagnostics operators are told to inspect

`scripts/lib/hosted-store.mjs:2–4` replaces `response.error` with a generic Error and discards the original entirely. For database failures passing through `checked`, the worker's private `reportError` receives only that generic message, despite public status directing the operator to server diagnostics. The new privacy test throws a raw worker error and therefore does not cover this path.

Keep the public error generic while retaining useful database failure context privately, e.g. through an Error cause consumed by the private diagnostic reporter. Do not serialize the cause into checkpoint, HTTP, import, or attention responses. Preserve safe error codes and diagnostic IDs. Decide exactly which database fields are safe for restricted logs; do not blindly log credentials, payloads or query contents. No change to public HTTP status semantics is needed.

### R5 — P3: obsolete hash-comparison helper is used only by its own test

`scripts/lib/public-source-check.mjs:6` exports `contentChangeType`; its only external caller is the small test in `tests/public-source-check.test.mjs:49`. Runtime collection now uses `savedContentChange` in `scripts/lib/source-change.mjs`, whose tests cover new/changed/unchanged with bounded queries. Remove the old function, test import and obsolete test. Retain all fetch and semantic-fingerprint tests. Retain the active helper's any-historical-hash semantics; changing it to latest-only comparison would be a separate behavior decision.

## Retention and decisions

| Item | Disposition |
| --- | --- |
| Companies/email preview code, types, samples, styles | Retain: explicit future functionality. |
| Internally used exported helpers/types | Retain: export-only scans are not deletion proof. |
| Legacy `spin_generate_contracts` and disabled Generate UI | Retain in this plan: coordinated retirement/replacement remains a separate decision from the prior manifest. Do not call it active canonical generation. |
| Three fixed-batch prepare/verify scripts from the prior manifest | Historical reproduction, not current batch entry points. Retention remains unresolved; no new runtime need was established by this review. |
| Current CLI adapters, fixtures, schema baselines, migrations | Retain: runtime, verification or reconstruction use. |
| Dated acceptance reports, old specs, receipts and SQL packages | Preserve evidence; label historical and remove misleading current navigation/instructions. No blanket purge. |
| Bonfire/Euna plan and implementation | Deferred; only documentation status/pointers may be clarified. |

No decision blocks R1–R5. A claim that all non-future inactive code is gone would require resolving legacy-generator and historical-reproduction retention separately. Do not treat these retained categories as confirmed dead code.

## Implementation — three phases

### 1. Remove confirmed dead helper and repair current guidance

1. Recheck current Git status and symbol references; preserve the first cleanup and unrelated edits.
2. Implement R5, recording the removed symbol and replacement in the cleanup manifest.
3. Implement R1: update geography examples to actual supported category/date bounds; distinguish legacy create acceptance from executable collection requirements; point to the current backend contract for HTTP usage.
4. Separate historical SAM setup notes from the current non-SAM known-source procedure. Add explicit dated-evidence labels to deployment claims. Consolidate the active UI-managed plan's current summary and move superseded continuation text under clearly historical headings, preserving evidence and decisions. Its next action must respect Bonfire deferral, not restart it.
5. Check current links, CLI help and code for every changed instruction. Keep archived source text unchanged. Do not rewrite the repository skill or erase operational history.

### 2. Correct the two failure paths and avoid unused preview work

1. Add a deferred-promise app regression for R3: A pending, B selected/successful, A rejected. Assert no obsolete error appears; separately assert B/current errors still appear and save/refresh failures retain their existing meaning.
2. Implement the narrow lifetime guard, with no component extraction or UI redesign.
3. Add a geography service query-recording test. Preview/ambiguity must read only geography/link tables even if registry reads would fail. Create must still read the registries before its RPC and produce identical routes. Test county selection validation and registry failure with no write. Implement R2.
4. Add R4 coverage starting from `checked({error: ...})`, through worker checkpoint and private reporter. Assert useful private context survives and a marker is absent from every public/persisted projection. Implement narrowly; reuse existing reporting seams.

### 3. Verify and record completion

1. Run targeted app, geography, public-source and worker/public-error tests during changes.
2. Run `npm run check` once final code is ready; record actual totals and results. Run `npm run test:access` if database permissions, SQL, authentication or their public boundaries change; this plan does not otherwise require another live/disposable access run.
3. Repeat the stricter TypeScript unused-local check and source references for the removed helper. Verify changed documentation links and `git diff --check`.
4. Update the cleanup manifest/build report with exact changes, deletions, retention decisions and checks. Do not claim live deployment or an exhaustive proof of zero dead code.
5. Move this plan to `specs/done/` only after its requirements pass. Do not commit, push or deploy without the corresponding user request.

## Success criteria

- `contentChangeType` and its obsolete test are absent; active source-change behavior remains tested.
- Current instructions match public adapter/SAM routing and usable request bounds; dated history is clearly distinguished from current next steps.
- Geography previews perform no capability/source queries; valid create behavior is preserved.
- An obsolete history rejection cannot replace current lead feedback; current failures remain actionable.
- Checked database failures retain restricted diagnostic context without exposing it publicly.
- Required verification passes; Companies/email and deferred Bonfire work remain preserved.

Next: review changes with `git diff`; commit only on explicit request.


## Completion record

October 13: R1–R5 completed. Full check passed (21 app tests, 234 offline workflow tests, both SQL suites, lint/typecheck/build); final history guard separately passed the 21 app tests. Stricter unused-local check, documentation links and whitespace checks passed. Fifteen paths changed in this pass, including this completed plan, manifest and [build report](../../docs/reviews/2026-10-13-second-pass-cleanup-build.md). No whole-file deletion, deployment, commit or live database/provider action. Legacy-generator/historical-script retention remains a separate decision; Companies/email preserved and Bonfire deferred.
