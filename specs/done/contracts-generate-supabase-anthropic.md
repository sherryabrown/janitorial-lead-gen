# Contracts Generate Tab With Supabase And Anthropic

## Problem

The Contracts view needs a new `Generate` entry point that starts real contract monitoring for Arkansas cities, ZIP codes, or counties. This is the first real integration pass: the UI should call Supabase, use the existing `spin_geography` table to resolve geography, maintain procurement source URLs, verify/fill missing URLs, and capture bid/contract opportunities. Anthropic should be used only when deterministic checks are not enough, and the full prompt in `prompts/procurement-bid-site-finder.md` must be included in the Anthropic request.

Keep the existing UI prototype behavior where it is not touched by this work, but do not back this new Generate workflow with mock data.

## Current Repository Notes

- The app is a Vite React app with the main UI in `src/App.tsx`.
- Contracts and Companies are selected by `WorkMode`.
- Contract status pills are built from `contractSummary` and rendered through `SummaryPill`.
- Contract filters currently default to `status: 'open'`.
- Contract opportunities and bid sources are currently mock arrays in `src/App.tsx`.
- There is no `supabase/` folder and no Supabase client dependency yet.
- Existing dependencies include React, Vite, TypeScript, and `lucide-react`.
- `prompts/procurement-bid-site-finder.md` exists and defines the Arkansas bid registry discovery prompt and output shape.

## Decisions

- Add `Generate` as a contracts-only tab/entry point, not as a contract status.
- Place `Generate` immediately before `Open` in the Contracts summary row, separated from `Open` by a visible `|`.
- Use the project ref from the dashboard URL to derive the Supabase API URL: `https://zreplhkoxswtzxlchtjf.supabase.co`.
- Keep Anthropic calls inside Supabase Edge Functions only. Never expose `ANTHROPIC_API_KEY` in the browser.
- Every new table, migration-owned enum/type, and Edge Function created for this project must start with `spin_`.
- Keep `spin_geography` as the source of truth for geography lookup. Add separate source/opportunity/run tables rather than overloading the geography table.
- Prefer one Edge Function, `spin_generate_contracts`, for the first pass so the UI has one simple backend action to call.
- Use deterministic resolution first: geography lookup, existing source URL lookup, HTTP status checks, content-type checks, procurement keyword checks, and known Arkansas/statewide portal patterns.
- Use Anthropic only for ambiguous or missing procurement source discovery. Include the full contents of `prompts/procurement-bid-site-finder.md` in the system or first user message, plus the normalized geography and any existing source registry rows.
- Use Anthropic web search if the configured Anthropic account supports it. If it is unavailable, return a clear `needs_human_review` result rather than fabricating URLs.

## Data Model

Before writing migrations, inspect the existing `spin_geography` schema in Supabase. Do not assume column names beyond the table name.

### Suggested `spin_geography` Additions

Only add these if the current table does not already provide equivalent fields:

- `state_code text` with `AR` available for Arkansas filtering.
- `city text`
- `county text`
- `zip_code text`
- `geography_type text` for `city`, `county`, `zip`, or similar.
- normalized/search columns if lookup is currently hard to do reliably.

Avoid storing procurement URLs directly on `spin_geography` unless the table already has a clear one-row-per-jurisdiction shape. URLs change independently from geography and should have their own verification metadata.

### New Tables

Create migrations for:

