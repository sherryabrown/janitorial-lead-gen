-- Dedicated native rehearsal area in the existing database. Password remains private.
-- Fail rather than reuse/reset an unknown schema or role.
create role procurement_rehearsal_backend nologin noinherit nosuperuser nocreatedb
  nocreaterole noreplication nobypassrls connection limit 2;
create schema procurement_test;
revoke all on schema procurement_test from public, anon, authenticated, service_role;
grant usage, create on schema procurement_test to procurement_rehearsal_backend;
alter role procurement_rehearsal_backend set search_path = procurement_test, pg_catalog, pg_temp;
alter role procurement_rehearsal_backend set statement_timeout = '90s';
alter role procurement_rehearsal_backend set lock_timeout = '5s';
alter role procurement_rehearsal_backend set idle_in_transaction_session_timeout = '90s';
do $$ begin
  execute format('grant connect, temporary on database %I to procurement_rehearsal_backend',current_database());
end $$;
-- The validator sets its own default privileges inside each rehearsal transaction.
-- This avoids granting the migration caller membership in the isolated login.

-- Existing 20261007000300 removed PUBLIC access to the three callable helpers.
-- No new grant, policy or membership gives the validator production access.
do $$ declare t record; f record;
begin
  for t in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage') and c.relkind in ('r','p','v','m','S') loop
    if (select relkind from pg_class where oid=t.oid)='S' then
      if has_sequence_privilege('procurement_rehearsal_backend',t.oid,'USAGE,SELECT,UPDATE') then
        raise exception 'Validator inherits production sequence access'; end if;
    elsif has_table_privilege('procurement_rehearsal_backend',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Validator inherits production table access';
    end if;
  end loop;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','auth','storage') and p.prosecdef
      and p.prorettype <> 'trigger'::regtype loop
    if has_function_privilege('procurement_rehearsal_backend',f.oid,'EXECUTE') then
      raise exception 'Validator inherits privileged helper access'; end if;
  end loop;
end $$;
