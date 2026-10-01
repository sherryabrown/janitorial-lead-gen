# Code-review remediation and authenticated data access

## Initiating request

> Right now it is okay if anyone can update the leads. Only authorized (signed in) users should be able to view data. Please create the specs/todo/ accordingly and per docs/reviews/2026-09-30-project-code-review.md. Please also figure out why it takes so long for you to make updates and let me know what to do to speed things up. This request should go in a separate specs/todo/ file and it will be expected to be executed first.

### Follow-up request incorporated

> What needs to change in specs/todo/02-code-review-remediation-and-authenticated-data-access.md given the changes made in specs/done/01-faster-development-and-validation-workflow.md?

## Dependency and scope

Prerequisite completed: `specs/done/01-faster-development-and-validation-workflow.md`. Use `docs/development-workflow.md` for the portable check commands. Implement the work below in order, verifying each bounded change before proceeding. The source assessment is `docs/reviews/2026-09-30-project-code-review.md`; review line numbers are historical, so locate the current code before editing. Preserve unrelated uncommitted work.

This plan supersedes the execution recommendations in `reviewed-security-and-maintainability-recommendations.md`. The current review includes `.mjs` workflows; the older exclusion does not apply. Planning does not change live permissions or deploy code.

## Revised starting point after plan 01

The three remediation phases remain necessary. Plan 01 fixed development infrastructure, not application access or the reviewed correctness bugs. Start with Phase 1 below; do not rebuild the completed tooling prerequisite.

| Already implemented and verified | How this plan uses it |
| --- | --- |
| Pinned PGlite 0.5.8 and Supabase CLI 2.118.0 | Use installed dependencies and the lockfile; no new external engine installation or runtime `npx` resolution |
| `scripts/lib/supabase-cli.mjs` | Reuse its argument-array invocation for scripted CLI operations; preserve private output handling |
| Portable fixtures in `tests/fixtures/sam/` and `tests/fixtures/research/` | Extend the relevant fixtures and tests; do not recreate portability work or make tests read private `outputs/` snapshots |
| Node script/test ESLint coverage | Keep changed `.mjs` files passing the existing lint configuration |
| `test:app`, `test:workflow`, `test:sql`, `test`, `check` | Use targeted checks during edits and one composed completion gate; `check` already includes lint, all three suites, typecheck and build |
| `tests/offline-only.mjs` and its regression test | Keep default workflow/SQL checks offline, including their Node children; add separate opt-in access integration tests |

The recorded baseline is 4 app tests, 32 Node tests and 2 standalone SQL scripts. The clean-copy composed check took about 34 seconds; this is a diagnostic observation, not a time budget or a substitute for new regression coverage. Reinstall dependencies only when needed. Do not repeat clean-copy setup or benchmarks unless dependency, fixture, test-discovery or command changes warrant it.

Still required: a real isolated Auth/RLS test environment, composed UI regression coverage, fresh live permission evidence, and all application/workflow fixes below. Local fixtures are sanitized historical test inputs, not production migration baselines or approved import packages. The earlier clean-copy run did not validate live access permissions.

## Product decision: login is the access boundary

- All signed-in users may view application procurement data and update leads through supported application operations, including single and bulk stage updates. Membership in `procurement_members` is not required.
- Anonymous callers may not read application data or write leads. “Anyone can update” means any signed-in user in this authenticated application, not anonymous internet access.
- Preserve authorship restrictions on editing/deleting notes, audit integrity and server-only import operations. Allowing lead updates does not mean granting direct browser writes to every evidence/audit table.
- Keep approved server workflows operational. Do not expose secrets, remove session checks or require a new staff approval/role system. Do not change signup eligibility without a separate product requirement.

## Review disposition

| Review item | Planned outcome |
| --- | --- |
| 1: Anonymous core-table reads | First implementation priority now that the tooling prerequisite is complete; verify database boundary, not only React gating |
| 2: Signed-in non-member stage updates | Accepted product behavior; retain it and add a regression test rather than a membership gate |
| 3: Research notes disappear | Separate immutable research context from editable user notes |
| 4: Calendar dates shift | Shared calendar-date handling; retain actual timestamp semantics and unknown dates |
| 5: Invalid source links | Validate optional URLs and allowed protocols |
| 6: Reused lead misses request link | Reconcile reviewed request relationships independently of new lead creation |
| 7: Manual amendment path fails | Preserve immutable observations and attach reviewed amendments to a stable canonical record |
| 8: Incomplete metadata guard | Validate the complete assembled stored metadata, including provenance |
| 9: Incomplete/unbounded UI queues | Server-side paging/filtering/counts and lighter list retrieval |
| 10: Committed stage save reported failed | Apply confirmed mutation results before independently refreshing history |
| Disconnected tests/tool overhead | Completed in plan 01; reuse and extend the existing suites, commands and fixtures |
| Dense AppShell/duplicate helpers | Incremental extraction around tested behavior; no rewrite |
| Dormant Generate implementation | Keep disabled/undeployed; document prerequisites before any future activation |
| Tracked temporary files/archive | Scope repository cleanup; preserve private evidence and unrelated deletions |

