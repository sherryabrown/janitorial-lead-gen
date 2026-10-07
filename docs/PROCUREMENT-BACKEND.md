# Procurement backend API (v1)

Status: backend implementation in progress; no frontend was added. Existing Netlify UI and CLI remain available. The forward migration is **applied and verified** on the existing Supabase project; Render Free backend **deployed; health and access-denial checks verified**. No frontend was added. Authenticated workflow, discovery/access continuation, reviewed import and free-host browser/memory acceptance remain outstanding.

## Client contract

### Local continuation changes (not deployed yet)

- Restricted-import migrations `20261007000200` and `20261007000300` are applied and recorded. The login is now active. Live readback confirms only the 11 import tables are readable, four import tables updatable, history appendable, no DELETE/TRUNCATE, no RLS bypass, role/user management or schema creation. Three inherited administrative helpers are denied; every existing role's effective helper access was preserved.
- The local connection validator requires this restricted role and pinned project, plus `PROCUREMENT_DATABASE_CA_BASE64` containing the official database CA certificate. It rejects owner credentials and URL options that override TLS verification. Strict TLS, connection identity, transaction locks/temp-table access and denied operations passed against the actual restricted login. Generated credentials stay in ignored `.env` and Render environment settings.
- Render configuration deployment `dep-db2r0l67bikc73am3ifg` is live on Free. The initial preparation-only test was killed at its 512 MiB memory limit (event `evt-db2r1hu8bjmc73fnllug`). Test job `7a895b16-62de-4212-9233-cf860428fc69` is blocked to prevent automatic replay; no approval or canonical import was sent. Backend health recovered to 200.
- Pending code deployment: SQL validation uses a disposable child process and fresh copies of a build-time empty PGlite template, lower PostgreSQL buffers, bounded execution and private resource measurements. The actual saved test passed all SQL checks locally with validator peak about 251 MiB versus about 572 MiB before template reuse. Render Free fit must still be demonstrated. Original CLI validation retains its default engine behavior. `npm run test:workflow` creates the empty template; direct hosted-import tests require running `node scripts/create-sql-validation-template.mjs` first. The generated archive is ignored and contains no project records.
- The real-data test also exposed a missing baseline dependency: existing relevant lead links can reference earlier requests. Import snapshots now include those referenced requests, preserving actual foreign-key checks without reading unrelated requests.

- `GET /v1/requests/:id/attention?offset=0&limit=50` derives sanitized actions from existing jobs, category tasks and associated private access handoffs. No new alert table, notifications or screens. Requires sign-in; reading attention does not wake collection. Maximum page size 100.
- Separate SAM collection now saves every page artifact, verifies it against the audit and stages immutable intake observations before review. `GET /v1/sam/requests/:id/packet` exposes the saved review evidence. Request status includes these candidates. The existing import prepare/approve/reconcile endpoints accept the exact SAM request run set and candidates; geography imports still cannot attach arbitrary SAM runs.
- PostgreSQL transactional access uses the same Supabase database through server-only `PROCUREMENT_DATABASE_URL`. It is distinct from the existing HTTP URL/API key and the temporary signed-in test token. No additional database or tables are required. Connection provisioning and live import verification remain pending.
- Nineteen focused tests passed, including real reviewed-import SQL rollback/replay checks, SAM audit drift, altered capture rejection, private attention projections and authenticated read endpoints. This does not establish deployed or live end-to-end completion.


All /v1 routes require a Supabase **user access token** in Authorization: Bearer <token>. Every signed-in user can operate the shared workflow; the server validates the session and records the actor. Never send service-role keys, database passwords, browser cookies, portal passwords or verification codes through these routes. Exact configured origins only; no cookie authentication. Responses contain no raw database/provider error messages.

Requests use Idempotency-Key (8–100 letters, digits, underscores or hyphens). Repeat the same key/input after a connection interruption. Different input requires a new key. Submission returns 202 and request_id; read status to advance bounded work. Status reads may wake the free host. There is no schedule or artificial keepalive.

