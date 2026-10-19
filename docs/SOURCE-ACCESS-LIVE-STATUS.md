# Source access

## Latest Bonfire check — October 19, 2026

The [Portal collection plan](../specs/todo/bonfire-euna-portal-opportunity-collection.md) remains **in progress, blocked on protected project/document access**. Earlier dated entries below are historical evidence.

Return-build check at **2026-10-19 14:16–14:17 UTC**: private readback still has zero unreconciled account submissions, expired recipe (October 16)/session (October 9), and the protected capture blocked/not saved with `human_verification_required`. One fresh public listing fetch returned the same five projects and SHA-256 `ff51d2db82e0f6efe27a7b988aa8e3ac726f043dd1854724c75f5494591b2c3b`. One public detail attempt at [Natural Steps Park Management, project 249097](https://littlerock.bonfirehub.com/opportunities/249097), derived from that listing, returned **HTTP 403 at 14:17:17 UTC**. No retry, browser launch, challenge attempt, expiry renewal, database/provider write, AI call or import followed. This is a public-fetch check, not a fresh hosted-browser attempt or proof that interactive access stopped working.

Local return-build code adds bounded public detail/document continuation to the shared worker. It retains a source/method hold after blocked or uncertain attempts, including across later requests. Verified explicit recapture/saved-receipt reconciliation can resume matching progress without discarding reviews. Literal same-host public PDF links must come from a signed saved current project; query/tokenized, foreign and unlinked downloads remain unsupported. Missing/dynamic/protected attachments remain partial. Admin shows saved outcomes and loads signed document text on selection. These changes were subsequently committed as `954c35b` and released to Render and the approved draft preview; this is not protected Bonfire acceptance. SAM automatic imports and non-SAM approval guards are unchanged.

Initial hosting readback during the build showed Render on `c40c341`. After explicit user release authorization, Render deployment `dep-dbb2n2ks728c73a6t3d0` became live on `954c35b` at 14:40:27 UTC; approved [Netlify preview](https://bonfire-review--janitorial-lead-gen.netlify.app) deploy `6ad62bd312c903f2974858bd` uses the same feature commit. Preview and backend health returned HTTP 200; exact preview CORS returned 204. All Render environment settings were verified unchanged. Netlify production remains locked on unchanged deploy `6ad583d1b9bb1b307abcf1fd`. A provider-supported current detail/document route remains required before fresh deployed-commit capture/readback, second-request reuse and scoped manual/scheduled acceptance. The prepared inquiry remains unsent.


| Surface | Actual result |
| --- | --- |
| Signed-in Chrome Agency Explorer, Arkansas, City of Little Rock | Agency card opens a new tab at tenant `/registration`. Visible **Portal** link opens current opportunities without submitting profile/business fields. |
| Little Rock public listing | One bounded fetch succeeded; five current projects parsed with stable IDs and terminal listing state. This does not establish qualified janitorial leads. |
| Current project `249097`, from that listing | Automated navigation reached Cloudflare verification. On later manual navigation the user waited for its checkbox, completed it, and confirmed details/documents opened. This is user-confirmed manual access, not an automated saved capture or hosted acceptance. |
| Murphy USA comparison | Actual agency card opens `https://murphyusa.bonfirehub.com/registration`; its Portal opens. Only **My Opportunities** was shown, with “There is currently nothing to display here.” This is not a verified zero public listing. No source registration/scope expansion. |
| Saved private access | Existing account retained; zero unreconciled account submissions. Old hosted capture remains blocked, `human_verification_required`, with no saved capture. Recipe/session/protected method expiry was not extended. |
| Hosted/Admin/scheduled protected collection | Not accepted or enabled. Existing public method and other providers unchanged. No deployment, new schedule, AI call, import, signup, or support message. |

Saved evidence packets now expose current Bonfire project links from validated captured rows. Admin review shows those links and the official Portal, explicitly distinguishing listing evidence from detail/document verification and server-session acceptance. The supporting-capture API rejects projects absent from the hash-verified saved listing, and rejects challenge/sign-in/registration pages or changed final destinations as project evidence, including HTTP 200 challenge responses.

Resume implementation: Admin now exposes explicit saved-access check/sign-in/capture/reconciliation actions through the existing APIs. Expired reviewed recipes disable hosted sign-in/capture. A private per-capability gate admits only a matching Bonfire project-detail method backed by a successful hosted capture receipt and immutable run/capture readback, bound to recipe/method hashes and the Render service/commit. Proof expires after seven days or earlier method/recipe expiry. Later failed/uncertain attempts revoke eligibility; local/public/manual success cannot enable it. No current capability was promoted. Per-page/document audit boundaries retain pause checks. Listing-only unresolved projects do not consume inference calls; titles without janitorial keywords remain unresolved pending details.

Read-only preflight against actual saved hosted state confirmed recipe expiry October 16 and session expiry October 9, zero new browser launches and no acceptance. The existing headless worker has no interactive challenge surface. A fresh hosted challenge attempt was not made with expired access; no deployment or cookie/clearance transfer occurred. This preflight is local evaluation of real saved metadata, not a new capture performed on Render. That earlier preflight preceded the local return-build continuation described above. Live protected/manual/scheduled acceptance remains unfinished.

Navigation/listing parsing used no product inference: zero input/output tokens and USD 0; no credits were inferred. Local nonsecret evidence is under ignored `outputs/deployment/bonfire-euna-planning/`. The prior [assisted import and supported-access handoff](reviews/2026-10-09-bonfire-supported-access-handoff.md) remains intact; its support message remains unsent. Required next acceptance is legitimate current project/document access, followed by hosted readback and second-request/manual/scheduled acceptance; browser-local clearance is not transferable proof.

## Historical check — October 6, 2026

| Path | Proven | Remaining |
| --- | --- | --- |
| Private lifecycle | Database resume, independent stages, event replay/concurrency, private role denial | Human/provider actions advance actual setup; recording alone does not perform them. |
| USAspending public API | Existing source, saved Arkansas award method, bounded capture, interpretation, intake and reviewed import; second request reused the method | No-key API only. Forecast/opportunity and publication/renewal searches are not covered by this method. |
| Little Rock Bonfire | Existing reported account and exact database next action preserved | Real observed sign-in, authenticated category capture and second-request reuse. Browser runtime failed to initialize. |
| Keyed APIs | Header/bearer, private secret resolution, allowlists, redaction and denial tested offline | No new keyed source claimed operational without a live issued-credential retrieval. |

The first Ozark pilot captured 17 statewide awards and reviewed one eligible Ozark award. Existing lead `244d1acb-667e-5403-8060-ec14a22568f5` received reviewed evidence and a request link; zero duplicate/new leads were created. Six awards were captured on a second date-window request, with one Ozark finding and five city-scope exclusions persisted. Its reviewed import also passed exact-package tests and readback, linking the same existing lead to that second request without duplication. Other planned source jobs were not executed as part of this access pilot.

Forward migrations `20261006000100`–`20261006000400` are already applied and read back. The private `source-api` function is deployed. SAM remains on its separate manual statewide path.

Final checks: lint, 15 app tests, 148 workflow tests, existing SQL regressions and production build passed; real PostgreSQL/PostgREST private-role tests passed. Private transaction receipts and capture bytes are under ignored `outputs/procurement-access/activation/` and `outputs/known-source/`.

Next human action: sign in to the existing [Little Rock Bonfire account](https://littlerock.bonfirehub.com/portal/) and complete any verification/MFA. Passwords and codes stay in the secure browser. A functioning authorized browser is also needed to observe and capture the protected document; a user-reported login alone does not mark access verified.

The [active plan](../specs/todo/arkansas-source-access-activation-and-reuse.md) stays in `specs/todo/` until that portal retrieval and reuse acceptance is evidenced. [SOURCE-ACCESS.md](SOURCE-ACCESS.md) owns the lifecycle and command contract.

## Onboarding continuation — October 6, 2026

**Latest user decisions:** Little Rock is signed in according to the user; observed protected retrieval is still blocked by browser-runtime initialization. No aggregator signups. Central Bidding is deferred as signup needed; its former form-inspection request is withdrawn. Other sources use October 6, 2026–October 5, 2027 by bid deadline / expected solicitation / contract end-renewal. Existing accounts are uncertain; reconcile and ask before duplicate creation. These decisions are saved in the private lifecycle with readback.

The [continuation plan](../specs/todo/registered-source-access-onboarding-and-collection.md) owns the rollout. Its private checklist covers 14 source records. Nine missing handoffs were added; 14 provider/agency blocker checkpoints were saved and read back. Existing registered methods and registration summaries were preserved.

| Provider / source | Current next action |
| --- | --- |
| Little Rock Bonfire procurement/contracts | Reuse the reported existing account; user sign-in/verification plus a functioning supported browser are required for observed protected retrieval. Public methods remain available. |
| Faulkner Central Bidding | Inspect [official vendor signup](https://www.centralauctionhouse.com/SignUp) and free-access limits. User previously confirmed no account; form returned 403. Paid plans exist; no subscription or submission made. |
| Rogers OpenGov portal/API | Confirm existing vendor/developer access. Official vendor account is free and universal; API eligibility, Rogers entity permission and cost remain unverified. Browser/API-document extraction blocked deeper inspection. |
| Arkansas Ariba | Confirm existing account/application and resume official invitation/approval path; browser unavailable. |
| Legacy ARBuy | Confirm account and need for pre-transition records. Official signup requires tax ID entered directly in the portal; new state sourcing is routed to Ariba. |
| AR Bid: Pulaski, water, wastewater, Conway | Confirm/reuse one supplier account, verify agency-specific documents. Official portal describes free access. Conway public viewing/download does not require an account. |
| LRSD | Resolve current official vendor-registration destination; historical IonWave evidence is retained, staff website sign-in excluded. |
| METRO ProcureWare | Confirm account/application, inspect current free-registration form in a working browser; portal fetch returned 403. |
| Clinton Airport B2GNow | Confirm existing account/application and current procurement enrollment requirements; portal fetch returned 403. |
| USAspending / SAM | Existing verified API methods retained; SAM remains separate. No repeated pilot requests in this continuation. |

Both supported browser runtimes failed initialization during this continuation. The user was asked immediately for the specific sign-in, account, form and date dependencies while independent inventory/official access checks continued. **No signup, verification email, authenticated capture, newly issued key or new lead import occurred in this continuation.** Unknown/blocked categories are not zero results. Resume from the saved private database checkpoints after tool restoration and the pending answers; no new plan is required.