## Phase 1 — enforce authenticated reads and reproduce the access model

1. Refresh the live read-only inventory of tables, views, grants, RLS policies, relevant functions and realtime exposure. Use the pinned CLI/helper rather than introducing shell-built `npx` commands. Use the prior `outputs/procurement-access/code-review-20260930-access.json` as historical evidence, not as a substitute for current state. Inventory core leads/sources, requests/links, intake/evidence, notes/history and legacy `spin_*` copies that may expose the same application data. The current intake-schema inspector is not a complete access audit; extend or supplement it for grants, RLS enablement, views and RPC execution permissions. Do not print keys or treat historical test fixture schemas as live evidence.
2. Capture sanitized core schema/policy definitions in the repository so a fresh development database can reproduce the relevant schema. Separate baseline reconstruction from the forward migration applied to the existing database. Include required constraints, indexes, triggers and dependencies; never recreate populated tables or seed mock leads into production.
3. Add a targeted migration removing anonymous SELECT grants/policies and alternate unauthenticated read paths. Establish authenticated read policies for application data; remove or replace conflicting member-only restrictions where they would prevent legitimate signed-in access. Test effective permissions across permissive policies, views and security-definer functions. Retain appropriate owner-only/private access for membership/account records and administrative metadata; do not blanket-grant every table to authenticated users.
4. Preserve the existing single/bulk stage RPC login checks, input validation, row locks, atomic history and authenticated execution grants. Keep anonymous execution revoked and pinned search paths. Review other supported lead-edit paths against the same login boundary without introducing unrestricted direct table writes.
5. Run access tests on an isolated Supabase/Postgres environment with actual role/JWT contexts before applying the forward migration. PGlite fixtures alone do not prove Supabase Auth/RLS behavior. Tests must prove:
   - no session/anonymous REST key: cannot read leads, sources or alternate copies, and cannot call stage writes;
   - signed-in account without membership: can read and perform valid single/bulk lead updates;
   - signed-in member: same supported lead access;
   - expired/invalid session: rejected, with the UI clearing protected state on logout/session loss;
   - note author restrictions, audit integrity and authorized server ingestion still work.
   - First check availability of a local Supabase stack/container runtime or an explicitly configured disposable environment. Do not provision a paid environment or substitute production for missing test infrastructure.
   - Add an explicit command such as `npm run test:access` with tests under `tests/integration/`, outside the default `tests/*.test.mjs` discovery. It must validate its isolated target before writes and fail clearly when required configuration is missing. Preserve the default offline guard; do not disable it globally to accommodate these tests. Use a separate process without its inherited preload for this explicitly networked suite, with target validation still enforced.
   - Use real Auth/HTTP requests to verify invalid/expired tokens and session behavior. SQL role/claim tests prove policy behavior but cannot alone prove token validation by the API gateway. Run this access gate separately from `npm run check`; neither can substitute for the other.
6. Apply through the existing reviewed migration process, then perform read-only live permission verification and safe application smoke checks. Keep destructive/mutating test fixtures in the isolated environment. Report migration/deployment state accurately; a local passing test is not a live-policy fix. Preserve recovery SQL securely: do not use a rollback that silently restores anonymous access as an automatic fallback.
7. Schema/policy changes can invalidate pending import packages bound to the previous schema hash. Preserve those immutable packages and receipts as history; prepare new packages from fresh snapshots/schema when needed, then run `node scripts/procurement-workflow.mjs test NEW_PACKAGE_DIR` using local PGlite. Never edit an old receipt or relax schema/hash checks to make it pass. Apply this rule again if amendment support changes the schema in Phase 2.

## Phase 2 — fix correctness in small verified batches

### A. Preserve research context and truthful save results

