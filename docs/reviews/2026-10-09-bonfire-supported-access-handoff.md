# Bonfire supported-access handoff — October 9, 2026

## Outcome

Authenticated automation remains **blocked**. No new login, capture, inference, import or deployment was attempted in this investigation. Existing successful sign-in/session reuse, assisted capture, actual import, duplicate prevention and SPIN project-link evidence remain complete. The workflow plan stays in `specs/todo/`.

The user selected **“Prepare the message; I’ll submit it.”** No support request has been sent. Do not mark it submitted, awaiting provider response or API-approved until actual evidence is supplied.

Existing private handoff `de25aa65-8ee6-47ac-a049-ffa4ecbbc5a7` now records this user action through event `bonfire-supported-route-handoff:2026-10-09`, revision **27**. Live readback verified unchanged successful stage history, owner `user` and the exact next action. No new table, account or public source record was created.

## Supported-route assessment

| Route | Evidence and decision |
|---|---|
| Transfer in-app clearance to Render | Not a supported solution: Cloudflare binds clearance to the visitor/device. Do not export or replay clearance to another machine. |
| Add remote control to the current Playwright browser | Not established as a supported solution: Cloudflare lists automated browsers/frameworks as unsupported for production challenge solving. The deployed headless service has no interactive handoff. Do not build a speculative viewer or expose browser debugging credentials. |
| Normal interactive hosted browser | Requires a separate authenticated, isolated interactive-browser mechanism and proof that the provider supports collection afterward. Render supports WebSockets, but this alone proves neither challenge compatibility nor memory fit. It would require new browser infrastructure/control surface; not implemented under the current no-frontend constraint. |
| Official vendor API or approved automated reads | **Recommended next inquiry.** No vendor-accessible API for this tenant was verified from the reviewed public documentation. This does not prove none exists. Euna must confirm availability, permissions, categories, document access, costs and supported authentication. Do not infer an API from internal browser traffic. |
| Existing human-assisted capture | Already verified through actual import and SPIN; remains an available fallback. It does not satisfy unattended hosted capture acceptance. |

Official documentation reviewed October 9:

- [Cloudflare supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/): automated browsers and Playwright are unsupported for solving production challenges.
- [Cloudflare clearance](https://developers.cloudflare.com/cloudflare-challenges/concepts/clearance/): clearance is tied to the visitor/device.
- [Cloudflare resolve a challenge](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/resolve-challenge/): only the website owner can change its challenge configuration.
- [Render WebSockets](https://render.com/docs/websocket): transport is available, not proof of a working interactive browser.
- [Euna Procurement support](https://procurement-help.eunasolutions.com/hc/en-us) and its [request form](https://procurement-help.eunasolutions.com/hc/en-us/requests/new).

## October 19 return-build update

The inquiry below is still **unsent**. User-confirmed manual project/document access after completing the checkbox is retained. Fresh private readback still shows expired hosted access and the earlier `human_verification_required` capture. One fresh public fetch returned HTTP 403 for current listing-derived project 249097 on October 19 at 14:17:17 UTC. No hosted attempt or challenge retry followed. The draft now uses that current example and separates these observations; no API availability is assumed.

## Ready-to-submit request

**Destination:** Euna Procurement support request form above, or `support.procurement@eunasolutions.com` as listed in that official help center.

**Subject:** Supported read access for Little Rock Bonfire vendor account

> We have an existing vendor account for the City of Little Rock portal at https://littlerock.bonfirehub.com/. We want to retrieve procurement notices and supporting documents for our internal janitorial lead-management application, using bounded, read-only requests. We are not submitting bids or trying to bypass security controls.
>
> Our existing account can open project details and documents in a normal browser after the user completes verification. Our last saved hosted Chromium/Playwright project capture on Render required human verification; its recipe/session have since expired, and we have not retried that hosted route. A separate single bounded public read on October 19, 2026 at 14:17 UTC returned HTTP 403 for a current Portal-listed project: https://littlerock.bonfirehub.com/opportunities/249097. We have stopped automated retries. Please advise on a supported retrieval path; we are not assuming an API exists.
>
> Please confirm:
> 1. Is there an official vendor API, feed or export available to our existing account for Little Rock? Please provide documentation and access requirements.
> 2. Which data can it provide: forecasts, opportunities, awards/contracts, supporting documents and the specific public project URLs?
> 3. If no API exists, is bounded automated read access permitted, and what supported authentication or provider-approved access procedure should we use?
> 4. Is tenant approval, an API key or paid access required? We are seeking a free option and are not authorizing a purchase.
>
> We can provide additional nonsecret diagnostics if required. We will not send passwords, cookies, verification codes or tokens.

## Resume gate

After the user submits, save the ticket identifier and actual submission date in the existing private access lifecycle. After a response, retain official instructions/evidence and reconcile the existing account before changing methods. Ask before payment, material terms, new access permissions or a hosting/UI change.

Only a confirmed supported route justifies resuming one bounded authenticated project/document capture. Then measure successful capture memory/cleanup and prove second-request collection reuse. Do not repeat completed import, app, public-source, discovery, SAM, cache or recovery acceptance. The previous blocked attempt remains `human_verification_required`, no saved capture, lease released; its 376.2 MiB peak is not successful document acceptance.

**Application AI usage this investigation:** zero calls, input/output tokens and $0. Web/document research here is not an application model call. No new records imported.
