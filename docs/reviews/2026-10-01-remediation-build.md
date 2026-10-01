# Review remediation build — October 1, 2026

## Outcome and deployment

The authenticated-read boundary and paginated queue RPC have been applied to Supabase project `zreplhkoxswtzxlchtjf`. Application/UI and workflow changes are local and uncommitted; this build does not deploy the frontend to Netlify. Deploy the frontend after reviewing the diff. Existing production lead records were not changed as test fixtures.

The September 30 core schema baseline is for disposable development databases only. Production received forward migrations, never the baseline. Before/after permission inventories are private under `outputs/procurement-access/`; the before-apply inventory matched the inspected baseline. Post-migration inspection found 29 relations, zero anonymous/PUBLIC table grants, zero anonymously executable scoped functions, 23 shared authenticated-read policies, and no scoped or alternate public views. Private administrative/member/account policies were retained.

## Review disposition

| Item | Resolution |
| --- | --- |
| 1 — anonymous reads | Revoked table grants and unauthenticated RPC execution; shared data requires an authenticated user. Live HEAD/API verification rejects anonymous reads; signed-in browser reads succeed. |
| 2 — non-member updates | Accepted product behavior, verified with real non-member/member roles and signed JWTs. Single/bulk RPCs retain validation, atomic audit and note ownership. |
| 3 — lost research context | Read-only qualifications are separate from author notes and survive detail/history refresh. No imported fake note IDs. |
| 4 — calendar shifts | Shared strict calendar parsing, no fabricated procurement dates, real timestamp offsets retained. Browser SSC start is July 1; timezone regressions cover Chicago, New York and UTC. |
| 5 — source links | Shared HTTP(S) validation, missing links remain text, unsafe schemes/credentials rejected; bare domain support documented in code. |
| 6 — existing lead/new request | Reviewed geographic request links are reconciled independently of creating a lead, preserving existing relationship state. |
| 7 — manual amendments | Stable record identity and immutable observation identities; explicit same-record parent relationship; changed evidence attaches to one canonical lead. Retrieval-only changes do not create business-change history. |
| 8 — metadata | Validate final assembled capture/provenance/authorization, reject credential fields/URLs, bound field explanations and evidence keys. |
| 9 — incomplete queues | Server filters/search/counts, 50-row pages, ID tie breakers, lazy detail, explicit cross-page checkbox selection, stale-response protection and last-page clamping. Null bounds rejected; historical publication dates filter correctly. |
| 10 — misleading save failure | Apply returned single/bulk state immediately; show history failure as a separate refresh/retry message. |
| maintainability | Extracted AuthGate, ResearchContext and save sequencing; reused contract types/defaults/date/URL helpers; removed obsolete client list filtering/history enumeration. AppShell still merits gradual extraction. |
| Generate | Remains disabled; no function deployed. Activation gates recorded in the workflow guide. |
| local artifacts | Removed eight local state files from Git's index while retaining local copies. Narrow ignore rule added. Existing deleted deployment ZIP preserved as deleted; history untouched. |

## Verification

- Clean copy, no `.env` or private outputs: `npm ci --offline --no-audit --no-fund`, then `npm run check` passed: 15 application tests, 36 Node regressions, both standalone SQL suites, lint, typecheck and production build.
- Follow-up queue migration: affected offline SQL regression and `npm run test:access` passed; final lint passed. Tests cover 1,005 rows, exact totals, unique stable pages, stage movement, search text, date/activity filters, null bounds and anonymous denial.
- Real PostgreSQL 15.15 + PostgREST 16.4 isolated HTTP/JWT gate passed: signed invalid/expired token denial, anonymous table/RPC denial, member/non-member reads and stage edits, author-only note editing, actor history, server-only intake write, browser import denial and pagination. The cluster uses only random localhost ports and stops itself.
- The local gate reconstructs the Auth claim helper; it does not run the Supabase signup service. The optional hosted Supabase Auth suite is provided but was not run. The user performed a real Supabase sign-in in the local browser, and browser logout removed protected data.
- Browser smoke: signed-in reads after the migrations; 322 open leads over seven pages; checkbox retained across pages; server search; persistent SSC qualifications after refresh; July 1 calendar display; keyboard focus; no malformed links in the inspected view; concise empty queue; logout. Single/bulk mutations and forced history failures were exercised in composed UI tests plus isolated HTTP tests, not by changing production lead stages or disrupting the production connection.
- Existing workflow protections remain covered: preserved sales fields, stale hashes, rollback, immutable inputs, replay, source identities and request geography. Procurement skill validation passed.

