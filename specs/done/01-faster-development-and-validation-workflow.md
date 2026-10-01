# Faster development and validation workflow — execute first

## Completion — September 30, 2026

**Implemented and verified.** Pinned local PGlite/Supabase dependencies, portable sanitized fixtures, named/composed fail-fast checks, Node script linting and documented targeted verification are in place. Supabase subprocesses use argument arrays through the local package instead of shell-built `npx` commands. No live reads/writes, migration or deployment were required; import approval, schema, snapshot, rollback/replay and readback guards remain intact.

A disposable clean copy excluded `.env`, operational outputs and external research dependencies. Offline `npm ci` completed in 6.5 seconds; the full lint/test/build gate passed in 34.0 seconds (4 app tests, 32 Node tests and 2 standalone SQL scripts). The final refinement tests the local PGlite default through the CLI instead of calling its SQL helper directly; all 10 affected tests passed again in the clean copy in 6.4 seconds, and lint passed. Existing lint transitive dependencies received compatible brace-expansion patches; npm reported zero vulnerabilities after that update. No application dependency upgrade was performed.

Timing caveats, remaining sandbox/config-directory requirements and the check matrix are in `docs/development-workflow.md`. The fixture README describes sanitization and lists every included file. Remaining AppShell coupling and live anonymous-read remediation belong to plan 02, which is not implemented by this build.

## Initiating request

> Right now it is okay if anyone can update the leads. Only authorized (signed in) users should be able to view data. Please create the specs/todo/ accordingly and per docs/reviews/2026-09-30-project-code-review.md. Please also figure out why it takes so long for you to make updates and let me know what to do to speed things up. This request should go in a separate specs/todo/ file and it will be expected to be executed first.

## Order and objective

Execute this plan before `02-code-review-remediation-and-authenticated-data-access.md`. Make ordinary edits and verification reproducible and quick to start. Keep this bounded to tooling, test portability and working practices; do not turn it into an application rewrite or postpone the access fix for speculative optimization. This file is a plan, not a claim that changes have shipped.

## Diagnosis and evidence

- `package.json` exposes four Vitest tests through `npm test`, but not the 31 Node workflow tests. `vite.config.ts` includes only `src/**/*.test.ts`. Discovering and invoking the other suite repeatedly adds setup work and makes coverage easy to miss.
- `tests/reviewed-workflow.test.mjs`, `tests/intake-processing-sql.mjs`, and `tests/sam-upsert-sql.mjs` import PGlite from another workspace through `PROCUREMENT_RESEARCH_DIR`. Tests also depend on ignored operational captures. A clean checkout cannot reproduce this setup with `npm ci` alone.
- `scripts/lib/supabase-admin.mjs` and `scripts/inspect-intake-schema.mjs` invoke unpinned `npx.cmd --yes supabase`. The workflow runner launches additional Node/PowerShell processes for schema inspection, snapshots and queries. These create repeated CLI resolution, authorization and process-start costs. Measure the contribution before changing the runner.
- The last review recorded a Vite filesystem-sandbox failure followed by a successful approved rerun. Local checks passed; those results do not establish that the tests themselves explain long conversations. Network/permission retries and repeated investigation also consume time. There is not yet an end-to-end timing profile separating these costs.
- `AppShell.tsx` is approximately 3,194 lines with duplicated types/helpers and many coupled state paths. Dense workflow scripts also make edits harder to isolate. Address that incrementally in the second plan, after correctness fixes.
- Repeated broad reads, fragile patch attempts and re-running unchanged checks are avoidable agent workflow costs. Reduce them without dropping relevant validation or database safeguards. No measured percentage speedup is claimed.

## Phase 1 — establish a short, safe baseline

1. Inspect the current working tree and preserve existing changes. Inventory the app, Node and SQL test entry points, fixture dependencies, CLI calls and required Node version. Do not print environment secrets or CLI key responses.
2. Time representative local checks once: lint, app tests, workflow tests, SQL checks and production build. Record command wall time separately from permission waits, dependency downloads and live network calls. Record unavailable steps explicitly rather than marking them passed.
3. Add a concise development guide, preferably `docs/development-workflow.md`, documenting prerequisites and a change-to-check matrix. Use a small read-only readiness command only if it eliminates repeated setup diagnosis; it must not require production access for local development.
4. Establish fail-fast command handling. A failed required check must prevent dependent steps. Avoid PowerShell command chains that continue into apply/deploy after a failed test. Independent reads/checks may run concurrently; mutations and their verification remain sequential.

