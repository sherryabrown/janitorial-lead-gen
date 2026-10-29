# Scheduling backup and isolated cutover rehearsal

Readiness status: **NO GO for production**. Preparation and read-only backup access are approved. Production DDL, restores, scheduler changes, Render changes and Netlify Production deployment remain unauthorized. The migration-history exception is approved for the eight release versions only; no live history writes have been made.

## Verified evidence

- The explicit linked-admin read-only connection probe was attempted after the owner saved the password locally. Supabase returned PostgreSQL `28P01` (password authentication failed). The probe did not perform a backup or any writes. Do not reset the password as a workaround. Confirm the correct existing project/database credential through the local file or use an approved complete backup.
- The authenticated backup listing returned `backups: null`, `pitr_enabled: false`, `walg_enabled: true` and no physical recovery details. This does not prove that no provider backup exists; it does mean that an accessible, usable recovery point and restore permission have **not** been demonstrated.
- The earlier read-only catalog inventory reported PostgreSQL 17.4, 65 public tables, 116 public Functions and 42 procurement tables. Storage metadata listed 2,013 objects totaling 364,874,247 bytes in `procurement-private`. No object bytes were downloaded/restored by this rehearsal.
- Native PostgreSQL 15.15 synthetic backup/restore rehearsal passed. It creates its own loopback-only temporary cluster, dumps a pre-release fixture, restores into two separate databases, compares Function definitions/ACLs, policies and triggers, and checks profile/membership identity. A deliberately unexpected membership dependency causes the whole bundle to roll back. Removing that fixture dependency allows the exact reviewed bundle to succeed with 41 tables and lossless membership archival. Eight migration-history versions are recorded only in the isolated fixture ledger. The recovery database retains the original schema. PostgreSQL 15 fixtures are **not** a restored production PostgreSQL 17 database.
- Six actual deployed Edge Function source exports were encrypted with Windows CurrentUser DPAPI, decrypted into a separate local directory and compared by SHA-256: all 10 exported files matched. No Edge Function was invoked or redeployed. All seven deployed version/JWT settings were unchanged on the post-export inventory.

Evidence is private and Git ignored under `outputs/deployment/scheduling-backup-readiness/`: the native rehearsal receipt, Edge source inventory, encrypted archive and restore/hash receipt. Source exports and restored files have restricted local ACLs. They may contain sensitive implementation details and must not be committed. DPAPI recovery depends on the Windows identity; this is **not independent off-site recovery**.

## Functions coverage

Database Functions are part of the database schema backup. The real backup must preserve all Function/procedure bodies, signatures, owners, grants, SECURITY DEFINER flags, search paths, trigger Functions/triggers, policies, views, constraints, indexes, sequences and extensions. Verify their catalog fingerprints after restore, not merely the presence of migration SQL in Git. The synthetic rehearsal verifies routine definitions/ACLs, policies and triggers; production-specific extensions, service roles and Auth behavior still require an actual compatible restore.

Edge Functions require a separate source/configuration backup; they are not supplied by restoring the database. See [Supabase restore coverage](https://supabase.com/docs/guides/platform/clone-project).

| Deployed Function | Version | Verify JWT | Export status |
| --- | --- | --- | --- |
| firecrawl-scrape | 16 | false | **Blocked:** API download returned octet-stream where CLI expected multipart; no verified source export |
| generate-outreach | 17 | false | Source exported; encrypted archive round trip verified |
| chat | 16 | false | Source exported; encrypted archive round trip verified |
| contact | 18 | true | Source exported; encrypted archive round trip verified |
| match-target-fields | 6 | false | Source exported; encrypted archive round trip verified |
| sam-search | 9 | false | Source exported; encrypted archive round trip verified |
| source-api | 6 | false | Source exported; encrypted archive round trip verified |

Preserve entrypoints, shared files, dependencies/import maps, version metadata and JWT configuration. Secret names/digests were inventoried privately, but they do not recover secret values. Confirm a secure, independent secret store with all required provider credentials and encryption keys before claiming recoverability. Do not invoke `contact` or outreach Functions during backup verification: execution may send messages.

## Remaining release gates

1. Obtain a working approved existing admin credential or complete downloadable backup. Take schema/data/role metadata exports with a PostgreSQL 17-compatible client. Do not use the installed PostgreSQL 15 `pg_dump` against PostgreSQL 17. Restore only to an isolated compatible target; the Docker engine is currently unavailable locally. No paid or production resources have been created.
2. Demonstrate a complete production snapshot restore with Auth/profile relationships, all procurement data, lead links/payloads/stages/notes, audit history, scheduler state, custom role/grant contracts, constraints and production Function fingerprints. Custom role passwords must be recoverable through secure escrow separately.
3. Export and restore-verify `firecrawl-scrape` through a supported download path. Confirm all seven Functions and required source dependencies are recoverable; perform any deployment rehearsal only in a separately approved isolated project with outbound effects disabled.
4. Export/hash and independently restore Storage object bytes. A database backup includes Storage metadata, not the actual objects. See [Supabase backup limits](https://supabase.com/docs/guides/platform/backups).
5. Establish independent encrypted off-site database/source/object copies and key/secret recovery. Preserve Render backend source/build and configuration references, and the existing Netlify deployment/configuration rollback reference. Do not treat a machine-bound local archive as the disaster-recovery copy.
6. Complete the runbook's User/Admin acceptance, maintenance window, live check scope and final execution GO. Capture the final C0 recovery point after dispatch is paused and leases drain, before DDL. Existing approval is for preparation, not that cutover.

## Operational caveat

An earlier authenticated Supabase CLI SELECT-only inventory printed `Initialising login role...`; the CLI may have initialized/refreshed a temporary platform database login role. No application-table, migration, scheduler or deployment changes were performed. Further live CLI database queries/dumps/link commands were stopped to avoid that authentication side effect. Do not describe the earlier CLI operation as guaranteed to have left all platform metadata untouched, and do not delete roles to clean it up. The subsequent direct PostgreSQL probe explicitly requests read-only sessions.

## Repeatable local checks

`node tests/integration/scheduling-cutover-restore.mjs` runs the synthetic native rehearsal, stops only its own cluster and never reads a remote connection. `node --import ./tests/offline-only.mjs --test tests/scheduling-cutover.test.mjs` verifies atomic rollback/retry and hold-handler behavior offline. The Edge archive helper refuses to overwrite an existing verification directory; preserve prior receipts rather than deleting them to rerun. `node scripts/verify-scheduling-backup.mjs` is an explicit live read-only credential probe, not part of automated tests and not a backup command.