```sql
create table spin_procurement_sources (
  id uuid primary key default gen_random_uuid(),
  geography_id uuid references spin_geography(id),
  entity_name text not null,
  entity_type text not null,
  county text,
  state_code text not null default 'AR',
  portal_type text not null default 'unknown',
  bids_url text,
  awards_url text,
  forecast_url text,
  access text not null default 'public',
  confidence text not null default 'low',
  needs_human_review boolean not null default true,
  verification_status text not null default 'needs-review',
  verification_note text,
  found_by text not null default 'deterministic',
  last_checked_at timestamptz,
  last_verified_at timestamptz,
  raw_registry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

```sql
create table spin_contract_generation_runs (
  id uuid primary key default gen_random_uuid(),
  geography_id uuid references spin_geography(id),
  input_city text,
  input_zip text,
  input_county text,
  normalized_location text,
  status text not null default 'queued',
  stage text not null default 'received',
  error_message text,
  source_count integer not null default 0,
  opportunity_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
```

```sql
create table spin_contract_opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references spin_procurement_sources(id),
  geography_id uuid references spin_geography(id),
  project_name text not null,
  agency_name text not null,
  category text not null default 'Government',
  location text,
  contact_name text,
  contact_phone text,
  contact_email text,
  due_at timestamptz,
  expires_at timestamptz,
  estimated_value text,
  status text not null default 'new',
  source_url text,
  external_id text,
  content_hash text,
  summary text,
  next_action text not null default 'Review bid packet',
  raw_payload jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, content_hash)
);
```

Add indexes for geography lookup, source verification, opportunity status, due/expiry sorting, and duplicate checks:

- `spin_procurement_sources(geography_id)`
- `spin_procurement_sources(state_code, county)`
- `spin_contract_opportunities(status)`
- `spin_contract_opportunities(due_at)`
- `spin_contract_opportunities(expires_at)`
- `spin_contract_opportunities(source_id, content_hash)`
- `spin_contract_generation_runs(geography_id, created_at desc)`

### RLS And Secrets

- Enable RLS on new tables.
- Let the frontend read the tables only through policies appropriate to the app's auth state.
- Let `spin_generate_contracts` write using a server-side Supabase secret key.
- Store secrets in Supabase Edge Function secrets:
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL`
  - Supabase-provided `SUPABASE_URL`
  - Supabase-provided secret key env var, preferring current Supabase secret key support and falling back to `SUPABASE_SERVICE_ROLE_KEY` if needed.

## Edge Function

Create `supabase/functions/spin_generate_contracts/index.ts`.

Request body:

```ts
type GenerateContractsRequest = {
  city?: string;
  zip?: string;
  county?: string;
};
```

Response body:

```ts
type GenerateContractsResponse = {
  runId: string;
  status: 'completed' | 'needs-review' | 'failed';
  stage: string;
  normalizedLocation?: string;
  sources: Array<{
    id: string;
    entityName: string;
    portalType: string;
    bidsUrl?: string | null;
    awardsUrl?: string | null;
    confidence: 'high' | 'medium' | 'low';
    needsHumanReview: boolean;
  }>;
  opportunities: Array<{
    id: string;
    projectName: string;
    agencyName: string;
    category: 'School' | 'Government' | 'Medical';
    location?: string | null;
    contactName?: string | null;
    dueAt?: string | null;
    expiresAt?: string | null;
    estimatedValue?: string | null;
    status: 'new';
    sourceUrl?: string | null;
  }>;
  message?: string;
};
```

Function flow:

1. Validate that at least one of city, ZIP, or county was supplied.
2. Normalize input and restrict this first pass to Arkansas.
3. Query `spin_geography` for matching city, ZIP, and/or county.
4. Insert a `spin_contract_generation_runs` row with `stage = 'geography_lookup'`.
5. Load existing `spin_procurement_sources` rows for the resolved geography/county.
6. Verify existing URLs:
   - Fetch with a conservative timeout.
   - Follow normal redirects.
   - Treat 2xx HTML/PDF responses as reachable.
   - Check procurement-like terms: bid, bids, procurement, purchasing, solicitation, RFP, RFQ, awarded, contract, vendor, IonWave, Ariba, BidNet, Bonfire, OpenGov.
   - Update `verification_status`, `last_checked_at`, `last_verified_at`, and `verification_note`.
7. For missing or invalid source surfaces, call Anthropic:
   - Include the complete contents of `prompts/procurement-bid-site-finder.md`.
   - Include resolved geography JSON from `spin_geography`.
   - Include existing source rows and verification failures.
   - Ask for the prompt's `arkansas-bid-registry.json` output shape.
   - Permit web search/web fetch if available for the Anthropic API key.
8. Validate Anthropic output before writing:
   - Parse JSON.
   - Require official or plausible government/school/known portal sources.
   - Reject URLs with unsupported schemes.
   - Re-fetch candidate URLs and score confidence.
   - Mark medium/low confidence or gated rows `needs_human_review = true`.
