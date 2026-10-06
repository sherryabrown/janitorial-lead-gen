---
name: arkansas-procurement-leads
description: "Discover and retain official Arkansas city/county procurement sources; collect janitorial forecasts, opportunities, and awards; attempt authorized portal/API signup, track access, and alert on required user actions. Use for Arkansas procurement research and access workflows, not unrelated UI development."
---

# Arkansas Procurement Leads

Find actionable, traceable procurement information without confusing a forecast, open solicitation, awarded contract, account registration, and database import. Explain the next action before performing it. Use official agencies and their linked procurement platforms; prefer public/free access and avoid paid aggregator feeds unless explicitly requested.

## Establish the task, then route

- Identify the Arkansas place and jurisdiction type, service scope, date windows, and work-location boundary. A city name is a discovery starting point, not proof that every agency contract serves that city. If unclear, ask whether the user wants city/county-only work or statewide Arkansas results; do not silently broaden coverage.
- For this application's city/county procurement requests, honor the user's established database-persistence intent: reuse database sources, collect, save sources/candidate intake, review verified findings, import and read back. Read [database-persistence.md](references/database-persistence.md). Local JSON alone is not task completion. Explicit research-only/export-only instructions override this default. Signup, messages, subscriptions, UI changes and schedules require their own authority.
- Read [verified-methods.md](references/verified-methods.md) at the start to distinguish proven retrieval from unverified signup/access claims. These are dated historical observations, not current availability guarantees.
- For discovery/collection, read [discovery.md](references/discovery.md).
- Before portal signup/sign-in or email validation, read [accounts-and-email.md](references/accounts-and-email.md).
- For this repository's operational login/API activation, use [SOURCE-ACCESS.md](../../../docs/SOURCE-ACCESS.md) and `scripts/source-access.mjs`. Private database checkpoints own source setup; saved methods feed the existing runner and reviewed import.
- For source retention, API discovery/signup, or resuming access setup, read [api-access-and-tracking.md](references/api-access-and-tracking.md). Load the saved source ledger before creating duplicate accounts/applications; check official API availability for each source during discovery.
- For actionable portal/API signup handoffs, read [signup-alerts.md](references/signup-alerts.md). Resend alerts to the authorized recipient are separate from read-only Gmail verification and portal subscriptions.
- Before using the existing CLI, API runner, staging or importing, read [runner-and-import.md](references/runner-and-import.md). Current local dependencies and geographic limitations matter; do not reuse the old Arkansas pilot's approvals/request ID for a new city without validating scope.

## Required operating distinctions

1. Obtain real source evidence, preserve exact query/document URL, timestamp, stable identifier and page/row or API run references. Search success is not complete coverage. Report blocked, partial and unchecked separately from a genuine zero result.
2. Search forecasts, solicitations and awards separately. Agencies may publish a forecast only in a district PDF. SAM awards are contract actions, not one new lead per modification. An active notice can have an elapsed deadline; an intent is not an executed award.
3. Match awards using full PIID/subtier/referenced-IDV identity; notices/forecasts use source identifiers. Do not merge by title, vendor or location alone. Preserve current versus potential completion, conflicting work-site evidence, and unknown values; do not invent annual revenue.
4. A successful authenticated session, email-verified account, accessible award documents, issued API credential, verified API request, enabled alerts and delivered notification are separate proofs. Persist each outcome and next action; never mark them all complete after merely reaching a portal or submitting registration. Honor existing scoped signup authority without repeatedly asking for the same approval.
5. When something extra is needed, tell the user **the site, what is blocked, the exact action/information needed, why it is needed, and what will resume afterward**. Continue other authorized public research where useful. Do not hide missing setup behind a generic failure or repeatedly request a key already stored securely.
6. Preserve evidence and existing user data. Preparation is not application. Only an authorized, tested import with live readback may be called imported/verified. Never change the app UI or deploy it for database-only research.

## Deliver a compact handoff

Report per source: official URL; actual retrieval method/API endpoint; forecast/opportunity/award coverage and dates; distinct findings versus currently open bids; portal and API status; signup-alert outcome; blocker and next action. Give confirmed database source/request IDs, verified receipts and supplemental access-ledger location. Separate records found, staged, proposed, inserted, enriched, linked, processed and unresolved. Application research is incomplete if findings exist only locally; name the exact failed persistence step if blocked.

End with a short **Needs you** list only for unresolved user actions. State if no accounts were created, no API requests ran, or no import occurred—do not imply those outcomes from a generated guide. Never promise that all existing opportunities were found when access or coverage remains incomplete.
