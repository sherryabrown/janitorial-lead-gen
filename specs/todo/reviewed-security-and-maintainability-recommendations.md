# Reviewed recommendations: Supabase function exposure and maintainability

> **Superseded for execution — September 30, 2026.** The prerequisite `specs/done/01-faster-development-and-validation-workflow.md` is complete; next execute `02-code-review-remediation-and-authenticated-data-access.md`. The user now defines authorized access as signed-in access: any signed-in user may view/update leads; no staff-membership gate is requested. The newer review includes `.mjs` files and did not find `spin_generate_contracts` in the deployed function list. Preserve this document as historical planning context, not as the current implementation instruction.

## User prompt

> Review the supplied code-review findings and make recommendations, **ignoring all `.mjs` files altogether**.
>
> The supplied review highlights public Vite configuration hygiene, manual authorization in `sam-search`, the unauthenticated `spin_generate_contracts` Edge Function, PostgREST filter construction, regex extraction, the large `App.tsx`, and incomplete visibility into the base procurement schema/RLS.

## Scope and evidence boundary

This review intentionally excludes every `.mjs` file. It is based only on the current TypeScript frontend and Edge Functions, Supabase configuration, tracked SQL migrations, `.gitignore`, and package configuration. It is a recommendation plan, not an authorization to change database policies, Edge Function deployment settings, or secrets.

## Verified findings and recommendations

| Priority | Finding | Evidence / recommendation |
| --- | --- | --- |
| P0 before public launch | `spin_generate_contracts` is callable without caller authentication. | Confirmed. It accepts a POST before checking any authorization header, creates a service-role client, can invoke Anthropic web search, fetches remote portal URLs, and writes to `spin_*` tables. Project JWT verification is disabled. Require an authenticated/authorized caller and add per-user rate/cost limits before exposing this endpoint publicly. |
| P1 before public launch | `spin_*` read policies permit `anon` and `authenticated` reads. | Confirmed in `20260904000100_spin_contract_monitoring.sql`. Limit the tables to authenticated, approved users if run inputs/results are not intended to be public; align table reads with the protected function model. |
| P1 | `loadSources` constructs a PostgREST `.or()` expression containing a county string. | Partially confirmed. The county normally derives from a matched `spin_geography` row, so the user-controlled path is narrower than the supplied review suggests. Still remove the string-built `.or()` filter or strictly allow-list/escape its values; use separate typed queries and deduplicate results instead. |
| P1 | Base `procurement_leads`/`procurement_sources` schema and RLS policies are not in the visible migrations. | Confirmed as an evidence gap. The incremental migrations show careful RPC grants/search paths, but do not prove base-table select/write policies. Capture the live schema/policies read-only and add a baseline migration/snapshot for reproducible review. |
| P2 | The `sam-search` JWT config is not what protects the function. | Confirmed. Project/global and function config have `verify_jwt = false`, while the function manually requires a server secret in the `apikey` header. This is defensible for private server-to-server use, but document it explicitly and test rejected publishable-key/browser requests. |
| P2 | HTML text/regex extraction is brittle. | Confirmed in TypeScript. Keep it as a bounded prototype capture mechanism only; do not claim comprehensive portal coverage. A per-portal adapter/DOM extraction project should be a later, separately scoped product decision. |
| P3 | `App.tsx` is large. | Confirmed, but it is not the immediate risk. Defer broad component splitting until after the access-control work; extract only cohesive units when a functional change touches them (for example, contract refresh/history and filter/date utilities). |

## Recommendations not supported by the available evidence

- The supplied review’s positive claims about `.mjs` normalization, captured fixtures, and SAM audit flow were not re-evaluated because `.mjs` files are excluded by request.
- The current `.env` contains only Vite-prefixed URL/publishable-key configuration and is gitignored. Treat the publishable key as browser-visible by design; do not describe it as a server secret or print it in logs/reviews.
- The visible SQL supports the claim that some security-definer functions pin `search_path`, but it cannot establish that **every** function or the unseen base schema follows the same standard.

