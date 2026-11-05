# Decouple saved scheduling reads from Render

Planning date: November 4, 2026. Planning only; no application, schema, scheduler, hosting or production-data changes are authorized by this document. Implementation and deployment are separate steps.

Released November 5 after the owner's explicit commit/deploy request. See the [production release record](../../docs/reviews/2026-11-05-scheduling-read-decoupling-release.md) for qualified historical projections, deployment identifiers, permission/Render-blocked acceptance, query timing and recovery. The planning-only prohibitions and open decisions below are historical; the resolved decisions and authorized release supersede them. This plan and its three implementation specs are complete.

Owner decisions resolved during build: saved reads may stop waking execution; existing commands/private dispatch continue work. Live key readiness and AI budget may load only in the existing Manual runs view. Keep known subtotals for incomplete history. No additional product behavior decisions remain open for this implementation.

## Objective

Contracts, saved schedules, run results, activity/history, statistics, and report-to-Contracts links must load through authenticated Supabase reads while Render is unavailable. Render Free continues executing work and handling workflow commands. Saved data must not require a worker wake, source fetch, interpretation, import, or report backfill initiated by the viewer.

Keep the current interface, navigation, selections, mounted drafts, refresh ownership, recurrence, source decisions, import safeguards, permissions and reporting definitions. This is not a scheduling redesign or a general caching project.

## Scope guard after plan review

Reviewed November 4 at the owner's request for minimal scope. This is an internal responsibility split, not a feature release. The only new internal behavior is persisting the run-level result needed to serve existing reads without Render, with atomic replacement, freshness checks and retry/recovery necessary for correctness. Reuse existing reducers and execution lifecycle where possible; Render may compute and persist results while gathering/finalizing. Only reading saved results must be independent of Render.

Do not add screens, buttons, report types, filters, export tools, notifications, a result-version browser, permanent projection-history storage, runtime-configuration snapshots, feature-flag infrastructure, a new worker/scheduler, or a generic repair framework. Do not redesign the Admin source/import/review workflows. Move their saved fields only where required by an existing in-scope schedule/run/report view; workflow actions and their consoles remain Render responsibilities. Preserve original job receipts as historical evidence instead of building another audit-history system.

Each implementation change must map to (a) persisting existing result facts, (b) securely serving an existing saved read, (c) switching its existing consumer, or (d) the minimum migration/recovery/test support for those changes. Anything else is out of scope. Supporting schema/RPC names below are proposals subject to the existing-structure necessity check, not a mandate for extra infrastructure.

## Implementation sequence

This work crosses persistence, security and rollout boundaries. Use three ordered implementation specs, with six gated phases total:

1. [Persist verified run results](01-persist-verified-run-results.md): evidence contracts/inventory, then current-result persistence/finalization/recovery.
2. [Secure Supabase scheduling reads](02-secure-supabase-scheduling-reads.md): protected saved-data projections, then report and metric-member queries.
3. [Switch and release scheduling reads](03-switch-and-release-scheduling-reads.md): frontend cutover/compatibility, then qualified backfill and authorized rollout.

Build the whole qualified change before enabling the new frontend path. Database functions and compatibility readers can be introduced additively first. Do not release a partially decoupled screen that still contacts Render during initialization.

## Repository baseline inspected

Current HEAD: `a8f417a9f16f4be000e73389c11a5b1dd35208e3`. The working tree also contains the deployed November 3 startup fix in `src/features/admin/SchedulingRole.tsx`, `src/lib/procurement-workflow.ts`, its new test, and its release review. Preserve those changes, along with the pre-existing `supabase/.temp/cli-latest` modification. Recheck HEAD and the working tree at implementation time.

Relevant code:

