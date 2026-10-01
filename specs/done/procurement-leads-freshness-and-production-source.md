# Procurement lead freshness and production-source diagnosis

## User prompt

> `$plan-code can you please troubleshoot why the website is not capturing the latest information from the database?`
>
> Evidence supplied: Supabase table screenshot (`Screenshot 2026-09-17 105329.png`) and website screenshot (`Screenshot 2026-09-17 105521.png`).

## Problem statement

The Supabase screenshot shows recent `procurement_leads` records with `created_at` and `updated_at` of September 17, 2026. The website shows an older-looking selected lead and a filtered result list. The app currently loads all contracts exactly once on `AppShell` mount; it neither reloads after that request nor subscribes to database changes. Consequently, a user can keep a tab open indefinitely without seeing later writes.

The screenshots do **not** yet prove that production is pointed at a different Supabase project or that the recent three rows are absent from the initial query:

- The website summary reports 324 open contracts.
- The completed September 16/17 intake import documents the expected canonical total as 324.
- The page's Lead-Related Date selector is set to `This week`, which limits the visible list to 78 leads even though the summary is calculated from all loaded leads.

Therefore implementation must first distinguish a stale client session from an environment/RLS/query mismatch using exact lead IDs and timestamps. It must not rely on matching totals or titles alone.

## Current implementation findings

