# Bonfire/Euna Agency Explorer access verification

## Original requests

> do you know what trouble bonfire/euna is having? manually i can get to the Opportunities -> Agency explorer -> select Arkansas -> <agency of City of Little Rock or Murphy USA for now> -> 'Portal' (I don't see any leads for Murphy USA right now but it's the same process). can this be addressed within the plan docs you just created?

> let's please separate the Bonfire/Euna requirements from the main effort of code cleanup.

## Objective and scope

Verify the user-supplied navigation path, establish where interactive and hosted access differ, and retain a working reusable method where supported. The recorded blocker is hosted project-detail Cloudflare verification after successful sign-in/session reuse; it does not establish that the platform or every route is unavailable.

This is a separate provider-access effort. Completion does not gate `pre-integration-review-remediation-and-cleanup.md`. Shared cleanup fixes remain owned by that plan; coordinate any edits to shared browser/status services without duplicating them. No live execution, support message, purchase or deployment is performed by creating this plan.

Evidence: `docs/reviews/2026-10-09-bonfire-supported-access-handoff.md` and the Bonfire/Euna clarification in `docs/reviews/2026-10-12-pre-integration-code-review.md`. Preserve the existing provider lifecycle in `registered-source-access-onboarding-and-collection.md`.

## Technical approach

Inspect `scripts/lib/hosted-browser.mjs`, `scripts/lib/portal-session.mjs`, saved private portal recipes and tenant-specific methods. The current capture executor navigates directly to saved URLs. Observe the directory route before changing that executor; any required steps should become bounded reviewed data, with tenant isolation and existing evidence/import controls preserved.

## Phase 1 — verify the supplied route

This owns the October 12 Bonfire/Euna clarification independently of code cleanup. Coordinate with `specs/todo/registered-source-access-onboarding-and-collection.md`; do not duplicate its provider lifecycle or repeat completed import acceptance. The October 9 support handoff remains historical evidence, not proof that every route fails.

1. Inspect the existing private Little Rock portal handoff, saved method and recipe before any navigation. Preserve successful sign-in/capture/import evidence and the previous failed-attempt reconciliation state. Reuse the account; no new registration, paid access, support submission or bid action.
2. Observe the user's exact path in an authorized supported browser: Opportunities → Agency Explorer → Arkansas → agency → Portal. Record nonsecret starting/destination URLs, selected agency identity, redirects/new-tab behavior and observable session/tenant state. Verify both named destinations where available; do not guess a Murphy USA hostname. Save credentials/cookies only through existing private session handling. User-reported access remains separate from observed access.
3. For Little Rock, compare the route with the current direct tenant entry and saved project URLs under equivalent account conditions. Distinguish directory discovery, portal access, listing access, project detail and supporting-document retrieval. Record the exact step, response/page condition and environment where a challenge occurs. A navigation-context hypothesis is not a confirmed Cloudflare fix.
## Phase 2 — conditional method adjustment and acceptance

1. If navigation is required, express verified bounded steps and destinations as reviewed method/recipe data. Current login recipes allow bounded fill/click steps and tenant verification; current capture goes directly to saved URLs. Extend the shared executor only as required by observed route semantics, including select/new-tab behavior if actually needed. Keep explicit allowed hosts/redirect validation, encrypted per-tenant sessions, recorded intent, byte/page/time bounds and cleanup. Do not add arbitrary browser commands, client-selected URLs, clearance replay between machines or a speculative remote-browser service.
2. Observe listing terminal conditions before declaring zero results. Murphy USA's empty view is currently a user observation only; verify account/category/filters/pagination and distinguish an empty real listing from a shell/challenge. Use Murphy USA as a routing comparison, not automatic lead-generation scope: Arkansas directory selection does not establish work location. Confirm new source/geography scope before creating registrations or collection requests outside existing authorization.
3. Run one bounded hosted Little Rock capture through the verified method, then prove saved-method/session reuse on a second request without duplicate intake/leads. Verify useful project/document evidence, not just login/portal reachability. Keep existing review/import boundaries; new production application requires its exact approval. If only interactive access succeeds, retain assisted capture and the exact hosted blocker; no bypass or blind retry.
4. Reconcile the current access/status docs and provider plan pointers with actual outcomes. The support request prepared October 9 is still unsent. Keep it as fallback if the supported route remains blocked, and include precise route/environment diagnostics if the user later authorizes submission. Do not treat a provider support reply as a prerequisite to merely observing this user-supplied route.

## Testing strategy

Offline tests for any executor change: allowlisted cross-host/new-tab transitions bind the correct tenant; foreign destinations/session reuse are rejected; challenges produce a resumable human handoff; a failed navigation cannot become successful coverage; verified empty listing versus unverified shell; repeat navigation does not repeat signup or saved captures. Live acceptance must name environment and separate portal, project and document success. Existing public Bonfire methods remain available during the investigation.

## Success criteria

- Exact Portal destinations and observed tenant/session transitions are evidenced, without guessed URLs or new accounts.
- Portal, listing, project and document outcomes are recorded separately for interactive and hosted environments.
- Any changed executor has passing destination/session/challenge/empty-listing/replay regressions.
- A supported hosted method demonstrates bounded useful capture and second-request reuse; otherwise the precise remaining blocker and assisted fallback are retained. A blocked outcome is not successful unattended acceptance.
- Murphy USA remains a route comparison unless additional collection scope is explicitly confirmed.
- Current access docs and provider-plan pointers reflect the observed outcome; historical evidence and unsent support-request status are preserved.

Next: inspect the saved access records and observe the supplied route before proposing executor changes. Code cleanup can proceed independently.
