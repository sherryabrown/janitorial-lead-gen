# Saved scheduling reads: implementation and release preparation

November 4, 2026 implementation record. The owner separately authorized commit and production deployment on November 5. See the November 5 release record for superseding production state; the local-only statements below describe the original build boundary. Render Free remains the execution host. Baseline: `a8f417a9f16f4be000e73389c11a5b1dd35208e3` plus the pre-existing November 3 startup fix and unrelated working-tree changes.

## Approved behavior and scope

The owner approved removing viewer-triggered worker wakes: accepted Run/Resume/Save operations and the existing private scheduler dispatch continue execution. The owner also approved fetching live key readiness and AI budget only in the existing Manual runs view. Saved scheduling uses persisted dispatch status. No runtime configuration snapshot or new settings control was added.

Partial/Needs-review historical runs retain explicitly qualified known subtotals. Only completed runs with settled, verified relevant work qualify as complete. Existing labels express the stricter completeness requirement. No new screens, controls, filters, report types, scheduler, notification, hosting tier, or permanent derived-result history were introduced.

## Responsibilities and implementation

Render retains execution, source gathering/validation, previews, schedule mutations, run controls, repair/import consoles, and live runtime settings. Existing workflow kicks now attempt bounded result publication before/after workflow stages. Publication failures preserve execution receipts and do not turn successful imports into uncertain writes. Failed projections rotate behind unattempted work; recovery uses the next legitimate execution wake or the explicit operator projection script. Saved reads never finalize, backfill, wake, or resume work.

Supabase serves the existing capability RPC and the new allowlisted `procurement_scheduling_read` RPC: schedule list/detail/choices, history/activity/audit/occurrences, run/progress, Admin logs/dispatch status, source summaries/setup, analytics, and metric membership. Ordinary Contracts still use their existing Supabase reads; report membership now also comes from Supabase. There is no Render fallback.

The only new tables are `procurement_run_results` and `procurement_run_result_members`. They retain the current atomic derived result, revision/source version, outcomes, classifications, canonical aliases, completeness and counts. Existing immutable job receipts remain the evidence. Invalidating triggers only advance the reporting version when relevant saved inputs change; they do not change job/run execution state. Publication locks the parent, checks its source version and replaces header/members in one transaction. Replay is idempotent. Active polling uses persisted progress and briefly retries a terminal publication gap without waking Render.

Minimum supporting refinement: two derived fields on existing source capabilities record the result/fingerprint of the existing private execution-contract validator. This avoids moving private method specifications into browser reads or writing a second validator. Availability/expiry remain read-time checks. Stale readiness fails unavailable until a legitimate worker/operator refresh; it is never falsely presented as verified.

All private helpers/raw result tables deny browser roles. The public RPC derives role from the protected profile, sanitizes output, and enforces operation/limit/filter allowlists. User responses omit Admin usage, technical actions, credentials, private source evidence and method specifications. Service-only publication/readiness functions are not browser-callable.

Reports combine persisted per-run facts, preserve outcome precedence and category unions, and resolve only the existing same-source one-level canonical redirect policy. Changed redirects invalidate report anchors. Missing/chained/cyclic/cross-source targets fail closed. Current lead payloads never supply historical outcomes or classifications. Existing overview aggregate-only receipt counts remain separate from identity-based analytics/drilldowns. Unknown history stays unavailable, rather than becoming zero.

## Verification

Evidence is retained privately in `outputs/deployment/scheduling-read-decoupling-build/` (ignored).

