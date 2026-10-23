-- Enrich existing transactional events; no new audit table or RPC contract.
begin;
create function public.procurement_schedule_audit_values(s public.procurement_schedules) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('name',s.name,'frequency',s.recurrence->'frequency','timezone',s.recurrence->'timezone',
 'local_times',s.recurrence->'local_times','weekdays',s.recurrence->'weekdays','month_day',s.recurrence->'month_day',
 'categories',s.config->'requested_categories','window_policy',s.window_policy,
 'maintain_sources',s.config->'maintain_sources','check_updates',s.config->'check_updates',
 'state_trigger_ids',coalesce(s.config->'state_trigger_ids',jsonb_build_array(s.config->>'state_trigger_id')),
 'enabled',s.enabled,'archived_at',s.archived_at,'deleted_at',s.deleted_at,'blocker',s.blocker);
$$;
create function public.capture_procurement_schedule_changes() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; current_values jsonb; differences jsonb;
begin
 prior:=case when tg_op='INSERT' then '{}'::jsonb else public.procurement_schedule_audit_values(old) end;
 current_values:=public.procurement_schedule_audit_values(new);
 select coalesce(jsonb_agg(jsonb_build_object('field',e.key,'before',prior->e.key,'after',e.value) order by e.key),'[]')
 into differences from jsonb_each(current_values) e where prior->e.key is distinct from e.value;
 -- Transaction-local, per schedule/version. The event writer consumes this once.
 perform set_config('procurement.schedule_audit',
 (coalesce(nullif(current_setting('procurement.schedule_audit',true),'')::jsonb,'{}'::jsonb)||jsonb_build_object(new.id::text||':'||new.version,jsonb_build_object('version',1,'changes',differences)))::text,true);
 return new;
end $$;
create trigger procurement_schedule_capture_changes after insert or update on public.procurement_schedules
 for each row execute function public.capture_procurement_schedule_changes();
create function public.enrich_procurement_schedule_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare entry_key text; saved jsonb; audit jsonb;
begin
 if new.action not in ('created','edited','pause','resume','archive','delete','owner_inactive') then return new;end if;
 entry_key:=new.schedule_id::text||':'||new.version;
 saved:=coalesce(nullif(current_setting('procurement.schedule_audit',true),'')::jsonb,'{}'::jsonb);
 audit:=saved->entry_key;
 if audit is not null then
  perform set_config('procurement.schedule_audit',(saved-entry_key)::text,true);
  if audit->'changes'='[]'::jsonb then return null;end if;
  new.summary:=new.summary||jsonb_build_object('audit',audit);
 end if;
 return new;
end $$;
create trigger procurement_schedule_enrich_event before insert on public.procurement_schedule_events
 for each row execute function public.enrich_procurement_schedule_event();
revoke all on function public.procurement_schedule_audit_values(public.procurement_schedules) from public,anon,authenticated;
revoke all on function public.capture_procurement_schedule_changes() from public,anon,authenticated;
revoke all on function public.enrich_procurement_schedule_event() from public,anon,authenticated;
commit;