- `src/lib/procurement.ts` and `src/app/AppShell.tsx`: ordinary Contracts use `procurement_queue_page` directly; report-scoped Contracts first call Render's metric-members endpoint.
- `src/lib/procurement-workflow.ts`, `src/lib/shared-read.ts`: authenticated Render requests, read deduplication/cancellation, 90-second capabilities deadline and ordinary 30-second read deadlines.
- `src/features/admin/SchedulingRole.tsx`: capability polling, role-dependent unmounting, private draft cleanup, and the waking/error treatment.
- `scripts/lib/hosted-import-jobs.mjs`, `verified-reporting-records.mjs`: persist manifest-derived reporting records after verified import/readback and reconciliation. Classification/outcome must come from these receipts, not today's mutable lead fields.
- `scripts/lib/reporting-identities.mjs`, `canonical-reporting.mjs`: outcome precedence, category unions, identity fingerprints, and validated current canonical redirects.
- `scripts/lib/schedule-reporting.mjs`, `admin-analytics.mjs`, `admin-run-history.mjs`, `schedule-activity.mjs`, `scheduling-presentation.mjs`, `county-source-attention.mjs`: current saved-read response contracts and calculations.
- `scripts/lib/procurement-schedules.mjs`, `county-triggers.mjs`, `workflow-http.mjs`: route/command split, parent-child relationships, controls, and GET side effects.
- Migrations `20261026000100` through `20261026000500`: profile role protection, existing `procurement_capabilities()`, Admin-only raw reads and retired membership rules.
- Migrations `20261020000200`, `20261022000100`, `20261023000200`, `20261023000100`, `20261028000100`: schedule overview, audit/activity views, canonical Contracts reads, and service-only source-review projections.

The existing Supabase capability RPC already supplies the needed browser role contract. Reuse it; do not introduce a second role authority. Existing internal schedule/activity views and source-review functions are not automatically safe to grant to browsers.

## Current dependencies and target ownership

| Feature | Current path | Target |
| --- | --- | --- |
| Ordinary Contracts, detail, notes/stages | Supabase queries/RPCs | Preserve |
| Report-scoped Contracts membership | Render metric-members, then Supabase leads | Supabase report/member RPC, then existing lead reads |
| Scheduling capabilities | Render queries `profiles.role` | Existing authenticated `procurement_capabilities()` |
| Schedule list/choices/detail/deletion eligibility | Render overview/deletion views plus reconstruction | Protected Supabase saved-read RPCs |
| Occurrences, audit events, activity/history/run choices | Render joins stored tables plus reconstruction | Protected Supabase RPCs, same ordering/filtering |
| Run detail/progress, child/source status, saved logs | Render joins stored records | Role-specific Supabase RPCs; no worker kick |
| Statistics, lead/issue drilldowns, timing and usage | Render JavaScript aggregation | Supabase queries over saved run results and current saved status/ledger data |
| County/state choices and saved source setup | Render catalog/trigger services | Safe Supabase projections; no raw private registry grant |
| Saved request/import/SAM fields embedded in existing run/report views | Mixed Render saved reads | Move only the fields needed by those views; independent Admin workflow consoles remain Render-backed |
| Schedule/trigger previews and commands; source verification/repair/apply; import/reconcile/continue; external evidence operations | Render workflow services | Remain Render with current authorization/idempotency/waking behavior |
| Dispatch, worker leases, provider calls, budget enforcement | Existing Supabase dispatch and Render worker | Preserve |
| Admin runtime configuration sourced from Render environment | Render status response | Decision below; never block saved Schedules initialization on it |

Map exact routes and side effects before editing. In particular, GET trigger/request/import status currently calls `kick()` in `workflow-http.mjs`; opening a run can advance unrelated pending work. Supabase reads will intentionally have no such side effect. Preserve execution through existing command kicks/private scheduler dispatch, and verify browser-closed continuation. Do not add keep-alive traffic or a new scheduler to compensate.

## Read-only historical inventory

