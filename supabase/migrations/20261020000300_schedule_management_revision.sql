-- Immutable saved counties and audited never-run deletion. No collection/import changes.
begin;
alter table public.procurement_schedules add column deleted_at timestamptz;
create function public.guard_procurement_schedule_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if old.deleted_at is not null then raise exception 'Schedule deleted; create a new schedule'; end if;
 if old.config->>'target_kind'='county_scope' and
  (new.config->>'target_kind' is distinct from 'county_scope' or
   (select coalesce(jsonb_agg(x order by x),'[]') from (select distinct value x from jsonb_array_elements_text(old.config->'county_ids')) a)
   is distinct from
   (select coalesce(jsonb_agg(x order by x),'[]') from (select distinct value x from jsonb_array_elements_text(new.config->'county_ids')) a)) then
  raise exception 'To change counties, archive this schedule and create a new one';
 end if;
 return new;
end $$;
create trigger procurement_schedule_identity before update on public.procurement_schedules for each row execute function public.guard_procurement_schedule_identity();
-- Existing overview keeps its exact public projection/order; only exclude tombstones.
do $$ declare definition text; begin
 definition:=pg_get_viewdef('public.procurement_schedule_overview'::regclass,true);
 execute 'create or replace view public.procurement_schedule_overview with (security_invoker=true) as '||rtrim(trim(definition),';')||' where s.deleted_at is null';
end $$;
create view public.procurement_schedule_deletion with (security_invoker=true) as
 select s.id,s.deleted_at,not exists(select 1 from public.procurement_triggers t where t.schedule_id=s.id)
 and not exists(select 1 from public.procurement_schedule_occurrences o where o.schedule_id=s.id and (o.trigger_id is not null or o.state='queued')) as can_delete
 from public.procurement_schedules s;
revoke all on public.procurement_schedule_deletion from public,anon,authenticated;
grant select on public.procurement_schedule_deletion to service_role;
create function public.delete_procurement_schedule(p_id uuid,p_actor uuid,p_version integer,p_now timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.procurement_schedules%rowtype;
begin
 if not public.procurement_schedule_owner_active(p_actor,p_now) then raise exception 'Active account required';end if;
 perform pg_advisory_xact_lock(hashtextextended('procurement-schedule-management',0));
 select * into s from public.procurement_schedules where id=p_id for update;
 if not found then raise exception 'Schedule not found';end if;
 if s.deleted_at is not null then
  if s.version=p_version+1 and s.updated_by=p_actor then return true;end if;
  raise exception 'Schedule deleted';
 end if;
 if s.version<>p_version or s.archived_at is not null then raise exception 'Schedule version changed; reload';end if;
 if not (select can_delete from public.procurement_schedule_deletion where id=p_id) then raise exception 'Schedule has run; archive instead';end if;
 update public.procurement_schedules set deleted_at=p_now,archived_at=p_now,enabled=false,next_due_at=null,version=version+1,updated_by=p_actor,updated_at=p_now where id=p_id;
 insert into public.procurement_schedule_events(schedule_id,actor_id,action,version) values(p_id,p_actor,'delete',p_version+1);
 return true;
end $$;
revoke all on function public.delete_procurement_schedule(uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.delete_procurement_schedule(uuid,uuid,integer,timestamptz) to service_role;
revoke all on function public.guard_procurement_schedule_identity() from public,anon,authenticated;
commit;
