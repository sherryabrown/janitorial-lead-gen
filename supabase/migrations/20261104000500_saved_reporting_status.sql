begin;
create function public.procurement_saved_source_attention(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare task public.procurement_coverage_tasks%rowtype; c jsonb; j public.procurement_jobs%rowtype; detail_job public.procurement_jobs%rowtype; reason text; http text; kind text; blocker text; next_action text; action_kind text='evidence';
begin
 select * into task from public.procurement_coverage_tasks where id=p_task;
 if task.state not in ('source_missing','method_missing','partial','blocked') then return null;end if;
 if exists(select 1 from public.procurement_jobs where (task_id=p_task or checkpoint->>'task_id'=p_task::text) and state in ('pending','running','outcome_unknown')) then return null;end if;
 select * into j from public.procurement_jobs where task_id=p_task or checkpoint->>'task_id'=p_task::text order by updated_at desc,id limit 1;c=coalesce(j.checkpoint,'{}');
 select * into detail_job from public.procurement_jobs d where d.checkpoint#>>array['bonfire_details',p_task::text,'source_id']=task.source_id::text order by d.updated_at desc,d.id limit 1;
 reason=coalesce(c->>'blocker',task.evidence->>'reason',task.reason,'');http=substring(reason from '^HTTP (\d{3})$');
 if c->>'error_code' is not null then kind='diagnostic';blocker='This source check stopped with a workflow error.';next_action='Inspect the saved diagnostic before resuming.';
 elsif c#>>'{hosted_browser_attempt,failure_code}'='human_verification_required' or jsonb_array_length(coalesce(c->'bonfire_access_holds','[]'))>0 then kind='manual_action';blocker='Portal access or human verification is required.';next_action='Review the saved access requirement; verification may need a person.';
 elsif exists(select 1 from jsonb_array_elements(coalesce(detail_job.checkpoint#>array['bonfire_details',p_task::text,'projects'],'[]')) p where jsonb_array_length(coalesce(p->'evidence','[]'))=0) then
  if detail_job.state in ('pending','running','outcome_unknown') then return null;end if;
  kind='details';blocker='Project details have not been captured or verified.';next_action='View saved portal evidence; project detail access or collection support needs verification.';
 elsif reason='Website verification required' then kind='automation';blocker='The website returned a verification page instead of its public listing.';next_action='Ask the website operator for supported automated access or a public feed.';
 elsif http in ('401','403') then kind='access';blocker='The website denied access (HTTP '||http||').';next_action='View saved evidence to determine the access requirement.';
 elsif http='202' then kind='automation';blocker='The website returned HTTP 202 without a usable listing.';next_action='A developer needs to verify supported automated access; a working browser page alone does not establish collection.';
 elsif http in ('408','429') or http::integer>=500 or reason='Network request failed or timed out' then
  kind='unavailable';blocker=case when http is null then 'The website request failed or timed out.' else 'The website did not complete the check (HTTP '||http||').' end;
  if exists(select 1 from public.procurement_jobs d where (d.task_id=p_task or d.checkpoint->>'task_id'=p_task::text) and d.kind='discover' and d.state='blocked' and d.checkpoint->>'automation_policy'='county-public-v1' and d.checkpoint->>'stage' in ('discovery_resolve','discovery_capture','discovery_verify') order by d.updated_at desc,d.id limit 1) then action_kind='retry';next_action='Retry the source check or view saved evidence.';else next_action='View saved evidence; the website may be temporarily unavailable.';end if;
 elsif reason='Document exceeds verified byte bound' or reason ~ '^(Response (body )?(exceeds|exceeded)|Declared response|Page bound reached|ARDOT (page bound|reported total exceeds))' then kind='limit';blocker='Collection exceeded the supported size or page limit.';next_action='View saved evidence; a developer needs to adjust collection support.';
 elsif reason like 'Unsupported content type:%' then kind='automation';blocker='This content format is not supported by the collector.';next_action='View saved evidence; a developer needs to add collection support.';
 elsif task.state='source_missing' then kind='source_missing';blocker='No usable official source has been verified.';next_action='View checked evidence; manual research is needed to identify the official procurement channel.';
 elsif task.state='method_missing' or c->'verification_failures' ? 'No supported opportunity listing heading' then kind='unverified';blocker='No supported procurement listing has been verified.';next_action='View saved evidence; a developer needs to verify the listing or its collection method.';
 else kind='unknown';blocker='This source check could not finish.';next_action='Inspect saved evidence to determine the next step.';end if;
 return jsonb_build_object('kind',kind,'blocker',blocker,'next_action',next_action,'action_kind',action_kind);
end $$;

create function public.procurement_saved_integer(v jsonb) returns boolean
language sql immutable set search_path='' as $$ select case when jsonb_typeof(v)='number' then (v::text)::numeric=trunc((v::text)::numeric) else false end $$;
create function public.procurement_saved_usage_summary(entries jsonb) returns jsonb
language sql immutable set search_path='' as $$
 with sent as (select value e from jsonb_array_elements(entries) where value->>'state'<>'not_sent'),
 actual as (select e from sent where e->>'state'='completed' and public.procurement_saved_integer(e#>'{usage,input_tokens}') and public.procurement_saved_integer(e#>'{usage,output_tokens}')),
 flags as (select exists(select 1 from sent where e->>'state' in ('reserved','outcome_unknown') or e->>'state'='completed' and coalesce(e#>>'{usage,quota_rejection}','false')<>'true' and (not public.procurement_saved_integer(e#>'{usage,input_tokens}') or not public.procurement_saved_integer(e#>'{usage,output_tokens}'))) unknown),
 credits as (select e from actual where jsonb_typeof(e#>'{usage,credits}')='number' and (e#>>'{usage,credits}')::numeric>=0 and e#>>'{usage,credit_unit}' ~ '^[a-zA-Z][a-zA-Z0-9 _-]{0,31}$')
 select jsonb_build_object('ai',case when unknown then 'unknown' when exists(select 1 from actual) then 'used' else 'not_used' end,'calls',(select count(*) from sent),
 'input_tokens',case when unknown then null else coalesce((select sum((e#>>'{usage,input_tokens}')::numeric) from actual),0) end,
 'output_tokens',case when unknown then null else coalesce((select sum((e#>>'{usage,output_tokens}')::numeric) from actual),0) end,
 'actual_usd',case when unknown then null else coalesce((select sum(coalesce((e->>'actual_usd')::numeric,0)) from sent),0) end,
 'known_actual_usd',coalesce((select sum(coalesce((e->>'actual_usd')::numeric,0)) from sent),0),
 'held_usd',coalesce((select sum((e->>'reserved_usd')::numeric) from sent where e->>'state' in ('reserved','outcome_unknown')),0),
 'credits',case when not unknown and (select count(*) from actual)>0 and (select count(*) from credits)=(select count(*) from actual) and (select count(distinct e#>>'{usage,credit_unit}') from credits)=1 then (select sum((e#>>'{usage,credits}')::numeric) from credits) else null end,
 'credit_unit',case when not unknown and (select count(*) from actual)>0 and (select count(*) from credits)=(select count(*) from actual) and (select count(distinct e#>>'{usage,credit_unit}') from credits)=1 then (select min(e#>>'{usage,credit_unit}') from credits) else null end) from flags;
$$;
create or replace function public.procurement_saved_usage(p_trigger uuid,p_step uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.procurement_saved_usage_summary(coalesce(jsonb_agg(jsonb_build_object('state',state,'usage',usage,'actual_usd',actual_usd,'reserved_usd',reserved_usd)),'[]'))
 from public.procurement_usage_ledger where trigger_id=p_trigger and (p_step is null or step_id=p_step);
$$;
revoke all on function public.procurement_saved_source_attention(uuid),public.procurement_saved_integer(jsonb),public.procurement_saved_usage_summary(jsonb) from public,anon,authenticated;
commit;
