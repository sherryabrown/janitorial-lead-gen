# Supabase support request: backup access

Open [Supabase support](https://supabase.com/dashboard/support/new), select **Lead Generation**, and paste the text below. Do not include passwords, API keys, connection strings containing secrets or private backup files. The project was renamed from Visual Roadmap; its reference did not change.

## Text to send

Project: Lead Generation, reference `zreplhkoxswtzxlchtjf`.

We need read-only backup/export access before a release. The owner confirms the existing database password, but the Session pooler connection shown by the Dashboard fails with SQLSTATE `28P01`:

- Host: `aws-0-us-east-1.pooler.supabase.com`
- Port: `5432`
- Database: `postgres`
- User: `postgres.zreplhkoxswtzxlchtjf`

Transaction mode on port 6543 also returned 28P01. The password was passed directly as a driver field, avoiding URI escaping. An independent native libpq/psql client returned the same password-authentication failure. Optional startup settings were ruled out. TLS verification is enabled. The `postgres` role is login-enabled and has no expiry, verified through a read-only Management API query. Read-only Management API exports work, but authentication-log API attempts did not provide usable log records.

Direct host `db.zreplhkoxswtzxlchtjf.supabase.co` resolves to IPv6, but the operator machine has no IPv6 route (ENETUNREACH), so we cannot independently validate the password through the direct endpoint. Earlier OS lookup reported ENOTFOUND; explicit AAAA resolution established the actual network limitation. We have stopped repeated authentication attempts.

Please check whether shared pooler authentication/credential state is preventing this connection and advise a read-only export route. We do not authorize password resets, role creation, project restarts, plan/add-on changes, database restores or other production modifications. Please obtain our approval before any action that changes production.

If you can provide an existing complete downloadable PostgreSQL 17 backup instead, please confirm its recovery timestamp, schema/data/Auth coverage, restore instructions and any omitted role/password/Storage/Edge Function content. The backup listing returned backups=null, pitr_enabled=false and no usable physical-backup details; we have not inferred that no provider backup exists.

An earlier SELECT-only CLI inventory printed "Initialising login role...". We stopped using linked CLI database/storage operations because they may initialize temporary database login roles. Subsequent operations used explicit read-only Management API transactions; no application-table or migration changes were made.

## What to return to the release operator

Share the support response or make a complete backup available through an approved secure local location. Do not post passwords, password verifiers or service keys in chat. A working approved connection or complete backup is still required before the actual production-snapshot restore can be verified in isolation.
