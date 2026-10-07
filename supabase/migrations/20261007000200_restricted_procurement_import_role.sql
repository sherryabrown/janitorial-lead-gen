-- Dedicated transaction transport for reviewed imports in the existing database.
-- Credentials are provisioned privately; login remains disabled until activation.
create role procurement_import_backend nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2;
alter role procurement_import_backend set statement_timeout = '90s';
alter role procurement_import_backend set idle_in_transaction_session_timeout = '90s';
alter role procurement_import_backend set search_path = public, pg_temp;
do $$ begin
  execute format('grant connect, temporary on database %I to procurement_import_backend', current_database());
end $$;
grant usage on schema public to procurement_import_backend;

do $$ declare t text; begin
  foreach t in array array[
    'procurement_sources','procurement_leads','procurement_intake_items',
    'procurement_intake_leads','procurement_request_leads','procurement_search_requests',
    'procurement_versions','procurement_events','procurement_geographies',
    'procurement_source_capabilities','procurement_request_sources'
  ] loop
    execute format('grant select on public.%I to procurement_import_backend',t);
    execute format('create policy reviewed_import_read on public.%I for select to procurement_import_backend using (true)',t);
  end loop;
  foreach t in array array['procurement_leads','procurement_intake_items','procurement_intake_leads','procurement_request_leads'] loop
    execute format('grant insert, update on public.%I to procurement_import_backend',t);
    execute format('create policy reviewed_import_insert on public.%I for insert to procurement_import_backend with check (true)',t);
    execute format('create policy reviewed_import_update on public.%I for update to procurement_import_backend using (true) with check (true)',t);
  end loop;
  -- Existing invoker triggers append history in the same transaction.
  foreach t in array array['procurement_versions','procurement_events'] loop
    execute format('grant insert on public.%I to procurement_import_backend',t);
    execute format('create policy reviewed_import_history on public.%I for insert to procurement_import_backend with check (true)',t);
  end loop;
end $$;
grant execute on function public.procurement_parse_date(text), public.procurement_parse_deadline(text)
  to procurement_import_backend;
-- No membership in service_role/authenticated; no DELETE/TRUNCATE/DDL grants.
-- Existing signed-in-user policies and permissions remain unchanged.
