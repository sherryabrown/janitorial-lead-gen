# 05C2 — One schedule execution table and clear metric completeness

Status: complete (2026-10-23); verified locally and against read-only saved data. Shared read migration applied with explicit approval; Render and Netlify preview release verified at `65a0d8e`. Parent: [Admin workspace](../todo/admin-workspace-redesign.md). Presentation amendment to accepted [05B](../done/05B-schedule-and-run-detail-clarity.md) and [05C](../done/05C-history-submit-and-analytics-overview.md). Can build independently of [05C1](../done/05C1-county-addendum-identity-and-duplicate-repair.md); recheck exact metric links after both land.

## Initiating request

User invoked plan-code on 2026-10-23: fix duplicate Clearwater imports (05C1), switch run date/time and Run ID ordering, combine the two shown execution tables, and clarify analytics `Unknown · # known`. Preserve unrelated behavior. Planning only; Netlify production unchanged.

Interpretation grounded in the attachment: the two tables are **Schedule Details → Overview → Runs** and **Execution attempts and skipped runs**, not two sections inside an individual Run Details page. Combine these schedule tables; retain Run Details Issues/Logs/Sources layout unchanged. Confirmed follow-up: global History rows show schedule name before Run ID, and Run Details headings show date/time before Run ID. Date/time becomes the primary run-opening link; the full Run ID remains secondary and available without losing breadcrumbs/context.

## Current evidence and reused components

- `ScheduleDetail.tsx` mounts `RunHistory` and separately a lazy occurrences-mode `ScheduleHistory`; both can show the same run. `RunHistory.tsx` orders Run ID before creation time. `ScheduleHistory.tsx` shows `Queued` occurrence state separately from a linked run's final outcome, explaining the screenshot's apparently conflicting statuses.
- `/v1/admin/history` in `admin-run-history.mjs` pages actual triggers; `/v1/schedules/:id/occurrences` in `procurement-schedules.mjs` independently pages occurrences with trigger links, public reason, baseline/snapshot and `reportRunHistory` projections. Merging only two fetched pages would omit or duplicate records and break filtering/counts.
- `Analytics.tsx` shared `amount()` prints `Unknown · N known` for incomplete metrics; `MetricLink` already links the verified known subset. `admin-analytics.mjs` uses `{value:null,known_subtotal,completeness,reason}` when selected runs lack complete settled import identities. `reporting-identities.mjs` defines completeness and exact outcome precedence. Do not change these calculations just to remove confusing labels.
- Reuse table CSS, read-owner/Retry, `formatLocal`, exact MetricLink scopes/snapshots, run navigation/focus storage, and existing bounded database helpers. Schedule-change History stays a separate audit view.

## Phase 1 — Unified, paginated schedule execution read

1. Introduce a narrowly scoped authenticated read contract, preferably `/v1/schedules/:id/activity`, backed by existing triggers/occurrences and `reportRunHistory`. Keep current endpoints/default responses intact for other callers. Reuse existing history filter validation, CT bounds, actor access and public reason/snapshot sanitization.
2. Define the server projection before UI work: one row per actual trigger joined to its matching occurrence, plus one row for an occurrence that created no run. Include schedule-linked/manual Run Now triggers that have no occurrence. Join by saved trigger/occurrence IDs, never same date/time. An orphan occurrence whose trigger cannot be read has an explicit unavailable-run state, not a fabricated skipped run. Validate against cross-schedule joins.
3. Page the combined relation in stable descending activity-time + stable row-ID order **before** hydrating reporting. For real runs use recorded run creation time; no-run attempts use effective/due/created time with labeled fallback. Return row kind/identity, total, next offset, clock basis and joined snapshot. Reuse an existing SQL read projection if suitable; otherwise add one private read-only SQL projection/RPC for this union and its bounded page. Do not fetch all history or zip independently paginated client lists. Existing service role/browser access boundaries remain.
4. Preserve current run outcome/date/origin/Run ID/type/geography filters. Run-only filters naturally exclude no-run attempts; expose a concise row-kind filter (`All activity`, `Runs`, `Attempts without a run`) so no-run records are intentionally reachable. In All activity, outcome filtering must explicitly distinguish run outcomes from attempt states rather than treating `queued` as a completed run outcome. Document these choices in DTO and UI help. CT date filters apply to the displayed row-time basis. No scheduling/dispatch/state mutation changes.
5. Apply a stable as-of/cursor boundary for paging if required to prevent new dispatches shifting repeated pages; preserve existing pending/abort/generation/error protections. Refresh uses one read owner; failed More retries the same applied page. Retain loaded rows during a partial read error.