## Phase 2 — make checks portable and tools predictable

1. Declare compatible, pinned development versions of PGlite and the Supabase CLI in `package.json`/lockfile. Select versions against the existing commands and SQL tests; do not blindly upgrade production dependencies. Use the local CLI executable through a platform-aware helper or npm script, avoiding registry resolution during each normal operation.
2. Replace external-workspace PGlite imports with the declared package. Remove the mandatory `PROCUREMENT_RESEARCH_DIR` dependency from routine checks.
3. Create minimal, sanitized, checked-in fixtures under `tests/fixtures/` from existing verified research captures/packages. Preserve relationships, hashes or regenerate fixture package hashes as required. Include only fields needed for the tests; exclude credentials, private access details and large operational snapshots. Keep complete audit captures outside the fixture set. Test fixtures must not replace the real application database or add mock leads to production.
4. Add explicit commands such as `test:app`, `test:workflow`, `test:sql` and a composed `test`/`check` entry point. Ensure the existing suites are actually enumerated, errors propagate and tests cannot silently skip because local evidence is absent. Document whether standalone SQL checks overlap the workflow suite to avoid duplicate work.
5. Add appropriate `.mjs` lint coverage with Node globals, initially addressing substantive workflow files. Use normal multiline formatting for touched code; avoid a repository-wide formatting churn. Existing TS/TSX checks must remain intact.
6. Measure CLI/process overhead. Only if significant, remove redundant setup within a single operation using shared helpers and one in-memory authorized client. Never cache server secrets to disk or weaken fresh schema, snapshot, approval/hash, rollback, readback or uncertain-outcome checks. An unchanged immutable offline package may reuse its valid hash-bound test receipt only under the existing rules.

## Phase 3 — prove the workflow and document how to use it

1. Validate from a disposable clean checkout/copy using the declared lockfile and fixture set. Account for unrelated uncommitted work when preparing it; do not reset this workspace. After dependency installation, local suites must work without the old research folder, production credentials or network access.
2. Run the new composed checks once and compare their timings/setup steps with the baseline. Diagnose any regression; report actual improvements and remaining limits without promising a fixed turnaround time.
3. Document this verification matrix:

| Change | Required verification |
| --- | --- |
| Plans/docs only | Review content, paths and diff; no full application suite |
| UI/helper change | Relevant app tests, lint/typecheck; build for structural/configuration changes or milestone completion |
| Import/workflow change | Relevant Node/SQL tests, script lint, immutable package/rollback/readback cases |
| Database access change | Migration and real role-policy tests on isolated Supabase/Postgres; offline tests alone cannot prove Auth/RLS behavior |
| Release/milestone | Composed relevant checks plus production build once after final code changes |

4. Document agent practices: batch independent reads; search narrow paths; edit from verified context; run targeted checks during edits and the relevant combined gate once at completion; repeat only after relevant changes/failures. Give concise progress updates and per-file `+`/`-` change summaries. Never omit acceptance checks to meet an arbitrary time target.
5. Hand off directly to the second plan when acceptance criteria pass. Record unresolved environment issues with evidence; do not silently claim the prerequisite complete.

## User actions that help

- Execute this plan first, then the review-remediation plan. Use a bounded milestone per build when reviewing a large change.
- Keep development in this repository with the documented Node/dependency setup; avoid dependencies installed only in unrelated project folders.
- Where prompted, approve narrowly scoped required test/build/tool commands. Repeated sandbox or network failures should be addressed through the supported approval mechanism; do not disable security controls or grant blanket shell access.
- No new credentials, broad Gmail permissions or reconfiguration of working integrations are required merely to improve local development speed.

## Success criteria

- A clean checkout can install declared dependencies and run all existing app/workflow/SQL checks with documented commands and sanitized fixtures.
- Normal local checks do not depend on another workspace or live Supabase, Resend or Gmail.
- Routine CLI execution uses the pinned local version without opportunistic downloads; authorization stays private.
- Required failures stop dependent operations. Import safety checks and user-data preservation remain unchanged.
- The guide contains measured timings, the verification matrix and remaining bottlenecks. No speculative major refactor is required to finish this prerequisite.
