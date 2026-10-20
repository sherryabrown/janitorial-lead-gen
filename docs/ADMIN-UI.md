# County checks Admin UI

## Automatic county saving — pending release

The county extension removes normal approval controls for confirmed Admin county requests that check for lead updates. Current official evidence, actual work location, requested dates and canonical identity are validated before the existing native-tested importer saves results. Manual and scheduled runs share this path. Verified Added/Updated/Unchanged counts and **View leads** appear above source gaps. Invalid records and unavailable sources remain separate outcomes.

An identified saved county request may use `POST /v1/requests/:id/imports/continue` with an empty body to continue without a new search. It grants no client-controlled import authority. Cancelled requests, paused schedules and inactive owners cannot use the continuation. Source-only, independent state and standalone reviewed workflows retain their existing controls; SAM automatic saving is unchanged. Historical non-SAM approval requirements are superseded only for this county policy. See [verification and release status](reviews/2026-10-19-county-automatic-imports.md).

The Admin UI is available in the approved Netlify preview with its matching Render backend. Netlify production remains unchanged. Scheduler activation and browser-closed/restart acceptance remain the existing [part 02 production evidence](ADMIN-SCHEDULING-DEPLOYMENT.md); current county coverage and recurrence limits are recorded in the [October 19 release report](reviews/2026-10-19-automatic-county-build.md). Opening this UI does not enable a recurrence by itself.

## Use

Open Contracts > Admin. Choose counties on the Arkansas map or searchable checklist. Both edit the same selection; county sources and all incorporated cities are included. Run now previews the current registry's city names and requires confirmation. Maintain sources and Check for lead updates are independent, initially selected; existing services decide which sources/methods are new, known, expired or blocked. No new/known classification is requested from the user.

The confirmed default window is today through 365 days ahead, using the run's America/Chicago date. Advanced controls edit category-specific relative bounds and date basis. This qualifies lead candidates; observed evidence changes remain separate. Forecast, opportunity and award use their existing date semantics. Initial category: Opportunities.

Save schedule opens a separate draft without replacing the manual selection. Daily supports multiple unique times; weekly supports weekdays; monthly dates 29-31 use the last day of shorter months. All times are America/Chicago. A new schedule starts paused; saving with Enabled selected explicitly activates it. Editing uses the saved version and changes future runs only. A stale scope/version requires fresh preview/review. Run now on an existing schedule uses its saved configuration.

State sources are managed separately from county drafts and show related counties, last finish, next run, Run now and schedule controls. County selections do not pause or reschedule shared state sources. Existing checkpoint/association services prevent county runs from initiating the same state collection again.

Activity opens frozen scope, children and paged steps. Polling runs only for the active viewed nonterminal run, with backoff. Actual AI usage, tokens, USD, unknown usage and held reservations remain distinct. Credits appear only if the provider actually supplied a unit. Missing official seeds/access/verification remain gaps. Evidence and source content are displayed as text. Review uses saved packet hashes, literal evidence, current interpretation revisions and existing guarded source registration. Source verification appears only after persisted registry readback. An interpretation adds outcomes without discarding previous reviewed outcomes. Candidate staging is separate from preparing a tested import and approving its exact hash; uncertain imports expose reconciliation.

Returning to Contracts restores its current filters, page, selected record and bulk checks. Manual drafts and uncertain submission keys are retained per signed-in user in session storage; storage restrictions fall back to mounted/in-memory state. The schedule editor has an independent draft. Companies and email previews remain future functionality; Bonfire/Euna implementation is active under its separate plan; protected hosted execution remains unaccepted.

## Map asset

`node scripts/build-arkansas-county-map.mjs` regenerates `src/features/admin/data/arkansas-counties.json` from the official Arkansas GIS Boundaries FeatureServer layer 48. The builder verifies count, unique five-character county FIPS, terminal pagination and geometry, projects on a shared 0.1-unit grid and preserves polygon rings. Asset metadata retains source URL, acquisition time, response SHA-256, projection and command. No runtime map provider, tiles or geolocation. The 75 IDs were compared with the active production county registry in a read-only check and matched exactly. Unmatched/unavailable IDs are disabled and removable; they are never guessed. Admin and its asset load lazily, outside the initial queue bundle.

## API additions in this release

