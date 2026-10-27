begin;
set local lock_timeout='10s';
-- User confirmed no external writer and authorized retirement after preserving
-- assignments. Replace every live legacy read dependency before a RESTRICT drop.
do $$ declare t text; begin
 foreach t in array array['procurement_action_requests','procurement_event_receipts',
   'procurement_jobs','procurement_registrations','procurement_runs'] loop
  execute format('drop policy if exists staff_read on public.%I',t);
  execute format('create policy procurement_profile_admin_read on public.%I for select to authenticated using ((select public.procurement_is_admin()))',t);
 end loop;
end $$;
insert into public.procurement_events(event_type,dedupe_key,detail)
select 'legacy_procurement_membership_archived','legacy-membership-archive:'||m.id,
 jsonb_build_object('record',to_jsonb(m),'archived_at',now(),
   'reason','Legacy allow-list retired; public.profiles.role is authoritative')
from public.procurement_members m on conflict(dedupe_key) do nothing;
do $$ begin
 if exists(select 1 from public.procurement_members m where not exists(
   select 1 from public.procurement_events e where e.dedupe_key='legacy-membership-archive:'||m.id
   and e.event_type='legacy_procurement_membership_archived' and e.detail->'record'=to_jsonb(m))) then
  raise exception 'Legacy membership archive reconciliation failed';
 end if;
end $$;
-- No CASCADE: an unaccounted dependency aborts the whole archive/retirement.
drop table public.procurement_members restrict;
drop policy procurement_event_visibility on public.procurement_events;
create policy procurement_event_visibility on public.procurement_events as restrictive for select to authenticated
 using ((event_type not like 'source_review_%' and event_type<>'legacy_procurement_membership_archived') or (select public.procurement_is_admin()));
-- New internal review/archive events must never create external notifications.
-- Existing event delivery/receipt behavior for pre-existing event types remains.
create or replace function public.pending_procurement_events(p_consumer text,p_limit integer default 100)
returns setof public.procurement_events language sql stable set search_path='' as $$
 select e.* from public.procurement_events e
 where e.event_type not like 'source_review_%' and e.event_type<>'legacy_procurement_membership_archived'
 and not exists(select 1 from public.procurement_event_receipts r where r.event_id=e.id and r.consumer=p_consumer)
 order by e.created_at,e.id limit greatest(1,least(p_limit,1000));
$$;
commit;