An explicit `BEGIN READ ONLY` transaction through the existing trusted Supabase Management API was completed November 4, 2026, at approximately 12:28 PM America/New_York. The response confirmed `transaction_read_only=on`. Only aggregate counts were exported; no account data, capture bodies or credentials were included. Private SQL, credential-provider wrapper and aggregate receipt are in ignored `outputs/deployment/scheduling-read-decoupling-plan/`.

| Inventory | Observed |
| --- | ---: |
| Saved schedules / enabled / archived | 14 / 3 / 11 |
| Parent runs | 79 |
| Completed runs | 16: 1 county, 12 SAM, 3 state-source |
| Needs review / Partial / Outcome unknown | 54 / 5 / 4 |
| Child links / distinct linked requests | 113 / 113; no multiply linked requests observed |
| All jobs, including standalone/unlinked work | 3,865 |
| Verified jobs | 126 |
| Verified jobs with version-1 identity arrays | 32 |
| Verified jobs with legacy county identity arrays | 105; overlaps the version-1 group |
| Verified jobs without either identity array | 13 |
| Version-1 identity records observed | 32; no malformed IDs/outcomes or unknown categories detected by the coarse probe |
| Workflow steps / usage rows | 67,796 / 128 |
| Occurrences / schedule events | 52 / 86 |
| Current recognized canonical lead redirects | 1 |

Eight of the 12 completed SAM runs have at least one verified identity array. Neither the completed county run nor the three completed state-source runs have an identity array; this does **not** prove they should have lead results (source-maintenance runs and proven no-result runs must be classified separately). Forty-one Needs-review county runs and two Partial county runs have at least some verified identity evidence. One Needs-review run, three Partial runs and all four Outcome-unknown runs still have unsettled linked jobs.

These are evidence-presence counts, not counts of eligible complete backfills. Job counts include work outside these parent runs. The probe did not validate every legacy record, every receipt's provenance, every no-result disposition, or every canonical target. Phase 1 must produce a per-run eligibility report and check evidence shapes before any backfill. Refresh this inventory at implementation/rollout time; normal schedules remain active.

## Design summary

Persist verified run membership at existing import/run lifecycle boundaries. Fully finalize only a completed run whose relevant work is settled and verified. Retain supported known subtotals for other runs, with independent completeness flags. Prefer one current per-run result with a revision/fingerprint and indexed deduplicated members; evaluate reuse before adding up to two `procurement_...` tables. Atomically replace the derived result when evidence changes. Original receipts remain the historical record; permanent copies of every derived result revision are unnecessary. Reuse existing status, audit, usage and source-decision tables for everything else. Do not persist every arbitrary cross-run report or create another workflow queue.

Render can reuse its existing reducers to produce the saved run result during execution; a service-only Supabase operation publishes it atomically. Supabase handles secured saved reads and cross-run aggregation. Historical import facts remain tied to original receipts, while validated canonical-ID resolution and current issue status remain read-time projections over saved data. This preserves existing semantics without requiring Render or re-reading import manifests on every report.

## Confirmed decisions and outstanding input

Confirmed in this chat:

- Keep Render Free; no keep-alive traffic.
- New tables, only if justified, must begin `procurement_`.
- Keep verified results from Partial/Needs-review historical runs visible as clearly labeled known subtotals. The owner selected this option during planning. Do not hide these results or promote them to fully verified totals.
- Do not implement or deploy during planning.

Before implementation changes affected behavior, obtain focused answers to these remaining issues (prepare concrete options in phase 1):

1. **Read-triggered continuation:** Removing worker kicks from saved GETs is necessary for decoupling. Recommended behavior: only existing execution commands and private scheduled dispatch wake work. Confirm this is acceptable after demonstrating that accepted jobs still progress with the browser closed; do not silently remove the only continuation mechanism for a workflow.
2. **Admin runtime configuration:** `backend_key_configured` and current AI policy come from Render environment, not saved database rows. Keep these live workflow details Render-backed and outside the saved-read loading dependency. Do not add a new button or configuration snapshot. If isolating the existing fetch requires changing when/where these existing fields appear, show the specific impact and ask before changing that behavior.
3. **Completeness presentation:** Existing `verifiedRunOutcomes` can return complete for some non-completed run states. The requested stricter policy means such rows may change from Known to Partial/Unknown even when their known subtotal stays the same. Reuse current labels and subtotal presentation; show a before/after impact list and ask only if existing presentation cannot express the requested distinction. Do not redesign status labels or introduce additional status categories.

