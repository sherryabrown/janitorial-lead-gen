# Integration and maintainability review — October 19, 2026

Reviewed baseline: `3199531` on `codex/admin-county-trigger-ui`. This is a source review, supported by the local validation recorded below. It does not certify the current deployed database, scheduler or external-provider access. No production calls, schema changes, source collection, imports or deployments are part of this review.

Implementation completed locally: see [finding resolutions, deletions and verification](2026-10-19-integration-remediation-build.md). The findings below describe the reviewed baseline, not outstanding defects in the completed build.

## Conclusion

The product's enabled screens use real services: Contracts uses Supabase reads/RPCs; Admin uses the authenticated Render API, shared workers and persisted Supabase schedules/results. There is no need for another integration architecture. However, end-to-end completeness is not established: schedule occurrences/events have no UI reader, review state is discarded during run transitions, and some failed reads are hidden. Cleanup should fix these paths before claiming the UI is fully wired.

Companies and email previews are intentionally retained future functionality. Bonfire's supported protected access remains an external acceptance blocker in its existing plan; this review does not restart that work. Scheduled non-SAM results still require their existing reviewed import process; SAM saves validated results automatically. These are intentional different policies.

## Findings

### R1 — P1: Run transitions discard an in-progress review

`src/features/admin/RunDetail.tsx` renders `RequestReview` with `key={`${child}:${run.state}`}`. Polling changes `run.state`, which remounts the review component. Its local selected candidates, reason, source/finding form, quotation and open packet are lost even when the request ID is unchanged. The parent can change while the operator is reviewing a child's results.

Keep component identity tied to the child request. Refresh server-owned results explicitly without resetting user-owned input. Maintain exact evidence/hash/version checks; do not submit a draft silently against a changed packet. Test a running → needs_review transition with a typed quotation/reason and selected candidates, then a true child change which must isolate drafts.

### R2 — P2: Schedule failure/history is persisted but not reachable

`scripts/lib/procurement-schedules.mjs` exposes paginated `occurrences()` and `events()` through `scripts/lib/workflow-http.mjs`. No frontend call reads either route. `ScheduleList.tsx` only provides edit/run/pause/resume/archive; `AdminScreen.scheduleAction()` can explicitly tell the user to review schedule history without offering that view. A skipped/blocked occurrence can have no trigger, so Activity is not a substitute.

Add compact expandable history to a schedule using these existing endpoints, with pagination, safe failure reasons, local dates/timezone and links to existing trigger details when present. Include a way to inspect retained archived schedule history. Never fabricate a run link for an occurrence without a trigger.

### R3 — P2: Refresh/pagination loses Admin context and can race

`AdminScreen.tsx` reloads all five bootstrap resources on every `revision`. Success replaces schedules and runs with page one and resets their offsets, including after a run state change. Previously loaded pages disappear. `loadMore()` is neither guarded against overlapping requests nor tied to the refresh generation; a late old response can restore stale rows/cursors after a refresh. The county registry and scheduler status are also refetched for unrelated mutations.

Retain the loaded range and selected run. Use existing AbortController/generation patterns to reject stale page responses; disable overlapping page loads. Refresh only affected collections, with explicit full reload on connection retry. Do not add a global cache framework. Reconcile removals/archives, rather than retaining all stale rows indefinitely.

### R4 — P2: Failed saved-result reads can appear absent or still loading

`RequestReview.tsx` swallows initial SAM packet and pending import-status failures with `.catch(() => {})`. SAM automatic polling only starts once a packet has been obtained. An initial packet failure therefore has no specific failure/retry feedback. `RunDetail.tsx` renders its manual Refresh progress button only after `run` exists; an initial failure leaves an error and a loading heading without an in-place retry. Backend errors intentionally avoid leaking private provider/database detail; preserve that protection.

Distinguish loading, not-yet-available, failed and empty states. Expose retry for the failed read without restarting collection/import. Use bounded polling for a genuinely pending saved packet, stopping on cancellation, completion, unmount or errors with an explicit retry action. Add safe enumerated blocker/diagnostic references where needed; never publish raw checkpoint errors, credentials or SQL.

### R5 — P2: Historical documentation contradicts current behavior

`docs/PROCUREMENT-WORKFLOW.md` says the Admin SAM entry performs no automatic import in its SAM extension, then describes automatic persistence in the following section. Its universal manual approval wording needs a clear SAM policy exception. `docs/CODE-REVIEW-GUIDE.md` still focuses on the pre-Admin architecture and old Generate flow. `tests/integration/README.md` concludes with keeping paid Generate disabled although Admin replaced that entry. These are current reader guides, not merely immutable historical reports.

Consolidate current behavior; retain dated historical evidence with explicit scope. Reconcile the status/ownership headers of the older todo plans against current source and newer completion reports. Do not mark external acceptance complete just because code exists.

### R6 — P3: Dead manual-SAM UI remains in the shared review component

`RequestReview.tsx` renders manual preparation only under `!sam`, but inside it retains a `samPacket?.partial` consent control and a `sam && ...` disabled condition. `samPacket` is populated only for SAM. The preparation payload still conditionally supplies SAM run IDs/partial approval; those branches cannot be invoked from the current UI. Remove this obsolete UI state/branches while retaining the non-SAM reviewed path. Do not remove backend legacy SAM compatibility or `sam_review` checkpoints: they still support saved requests and automatic recovery.

### R7 — P3: Retirement candidates still look executable/current

