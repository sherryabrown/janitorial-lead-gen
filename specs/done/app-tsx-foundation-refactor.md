# App.tsx foundation refactor

## User prompt

> $plan-code let's refactor App.tsx. there are many things to do from here that will grow this code base so let's make sure we have a good foundation.

## Goal

Turn `src/App.tsx` from a 3,378-line all-in-one module into a small composition root with feature-owned components, state, and pure helpers. Preserve the current UI, contract date-filter behavior, Supabase-backed contract workflow, and mock-only Companies workflow exactly while creating clear seams for future work.

## Current-state findings

- `App.tsx` currently owns authentication, the application shell, production-contract loading and realtime refresh, activity-date lookups, selection and bulk-action state, contract and company workflows, the generation panel, all context panels, and formatting/filtering helpers.
- Contract behavior is live: it calls the existing `src/lib/procurement.ts` functions, merges refresh results so local notes and history are not lost, refreshes selected history, and subscribes to `procurement_leads` changes. The refactor must retain those safeguards.
- The date rules (`matchesContractDateRange`, `getDateRangeBounds`, `getApplicableContractDate`, sorting, and date labels) are currently embedded near the bottom of `App.tsx`, making them difficult to change or verify independently.
- Companies are intentionally local mock data. Do not add a Companies database integration as part of this refactor.
- The project has `lint` and `build` scripts but no component/unit-test runner. This plan adds focused test coverage only for pure business rules; it does not introduce a broad test rewrite.

## Target module boundaries

```text
src/
  App.tsx                              # auth gate and application composition only
  app/
    AppShell.tsx                       # top bar and top-level mode composition
    types.ts                           # shared shell-only types
  features/
    contracts/
      types.ts                         # contract, filter, history, source, and generation types
      constants.ts                     # status labels, options, and display configuration
      contract-utils.ts                # pure dates, filter, sort, mapping, and format helpers
      hooks/use-procurement-contracts.ts # load, refresh, realtime, and selected-history lifecycle
      components/                      # filters, list, actions, bulk stage, generate, and context panels
    companies/
      types.ts
      mock-companies.ts                # existing local data, still near Little Rock
      company-utils.ts
      components/                      # company filter, list, actions, and context panels
    shared/
      components/                      # reusable small presentational controls only
      types.ts                         # notes/history primitives used by both queues
```

Dependencies will point inward: `lib` and pure feature utilities have no React/UI dependency; feature components receive typed props and do not call Supabase directly; `AppShell` coordinates feature hooks and screen-level state; `App.tsx` only resolves auth state and renders the shell. Do not add a global state library, router, design system, or new backend endpoint for this work.

## Implementation phases

### 1. Establish stable domain and pure-rule modules

1. Move contract, company, shared-note/history, filter, generation, and display-configuration types out of `App.tsx` into the target feature modules. Export them from their owning feature rather than importing types from `App.tsx`.
2. Move status labels/configuration, stage-reason options, static Company mock records, and small factory helpers to their respective feature modules. Preserve all existing mock values and current Little Rock-area location assumptions.
3. Extract the contract date/filter/sort/format/mapping helpers into `features/contracts/contract-utils.ts`; extract equivalent company-only helpers into `features/companies/company-utils.ts`; keep generic set-selection helpers in `features/shared`.
4. Keep pure modules free of `useState`, DOM calls, Supabase imports, and JSX so date-policy changes are isolated from the screen.
5. Add a lightweight Vitest setup and unit tests for the established contract rules: applicable due/expiring date selection, `today`/`this-week`/`this-month`/custom bounds, lead-related activity filtering inputs, closed-status filtering, and deterministic sort ties. Use fixed clock values and existing representative data; do not use network or Supabase in these tests.
6. Run the new focused tests, lint, and build before moving stateful UI code so the extraction has a behavior baseline.

### 2. Extract the Contracts feature without changing its live workflow

1. Create `useProcurementContracts` for contract records, sources, initial/manual/debounced refresh, realtime subscription cleanup, focus revalidation, refresh status/errors, and refresh sequencing. Keep the existing “latest request wins” guard, 750 ms debounce, 15-second focus revalidation threshold, and error copy.
2. Keep selected-lead history as an explicit part of the Contracts feature lifecycle. Preserve the request-sequence cancellation, re-fetch on selection/contract refresh, and merge behavior that prevents a contract refresh from blanking notes or history.
3. Move contract-specific selection, filters, checked IDs, activity-date lookup/retry state, summaries, stage actions, bulk actions, note actions, and generate-panel state into a `ContractsWorkspace` container (or narrowly scoped hooks beside it). It should own the data it displays and expose only its selected context panel to the shell.
4. Move `ContractGeneratePanel`, `ContractFiltersBar`, `ContractList`, contract actions/bulk-stage controls, `ContractContextPanel`, `NotePanel`, `HistoryPanel`, `SourceSummary`, and their small contract-only helpers into `features/contracts/components/` with explicit prop types.
5. Maintain current interaction contracts exactly: filters keep the selected queue context, summary changes clear only relevant selections, refresh remains manual and automatic, stage/note mutations still call the existing procurement library, and the hidden-by-default Lead-Related Dates/Times link remains in the selected-contract side card.
6. Verify the contract UI manually for: initial loading/error, manual refresh, date filtering, selected contract retention, adding/editing a note followed by refresh, individual/bulk stage changes, and side-card date toggle.

### 3. Extract Companies and reduce the root to composition

1. Move Company filters, list, action controls, email preview, company context panel, and Company-only selection/action logic into `features/companies`. Keep its present behavior in-memory and mock-backed; do not introduce any production data call.
2. Move truly shared visual primitives (`ModeSwitch`, summary pill, generic filter select, empty state, and any unchanged reusable small controls) into `features/shared/components`. Keep CSS class names and markup stable unless a class must move with its component.
3. Introduce `app/AppShell.tsx` as the orchestration layer for the authenticated UI. It should retain only mode switching and layout decisions, render Contracts or Companies workspace components, and preserve selected-context behavior when changing modes.
4. Reduce `App.tsx` to auth/session initialization, auth-state messages, and rendering `AppShell`; remove no-longer-used imports and inline declarations.
5. Run lint, the focused unit suite, and a production build. Complete a visual smoke check of both queues at desktop and narrow widths, especially bulk bars, the context side card, summary strip, and error/empty states.

## Guardrails

- This is a behavior-preserving refactor, not a redesign. Preserve current copy, keyboard/accessibility semantics, CSS appearance, date decisions, and Supabase request shapes unless a compiler/test failure requires a corrective change.
- Do not alter database schema, RLS, Edge Functions, environment variables, or authentication policy.
- Do not move all state into a single replacement “god hook.” Prefer a data lifecycle hook plus feature-local UI state.
- Do not leave a circular dependency on `App.tsx`; extracted modules must import from feature/shared modules or `src/lib` only.
- Keep every phase independently buildable. Use small moves and explicit exports so future feature branches have clear ownership and fewer merge conflicts.

## Verification and acceptance criteria

- `src/App.tsx` is limited to authentication/bootstrap composition rather than feature implementation, with no contract/company business-rule helpers or large inline screen components.
- Contract date filters return the same results for each preset and custom bounds, with unit tests protecting the current policy.
- A refresh, realtime update, or focus revalidation does not erase notes or history in the selected contract’s side card.
- Contract and Company selection, queue counts, bulk actions, side panels, and existing mock-company behavior continue to work.
- Existing database calls remain centralized through `src/lib/procurement.ts`; no component reaches into Supabase directly.
- `npm run lint`, the added focused test command, and `npm run build` succeed.