| Method/path | Purpose / next action |
|---|---|
| GET /health | Process health only; does not attest source coverage or deployment readiness. |
| POST /v1/geographies/preview | Resolve city/county; county returns saved municipality IDs and selection token for fresh user confirmation. |
| POST /v1/requests | Create confirmed bounded geography request and queue existing methods. |
| GET /v1/requests/:id?offset=0&limit=50 | Coverage tasks, current candidates, persisted/import links, usage and separate SAM status. Limit <=100. |
| POST /v1/requests/:id/cancel or /resume | Durable controls; unknown external/import outcomes require reconciliation. |
| GET /v1/requests/:id/tasks/:task/packet | Readable saved evidence, scope/method/date basis; no raw bytes or filesystem paths. |
| POST /v1/requests/:id/tasks/:task/interpret | Submit reviewed packet-bound interpretation; validate exact excerpts, actual location and dates; stage immutable intake. |
| POST /v1/requests/:id/imports/prepare | Queue the existing explicit reviewed-decision manifest; current candidates only. |
| GET /v1/imports/:job | Read tested summary, approval hash and next action; private SQL/package excluded. |
| POST /v1/imports/:job/approve | Body contains approval_sha256 matching the exact tested package. Applies guarded SQL and verifies readback. |
| POST /v1/imports/:job/reconcile | Verify unknown transaction against saved baseline; never automatically resend. |
| POST /v1/requests/:id/discover | Persist selected-category gaps and exact research handoff. Automatic researcher is **not configured yet**. |
| GET /v1/access/:handoff | Sanitized existing access status. |
| POST /v1/access/:handoff/events | Existing lifecycle/CAS events; credentials excluded. |
| POST /v1/access/:handoff/continue | Save exact secure-session/recipe blocker. Hosted signup/sign-in continuation is **not operational yet**. |
| POST /v1/sam/requests | Separate manual statewide opportunity or award collection; publication_window required. Forecasts use agency sources. Hosted SAM review/import continuation remains outstanding; existing CLI import is preserved. |

Example city request body:

```json
{
  "kind": "city",
  "name": "Little Rock",
  "request_name": "Bounded janitorial check",
  "requested_categories": ["opportunity"],
  "service_scope": {"service": "janitorial"},
  "search_windows": {
    "opportunity": {"from": "2026-10-06", "to": "2027-10-05", "date_basis": "deadline"}
  }
}
```

For county submission, use preview's selected_city_ids, selection_token and confirmed_city_selection:true after confirming that request's cities. For a multi-county city, supply the resolved county_id. Forecast basis expected_solicitation_date; award basis end_renewal; publication remains supported. An absent category selection on existing CLI requests retains legacy all-three behavior. New API requests require explicit selected categories/windows. Jurisdiction is not proof of actual work location.

Use the saved packet's version/hash and the existing interpretation schema (scripts/lib/known-source-workflow.mjs). Import reviews use the existing reviewed-batch schema (scripts/lib/reviewed-batch.mjs). The server never treats initiating a request as approval of a generated import batch.

## Runtime and storage

scripts/workflow-server.mjs is the Node entry point (npm run workflow:server). workflow-http.mjs is the transport; hosted-workflow.mjs owns common orchestration. CLI and host share geography-service.mjs and known-source-collection.mjs. Existing adapter methods, audit/leases, interpretation persistence and reviewed SQL remain authoritative.

Durable procurement_jobs carry stage/checkpoint/lease. Supabase private Storage bucket procurement-private holds immutable content-addressed packages and encrypted session artifacts. Only two new private tables: procurement_extraction_cache and procurement_usage_ledger. Existing source/access/capture/intake/lead registries are reused. Cache source facts, then reapply each request's scope/dates; never reuse another request's zero/coverage conclusion. Entry checks, failed fetches and successful login do not establish lead coverage.

Paid AI defaults **off**. Enabling requires an approved monthly limit, configured model/key and versioned rates. Database reservations enforce $1/request, four total inference calls, 32,000/8,000 total input/output tokens and 8,000/2,000 per call. Input token counting precedes inference. Confirmed primary credit/quota rejection alone permits Anthropic fallback; unknown calls retain reservations. Reported costs represent hosted provider calls, **not historical Codex chat costs**. Automatic discovery's search-tool accounting is still outstanding and must precede enabling it.

