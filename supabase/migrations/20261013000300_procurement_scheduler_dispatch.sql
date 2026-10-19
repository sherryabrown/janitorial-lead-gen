-- Private wake state. No extensions or recurring job are activated by this migration.
begin;
create table public.procurement_scheduler_settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into public.procurement_scheduler_settings values(true,false);
create table public.procurement_scheduler_deliveries (
 id uuid primary key default gen_random_uuid(),net_request_id bigint unique,state text not null check(state in ('pending','accepted','failed','timed_out','outcome_unknown')),
 sent_at timestamptz not null default now(),observed_at timestamptz,status_code integer
);
create index procurement_scheduler_delivery_pending on public.procurement_scheduler_deliveries(sent_at) where state='pending';
create index procurement_scheduler_delivery_history on public.procurement_scheduler_deliveries(sent_at desc,id);
create function public.procurement_scheduler_needs_wake(p_now timestamptz default now()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.procurement_schedules where enabled and next_due_at<=p_now) or
 (not exists(select 1 from public.procurement_jobs where state='running' and lease_until>p_now) and
  not exists(select 1 from public.procurement_triggers where state='running' and lease_until>p_now) and
  (exists(select 1 from public.procurement_triggers where (state='pending' or state='running' and lease_until<p_now) and public.procurement_scheduled_trigger_runnable(id)) or
   exists(select 1 from public.procurement_jobs where (dedupe_key like 'api-workflow:%' or dedupe_key like 'api-import:%' or dedupe_key like 'api-sam:%') and
   (state='pending' or state='running' and lease_until<p_now) and public.procurement_scheduled_request_runnable(search_request_id))));
$$;
create function public.procurement_scheduler_dispatch() returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text;request bigint;row record;
begin
 perform pg_advisory_xact_lock(hashtextextended('procurement-scheduler-delivery',0));
 if not exists(select 1 from public.procurement_scheduler_settings where enabled) then return '{"state":"disabled"}';end if;
 if to_regclass('net._http_response') is null or to_regclass('vault.decrypted_secrets') is null then return '{"state":"infrastructure_missing"}';end if;
 -- Persist only transport status, never response content or raw error text.
 for row in execute 'select d.id,r.status_code,r.timed_out from public.procurement_scheduler_deliveries d join net._http_response r on r.id=d.net_request_id where d.state=''pending''' loop
  update public.procurement_scheduler_deliveries set state=case when row.timed_out then 'timed_out' when row.status_code between 200 and 299 then 'accepted' when row.status_code is not null then 'failed' else 'outcome_unknown' end,
   status_code=row.status_code,observed_at=now() where id=row.id;
 end loop;
 update public.procurement_scheduler_deliveries set state='outcome_unknown',observed_at=now() where state='pending' and sent_at<now()-interval '3 minutes';
 if not public.procurement_scheduler_needs_wake() then return '{"state":"idle"}';end if;
 if exists(select 1 from public.procurement_scheduler_deliveries where state='pending' or sent_at>now()-interval '1 minute') then return '{"state":"delivery_pending"}';end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=''procurement_scheduler_wake_key''' into secret;
 if secret is null or length(secret)<32 then return '{"state":"authorization_missing"}';end if;
 execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=90000)' into request
 using 'https://janitorial-procurement-backend.onrender.com/internal/procurement-scheduler/tick',
 jsonb_build_object('Content-Type','application/json','x-procurement-scheduler-key',secret),'{}'::jsonb;
 insert into public.procurement_scheduler_deliveries(net_request_id,state)values(request,'pending');
 return jsonb_build_object('state','sent','delivery_request_id',request);
end $$;
create function public.procurement_scheduler_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',(select enabled from public.procurement_scheduler_settings where id),
  'extensions_ready',(select count(*)=3 from pg_extension where extname in ('pg_cron','pg_net','supabase_vault')),
  'latest_delivery',(select jsonb_build_object('state',state,'sent_at',sent_at,'status_code',status_code) from public.procurement_scheduler_deliveries order by sent_at desc,id limit 1));
$$;
alter table public.procurement_scheduler_settings enable row level security;
revoke all on public.procurement_scheduler_settings from public,anon,authenticated;
grant select,insert,update on public.procurement_scheduler_settings to service_role;
alter table public.procurement_scheduler_deliveries enable row level security;
revoke all on public.procurement_scheduler_deliveries from public,anon,authenticated;
grant select,insert,update on public.procurement_scheduler_deliveries to service_role;
revoke all on function public.procurement_scheduler_needs_wake(timestamptz) from public,anon,authenticated;
grant execute on function public.procurement_scheduler_needs_wake(timestamptz) to service_role;
revoke all on function public.procurement_scheduler_dispatch() from public,anon,authenticated;
grant execute on function public.procurement_scheduler_dispatch() to service_role;
revoke all on function public.procurement_scheduler_status() from public,anon,authenticated;
grant execute on function public.procurement_scheduler_status() to service_role;
commit;