9. Upsert `spin_procurement_sources`.
10. Capture opportunities from verified bid URLs:
   - Start with deterministic HTML table/list parsing and known portal pages.
   - Extract project name, agency, due date, expiry/award date if available, contact info, source URL, and summary.
   - Classify category as School/Government/Medical from entity type and content.
   - Use `content_hash` to deduplicate.
   - Insert new rows into `spin_contract_opportunities` with `status = 'new'`.
11. Update the run row with counts and final status.
12. Return source and opportunity summaries to the UI.

Failure behavior:

- Invalid/multiple geography matches: return a precise message for the UI and do not call Anthropic.
- Anthropic unavailable: persist the run as `needs-review` if deterministic sources were updated, otherwise `failed`.
- URL fetch blocked/gated: persist the source with `needs_human_review = true`.
- Bad JSON from Anthropic: store run error and return `needs-review`; do not write unvalidated URL data.

## Prompt Handling

The Edge Function runtime cannot assume access to the repository root. During implementation, either:

- copy `prompts/procurement-bid-site-finder.md` into `supabase/functions/spin_generate_contracts/prompts/procurement-bid-site-finder.md`, or
- import/bundle the prompt as static function text.

The Anthropic request must include the full prompt body, not a summary.

Use a direct `fetch` to the Anthropic Messages API or the Anthropic SDK if Deno compatibility is clean. Keep the request small by sending only the selected geography and relevant existing registry rows.

## Frontend Implementation

### Supabase Client

Add `@supabase/supabase-js`.