## Phase 2 — Single schedule Runs table, date/time first

Use the existing schedule Overview placement and compact table style:

```text
Runs / execution attempts          [existing single read control]
[filters and More filters, as today; row kind within More filters]

Run date / ID / origin | Outcome | Validated leads | Recorded activity | AI usage | Details
Oct 22, 5:42 PM CT ↗   | Finished—some sources need attention | 1 new ... | ... | ... | [snapshot ▸]
Run 6bce...            | [specific blocker/link remains in Run Details]
Manual
Oct 21, 9:00 AM CT     | Skipped—overlapping run              | —       | —   | —   | [snapshot ▸]
No run created
```

- Date/time opens the same Run Details destination, keyboard-accessibly, with an accessible name including full Run ID. Keep full ID on its own wrapped secondary line; no truncation that hides identity. For attempts without a run, time is plain text and blocker/next action are visible; no dead run link.
- Linked real-run outcome is authoritative. Occurrence `Queued` means dispatch happened, not that a finished run is still waiting. Keep dispatch state/due/effective timing in an expandable row snapshot labeled as such; never replace or mutate its historical state to “finished.” Preserve missed intervals and source baseline/config/version details currently available.
- Remove the redundant Overview occurrences disclosure/table once all its information is reachable in row details. Do not delete schedule audit events, occurrence APIs, snapshots or history data. `ScheduleHistory` may retain changes mode; remove only unused occurrence UI code after usage search. Leave individual Run Details and Logs tables alone.
- Restore filters, page, originating date link focus and full breadcrumb path after opening a run/issue/Leads. Schedule runs auto-load as before; global History still starts empty/today and requires Submit. No new duplicated Refresh/Retry.

## Phase 3 — Plain-language completeness and acceptance

Confirmed follow-up: the user rejected “2 verified — Total unavailable” as the visible value. Use a proper metric label and a number, with completeness explanations in contextual help rather than appended to the count.

Use consistent labels such as **Verified new leads**, **Verified updated leads**, **Verified unchanged matches**, **Verified forecasts**, **Verified opportunities**, **Verified awards**, and **Recorded validation issues**. Example: `Verified new leads` followed by linked `2`. “Verified” describes saved import evidence, not a new manual approval step. Issue labels must not imply issues are imported leads. Keep existing layout, category overlap and outcome precedence.

| Stored completeness | Visible treatment |
| --- | --- |
| Complete, numeric value | Proper metric label + exact number; retain exact link |
| Incomplete, positive verified subset | Same verified metric label + known-subtotal number; link to exactly those records; info icon explains incomplete coverage |
| Incomplete, zero verified subset | Same verified metric label + `0` for the verified subset only; info icon explains incomplete coverage; no false complete-total claim |
| No usable measurement/subtotal | Proper label + `—`; contextual help explains why; never invent a number |
| Not applicable | Proper label + `—`; contextual help says “Not applicable” and why |

Do not render “Unknown · N known,” “N verified,” “Total unavailable,” or other qualifier text beside/under each number. Put concise completeness/reason text in an accessible info control (hover, keyboard focus and tap), using the existing InfoTooltip. For incomplete results: “Only verified saved records are counted. Some selected runs have missing or unfinished import records.” Include actual coverage/reason where available; distinguish unfinished work from missing historical evidence only when the backend supports that distinction. Retain existing expandable coverage details without adding a prominent warning paragraph.

