# Adapt Contracts Frontend to the Upgraded Procurement Leads Schema

## Problem statement

The database schema for `procurement_leads` has been upgraded. The Contracts frontend still queries the previous column names and derives several display values from `payload`. It must be updated to use the renamed timestamps, the new dedicated lead columns, and the removal of `review_status` without changing the deferred Generate flow.

The SQL also changes access expectations: anonymous and authenticated roles are not granted general procurement-data access, so the frontend must not assume that a publishable-key-only browser client can read the table unless an authenticated staff session or an approved data-access boundary exists.

Repository inspection confirms there is currently no frontend authentication flow: `src/main.tsx` renders `App` directly, `src/lib/supabase.ts` creates only the public client, and no `auth.getSession`, sign-in, sign-out, or auth-state listener exists in `src`.

## Confirmed schema changes

| Previous frontend assumption | New schema contract |
| --- | --- |
| `first_seen_at` | `created_at` |
| `last_seen_at` | `updated_at` |
| `changed_at` | `contract_last_updated_at` |
| `review_reason` | `search_term_used` |
| `review_status` | removed |
| payload-derived title | dedicated `title` column, with payload fallback only if needed |
| payload-derived agency | dedicated `agency` column, with payload fallback only if needed |
| payload-derived source URL | dedicated `source_url` column, with payload fallback only if needed |
| payload-derived solicitation number | `solicitation_number` |
| payload-derived award number | `award_number` |
| payload-derived publication date | `publication_date` |
| payload-derived deadline | `response_deadline` |
| payload-derived contract dates | `contract_start_date`, `contract_current_end_date`, `contract_potential_end_date` |
| first location object | `work_performance_city`, `work_performance_state` |

## Objectives

- Make the Contracts data adapter query only columns that exist after the upgrade.
- Replace all `first_seen_at`/`last_seen_at` assumptions with `created_at`/`updated_at`.
- Preserve `contract_last_updated_at` as available production context without confusing it with the row's Updated timestamp.
- Remove all runtime use of `review_status` and `review_reason`.
- Prefer dedicated columns for title, agency, URL, date fields, and location while retaining safe payload fallbacks for partially migrated rows.
- Keep the current UI model and status mapping based on `procurement_leads.stage`.
- Preserve the deferred Generate flow and Companies workflow.
- Surface an actionable authentication/RLS error if the browser has no staff session.

## Sign-in verification required before implementation

The following must be checked in Supabase before the Contracts query can be considered ready:

1. **Authentication provider**: confirm which provider staff will use. The least invasive initial option is Supabase email/password, but magic link or an external provider is also possible.
2. **Staff user**: confirm at least one test staff user exists under Authentication → Users, is confirmed, and can sign in.
3. **RLS policies**: run this in the SQL Editor and inspect the policies for both tables:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('procurement_leads', 'procurement_sources')
order by tablename, policyname;
```

4. **Table grants**: confirm the intended database roles have table privileges:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('procurement_leads', 'procurement_sources')
order by table_name, grantee, privilege_type;
```

5. **Browser behavior**: test both states using the real app:
   - signed out: the UI must show a sign-in prompt, not an empty Contracts queue;
   - signed in as the approved staff user: the UI must obtain a session and load the two tables;
   - signed in as an unapproved user, if applicable: the UI must show an access-denied state.

6. **Session persistence**: confirm whether the chosen auth method redirects back to the local Vite URL and whether the session survives a page refresh. Do not expose access tokens in logs or screenshots.

If the policies are not yet defined for the staff role, stop before changing frontend query code and resolve the database access contract first. Do not bypass RLS with a secret key in the browser.

## Questions / assumptions to confirm before implementation

1. Which sign-in method should the frontend implement: email/password, magic link, or an existing external provider? No auth flow currently exists in the repository.
2. Should `contract_last_updated_at` be shown on the card or only retained in the adapter for a later history/detail phase? Recommended for this phase: retain it in the adapter, but continue showing `created_at` as Added and `updated_at` as Updated.
3. The SQL includes `detected_change_at` in the ingest function even though the requested renamed field is `contract_last_updated_at`. Confirm whether `detected_change_at` is also present in the deployed table. The frontend should not select it until confirmed.

## Technical approach

### Phase 1: Update the adapter's row contract and query

Modify `src/lib/procurement.ts`:

- Change `ProcurementLead` fields to `created_at`, `updated_at`, `contract_last_updated_at`, and `search_term_used`.
- Remove `review_status` and `review_reason` from the row type and all mapping/history output.
- Select the new dedicated columns:

```text
id, source_id, payload, created_at, updated_at,
contract_last_updated_at, search_term_used,
title, agency, source_url, solicitation_number, award_number,
publication_date, response_deadline, planned_advertisement_period,
contract_start_date, contract_current_end_date,
contract_potential_end_date, work_performance_city,
work_performance_state, stage, next_action, follow_up_on, notes,
estimated_annual_amount, bid_type, business_category,
contracting_entity_geo_level
```

- Order by `created_at`, not `first_seen_at`.
- Use dedicated columns first and payload values second for transitional safety:

```ts
title = row.title ?? payload.title
agency = row.agency ?? payload.agency
sourceUrl = row.source_url ?? payload.source_url
deadline = row.response_deadline ?? parsed payload.deadline
location = [row.work_performance_city, row.work_performance_state]
```

- Use `created_at` for the UI Added timestamp and `updated_at` for the UI Updated timestamp.
- Preserve `contract_last_updated_at` as an optional adapter field named clearly enough to distinguish it from `updated_at`.
- Use `search_term_used` only as optional context; do not map it into review status.
- Keep null-safe parsing for dates, URLs, contacts, amounts, and locations.

### Phase 2: Keep the UI mapping stable

Update the adapter-to-UI mapping in `src/App.tsx` only where the renamed data requires it:

- Continue mapping `stage` to the existing Contract status labels.
- Continue rendering the title link from the mapped lead source URL.
- Continue rendering Added/Updated from the mapped row timestamps.
- Remove any UI history label or fallback that mentions review status.
- Do not add new status values for `contract_last_updated_at` or `search_term_used`.

If `contract_last_updated_at` is included in the UI model, keep it available for a later detail/history card without changing the main card layout in this phase.

### Phase 3: Add or connect the staff sign-in flow

Because no auth flow exists today, add the smallest approved sign-in boundary before relying on protected browser reads:

- Add a small sign-in screen or auth gate around the app using the provider confirmed above.
- Subscribe to `supabase.auth.onAuthStateChange` and track `loading`, `signed-out`, `signed-in`, and `access-denied` states.
- Call `supabase.auth.getSession()` on startup so page refreshes restore the existing session.
- Render Contracts only after the session check completes; never confuse a blocked query with zero records.
- Provide a concise sign-out action and preserve the current page context after sign-in.
- On 401/403, show an actionable message distinguishing `Sign in required` from `Your account does not have procurement access`.
- Never use a secret key in `VITE_` variables or the browser.
- Do not invent staff-role claims in the frontend. The database policies remain the authority.

If the user chooses not to add sign-in in this phase, the fallback is an explicit blocked state and no production Contracts data display; an empty list is not acceptable.

### Phase 4: Documentation and cleanup

- Update active setup notes or adapter comments that mention the old timestamp/review fields.
- Leave historical migration/spec files unchanged unless they are active runtime documentation.
- Confirm Generate remains untouched; its Edge Function still has separate schema work and is outside this phase.

## Testing strategy

- Run a focused search over `src` for `first_seen_at`, `last_seen_at`, `changed_at`, `review_status`, and `review_reason`; no executable frontend reference should remain.
- Mock or fixture a new-schema row with all dedicated columns populated and verify title, agency, URL, deadline, dates, and location use those columns.
- Fixture a transitional row with dedicated columns null and payload values present; verify safe fallbacks.
- Verify `stage` still maps to New, Interested, Applied, Won, Lost, Withdrew, and Not interested as before.
- Verify `contract_last_updated_at` does not replace the row Updated timestamp accidentally.
- Verify null/invalid timestamps and URLs do not crash the Contracts list.
- Verify a 401/403 from RLS produces an actionable state distinct from an empty result.
- Verify signed-out, signed-in approved, and signed-in unapproved states.
- Verify session restoration after refresh and sign-out behavior.
- Verify the app never logs or renders access tokens or secret keys.
- Run `npm.cmd run build` and `npm.cmd run lint`.
- Confirm Generate and Companies behavior remains unchanged.

## Success criteria

- Contracts load using the upgraded `procurement_leads` column names.
- No runtime frontend code references removed columns.
- Dedicated columns are preferred, with safe payload fallback for transitional records.
- Added uses `created_at`; Updated uses `updated_at`.
- `contract_last_updated_at` is preserved distinctly if included in the adapter.
- Review status/reason concepts are removed from frontend runtime mapping.
- RLS/authentication failures are clear and actionable.
- Build and lint pass without changing Generate behavior.