Add `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Add `.env.example`:

```bash
VITE_SUPABASE_URL=https://zreplhkoxswtzxlchtjf.supabase.co
VITE_SUPABASE_ANON_KEY=
```

Do not commit `.env.local`.

### Contracts Tab State

Introduce a contracts view type so Generate does not pollute status filters:

```ts
type ContractView = 'generate' | ContractStatusFilter;
```

Use `contractView` or a similarly named state variable to control whether the Contracts worklist shows the Generate panel or the normal status-filtered list.

Contracts summary rendering:

- Render a `Generate` tab/pill before `Open`.
- Render a vertical separator `|` between `Generate` and `Open`.
- Keep existing Open/New/Interested/Applied/Closed behavior.
- Selecting `Generate` should clear selected rows and hide the closed subcategory menu.
- Selecting any status should leave Generate mode and restore the existing list behavior.

### Generate Panel

Add `ContractGeneratePanel` inside the Contracts worklist area.

Fields:

- City
- ZIP
- County
- State fixed as Arkansas/AR, displayed but not editable for this pass

Actions:

- Primary `Generate contracts`
- Secondary `Clear`

States:

- Idle: empty form with concise helper text.
- Validating: geography lookup started.
- Checking sources: existing URLs being verified.
- Finding sources: Anthropic discovery running.
- Capturing contracts: opportunities being inserted.
- Done: show counts and the next logical action.
- Needs review: show sources that require human review.
- Failed: show short actionable error.

The success state should offer the next action directly:

- `View new contracts` switches to `Open` or `New`, refreshes contracts from Supabase, and selects the first new result.
- `Review sources` shows the discovered source rows in the panel.

### Loading Contracts From Supabase

For this pass, load real DB rows for the Generate results and keep the existing mock rows available only as prototype seed content until the broader contracts list is moved fully to Supabase.

Add a mapper from `spin_contract_opportunities` rows to `ContractOpportunity`:

- `project_name` -> `projectName`
- `agency_name` -> `agencyName`
- `category` -> `category`
- `location` -> `location`
- `contact_name`, `contact_phone`, `contact_email`
- `due_at` or `expires_at` -> current date display fields
- `estimated_value` -> `estimatedValue`
- `status` -> `status`
- `source_id` -> `sourceId`
- `summary` -> `summary`
- `next_action` -> `nextAction`

Add a mapper from `spin_procurement_sources` to `BidSource`.

Prefer replacing or prepending generated DB results in state after the function returns. Do not create fake generated rows.

## Styling

- Reuse the existing neutral worklist styling and summary pill visual language.
- The `Generate` tab should feel like an entry point, with active state using the brand orange accent.
- Keep the separator visually quiet.
- The Generate panel should be compact and decision-oriented, not a landing page.
- Avoid nested cards. Use one unframed form section plus simple result/source rows.
- Keep mobile behavior stable with fixed control dimensions and wrapping labels.

## Implementation Steps

1. Inspect Supabase table shape:
   - Link local Supabase project to `zreplhkoxswtzxlchtjf`.
   - Inspect `spin_geography` columns and available Arkansas rows.
   - Adjust migrations only if needed.

2. Add Supabase project scaffolding:
   - Create `supabase/`.
   - Add migrations for `spin_procurement_sources`, `spin_contract_generation_runs`, and `spin_contract_opportunities`.
   - Add RLS policies.
   - Add function config for `spin_generate_contracts`.

3. Add Edge Function:
   - Implement request validation and CORS.
   - Implement `spin_geography` lookup.
   - Implement source URL verification.
   - Implement Anthropic discovery fallback using the full procurement prompt.
   - Implement registry validation/upsert.
   - Implement first-pass opportunity extraction and dedupe.
   - Return concise run, source, and opportunity summaries.

4. Add frontend Supabase client:
   - Install `@supabase/supabase-js`.
   - Add `src/lib/supabase.ts`.
   - Add `.env.example`.
   - Add typed function invocation helper.

5. Add Contracts `Generate` UI:
   - Add `ContractView` state.
   - Render `Generate | Open ...` on Contracts only.
   - Add `ContractGeneratePanel`.
   - Wire submit to `supabase.functions.invoke('spin_generate_contracts')`.
   - Map returned rows into the Contracts list state.
   - Keep Companies behavior unchanged.

6. Verify:
   - Run lint/build.
   - Serve the app locally.
   - Serve/invoke the Edge Function locally if Supabase CLI and Docker/API deploy path are available.
   - Test at least Little Rock and Pulaski County inputs.
   - Confirm Anthropic key is required only in Edge Function env.

## Testing Strategy

- `npm run lint`
- `npm run build`
- Manual UI checks:
  - Contracts view shows `Generate | Open New Interested Applied Closed`.
  - Generate active state hides the normal contract filters/list and shows the form.
  - Open/New/etc. restore the normal worklist.
  - Closed subcategory menu still works.
  - Companies view is unchanged.
- Function checks:
  - Missing input returns validation error.
  - Non-Arkansas or no geography match returns a clear error.
  - Known geography with existing sources verifies URLs.
  - Missing sources triggers Anthropic discovery.
  - Candidate URLs are not persisted unless validation passes or they are marked for review.
  - Duplicate opportunity rows are not inserted.

## Open Questions For Build

- What auth model should protect the Edge Function in production? If no Supabase Auth exists yet, start with anon invocation plus RLS and keep the function write path service-side only.
- What are the actual primary key and normalization columns in `spin_geography`?
- Is Anthropic web search enabled for the API key? If not, the first implementation should still verify known/existing URLs and mark missing-source discovery as `needs-review`.
- Should generated contracts replace mock contract rows globally, or should the generated batch be appended for this first integration pass? The recommended first pass is to prepend generated DB rows so existing prototype content remains available.

## References

- Supabase Edge Functions run TypeScript on Deno and can be invoked from the Supabase JS client.
- Supabase Edge Functions expose server-side environment variables and support secrets for keys that must not reach the browser.
- Anthropic Messages API uses `x-api-key` and `anthropic-version` headers; web search is a server-side tool with usage-based pricing and availability constraints.

## Success Criteria

- `Generate` appears in Contracts to the left of `Open` with a visible `|` separator.
- The Generate workflow uses Supabase, not mock data.
- Every newly created table and Edge Function name starts with `spin_`.
- `spin_geography` is used for city/ZIP/county lookup.
- Existing procurement URLs are verified before reuse.
- Missing or invalid URL discovery includes the full `prompts/procurement-bid-site-finder.md` content in the Anthropic request.
- Anthropic keys are only used server-side.
- New contract opportunities are persisted and displayed in the Contracts UI with status `New`.
