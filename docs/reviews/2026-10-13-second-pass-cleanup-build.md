# Second-pass cleanup build — October 13, 2026

Implementation of `specs/done/second-pass-code-review-cleanup.md`, on top of the uncommitted first cleanup. No commit, deployment, live database write or provider request is part of this work.

## Changes

| Finding | Result |
| --- | --- |
| R1: stale guidance | Geography examples include category bounds/date bases; public adapters and separate SAM routing match code. Legacy creation acceptance is distinguished from usable collection bounds. Source-access deployment claims are dated. UI-managed plan has one current scope/next action; superseded continuation observations are explicitly historical. Bonfire remains deferred in its own plan. |
| R2: preview reads | Preview/ambiguous city resolution reads only geography and county links. Valid create reads source/capability registries after selection validation and before its write. Minimum preview reads drop from four to two; pagination remains stable and uncapped as before. |
| R3: history failures | Both successful and rejected reads respect sequence ownership. Effect cleanup prevents obsolete error presentation. A completed mutation for a different selected lead skips its obsolete history refresh; persisted changes and shared draft semantics remain intact. |
| R4: diagnostics | `checked` retains a standardized SQLSTATE/PostgREST code in a private Error cause, or `unknown` for unrecognized codes. Database message/details/hint are discarded because they can contain data or secrets. Existing restricted worker reporting receives the cause; checkpoint/HTTP/status projections remain generic. Diagnostic IDs still connect failures to private reporting. |
| R5: dead helper | Removed `contentChangeType`, its test import and its obsolete test. Runtime `savedContentChange` and semantic/fetch tests remain. No whole files were deleted in this pass. |

Changed paths in this pass: four current documents/plans (`GEOGRAPHY-REQUEST`, `KNOWN-SOURCE-EXECUTION`, `SOURCE-ACCESS`, UI-managed plan); three script libraries (`geography-service`, `hosted-store`, `public-source-check`); AppShell and its tests; public-source/worker privacy tests; new geography-service tests; this report, cleanup manifest and completed plan. Fifteen paths including documentation records. Earlier cleanup changes remain separate work in the same working tree.

## Verification

`npm run check` passed: lint, 21 app tests in four files, 234 offline workflow tests with zero failures/skips, both standalone SQL suites, TypeScript and Vite production build. The final mutation-refresh guard was also verified by another 21-test app pass; final lint/stricter unused-local typechecking passed. Targeted offline workflow tests: 17 passed. Build: JS 495.51 kB / gzip 142.34 kB; CSS 24.84 kB / gzip 5.40 kB. Private full-check log: `outputs/deployment/code-review-2026-10-12/second-pass-check.log`. `git diff --check` passed. Changed Markdown links and geography CLI help were checked; known-source CLI usage was inspected (it has no `--help` route). Vite required execution outside the Windows sandbox due to its realpath EPERM restriction; no product permission or runtime configuration was changed.

No SQL, membership/authentication permissions or HTTP response contract changed. The plan therefore does not require repeating the isolated access gate; prior access results belong to the first cleanup, not this pass.

## Retention and remaining decisions

Companies/email previews remain future functionality. Bonfire/Euna work remains deferred. Legacy-generator retirement and historical fixed-batch script/artifact retention remain separate decisions; none blocks this plan. Migrations, schema baselines, fixtures, historical acceptance reports and private evidence remain retained. These checks do not prove that every dynamically used or externally invoked artifact is active or that every possible unused branch is absent.

Next: review the combined working-tree diff; commit only on explicit request. UI/backend integration and scheduling need their own requested implementation scope.
