# 05C — History Submit and analytics overview verification

Implemented against `86c7120` on `codex/admin-county-trigger-ui`. No migration, deployment, commit or production workflow writes performed.

## Changes

Global History starts empty with today’s America/Chicago dates. Draft filters do not request results. Submit/Enter validates dates and snapshots the applied query. One Retry repeats the failed applied request/page. Versioned, account-scoped search entries preserve draft/applied filters, pagination and focus through run details; fresh History navigation starts a new empty search. Bare run links do not trigger a broad history query. Schedule-specific Runs retain automatic loading.

Global analytics reuses the compact outcome/category layout, seven-day default and exact saved-lead/issue destinations. Removed its Runs table, sort/order, pager and associated frontend state/imports/types. Existing backend reporting/history contracts remain. The existing `limit=1` option minimizes returned rows while the full selected cohort still powers aggregates and snapshot links. Unknown/partial historical usage remains explicit. No records or backend APIs were deleted.

## Verification

- Lint, TypeScript/production build: passed; existing chunk-size advisory remains.
- Frontend: 166 tests across 22 files passed, including eight submitted-history tests.
- Offline workflows: 379 passed. SQL import/rollback/protected-field checks passed.
- Native disposable PostgreSQL/PostgREST access suite passed without contacting production. Extended the 31-run fixture to prove limit=1 preserves full summary, coverage and snapshot; existing exact cohort, grouped-state/replay, validation and protected sales-field checks remain.
- Browser: submitted History/analytics, exact metric drilldowns, detail clarity/long breadcrumbs and Settings read-owner, catalog and schedule-activity suites passed at desktop/390/320 with keyboard and 200% zoom where applicable. Schedule list/editor county/state/SAM regression also passed, including immutable saved counties, floating actions and preserved drafts. Compact partial-metric links wrap within 320px.
- Read-only existing local app/backend: zero initial history reads; 42 submitted saved runs; two canonical saved-lead rows checked through exact links; return focus/page scope restored; fresh entry empty; compact Stats across 1440/390/320; zero workflow writes, failed reads or browser errors.

Receipts, logs and screenshots are retained locally under ignored `outputs/deployment/05C/` and `outputs/deployment/admin-ui/05C/`. Browser fixture writes are intercepted and never reach the application database.

## Limitations and next step

Historical missing metrics, actors, field differences and precise execution-start timestamps remain unknown rather than reconstructed. No product decisions remain for this child. Integrated Phase 6 and any authorized release remain separate. Netlify production is unchanged. No collection, schedule, import, budget, notes/stages, Companies or email-preview behavior was changed.
