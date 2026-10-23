-- One relation, paginated before reporting; existing readers remain unchanged.
begin;
create index procurement_occurrence_run_lookup on public.procurement_schedule_occurrences(schedule_id,trigger_id) where trigger_id is not null;
create index procurement_trigger_activity_order on public.procurement_triggers(schedule_id,created_at desc,id) where schedule_id is not null;
create index procurement_trigger_dispatch_lookup on public.procurement_triggers(schedule_id,occurrence_id) where occurrence_id is not null;
create view public.procurement_schedule_activity with (security_invoker=true) as
select 'run:'||t.id::text as id, t.schedule_id, t.created_at as activity_at,
  t.created_at as run_created_at, o.created_at as occurrence_created_at,
  'run'::text as kind, t.id as trigger_id, t.target_kind, t.origin,
  t.state as outcome, t.config,
  to_jsonb(t) - array['client_key','created_by','scope_hash'] as saved_run,
  to_jsonb(o) as occurrence
from public.procurement_triggers t
left join lateral (
  select o.* from public.procurement_schedule_occurrences o
  where o.schedule_id=t.schedule_id and (o.id=t.occurrence_id or o.trigger_id=t.id)
  order by (o.id=t.occurrence_id) desc nulls last,o.id limit 1
) o on true
where t.schedule_id is not null
union all
select 'attempt:'||o.id::text, o.schedule_id, coalesce(o.effective_at,o.due_at,o.created_at),
  null::timestamptz, o.created_at,
  case when o.trigger_id is null then 'attempt' else 'unavailable_run' end,
  o.trigger_id, o.config->>'target_kind', o.origin,o.state,o.config,
  null::jsonb,to_jsonb(o)
from public.procurement_schedule_occurrences o
where not exists (select 1 from public.procurement_triggers t
  where t.schedule_id=o.schedule_id and (t.id=o.trigger_id or t.occurrence_id=o.id));
revoke all on public.procurement_schedule_activity from public,anon,authenticated;
grant select on public.procurement_schedule_activity to service_role;
commit;
