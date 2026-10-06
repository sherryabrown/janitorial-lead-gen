# Separate Arkansas SAM from geography refreshes

## Initiating request

> Remove SAM from city and county refresh planning and execution. Keep a separate, manually run Arkansas-wide SAM path. Update the reports so SAM coverage is shown separately, and add regression tests. Do not create a schedule or change other source methods.

## Goal and boundaries

One implementation phase: a city/county request checks its registered city, county, and state **non-SAM** methods, while SAM opportunities and awards remain available through the existing manual Arkansas-wide `scripts/sam-search.mjs` and reviewed intake/import commands. No scheduler, new source methods, new lead matching, UI, or change to SAM API filters, pagination, and source records. Do not delete historical SAM tasks, runs, observations, intake, or lead links. A manual SAM query's exact filters and terminal page status remain its coverage claim; it does not imply every Arkansas janitorial record was captured.

## Current behavior and change

| Area | Now | Required |
| --- | --- | --- |
| `scripts/lib/geography-routing.mjs` | City/county preview includes verified SAM on the automatic Arkansas state route. | Exclude `sam` and `sam-awards` from automatic route readiness and candidate lists; still show Arkansas non-SAM methods. |
| `scripts/lib/known-source-execution.mjs` | `buildKnownSourcePlan` creates SAM category jobs and SAM-specific missing-method rows; `samFilters` is also used by the manual path. | Exclude SAM sources/capabilities from this request plan before computing known, gaps, and entry counts. Keep `samFilters`, adapter validation, and the source registry for manual use. |
| `scripts/known-source-run.mjs` | Existing persisted SAM jobs can run even if a new plan omits them. | Skip legacy SAM jobs **before claiming a lease or sending a fetch**; reject `--source=sam` / `--source=sam-awards` with the manual command. Leave historical job and evidence rows intact. |
| `scripts/known-source-workflow.mjs`, `scripts/lib/workflow-status.mjs` | `run` automatically calls `stageSam`; report and review template mix routed SAM intake with geography candidates. | Remove automatic SAM staging. Show current geography counts, gaps, packets, and candidates without SAM. Show historical SAM request jobs/candidates in a clearly separate, read-only section so pending legacy review remains discoverable; retain an explicit route to the existing reviewed import flow. Do not reclassify or import them automatically. |
| `scripts/known-source-review.mjs`, `scripts/lib/source-review.mjs`, `docs/KNOWN-SOURCE-EXECUTION.md` | Coverage report and normal instructions mix SAM with geography checks. | Mark SAM as a separate manual Arkansas-wide check, excluded from geography coverage counts. Document a bounded manual SAM command and its existing stage/review path, with no schedule. Keep registry inventory entries. |

Use one shared predicate for the two registered SAM source codes (and their `sam-search` capabilities) so preview, plan, runner, and reports agree. Keep non-SAM state methods such as `ariba`, `state-contracts`, DHS, and ARDOT on the geography route. Existing aggregate gaps formerly superseded by SAM must reopen or be reported accurately when no non-SAM method covers that category; historical SAM-specific gaps must not inflate active city/county counts.

## Implementation and tests

1. Add the shared SAM separation rule and apply it to preview and plan. Keep the source registry and standalone `sam-search.mjs` intact.
2. Guard the runner before lease claim; remove `stageSam` from the wrapper. Split active geography status from historical SAM data in both reports and the review template without losing pending historical items. Update the runbook's normal command path.
3. Update `tests/geography-routing.test.mjs`, `tests/known-source-execution.test.mjs`, `tests/known-source-workflow.test.mjs`/`tests/workflow-repair.test.mjs`, and report tests. Cover city and county requests with an Arkansas state target: verified SAM plus a verified public state method, SAM-only category, stale SAM capability, legacy pending SAM job, historical SAM candidate, and a manual SAM query. Assert no city/county plan or run calls SAM, non-SAM behavior and counts stay intact, legacy evidence remains visible separately, and manual SAM capture/staging still works. Use offline stubs for the runner guard; do not make a live SAM call in tests.

## Acceptance and verification

- [x] A new city/county preview and plan omit SAM from `known`, jobs, and active source/category gaps, including on their Arkansas state route.
- [x] Re-running an old geography request never claims or fetches an existing SAM job; `--source=sam` is refused clearly. Non-SAM jobs still run as before.
- [x] Geography `report`, `review-template`, and coverage report separate historical SAM records from current geography coverage and preserve their review path.
- [x] Manual Arkansas-wide `sam-search.mjs` and the existing explicit reviewed intake/import path remain usable; no schedule or source-method registration changes.
- [x] Focused regressions and `npm run check` pass. A read-only report for existing Texarkana request `aa68b201-9fc3-448c-a212-da94b5610fc4` shows the separation without altering live data. If a database migration becomes necessary, use a forward-only migration and reviewed deployment; otherwise no migration.

Verification: focused regressions passed (27 tests); `npm run check` passed (lint, 15 app tests, 113 workflow tests, SQL checks, build). Read-only Texarkana reports showed 12 historical SAM tasks in a separate manual section and a fresh non-SAM plan with 9 known methods, 7 entry checks, and 51 source gaps. No migration or schedule was added.

## Build instruction

Use `$build-code specs/todo/separate-arkansas-sam-from-geography-refresh.md` for this single phase. Leave the plan in `specs/todo/` until all acceptance checks are evidenced.