- `src/lib/supabase.ts` creates a browser client from build-time `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `loadProcurementContracts` in `src/lib/procurement.ts` selects `procurement_leads`, orders by `created_at` descending, then maps the returned rows.
- The initial load effect in `src/App.tsx` calls `loadProcurementContracts` once with an empty dependency list. It has no manual reload action, window-focus refresh, polling, or Supabase Realtime subscription.
- The Lead-Related Date filter performs separate queries against `procurement_leads.updated_at`, stage changes, notes, and note edits. A failed activity query silently produces an empty ID set, which can make the filtered list look empty without exposing why.
- `procurement_leads` data is already a real database integration; this work extends freshness behavior only and does not add a new external integration.

## Objectives

1. Prove, with exact IDs and timestamps, whether the deployed page is reading the same project and records seen in Supabase.
2. Make newly inserted or updated leads appear without requiring a browser hard refresh.
3. Keep filters, current selection, and in-progress user context stable when data refreshes.
4. Expose a concise, actionable loading/freshness state rather than silently hiding a failed refresh or activity-date query.

## Non-goals

- No change to procurement ingestion, SAM searches, intake processing, or canonical-date prioritization.
- No mock data for procurement leads.
- No deployment, database migration, or production configuration change as part of this plan unless the diagnosis proves an environment mismatch and a separately approved deployment step is requested.
- Do not display project URLs, API keys, raw database errors, or user data unnecessarily in the UI.

## Phase 1 — Establish a reproducible source-of-truth comparison

1. In Supabase Table Editor, record the IDs, `created_at`, `updated_at`, title, source ID, and stage for the three latest `procurement_leads` rows. Export/copy only the fields needed for comparison; do not expose credentials.
2. In the deployed site, perform one hard reload while the Contracts queue is open. Record the total count and inspect the loaded lead IDs/timestamps through a temporary development-only diagnostic or browser network response. Compare the exact three IDs from step 1.
3. Confirm the deployed build's configured Supabase project is the intended linked project (`zreplhkoxswtzxlchtjf`) by comparing the non-secret project reference derived from its configured URL. Do not print the publishable key.
4. Test the app-equivalent read as the signed-in user: select the same fields from `procurement_leads`, ordered by `updated_at desc`, with a small limit. Record whether every comparison ID is returned. This separates RLS from UI mapping/filtering.
5. Verify browser DevTools Network for the initial `procurement_leads` REST request: status, response row count, requested project host, and the presence/absence of each comparison ID. A 200 response that omits a known row is an RLS/query/project issue; a response that contains it but UI does not show it is a client-state/filter issue.
6. Explicitly retest with Lead-Related Date set to `All dates` and then `This week`. For a September 17 timestamp, `This week` means Monday September 14 through Sunday September 20, inclusive, in the browser's local timezone. If the record is absent only under this filter, inspect the activity-date endpoint queries and timestamp/timezone boundary.

Decision table:

| Result | Diagnosis | Follow-up |
| --- | --- | --- |
| Latest IDs appear after hard reload | Stale open-tab state | Implement Phase 2 and Phase 3. |
| Latest IDs appear in network response but not visible with All dates | Client mapping/sorting/filtering defect | Fix the proven mapping/filter branch and add a regression test. |
| Latest IDs appear only with All dates | Lead-Related Date activity query/boundary defect | Fix its error handling or date bounds; preserve its inclusive behavior. |
| Latest IDs do not appear in network response | Wrong deployed env, RLS, or a different database | Correct the proven deployment variable/policy issue in a separately reviewed change, then repeat the comparison. |

## Phase 2 — Centralize safe contract reloads

1. Extract the existing mount-only `loadContracts` logic in `src/App.tsx` into a memoized `refreshContracts` function. It should use the existing `loadProcurementContracts(supabase)` read path and preserve its current mapping through `makeContract`.
2. Track `isRefreshing`, `lastSuccessfulContractSyncAt`, and a short non-sensitive refresh error. Keep the existing initial `contractsLoading` behavior for first load so the empty/loading states remain accurate.
3. Use an abort/sequence guard so a slower earlier request cannot overwrite a newer successful refresh. Do not clear existing contracts when a refresh fails.
4. Reload on initial mount and provide a compact `Refresh` action adjacent to the Contract Monitoring result count. While it runs, show a short loading treatment and disable repeated clicks.
5. After a successful reload, retain the selected lead if its ID still exists; otherwise select the first visible lead using the existing selection behavior. Retain queue choice, search, date filters, sort, checked IDs that still exist, notes draft, and sidebar mode.
6. Surface a failed background refresh as a concise retryable state near the result count. Preserve the full internal error for development logging only; do not convert a failed refresh into an empty result set.
7. Change the Lead-Related Date query failure path from `new Set()` to an explicit failed state. While its ID query is unresolved, avoid declaring “zero results”; show that the activity filter could not refresh and offer retry/reset. This prevents a transient query error from being indistinguishable from no matching leads.

Pseudo-code:

```ts
const refreshContracts = useCallback(async ({ background = false } = {}) => {
  const request = ++requestSequence.current;
  setRefreshError(null);
  background ? setIsRefreshing(true) : setContractsLoading(true);
  try {
    const result = await loadProcurementContracts(supabase);
    if (request !== requestSequence.current) return;
    setContracts(mapContracts(result.contracts));
    setSources(result.sources);
    setLastSuccessfulContractSyncAt(new Date());
  } catch (error) {
    if (request === requestSequence.current) setRefreshError(toSafeMessage(error));
  } finally {
    if (request === requestSequence.current) {
      setContractsLoading(false);
      setIsRefreshing(false);
    }
  }
}, []);
```

## Phase 3 — Keep an open queue current and verify it

1. Subscribe to authenticated Supabase Realtime `postgres_changes` events for `public.procurement_leads`. Debounce a burst of INSERT/UPDATE/DELETE events into one `refreshContracts` call. This avoids reproducing client-side mapping for partial realtime payloads and keeps sources/dates consistent with the normal load path.
2. Subscribe only while `supabase` is configured and the app is mounted; remove the channel and pending debounce on cleanup. Reconnect failures must leave manual Refresh available.
3. Add a lightweight `window.focus` revalidation as a fallback for missed realtime events or laptops that sleep. Deduplicate it against an active/recent refresh to avoid unnecessary requests.
4. Show a modest `Updated just now`/timestamp beside the Refresh action after a successful reload. It is information, not a competing call to action.
5. Before enabling Realtime in production, confirm `procurement_leads` is included in the Supabase Realtime publication and that the signed-in role may receive only rows it can already select. If it is not enabled, use the manual refresh plus focus revalidation initially; add a small reviewed migration only after confirming the deployed schema/policies.

## Testing strategy

- Add unit tests for the contract data reducer/mapper used by refresh: insert a newer row, update a row, and remove a row while retaining selection when possible.
- Test refresh failure with existing rows: rows stay visible, a concise error appears, and retry calls the same read path.
- Test overlapping refreshes: a late response cannot replace the newest result.
- Test selection, filters, sort, and checkboxes persist across a successful refresh; deleted selected records choose the next visible lead.
- Test Lead-Related Date query failure separately from “no matching activity” and confirm it does not show a false empty state.
- In a real authenticated browser session, insert/update one controlled lead in the intended project and verify the queue updates through Realtime (or focus/manual Refresh fallback), including its exact ID and `updated_at`.
- Run `npm run lint` and `npm run build`. Keep existing SQL/workflow tests unchanged unless shared code is extracted.

## Success criteria

- The production/source comparison identifies whether the page reads the expected project and returns the exact latest lead IDs.
- A lead inserted or updated in `procurement_leads` becomes visible in an already-open Contracts queue without a hard browser refresh.
- The app never silently turns a date-activity query or background reload failure into an empty list.
- Existing user context and filter choices survive data refreshes.
- The UI reports when it last received a successful contract refresh and provides one obvious next action: Refresh/retry.
