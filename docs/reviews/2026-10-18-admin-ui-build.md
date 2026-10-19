# Admin county checks UI build

October 18, 2026 (America/New_York). Part 03 implemented locally; release pending. Uses [parent requirements](../../specs/todo/admin-county-triggers.md) and existing deployed execution/scheduling services. Bonfire/Euna remains deferred.

## Changes

- Replaced disabled Contracts Generate with enabled Admin. Restores queue filters/page/selected lead/bulk checks when returning. Companies and email previews remain intact.
- Added a lazily loaded Arkansas SVG map with all 75 counties, searchable native checklist, selected chips, keyboard toggles and all/clear controls. Read-only comparison with active production geography IDs passed for all 75 counties.
- Added confirmed county/city scope previews, independent source-maintenance/update flags, category/date controls, and the user's confirmed next-12-month default. Existing services resolve new/known/expired sources; there is no new/known county classification field.
- Added manual runs, independent state-source controls, paused-by-default schedules with daily multiple times/weekly/monthly recurrence, edit/pause/resume/run/archive, activity, paged steps and actual AI usage. Manual and editor drafts stay separate and survive navigation/session restoration. Polling preserves loaded steps and stops on terminal state/unmount.
- Connected saved source evidence/method review, explicit interpretation revisions, tested import preparation, exact approval-hash review and unknown-outcome reconciliation through existing guarded services. No automatic lead import or source verification claim from a found URL.
- Added safe API display projections, request-associated official seed choices, server-side append of existing reviewed outcomes, and guarded reuse of an associated registered official seed for a missing-source gap. Activity joins are batched with bounded IN filters and linear aggregation; no status request per row. Source/account configuration and private artifacts stay server-only.

## Removal and preservation

Removed the superseded Generate frontend invocation, panel, state/handlers, mapping/merge helpers, exclusive icons/types and exclusive CSS. Shared input/queue styling remains. The dormant Edge Function, prompt, spin tables/migrations and historical review documents remain for coordinated retirement. Current workflow/backend/deployment documentation now describes the Admin replacement and pending release.

Canonical queue/stage/note behavior, Companies, email previews, imports/rehearsal guards, state-source ownership, scheduler activation, AI settings/monthly budgets and Bonfire/Euna deferral are preserved. No schema migration, paid service or new secret is introduced.

## Verification record

All gates passed:

| Gate | Result |
| --- | --- |
| `npm run check` | Lint, 50 UI tests, 260 workflow tests, both SQL suites and production build passed. |
| Final activity/source regression | 14 targeted workflow tests passed after the bounded aggregation change, including its additional count/filter-size test; changed-file lint passed. |
| `npm run test:access` | Actual isolated PostgreSQL 15/PostgREST/JWT checks passed: queue/private Admin and schedule boundaries, replay, shared caps and browser-independent private wake/worker. |
| Browser QA | Desktop 1440px, mobile 390px/320px, keyboard, map/list parity, confirmed manual run and paused two-time daily schedule passed. Zero page errors, page overflow or production mutations. Screenshots inspected. |
| Live registry read-only comparison | Exactly 75 matching county IDs. |

 Evidence/logs remain local under ignored `outputs/deployment/admin-ui/`.

- UI tests cover queue restoration; map/list/chip and keyboard parity; unavailable IDs; scope/city confirmation; work flags for manual/scheduled requests; uncertain retries and authentication; schedule cadence/draft restoration; independent state triggers; source evidence/registration; interpretation append; stale import hash/reconciliation; usage and step pagination/terminal polling.
- Workflow tests use actual existing services and disposable SQL/native rehearsal. Added HTTP/privacy, review-CAS, associated-seed and activity-aggregation cases. Existing tests retain county/state deduplication, guarded source registration, shared budgets, import readback and browser-independent scheduling.
- Actual local browser acceptance uses installed Edge and the normal app/client with intercepted fixture APIs. Captured and inspected desktop 1440px, mobile 390px/320px, keyboard focus, confirmed scope/results and paused two-time daily scheduling. No overflow, lead sidebar, page error or production mutation. Source evidence is rendered as text.
- Map provenance: official Arkansas GIS layer 48, checked total/terminal page/unique FIPS; source SHA-256 is embedded in the asset. All 75 IDs match the live registry. Runtime uses a local asset. Admin chunk is about 210 KB compressed; Vite warns about its approximately 996 KB uncompressed geometry-containing chunk. It is lazy-loaded outside the initial queue bundle; no warning threshold was suppressed.
- Existing production scheduler acceptance from part 02 is reused explicitly: natural due occurrence with browser closed, duplicate ticks, Render restart, pause/recovery and zero-AI audit. No new live UI acceptance or release is claimed.

## Release and remaining decisions

No product decision remains. The user confirmed all incorporated cities plus county scope, separate state-source triggers, unrestricted signed-in Admin access, daily/multiple daily/weekly/monthly cadence and next 12 months by default.

Commit and push are authorized on `codex/admin-county-trigger-ui`; production Netlify deployment is explicitly excluded. Coordinated production deployment/readback remains a later authorized action. Deploy the accompanying backend changes before the frontend, configuring the exact deployed frontend CORS origin and keeping the existing Supabase/Render/Netlify setup, scheduler wake and AI settings/budgets. The local follow-up found Render's current origin allowlist empty; it must be set during the authorized production release. Read back authenticated API projections and the production UI after deployment. Part 03 moves to done after its local gates; the parent coordinator remains in todo until this coordinated production release/readback is complete. No production schedule was created/enabled during this build.

Proposed commit message: `feat: add county trigger Admin UI`

## Local launch correction

The initial frontend-only local launch was not functional against the deployed API: Render had no allowed frontend origin and rejected the local preflight with 403. A matching backend is now running on loopback port 8080, and the ignored local Vite override points to it. Production settings and AI budgets are unchanged. Actual signed-in browser readback confirms 75 counties, Pulaski/city scope confirmation, daily/weekly/monthly controls, independent ARDOT state source and saved step/actual usage. Registry/list startup failure is now isolated and clearly reported. See the [local connection record](../ADMIN-UI.md#local-connection-follow-up--october-18-2026).

Follow-up verification: 52 UI tests passed; changed-file lint and typecheck passed; production build passed with the already documented lazy-map size warning. No live research/schedule/import was created by the correction. Local actions use the existing Supabase data and persist normally when explicitly confirmed.

## State-source scope correction and repository handoff

The false registry warning in an independent state-source draft is corrected: association restrictions are separate from the full county registry. The UI labels other registered counties `Not associated`, identifies the source and provides `Back to county checks`. Actual browser readback preserved Faulkner/Saline and restored all registered counties in the manual draft. Final follow-up: 53 UI tests, changed-file lint and production build passed. The full workflow/SQL/access gates and backend aggregation regressions recorded above remain applicable.

The user authorized committing/pushing the completed build and fixes, while excluding production Netlify deployment. The handoff branch is `codex/admin-county-trigger-ui`; `main` is unchanged. Netlify production was read back as locked before the push. Local-only environment overrides, process records, credentials and screenshots remain ignored.