## Recommended decision

Before implementation, choose the intended access model for contract generation:

1. **Internal staff only — recommended.** Require a valid Supabase user session plus an approved-member/role check; table reads are authenticated and role-scoped; add a small per-user rate limit.
2. **Trusted server-to-server only.** Remove browser invocation, require a server secret/header as `sam-search` does, and call it only from a controlled backend workflow.
3. **Public self-service.** Not recommended without a much broader abuse-control design: authentication, verified users, quotas, durable rate limits, spending cap/alerting, audit identity, and restricted outbound fetching.

The current UI has Generate disabled, which limits ordinary product exposure, but the Edge Function URL remains separately callable. Option 1 is the proportionate choice for the stated small-business internal queue.

## Phase 1 — Read-only baseline and access-model confirmation

1. Confirm the intended model above. Do not infer it from the current UI state.
2. Use read-only Supabase inspection to capture:
   - Edge Function deployment/configuration status;
   - Realtime/public function exposure as applicable;
   - `procurement_leads`, `procurement_sources`, and `spin_*` RLS state and policies;
   - existing approved-member/role tables and policies;
   - whether any browser client currently invokes `spin_generate_contracts`.
3. Save a redacted baseline report containing policy names, roles, and access outcomes—never keys, JWTs, or raw secrets.
4. Add a regression matrix for anonymous, authenticated non-member, approved member, and service-role/server caller requests.

## Phase 2 — Protect contract generation (after access-model approval)

1. Keep the existing CORS preflight response, but require an authenticated Supabase JWT for POST requests. Validate the token through Supabase Auth rather than trusting an unverified header.
2. For the internal-staff model, check the authenticated user against the existing membership/approval source before performing any database write, Anthropic call, or outbound portal fetch. Return generic 401/403 messages without revealing membership details.
3. Add a durable, database-backed rate limit keyed by authenticated user and a short time window. Enforce it atomically before expensive work, record a rate-limited run/audit outcome, and set a deliberately small initial limit suitable for manual staff generation.
4. Restrict `spin_procurement_sources`, `spin_contract_generation_runs`, and `spin_contract_opportunities` reads to the same authorized role. Preserve service-role access inside the function only.
5. Replace `loadSources` string-built `.or()` use with separate typed client filters followed by ID-based deduplication, or a narrowly scoped RPC with parameterized SQL. Treat county/city values as data, never filter grammar.
6. Add explicit outbound-fetch guardrails proportionate to the endpoint: accept only `http`/`https`, reject private/link-local/loopback host resolution where platform support allows, bound redirects/timeouts/body sizes, and record failed validations without exposing private network details.

## Phase 3 — Verify and document

1. Test direct Edge Function calls for each access case before invoking any paid API or portal fetch. Unauthorized callers must be rejected before a run row, AI request, source check, or fetch occurs.
2. Test rate-limit behavior, concurrent calls, user identity audit fields, and an approved user’s normal successful run.
3. Verify anonymous and non-member API reads of protected `spin_*` tables are denied; verify approved users can read only the intended data.
4. Test `loadSources` with punctuation/metacharacter county values and normal Arkansas county inputs; assert that the generated query cannot alter logical filter structure.
5. Document the manual `sam-search` authentication model and the selected `spin_generate_contracts` model in the repository, including why global `verify_jwt = false` is intentional or remove the redundant override if deployment policy changes.
6. Only after security work is complete, create a separate plan for per-portal extraction adapters or `App.tsx` decomposition. Do not mix those refactors with the access-control release.

## Success criteria

- No anonymous or unapproved caller can cause an Anthropic request, portal fetch, or write through `spin_generate_contracts`.
- The endpoint and `spin_*` table policies implement one documented access model consistently.
- Query filters contain no user-controlled PostgREST grammar.
- The base procurement schema/RLS baseline is captured reproducibly and reviewed before relying on broad frontend reads.
- Private-function authentication is documented and covered by rejection tests.
- No `.mjs` code is changed or relied upon by this plan.
