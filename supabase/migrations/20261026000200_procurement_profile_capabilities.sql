begin;
create or replace function public.procurement_capabilities()
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select jsonb_build_object('role',p.role::text,'scope','shared_team',
    'revision',p.updated_at,'manage_schedules',p.role::text in ('user','admin'),
    'manage_sources',p.role::text='admin','technical_details',p.role::text='admin')
    from public.profiles p where p.user_id=auth.uid()),
    jsonb_build_object('role',null,'scope','shared_team','revision',null,
      'manage_schedules',false,'manage_sources',false,'technical_details',false));
$$;
revoke all on function public.procurement_capabilities() from public, anon;
grant execute on function public.procurement_capabilities() to authenticated;
create or replace function public.procurement_is_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and role::text='admin');
$$;
revoke all on function public.procurement_is_admin() from public, anon;
grant execute on function public.procurement_is_admin() to authenticated;

-- Restrictive policies close old permissive read policies without replacing
-- service-only worker privileges or introducing a membership gate.
do $$ declare t text; begin
 foreach t in array array['sources','runs','intake_items','registrations','search_requests',
   'request_sources','request_leads','intake_leads','event_receipts','members',
   'request_targets','source_capabilities','coverage_tasks','jobs','action_requests',
   'public_captures','interpretations','extraction_cache','access_handoffs',
   'triggers','trigger_requests','workflow_steps','usage_ledger','schedules',
   'schedule_occurrences','schedule_events','schedule_state_memberships',
   'county_state_research','state_trigger_associations','scheduler_settings','scheduler_deliveries']
 loop
  execute format('create policy procurement_admin_read on public.%I as restrictive for select to authenticated using ((select public.procurement_is_admin()))','procurement_'||t);
 end loop;
end $$;
create policy procurement_event_visibility on public.procurement_events as restrictive
for select to authenticated using (event_type not like 'source_review_%' or (select public.procurement_is_admin()));

-- Business source labels retain their existing coverage meaning while exposing
-- only dates/statuses, never the registry's private technical configuration.
create view public.procurement_source_labels with (security_barrier=true) as
select s.id,s.code,s.name,s.contracting_entity_geo_level,s.business_category,s.url,s.source_coverage_areas,
 jsonb_build_object('research_persistence',jsonb_build_object('coverage_by_scope',
   (select coalesce(jsonb_object_agg(x.key,jsonb_build_object('checked_at',x.value->'checked_at','coverage',
      (select coalesce(jsonb_object_agg(y.key,jsonb_build_object('status',y.value->'status')),'{}'::jsonb)
       from jsonb_each(case when jsonb_typeof(x.value->'coverage')='object' then x.value->'coverage' else '{}'::jsonb end) y))), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(s.config->'research_persistence'->'coverage_by_scope')='object'
      then s.config->'research_persistence'->'coverage_by_scope' else '{}'::jsonb end) x))) as config
from public.procurement_sources s where auth.uid() is not null;
revoke all on public.procurement_source_labels from public,anon;
grant select on public.procurement_source_labels to authenticated,service_role;
comment on table public.procurement_members is 'Legacy staff allow-list retained as historical access evidence; not a role authority or current procurement access gate. Roles come only from public.profiles.role.';
commit;
