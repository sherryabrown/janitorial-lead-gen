-- Run only as reviewed deployment step after migrations and backend deployment.
-- Secret setup is separate: Vault name procurement_scheduler_wake_key must match
-- Render PROCUREMENT_SCHEDULER_KEY. Never paste secret values into this file.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='procurement_scheduler_wake_key' and length(decrypted_secret)>=32) then
  raise exception 'Install matching private wake key before activation';
 end if;
end$$;
select cron.schedule('procurement-scheduler-dispatch','* * * * *','select public.procurement_scheduler_dispatch();');
update public.procurement_scheduler_settings set enabled=true where id;
commit;
