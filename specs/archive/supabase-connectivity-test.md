# Supabase Connectivity Test

> **Archived troubleshooting draft, October 5, 2026.** Some examples below refer to obsolete spin/generation paths. Use `docs/SUPABASE-CONNECTIVITY.md` for current read-only checks. Do not execute this draft as an active plan.

## Problem statement

The prototype contains Supabase client wiring, but the current environment could not reach the configured Supabase endpoint during a read-only test. This plan provides an exact, repeatable way to verify connectivity locally without exposing the publishable key or using mock data for a database check.

## Current project state

- Supabase client dependency: `@supabase/supabase-js`
- Browser client: `src/lib/supabase.ts`
- Required local variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- Supabase project ID in `supabase/config.toml`: `zreplhkoxswtzxlchtjf`
- Existing Edge Function: `spin_generate_contracts`
- Existing migration: `supabase/migrations/20260904000100_spin_contract_monitoring.sql`
- The agent environment test failed before authentication with: `Unable to connect to the remote server`.

## Exact test procedure

Run these commands from the project root in PowerShell.

### 1. Confirm local configuration without printing secrets

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    $name = $matches[1]
    $value = $matches[2]
    if ($name -eq 'VITE_SUPABASE_URL') {
      Write-Host "$name=$value"
    } elseif ($name -eq 'VITE_SUPABASE_PUBLISHABLE_KEY') {
      Write-Host "$name configured: $(-not [string]::IsNullOrWhiteSpace($value))"
      Write-Host "$name length: $($value.Length)"
    }
  }
}
```

Expected result:

- `VITE_SUPABASE_URL` is the project's `https://<project-ref>.supabase.co` URL.
- The publishable key is configured and has a non-zero length.
- Do not paste the key into tickets, chat, screenshots, or committed files.

### 2. Test DNS and HTTPS reachability

Replace the URL only with the value from `.env`; do not include the key in this command.

```powershell
$supabaseUrl = ((Get-Content .env | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -split '=', 2)[1].Trim()
$supabaseHost = ([Uri]$supabaseUrl).Host
Resolve-DnsName $supabaseHost
Test-NetConnection $supabaseHost -Port 443
```

Expected result: DNS resolves and `TcpTestSucceeded` is `True`.

If DNS or TCP fails, the issue is local network, VPN, firewall, proxy, or Supabase availability. Fix that before testing application code.

### 3. Test the Supabase REST gateway with the publishable key

This is a read-only request. It does not insert, update, or delete data.

```powershell
$envMap = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $envMap[$matches[1]] = $matches[2] }
}

$headers = @{
  apikey = $envMap['VITE_SUPABASE_PUBLISHABLE_KEY']
  Authorization = "Bearer $($envMap['VITE_SUPABASE_PUBLISHABLE_KEY'])"
}

Invoke-WebRequest `
  -Uri "$($envMap['VITE_SUPABASE_URL'].TrimEnd('/'))/rest/v1/" `
  -Headers $headers `
  -Method Get `
  -UseBasicParsing
```

Interpret the result:

- `200`: the endpoint is reachable and the key was accepted by the gateway.
- `401` or `403`: the endpoint is reachable, but the key/header configuration is invalid or the request is not allowed.
- `404`: the URL is likely wrong, or the request is not going to a Supabase project URL.
- Connection, DNS, timeout, or proxy error: the machine cannot reach Supabase.

### 4. Test from the Vite app

```powershell
npm install
npm run dev
```

Open the printed local URL, normally `http://127.0.0.1:5173`.

In the browser developer console, run:

```javascript
fetch('/rest/v1/', { method: 'GET' }).then((r) => console.log(r.status))
```

This relative request is only a sanity check for the Vite page and is not the Supabase test. To test Supabase from the app, add a temporary development-only check near the existing Supabase client import, then remove it after testing:

```ts
if (supabase) {
  const { error } = await supabase.from('spin_contracts').select('id').limit(1)
  console.log(error ? `Supabase error: ${error.message}` : 'Supabase query succeeded')
}
```

Use the actual table name from the deployed schema if `spin_contracts` does not exist. A `relation does not exist` message proves connectivity but means the table name/schema is different; it is not a network failure.

### 5. Test Supabase CLI/project linkage, if the CLI is installed

```powershell
supabase --version
supabase projects list
supabase link --project-ref zreplhkoxswtzxlchtjf
supabase db push --dry-run
```

Expected result: the linked project is `zreplhkoxswtzxlchtjf`, and the dry run reports the migration state without applying changes.

If `supabase` is not recognized, install the Supabase CLI using the official Supabase installation instructions, then rerun these commands. Do not commit an access token or place a secret key in `.env` values beginning with `VITE_`.

### 6. Test the deployed Edge Function

First confirm the function is deployed in the Supabase dashboard under **Edge Functions**. Then invoke it only with the request body expected by `supabase/functions/spin_generate_contracts/index.ts`:

```powershell
$envMap = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $envMap[$matches[1]] = $matches[2] }
}

$headers = @{
  apikey = $envMap['VITE_SUPABASE_PUBLISHABLE_KEY']
  Authorization = "Bearer $($envMap['VITE_SUPABASE_PUBLISHABLE_KEY'])"
  'Content-Type' = 'application/json'
}

Invoke-WebRequest `
  -Uri "$($envMap['VITE_SUPABASE_URL'].TrimEnd('/'))/functions/v1/spin_generate_contracts" `
  -Headers $headers `
  -Method Post `
  -Body '{}'
```

An application validation error means the function was reached. A `404` usually means it is not deployed under that name. A `401` or `403` means function authentication or headers need review. A connection error is still a network problem.

## Implementation guidance

After connectivity is confirmed, the next implementation should add a small development-only health check rather than leaving temporary console code in the production UI. The check should:

1. Report whether required environment variables are present.
2. Run a harmless `select(...).limit(1)` against a confirmed deployed table.
3. Display a concise success or failure state in the UI or browser console.
4. Never display API keys, secret keys, raw authorization headers, or full database errors containing sensitive values.
5. Keep existing mock UI data until the user explicitly requests that a screen point at the database.

## Testing strategy

Run the checks in order: configuration, DNS/HTTPS, REST gateway, Vite app, CLI linkage, then Edge Function. Record the first failing step and its HTTP status or exact error. Do not interpret a missing table or invalid request-body error as a connectivity failure when the response came from Supabase.

## Success criteria

- DNS resolves the configured Supabase host.
- HTTPS to port 443 succeeds.
- REST gateway returns an authenticated response.
- A harmless query against a confirmed deployed table returns rows or an empty result without a transport/auth error.
- The Edge Function returns an application-level response when invoked with a valid request.
- No secrets are printed, committed, or placed in browser-visible server-only variables.

