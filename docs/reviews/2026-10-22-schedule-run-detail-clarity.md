# Schedule and run detail clarity — 05B

Scope: the schedule/run presentation amendment. Existing collection, scheduling, import policies, budgets, protected sales fields, Companies and email previews remain unchanged. No migration, deployment, outreach or new collection was performed.

## Changes

- Shared breadcrumbs preserve the actual workspace origin. A schedule ancestor is shown for a run only when its saved membership agrees with the navigation scope. The legacy `overview` run section remains compatible and displays Issues.
- Schedule setup and run attributes start collapsed. Refresh preserves an opened disclosure. Runs use full, wrapped Run IDs followed by creation times; the latest run remains in the same list.
- Schedule History shows configuration/lifecycle events, readable before/after values, actors and versions. Scheduler-only events are excluded. Execution attempts and skipped runs remain accessible from a disclosure under Runs; their reads start when opened.
- Schedule totals use compact result metrics, category links and separate source/route/validation measures. Exact 05A metric drilldowns remain in use; overlapping measures are not combined.
- Issues separates source, validation and execution problems. Sources uses responsive saved-check tables with location/category, outcome, blocker and next action. Existing request readers, evidence panels, recovery handlers and import guards are reused.
- Explicit manual/provider barriers keep their specific instruction and evidence access without an ineffective research retry. Row action groups identify the affected source/category. Logs columns and pagination are unchanged.

## Verification

Evidence is saved locally under ignored `outputs/deployment/05B/` and `outputs/deployment/admin-ui/05B/`.

- Lint and TypeScript/Vite build.
- Complete frontend suite: **158 passed across 21 files**, including added source-deduplication/manual-barrier, audit and breadcrumb checks and updated history/focus assertions.
- Complete offline workflow suite: **379 passed**, bounded concurrency 2.
- SQL fixtures passed: validation, duplicate handling, replay, rollback, canonical links and protection of user sales edits.
- Isolated built-app browser acceptance: 1440/390/320 widths, keyboard activation and return focus, schedule/run 200% zoom, full Run ID wrapping, disclosure defaults/refresh persistence, configuration changes versus execution attempts, Issues/Sources tables and unchanged Logs headers. Browsing triggers no workflow writes.
- Read-only local-backend checks sampled two saved schedules. Each returned three audit events and one attempt/run; their selected requests returned 54 and 56 source tasks. No historical field diffs existed in these samples, and no values were invented. No workflow writes were made.
- No SQL change was introduced; this phase reuses the already-applied 05A audit contract. Disposable audit fixtures run in the existing workflow suite.

## Limits and next scope

- Older audit rows without stored diffs/actors remain explicitly unavailable. The UI does not reconstruct them from current configuration.
- The existing request DTO has no per-task checked timestamp. Saved source rows say checked time is unknown; run creation and job-update times are not substituted.
- Missing identity coverage, categories or AI usage remain unknown. Known subtotals retain exact membership links.
- Global History's today/Submit behavior and the global analytics overview changes belong to 05C; they are intentionally not implemented here.
- No new product decision is required. Release remains separate; Netlify production is unchanged.

Proposed commit: `feat: clarify schedule and run details`.