Bonfire Portal follow-up (October 19): category packets for `bonfire-projects-v1` also expose `portal_url` and `project_links` (`id`, `title`, `closes`, `url`, `run_id`, `content_sha256`). These are derived from hash-verified saved listing bytes and do not alter packet identity or establish qualified leads. Review captured evidence shows every listed project, without title filtering. Links open the official Portal/detail in another tab; they do not adopt cookies, verify the backend session or enable protected scheduled execution. See [current access results](SOURCE-ACCESS-LIVE-STATUS.md).

Saved browser jobs expose only their `access_handoff_id` and `capture_state` in request status. **Check saved portal access** reads the existing access record; it does not sign in or start collection. Explicit sign-in/capture/reconciliation buttons reuse the existing bearer routes and refresh saved status. Expired recipes disable hosted sign-in/capture, and a completed capture cannot be repeated through that action. The access response exposes recipe/session validity booleans and safe next action; credentials, recipe selectors, encrypted artifacts and cookies remain private. Manual verification does not grant unattended acceptance. These continuation changes require the matching backend release; browser fixtures do not establish production availability.

Existing bearer authentication, allowed origins, audit and import guards apply. The original county UI additions need no migration or new secret; the separate SAM extension below requires its forward migration.

- `GET /v1/requests/:id/sources?offset=0&limit=50`: registered official seed options associated with that saved request; bounded pagination, safe ID/code/name/URL only. No unrestricted source search.
- Interpretation packets include safe current interpretation ID/hash/outcome counts. They do not expose saved result/private supporting artifact paths. `POST .../interpret` accepts `append_to_current:true` with `supersedes_id`; the server verifies the current revision and same packet, appends saved outcomes, and retains existing validation/CAS persistence. Existing non-append callers retain their behavior.
- Missing-source method review can reuse an explicitly reviewed official seed only when its registered identity matches and it is already associated with that saved request. Registered tasks cannot replace their source identity.
- Discovery packets include whitelisted source identity, route geography and `registration_verified` derived from the persisted receipt. No source config/accounts or raw artifacts.
- Trigger list adds compact scope/origin/schedule/count/usage fields using batched queries for the page.
- Scheduler status adds only AI enabled/monthly USD policy, drawn from the existing configuration. AI provider settings and budgets are unchanged.

## Configuration and release readback

`VITE_PROCUREMENT_API_URL` is a public origin, defaulting to the existing Render backend. It must be HTTPS, or localhost HTTP for development; credentials, paths and query strings are rejected. The client gets the current Supabase access token per request and refreshes once on 401. No privileged key belongs in a Vite variable. Existing Supabase frontend configuration stays required.

Deploy matching backend changes before the frontend so review metadata/append semantics and policy/count projections are available. The approved preview's exact origin is allowed by Render and its connection passed live readback; preserve the scheduler wake key, AI settings and budgets. The initial UI build was local, and subsequent releases are recorded in the linked deployment reports. The October 19 county release verified manual/repeat/one browser-closed scheduled execution while retaining the documented coverage/recurrence blockers. Netlify production remains unchanged. Roll back frontend and backend together if reverting the append-review API.

After an authorized deployment, read back authenticated county/state/schedule/activity/status and packet routes, confirm no secrets, then verify the production Admin screen. Any live test run/schedule needs a scoped maintenance-only fixture and cleanup; do not silently enable county research, AI or imports as a smoke test. The coordinator remains in todo until this coordinated production readback is complete.

## Verification

Run `npm run check`, `npm run test:access`, and `node tests/integration/admin-ui-browser.mjs`. Browser acceptance starts a local Vite server and installed Edge, intercepts external APIs with fixture data and blocks live sockets. Normal public Supabase frontend configuration is required; it uses a synthetic session only in the test browser. No test authentication bypass exists in app code.

Screenshots and local readbacks are under ignored `outputs/deployment/admin-ui/`. Desktop, 390px, 320px and keyboard screenshots were captured and visually inspected; no Admin page overflow or lead sidebar. Tests cover confirmation, paired map/list/chip selection, accessible keyboard operation, source review/registration, work flags, scope, schedule editing/cadences, queue preservation, retry identity, auth, review CAS/hash changes, usage and paged/terminal progress. See the [build report](reviews/2026-10-18-admin-ui-build.md) for final counts.

