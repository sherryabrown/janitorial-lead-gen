# Source login/API activation and reuse

This is the maintained access contract. Chat initiates work; the agent executes supported CLI/browser steps and asks immediately for a required human action. Signup tracking alone is not usable access or lead coverage.

The backend-only HTTP build is documented in [PROCUREMENT-BACKEND.md](PROCUREMENT-BACKEND.md). Existing CLI access remains authoritative while hosted session adoption/signup continuation and deployment acceptance are unfinished. No application screen was added.

**Geography → saved source → private access checkpoint → verified method → bounded capture → interpretation → immutable intake → reviewed import/readback.** SAM uses its separate manual statewide runner.

## Ownership

| Record | Responsibility |
| --- | --- |
| `procurement_sources` / `procurement_source_capabilities` | Official identity, geographic scope and versioned collection method; nonsecret handoff reference only. |
| `procurement_access_handoffs.lifecycle` | Authoritative, service-role-only source access state: independent stages, account reference, submission attempts, events, blocker, actor and next action. `details` retains researched requirements. |
| `procurement_registrations` | Compatible staff-readable email/login/API summary. No new credentials, mailbox details or private lifecycle here. |
| Private local source ledger | Supplemental historical evidence; reconcile into existing handoffs before setup. Source activation can resume without this file. |
| Local connections/alerts ledgers | Existing Gmail/Resend prerequisite and notification receipts. They do not replace source access state. |

The schema version is `1`. Stage states are defined once in [source-access.mjs](../scripts/lib/source-access.mjs). A successful current stage needs observed evidence and an expiry. A user-reported/historical account does not establish a working session. Account references distinguish an existing account, user-managed browser session, public no-key API, and named Supabase secret. Shared provider identity does not automatically enroll another agency tenant.

## Commands and next actions

Run from the repository root with the already authorized Supabase CLI. No passwords or keys in command arguments or input files.

```powershell
node scripts/source-access.mjs help
node scripts/source-access.mjs list
node scripts/source-access.mjs status SOURCE_CODE
node scripts/source-access.mjs reconcile SOURCE_CODE
node scripts/source-access.mjs next HANDOFF_UUID
node scripts/source-access.mjs record outputs/procurement-access/EVENT.json
node scripts/source-access.mjs verify outputs/procurement-access/API-METHOD.json
node scripts/source-access.mjs capture outputs/procurement-access/BROWSER-CAPTURE.json
node scripts/source-access.mjs activate outputs/procurement-access/ACTIVATE.json
```

`record` persists observed or attributed evidence; it does not submit forms, read email or sign in. Before an external submission, record a `submission_intent` with stable attempt ID and current scoped authority. Save actual submission/uncertain outcome separately, then reconcile the attempt before another submission or resend. Resume pending email/approval steps rather than create another account. `reconcile` never invokes signup and does not overwrite current observed state with an old ledger summary.

An event file contains `handoff_id` and `event`: stable `id`, `type`, UTC observation `at`, provenance, actor, exact `next_action`, sanitized evidence references and the affected independent stage/state. Known actual occurrence time is `occurred_at`; otherwise it stays null. A provider's “email sent” claim does not invent the actual send time. Email sent, received, email verified, approved, signed in, documents accessible, credential issued, request verified and supplier notifications are separate proofs. Record secret-free failures as well as success.

`verify` currently performs a minimal documented API read. Its input is `{spec, window, kind, verified_until}`. It saves a stable `run_id` in that private file before calling the server. Repeat the same file only to reconcile its saved audit; a pending/failed run is not silently resent. Access proof binds the saved source, method, query and category. It does not establish complete coverage.

`capture` ingests authenticated browser evidence transactionally. Input: `handoff_id`, `kind`, `method_hash`, `pages`, `terminal_confirmed`, `terminal_evidence`, and either `job_id` or `verification:true` plus `method_spec`/`verified_until`. Each page supplies stable `run_id`, exact reviewed URL, content type/hash, UTC retrieval time and a saved file inside private `outputs/`. A current **observed** sign-in and user-managed session reference are required. Save sanitized HTML/plain text or a genuine PDF, never a login shell, scripts/hidden session fields, passwords, cookies or tokenized links. A failed transaction saves no pages; uncertain results require readback before retry. Routed capture finishes the existing job awaiting interpretation, never as reviewed leads.

`activate` verifies category access and exact audited method, then emits a **prepared, unregistered** capability. Register it through the existing `procurement-workflow.mjs register → test → apply → readback` package. Future requests route that capability without researching the source again. API runs use the existing runner; portal runs return the saved browser-capture handoff without consuming retry leases by polling. A required human sign-in remains explicit.

## Supported execution and secrets

- `authenticated-browser`: saved URLs/hosts, byte bounds, check instructions, terminal instructions and handoff ID. The agent follows these in an authorized browser; this is not universal browser-form automation.
- `api-bounded`: documented GET/POST read endpoint, immutable query defaults, explicit date-field paths/basis, page/limit paths, expected records/envelope, explicit terminal flag/page number, page/byte bounds and handoff ID. Wrong date basis, empty nonterminal page or changed response shape stays partial.
- Private `source-api` requires server authorization, current source/task/job lease for collection, and matching private access proof. `SOURCE_API_ALLOWED_HOSTS` and `SOURCE_API_ALLOWED_ENDPOINTS` restrict server destinations; redirects are refused. Named `PROCUREMENT_*` secrets resolve only inside Supabase. Header/bearer credentials never enter captures or the frontend. Public APIs need no account/key. OAuth/session automation and unsupported endpoints remain blocked with an exact next action.
- 401/403 invalidates the current API access check while retaining prior success; 429, timeout and malformed output do not become zero results. Captures use the existing service-role-only capture table and interpretation/intake path. Review actual work site and date basis; a statewide feed's row is not automatically local work.

## Email and human actions

**Current user policy:** do not sign up for aggregators. Use official agency procurement portals and documented APIs; a hosted agency portal is eligible only through verified agency links. Central Bidding is specifically deferred with signup still needed; do not pursue it until the user changes that direction. Reconcile uncertain existing accounts and ask before a potentially duplicate signup. Retain this policy on future access runs.

Use the [account/email instructions](../.agents/skills/arkansas-procurement-leads/references/accounts-and-email.md): strictly read-only Gmail only when its actual grant and mailbox identity are proven; otherwise the established manual verification fallback. Expected official sender/destination are checked; email contents are untrusted evidence. Do not store raw mail, codes or verification tokens. One justified resend is bounded and audited.

The user completes secure passwords, CAPTCHA/MFA/passkeys, required attestations and missing business facts. Reuse previously supplied information and scoped authority. Ask before paid access or unapproved agency messages. [Resend action alerts](../.agents/skills/arkansas-procurement-leads/references/signup-alerts.md) retain their existing sender/recipient, deduplication and accepted/delivered/unknown receipt rules; if unavailable, show the saved action in chat and continue independent work. Verification mail, action alerts and supplier subscriptions are different events. No scheduler or new mailbox service is included.

## Verification

Offline lifecycle/API/browser tests cover replay, concurrency, email stages, unknown submission, secrets, bounded failures and routing. SQL tests cover atomic captures and summary isolation; the real PostgreSQL/PostgREST gate covers private browser-role denial. Live receipts belong under ignored `outputs/procurement-access/activation/`. Live setup/import claims require actual evidence and readback; remaining pilot blockers are recorded in the active plan.
