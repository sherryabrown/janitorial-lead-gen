# Procurement backend API (v1)

Backend code contract, updated October 18, 2026. Scheduler deployment/live acceptance is recorded in [the deployment record](ADMIN-SCHEDULING-DEPLOYMENT.md); it does not attest every provider's current availability. [Earlier documentation checkpoints](reviews/2026-10-13-backend-document-history.md) are preserved as history.

## Responsibilities and authentication

The existing app reads canonical leads through Supabase queue/detail RPCs and persists stages/notes through authenticated database APIs. The hosted backend collects source evidence, stages reviewed candidates and prepares/applies exact approved imports. Candidate intake is not the canonical lead queue. Companies and email previews remain disabled future functionality. The local Admin UI replaces Generate using this shared workflow; the undeployed legacy `spin_generate_contracts` implementation has been retired locally. See [Admin UI and release checks](ADMIN-UI.md).

`npm run workflow:server` starts `scripts/workflow-server.mjs`. `/health` is public process health only. Every `/v1` route requires a Supabase user access token in `Authorization: Bearer <token>`; all signed-in users can operate the shared workflow and actions record the actor. Exact configured origins only; no cookie authentication. Direct HTTP failures are sanitized. Worker failures expose a controlled action, `workflow_stage_failed` code and diagnostic UUID; exception text stays in private server logs. Import/status and attention projections also suppress old arbitrary checkpoint error messages.

Request submissions require `Idempotency-Key` (8–100 letters, digits, underscores or hyphens). Retry interrupted submission with the same key/input; changed input needs a new key. Submission returns 202 and a request/job identifier; read saved status to advance work. A request is not approval of a generated import package. Never send service keys, database passwords or provider secrets through workflow routes. The session-adoption route is the explicit private exception for bounded browser storage state, which is independently verified and encrypted; it never echoes the supplied state.

## Admin execution addition — October 13

[Admin trigger API](ADMIN-TRIGGERS.md) adds multi-county/state-source execution, private step auditing and shared parent budgets. Admin/scheduling migrations were installed October 18, 2026; the recurring scheduler is activated and live-accepted, while the Admin frontend is implemented locally in part 03, pending coordinated release. Part 02 adds the durable scheduling API and private dispatcher; see [rollout status](ADMIN-SCHEDULING-DEPLOYMENT.md). Existing standalone routes below retain their contract. Admin child usage reports actual provider consumption rather than reservation estimates.

## Routes

| Method / path | Purpose and next action |
| --- | --- |
| GET `/health` | Process health; no coverage/acceptance claim. |
| POST `/v1/geographies/preview` | Resolve Arkansas city/county and fresh county city-selection token. |
| POST `/v1/requests` | Submit confirmed bounded geography/category request; read status. |
| GET `/v1/requests/:id` | Tasks, jobs, paged candidates, persisted links and usage. |
| GET `/v1/requests/:id/attention` | Sanitized required actions; does not wake collection. |
| POST `/v1/requests/:id/cancel` or `/resume` | Durable controls; uncertain outcomes require reconciliation. |
| GET `/v1/requests/:id/tasks/:task/packet` | Saved readable evidence, scope and packet identity; raw bytes excluded. |
| POST `/v1/requests/:id/tasks/:task/interpret` | Validate packet-bound findings/excerpts/location/dates and stage immutable intake. |
| POST `/v1/requests/:id/tasks/:task/supporting-captures` | Capture one reviewed-method public document with `packet_hash` and `url`; does not start unrelated work. |
| POST `/v1/requests/:id/imports/prepare` | Queue explicit current-candidate reviewed manifest and native SQL rehearsal. |
| GET `/v1/imports/:job` | Tested summary, exact approval hash, receipt and controlled next action; SQL/package excluded. |
| POST `/v1/imports/:job/approve` | Supply matching `approval_sha256`; guarded apply and independent readback. |
| POST `/v1/imports/:job/reconcile` | Verify unknown transaction outcome before retry; no blind resend. |
| POST `/v1/requests/:id/discover` | Select gaps or queue one persisted gap; optional seed must be associated with this request. |
| GET `/v1/requests/:id/discovery/tasks/:task/packet` | Sanitized saved official-source research packet and hash. |
| POST `/v1/requests/:id/discover/review` | Bind task/hash and evidence-backed source/capability/access assessments; rehearse registration and collect. |
| POST `/v1/requests/:id/discover/resume` | Resume corrected blocked stage without erasing saved progress. |
| GET `/v1/access/:handoff` | Existing sanitized access lifecycle and next action. |
| POST `/v1/access/:handoff/events` | Existing lifecycle/CAS events; no credentials. |
| POST `/v1/access/:handoff/continue` | Execute saved private recipe/session continuation or exact human handoff. |
| POST `/v1/access/:handoff/session` | Verify and privately encrypt bounded `{storage_state}`; no client-selected recipes/commands. |
| POST `/v1/access/:handoff/capture/:job` | Capture matching leased authenticated method; no client-selected capture URL. |
| POST `/v1/access/:handoff/capture/:job/reconcile` | Reconcile prior attempt/run audits before another request. |
| POST `/v1/sam/requests` | Separate manual statewide opportunity/award request with `publication_window`; forecasts use agency sources. |
| GET `/v1/sam/requests/:id/packet` | Saved SAM review evidence. Status and exact import endpoints above handle this separate request. |

