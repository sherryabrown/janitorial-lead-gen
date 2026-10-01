# Contracts Card Refinements

## Problem statement

The Contracts main-card presentation now loads production records from `procurement_leads`, but several card details still reflect the original mock-oriented UI. The card needs clearer production provenance and more useful closed-status handling without changing the deferred Generate flow.

## Objectives

- Include the year in every `Expires` date bubble/label.
- Remove the hyperlink from the contract source/agency text.
- Make the contract title link to `procurement_leads.payload.source_url`.
- Replace the current `From Supabase` touch label with explicit Added and Updated timestamps formatted as weekday, month day, year.
- Offer Not Interested sub-categories: No budget, Has provider, Too small, Too big, and Labor challenge.
- Keep the Companies workflow and Generate tab outside this phase.

## Current implementation findings

- Main card markup is in `ContractList` in `src/App.tsx`.
- The current source/agency text is linked using `procurement_sources.url`.
- The current title is plain text.
- `ContractOpportunity` does not yet carry a source URL, added timestamp, updated timestamp, or a Not Interested reason.
- `src/lib/procurement.ts` maps production rows and already receives `payload`, `first_seen_at`, and `last_seen_at`.
- `formatDateLabel` currently formats only month and day.
- `ContractActions` immediately invokes `not-interested` and has no reason-selection UI.
- The live `procurement_leads` fields include `stage`, `notes`, `first_seen_at`, `last_seen_at`, and JSON `payload.source_url`.

## Confirmed decisions

- Not Interested sub-categories and persistence are deferred for a later phase.
- When `payload.source_url` is missing or malformed, the title remains plain text; it does not fall back to `procurement_sources.url`.
- Use `last_seen_at` as the Updated timestamp for now.

## Technical approach

### 1. Extend the production adapter model

Update `src/lib/procurement.ts` so the mapped contract includes:

```ts
sourceUrl?: string;
addedAt: string;
updatedAt: string;
notInterestedReason?: NotInterestedReason;
```

Use `payload.source_url` for `sourceUrl`, `first_seen_at` for `addedAt`, and `last_seen_at` for `updatedAt`. Preserve safe fallbacks when values are null or invalid, but do not substitute mock timestamps.

Add a shared reason type and labels:

```ts
type NotInterestedReason =
  | 'no-budget'
  | 'has-provider'
  | 'too-small'
  | 'too-big'
  | 'labor-challenge';
```

### 2. Refine date and link rendering

Update the date formatter used by `dateLabel` to include the year, for example `Expires Feb 25, 2026` and `Due Feb 25, 2026`. Confirm this applies to both production-loaded records and generated records without modifying Generate behavior.

In `ContractList`:

- Render `contract.projectName` inside an anchor only when `contract.sourceUrl` passes the existing URL normalization helper.
- Stop linking `contract.agencyName` from the source line.
- Preserve click propagation handling on the title anchor so opening the source does not select or otherwise mutate the card.
- Keep agency/source text as plain text, followed by location and category.

### 3. Replace the touch label

Replace the current single `lead-touch` value with a compact two-line metadata block:

```text
Added Wed, Jan 14, 2026
Updated Thu, Jan 15, 2026
```

Use a single locale-aware formatter with `{ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }`. If a timestamp is absent or invalid, show `Added date pending` or `Updated date pending`; never show `From Supabase` for production rows.

Adjust CSS only as needed to preserve the existing right-aligned card layout and make the two lines readable at the mobile breakpoint.

### 4. Defer Not Interested reason selection

Do not implement the five Not Interested reason choices or any persistence changes in this phase. Keep the existing Not Interested action and current status behavior unchanged. The reason taxonomy and its storage location will be planned separately after the workflow decision is made.

## Testing strategy

- Verify an `Expires` card displays month, day, and year.
- Verify a `Due` card also retains the year.
- Verify agency/source text is not an anchor and does not open a URL.
- Verify a title with a valid `payload.source_url` opens that URL in a new tab without selecting the card.
- Verify missing, empty, and malformed `payload.source_url` values render a non-linked title.
- Verify Added and Updated use the live `first_seen_at` and `last_seen_at` values and include weekday, month, day, and year.
- Verify null/invalid timestamps use pending labels without crashing.
- Verify the existing Not Interested action remains unchanged.
- Run `npm.cmd run build` and `npm.cmd run lint`.
- Confirm Generate behavior is unchanged.

## Success criteria

- Production Contracts cards show full-year dates and explicit Added/Updated metadata.
- Only `payload.source_url` controls the title link; source/agency text is plain text.
- All five Not Interested reasons are available with clear next action and no accidental database schema assumptions.
- Missing production fields have safe, concise fallbacks.
- Build and lint pass, and the Generate tab remains deferred and unchanged.
