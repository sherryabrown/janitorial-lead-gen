begin;

-- Settle only audited, finished, failed registry GETs. No capture, import,
-- provider operation, active lease or uncertain persistence is retried here.
create function public.reconcile_procurement_county_reads(p_schedule uuid default null,p_trigger uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare item record; ids uuid[]; changed integer:=0; step uuid;
begin
 if (p_schedule is null)=(p_trigger is null) then raise exception 'One saved schedule or trigger required';end if;
 for item in
  select j.id,j.task_id,j.search_request_id,t.id as trigger_id,t.initiated_by,t.origin,c.source_id
  from public.procurement_jobs j
  join public.procurement_coverage_tasks c on c.id=j.task_id
  join public.procurement_search_requests r on r.id=j.search_request_id
  join public.procurement_trigger_requests link on link.request_id=r.id
  join public.procurement_triggers t on t.id=link.trigger_id
  where j.kind='collect' and j.state='outcome_unknown' and j.lease_token is null
   and c.kind='source_entry' and r.workflow_control->>'admin_policy' in ('county_scope','state_research')
   and t.target_kind='county_scope' and (t.lease_until is null or t.lease_until<=now())
   and (p_schedule is not null and t.schedule_id=p_schedule or p_trigger is not null and t.id=p_trigger)
  order by j.id limit 100 for update of j,t
 loop
  select array_agg(run.id) into ids from public.procurement_runs run where run.job_id=item.id;
  if ids is null or exists(select 1 from public.procurement_runs run where run.id=any(ids) and
   (run.coverage_task_id is distinct from item.task_id or run.source_id is distinct from item.source_id or
    run.finished_at is null or run.status<>'partial' or run.detail->>'collector' is distinct from 'registry-entry' or
    run.detail->>'scope' is distinct from 'entry_only' or run.detail->>'state' is distinct from 'request_pending' or
    coalesce(run.detail->>'reason','') not in ('Network request failed or timed out','Document stream failed'))) or
   exists(select 1 from public.procurement_public_captures where run_id=any(ids)) then continue;end if;
  step:=public.begin_procurement_step(jsonb_build_object('trigger_id',item.trigger_id,'request_id',item.search_request_id,
   'job_id',item.id,'task_id',item.task_id,'source_id',item.source_id,'actor_id',item.initiated_by,'origin',item.origin,
   'phase','reconcile','attempt_key',gen_random_uuid()::text,'reason','public_read_reconciliation'));
  update public.procurement_runs set detail=detail||jsonb_build_object('prior_fetch_state',detail->>'state','state','read_failed','read_only',true,'reconciled_at',now()) where id=any(ids);
  update public.procurement_jobs set state='partial',checkpoint=checkpoint||jsonb_build_object('prior_job_state','outcome_unknown','read_reconciled_run_ids',to_jsonb(ids)),updated_at=now() where id=item.id;
  update public.procurement_coverage_tasks set state='partial',evidence=evidence||jsonb_build_object('read_only_failure',true),updated_at=now() where id=item.task_id;
  perform public.finish_procurement_step(step,'completed',jsonb_build_object('pages',0));
  update public.procurement_triggers t set state='partial',updated_at=now()
   where t.id=item.trigger_id and t.state='outcome_unknown'
    and not exists(select 1 from public.procurement_usage_ledger u where u.trigger_id=t.id and u.state in ('reserved','outcome_unknown'))
    and not exists(select 1 from public.procurement_jobs j join public.procurement_trigger_requests l on l.request_id=j.search_request_id
     where l.trigger_id=t.id and j.state in ('pending','running','outcome_unknown'));
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function public.reconcile_procurement_county_reads(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_procurement_county_reads(uuid,uuid) to service_role;

commit;
