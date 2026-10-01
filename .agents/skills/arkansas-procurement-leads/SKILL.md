---
name: arkansas-procurement-leads
description: "Research official janitorial procurement forecasts, opportunities, and awards for Arkansas cities, counties, municipalities, and other public agencies; help with authorized supplier registration and reviewed lead capture. Use for Arkansas government lead discovery or continuing its portal/API workflow, not unrelated UI development."
---

# Arkansas Procurement Leads

Find actionable, traceable procurement information without confusing a forecast, open solicitation, awarded contract, account registration, and database import. Explain the next action before performing it. Use official agencies and their linked procurement platforms; prefer public/free access and avoid paid aggregator feeds unless explicitly requested.

## Establish the task, then route

- Identify the Arkansas place and jurisdiction type, service scope, date windows, and work-location boundary. A city name is a discovery starting point, not proof that every agency contract serves that city. If unclear, ask whether the user wants city/county-only work or statewide Arkansas results; do not silently broaden coverage.
- Distinguish research, account setup, intake staging, and canonical import. The skill itself authorizes none of the latter three. Follow the user's actual request; do not add UI, integrations, messages, subscriptions, or schedules merely to perform research.
- Read [verified-methods.md](references/verified-methods.md) at the start to distinguish proven retrieval from unverified signup/access claims. These are dated historical observations, not current availability guarantees.
- For discovery/collection, read [discovery.md](references/discovery.md).
- Before portal signup/sign-in or email validation, read [accounts-and-email.md](references/accounts-and-email.md).
- Before using the existing CLI, API runner, staging or importing, read [runner-and-import.md](references/runner-and-import.md). Current local dependencies and geographic limitations matter; do not reuse the old Arkansas pilot's approvals/request ID for a new city without validating scope.

## Required operating distinctions

1. Obtain real source evidence, preserve exact query/document URL, timestamp, stable identifier and page/row or API run references. Search success is not complete coverage. Report blocked, partial and unchecked separately from a genuine zero result.
2. Search forecasts, solicitations and awards separately. Agencies may publish a forecast only in a district PDF. SAM awards are contract actions, not one new lead per modification. An active notice can have an elapsed deadline; an intent is not an executed award.
3. Match awards using full PIID/subtier/referenced-IDV identity; notices/forecasts use source identifiers. Do not merge by title, vendor or location alone. Preserve current versus potential completion, conflicting work-site evidence, and unknown values; do not invent annual revenue.
4. A successful authenticated session, email-verified account, accessible award documents, enabled alerts and delivered notification are separate proofs. Never mark them all complete after merely reaching a portal or submitting registration.
5. When something extra is needed, tell the user **the site, what is blocked, the exact action/information needed, why it is needed, and what will resume afterward**. Continue other authorized public research where useful. Do not hide missing setup behind a generic failure or repeatedly request a key already stored securely.
6. Preserve evidence and existing user data. Preparation is not application. Only an authorized, tested import with live readback may be called imported/verified. Never change the app UI or deploy it for database-only research.

## Deliver a compact handoff

Report per source: official URL; actual retrieval method/API endpoint; forecast/opportunity/award coverage and dates; distinct findings versus currently open bids; account/access/notification status; and blockers. Separate records found, staged, proposed, inserted, enriched, linked, processed and unresolved when those stages apply.

End with a short **Needs you** list only for unresolved user actions. State if no accounts were created, no API requests ran, or no import occurred—do not imply those outcomes from a generated guide. Never promise that all existing opportunities were found when access or coverage remains incomplete.