- In `src/lib/procurement.ts` and the contract types, represent research qualifications separately from user-authored notes. In `AppShell.tsx`, selection/history refresh must update only user notes/history. Lead refresh must update research fields from the latest canonical payload without replacing them with stale UI arrays.
- Render status/verification qualifications persistently, clearly distinguished from editable notes. Do not create fake editable database-note IDs for imported research.
- Apply RPC-returned lead state as soon as a stage mutation succeeds. Catch history refresh failures separately with a concise retry action; never report a committed mutation as a failed save. Preserve atomic bulk RPC use and fetch history only where immediately needed.
- Add composed tests covering select, refresh, no user notes, new user notes, updated research context, and committed single/bulk saves followed by failed history reads. Preserve selection and the next logical action after queue movement.
- Extend `tests/procurement-mapping.test.mjs` for mapping behavior, but do not rely on mapping tests alone to cover selection/history state transitions. `vite.config.ts` currently discovers only `src/**/*.test.ts`; include `.test.tsx` when adding component tests and configure a minimal DOM/testing harness if required. Add only the dependencies needed for these regressions and confirm the new tests actually execute through `npm run test:app`. Controlled test doubles belong in tests, not in application database code.

### B. Correct dates and optional links

- Consolidate date-label/filter logic in existing contract utilities. Parse valid `YYYY-MM-DD` values as calendar dates; distinguish them from timestamps carrying a timezone. Avoid accidental UTC-to-local day shifts and inconsistent date-range boundaries.
- Do not substitute record `created_at`/`updated_at` or today's date for an unknown solicitation deadline, award date or contract date. Represent unknown procurement dates explicitly and keep administrative timestamps separate. Retain historical/provisional qualifications and show calculated dates as estimates when appropriate.
- Centralize URL validation: empty/invalid inputs produce no link; allow only HTTP(S), with a documented rule if bare hostnames are supported. Reject executable/unsupported schemes and malformed URLs. Render missing sources as text, not `https://` anchors.
- Test date-only values in Arkansas and New York timezones, UTC, DST boundaries, true timestamps, invalid/missing dates, and empty/whitespace/malformed/disallowed URLs.

### C. Repair source reuse, amendments and metadata validation

- In `scripts/lib/reviewed-batch.mjs` and SQL reconciliation, create a missing request-to-lead link for an already-existing lead when the review supplies a valid factual geographic match reason. Keep existing links/status unchanged and deduplicate replay. Statewide location alone is not proof of a local match.
- Define stable source/document/record identity separately from capture/observation identity. A new retrieval time, added request or updated evidence must not require overwriting immutable intake or creating a duplicate lead. Add an explicit reviewed amendment relationship to the original record; validate source/agency/record identity, not title similarity alone. Update schema/runner package validation only as needed.
- Distinguish identical replay, a fresh observation of unchanged content, changed evidence and a new procurement. Retrieval-only changes should not fabricate business-change history. Preserve originals, user notes/stages and ignored/pending states; no automatic resurrection or promotion of candidates.
- In `scripts/lib/research-persistence.mjs`, validate the final assembled stored structure after adding evidence, field bases, authorization references and provenance. Use a bounded metadata schema and reject credential-bearing fields/URLs across nested structures. Keep access-account state in its private store; store only a safe authorization reference when needed. Errors/logs must not repeat rejected secret values.
- Update the procurement skill and workflow documentation to route recapture/amendment/request-link operations through the verified persistence path. Maintain source reuse and database readback requirements; a local research artifact is not a completed import.
- Extend `tests/research-persistence.test.mjs`, `tests/reviewed-workflow.test.mjs` and the relevant SQL regression scripts for existing lead/new valid request, duplicate replay, unsupported geographic match, repeated capture, changed evidence linked to one canonical lead, invalid cross-record amendment, pending/ignored preservation, stale hash, rollback and metadata rejection in every assembled branch. Reuse the existing Ouachita/Texarkana derivatives in `tests/fixtures/research/`; add only the sanitized evidence needed for new cases and maintain `tests/fixtures/README.md`. Keep related schema, before/after, manifest and capture fixtures consistent without altering original operational evidence. Preserve the CLI-level test that uses local PGlite and verifies a hash-bound receipt. Never mutate live leads as test data.

## Phase 3 — make queues complete and code easier to change