## Reviewed deployment checklist

1. Review/apply supabase/migrations/20261007000100_hosted_procurement_workflow.sql through the existing reviewed deployment process. It adds private storage/cache/usage and service-only submission/lease/budget RPCs. Applied and recorded as version 20261007000100; live private-bucket/RLS/service-only grants verified.
2. Configure server-only SUPABASE_URL (pinned project) and SUPABASE_SERVICE_ROLE_KEY. Never place these in VITE_ variables or Netlify client assets. Configure PROCUREMENT_ALLOWED_ORIGINS with the **verified existing** Netlify site origin (no guessed site ID).
3. Reviewed imports require PROCUREMENT_DATABASE_URL with TLS verification and a reviewed restricted server login. Privileged owner credentials must not become a frontend setting. Provision and verify its least-privilege grants/RLS and schema inspection before enabling production imports; that live permission check is outstanding. Leave it unset to disable hosted import preparation.
4. Browser sessions require a 32-byte base64 PROCUREMENT_SESSION_ENCRYPTION_KEY supplied privately. Secure session adoption/human verification, machine-readable authorized signup recipes and hosted browser capture wiring are still outstanding; do not claim account activation from the current handoff routes.
5. Render blueprint and Dockerfile.workflow prepare a Free service, auto-deploy off. Verify container image/dependencies, cold start and actual Chromium/PDF/PGlite peak memory below 512 MB before deployment acceptance. No automatic paid upgrade. Ephemeral files are disposable; do not promise unattended completion after the client closes.
6. Keep AI disabled pending approved cap/provider configuration. No automatic discovery search calls are presently sent. Reconcile source-method/account identity before activation; prohibit aggregator signup and retain manual verification fallback.
7. Live authenticated end-to-end: confirmed geography -> audited bounded capture -> verified interpretation -> staged candidate -> exact reviewed approval -> imported lead/readback; repeat request to prove method/cache reuse. Separately verify statewide SAM. Test restart/local-file loss, expired leases and unknown external/import outcomes. Record request/run/import IDs, elapsed time, peak memory, actual tokens/cost and truthful remaining gaps. These checks remain outstanding.

Offline checks: npm run test:workflow; npm run test:sql; npm run lint; npm run test:app; npm run build. Offline tests do not prove production authentication, hosted browser fit or external access.

## Render deployment record

Workspace: My Workspace (tea-db2pv92jnfac73fjmkgg). Backend service: srv-db2q9mmi0phs738v7f80. URL: https://janitorial-procurement-backend.onrender.com. Initial deployment: dep-db2q9n6i0phs738v7h6g, from commit dc4ca46428f0fae72df8fd7607256830f1c00fa1. Free plan confirmed; automatic deploys off. No frontend/site settings were changed. Private creation/status receipts are in outputs/deployment/render/. Provider credentials/models are configured and verified; approved AI configuration is deployed and live. Reviewed PostgreSQL import transport is not configured yet.

Live deployment verified October 6, 2026 (America/New_York): Render reports initial deployment live. GET /health returned 200; anonymous and invalid-session workflow requests returned 401; unapproved origin returned 403. No authenticated collection job or production import was executed by these checks. Private receipt: outputs/deployment/render/live-smoke.json. Provider credentials are now configured; PostgreSQL import transport remains unconfigured. Deployment verification is not complete workflow acceptance.

AI configuration October 6, 2026: OpenAI gpt-5.4-mini ($0.75/$4.50 per million input/output tokens); backup claude-haiku-4-5-20251001 ($1/$5), pricing version 2026-10-06-official-standard. Both private keys passed provider token-count endpoints; no inference generated. Render settings privately read back; PROCUREMENT_AI_ENABLED=true and shared monthly cap=$10, existing database-enforced $1/request and token/call caps retained. Activation deploy dep-db2qfi49v7es739t7nog reuses the successful build. Automatic official web-search discovery and hosted reviewed-import transport remain separate unfinished checks. No API keys were placed in documentation or committed.

AI configuration deployment verified live: dep-db2qfi49v7es739t7nog; health 200, anonymous workflow request 401. Verification confirms configuration deployment and token-count access, not a completed paid interpretation or import.
