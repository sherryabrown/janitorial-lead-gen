# Bonfire/Euna Portal opportunity collection

Planning observations: October 18-19, 2026, America/New_York. This is the active Bonfire implementation plan. It supersedes the earlier [Agency Explorer verification-only plan](bonfire-euna-agency-explorer-access-verification.md), whose original requests and evidence remain historical context. It is independent of the Admin production-release coordinator and general cleanup.

## Implementation checkpoint — October 19, 2026

### Resume checkpoint after manual-access confirmation

The user subsequently confirmed that waiting for Cloudflare's checkbox and completing it manually opens current project details and documents. Record that as **manual access confirmed by the user**, superseding the earlier no-checkbox observation below. No machine capture or hosted acceptance follows from that confirmation.

Implemented in this continuation:

- Shared browser worker acceptance gate: private per-capability successful capture receipt, exact method/recipe hashes, Render service/commit identity, seven-day freshness, immutable capture/run readback and later-failure/uncertain-intent revocation. Only Bonfire project-detail methods are eligible; no public Portal/listing success, client flag or other provider is enabled. No real capability was promoted.
- New capture receipts retain readback proof and environment binding. Browser page/document navigation uses existing audit phases and scheduler pause boundaries. A paused unsaved attempt releases to pending and propagates the pause; challenges remain blocked.
- Admin reads saved access and explicitly resumes the existing sign-in/capture/reconciliation routes. Recipe/session validity is exposed without secrets; expired access disables hosted sign-in/capture. No automatic sign-in on refresh and no cookie input.
- Listing-only Bonfire interpretation keeps all project titles unresolved for detail review rather than title-only exclusion; its cache policy changed only for this parser. Missing protected content does not consume paid inference. Existing reviewed positives and other providers' behavior are retained.
- Actual saved-state preflight: recipe expired October 16, session October 9; latest hosted capture still requires human verification; no unattended acceptance. Zero new browser launches, challenge attempts, provider/database writes or deployment. Public listing remained available with the same five projects/hash. Local preflight of real saved metadata is not represented as a new deployed Render capture.

Still blocked/unfinished: the headless hosted worker has no interactive Cloudflare handoff. No supported unattended path has been demonstrated, and expired access cannot be renewed from manual-browser clearance. Durable listing-derived detail/document continuation, real second-request reuse and scoped manual/scheduled acceptance remain unfinished. Backend/frontend changes are local and undeployed; no Production Netlify deployment. The existing assisted import and unsent support message are preserved. Keep this plan in todo.

Verification for this continuation: final `npm run check` passed (55 UI tests, 266 workflow tests, SQL regressions, TypeScript and production build). `npm run test:access` passed isolated PostgreSQL/PostgREST and scheduler checks with no production contact. Extended existing browser fixture passed at desktop 1440px, mobile 390px/320px and keyboard; saved-access controls and project links were checked and screenshots inspected. The 37 targeted portal/workflow/supporting tests passed, including later-challenge revocation, unchanged legacy workflow execution and no inference for missing Bonfire details. `git diff --check` passed. Existing lazy Admin/map bundle-size warning remains. No real manual/scheduled protected acceptance or fresh hosted capture is claimed.

### Earlier checkpoint

