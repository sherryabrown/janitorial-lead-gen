-- Approved Oct 7: enable evidence-reviewed source/method registration on the
-- existing restricted backend login. No deletes, accounts or new tables.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='procurement_import_backend') then
    raise exception 'Existing restricted backend login required';
  end if;
end $$;
grant select,insert,update on public.procurement_sources,
  public.procurement_source_capabilities,public.procurement_request_sources
  to procurement_import_backend;
create policy procurement_backend_source_registration_insert on public.procurement_sources
  for insert to procurement_import_backend with check(true);
create policy procurement_backend_source_registration_update on public.procurement_sources
  for update to procurement_import_backend using(true) with check(true);
create policy procurement_backend_method_registration_select on public.procurement_source_capabilities
  for select to procurement_import_backend using(true);
create policy procurement_backend_method_registration_insert on public.procurement_source_capabilities
  for insert to procurement_import_backend with check(true);
create policy procurement_backend_method_registration_update on public.procurement_source_capabilities
  for update to procurement_import_backend using(true) with check(true);
create policy procurement_backend_source_association_select on public.procurement_request_sources
  for select to procurement_import_backend using(true);
create policy procurement_backend_source_association_insert on public.procurement_request_sources
  for insert to procurement_import_backend with check(true);
create policy procurement_backend_source_association_update on public.procurement_request_sources
  for update to procurement_import_backend using(true) with check(true);
commit;
