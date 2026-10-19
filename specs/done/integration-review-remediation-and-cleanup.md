# Integration review remediation and cleanup

Status: **done** — October 19, 2026. Created against `3199531`; all three implementation phases and required local acceptance passed. Changes are uncommitted and undeployed. See [build evidence and cleanup manifest](../../docs/reviews/2026-10-19-integration-remediation-build.md).

## Initiating prompt

> [$plan-code] let's move on. please perform a code review making sure:
> - the code is efficient
> - the code is effective
> - the code is easily maintained
> - extraneous and/or unused code and documentation are removed
> - we are fully wired between the front and back end (except for Companies)

## Objective and boundaries

Resolve the concrete findings in [the October 19 review](../../docs/reviews/2026-10-19-integration-maintainability-review.md), complete user-facing wiring gaps with existing services, and remove obsolete implementation/documentation without changing supported behavior.

Reuse Supabase queue/RPCs, authenticated Render HTTP routes, the shared durable worker, existing scheduler/ledger, source discovery/collection, and native-tested import services. No new queue, storage backend, provider account, cache framework or replacement scheduler. Preserve AI settings/budgets, protected user fields, idempotency, evidence integrity, transaction/readback and uncertain-outcome reconciliation. Keep Companies and email previews as future functionality, including their required data/types/styles. Do not activate email sending.

SAM remains independent of counties and automatically saves valid results for manual and scheduled runs. Non-SAM reviewed import policy is unchanged. Do not reintroduce SAM approval controls or extend automatic approval to other providers.

Bonfire/Euna access work is paused for this effort. Retain its active Portal collection plan and honest blocker/status; no challenge retries or provider signup/support messages. Generic review-state fixes can apply to its existing UI without claiming protected access works.

**Netlify production stays unchanged.** This plan does not require a deployment to be completed. If a preview/backend release is requested later, record exact code/deploy versions and verify production remains unchanged. Live external checks are separate from isolated implementation acceptance; never run a paid search or production write as an incidental test.

## Phase 1 — Reliable state and complete user-facing connections

### 1. Preserve reviews across background changes (R1)

Files: `src/features/admin/RunDetail.tsx`, `RequestReview.tsx`, `SourceReview.tsx`, relevant tests.

- Key request review by stable child request identity, not parent state. Add an explicit revision/refresh signal for server data as needed.
- Separate persisted server results from selected candidates and editable review inputs. Refresh may invalidate stale selected evidence, but must show that fact and retain typed work for correction rather than silently resetting it.
- Reset or isolate drafts on a real child/request/account switch. Never mix quotations or candidate IDs across requests. Keep current evidence hashes and exact-package approval checks.
- Guard async packet/saved-evidence reads so an older response cannot replace a newer selection. Reuse existing request sequence/AbortController patterns.
- Test a parent state transition while reviewing, a real child switch, packet hash change and failed refresh.

### 2. Add saved schedule history using existing endpoints (R2)

Files: `ScheduleList.tsx`, `AdminScreen.tsx`, `types.ts`; existing `procurement-schedules.mjs`/`workflow-http.mjs` contracts.

- Provide an expandable History action within each schedule row, preserving county/manual/schedule draft and current run context.
- Load `/v1/schedules/:id/occurrences` and `/events` only on demand. Reuse existing paginated data; no new history table.
- Show meaningful occurrence outcomes including skipped, blocked, missed/coalesced intervals and run-now outcomes. Render actor/event details only from the safe projection.
- Link `trigger_id` to existing RunDetail. When absent, show the stored reason and the appropriate existing edit/review action.
- Make archived schedules/history discoverable through a concise toggle/filter. Do not add unarchive behavior unless separately requested. Account for backend pagination including archived records; avoid showing a false empty state when visible records remain on later pages. A backward-compatible server filter may be added if necessary.
- Preserve version/CAS checks and stable retry keys. Test schedule history larger than one page, no-trigger occurrences, archived schedules, errors, and links to existing runs.

### 3. Fix refresh, pagination and error recovery (R3/R4)

- Split stable registry/status loading from mutation-specific activity/schedule refresh. Keep an explicit Retry Admin connection that refreshes all needed resources.
- Preserve loaded range and selected row after refresh; revalidate that range with bounded reads and removal handling. Do not simply append new page-one results forever.
- Associate load-more requests with their collection generation, abort/ignore superseded reads and prevent overlapping clicks. Apply the same pattern where candidate/step paging has the same race.
- Give SAM packet and import-status reads explicit loading/pending/error states and in-place retry. Never turn missing packet data into a successful empty collection. If packets are unavailable while collection runs, represent that specific condition distinctly from general backend failure.
- Make Refresh progress available when the initial run fetch fails. A retry of a read must not trigger a new import/search.
- Keep safe public error messaging. If actionability requires structured codes, add a bounded allowlisted response shape and tests; do not expose raw database/provider exceptions.
- Verify View saved leads/Back to contracts refreshes the existing queue after successful import while preserving filters/page/selection where still valid, including when realtime is disconnected. Use the existing refresh function, not a second queue loader.