**Partial implementation; required access acceptance blocked. Keep in todo.** Actual route/access matrix: [current access status](../../docs/SOURCE-ACCESS-LIVE-STATUS.md#latest-bonfire-check--october-19-2026).

- Verified the existing signed-in Chrome Agency Explorer already filtered to Arkansas. Little Rock's agency card opens a new tenant `/registration` tab; its visible Portal link opens five current public opportunities without submitting business fields. This confirms the existing v1 skip contract; no extra directory automation contract was needed.
- Murphy's actual destination is `murphyusa.bonfirehub.com`, also through registration -> Portal. Its current view exposes only **My Opportunities**, with nothing to display. Public-listing completeness and zero eligible opportunities are not established; no corporate source was added.
- Read existing private records first: no unreconciled account submissions; prior protected capture is blocked/not saved with `human_verification_required`. Account, expired recipe/session/protected method and prior assisted import retained. No expiry renewal based on an interactive listing.
- Current public listing fetched once through the existing bounded fetch/parser; five projects, terminal listing state, SHA-256 `ff51d2db82e0f6efe27a7b988aa8e3ac726f043dd1854724c75f5494591b2c3b`. Evidence saved locally, not represented as a new database run/import. Existing valid public capability retained.
- Added current project/Portal links to saved category packets, derived from hash-verified listing rows with run/hash provenance. Admin evidence review exposes every listed project without filtering titles. Existing packet hash/review/import identity remains unchanged.
- Existing supporting-capture API now rejects unlisted/historical guessed project destinations before fetching. Bonfire project redirects and HTML sign-in/registration/security-verification responses remain blocked, including HTTP 200 challenge shells; those bodies are not saved as project evidence. Other providers retain their existing behavior.
- Live current project `249097` from the authenticated listing reaches Cloudflare verification in Chrome. User reports no checkbox appears. No challenge interaction/retry, clearance transfer, hosted renewal, new account or support message.
- Verification: `npm run check` passed (54 UI tests; 263 workflow tests; SQL regressions; production build). `npm run test:access` passed isolated PostgreSQL/PostgREST access/scheduler checks without production contact. Extended existing browser fixture passed desktop 1440px, mobile 390px/320px and keyboard project-link navigation; screenshots visually inspected. Existing large lazy Admin/map bundle warning remains.
- No product inference calls or spend; zero input/output tokens, USD 0. No AI settings, budgets, schedules, canonical leads, provider records or deployment changed. No production Netlify deployment.

**Still required:** legitimate current project/document access; private route/method revalidation with actual proof; durable bounded detail/document continuation beyond reviewed public supporting captures; narrowly audited environment/method/recipe acceptance for Admin browser execution; access/capture/reconciliation continuation UI; second-request session/new-project reuse and duplicate-intake proof; scoped real manual and browser-closed scheduled acceptance. The existing Admin authenticated-browser exclusion remains because no protected capability has passed hosted acceptance. These are unfinished requirements, not accepted mock outcomes. Resume this same plan after source access is available; do not deploy infrastructure or repeat production imports to work around the blocker.

## Initiating prompt

> please make Bonfire/Euna work per knowing you'll have to bypass the Agency business info and go to the Portal for possible opportunities

Earlier route supplied by the user: Opportunities -> Agency Explorer -> Arkansas -> City of Little Rock or Murphy USA -> Portal. Murphy USA was reported as having no opportunities at that time; this is not a current verified zero-result conclusion.

## Outcome and constraints

Make existing Bonfire/Euna sources usable from the shared collection workflow and Admin county triggers. The route is the agency's **Portal**, not completion of agency/business-profile information. Optional supplier/profile setup must not become a prerequisite for looking for opportunities when the Portal is accessible without it. Discover the Portal once through the supported agency route, verify its identity, retain it, and reuse it directly on subsequent checks when that works.

Reuse existing accounts, methods, private session storage, discovery/collection services, audit, scheduling and reviewed imports. Start with Little Rock. Murphy USA is a directory/Portal routing comparison; do not infer Arkansas work location, register an unrestricted corporate lead source, or activate Companies functionality from its directory presence.

The work concerns supported navigation around optional business information. It does not authorize defeating a security challenge, fabricating required business information, completing material attestations, buying access, submitting bids or contacting support. If viewing actually requires a mandatory account/tenant step, retain the precise existing handoff. No new account when the existing account can be resumed. No new browser service, proxy, credential store or scheduler.

Preserve public Bonfire reads that already work. Preserve other providers' access behavior, queue context, AI settings/budgets, Companies/email previews and the current prohibition on production Netlify deployment. This plan changes no runtime code, provider account, method expiry, access record or infrastructure configuration. Implementation and any later deployment are separate actions.

## Findings from current code and read-only checks

| Finding | Implication |
| --- | --- |
| `portal-session.mjs` validates private reviewed recipes, expiry, tenant hosts, session identity and bounded sign-in steps. | Extend this contract only for observed navigation needs; do not invent a second access system. |
| `hosted-browser.mjs` already recognizes a reviewed `sign_in_intermediate_url` and follows `verify_url` instead of submitting business registration. | Reuse and test this behavior. Skipping optional setup is partly implemented already; do not claim it alone fixes project access. |
| Saved Little Rock recipe uses `/login`, intermediate `/registration`, completion `/portal/`, and verification `/portal/?tab=openOpportunities`. The existing account is recorded. | No duplicate signup. Revalidate the real route and existing credentials/session. |
| Recipe validity ended October 16; saved session validity ended October 9. The authenticated opportunity method is expired and targets only historical project `169158`. | Renew only after observed access. A successful login to that one old project is not ongoing discovery of new opportunities. |
| A separate `public-fetch` opportunity method is currently valid through November 5 and reads the tenant's `PublicPortal/getOpenPublicOpportunitiesSectionData` resource. | Preserve/reuse it. This is an existing vetted website resource, not proof of a vendor API entitlement. |
| The official Little Rock procurement page links directly to the Portal. In the current unsigned-in Codex browser the Portal rendered actual opportunity rows and project links. | Portal/listing reachability is observed, not just user reported. Public discovery can proceed independently of account-profile setup. |
| One listing link, project `247783`, led to `Performing security verification` in the Codex in-app browser. No challenge interaction/retry was performed. | Project/document access remains a separate observed blocker. This is a navigation probe, not a janitorial candidate or proof the user's normal browser fails. |
| Euna's public supplier Login link led to its account login page. An authenticated Agency Explorer/Murphy USA route was not observed in this planning session. | Verify the precise directory agency identity and Portal destination using the existing account during implementation; do not guess Murphy's tenant URL. |
| `known-source-collection.mjs` returns `awaiting_browser_capture`; `hosted-workflow.mjs` calls `captureBrowser` only when `!request.workflow_control?.admin_trigger_id`. | Fixing a private recipe alone will not make protected collection run from Admin. A narrowly accepted capability path is required. |
| `hosted-browser.mjs` navigates to saved capture URLs, permits at most two pages per capture, saves partial coverage and has audited lease/reconciliation/session cleanup. | Discover current project URLs from saved listing evidence; do not replace the bound with an unlimited crawler or use live arbitrary URLs from a client. |
| Existing Bonfire parsers and interpretation/import services preserve IDs, evidence, date and actual work-location checks. | Reuse them; agency state and a title alone do not establish a qualified lead. |

Nonsecret planning observations are retained locally under ignored `outputs/deployment/bonfire-euna-planning/`: public listing accessibility snapshot, project challenge screenshot and observation metadata. The existing access record was read only; secrets, cookies and account flow query strings were excluded. The current provider lifecycle remains in the private database; the October 9 [supported-access handoff](../../docs/reviews/2026-10-09-bonfire-supported-access-handoff.md) is historical and its support request remains unsent.

### Existing components to reuse

- Routing/registration: `geography-routing.mjs`, `county-triggers.mjs`, `official-link-discovery.mjs`, `hosted-discovery.mjs`, and existing guarded registration rehearsal/readback.
- Public listing: `public-bonfire-projects.mjs`, `bonfire-method.mjs`, `verify-bonfire-method.mjs`, `public-source-check.mjs` and `known-source-collection.mjs`.
- Protected access: `portal-session.mjs`, `hosted-browser.mjs`, `authenticated-browser.mjs`, `source-access.mjs`, `source-access-store.mjs`, existing private handoffs and encrypted session artifacts.
- Evidence/review: `hosted-interpretation.mjs`, `supporting-capture.mjs`, current packet/interpret/import services and `record_procurement_browser_capture`.
- Execution/audit/UI: `hosted-workflow.mjs`, `workflow-audit.mjs`, existing scheduler worker, `src/features/admin/{RequestReview,SourceReview,RunDetail,ScheduleList}.tsx` and current bearer HTTP routes. Keep their contracts unless a verified missing action requires a small extension.

## Phase 1 - Verify the Portal route and revalidate saved access

1. Inspect current private Little Rock account, recipe, capability, session and unreconciled capture intent before sending anything. Preserve successful assisted capture/import history and canonical leads. An expired timestamp is a revalidation requirement, not permission to mark the old session current or create another account.
2. Using the existing account in an authorized supported browser, observe the supplied route: Opportunities -> Agency Explorer -> Arkansas -> exact agency -> **Portal**. Record nonsecret agency identity, link destination, same/new-tab behavior and tenant after navigation. Observe Little Rock first; resolve Murphy USA only through its actual agency card/official link. Do not persist transient login/flow query tokens.
3. When agency/business setup is shown, first use its visible Portal link. Where the existing reviewed post-login registration intermediate is confirmed, reuse its direct verified Portal destination. Do not fill or submit optional business/profile fields. Distinguish directory agency information from an actually required account/access step. A profile page, successful login or directory search is not opportunity coverage.
4. Compare directory-to-Portal and direct saved-Portal entry under equivalent authenticated conditions. If the saved direct link works, retain it as the normal recurring entry; the directory is discovery/repair context, not a required tour on every run. If a sequence is necessary, save only observed reviewed actions. Keep the completed directory route tied to the exact tenant, not the shared provider name.
5. Revalidate Portal, listing, current project detail and document access separately. Record which work with public access, with the existing session, interactively, and in the intended hosted worker environment. No automated challenge solving, repeated challenge retries or clearance transfer between machines. A blocked project must not erase a successfully saved listing.
6. Reuse existing public method verification and parser behavior. Verify the actual response, terminal condition, UI filters/pagination, current versus past listing and empty-listing semantics before renewing/altering a method. Do not make a generic Bonfire public contract/award method active merely because opportunities worked.

Phase output: a nonsecret route/access matrix plus reviewed private method/recipe changes supported by evidence. Murphy's actual Portal URL and any hosted challenge remain explicit unknowns until observed. Do not gate this normal navigation investigation on first sending the old support request.

## Phase 2 - Integrate bounded listing, detail and document collection

### Portal recipe and capture

1. Preserve valid v1 recipes and their existing optional-registration skip. If Phase 1 proves extra directory steps are essential, add the smallest optional bounded navigation contract to the shared recipe/executor: reviewed click/select/wait and same-tab or popup destination handling. Use explicit action types, a small step/time limit, reviewed selectors, exact allowed hosts and expected tenant/agency predicates. Do not add arbitrary JavaScript, arbitrary client URLs or a generic browser automation engine. Record method/recipe hash changes so stale sessions are revalidated correctly.
2. Keep the provider account reusable across tenants only where its existing identity supports that; validate each agency's Portal/session independently. Never apply Little Rock's tenant session or scope to Murphy USA based on common branding.
3. Prefer the already working public listing route; use authenticated access only for the remaining protected evidence. Obtain current stable project IDs/official detail URLs from hash-verified saved listing rows. Replace dependence on the single historical project URL with bounded, resumable detail work tied to the current request/category and listing evidence.
4. Reuse existing collection jobs/task checkpoints and supporting-document capture. Add a small durable child/checkpoint representation only if current jobs cannot express a reviewed detail destination; do not store an unbounded URL queue in a recipe. Bind every detail/document destination to an actual captured listing/page link, expected source/tenant, method version and request. URL changes after review require new evidence/review. Preserve the current two-page-per-attempt limit, existing byte/time/document limits and partial outcomes. Larger listings continue in bounded stages with saved cursors, stable dedupe keys and terminal evidence.
5. Capture relevant/ambiguous janitorial projects and their needed documents using current service-scope logic. Do not discard every project whose title lacks a janitorial keyword when its description/documents could establish relevance. Conversely, mere procurement presence is not a qualified janitorial finding. Preserve unresolved work-location/date/service evidence until verified.
6. Keep public listing capture and protected detail outcomes distinct. A challenge, login shell, incomplete pagination, missing document or business-setup page is a resumable gap with the exact next action. A genuinely empty completed listing may be zero opportunities; it is not proof of zero forecasts/awards or complete county coverage. Murphy's empty listing must be verified with correct tenant, filters and terminal state.

### Existing Admin/manual/scheduled execution

7. Replace the blanket Admin authenticated-browser exclusion only with a narrowly gated use of the shared capture worker. Preserve the default for all methods that have not passed unattended acceptance. Use existing private capability verification evidence for the accepted recipe/method hash, expiry and deployment environment; no new provider-wide global switch. Derive acceptance from an audited successful hosted capture and readback, never from a client-supplied boolean or a public listing success. A small shared predicate may be introduced if needed, rather than a second Bonfire worker.
8. Reuse the existing access coordinator to renew an expired session at most once where permitted. Human-required/unsupported access remains blocked and is not retried by polling or each scheduler tick. A future explicit resume reuses the saved request/attempt and current session after reconciliation. Do not consume paid AI calls while stuck at navigation/access.
9. Manual Admin runs and scheduled occurrences use the same collection path, cancellation/pause boundaries, parent lease and request-wide limits. A queued/blocked route must not cause a fresh login/capture on every page refresh. Other sources proceed and retain their results when Bonfire is partial. County/city routing and separate state-source ownership remain unchanged; do not enqueue a Bonfire update once per associated county when the existing shared target should own it.
10. Use existing audit phases (`resolve_sources`, `revalidate`, `fetch_page`, `fetch_document`, `compare`, interpretation/import/readback) with concise safe summaries for Portal resolution, optional-profile skip, listing/project/document outcomes and session reuse. Include start/end/duration and actual AI usage from the current ledger. Navigation is non-AI work unless an actual bounded inference call occurred; tokens/cost/credits must never be invented.

### Review and next action

11. Feed confirmed captures into the existing request packet, interpretation, candidate-intake and reviewed-import pipeline. Keep stable source/tenant/project identities, immutable hashes, quoted work-site/date evidence, protected canonical fields and replay/no-duplicate behavior. Retain prior reviewed interpretations when adding later document evidence. Do not repeat completed production imports just to demonstrate the route again.
12. Make the current Admin result panel show useful existing actions: Portal/listing captured; detail needs sign-in/verification; review saved evidence; resume the saved route after access is restored. Reuse existing session/access/capture/reconcile APIs. If a missing backend continuation must be exposed, add only a small authenticated existing-action binding; no credential/cookie input in the frontend and no new external URL fetch proxy. An official Portal link is fine; its opening alone must not mark the server session verified. Preserve the exact tested import hash approval and reconciliation steps.

Illustrative orchestration, not a new service:

```text
resolve existing source and request scope
  -> verify/reuse saved official Portal (skip optional business setup)
  -> capture current listing through existing public method
  -> resolve bounded project/document links from saved evidence
  -> public capture, or existing tenant-bound authenticated capture
       only when current access and environment acceptance allow it
  -> saved partial gap OR validated packet -> reviewed candidate/import flow
```

## Phase 3 - Verification, acceptance and documentation

### Automated tests

Extend the existing portal/browser/Bonfire/workflow/Admin fixtures, rather than introducing a parallel test harness:

- `tests/portal-session.test.mjs`, `tests/authenticated-browser.test.mjs`: optional registration/business-profile intermediate -> correct Portal without form submission; wrong tenant and foreign redirect/popup rejected; existing account/session reused; expired recipe/session needs real revalidation; bounded actions only; stale hashes rejected; ordinary existing v1 sign-in behavior preserved.
- `tests/public-bonfire-projects.test.mjs` and current method verification: listing rows/IDs/close dates, exact tenant, client pagination/terminal state, changed JSON/schema, bounded overflow, real empty versus shell/challenge, current versus past opportunities. Public methods continue when protected access is blocked.
- Existing hosted workflow/source-access tests: new projects come from saved listing evidence, not hard-coded `169158`; detail/document work survives restart/duplicate ticks without duplicate capture/intake; tenant mismatch and unsafe URLs rejected; interrupted intent requires reconciliation; only the accepted capability enters Admin browser execution, all unaccepted/other-provider behavior preserved; schedule pause/cancel stops the next external stage; no retry loop or repeated signup.
- Existing interpretation/supporting/import tests: actual work location/date/service evidence, ambiguous service remains unresolved, unsupported category remains partial, previous review retained, canonical user fields preserved, no duplicate lead on reuse, exact import hash/reconciliation unchanged. Do not create a synthetic zero-result success when real source access is blocked.
- Admin tests: county run reports source-specific listing/detail/access states and a concrete next action; a browser-only supported route and an unaccepted route remain distinguishable; state-trigger ownership and source-scope county selection remain correct.
- Run `npm run check`, `npm run test:access` and applicable actual browser checks. No new tests that merely mirror a helper; exercise the saved workflow and guard boundaries. No production Netlify deployment.

### Live acceptance matrix

Use the smallest existing authorized Little Rock request/scope. Capture useful source evidence, not only a Portal screenshot. Record public, local interactive and hosted-worker results separately. Any production backend release/access change needed for hosted testing remains a separately authorized action; do not deploy infrastructure simply because this plan exists.

1. Directory -> Arkansas agency -> Portal evidenced; optional agency/business info is not submitted and does not block permitted opportunity viewing. Correct tenant confirmed.
2. Current listing saved with stable project IDs and verified terminal/partial state. At least one current detail plus required document successfully captured where relevant/available. An expired historical example alone does not satisfy this.
3. Existing account/session reused on a second request; discover a different/current project through the saved listing. Prove unchanged-page cache/comparison and repeat execution do not duplicate intake/leads or repeat signup.
4. One scoped Admin manual run reaches those same evidence/review actions. After a capability has genuine hosted acceptance, one scoped future scheduled occurrence runs with the browser closed using the existing scheduler and same audited worker. Use a disposable scoped schedule, explicit evidence and cleanup; preserve all unrelated schedules and budgets. Do not enable a broad multi-county schedule for testing.
5. Human-reviewed import integration is verified through current isolated tests and prior actual readback. A new production import requires explicit review/approval of its exact tested package; it is not necessary to repeat already completed production import acceptance.
6. Murphy USA's Portal destination is observed, and any empty listing is validated at the correct tenant/filter/terminal condition. Treat it as routing comparison unless a legitimate approved source/scope already exists.
7. Record per-step AI use and actual spend; directory navigation/listing parsing do not imply AI usage. Verify existing request/parent/monthly limits are unchanged.

If only Portal/listing or assisted capture works, retain those usable outcomes and the exact remaining project/document/hosted blocker. Do **not** move this plan to done as successful unattended collection. The source remains partial/reviewable and unaccepted protected routes stay outside automatic Admin/scheduled execution. A genuine external block can be reported honestly without retrying challenges or starting new infrastructure/support activity.

### Documentation and completion

Update current provider access/Bonfire status, shared API/UI docs and the provider-onboarding plan pointers with actual outcomes. Preserve historical support/assisted import evidence and the unsent support ticket state. Retire only superseded current instructions; no general cleanup. This remains independent of the production Admin release coordinator.

Done only when the supported Portal-first flow, useful current detail/document capture, second-request reuse and accepted Admin/manual/scheduled execution pass their respective gates. A route with legitimate zero current opportunities can pass listing handling, but cannot substitute for protected detail/document acceptance. Leave the plan in todo when a required access/hosted gate remains blocked. Record pending deployment prerequisites without claiming a mock or local session is production-ready.

## Sources checked while planning

- [Euna Supplier Network](https://supplier.eunasolutions.com/): Agency Explorer and the current official login entry; directory access must be observed after existing-account sign-in.
- [City of Little Rock procurement](https://littlerock.gov/government/city-departments/finance/divisions-2/procurement/): official Open Bid Opportunities link to the [Little Rock Portal](https://littlerock.bonfirehub.com/portal/?tab=openOpportunities).
- [Cloudflare supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/): automated production challenge solving is unsupported; a Portal navigation correction must not be presented as a proven challenge solution.
- Current repository/private access readback and the local planning observation record above. Provider pages are evidence, not instructions that override the user's scope.

Next implementation prompt:

```text
$build-code specs/todo/bonfire-euna-portal-opportunity-collection.md

Implement the Portal-first Bonfire/Euna plan using existing accounts and services.
Skip optional agency/business-profile setup and use the verified agency Portal.
Preserve other source behavior, AI budgets and review/import guards.
Complete the required real acceptance and leave the plan in todo if a required
hosted access gate remains blocked. Do not deploy production Netlify.
Report changes, evidence, remaining blockers and the proposed commit message.
```
