# API discovery, setup and persistent access tracking

## Discover and attempt access within the requested scope

For each official source found through [discovery.md](discovery.md), check agency developer pages and officially linked provider documentation. Preserve documentation/signup URLs, evidence date, available forecast/opportunity/award categories, documented endpoints, geography/date filters, pagination, quotas, eligibility and cost. Unknown fields stay unknown. Do not infer a supported API from private browser requests or replace official sources with paid aggregators.

Classify the access method before acting:

| Method | Next action |
| --- | --- |
| Public no-key API | Registration and credential issuance are `not_required`; run an authorized minimal read request. |
| Self-service key/OAuth | Check existing authorized access; attempt eligible setup when signup is authorized. |
| Provider approval required | Submit an authorized application with real required details; retain pending state and provider responsibility. |
| Paid access | Record coverage unlocked and documented cost; require explicit spending authority before subscribing. |
| No documented API found | Save reviewed URLs and limits; use public documents/browser retrieval where available. |
| API unavailable/ineligible | Preserve evidence and blocker; continue other sources rather than claim zero results. |

A request to attempt signup for sources discovered within a defined Arkansas city/county scope supplies authority for eligible routine setup in that scope. Honor it without asking again for each portal. Research-only tasks do not authorize submission. Check existing sessions, applications and securely stored keys first. Agency enrollment may be separate from a shared provider login. Do not infer legal/tax details, register an entity in SAM for an individual key, or broaden geography because an API offers statewide rows.

For mailbox verification read [accounts-and-email.md](accounts-and-email.md); for actionable user steps read [signup-alerts.md](signup-alerts.md). Ask only for missing information/authority or an actual interactive step. Provider-only approval remains pending, not an endless retry loop.

## Verify access without claiming complete coverage

Once access is issued, run one minimal authorized read request through an existing supported method, following current official documentation and runner allowlists. Confirm upstream HTTP status, successful envelope and expected shape; save sanitized query, run ID and evidence. A valid empty response can prove access for that query; it does not establish zero market results or full coverage. Check permission to each data category independently. Collection must account for all pages before its stated query can be considered reviewed.

Preserve the existing SAM key inside Supabase and use the documented [runner](runner-and-import.md). Do not print keys, move them to frontend/local configuration, or create arbitrary new integrations. New credentials require an available authorized secure store; save only its reference. If none exists, retain issuance evidence and report secure storage as the blocker. Never put passwords, OAuth tokens, verification codes, tokenized links or raw credential-bearing responses into the ledger/evidence/reports.

401/403 means access/scope needs correction; 429 means respect the documented quota/backoff; timeout or malformed envelopes are unknown/failed outcomes, not zero results. Preserve the audit and inspect it before one bounded justified retry. Never repeat an uncertain signup submission before checking current application state. Expired/revoked credentials require correction without erasing prior verification history.

## Authoritative source activation and resume

For this project, use [SOURCE-ACCESS.md](../../../../docs/SOURCE-ACCESS.md) and `scripts/source-access.mjs`. The service-role-only `procurement_access_handoffs.lifecycle` owns source access stages, event history, stable submission attempts, account references, blockers and next actions. Stage vocabularies are defined once in the shared access library. Research requirements remain in handoff `details`; staff-readable `procurement_registrations` receives only compatible summaries.

Reconcile existing registration, database handoffs and `outputs/procurement-access/sources.json` before external setup. The source file is supplemental historical evidence, not the authoritative activation checkpoint. Resolve aliases explicitly; preserve older scopes/proofs and all submitted/pending/issued stages. Resume can proceed from the database when local source files are unavailable. Never reset current observed progress from an older local record.

An external form/API application starts with a persisted intent and stable attempt ID. Save actual submission or uncertain outcome, distinct email-sent/received/verified stages, provider approval and current access proof. Observation time is separate from a known actual occurrence time; unknown email send time remains unknown. Reconcile an uncertain attempt before any new submission/resend. Verification creates audited capture evidence; activation prepares a capability for the existing reviewed register/test/apply/readback path.

`outputs/procurement-access/connections.json` and `alerts.json` keep their existing private prerequisite/notification contracts. They use `schema_version:1`, UTC `updated_at`, and the appropriate record array; sanitized evidence stays under `outputs/procurement-access/evidence/`. These files are Git-ignored and are not secret stores or guaranteed backups. Never initialize an empty file over existing records. Reread/merge fresh state, detect conflicts, write a temporary sibling and replace safely, then read back. Stop on uncertain sends or conflicting updates; sequential local files do not guarantee concurrent-worker safety.

Use the fixed-recipient [Resend alert contract](signup-alerts.md) and strictly read-only/manual [email contract](accounts-and-email.md). Connection/alert failure does not block available public work. No background poller or recurring automation follows from a saved checkpoint.

Report agency/source, portal/API stages, usable category access, saved method/run, blocker, actor, next action and alert outcome. Keep captured, staged, reviewed and imported/read-back counts separate. Credentials, raw email, codes, tokenized links and private account metadata never belong in public source records.
