# Read-only inspection of the owner's manual database export

Status: **useful partial backup; not a complete recoverable database snapshot**. No production deployment or mutation was performed.

The owner supplied the local folder named `2026-10-26-2258` and explicitly required read-only treatment. Its folder name is not proof of a single consistent database snapshot time. All inspection output and native PostgreSQL files were written separately, under the workspace's private Git-ignored backup evidence directory or a new temporary local cluster.

## Source integrity

All 124 original files retain the exact SHA-256 hashes and modification timestamps recorded before inspection. The file set is unchanged and no files were added. No commands wrote into the owner's folder.

## Content and restoration checks

- 70 schema text files define 64 tables and six views.
- 54 CSV files contain 20,870 rows. Every CSV parsed with consistent field widths; none has a missing matching table definition. Filename spelling differences were resolved from actual CREATE TABLE names, not guessed from filenames.
- A new isolated PostgreSQL 15.15 cluster restored the supplied `procurement_sources` table definition, indexes and all 102 source rows. Every typed record matched the original CSV, including correctly decoded JSON fields. This verifies that table, not all 64 tables or PostgreSQL 17 compatibility.
- A strict attempt to restore the supplied `profiles` definition failed because `public.app_role` is not exported. No invented enum, fake Auth identities, disabled constraints or placeholder records were used to manufacture success.
- The schema files include 35 trigger declarations, but no Function definitions, type definitions, RLS enablement, policies or grants. The separately preserved 116 public Function definitions are useful complementary evidence; they do not supply the missing security configuration, Auth identities or a single consistent schema/data snapshot.

## Missing coverage

`auth.users` is referenced by exported foreign keys but has no schema/data export. `public.app_role` is required but not defined. `procurement_members` has neither a table definition nor data file. Ten other tables have schema definitions but no CSV. Missing files are not treated as evidence of empty tables.

A separate read-only Management API transaction checked current counts on October 29. It did not read credential verifiers or mutate data:

| Omitted table | Current rows |
| --- | ---: |
| procurement_workflow_steps | 63,449 |
| procurement_public_captures | 3,481 |
| procurement_members | 2 |
| procurement_action_requests | 0 |
| procurement_event_receipts | 0 |
| procurement_lead_links | 0 |
| procurement_schedule_state_memberships | 0 |
| crm_login_attempts | 0 |
| crm_mapping_feedback | 0 |
| debts | 0 |
| smb_logistics_survey_events | 0 |

These are **current** counts, not certified counts at the manual export time. The live role enum currently contains `user` and `admin`, but that read-only observation was not silently substituted into the original export. Combining current supplemental rows with older parent-table CSVs without consistency verification could create an invalid recovery set.

## Release consequence and next action

Do not approve production on the strength of this partial restore. The actual restored-snapshot cutover rehearsal remains incomplete. Obtain a consistent complete database export with required types, Auth/profile identities, all procurement tables/data, Functions, triggers, RLS/policies/grants and sequence/extension metadata through a working approved backup connection or an existing complete backup. The existing [provider support request](2026-10-28-supabase-backup-support-request.md) remains applicable; paid backup features are not required for a manual logical export. Do not reset passwords, mint roles, read privileged authentication material or change production as an inferred part of this inspection.

All seven Edge Function sources/configs, the 116 public database routine definitions and all 2,013 private Storage object bytes remain preserved as described in [the backup evidence](2026-10-28-scheduling-backup-rehearsal.md). They do not turn the table CSV collection into a complete database restore.

Private evidence: `outputs/deployment/scheduling-backup-readiness/manual-export-inspection/` contains the file/CSV inventory, source-integrity receipt, partial native restore receipt, missing-dependency diagnostic and dated current-count evidence. It contains no public report of row contents. The native cluster was stopped after testing; the existing dev preview was not reset.
