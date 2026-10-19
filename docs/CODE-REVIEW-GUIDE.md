# Code review guide

Updated October 19, 2026. This guide describes current source, not a new deployment certification. Dated reviews and release receipts remain historical evidence. Start with [AGENTS.md](../AGENTS.md), [Admin UI](ADMIN-UI.md), [backend contracts](PROCUREMENT-BACKEND.md) and [persistence policies](PROCUREMENT-WORKFLOW.md).

## Application and data boundaries

| Review path | What to verify |
| --- | --- |
| `src/main.tsx` → `App.tsx` → `app/AppShell.tsx` → `features/auth/AuthGate.tsx` | Session restore/sign-in/logout; protected state belongs to the current user. Companies is disabled; email previews do not send. |
| `src/lib/procurement.ts` → queue/detail/history reads and stage/note RPCs | Server pagination/counts, date/category mapping, stable selections, stale-response rejection, atomic writes, note ownership and preserved research. |
| `src/features/contracts/save-lead-change.ts` | Confirmed writes stay confirmed when a subsequent history read fails. |
| `src/features/admin/AdminScreen.tsx`, `CountySelector.tsx`, `TriggerForm.tsx`, `model.ts` | Registry FIPS IDs, city/county scope, independent state-source drafts, preview hashes, bounded windows, stable retry keys and retained manual draft. |
| `ScheduleFields.tsx`, `ScheduleList.tsx`, `ScheduleHistory.tsx` | Daily multiple times/weekly/monthly, Chicago timezone/DST policy, saved versions, occurrence/event history, archived history, no-run outcomes and pagination. |
| `RunDetail.tsx`, `RequestReview.tsx`, `SourceReview.tsx` | Stable review identity, request isolation, source/evidence hashes, truthful loading/errors/retries, changed-candidate invalidation and actual usage. |
| `SamSection.tsx` and SAM results | Separate statewide scope; valid manual/scheduled results save automatically; exclusions and uncertain outcomes stay visible. Lightweight status polling must not reload immutable evidence every tick. |
| `src/lib/procurement-workflow.ts` | Bearer session refresh, allowed configured origins, no service secrets, stable idempotency after acknowledgment loss. |

For each enabled action, trace **UI → HTTP/RPC → persisted result → refreshed UI**, including failure and retry. Private credential/session routes and operator-only tools do not need public controls. Keep queue context when moving between Admin and leads.

## Execution and persistence

| Files | Responsibility |
| --- | --- |
| `scripts/workflow-server.mjs`, `scripts/lib/workflow-http.mjs` | Existing service composition, authenticated HTTP, CORS, bounded worker wake and private scheduler authorization. |
| `county-triggers.mjs`, `procurement-schedules.mjs`, `schedule-recurrence.mjs`, `workflow-audit.mjs` under `scripts/lib/` | Shared scopes/ownership, durable occurrences and leases, cancellation, version/CAS, idempotency, step audit and actual vs unknown/reserved AI usage. |
| `hosted-workflow.mjs`, `hosted-discovery.mjs`, known-source and geography libraries | Existing registrations, missing-source research, immutable capture/interpretation, durable checkpoints, bounds and partial coverage. |
| `hosted-sam.mjs`, `sam-automatic-import.mjs`, `hosted-import-jobs.mjs`, `hosted-import.mjs` | Automatic SAM validation, exclusions, canonical identity, native tested-package authority, atomic application/readback and reconciliation without duplicate collection. |
| `native-sql-rehearsal.mjs`, `restricted-import-connection.mjs`, `intake-reconcile.mjs` | Isolated native PostgreSQL rehearsal, restricted production transport, evidence links, rollback/replay and protected user fields. Offline PGlite tests are not proof of live authorization. |
| `supporting-capture.mjs`, `bonfire-detail-continuation.mjs`, access/browser services | Signed saved evidence, exact listing/parent links, no challenge loops, no clearance transfer; retain the paused external access blocker. |

Non-SAM reviewed imports retain explicit exact-package approval. SAM automatic imports use private server authority and keep the same validation/duplicate/readback protections. Do not generalize either policy to the other.

## Database and operational history

Read the sanitized baseline with all applicable forward migrations and the isolated harness's migration list. The September 30 baseline alone is not the final schema or authorization policy. Preserve history, row policies, note authorship, privileged-function grants and native validator restrictions. Do not drop historical `spin_*` tables or rewrite applied migrations as cleanup.

Use [source access](SOURCE-ACCESS.md), [live access evidence](SOURCE-ACCESS-LIVE-STATUS.md), [known-source execution](KNOWN-SOURCE-EXECUTION.md), and the repository research skill for authorized operational research. Skills are procedures, not always-running services. CLI tools can be legitimate entry points without imports or browser callers. Historical fixed batches are not fresh authorization to apply them.

The obsolete local Generate function/prompt and fixed phase-2b ledger updater were retired after reference checks; the October 19 read-only Supabase function inventory contained no `spin_generate_contracts`. No remote endpoint or database table was removed. Preserve prior reports as dated evidence rather than treating their old commands as current instructions.

## Verification and hygiene

Use [development workflow](development-workflow.md), [integration gates](../tests/integration/README.md) and [fixture documentation](../tests/fixtures/README.md). Run targeted tests during implementation, then the required final aggregate checks. Browser fixtures establish UI behavior, isolated PostgreSQL/PostgREST establishes transactional/access behavior, and live acceptance has its own dated evidence.

For unused-code cleanup, inspect imports, package commands, dynamic references, tests, deployment configuration, documentation and active future plans. Preserve Companies/email-preview selectors and data. Remove only confirmed obsolete assets; keep an explicit deletion manifest. Check relative links after moving plans.

Current review: [October 19 integration findings](reviews/2026-10-19-integration-maintainability-review.md). Build evidence and wiring coverage: [integration remediation build](reviews/2026-10-19-integration-remediation-build.md).
