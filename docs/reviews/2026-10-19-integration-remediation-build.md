# Integration remediation build — October 19, 2026

Implemented against `3199531` on `codex/admin-county-trigger-ui`. Local changes only; no commit, push, deployment, source collection or production writes. The existing Supabase function inventory was read solely to verify retirement of the undeployed Generate implementation.

## Changes and finding resolution

| Review finding | Implemented result |
| --- | --- |
| R1 review loss | RunDetail keys review by request, not run state, and retains it during progress refresh. Server results refresh independently of typed work. Candidate hash/state changes invalidate affected selections with a notice. Child changes isolate reviews. Late packet/page/read responses are guarded. |
| R2 schedule history | Existing occurrence/event routes now drive expandable history, pagination, blocked/missed/no-run outcomes, links to saved runs and archived history. No new persistence or unarchive behavior. Times consistently use America/Chicago. |
| R3 refresh/paging | Registry/status reads are separate from mutation refresh. Schedules/activity revalidate the loaded range, retain selection, replace removed records, block overlapping page loads and ignore stale responses. Returning to leads explicitly reuses queue refresh when realtime is unavailable. |
| R4 read recovery | Initial progress failure offers Retry progress. Saved SAM/import read errors are visible and retriable. Pending SAM collection is explicit, not a successful empty capture. No retry submits new collection/import. |
| R5 docs | Current workflow documents distinguish automatic SAM from reviewed non-SAM. Review guide rewritten for current entry points. Older plan headers identify completed infrastructure vs outstanding production/provider decisions. |
| R6 obsolete SAM UI | Removed unreachable partial-SAM consent/state and SAM-only branches from the non-SAM preparation form. Backend legacy checkpoints and direct reviewed clients remain compatible. |
| R7 retirement | Removed verified obsolete local assets and archived the explicitly superseded Bonfire plan; manifest below. |
| R8 performance | New authenticated saved SAM status projection avoids repeated capture/intake reads; full evidence remains verified. Reproducible exact collinear map compaction reduces asset and Admin bundle size without approximating boundaries. |

## Measured costs

SAM fixture measurements compare the existing full packet to the new status projection, not production latency. With one candidate, full packet: 5 database reads / 2,187 response bytes. With 1,000 candidates containing realistic large notice fields: 7 reads / 1,182,006 bytes. Status in both cases: 2 reads / 491 bytes, **zero artifact reads**. Three consecutive status calls retain current job state without returning candidate bodies. An evidence-key change reloads the full hash-verified packet. Exclusions remain available; these exact figures are fixture-specific, not universal limits.

Map JSON: **949,687 → 604,290 bytes** (36.4% reduction). Only exactly collinear forward intermediate vertices on the existing integer grid were removed. All 75 county IDs/names, 75 rings, integer signed areas, original source hash and projected boundaries are retained. The generator uses the same helper, with no new runtime dependency.

Production build Admin JS: **1,014.03 → 674.44 kB**, gzip **214.20 → 155.35 kB**. The chunk remains above Vite's existing 500-kB warning threshold; no threshold was changed. Further geometry approximation/code splitting was not needed for this bounded fix. Main JS remains approximately 491 kB.

## Verified cleanup manifest

Removed:

- `scripts/record-phase2b-open-items.mjs`: fixed historical two-run updater; no remaining command/import/test/skill/deployment consumer found. Saved database evidence was not modified.
- `supabase/functions/spin_generate_contracts/index.ts` and `prompts/procurement-bid-site-finder.md` beneath that function: dormant alternate generator. Current source, tests, package/deployment configuration and skill searches found no invocation. The October 19 read-only Supabase inventory listed seven functions and did not contain `spin_generate_contracts`; no remote function was deleted.
- `specs/deferred/procurement-tables-ui-integration.md`: obsolete proposal to migrate the superseded Generate flow. Current queue/Admin contracts retain applicable requirements.
- Unreachable manual-SAM UI branches and the unused public `ComingSoon` export. The internal Companies Coming Soon component remains.

Moved `specs/todo/bonfire-euna-agency-explorer-access-verification.md` to `specs/archive/`, repaired current links, and preserved its historical requests/evidence. The Portal plan remains in todo and paused; this cleanup does not claim supported protected access.