`scripts/record-phase2b-open-items.mjs` is a fixed two-run historical ledger updater, with no other repository reference found. `supabase/functions/spin_generate_contracts/index.ts` remains a dormant alternative generation implementation; repository searches found no current frontend/script/test invocation. `specs/deferred/procurement-tables-ui-integration.md` proposes rewriting that obsolete path despite the replacement Admin workflow. The old Bonfire Agency Explorer plan explicitly declares itself superseded but remains in todo.

These are retirement candidates, not proof that an externally deployed endpoint has no consumers. Follow the cleanup manifest and release constraints in the implementation plan. Preserve migrations, baselines, reusable CLI tools, real fixtures and operational evidence. No database table/function drop is authorized by this finding.

### R8 — P3: Admin payload and module boundaries deserve targeted optimization

`src/features/admin/data/arkansas-counties.json` is 949,687 bytes and statically imported into the lazy Admin module. The generator quantizes/deduplicates adjacent points but retains dense boundaries. Preserve 75 county identities and accessible hit areas; measure before choosing simplification or separate loading. Do not substitute an inaccurate decorative map or hide the bundle warning by raising its threshold.

`hosted-sam.packet()` rereads/verifies saved captures and all intake records and includes raw notice/award objects for every automatic-status poll. `RequestReview` uses the packet for polling and only displays selected mapped fields. Separate lightweight saved automatic status from lazily loaded evidence, or otherwise reuse immutable verified evidence safely; keep full evidence available for review and never weaken hashes/readback. Measure query counts/bytes with representative fixtures before changing this interface. Existing pagination bounds must fail explicitly rather than truncate evidence.

Large mixed-responsibility `RequestReview.tsx`, `AppShell.tsx` and compact backend route modules increase maintenance cost. Extract only coherent components/helpers touched by these fixes; a wholesale rewrite is not justified. Keep contracts and workers shared.

## Frontend/backend wiring inventory

| User operation | Existing connection | Review outcome |
| --- | --- | --- |
| Sign in/out/session restore | AuthGate → Supabase Auth; workflow bearer validation | Wired; preserve session boundaries and owner-scoped drafts |
| Queue/filter/count/page/detail | AppShell → procurement adapter → queue RPC/detail reads | Wired; existing stale-response guards, server pagination and lazy detail should remain |
| Single/bulk stage, notes/edit/history | Adapter → transactional RPCs/history tables | Wired; keep actor checks, atomicity and confirmed-write/failed-read distinction |
| Lead freshness | Supabase realtime + focus refresh | Wired; test returning from verified import with realtime unavailable; use existing refresh instead of assuming subscription delivery |
| County map/checklist/chips, included cities | CountySelector/TriggerForm → counties/preview → shared geography registry | Wired; use actual FIPS IDs and preview hash, preserve state-source ownership |
| Manual county/state runs | Admin → triggers → shared discovery/collection workers | Wired in source; provider gaps remain explicit |
| Daily multiple times/weekly/monthly | ScheduleFields → preview/save/control/run-now → persisted scheduler | Wired in source; timezone/DST/version/idempotency contracts retained |
| Schedule occurrences/events/archive history | Existing backend routes | Missing frontend reader: R2 |
| Activity/steps/AI usage | RunDetail → triggers/status/steps → ledger summaries | Wired; fix R1/R3/R4 and preserve unknown actual usage vs zero/reserved estimates |
| Discovery/source review/access actions | RequestReview/SourceReview → discovery/access routes | Wired core actions; protected provider access is not guaranteed by a route existing |
| Evidence/candidates/non-SAM import/reconcile | RequestReview → packets/interpret/prepare/approve/reconcile | Wired; exact tested package approval remains intentional for non-SAM |
| SAM manual/scheduled/automatic persistence | SamSection → SAM trigger config → existing collector/import worker/native transaction | Wired; preserve automatic imports, deduplication, validation and uncertain-outcome holds |
| Bonfire supporting evidence | Saved evidence reader → authenticated supporting-evidence route | Wired saved read; protected collection remains separately blocked; trusted operator capture routes need not become generic UI controls |
| Companies and email previews | Disabled Companies prototype / preview-only components | Retained exception; no database/email-send wiring requested |

Private scheduler ticks, credential/session operations and operator CLI utilities are not missing public UI controls merely because no browser calls them. Never expose secrets or internal execution routes to meet an overly broad endpoint-parity target.

## Verification and limits

Source inspection covered application entry/auth, queue adapters and mutations, Admin forms/reviews/results, HTTP route dispatch, scheduler/trigger/status/usage services, SAM packet/automatic boundaries, worker composition, current and historical docs, existing tests and tooling. Repository-wide searches checked current endpoint calls and named retirement references. This is not a line-by-line proof of every historical migration or externally invoked CLI, nor a certification that no unused CSS/export remains.

Local `npm run check` **passed outside the sandbox**: lint, 59 UI tests, 283 workflow tests, SQL regressions, TypeScript and production build. The initial sandbox run failed reading Vitest temporary transformed modules (ENOENT); that was a tooling failure. The existing Admin bundle warning remains: 1,014.03 kB / 214.20 kB gzip. Passing existing tests does not cover the missing cases identified above. No isolated access or visual suite was rerun for this documentation-only turn; both are required after implementation. Historical successful acceptance is evidence of its dated release only.

Implementation: [Integration review remediation and cleanup](../../specs/done/integration-review-remediation-and-cleanup.md).