Status/attention pagination: `offset=0&limit=50`, maximum limit 100. Candidate response paging does not remove the complete bounded read needed for request totals and guards. Request status reads use narrow task/interpretation/usage projections; shared reads stop rather than silently truncate at their 10,000-row bound. Known-source collection uses the same stable bounded paging convention. Source-change checks probe at most two one-row responses, preserving matches against any historical hash without downloading every prior capture. Large baselines still require a deliberately reviewed narrower scope.

## Request, evidence and import contracts

New geography API requests require explicit `requested_categories`, `service_scope` and `search_windows`. County submission needs preview's `selected_city_ids`, `selection_token` and `confirmed_city_selection:true`; multi-county cities need the resolved county. Forecast basis is `expected_solicitation_date`, opportunity `deadline`, award `end_renewal`; publication remains supported. Existing CLI requests without category selection retain legacy all-category behavior. Jurisdiction is not evidence of actual work location.

```json
{
  "kind": "city",
  "name": "Little Rock",
  "request_name": "Bounded janitorial check",
  "requested_categories": ["opportunity"],
  "service_scope": {"service": "janitorial"},
  "search_windows": {
    "opportunity": {"from": "2026-10-13", "to": "2027-10-12", "date_basis": "deadline"}
  }
}
```

Use packet version/hash and `scripts/lib/known-source-workflow.mjs` interpretation schema. Import decisions use `scripts/lib/reviewed-batch.mjs`. Supporting findings include the capture's URL/hash/type/retrieval time/private artifact reference/signed receipt plus exact locator/excerpt. Verification binds source/request/task/packet/method/host, immutable bytes, quoted spans and request bounds. At most five supporting references per interpretation. Portable signed facts are reusable only under matching listing content/method/version and freshly reapplied geography/date bounds. Reuse preserves original retrieval time; it is not a fresh fetch or complete coverage. Unknown source location/date/category remains unresolved.

Version-2 import packages bind manifest, baseline, evidence, schema, SQL/test digests, validator policy and successful native rollback/readback/replay/cleanup receipt. Current review and schema must still match at application. Production writes preserve user-managed fields, dedicated facts, relationships and audit history through atomic SQL guards. An uncertain outcome must be reconciled; version-1 hosted packages need re-preparation/reapproval. Operator offline PGlite SQL tests remain release gates.

## Execution, discovery and budgets

Durable Supabase jobs hold leases/checkpoints; private `procurement-private` Storage holds immutable artifacts and encrypted sessions. Extraction facts and usage reservations have private tables. CLI and host share geography, source collection, interpretation and reviewed-import services.

The worker wakes from actual request/status traffic and processes bounded stages for up to two minutes per kick. Remaining pending work requires another wake. Part 02 provides schedule CRUD and a durable private dispatcher for due schedules/pending continuations after activation (completed October 18; live evidence in ADMIN-SCHEDULING-DEPLOYMENT.md). No artificial keepalive is issued. Cancellation stops new work without undoing committed records.

The server injects collection into `discoveryService`, selecting bounded `official-link-discovery.mjs`, not its no-collector fallback. It follows saved official-host links: one page per checkpoint, maximum ten pages and 2 MB/page. External portal/developer links are saved for review. New-source research needs an associated official seed; reviewed category evidence, native registry rehearsal and guarded readback precede method activation. No paid web-search/inference discovery calls run. Registered methods feed the existing capture/review/import path. Login, entry accessibility or a shell response is not lead coverage.

AI is off by default for a new deployment; enabling requires approved keys/models/versioned rates and monthly cap. Reservations enforce $1/request, four inference calls, 32,000/8,000 aggregate input/output tokens and 8,000/2,000 per-call bounds. Input counting precedes inference; only confirmed unbilled primary quota rejection permits fallback. Unknown billing retains reservation and blocks another call. These are application API costs, independent of Codex usage. Existing configured host settings must not be reset to bootstrap defaults during cleanup.

## Server-only configuration and deployment

| Setting | Requirement |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Pinned project `zreplhkoxswtzxlchtjf`; server-only service authorization. |
| `PROCUREMENT_ALLOWED_ORIGINS` | Exact existing approved frontend origins. |
| `PROCUREMENT_DATABASE_URL` | Restricted production importer, strict TLS. |
| `PROCUREMENT_REHEARSAL_DATABASE_URL` | Separate restricted native validator. |
| `PROCUREMENT_DATABASE_CA_BASE64` | Valid official Supabase database CA; no TLS overrides. |
| `PROCUREMENT_SESSION_ENCRYPTION_KEY` | Private 32-byte base64 session key when browser access is enabled. |
| `PROCUREMENT_BUSINESS_PROFILE`, `PROCUREMENT_*_EMAIL/PASSWORD` | Optional reviewed private signup/sign-in inputs; never client variables. |
| `PROCUREMENT_AI_ENABLED`, `PROCUREMENT_MONTHLY_AI_USD` | Approved activation and shared monthly cap. |
| `OPENAI_*`, `ANTHROPIC_*` | Keys, model, rate version, input/output prices as consumed by the server provider factory. |

