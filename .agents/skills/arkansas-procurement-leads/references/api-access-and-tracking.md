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

## Durable local record contract

Use `outputs/procurement-access/sources.json` as the shared source/access ledger. Use `connections.json` for Gmail/Resend prerequisites, `alerts.json` for alert events/attempts, and sanitized dated evidence under `outputs/procurement-access/evidence/`. These private local files are Git-ignored, not database tables, secret stores or guaranteed backups. Do not create fabricated live records to demonstrate the schema.

Each JSON file has `schema_version: 1`, `updated_at` and its record array (`sources`, `connections` or `alerts`). Create it with an empty array only when a real authorized task needs persistence; add only observed or explicitly attributed facts. Use UTC ISO timestamps for records; display dates in the user's timezone.

Structural example only, not a captured source ledger (fill `updated_at` with the actual save time):

```json
{"schema_version": 1, "updated_at": null, "sources": []}
```

The connection and alert files use the same envelope with `connections` and `alerts` respectively. Each source nests `coverage.forecasts`, `coverage.opportunities`, `coverage.awards`, `portal` and `api`; each independent state holds its evidence date/reference. Do not copy this empty example over an existing ledger.

### Source record fields

| Field/group | Required meaning |
| --- | --- |
| `source_id`, `identity` | Stable local identity; provider, agency/tenant and canonical official entry URL. A shared login is not one enrollment for every agency. |
| `agency`, `official_urls` | Actual name and entry, procurement, document, developer and signup URLs where known. |
| `scopes` | Multiple request/jurisdiction associations with city/county, service, dates and work-area evidence; preserve earlier scopes. Only store real existing database IDs when known. |
| `discovered_at`, `checked_at`, `authorization` | Evidence dates and current task authority, including allowed setup scope. Authority never derives from an old report. |
| `coverage` | Separate forecast/opportunity/award records with status, method, dates, exact query/pages/run IDs, finding counts, location uncertainties and limits. |
| `portal` | Independent registration, email verification, agency approval, sign-in, document access and notifications. |
| `api` | Discovery, registration, credential issuance, request verification, access method, documented capabilities, granted scopes and safe credential reference. |
| `evidence` | Sanitized official URL/local evidence path, timestamp, and confidence: `observed`, `user_reported` or `historical`. |
| `blocker`, `next_action`, `responsible_party` | Exact issue and action; responsibility is `agent`, `user` or `provider`. Blocker is separate from registration state. |
| `history` | Append-only events with field, previous/new state, time, evidence and reason. Preserve contradictions and earlier successful checks. |

### Independent state vocabularies

| Dimension | States |
| --- | --- |
| Coverage, per category | `unchecked`, `partial`, `blocked`, `reviewed_with_results`, `reviewed_no_results_for_stated_scope` |
| Portal registration | `not_started`, `submitted`, `awaiting_email`, `pending_agency_approval`, `verified`, `rejected` |
| Portal email verification | `not_required`, `not_tested`, `awaiting_email`, `verified`, `blocked` |
| Portal agency approval | `not_required`, `not_tested`, `pending`, `approved`, `rejected` |
| Portal sign-in | `not_tested`, `verified`, `blocked` |
| Portal documents, per category | `not_tested`, `accessible`, `partial`, `blocked` |
| Portal subscription notifications | `not_requested`, `enabled_unverified`, `delivery_verified` |
| API discovery | `not_checked`, `documented_available`, `not_found_after_review`, `unavailable` |
| API registration | `not_required`, `not_started`, `submitted`, `awaiting_email`, `pending_provider_approval`, `approved`, `rejected` |
| API credential issuance | `not_required`, `not_issued`, `issued`, `expired`, `revoked`, `unknown` |
| API request verification | `not_tested`, `verified`, `failed` |

Success requires evidence of that specific outcome: form acceptance proves submitted; actual email-confirmed portal state proves verification; provider approval evidence proves approval; issuance proves a credential exists; a successful upstream request proves usable API access for that endpoint/scope. A login does not prove document access, approval does not prove issuance, and issuance does not prove a working request. An alert email is neither a portal subscription test nor signup approval.

For API verification store attempted/verified timestamps, endpoint and sanitized error/status. Preserve a historical successful verification while recording a newer failed attempt; never present the historical date as a current check. A CAPTCHA blocker must not reset a submitted application to `not_started`.

## Save and resume

1. Load relevant sources and connection/alert records at task start. Match provider/agency/URL plus request scope, not title alone. Historical reports provide candidates, not current verified access. Recheck uncertain/outdated facts before external actions.
2. Save each newly discovered source and meaningful attempt/result, including blocked, pending and rejected outcomes. Preserve unrelated fields/scopes/history. For application research, also persist reviewed public coverage/request associations through [database-persistence.md](database-persistence.md). Do not copy the whole access ledger, credentials or private connection state into public source rows. Merge actual verified database IDs into the supplemental local ledger.
3. Before writing, reread the file to detect intervening edits. Merge affected fields into the fresh version or stop on conflicting updates. Validate JSON and enum/required-field consistency. Write a temporary sibling and replace the target when supported; read back and check intended records. Do not overwrite a stale whole-file copy. This sequential file workflow is not safe for concurrent workers; reconcile rather than promise concurrency.
4. If persistence fails, report unsaved state and the precise repair; do not claim captured/tracked. Keep evidence separate from normalized status and sanitize secrets before saving, not after logging them.
5. On resume, inspect pending submission state before another application. Continue the recorded next action and recheck authority where the requested scope changes. Uncertain submission/send outcomes require reconciliation; do not silently retry.

Final per-source handoff: agency/official URL, coverage and relevant dates, portal state, API state, blocker, next action/responsible party and alert outcome. Give ledger path and real collection/staging/import counts separately. Tracking permits future resume; it does not start background polling or a recurring automation.
