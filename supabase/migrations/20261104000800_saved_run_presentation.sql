begin;
-- Current workflow presentation stays a read of saved status, not frozen lead facts.
create function public.procurement_saved_run_presentation(p_trigger uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype; children jsonb; jobs jsonb; tasks uuid[]; attention uuid[]; child jsonb; cj jsonb; automatic jsonb; staged uuid[]; item jsonb;
begin
 select * into t from public.procurement_triggers where id=p_trigger;
 if not found or t.target_kind<>'county_scope' or t.state not in ('needs_review','partial','completed') then return null;end if;
 if public.procurement_saved_usage(p_trigger)->>'ai'='unknown' then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',c.request_id,'role',c.role)),'[]') into children from public.procurement_trigger_requests c where trigger_id=p_trigger;
 if jsonb_array_length(children)=0 or exists(select 1 from public.procurement_trigger_requests c join public.procurement_search_requests r on r.id=c.request_id where c.trigger_id=p_trigger and (r.workflow_control->>'cancelled'='true' or r.workflow_control->>'paused'='true')) then return null;end if;
 if exists(select 1 from public.procurement_trigger_requests c join public.procurement_jobs j on j.search_request_id=c.request_id where c.trigger_id=p_trigger and j.state in ('pending','running','outcome_unknown','cancelled','paused')) then return null;end if;
 with all_jobs as materialized (
  select j.* from public.procurement_trigger_requests c join public.procurement_jobs j on j.search_request_id=c.request_id where c.trigger_id=p_trigger
 ), effective as (
  select j.* from all_jobs j left join public.procurement_coverage_tasks task on task.id=coalesce(j.task_id,case when j.checkpoint->>'task_id' ~* '^[a-f0-9-]{36}$' then (j.checkpoint->>'task_id')::uuid end)
  where j.kind not in ('collect','discover') or task.id is null or task.state not in ('reviewed_no_results','reviewed_with_results','superseded') and (
   j.id=(select n.id from all_jobs n where n.kind=j.kind and coalesce(n.task_id::text,n.checkpoint->>'task_id')=coalesce(j.task_id::text,j.checkpoint->>'task_id') order by n.updated_at desc,n.id desc limit 1)
   or (select n.state from all_jobs n where n.kind=j.kind and coalesce(n.task_id::text,n.checkpoint->>'task_id')=coalesce(j.task_id::text,j.checkpoint->>'task_id') order by n.updated_at desc,n.id desc limit 1)<>'succeeded')
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'search_request_id',search_request_id,'task_id',task_id,'kind',kind,'state',state,'dedupe_key',dedupe_key,'checkpoint',checkpoint)),'[]') into jobs from effective;
 if exists(select 1 from jsonb_array_elements(jobs) j where nullif(j#>>'{checkpoint,error_code}','') is not null) then return null;end if;
 select coalesce(array_agg(task.id),'{}'),coalesce(array_agg(task.id) filter(where public.procurement_saved_source_attention(task.id) is not null),'{}') into tasks,attention
 from public.procurement_trigger_requests c join public.procurement_request_targets target on target.search_request_id=c.request_id join public.procurement_coverage_tasks task on task.target_id=target.id where c.trigger_id=p_trigger;
 if cardinality(attention)=0 then return null;end if;
 for child in select value from jsonb_array_elements(children) loop
  select coalesce(jsonb_agg(value),'[]') into cj from jsonb_array_elements(jobs) where value->>'search_request_id'=child->>'request_id';
  select coalesce(jsonb_agg(value),'[]') into automatic from jsonb_array_elements(cj) where value#>>'{checkpoint,automatic,policy}'='county-automatic-v1';
  if jsonb_array_length(automatic)>0 and (
    exists(select 1 from jsonb_array_elements(automatic) a where coalesce(a#>>'{checkpoint,receipt,verified}','false')<>'true' or a->>'state'='blocked' or a#>>'{checkpoint,stage}'='import_reconcile')
    or exists(select 1 from jsonb_array_elements(cj) a where a->>'dedupe_key' like 'api-import:%' and (a->>'state'='outcome_unknown' or a#>>'{checkpoint,stage}'='import_reconcile'))
    or exists(select 1 from jsonb_array_elements(automatic) a cross join lateral jsonb_array_elements(coalesce(a#>'{checkpoint,automatic,exclusions}','[]')) e
     where not exists(select 1 from jsonb_array_elements(automatic) v cross join lateral jsonb_array_elements(coalesce(v#>'{checkpoint,county_records}','[]')) r cross join lateral jsonb_array_elements_text(coalesce(r->'intake_ids','[]')) i where v#>>'{checkpoint,receipt,verified}'='true' and i=e->>'intake_id'))
   ) then return null;end if;
  select coalesce(array_agg(i::uuid),'{}') into staged from public.procurement_interpretations interpretation cross join lateral jsonb_array_elements_text(coalesce(interpretation.staging_receipt->'intake_ids','[]')) i
   where interpretation.request_id=(child->>'request_id')::uuid and interpretation.is_current is not false;
  if cardinality(staged)>0 and jsonb_array_length(automatic)=0 then return null;end if;
  if exists(select 1 from unnest(staged) i where not exists(select 1 from public.procurement_intake_items intake where intake.id=i and intake.status='processed')
   or not exists(select 1 from public.procurement_intake_leads il join public.procurement_request_leads rl on rl.lead_id=il.lead_id and rl.search_request_id=(child->>'request_id')::uuid where il.intake_id=i)) then return null;end if;
  for item in select value from jsonb_array_elements(cj) where value->>'state' not in ('succeeded','partial') loop
   if item#>>'{checkpoint,automatic,policy}'='county-automatic-v1' or left(item#>>'{checkpoint,stage}',7)='import_' then return null;end if;
   if child->>'role'='county' and item->>'dedupe_key'='api-workflow:'||(child->>'request_id') and item#>>'{checkpoint,stage}'='interpret' then continue;end if;
   if item->>'kind' not in ('collect','discover') or not exists(select 1 from unnest(attention) task_id where task_id::text=coalesce(item->>'task_id',item#>>'{checkpoint,task_id}')) or item->>'kind'='discover' and item#>>'{checkpoint,stage}'='discovery_review' then return null;end if;
  end loop;
 end loop;
 return jsonb_build_object('outcome','source_attention','attention_count',cardinality(attention));
end $$;
create function public.procurement_saved_children(p_trigger uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('request_id',c.request_id,'county_id',c.county_id,'role',c.role)||case when c.role='state_source' then jsonb_build_object(
  'source_id',coalesce(c.scope->'source_id',(select s->'source_id' from jsonb_array_elements(coalesce(t.config->'state_sources','[]')) s where s->>'id'=coalesce(c.scope->>'id',t.config->>'state_trigger_id') limit 1)),
  'source_name',(select s->'name' from jsonb_array_elements(coalesce(t.config->'state_sources','[]')) s where s->>'id'=coalesce(c.scope->>'id',t.config->>'state_trigger_id') limit 1),'category',c.scope->'category') else '{}' end order by c.request_id),'[]')
 from public.procurement_trigger_requests c join public.procurement_triggers t on t.id=c.trigger_id where c.trigger_id=p_trigger;
$$;
revoke all on function public.procurement_saved_run_presentation(uuid),public.procurement_saved_children(uuid) from public,anon,authenticated;
commit;