## Phase 2 — Focused simplification and performance

### 1. Remove unreachable approval UI (R6)

- Remove `allowPartial`/setter/reset and partial SAM consent inside the `!sam` preparation form, the impossible `sam && ...` disabled condition and unreachable SAM preparation-payload alternatives after confirming all current call sites.
- Keep non-SAM review state and prepare/approve/reconcile behavior. Preserve backend legacy SAM clients, saved `sam_review` checkpoints, automatic resume/reconcile routes and historical evidence compatibility.
- Extract a small SAM results/status component and/or reviewed-import panel if this makes the touched code clearer; keep domain contracts explicit. Do not rewrite AppShell merely because it is large.

### 2. Reduce repeated evidence reads (R8)

- Measure current SAM status polling query counts, response size and saved-artifact reads with representative small and large fixtures. Inspect `statewideSam.packet()` and `RequestReview` together.
- Reuse an existing lightweight status route where it supplies the automatic counts/state, or add a narrowly scoped read-only automatic-status projection on the existing SAM service. Load full immutable evidence only on initial review/expansion or when the saved evidence identity changes.
- Keep initial pending packet recovery and terminal/error behavior from phase 1. Do not poll indefinitely on a hidden/unmounted view. Keep unknown usage/outcomes distinct from zero.
- Do not cache mutable authorization, import baseline or approval checks. Evidence reuse must retain the current request/run/hash binding; exclude raw notice/award bodies from status-only responses.
- Add request/query-count tests for several poll cycles and payload-shape tests. Preserve full evidence review and reconciliation.

### 3. Bound map payload without degrading selection

- Record baseline uncompressed/gzip Admin bundle and map size. Current map source is 949,687 bytes.
- Prefer reproducible build-time size reduction using `scripts/build-arkansas-county-map.mjs` or separate loading of the existing asset if measurement shows a benefit. Preserve source attribution and generation provenance.
- If simplifying geometry, preserve shared boundaries, holes where meaningful, all 75 valid FIPS IDs, hit areas and county names. Avoid independently simplifying adjacent borders into visible gaps. Do not add a heavyweight geographic runtime dependency just to reduce an asset.
- Verify desktop/mobile/keyboard, zoom/readability and registry-unavailable behavior. If a safe reduction is not justified, record measured evidence and retain the current asset; do not disguise the warning by changing the warning threshold.

## Phase 3 — Evidence-based retirement, documentation and acceptance

### Cleanup manifest

Record final actions and repository-wide reference searches in a dated build report. Imports alone are not enough to determine whether a CLI/script/SQL asset is used; inspect package commands, tests, docs, skills, deployment configuration and active future plans.

| Item | Planned disposition / condition |
| --- | --- |
| Unreachable manual SAM branches in `RequestReview.tsx` | Delete as part of phase 2; retain current backend compatibility |
| `scripts/record-phase2b-open-items.mjs` | Remove fixed historical updater after confirming no active operational/deployment use; retain the historical source/access records and a short audit explanation if needed |
| `supabase/functions/spin_generate_contracts/index.ts` | Retire local obsolete Generate implementation after read-only inventory confirms no current supported invocation/deployment dependency; no automatic remote function deletion |
| `specs/deferred/procurement-tables-ui-integration.md` | Remove obsolete replacement instructions once legacy Generate retirement is confirmed; preserve any unique still-valid requirement in the current plan/docs and repair references |
| `specs/todo/bonfire-euna-agency-explorer-access-verification.md` | Move to `specs/archive/` as explicitly superseded; repair links; preserve unique route/history evidence |
| `docs/PROCUREMENT-WORKFLOW.md` | Rewrite contradictory SAM sections into one current contract with explicit automatic SAM vs reviewed non-SAM policy |
| `docs/CODE-REVIEW-GUIDE.md` | Update entry points for Admin, scheduler, automatic SAM, current native rehearsal and retained future UI; remove dormant Generate guidance if retired |
| `tests/integration/README.md` | Update current supported gate/migration instructions and obsolete Generate wording without weakening isolation |
| `specs/todo/admin-county-triggers.md` and `ui-managed-procurement-workflow.md` | Reconcile current status and ownership headers; clearly label old checkpoints, link newer completed work; retain unresolved acceptance instead of falsely marking done |
| Other `specs/todo` source-access plans | Preserve provider-specific open requirements; consolidate duplicate current instructions via links; do not restart deferred providers |
| Companies, email preview code/data/styles | Retain as explicitly requested future functionality |
| Baselines/migrations, private lifecycle, legacy saved-state adapters, test fixtures, reusable operator CLIs | Retain unless complete dependency and compatibility evidence proves removal safe; no production data/table drops in this plan |
| Dated review/release evidence | Retain historical facts; label as historical, repair links and remove duplicate active instructions instead of deleting unique audit evidence |

