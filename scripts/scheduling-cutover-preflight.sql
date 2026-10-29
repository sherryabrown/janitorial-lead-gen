-- Read-only operator preflight. Use the approved privileged connection to
-- zreplhkoxswtzxlchtjf, never the restricted importer/rehearsal connection.
begin read only;
set local statement_timeout='15s';
select current_database(),current_user,now() as observed_at;
select role::text,count(*) as profiles from public.profiles group by role order by role;
select pg_get_constraintdef(oid) as profile_identity_constraint from pg_constraint
 where conrelid='public.profiles'::regclass and contype in ('u','f');
select count(*) as procurement_base_tables from pg_tables
 where schemaname='public' and tablename like 'procurement\_%' escape '\';
select count(*) as legacy_membership_rows from public.procurement_members;
select count(*) as existing_legacy_archive_rows from public.procurement_events
 where event_type='legacy_procurement_membership_archived';
select enabled as scheduler_enabled from public.procurement_scheduler_settings where id;
select state,count(*) as jobs,count(*) filter(where state='running' and
 (lease_until is null or lease_until>now())) as active_or_unbounded_leases
 from public.procurement_jobs group by state order by state;
select state,count(*) as triggers,count(*) filter(where state='running' and
 (lease_until is null or lease_until>now())) as active_or_unbounded_leases
 from public.procurement_triggers group by state order by state;
select state,count(*) as deliveries from public.procurement_scheduler_deliveries group by state;
select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');
select name,to_regprocedure(name) is not null as present,
 md5(pg_get_functiondef(to_regprocedure(name))) as definition_digest
 from (values ('public.claim_procurement_known_job(uuid)'),
 ('public.claim_procurement_workflow_job_before_admin()'),
 ('public.pending_procurement_events(text,integer)')) as expected(name);
select tgname from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal;
-- Read metadata only. Missing access/history is a stop, not permission to
-- manufacture a migration ledger or apply the whole migrations directory.
select version from supabase_migrations.schema_migrations where version in
 ('20261023000400','20261026000100','20261026000200','20261026000300',
  '20261026000400','20261026000500','20261027000100','20261028000100') order by version;
commit;