No product decision is needed to reuse profile-based security, keep current canonical redirect rules, retain existing evidence, or preserve current report date/usage semantics. Do not invent new merge or stale-cache policies.

## Completion criteria

- With all Render requests blocked, cold browser sessions load the saved Contracts/Schedules/history/stats/drilldowns appropriate to their role, including active progress from persisted state.
- Completed-run membership/counts are persisted once per evidence revision, atomically, with recovery and revision checks. Viewing results performs no writes/finalization and cannot trigger provider or worker activity.
- Counts and member pages use one filtered/revision-checked population; cross-run uniqueness and category/outcome rules match the qualified baseline except the explicitly requested stricter completeness rules.
- Raw source configuration, artifacts, credentials, private evidence and Admin-only usage remain inaccessible to Users and anonymous callers.
- All unsupported historical facts remain unavailable; zero results require evidence. Backfill cannot resume jobs, collect data or change leads/schedules.
- Actual workflow actions retain their safeguards and startup handling; Render's plan, recurrence and dispatch remain unchanged.
- Native PostgreSQL/PostgREST, app, workflow, security, interruption and Render-blocked browser acceptance pass. Release/rollback receipts identify exact versions and any approved behavior differences.

## Initiating prompt

> Decouple saved Schedules and reporting reads from the Render execution backend.
>
> Work in C:\Users\sherr\janitorial-lead-gen and follow AGENTS.md. Inspect the existing implementation before proposing changes.
>
> Objective: Contracts, saved schedules, completed-run results, history, statistics, and report-to-Contracts drilldowns should load through secured Supabase reads without requiring Render to be awake. Keep Render's free plan and use Render for execution and workflow operations.
>
> Requirements:
> 1. Finalize completed-run results after all relevant jobs reach a confirmed terminal state. Combine verified job results, deduplicate leads, and persist run membership, outcomes, historical classifications, completeness, and counts in Supabase.
> 2. Make finalization idempotent and recoverable after interruption. Do not mark pending, partial, failed, or outcome-unknown work as fully verified.
> 3. Serve saved scheduling data and access checks through appropriately secured Supabase queries, views, or RPCs. Preserve existing User/Admin permissions and protect technical details, credentials, and private source information.
> 4. Build reports across runs from persisted results. Preserve current filtering, deduplication, outcome precedence, pagination consistency, and drilldown-to-count agreement.
> 5. Preserve historical outcomes and classifications when leads change or merge. Inspect the existing canonical-ID reconciliation behavior and propose how to retain it.
> 6. Any new tables in Supabase (if and only if needed) must start with the name 'procurement_...'.
> 7. Support active-run progress without requiring Render for reads; execution still depends on Render.
> 8. Inventory historical data before planning a backfill. Reconstruct results only where verified evidence exists. Keep unsupported historical results explicitly unavailable.
> 9. Preserve existing UI, navigation, drafts, schedule behavior, execution safeguards, and report semantics. Identify any necessary behavior changes and ask how to handle them before implementing those changes.
> 10. Keep the existing backend-waking handling for actions that still require Render. Do not upgrade hosting or add keep-alive traffic.
> 11. Test permissions, interrupted finalization, duplicate jobs/leads, cross-run reports, lead merges, historical gaps, and operation while Render is unavailable.
>
> First deliver an implementation plan covering current read/write dependencies and which remain on Render; proposed Supabase schema and security boundaries; run-finalization and recovery design; historical backfill limits; compatibility, rollout, and rollback; and decisions requiring my input.