Before removing a potentially deployed legacy entry point, perform read-only inventory if infrastructure access is available. If consumers cannot be established, report the precise remaining decision and retain that item. Do not treat this as a reason to stop independent cleanup. No current feature should disappear solely because its API lacks a browser caller.

Scan remaining maintained code for unused exports/imports/styles/dependencies and document each removal with its actual reference evidence. Preserve selectors generated dynamically and future Companies/preview selectors. Do not add an unused-code tool as a permanent dependency unless its value is demonstrated. Re-run searches after deletions and repair relative links after moving docs.

### Verification

1. Add focused regression tests for R1–R4 and removed unreachable branches. Test behavior and real service boundaries rather than duplicating implementation internals.
2. Run `npm run check` once the final changes are in place: lint, app tests, offline workflow tests, SQL transaction/replay/concurrency tests, typecheck and build.
3. Run `npm run test:access` against the existing isolated PostgreSQL/PostgREST harness for adapter/HTTP/query changes. Preserve SAM manual/scheduled automatic save, exact-identity duplicates, unchanged records, invalid exclusions, protected-field preservation and uncertain commit recovery. No production fallback.
4. Extend `tests/integration/admin-ui-browser.mjs` using isolated data: county selection/city preview; all schedule cadences; schedule occurrence/event/archive history; state-source independence; pending/failed reads; review draft retained on background transition; multi-page refresh; SAM automatic results and existing non-SAM review/import next actions.
5. Inspect desktop 1440px and mobile 390px/320px screenshots and keyboard flow. Verify no horizontal overflow, visible focus, concise error/retry states, map selection and retained context. Fixture visual checks must be labeled separately from live backend proof.
6. Close the wiring matrix in the review with test references: UI → HTTP/RPC → persisted isolated readback → refreshed UI for every enabled user operation. Private/operator-only endpoints, Companies/email previews and externally blocked source retrieval are documented exceptions, not missing UI features to expose.
7. Validate documentation links/paths, `git diff --check`, change/deletion inventory and no unrelated files. Report exact failures/limits and any unverified live acceptance, not just test totals.

### Acceptance

- Review drafts survive background state changes and cannot leak into another request.
- Schedule history is accessible, paginated and useful even when no run was created or a schedule is archived.
- Admin refresh preserves loaded context and ignores stale responses; failed reads always provide an appropriate next action.
- SAM remains automatic and independent; non-SAM approval/reconciliation and AI policy remain intact.
- Enabled user actions have a traced and tested backend/persistence path; no mock success or false empty/complete state hides a failed operation.
- Obsolete code/docs are removed according to the verified manifest; future features, evidence, migration history and necessary compatibility survive.
- Measured performance changes reduce identified costs without changing data completeness or map usability; unsupported optimizations are explicitly deferred with reasons.
- Required automated and visual checks pass. Keep the plan in todo if required implementation acceptance is incomplete. Bonfire external access is explicitly outside this plan and does not prevent completion of unrelated cleanup.

## Planning validation

The sandbox `npm run check` passed lint but encountered Vitest temporary-module ENOENT failures. The outside-sandbox rerun **passed**: lint, 59 UI tests, 283 workflow tests, SQL regressions, TypeScript and Vite build. Admin bundle is 1,014.03 kB / 214.20 kB gzip; the existing size warning remains. Private log: `outputs/deployment/review-2026-10-19/check-verified.log`. Isolated access and visual checks were not rerun during planning and remain implementation gates. No application source, production data or deployments changed in this turn.

## Completion

All review findings R1–R8 are addressed. Lint, 67 UI tests, 286 workflow tests, SQL regressions, TypeScript/build, disposable PostgreSQL/PostgREST access tests, and desktop/mobile/keyboard browser acceptance passed. The complete change/deletion manifest, measured performance and wiring evidence are in the linked build report.

No remaining implementation decisions. The Admin chunk remains above Vite's warning threshold despite shrinking from 1,014 to 674 kB. The next release must deploy the matching Render status endpoint before the frontend. This build does not commit or deploy; Bonfire access work and Netlify production remain unchanged.

Proposed commit message: `fix: complete Admin wiring and retire old code`.