Retained deliberately: Companies/email previews and associated types/data/styles; source/operator CLI entry points; private session/import compatibility; applied migrations/baselines and historical `spin_*` data; test fixtures; unique dated review/release evidence. No dependencies were added or removed. Repository reference checks, lint/typecheck and searches of current scripts/tests/configuration/skills supplied the deletion evidence; an unimported operational command was not automatically treated as dead code. Existing dynamic/future UI styles were retained rather than deleted from a selector-only scan.

## Verification and wiring coverage

- `npm run check`: lint, **67 UI tests**, **286 workflow tests**, SQL transaction/rollback/replay/concurrency regressions, TypeScript and Vite build passed. After final frontend stale-response guards, lint and the UI suite were repeated as recorded in `outputs/deployment/review-2026-10-19/build-app-final.log`.
- `npm run test:access`: passed using disposable **PostgreSQL 15 + PostgREST**. Added authenticated history reads of actual persisted archived schedule occurrences/events and automatic SAM status readback. Existing nonempty manual/scheduled SAM native validation, writes, exclusion, deduplication, private-table denial and recovery checks passed. `production_contacted: false`.
- `node tests/integration/admin-ui-browser.mjs`: passed at **1440, 390 and 320px**, keyboard map and history interaction, city confirmation, multiple daily/weekly/monthly form behavior, independent SAM, preserved county selection, saved evidence, automatic import UI, archived/paginated history, initial read retry, review draft retained through parent state transition, return-to-queue refresh without realtime, and no horizontal overflow/page errors. Fixture HTTP intercepted all external traffic; **zero production mutations**. Desktop, mobile history, map focus and existing evidence/result screenshots inspected.
- Targeted map verification compared original and compacted county names/IDs/ring areas and source provenance; compaction regression tests preserve reverse turns and multiple rings.
- Documentation link repair and `git diff --check` form the final documentation gate. Private logs/screenshots remain under ignored `outputs/deployment/`.

| Enabled flow | Verification connecting the existing boundaries |
| --- | --- |
| Auth, queue/filter/page/detail, stage/bulk/note/history | Existing AppShell/procurement tests, queue/SQL tests and isolated role/JWT/note ownership/actor-history/pagination suite; unchanged adapters |
| County selection/city scope/manual run | AdminScreen tests and intercepted browser scope-confirmation checks; real isolated trigger submission/replay/private persistence |
| State-source independence | Existing county-trigger/state-association tests and Admin state-source tests; existing routes reused |
| Schedule create/cadence/edit/control/run | AdminScreen/SAM tests, recurrence/schedule Node tests, browser form checks and isolated scheduler occurrence/wake/pause/replay |
| Schedule history/archive | IntegrationRemediation UI test and browser fixture pagination/archive; actual HTTP-to-database occurrence/event readback in isolated access harness |
| Activity/steps/usage | RunDetail tests, browser steps, existing audit/reservation/cap tests and isolated worker audit readback |
| Discovery/source/evidence/non-SAM import/reconcile | Existing AdminReview/hosted-workflow/interpretation/native import regression suites and saved-evidence browser checks; non-SAM approval remains explicit |
| SAM manual/scheduled/automatic import/status | SAM and new status-cost tests, HTTP authorization/no-wake test, browser automatic UI, real isolated native write/readback/deduplication and status response |
| Import → lead queue | Existing persistence tests plus browser return-to-queue revalidation with no realtime delivery; queue filters/context preserved |

These are complementary UI fixture and real isolated service/database tests, not a claim that the browser fixture itself used production or the isolated database. Private/operator-only routes and future Companies/email previews are intentional exceptions. Provider-specific successful access remains separately evidenced; Bonfire's protected path is still blocked.

## Remaining decisions and release

No unresolved implementation decision remains for this cleanup. The retained bundle warning is a measured limitation. Deploy the matching Render backend **before** releasing this frontend so `/v1/sam/requests/:id/status` is available. No deployment was requested for this build. Netlify production remains unchanged; no settings, AI budget, accounts or migrations were changed.

Bonfire supported access and Netlify production release remain separate user decisions under their existing plans. This work does not resume either.

Proposed commit message: `fix: complete Admin wiring and retire old code`
