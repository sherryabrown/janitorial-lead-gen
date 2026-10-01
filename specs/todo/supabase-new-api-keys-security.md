# Supabase New API Keys Security

## Problem

Supabase is moving from the legacy JWT API keys named `anon` and `service_role` to the newer API keys named `publishable` and `secret`. This repo currently still uses legacy naming in:

- `src/lib/supabase.ts`: `VITE_SUPABASE_ANON_KEY`
- `.env`: `VITE_SUPABASE_ANON_KEY`
- `supabase/functions/spin_generate_contracts/index.ts`: fallback to `SUPABASE_SERVICE_ROLE_KEY`
- `supabase/migrations/20260904000100_spin_contract_monitoring.sql`: RLS policies grant to `anon, authenticated`

The migrations have already been run in Supabase, so implementation should not depend on re-running existing migrations.

## Objectives

- Use the new publishable key for browser Supabase access.
- Use the new secret key for the Edge Function's elevated Supabase access.
- Remove code-level fallback to legacy `SUPABASE_SERVICE_ROLE_KEY` unless explicitly requested.
- Keep RLS policy role names as `anon` and `authenticated`; those are Postgres roles and still correct with publishable keys.
- Avoid committing actual secret values.
- Preserve the current UI-only prototype behavior and existing generated contract flow.

## Important Supabase Behavior

Based on Supabase's current API key docs:

- Browser/client code should use a publishable key, normally shaped like `sb_publishable_...`.
- Server-controlled code, including Edge Functions, should use a secret key, normally shaped like `sb_secret_...`.
- Publishable keys still resolve to the `anon` Postgres role for unauthenticated users and `authenticated` for signed-in users.
- Secret keys resolve to `service_role` behavior and bypass RLS.
- Therefore, SQL policies that say `to anon, authenticated` do not need to be renamed for the new public key.

## Current Code Notes

### Browser Supabase Client

`src/lib/supabase.ts` currently reads:

```ts
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
```

The app imports `isSupabaseConfigured` and `supabase` from this file and invokes the Edge Function from `src/App.tsx` around the `generateContracts` flow.

### Edge Function

`supabase/functions/spin_generate_contracts/index.ts` already checks `SUPABASE_SECRET_KEYS`, parses it as JSON, and takes `default` or the first object value. It then falls back to `SUPABASE_SERVICE_ROLE_KEY`.

That fallback keeps legacy key support active in code and should be removed for this request.

### Migration File

The migration grants read policies to:

```sql
to anon, authenticated
```

Do not change this just because the browser key is renamed from anonymous key to publishable key. These are database roles, not API key variable names.

## Implementation Plan

### 1. Rename Browser Env Usage

Update `src/lib/supabase.ts` to use `VITE_SUPABASE_PUBLISHABLE_KEY`.

Suggested implementation:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabasePublishableKey as string)
  : null;
```

Keep the exported names unchanged so `src/App.tsx` does not need churn.

### 2. Update Local Env Template And Ignored Env

Do not commit real keys.

Current `.env` is ignored and has:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=
```

Because `.env` is ignored, it can be updated locally during implementation if needed, but the durable repo change should be an example file:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Add or update `.env.example` if it does not exist. `.gitignore` already allows `.env.example`.

If the implementer edits local `.env`, replace `VITE_SUPABASE_ANON_KEY` with `VITE_SUPABASE_PUBLISHABLE_KEY` and leave the value blank unless the user provides the real key.

### 3. Remove Legacy Service Role Fallback In Edge Function

Update `readSupabaseSecretKey()` in `supabase/functions/spin_generate_contracts/index.ts` so it only reads `SUPABASE_SECRET_KEYS`.

Suggested implementation:

```ts
function readSupabaseSecretKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!secretKeys) return undefined;

  try {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0];
  } catch {
    return undefined;
  }
}
```

Do not use `SUPABASE_SERVICE_ROLE_KEY` as a fallback. If `SUPABASE_SECRET_KEYS` is missing or malformed, the existing configuration failure response should remain the result.

### 4. Improve Edge Function Error Message

Keep the error concise, but make it point to the new secret requirement.

Current message:

```ts
message: 'Supabase Edge Function secrets are not configured.'
```

Suggested message:

```ts
message: 'SUPABASE_SECRET_KEYS is required for contract generation.'
```

This makes deployment misconfiguration easier to diagnose without mentioning legacy keys in the UI.

### 5. Leave RLS Policies Alone

Do not create a new migration solely to change:

```sql
to anon, authenticated
```

That policy target remains correct. If a future security hardening pass wants to restrict public reads, that should be a separate product/security decision because it changes data visibility, not API key naming.

### 6. Optional Documentation Touch

If the repo has setup docs later, update them to say:

- Browser: `VITE_SUPABASE_PUBLISHABLE_KEY`
- Edge Function secret: `SUPABASE_SECRET_KEYS`, with a JSON value that includes `default`

Example:

```json
{"default":"sb_secret_your_key_here"}
```

Do not add actual keys to docs.

## Testing Strategy

Run:

```powershell
npm run build
```

Expected:

- TypeScript build succeeds.
- Vite build succeeds.
- No references remain in source code to `VITE_SUPABASE_ANON_KEY`.
- No references remain in source code to `SUPABASE_SERVICE_ROLE_KEY`.

Also run a targeted search excluding generated output and dependencies:

```powershell
Get-ChildItem src,supabase -Recurse -File |
  Select-String -Pattern 'VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','service_role key','anon key'
```

Expected:

- No matches in app or Edge Function code.
- Matches in SQL policy roles are acceptable only when they are clearly Postgres roles, such as `to anon, authenticated`.

Manual check:

- Confirm the deployed Edge Function has `SUPABASE_SECRET_KEYS` set in Supabase.
- Confirm the frontend hosting environment has `VITE_SUPABASE_PUBLISHABLE_KEY` set.
- Because the migrations already ran, do not rerun the existing migration as part of this change.

## Edge Cases

- If `SUPABASE_SECRET_KEYS` is not valid JSON, contract generation should fail at configuration with the existing JSON response shape.
- If multiple secret keys are present, `default` should win; falling back to the first object value is acceptable for compatibility with Supabase's named-key JSON shape.
- If the browser publishable key is missing, the existing generate panel should still show the configuration warning and avoid calling the Edge Function.
- Do not expose `sb_secret_...` through any `VITE_` variable; Vite embeds those values into browser bundles.

## Success Criteria

- `src/lib/supabase.ts` uses `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `.env.example` documents the new public key variable.
- The Edge Function only uses `SUPABASE_SECRET_KEYS` for elevated Supabase access.
- Legacy key env names are absent from source code except historical completed specs or intentionally explanatory docs.
- RLS policies remain functionally correct and are not changed just for the key rename.
- `npm run build` passes.