Source API/SAM credentials and their allowlist settings live in the respective server-only Edge Function configuration. Browser variable references must be reviewed private recipe data. `.env.example` contains public browser configuration only; no credentials belong in docs or bundles.

Render Docker starts `workflow-server.mjs`; no embedded database or SQL template is loaded. Native rehearsal uses private transient `procurement_test` objects in the existing Supabase database, transaction locking and verified rollback/cleanup. Bounds: 10,000 copied rows, 10 MB serialized baseline, 120 seconds total; strict SQL/lock timeouts also apply. Unsupported dependencies or larger batches block rather than bypass tests. Serialize browser/import work and measure actual hosted memory for relevant methods. Read all Render environment pages and preserve every prior key/value when separately authorized to change configuration.

No migrations or deployment occur in this cleanup. Bootstrap `render.yaml` intentionally disables spending; it is not a readback of the configured host. Existing migration history and restricted-role permissions are retained.

## Dated acceptance and remaining scope

These reports document prior observations, not fresh live checks:

- [Known-source capture and approved new/existing-lead import](reviews/2026-10-07-known-source-backend-acceptance.md).
- [Cache, private artifact recovery, lease recovery and cold start](reviews/2026-10-07-cache-and-recovery-acceptance.md).
- [Public source and separate SAM approved import/replay](reviews/2026-10-07-public-source-and-sam-backend-acceptance.md).
- [Official discovery, method registration and second-request reuse](reviews/2026-10-07-public-discovery-and-reuse-acceptance.md).
- [Authenticated source assisted import and precise hosted limitation](reviews/2026-10-08-authenticated-source-acceptance.md).

Provider-specific Bonfire/Euna work is separate and paused in scope for this effort. UI collection wiring and scheduling remain future work. Existing source coverage and pending candidates must continue to report actual partial/unresolved states.

For local release validation use `npm run check`; applicable disposable access checks are separate. Offline success is not live deployment/provider acceptance. [Development workflow](development-workflow.md), [research/import contract](PROCUREMENT-WORKFLOW.md), and [private access lifecycle](SOURCE-ACCESS.md) retain their responsibilities.


## Saved SAM status reads (local implementation, October 19)

`GET /v1/sam/requests/:id/status` is authenticated and read-only. It returns collection readiness, an evidence identity, and current automatic-import state/counts from existing jobs. It reads no capture artifacts or intake payloads and never kicks collection/import. `/packet` remains the verified full-evidence reader; during collection it returns an explicit pending projection, not a successful empty result. The UI polls status and reloads evidence only when its identity changes. Deploy the matching backend before releasing this frontend; this cleanup build itself does not deploy.

## Settings read efficiency (local implementation, October 23)

Run reporting shares children, usage and projected jobs within each request. `GET /v1/triggers/:id?projection=progress` returns `progress_only: true` for pending/running runs; terminal states return the full report. The UI merges only explicitly marked partial progress and replaces full reports, so old presentation flags cannot survive a settled refresh. Existing worker wake behavior, authentication and mutation contracts are unchanged.

`GET /v1/schedules?projection=choices` returns paged schedule IDs/names/archive state without reporting or deletion checks. `GET /v1/admin/history?projection=choices` keeps run identity, dates, origin, target type and outcome labels without reconstructing lead metrics or step timing. Default responses remain unchanged.

`GET /v1/triggers/:id/steps?sequences=1,2` refreshes at most 50 explicit numeric sequences within that trigger. It cannot be combined with a cursor and always returns a null next cursor. Normal pagination still uses the existing sequence cursor. The additive `20261023000400_workflow_step_sequence_index.sql` migration matches this access path; it removes no historical index or data.

Visible log readers retain loaded pages, refresh unfinished/unknown-usage steps, and fetch subsequent records without replaying earlier pages. Explicit refresh can reread the saved depth. Inactive workspaces and browser documents suspend reads without cancelling server work or discarding drafts. Concurrent identical GETs are shared only for the same API origin/session/path; each subscriber has independent cancellation and receives its own result copy. No response cache changes freshness, authentication checks or uncertain-write retry rules. Reads have a 30-second transport deadline; writes do not gain automatic retries.

Deploy the matching backend before this frontend so selective step refresh is supported, and apply the additive index through the normal migration process. This local build does not deploy or contact production. Reporting storage redesign, catalog caching, bundle/dependency changes and evidence retention remain separate follow-up work.
