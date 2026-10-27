-- Authorized exception to the procurement-only table boundary: prevent browser
-- profile writes from assigning roles. Existing trusted server/operator writes
-- and ordinary profile edits retain their current behavior.
begin;
create or replace function public.procurement_guard_profile_role()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if (tg_op = 'INSERT' and new.role::text <> 'user')
       or (tg_op = 'UPDATE' and new.role is distinct from old.role) then
      raise exception using errcode = '42501', message = 'Role changes require the trusted account administration process';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.procurement_guard_profile_role() from public, anon, authenticated;
create trigger procurement_protect_profile_role
before insert or update on public.profiles
for each row execute function public.procurement_guard_profile_role();
commit;
