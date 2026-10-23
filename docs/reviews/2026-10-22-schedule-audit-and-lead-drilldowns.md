# Phase 05A — Schedule audit and exact lead drilldowns

Scope: the updated schedule-results amendment; no collection, scheduling policy, import approval, validation, budget, note/stage, Companies or email-preview behavior change. No live research or deployment performed.

## Implementation

- Additive migration `20261022000100_schedule_change_audit.sql` enriches existing schedule events inside their original transaction. Allowlisted canonical before/after values cover name, timing, categories/windows, work, state membership and lifecycle. A transaction-local map connects row changes to existing event writers, including system inactivity and never-run deletion; consumed entries and transaction rollback prevent stale/replayed metadata. No new table/RPC, historical backfill or client-controlled difference payload.
- Existing authenticated schedule-events DTO now includes sanitized differences. Historical sparse events say Details not recorded. Occurrences remain available; the broader change-history/layout revision remains 05B.
- Extracted `reporting-identities.mjs` from the existing analytics aggregation. Reports, member selection and per-run identity guards share the verified receipt outcomes, precedence and as-imported categories. Ordinary totals do not download all identities.
- Authenticated read-only `GET /v1/admin/metric-members` supports bounded pages of exact lead IDs or matched issue references. Full report snapshots include member identities; per-run identity hashes detect identity/category drift even with unchanged counts. Scope/date/category validation, expected-count guards and existing safe read bounds apply. No worker wake or mutations from these reads.
- Shared metric links cover last-run schedule counts, schedule totals, run counts/categories and analytics totals/categories. Known zero opens an empty cohort; partial links identify known records; aggregate-only old receipts have no invented identity links. Issue counts open matching issue details, blockers and next actions, with the associated saved run/request selected for further investigation.
- Leads uses its existing canonical mapper, source cache, list/detail/edit controls and browser JWT/RLS. A visible report filter loads only verified IDs across all sales stages, preserving closed Leads. Missing/inaccessible records are reported; changed/unavailable membership never falls back to a general queue. Clear/Back restores context. Existing normal navigation retains its queue-selection behavior. Owner sign-out clears report navigation.

## Verification

- Lint and TypeScript/Vite build: passed. Existing large-chunk warning remains; no new chunk-splitting scope.
- Frontend: 152 tests across 20 files passed, including exact scoped membership, closed stages, no fallback on changed reports, unknown/zero/partial behavior, issue routing/focus and existing notes/stage/draft/navigation protections.
- Full offline workflow suite: 379 passed. After extracting shared identity logic, all 23 affected analytics, schedule-reporting, audit and scheduler tests passed again.
- SQL suites passed, including actual rollback, concurrent canonical/intake changes, protected sales fields and replay checks.
- Native disposable PostgreSQL 15/PostgREST suite passed with the final migration/shared identity logic: configuration/lifecycle changes, system inactivity, no-op/replay, stale versions, deletion history, transactional rollback, authenticated reporting, grouped-state reporting and changed identity guards. Existing automatic SAM/county import and duplicate/protected-field acceptance remained intact. Production contacted: false.
- Browser acceptance uses the existing harness against the built application and intercepted fixture APIs. Widths 1440/390/320, keyboard, exact all-stage Leads, unavailable record, Back/clear, issue details/focus, and stale-report failure. No workflow mutations. Final built-browser acceptance passed; see ignored `outputs/deployment/admin-ui/05A/verification.json` and screenshots. All new lead/issue elements inspected at narrow and desktop widths.
- Visual review found a clipped narrow-screen issue action; scoped wrapping and a bounding-box regression assertion were added. The final built-browser run passed with this assertion.

Runner notes: simultaneous native/PGlite/browser jobs caused occasional unchanged five-second schedule-editor test timeouts. Sequential frontend reruns passed without increasing timeouts or weakening assertions. Fresh development-fixture servers stalled serving CSS, while the existing local development server served it normally; added an optional `--built` mode to the existing harness and verified the real built CSS rather than omitting stylesheet checks. Task-owned logs/temp directories are under ignored `outputs/deployment/admin-ui/05A-verification/`.

## Release requirements and limitations

No product decision remains for 05A. Valid leads still automatically import into `procurement_leads`; collection/validation problems are issues, not leads awaiting approval. No import engine was rewritten.

Old events cannot supply before/after data that was never stored. Old aggregate-only import receipts cannot supply exact identities; these counts remain visibly identity-unavailable. Reporting remains bounded and incomplete historical metadata remains unknown/partial.

For a separately authorized release, apply only the tested audit migration, deploy matching Render, then the approved Netlify preview. RPC signatures and existing responses remain compatible; audit metadata is additive. Old report snapshots may require reloading after the stronger identity fingerprint is released. Rollback uses compatible previous backend/preview assets; retain additive audit data/migration and canonical Leads. Do not roll back lead data, apply unrelated source packages or publish/unlock Netlify production.

Proposed commit: `feat: audit schedule changes and link verified leads`.

## Local follow-up — report links returned 404

The local frontend on port 5173 was calling the newly added metric-members route, but the already-running backend on port 8080 still had the earlier code loaded. Authenticated reproduction returned 404 while the older analytics endpoint returned 200. Restarted only the verified local workflow-server process with current code and existing guarded configuration. No shared migration, deployment, AI-budget change or new research request was made. The audit migration is separate from this links failure: links require current backend code; future before/after auditing additionally requires the migration.

Added narrow metric-read error handling and a regression test: missing endpoints and read errors no longer say a schedule mutation was unconfirmed. Twenty-five affected frontend tests, lint and build passed.

Real saved-data browser acceptance against the local app passed: two exact saved Leads opened, source collection issues opened (68 distinct sources in the selected seven-day report, first 50 on page one), 33 route gaps opened, and a source issue selected its associated saved run/request. Validation issues remained unknown rather than becoming a fabricated zero/link. All three metric reads returned 200; zero workflow mutations and script errors. Safe receipts/screenshots remain ignored under `outputs/deployment/admin-ui/05A-followup/`. Local backend left running on 8080; Netlify production unchanged.

## Authorized release preflight

The user authorized commit/push with `feat: audit schedule changes and link verified leads`, Render first, then the existing Netlify preview, preserving Production Netlify. The user reported the audit migration already applied; read-only hosted verification confirmed all three function bodies match the reviewed migration and both triggers are enabled. No migration was reapplied. Release and live acceptance receipts are retained under ignored `outputs/deployment/05A-release/`; final deployment status is reported separately.