## Local connection follow-up — October 18, 2026

The first local frontend launch still targeted Render. Its existing allowed-origins setting was empty; an OPTIONS request from `http://127.0.0.1:5173` returned 403 without an allowed origin. This blocked the registry, schedules and activity together. The initial all-or-nothing load then misleadingly labeled all map counties unavailable.

The matching backend now runs on `http://127.0.0.1:8080`, bound to loopback with `HOST=127.0.0.1`. The ignored `.env.local` sets only the public `VITE_PROCUREMENT_API_URL` to that local origin. Server credentials are inherited in memory from the existing backend configuration; they are not put in a frontend variable or saved in a new environment file. The local backend accepts the two localhost frontend origins. Production Render settings, scheduler, AI configuration and budgets were not changed. Both processes must remain running for this local setup.

The local backend uses the existing Supabase database: confirmed runs, schedules and imports are real persisted operations. Independent list loads now retain successful panels when another request fails. Registry loading/connection failure has one clear message; it does not assert that all 75 counties are unavailable.

Verified in the actual signed-in app, without fixture responses: all 75 selectable counties; Pulaski map selection and a preview listing its 11 city associations; daily second-time/weekly weekday/monthly short-month controls; the independent saved ARDOT source; and its three saved completed steps with actual zero-AI usage. That saved run has no captured pages/candidates, so no evidence/import action is available for it. No new research run, schedule, AI call or import was created for this verification. Source/candidate review and exact import approval remain available only when saved results require those actions.

UI regressions now include independent list failure and registry connection labeling. The fixture browser harness explicitly pins its intercepted API origin so a real local API override cannot send its synthetic session to the running backend.

### State-source scope display correction

State-source drafts restrict selection to their saved county associations. They now receive the full registry separately from their selectable association IDs. Registered counties outside that source scope are labeled `Not associated`; they do not trigger the registry-mismatch warning. The draft identifies its source and provides `Back to county checks`, which restores the independent manual selection. Actual-browser readback confirmed Faulkner and Saline remained selected, other registered counties became selectable again, and the false warning disappeared. No run or schedule was submitted during this correction. Follow-up UI suite: 53 tests passed.

## SAM Admin extension — October 19, 2026

Released to the existing Supabase/Render backend and approved Netlify draft preview. Netlify production remains unchanged. Both manual categories and one browser-closed scheduled occurrence passed live acceptance; see [release evidence](ADMIN-SAM-DEPLOYMENT.md).

**SAM.gov — Arkansas statewide** is independent of county selections and registry availability. Choose Opportunities (posted dates) or Awards (last modification dates); forecasts continue through agency sources. Both use Arkansas performance location and NAICS 561720. Manual checks default to the last 30 calendar days including today. Confirm the category/window before submission. No AI is needed for collection; audit reports actual usage, with non-AI steps recorded as not used.

SAM schedules reuse the existing cadence controls: multiple daily times, weekly weekdays, or monthly dates with the existing short-month rule, in America/Chicago. A new schedule starts paused. Its category-specific rolling lookback defaults to 30 days and freezes into explicit dates for each occurrence. County drafts remain selected when submitting or editing SAM. Shared schedule actions support edit, pause/resume, run now and archive.

SAM history includes existing direct SAM requests as well as new Admin parents. Results show saved pages, counts, category/window, partial/terminal status, evidence and candidates. SAM now supplies exact captured run IDs, current candidate hashes and bounded partial authority through its automatic server policy. Package testing and exact-hash authorization remain internal; no SAM import approval click is required. Unknown fetch outcomes expose reconciliation of the saved audited attempt, never automatic resending.

Additional authenticated routes: `GET /v1/sam/requests?offset=0&limit=50` and `POST /v1/sam/requests/:id/reconcile`. Saved review uses the existing packet endpoint. No credentials or raw private artifacts are exposed.

## Automatic SAM saving — October 19, 2026

SAM opportunities and awards now continue from capture through validation, native SQL testing, transactional import and verified readback without candidate selection, a review reason, new-lead checkbox or batch approval. Search/schedule scope confirmation remains. The results view reports verified added/updated/unchanged counts and per-record exclusions; collecting records alone is not a successful database import. Other source review flows retain their existing approval controls.

