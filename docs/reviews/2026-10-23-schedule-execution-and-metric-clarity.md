# 05C2 — Schedule execution and metric clarity acceptance

Accepted 2026-10-23. Initially implementation-only; the user subsequently authorized the shared read migration and local backend restart. Both are now applied/verified. Runtime `65a0d8e` is now committed/pushed and released to Render followed by the Netlify preview; production Netlify is unchanged.

## Changes

- Schedule Overview has one server-paginated execution table. Date/time opens Run Details; the full Run ID remains secondary. Real runs use their final run outcome; immutable dispatch state remains in an expandable snapshot.
- The additive authenticated `GET /v1/schedules/:id/activity` reads a private security-invoker union view. It joins saved IDs within the same schedule, includes manual schedule runs without occurrences, and identifies unreadable linked runs separately from no-run attempts. Filtering and stable ordering happen before bounded reporting hydration.
- CT date filters use the displayed activity time. Run outcome/ID/type/geography/origin filters select real runs; separate activity-kind and attempt-state filters expose no-run attempts. An as-of creation boundary prevents later insertions shifting paged reads. Retry retains loaded rows and retries the same failed page/boundary.
- Dispatch details retain due/effective dates, version, missed intervals, scope, categories and sanitized source baselines. Specific no-run reasons have concise next actions.
- Analytics uses verified/recorded labels and numbers. Incomplete metrics display the measured saved-record subtotal, including measured zero; absent measurements and non-applicable values display a dash. Accessible info controls explain coverage. Positive exact cohorts and existing complete-zero drilldowns retain their scoped links; an incomplete zero does not navigate to unrelated Leads. Cost displays recorded ledger spend with coverage help.

## Cleanup and preservation

Removed the second Overview occurrences table and its unused frontend loader/paging mode. Schedule History still displays configuration/lifecycle audit events; occurrence APIs and all saved records remain. The existing reporting, timing, sanitized occurrence projection, metric navigation, read ownership, CSS and InfoTooltip services are reused. No stored data was deleted.

Collection, scheduling/dispatch behavior, automatic imports, duplicate/validation guards, notes/stages, AI policy/budgets, Companies, email previews, global History Submit semantics and individual Run Details tabs are unchanged. The migration adds only a private read view and supporting indexes; it changes no collection data or permissions granted to browsers.

## Verification

- Full frontend suite: **167 tests / 23 files passed**. Final affected-suite rerun: **60 tests / 7 files passed** after filter/abort and label adjustments.
- Full offline workflow suite: **386 passed**. Additional focused activity HTTP/projection tests: **2 passed**. SQL import/replay/concurrency/protected-sales-data suites passed.
- Native PostgreSQL 15 + PostgREST passed, including the final activity view, three pages/55 distinct attempts, CT/DST boundaries, exclusion of inserts after the paging boundary, and anon/authenticated denial with backend-only access. Existing native manual/scheduled automatic imports, audit, analytics and grouped state behavior also passed.
- Lint and TypeScript/Vite production build passed. Existing large-bundle advisory remains.
- Browser acceptance passed at 1440, 390 and 320 pixels, keyboard and 200% zoom: long Run ID, full verified breadcrumbs, one mixed activity table, wide expanded snapshot evidence, exact return focus, failed-page retry and accessible completeness help. Global submitted-History and exact lead/issue drilldown browser regressions passed. No page errors or workflow writes.
- Read-only shared-data acceptance evaluated the new relation as a SELECT without installing it. Screenshot run `6bcefdf8-bc4d-4f30-be93-b0a3656abbf2` produces exactly one run row: saved run state `needs_review`, dispatch state `queued`. Its existing backend report has one verified new lead, and its exact member drilldown returned that one lead. No research, schedule changes, AI calls, shared schema changes or data repairs were performed.
- Private receipts/logs: `outputs/deployment/05C2/`; screenshots and browser receipt: `outputs/deployment/admin-ui/05C2/`. Fixture and private operational outputs are not committed.