1. Replace the unbounded full-payload list load in `src/lib/procurement.ts` with explicit stable pagination, server-side filters/search and accurate counts. Apply filters/counts to the full authorized dataset, not only the current page. Select only list fields and lazy-load detail/evidence for the selected record. Choose indexes from actual query patterns.
2. Define selection explicitly: selection across loaded pages must remain visible and stable; distinguish “this page” from “all matching” if both are supported. Avoid implementing an implicit all-matching bulk mutation. Preserve selected detail/context through refresh, and clamp/refill a page when a lead moves queues or the last row disappears. Realtime/focus refresh must respect active filters and stale-response guards without downloading every payload.
3. Test more rows than the configured API page limit in an isolated database, stable ordering/tie breakers, full-dataset counts, filters, stage movement, stale responses and selection. If true snapshot-consistent pagination is not required, document concurrency behavior and prevent obvious duplicates/missing next-page rows from unstable ordering.
4. Extract cohesive auth, lead loading/history/actions, filters and detail components/hooks from AppShell as the fixes touch them. Reuse existing contract/shared types, mappings and defaults. Format touched dense code. Keep brand/accessibility, at-a-glance layout and disabled prototype behavior intact; no new state framework or broad visual redesign.
5. Remove tracked local `.netlify`/`supabase/.temp` artifacts from the index with narrow ignore rules while preserving local files. Respect the already-deleted deployment ZIP; do not restore it or rewrite Git history. Preserve the sanitized `tests/fixtures/` set and its README created by plan 01; keep private/large operational evidence separate rather than rebuilding the fixtures. Inventory archives for follow-up without claiming an exhaustive secret audit or deleting required evidence. This repository cleanup was not completed by the tooling prerequisite.
6. Keep Generate disabled and do not deploy `spin_generate_contracts`. Record future activation gates: authenticated caller, bounded cost/rate and outbound fetch controls, typed/validated filters and canonical reviewed-import integration. Current listing did not show that function deployed; do not describe it as a confirmed live endpoint or enable paid services during this remediation.

## Completion checks

- During edits, use `npm run test:app -- PATH_TO_TEST` for UI/helper tests and `node --import ./tests/offline-only.mjs --test tests/NAME.test.mjs` for a targeted Node regression. Use `npm run test:sql` when changing SQL reconciliation. Keep changed `.mjs` files covered by lint.
- Run `npm run check` once after final relevant changes. It already runs lint, app/workflow/SQL tests, typecheck and the production build; do not append duplicate full suites or build commands. Repeat affected checks after fixes, and repeat the composed gate only when relevant changes justify it. Confirm newly added tests are discovered rather than relying on the old passing test count.
- Independently run the new isolated access integration command and required browser checks. A green offline `check` cannot complete the access work. If the isolated environment is unavailable, record the specific limitation and leave that acceptance criterion incomplete.
- Add meaningful integration/UI regressions for the identified failure paths rather than tests mirroring implementation details. Recheck clean-install portability if this work changes dependencies, fixtures or test discovery; keep production credentials and operational snapshots out of the default local suites.
- Run browser smoke checks for login/logout, queues, selecting research qualifications, dates, missing links, single/bulk movement and history retry. Check keyboard focus and concise empty/error/loading states.
- Every review item above is fixed, explicitly accepted by the product decision, or documented as a before-activation gate. Do not label incomplete live access work complete.
- Record changed files with `+`/`-` notation, checks/results, remaining risks, and local versus deployed state. Update the review's resolution notes with evidence after implementation; retain the original historical observations.

## Success criteria

Anonymous clients cannot retrieve application procurement data. Any signed-in user can view and update leads without membership approval. Research context persists, dates/links are truthful, committed writes are reported accurately, repeated research reuses sources/records and saves verified request relationships. Complete queues remain usable beyond the API row limit. The relevant code is easier to change, normal validation is reproducible, and existing import/audit protections remain intact.


## Execution record — October 1, 2026

Implemented and verified. See `docs/reviews/2026-10-01-remediation-build.md` for the complete file list, review disposition and evidence. Three forward migrations are applied to the configured Supabase project; no baseline or test fixtures were applied to production. Frontend changes are local and uncommitted, not yet deployed to Netlify.

Clean-copy install/check passed: 15 app tests, 36 Node tests, two standalone SQL suites, lint, typecheck and build. Subsequent queue bounds/historical-date corrections passed the affected SQL regression, real PostgreSQL/PostgREST HTTP/JWT access gate and lint. Live anonymous API denial and server access were reverified. Browser checks covered user sign-in, queues, selection across pages, research context/refresh, dates, keyboard focus, empty results and logout. Mutating/failure flows ran in composed UI plus isolated HTTP tests rather than altering production leads; the optional disposable Supabase signup-service suite was not run.

All review items are fixed, accepted product behavior, or recorded as before-activation gates. Existing unrelated work remains intact. Follow-up: review and deploy the frontend; regenerate any old schema-bound import packages before further imports.