- `npm run lint`: passed. `npm run build`: passed, including TypeScript; existing bundle-size advisories remain.
- `npm run test:app`: 215 tests passed outside the sandbox. The sandbox attempt failed on inaccessible Vitest temporary module files, not assertions.
- Workflow suite: 416/417 passed in the sandbox; the remaining historical cutover test could not clone its local Git fixture there. Its two tests passed separately outside the sandbox (`cutover.log`). New persistence/read tests pass after the final SQL changes.
- Existing SQL import gates passed. No import/receipt/lease semantics were changed.
- Actual PostgreSQL 15/PostgREST native suite passed, including existing browser-independent private dispatch/execution, role protection and automatic-import regressions. New checks cover authenticated User/Admin and anonymous denial, hidden helper/raw-table denial, read-only database state, member/count agreement, reopened-run subtotals, canonical merge/classification retention, stale anchor rejection, cyclic redirects, and active saved progress.
- New PGlite tests execute the actual additive SQL and cover atomic rollback/replay/stale publication/recovery, late evidence, complete versus partial/unknown/N/A/verified-empty cases, duplicate jobs/leads, cross-run outcome precedence, selected JavaScript reducer parity (all-time/run/category/date filters), safe source/status/presentation parity, usage vectors, invalid filters and permissions.
- Browser acceptance against disposable PostgreSQL/PostgREST and the built app passed User/Admin Contracts report drilldowns, Schedules, Sources, schedule changes, statistics, submitted history and run source details with all execution/external HTTP blocked. Zero execution requests were attempted; final evidence is in `browser-final.log`. Screenshots were inspected. The disposable preview was stopped afterward.

No production performance or signed-in production acceptance is claimed. The fixtures establish correctness/security locally; production row distributions and exact release assets still require the separate release gate. Human testing should review existing drafts/navigation and Admin Manual runtime presentation, and compare representative real legacy source/results screens in an authorized preview.

## Prepared release sequence — requires separate authorization

1. Capture the actual production SQL/grants and currently locked frontend/worker deployment identifiers using the existing release process. Refresh the read-only aggregate historical inventory. Baseline planning inventory was 79 runs (16 completed, 54 Needs review, 5 Partial, 4 outcome unknown); it is not a blanket eligibility list.
2. Review and apply additive migrations in filename order: `20261104000100` through `20261104000800`. They cover publication/invalidation, protected run reads, public saved-read API, analytics, status/usage, minimal source-readiness inputs, source setup, and current run presentation. Run role-denial probes before publishing readers. No raw-table grants or production execution writes are necessary for these probes.
3. With existing server-only credentials, run `node scripts/project-capability-readiness.mjs --dry-run`. After reviewing the bounded input count, separately authorize `--apply` to populate only the two derived readiness fields. It must finish before switching source-setup readers.
4. Select explicit reviewed run UUIDs (1–100 per command); run `node scripts/project-run-results.mjs --dry-run <run-uuid> ...`. Its private incremental JSON report records evidence counts, source version/revision, supported counts/categories/completeness and unavailable cases. Review aggregate-only, incomplete and missing-evidence cohorts separately. Do not infer categories from leads, resume runs, reset leases or call providers. After separate approval, rerun with `--apply` for only accepted IDs; it uses the same atomic publisher and recomputes current inputs. Inspect any unavailable entry rather than treating the command's completion as cohort success.
5. Deploy the qualified worker integration on the existing Render Free service, retaining execution configuration/private dispatch/startup handling. Deploy an allowed preview frontend after SQL/readiness preparation, compare representative old/new responses, inspect query plans under actual row distribution, and verify real-role denied reads plus blocked-Render saved reads. Existing source/lead private evidence must remain private in both network responses and logs.
6. After explicit GO, publish the qualified frontend through the existing locked Netlify process. Record exact assets/hashes/deployment identifiers, role/read probes and unchanged Render plan/settings. A natural execution test needs its own authorized scope; read smoke tests alone do not prove production execution.

## Rollback

Restore the previously captured frontend deployment to use retained Render read endpoints. If necessary restore the previous worker integration; preserve all original receipts, verified imports and reporting invalidation markers. Keep additive result tables/evidence intact. Restore captured SQL function/grant definitions when needed; never loosen RLS or grant raw tables as a workaround. Correct a bad projection and atomically republish from verified evidence; do not roll back leads, erase original history, or perform routine schema deletion. No production rollback or release identifier exists yet because nothing was deployed.
