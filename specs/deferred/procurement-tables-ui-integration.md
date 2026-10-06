# Replace Obsolete Spin Tables With Procurement Tables

> **Deferred historical plan, October 5, 2026.** Procurement queue reads, stages, and notes already use production procurement data. The old Generate/spin migration discussed below was not completed and needs a separate product decision before any activation. This is not an active instruction for the known-source workflow repair.

## Problem

The current prototype was built around a `spin_` schema that is now obsolete. The Edge Function still reads and writes `spin_geography`, `spin_procurement_sources`, `spin_contract_generation_runs`, and `spin_contract_opportunities`, while the React UI keeps contract and source records in mock arrays and only calls the Edge Function for the Generate flow. The production Supabase schema now uses tables whose names begin with `procurement_`, so the app needs one consistent data contract before it can display and update those records.

The repository does not contain a migration or generated type file for the new `procurement_` tables, and the configured REST endpoint returned 401 when inspected with the local publishable key. The first implementation step must therefore capture the exact deployed table names, columns, relationships, enum/check constraints, and RLS behavior rather than guessing a rename. The existing `spin_` migration is historical and must not be rerun or used as the source of truth.

## Objectives

- Make the Generate flow and contract list use the deployed `procurement_` tables.
- Remove runtime dependencies on obsolete `spin_` tables while keeping the public Edge Function behavior stable unless a rename is required by deployment conventions.
- Replace mock contract/source data when the corresponding production table is available, with explicit loading, empty, and error states.
- Map database rows into the UI models without exposing raw database column names throughout `src/App.tsx`.
- Persist user-visible contract workflow changes only through fields and tables that actually exist in the new schema.
- Preserve the existing Little Rock-area prototype behavior, filters, queues, and next-action flow.
- Avoid creating or rerunning migrations that would alter already deployed data without a confirmed schema decision.

## Required Schema Inventory Before Coding

Obtain the deployed schema from the Supabase dashboard, SQL editor, or an authenticated schema export. Record exact names for the following concepts:

| Concept | Current obsolete reference | Information needed from new schema |
| --- | --- | --- |
| Geography/location lookup | `spin_geography` | table name, id type, city/county/ZIP/state columns, Arkansas filtering support |
| Procurement source registry | `spin_procurement_sources` | source id, agency/entity name, county/location, portal URLs, confidence/review fields, timestamps, unique key |
| Generation run/audit | `spin_contract_generation_runs` | run id, input fields, stage/status, counts, error and completion fields |
| Contract opportunity | `spin_contract_opportunities` | opportunity id, project/agency/category/location, dates, contact fields, value, source relation, workflow status, next action, deduplication key |
| User workflow history/notes | none in current migration | whether notes, status history, assigned actions, or outreach records have dedicated tables/columns |

Confirm whether names are simple replacements such as `procurement_sources` and `procurement_opportunities` or a different normalized design. Confirm which columns are writable through the browser role and which require the secret-backed Edge Function. Keep RLS policy targets and write boundaries aligned with the deployed schema.

## Implementation Plan

### 1. Establish a procurement data contract

Create a small typed adapter module under `src/lib/` for the exact deployed row shapes and UI mapping functions. Keep `App.tsx` working with its existing `ContractOpportunity` and `BidSource` models. The adapter should:

- normalize nullable database fields and timestamps;
- derive `dateType`, display labels, category, location, and fallback contact labels;
- map source confidence/review status into `BidSource`;
- preserve database ids and source ids for later mutations;
- reject or safely label rows with missing required fields instead of crashing the list.

Do not spread database-specific snake_case names into card components.

Ask any questions before proceeding with this phase.

### 2. Point the Edge Function at the new tables

Update `supabase/functions/spin_generate_contracts/index.ts` after the schema inventory. Replace every `.from('spin_...')` call, related row type, conflict target, and foreign-key assumption with the confirmed `procurement_` table and column names. This includes:

- geography lookup;
- generation-run insert and stage/status updates;
- source loading, verification updates, and discovered-source upsert;
- opportunity upsert and response mapping.

