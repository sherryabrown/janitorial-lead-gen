# Restore Visible Auth Flow and Configure Staff Access

## Problem statement

The frontend contains a recently added email/password sign-in gate and a Sign out control in the current source, but the user cannot see them in the running app. There is no Sign up flow. The likely causes are that the dev server is serving an older process/build, the app is not being opened at the Vite URL, or the Supabase environment/auth configuration is incomplete.

The database now protects procurement data with RLS. Authentication and database authorization must be treated as separate steps: Supabase Auth verifies the user; RLS decides whether that user may read procurement tables.

## Current repository findings

- `src/App.tsx` contains `getSession`, `onAuthStateChange`, email/password sign-in, and Sign out.
- The current source has no `signUp` call and therefore no visible Sign up mode.
- The signed-in header shows the email and `Sign out`.
- `src/main.tsx` renders the app directly; there is no route or separate auth page.
- The app uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `npm run dev` is a long-running development server; a timeout from the command runner does not mean the server failed. The browser must be opened to the URL printed by Vite, normally `http://127.0.0.1:5173`.

## Objectives

- Make Sign in, Sign up, and Sign out visibly available in the running UI.
- Preserve the current session across refreshes.
- Provide clear states for signed out, signed in, email-not-confirmed, and authenticated-but-not-authorized.
- Document the exact Supabase setup needed for a test staff account.
- Keep secret keys out of the browser and preserve RLS as the database authority.

## Exact Supabase setup checklist

Before frontend testing, the user should complete these steps in the correct Supabase project:

1. Open the project whose URL matches `VITE_SUPABASE_URL` in `.env`. The dashboard project name may differ from the project reference.
2. Open **Authentication → Providers → Email** and confirm email/password authentication is enabled.
3. For local testing, choose one:
   - keep **Confirm email** enabled and use the confirmation link received by the test user; or
   - temporarily disable confirmation for development only.
4. Open **Authentication → Users → Add user** and create a test account with an email and password. Confirm the user if confirmation is enabled.
5. In **SQL Editor**, inspect the policies:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('procurement_leads', 'procurement_sources')
order by tablename, policyname;
```

6. Confirm the policy admits the intended staff account. If the policy uses a staff table, email allowlist, or JWT claim, verify the test user satisfies that rule. Do not invent a frontend-only `staff` flag.
7. Confirm table grants:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('procurement_leads', 'procurement_sources')
order by table_name, grantee, privilege_type;
```

8. Do not put a `sb_secret_...` key in `.env` or any `VITE_` variable. The browser uses only the publishable key.

## Implementation plan

### Phase 1: Make the auth UI explicit

Update `src/App.tsx` to use a clear auth surface:

- Keep the initial `getSession()` check and `onAuthStateChange` subscription.
- Add a visible Sign in / Sign up mode toggle.
- Add a Sign up form using `supabase.auth.signUp({ email, password })`.
- Show a concise confirmation message when sign-up requires email confirmation.
- Keep Sign out visible in the signed-in header.
- Preserve the current page/work-mode context after sign-in and sign-out where practical.
- Do not expose session tokens, passwords, or secret keys in the UI or logs.

Use email/password as the selected provider for this implementation unless the user chooses a different provider before build.

### Phase 2: Distinguish access states

Use separate UI states:

- `checking-session`: restoring the Supabase session;
- `signed-out`: show sign-in/sign-up controls;
- `signed-in`: render the application and Contracts query;
- `email-confirmation-required`: explain that the user must confirm the email;
- `access-denied`: signed in, but RLS rejects procurement reads;
- `empty`: signed in and authorized, but no rows exist.

Map Supabase errors by status/code/message conservatively. Do not label every failed query as an empty queue.

### Phase 3: Verify the running app

From the project root:

```powershell
npm.cmd run dev
```

Leave that terminal running and open the exact URL it prints. Then verify:

1. Signed out: Sign in and Sign up are visible.
2. Sign up: create a test account; confirm the email if required.
3. Sign in: use the confirmed account; the app header shows the account email and Sign out.
4. Refresh: the session remains signed in.
5. Sign out: the app returns to the auth screen and Contracts are no longer visible.
6. Signed in but unauthorized: the app shows access denied rather than zero Contracts.
7. Signed in and authorized: `procurement_leads` and `procurement_sources` load.

If the browser still does not show the auth UI, stop any older Vite process, restart `npm.cmd run dev`, confirm the browser URL is the current local Vite URL, and hard-refresh the page.

## Questions / decisions

1. Should Sign up be open to anyone with an email, or should it be invite-only/admin-created? Recommended for a staff-only product: admin-created users or invite-only, with public Sign up disabled after testing.
2. What exact RLS rule identifies staff—an allowlist, a staff-members table, or a JWT role claim? This must be confirmed in Supabase before declaring Contracts access complete.

## Testing strategy

- Run `npm.cmd run build` and `npm.cmd run lint`.
- Test sign-in, sign-up, confirmation-required, refresh persistence, and sign-out.
- Test an authorized and unauthorized account against the actual RLS policies.
- Verify no procurement data renders while signed out.
- Verify a zero-row authorized response is distinct from a 401/403 response.
- Confirm Generate remains unchanged.

## Success criteria

- Visible Sign in, Sign up, and Sign out controls are available in the running app.
- Auth state restores correctly on refresh.
- Staff setup instructions are complete and reproducible in Supabase.
- Contracts data loads only for an authenticated account admitted by RLS.
- Unauthorized users receive a clear access message.
- No secret key or session token reaches the browser UI, logs, or committed files.
- Build and lint pass.