## Release and limits

`supabase/migrations/20261023000200_schedule_activity_read.sql` was subsequently applied with explicit user approval. The local backend was restarted using the existing guarded import/rehearsal and AI settings; activity and run endpoints return 200. Hosted release subsequently passed: Render first, then Netlify preview, both at runtime `65a0d8e`. Old endpoints remain compatible. **Netlify production is unchanged**.

Read rollback, if needed: return callers to the old endpoints, then drop `procurement_schedule_activity` and its three named supporting indexes. No business data rollback is needed. Historical metrics remain incomplete where import identities or actual usage were never recorded; presentation does not fabricate or backfill them. Phase 6 integrated release acceptance remains separate.

Runtime commit: `65a0d8e` — `feat: unify schedule activity and clarify metrics`.


## Approved local repair and label order follow-up

The local browser exposed a coordinated-release gap: the new frontend was calling an older local backend (activity 404), and the shared read view was absent. The run endpoint itself returned 200; saved run data was intact. Automatic approval review initially rejected the shared schema change because it had been explicitly left pending. After the user explicitly approved the migration and local restart, the private view/index migration was applied and verified (anon/authenticated denied, existing backend read access only). No lead rows were changed. The local backend was restarted; its activity and run reads both returned 200. No Render or Netlify deployment occurred.

The confirmed presentation order is now: global History rows show the schedule name first and full Run ID underneath; schedule Runs rows show date/time first and full Run ID underneath; Run Details headings show date/time first and full Run ID underneath. Standalone rows retain their run identity when no schedule name exists. Navigation still opens the saved Run ID.

Real local browser verification on the requested schedule loaded two saved runs and opened screenshot run `6bcefdf8-bc4d-4f30-be93-b0a3656abbf2`. Its Issues, 50-row first Logs page and Sources tables are visible. Private evidence: `outputs/deployment/05C2/local-real-run.png`, migration receipt and local-repair verification logs.

Follow-up verification passed: full frontend suite **168 tests / 23 files**, lint/build, updated activity desktop/mobile/keyboard/200% zoom acceptance and submitted-History browser regression. The real local History table displays schedule names above saved Run IDs. No commit or hosted deployment performed.


## Hosted release acceptance

User explicitly authorized commit/push and Render-first, preview-second release. Runtime commit `65a0d8e583d8a00325d34370ec077e638f3b50c7` was pushed to `codex/admin-county-trigger-ui` with `feat: unify schedule activity and clarify metrics`. Render deploy `dep-dbdq8jfavr4c7391afeg` is live at that exact commit. The private activity view was already applied during the approved local repair. Render configuration hash is unchanged (`7c6e8222f163f9bdeba42b8a87921d0d2f72edfc59511620d29addb317c40903`).

After authenticated backend acceptance passed, Netlify draft deploy `6adba51409181c06a791e070` updated `https://bonfire-review--janitorial-lead-gen.netlify.app`. All five deployed HTML/JS/CSS assets match the local build. Production deploy `6ad583d1b9bb1b307abcf1fd` remains unchanged and locked.

Authenticated live acceptance passed: schedule activity paging and the exact saved run project to one row, dispatch state remains queued, current run outcome is retained, history/reporting/catalog reads succeed, private views deny browser access, and preview CORS is correct. Browser acceptance against real saved data passed at 1440/390/320 pixels, keyboard and 200% zoom: Issues/Logs/Sources, date-first run headings, schedule-name-first global history, empty initial History/Submit and return focus. Twenty-five Admin API responses passed; zero workflow mutation requests and zero page errors. No research or schedule edits were initiated.

Receipts and real-data screenshots remain private in `outputs/deployment/05C2-release/`. This completion documentation is a separate documentation-only follow-up; deployed runtime remains `65a0d8e`. Phase 6 integrated acceptance remains separate.