Keep backend `value:null`, `known_subtotal`, completeness and exact snapshot/member contracts unchanged. A displayed verified-subset `0` is not a substitution of zero for an unknown full total: it must come from the measured `known_subtotal` and the verified metric label. Never claim complete coverage, convert an absent measurement to zero, or sum overlapping categories/issues. Positive displayed counts link to exactly the displayed cohort; zero-subset navigation must not open unrelated Leads. A failed request remains an error/Retry, never a numeric zero.

Where cost uses an incomplete ledger subtotal, use **Recorded AI spend** plus its numeric currency amount and contextual completeness help, not an unavailable-total suffix. Retain unknown/not-comparable credits, units and reservations honestly; use `—` when no usable value exists. Do not invent credits, rates or backfilled usage. These are presentation changes, not altered calculations or coverage.

- Unit/API/native tests: run+occurrence yields one row; no-run skipped/blocked attempts; manual schedule run without occurrence; pending/running/finished/orphan; linked occurrence still queued while run finished; stable ordering/ties; more than one page with no duplicates/omissions; CT/DST boundary filters; run-only filters/row kinds; exact totals; failed page Retry/abort; public projection/privacy. Additive SQL permissions checked with `npm run test:access` if SQL is introduced.
- Component tests: date first/full ID secondary, valid accessible link and return focus; one Overview table; snapshot/missed interval still reachable; schedule change audit unchanged; global Submit unchanged. Metrics cover complete zero/positive, partial positive/zero, no import evidence, pending results, category overlap, exact links, issue destinations, unknown cost/credits and last-seven-day default. Assert label-plus-number presentation, no appended completeness phrases, measured subset zero versus absent measurement, and info help via hover/focus/tap. Keep 05A canonical/snapshot contracts, including 05C1 repair regression after both builds.
- Browser: desktop 1440, 390/320 mobile, keyboard and 200% zoom; long IDs/names/full breadcrumbs; expanded snapshots; real/no-run mixed rows; pagination/error/retry; return to original date link, filters and page; no horizontal page overflow. Compare screenshot against the sketch above and current brand CSS.
- `npm run check` and relevant existing history/detail/analytics/read-control/catalog suites. Read-only real-data verification against the screenshot's run `6bcefdf8-bc4d-4f30-be93-b0a3656abbf2`: a single row with final run outcome, dispatch snapshot still available, and exact lead drilldowns. No live research or schedule edits needed. Verify unknown totals are understandable for existing incomplete historical runs.
- Preserve collection, scheduling/import logic, validation/duplicates/notes/stages, AI budgets, Companies/email previews and all unrelated UI. Keep provider-access work separate. Record changes/deletions/tests/limits and proposed commit message; move to done only on acceptance. No release authorized by planning; Netlify production unchanged.

## Success criteria and decisions

One accurate schedule execution table retains every real run and no-run attempt, with date first and full ID secondary; no redundant dispatch/run outcome confusion. Metrics use proper labels and numbers; accessible contextual help explains incomplete coverage without cluttering values or misrepresenting totals. All exact links, return context and global History Submit behavior remain intact. No unresolved product decision; implementation must not silently broaden identity or scheduling semantics.


## Completion

Implemented all three phases. See [acceptance report](../../docs/reviews/2026-10-23-schedule-execution-and-metric-clarity.md) for changes, cleanup, tests, read-only screenshot-run verification, migration and release order. No business-data changes or hosted deployments performed. The user subsequently approved the private read migration and local backend restart; both passed. Netlify production unchanged. Runtime commit: `65a0d8e` — `feat: unify schedule activity and clarify metrics`.

Hosted release completed with subsequent explicit user authorization: Render `dep-dbdq8jfavr4c7391afeg` first, Netlify preview `6adba51409181c06a791e070` second, both at runtime `65a0d8e`. Authenticated API/real-data browser acceptance passed; Netlify production remains locked at `6ad583d1b9bb1b307abcf1fd`. See the acceptance report.
