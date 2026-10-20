-- Read-only schedule reporting; execution/mutation semantics are unchanged.
begin;
create index if not exists procurement_trigger_schedule_latest on public.procurement_triggers(schedule_id,created_at desc,id desc) where schedule_id is not null;
create view public.procurement_schedule_overview with (security_invoker=true) as
select s.*,s.config->>'target_kind' as target_kind,
 case when s.archived_at is not null then 'archived' when s.enabled then 'active' else 'paused' end as lifecycle,
 s.recurrence->>'frequency' as frequency,
 r.created_at as last_run_at,
 case when r.id is null then null else jsonb_build_object('id',r.id,'state',r.state,'target_kind',r.target_kind,'config',r.config,'origin',r.origin,'created_at',r.created_at,'finished_at',r.finished_at) end as last_run,
 case when o.id is null then null else jsonb_build_object('id',o.id,'state',o.state,'reason',o.reason,'trigger_id',o.trigger_id,'created_at',o.created_at,'due_at',o.due_at) end as latest_occurrence
from public.procurement_schedules s
left join lateral(select t.* from public.procurement_triggers t where t.schedule_id=s.id order by t.created_at desc,t.id desc limit 1) r on true
left join lateral(select e.* from public.procurement_schedule_occurrences e where e.schedule_id=s.id order by e.created_at desc,e.id desc limit 1) o on true;
revoke all on public.procurement_schedule_overview from public,anon,authenticated;
grant select on public.procurement_schedule_overview to service_role;
commit;