The server records `sam-automatic-v1` authority instead of claiming a human review. Missing Arkansas performance evidence, unsupported classification, unknown janitorial service or conflicting canonical identity remain exceptions. Valid records in the same capture continue independently. Official evidence remains available; no extra AI calls are introduced. Existing user/sales fields retain the current importer protections.

Legacy staged SAM results offer **Continue automatic saving**, using saved evidence only. This is a continuation of the automatic policy, not per-record approval. Paused/cancelled scheduled work and uncertain imports cannot be restarted through it. Collection and database outcomes remain separate, including partial capture and unresolved write outcomes.

The automatic SAM extension is released to the existing Render backend, local backend and approved Netlify draft preview. [Live acceptance and recovery evidence](ADMIN-SAM-AUTOMATIC-DEPLOYMENT.md) records actual canonical readback, scheduled execution and cleanup. Netlify production remains unchanged.

### Bonfire saved detail continuation

The shared worker checks public project URLs from verified saved listing rows one resource per lease, then at most four literal same-host public PDFs per project. It preserves listing/project evidence when another resource is blocked. Blocked or unknown attempts hold this source/method across ticks and later requests. Missing dynamic/protected documents and overflow remain partial.

Category packet `detail_collection` is presentation metadata alongside the unchanged immutable listing packet. It contains per-project states and signed evidence descriptors, never raw document bytes. Selecting a saved document calls authenticated `POST /v1/requests/:request/tasks/:task/supporting-evidence` with its descriptor; packet/method/signature/hash verification precedes bounded plain review text, with no provider fetch. Exact project/document quotations supplement listing evidence for the existing reviewed candidate flow. A listing alone cannot establish a lead.

The existing explicit `supporting-captures` action can reconcile a matching blocked public attempt after a successful recapture. An uncertain attempt requires `saved_evidence` with a valid exact-packet receipt and performs readback without resending. Checkpoint changes use compare-and-swap; current interpretations stay intact. This does not renew private access or enable unattended protected collection. Feature commit `954c35b` is deployed to Render and the approved [shared draft](https://bonfire-review--janitorial-lead-gen.netlify.app). Protected access acceptance remains blocked; Netlify production is unchanged. SAM automatic saving remains separate.


## Integration remediation (local build, October 19)

Schedule rows now expand saved occurrence and change history using existing authenticated endpoints. History includes blocked/no-run outcomes, paginated results and links to saved runs. Show archived schedules exposes retained history without adding an unarchive action. All displayed history times use America/Chicago, matching existing formatting.

Background run transitions retain an open source/candidate review. Refresh retains typed notes and loaded list ranges; changed candidate hashes invalidate selection with a notice. Initial failed progress reads and saved SAM/import reads expose retry without submitting new work. Returning to Contracts explicitly revalidates the existing queue even when realtime is disconnected.

Automatic SAM progress polls the new lightweight saved-status route and reloads verified full evidence when its identity changes. Collection-pending, failed reads and confirmed empty results remain distinct. Release the matching Render backend before this frontend. This build makes no deployment and leaves Netlify production unchanged.

The map still uses all 75 official county identities and the same exact projected boundaries. Build-time removal of exactly collinear forward vertices reduces its JSON from 949,687 to 604,290 bytes without approximation or new runtime dependencies.

## Automatic county source work — preview coverage incomplete

The released [automatic county build](reviews/2026-10-19-automatic-county-build.md) adds directory-based official website resolution and verification of supported public listings. Normal county results show location/source names and saved evidence instead of requesting seed URLs and technical method setup. Captured websites are labeled separately from opportunity checks; resolved historical gaps are omitted from current results. Unsupported or inaccessible sources remain incomplete. Enable both work options to maintain sources and collect opportunities; source-only configurations perform only maintenance. Non-SAM lead import still requires approval. Saline manual/repeat/one scheduled occurrence ran, but broader coverage and later recurrences remain blocked by the documented source/unknown-outcome limits. Netlify production is unchanged.

County result follow-up: unavailable public websites are reported as incomplete coverage while independent sources continue. A failed website read does not require import reconciliation. Source evidence and candidate review remain distinct; collection does not automatically import non-SAM leads. The county worker now reuses identical captured pages and supported structured listing interpretation before AI. See the [build report](reviews/2026-10-19-automatic-county-build.md) for live verification and per-site limits.