Keep the function name and request/response shape (`city`, `zip`, `county`, `sources`, `opportunities`, `runId`) unless deployment requires an explicitly coordinated function rename. Keep secret-key handling from the completed API-key security work. Return the same concise configuration, validation, and failure stages so the existing Generate panel remains usable.

If the new schema separates source metadata or opportunity details across related tables, perform the joins in the function and return the UI-shaped response rather than making the browser understand the normalized schema.

Ask any questions before proceeding with this phase.

### 3. Load production data in the UI

Add a data-loading boundary around the contracts and sources views. On initial contracts view and after a successful generation:

- query the confirmed opportunity and source tables, or use a function endpoint if RLS prevents safe browser reads;
- map rows through the adapter;
- merge generated records by database id without reintroducing duplicate mock rows;
- preserve the selected record when it still exists and choose the first available record when it does not;
- show concise loading, empty, and recoverable error states with the next logical action.

Keep company leads mock-backed unless the new schema explicitly includes company lead tables; this request concerns the procurement tables and should not expand scope into the separate companies workflow.

Remove `mockContracts` and `bidSources` only after their production replacements are wired. During the transition, use an explicit development fallback only if it is clearly gated and does not mask a production query failure.

Ask any questions before proceeding with this phase.

### 4. Persist contract workflow actions

Trace the existing contract actions (`interested`, `not-interested`, `applied`, `won`, `lost`, `withdrew`), notes, and history panel. Map each action to confirmed writable database fields or a confirmed related activity table. Implement a small mutation helper that:

- sends the database id and the minimal patch;
- updates local state optimistically only after the request succeeds, or rolls back on failure;
- appends history only when the write is durable;
- reports a concise failure without losing the user’s selected context.

If the procurement schema does not provide workflow/status, notes, or history storage, leave those interactions UI-only for this phase and document the missing persistence decision instead of inventing columns or a migration.

Ask any questions before proceeding with this phase.

### 5. Align security and generated artifacts

Verify RLS for reads and writes using the publishable browser key. Keep elevated writes and external source verification inside the secret-backed Edge Function. Add or update generated TypeScript types only if the repository’s conventions support them; otherwise keep the hand-written adapter types near the integration boundary. Do not add a migration that renames or drops the old `spin_` tables until production data retention and rollback are explicitly decided.

Update `supabase/config.toml`, function deployment references, and setup documentation only if the confirmed function/table names require it. Remove obsolete `spin_` references from executable code and active docs; historical specs and the old migration may retain them as history.

Ask any questions before proceeding with this phase.

## Testing Strategy

If needed, ask any questions you have before proceeding with this phase.

- Run a focused search for `spin_` references in `src`, active Edge Function code, and configuration. Any remaining reference must be historical or an intentionally retained function name.
- Run `npm.cmd run build` and `npm.cmd run lint`.
- Test the adapter with representative rows containing null dates, missing contacts, unknown categories, and review-needed sources.
- Exercise the Generate flow for city, ZIP, county, no-match, malformed response, and Edge Function failure cases.
- Verify initial loading, empty results, stale selected ids, duplicate generation results, and retry behavior.
- Verify each supported status/note action against the deployed schema or explicitly confirm it remains UI-only when no persistence field exists.
- Manually confirm browser reads use the publishable key, secret values never enter `VITE_` variables, and RLS permits only the intended operations.

## Success Criteria

If needed, ask any questions you have before proceeding with this phase.

- The exact deployed `procurement_` schema is documented in code types or a checked-in schema artifact.
- No executable browser or Edge Function code queries obsolete `spin_` tables.
- Generate and contract-list views display production procurement rows with correct dates, categories, sources, and statuses.
- Generated records do not duplicate existing rows and preserve selection/context.
- Supported workflow actions have durable writes with clear failure handling, or their lack of persistence is explicitly documented.
- Company lead mock behavior remains unchanged.
- Build, lint, and focused integration checks pass without rerunning the historical `spin_` migration.
