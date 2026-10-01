-- ONLY for the explicitly selected disposable environment, never production.
create table public.procurement_test_environment (purpose text primary key);
alter table public.procurement_test_environment enable row level security;
revoke all on public.procurement_test_environment from public, anon, authenticated;
grant select on public.procurement_test_environment to service_role;
insert into public.procurement_test_environment values ('disposable-access-tests');
notify pgrst, 'reload schema';
