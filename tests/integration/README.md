# Access integration gate

Both suites are deliberately separate from the offline suites. Missing configuration fails clearly; neither uses production as a fallback.

## Interactive scheduling preview

Run `npm run preview:scheduling`, wait for `preview_ready`, then open `http://127.0.0.1:5174`. This creates a disposable local PostgreSQL/PostgREST database, applies the current preview schema, and seeds sample schedules/results with a User/Admin selector. It does not run the integration regression suite first; use `npm run test:access` separately for that gate. Stop the preview with Ctrl+C. Ports 5174 and 8091 must be available. It uses no production connection or credentials.

PostgREST output is retained in the temporary cluster's `postgrest.log`. Startup stops promptly if its process exits. Shell PostgREST and database connection overrides are excluded from the gateway's environment, and sample seeding waits for the schema cache to reload.

`npm run test:access` creates a disposable PostgreSQL cluster on a random localhost port, loads the sanitized baseline and forward migrations, and starts PostgREST with an ephemeral signing key. It tests real HTTP JWT signature/expiry enforcement, database roles, RLS, note ownership, stage audit and 1,005-row pagination. It stops its own processes afterwards. It does not use the existing PostgreSQL service or implement Supabase Auth signup. The Auth claim helper is reconstructed locally; hosted Auth lifecycle verification is available separately below.

Install PostgreSQL 15+ and the official PostgREST Windows binary (tested with PostgreSQL 15.15 and PostgREST 16.4). Defaults are `C:/Program Files/PostgreSQL/15/bin` and `outputs/procurement-access/local-access-runtime/postgrest/postgrest.exe`; override with `ACCESS_TEST_PG_BIN` and `ACCESS_TEST_POSTGREST_BIN`. Verify the official release asset checksum before extracting. No runtime download occurs during tests. Temporary cluster directories are retained under the OS temp directory for diagnostics and contain a disposable signing key; never commit them. On other platforms supply both runtime paths.

## Optional Supabase Auth lifecycle gate

`npm run test:access:supabase` uses real Supabase Auth account creation/sign-in and PostgREST.

On a **fresh disposable Supabase database**, load `supabase/baselines/20260930_public_procurement.sql`, then the two `20260930000*` forward migrations, then `20261001000100_queue_bounds_and_historical_dates.sql`, then `tests/integration/disposable-marker.sql`. The baseline is a schema reconstruction, not a production migration or seed. Existing Auth schemas/roles are required. Do not load historical migrations again over this current-state baseline.

Set `ACCESS_TEST_URL`, `ACCESS_TEST_ANON_KEY`, `ACCESS_TEST_SERVICE_KEY`, and `ACCESS_TEST_EXPIRED_JWT` privately. The last value must be a genuinely expired signed token for this isolated target, not a modified unsigned token. Set `ACCESS_TEST_ALLOW_WRITES=isolated`. For a disposable hosted target also provide `ACCESS_TEST_PROJECT_REF`; no paid project is provisioned by this command.

Run either access command in a separate shell/process without the offline suite's `NODE_OPTIONS` preload. Never remove the guard from default tests. The Supabase suite creates two temporary Auth users and records derived from sanitized procurement evidence; cleanup targets only their generated identities. Inspect cleanup failures before rerunning.

Successful offline checks do not satisfy this gate. After this gate succeeds, apply the reviewed forward migrations through the authorized deployment process, refresh the private access inventory and verify the live anonymous/authenticated boundary. The old Generate handler is retired; Admin uses the existing authenticated workflow. Companies/email previews remain future functionality.


The current `local-access.mjs` harness lists and applies the forward migrations required by its scheduler, automatic SAM, native validation and access tests. Use that harness for the full current application gate; the optional hosted Auth lifecycle instructions above describe their narrower historical Auth/RLS fixture, not the full current schema.

Run `node tests/integration/admin-ui-browser.mjs` for desktop/mobile/keyboard acceptance against intercepted fixture HTTP. It uses the real app with a fixture session and blocks unexpected external requests; it does not prove deployed provider access or production imports.

For county-loading acceptance, build with `VITE_PROCUREMENT_API_URL=https://janitorial-procurement-backend.onrender.com` in the build process environment, then run `node tests/integration/admin-ui-browser.mjs --built --county-loading`. The harness intercepts that origin. This checks deferred geometry, failed-chunk retry, draft/search retention, keyboard selection, direct manual entry, and desktop/mobile layout; it sends no workflow mutations to a live service.