## Limits and operating notes

Separate page requests are not a frozen database snapshot. Concurrent inserts/edits may shift records between pages; refresh reconciles the current page. Queue ordering has an ID tie breaker and selection contains explicit IDs, never an implicit all-matching mutation.

Amendments preserve evidence and existing canonical facts. A change to a verified canonical field still requires explicit review; title similarity cannot link records. Older schema-bound import packages must be regenerated from fresh schema/snapshots, not patched to bypass their hashes.

The tracked-archive inventory found `2026-09-17-2040_DEPLOY App Refactor.zip` in Git history/index and already deleted locally. This build preserves that deletion, does not rewrite history, and makes no exhaustive secret-audit claim. Private operational outputs and unrelated edits are retained.

## Per-file changes (`+` adds, `-` removes/replaces)

| File | Change |
| --- | --- |
| `src/app/AppShell.tsx` | + complete paging/counts/selection and truthful refresh state; - duplicated auth/types/helpers and unbounded client filtering |
| `src/features/auth/AuthGate.tsx` | + extracted session and sign-in boundary |
| `src/features/contracts/ResearchContext.tsx` | + persistent read-only qualifications |
| `src/features/contracts/save-lead-change.ts` | + write/commit/refresh sequencing |
| `src/features/contracts/contract-utils.ts` | + calendar and URL helpers; - UTC date-only interpretation |
| `src/features/contracts/types.ts` | + research context field |
| `src/lib/procurement.ts` | + queue RPC/detail loader and research mapping; - fabricated date fallback/full-payload list |
| `scripts/lib/research-persistence.mjs` | + immutable observation/amendment identity and final metadata validation |
| `scripts/lib/reviewed-batch.mjs` | + stable manual matching, evidence amendments and existing-lead request reasons |
| `scripts/inspect-access.sql` | + schema/grants/policy/function/view/realtime inventory |
| `scripts/inspect-access.mjs` | + private inventory writer |
| `scripts/verify-authenticated-access.mjs` | + read-only live anonymous/server API checks |
| `supabase/baselines/20260930_public_procurement.sql` | + sanitized current-state development baseline |
| `supabase/migrations/20260930000100_authenticated_procurement_reads.sql` | + authenticated shared reads; - anonymous grants/policies |
| `supabase/migrations/20260930000200_procurement_queue_pages.sql` | + invoker queue RPC and activity indexes |
| `supabase/migrations/20261001000100_queue_bounds_and_historical_dates.sql` | + null-bound validation and historical-date fallback |
| `src/app/AppShell.test.tsx` | + composed notes/auth/paging/single/bulk/stale-response tests |
| `src/features/contracts/contract-correctness.test.ts` | + dates/links and save failure regressions |
| `tests/procurement-mapping.test.mjs` | + research mapping and timezone checks |
| `tests/research-persistence.test.mjs` | + amendment, request-link and complete metadata checks |
| `tests/queue-sql.test.mjs` | + real-schema offline 1,005-row regression |
| `tests/integration/local-access.mjs` | + disposable real PostgreSQL/PostgREST gate |
| `tests/integration/access.test.mjs` | + opt-in disposable Supabase Auth lifecycle gate |
| `tests/integration/disposable-marker.sql` | + explicit isolated-target marker for hosted tests |
| `tests/integration/README.md` | + setup, target checks and coverage boundaries |
| `tests/fixtures/README.md` | + fixture reuse clarification; existing evidence unchanged |
| `package.json`, `package-lock.json` | + pinned minimal DOM testing dependencies and separate access commands |
| `vite.config.ts` | + TSX test discovery |
| `.gitignore` | + Supabase temporary-state exclusion |
| `.netlify/netlify.toml`, `.netlify/state.json` | - index tracking; local files retained |
| `supabase/.temp/cli-latest`, `gotrue-version`, `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref` | - index tracking; local files retained |
| `docs/PROCUREMENT-WORKFLOW.md` | + amendment/request-link flow, authenticated queues, concurrency and activation gates |
| `.agents/skills/arkansas-procurement-leads/references/database-persistence.md` | + amended persistence flow and current access guidance |
| `docs/reviews/2026-09-30-project-code-review.md` | + dated resolution pointer; historical findings retained |
| `docs/reviews/2026-10-01-remediation-build.md` | + this evidence/change report |
| remediation plan | + execution record; move to done on completed verification |

The working tree also contains prior-task changes; this table attributes only the remediation work, not every dirty file to this build. No commit or frontend deployment was made.
