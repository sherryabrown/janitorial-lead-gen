begin;
create function public.procurement_saved_metric(n bigint,complete boolean,reason text) returns jsonb
language sql immutable set search_path='' as $$ select jsonb_build_object('value',case when complete then n else null end,'known_subtotal',n,'completeness',case when complete then 'known' when n>0 then 'partial' else 'unknown' end)||case when complete then '{}' else jsonb_build_object('reason',reason) end $$;

create function public.procurement_saved_analytics(f jsonb,p_admin boolean,p_members boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare boundary timestamptz=coalesce((f->>'as_of')::timestamptz,now());
 from_day date; through_day date; start_at timestamptz; end_at timestamptz;
 all_time boolean=coalesce(f->>'period','custom')='all';
 run_ids uuid[]; t public.procurement_triggers%rowtype; r jsonb; h jsonb; m jsonb; prior jsonb; outcome text; k text; cat text=coalesce(f->>'category','');
 records jsonb='{}'; issues jsonb='{}'; run_records jsonb; selected jsonb; public_runs jsonb='[]'; summary jsonb; result jsonb; members jsonb;
 counts jsonb; per_run jsonb='{"added":0,"updated":0,"unchanged":0}'; cats jsonb='{}'; outs jsonb='{}';
 complete boolean=true; category_complete boolean=true; rc boolean; cc boolean;
 attention_complete boolean=true; run_attention boolean; candidate_ids uuid[]='{}'; source_ids uuid[]='{}'; gap_keys text[]='{}';
 metric_name text=f->>'member_metric'; fp text; identity_fp text; known bigint; n bigint; samples numeric[]='{}'; durations jsonb;
 lim integer=coalesce((f->>'limit')::integer,25); off integer=coalesce((f->>'offset')::integer,0); total integer; ct integer;
 first_run timestamptz; last_run timestamptz; verified_runs integer=0;
 ledger jsonb; usage jsonb; filters jsonb; item record; run_issues integer; run_sources uuid[]; run_gaps text[];
begin
 from_day=coalesce(nullif(f->>'from','')::date,(boundary at time zone 'America/Chicago')::date-6);
 through_day=coalesce(nullif(f->>'through','')::date,(boundary at time zone 'America/Chicago')::date);
 if lim<1 or lim>100 or off<0 or boundary>now()+interval '1 second' or from_day>through_day or not all_time and through_day-from_day>366
  or coalesce(f->>'period','custom') not in ('all','custom') or all_time and (coalesce(f->>'run','')='' and (coalesce(f->>'schedule','')='' or f->>'schedule'='none'))
  or cat not in ('','forecast','opportunity','award') or coalesce(f->>'sort','created_at') not in ('created_at','added','updated','unchanged','activity') or coalesce(f->>'direction','desc') not in ('asc','desc')
  or metric_name is not null and metric_name not in ('unique_leads','added','updated','unchanged','forecast','opportunity','award','historical_opportunities','unclassified_known_leads','candidates_attention','validation_failures','sources_attention','route_gaps') then raise exception 'Invalid analytics filters';end if;
 start_at=case when all_time then null else from_day::timestamp at time zone 'America/Chicago' end;
 end_at=case when all_time then boundary else (through_day+1)::timestamp at time zone 'America/Chicago' end;
 filters=jsonb_build_object('schedule',coalesce(f->>'schedule',''),'run',coalesce(f->>'run',''),'target',coalesce(f->>'target',''),'geography',coalesce(f->>'geography',''),'origin',coalesce(f->>'origin',''),'outcome',coalesce(f->>'outcome',''),
  'from',from_day,'through',through_day,'category',cat,'period',case when all_time then 'all' else 'custom' end,'as_of',boundary,'sort',coalesce(f->>'sort','created_at'),'direction',coalesce(f->>'direction','desc'),'start',start_at,'end',end_at);
 select coalesce(array_agg(id order by created_at,id),'{}'),count(*),min(created_at),max(created_at) into run_ids,total,first_run,last_run
 from (select t.id,t.created_at from public.procurement_triggers t where t.created_at<=boundary and (start_at is null or t.created_at>=start_at) and t.created_at<end_at
  and (coalesce(f->>'schedule','')='' or f->>'schedule'='none' and t.schedule_id is null or t.schedule_id::text=f->>'schedule')
  and (coalesce(f->>'run','')='' or t.id::text=f->>'run') and (coalesce(f->>'target','')='' or t.target_kind=f->>'target')
  and (coalesce(f->>'origin','')='' or t.origin=f->>'origin') and (coalesce(f->>'outcome','')='' or t.state=f->>'outcome')
  and (coalesce(f->>'geography','')='' or f->>'geography'='05' and t.target_kind in ('state_source','sam') or t.config->'county_ids' ? (f->>'geography'))
  and (cat='' or t.config->'requested_categories' ? cat) limit 2000) bounded;
 if total>=2000 then return jsonb_build_object('unavailable','This report exceeds its read bound. Select a shorter period or narrower scope; no truncated totals are shown.');end if;
 -- Match the existing bounded relation reads before expanding saved evidence.
 if (select count(*) from (select j.id from public.procurement_jobs j where j.search_request_id in
   (select request_id from public.procurement_trigger_requests where trigger_id=any(run_ids)) limit 10000) b)>=10000
  or (select count(*) from (select task.id from public.procurement_coverage_tasks task join public.procurement_request_targets target on target.id=task.target_id
   where target.search_request_id in (select request_id from public.procurement_trigger_requests where trigger_id=any(run_ids)) limit 10000) b)>=10000 then
  return jsonb_build_object('unavailable','This report exceeds its read bound. Select a shorter period or narrower scope; no truncated totals are shown.');
 end if;
 select count(*) into ct from public.procurement_workflow_steps where trigger_id=any(run_ids);
 for t in select * from public.procurement_triggers where id=any(run_ids) order by created_at,id loop
  select case when source_version=t.reporting_source_version then result else null end into h from public.procurement_run_results where trigger_id=t.id;
  rc=coalesce((h->>'complete')::boolean,false) and t.state='completed';cc=coalesce((h->>'category_complete')::boolean,false);
  if t.config->>'check_updates'='false' then rc=true;cc=true;end if;
  complete=complete and rc;category_complete=category_complete and cc;
  run_records=public.procurement_saved_run_members(t.id);
  identity_fp=public.procurement_reporting_hash(run_records);
  if cat<>'' then select coalesce(jsonb_agg(value order by value->>'id'),'[]') into run_records from jsonb_array_elements(run_records) where value->'categories' ? cat;complete=complete and cc;end if;
  counts='{"added":0,"updated":0,"unchanged":0}';
  for m in select value from jsonb_array_elements(run_records) loop
   outcome=m->>'outcome';counts=jsonb_set(counts,array[outcome],to_jsonb((counts->>outcome)::bigint+1));
   prior=records->(m->>'id');
   if prior is not null then
    if prior->>'outcome'='added' or prior->>'outcome'='updated' and outcome='unchanged' then outcome=prior->>'outcome';end if;
    m=m||jsonb_build_object('outcome',outcome,'historical',coalesce((prior->>'historical')::boolean,false) or (m->>'historical')::boolean,
     'categories',(select jsonb_agg(v order by v) from (select distinct value v from jsonb_array_elements((prior->'categories')||(m->'categories'))) unioned));
   end if;
   records=jsonb_set(records,array[m->>'id'],m);
  end loop;
  for k in select unnest(array['added','updated','unchanged']) loop
   per_run=jsonb_set(per_run,array[k],to_jsonb((per_run->>k)::bigint+(counts->>k)::bigint));
   counts=jsonb_set(counts,array[k],case when t.config->>'check_updates'='false' then jsonb_build_object('value',null,'known_subtotal',0,'completeness','not_applicable','reason','Source maintenance only')
    else public.procurement_saved_metric((counts->>k)::bigint,rc and (cat='' or cc),'Historical identities or unsettled results are missing; known subtotal only.') end);
  end loop;
  if rc and (cat='' or cc) and t.config->>'check_updates' is distinct from 'false' then verified_runs=verified_runs+1;end if;
  r=public.procurement_saved_run(t.id,p_admin)->'reporting';
  if ct>=10000 then r=jsonb_set(r,'{timing}',(r->'timing')||jsonb_build_object('recorded_activity_ms',null,'completeness','unknown','reason','Recorded activity unavailable for this selection; view run logs.'));end if;
  if r#>>'{timing,created_to_finished_ms}' is not null then samples=array_append(samples,(r#>>'{timing,created_to_finished_ms}')::numeric);end if;
  run_attention=rc;run_issues=0;run_sources='{}';run_gaps='{}';
  -- Use current saved dispositions. Resolved imported intake IDs never stay open issues.
  for item in
   select distinct on(e->>'intake_id') e,j.search_request_id,i.id intake_id,i.status,i.payload->>'bid_type' category
   from public.procurement_trigger_requests c join public.procurement_jobs j on j.search_request_id=c.request_id
   cross join lateral jsonb_array_elements(coalesce(j.checkpoint#>'{automatic,exclusions}',j.checkpoint->'automatic_exclusions','[]')) e
   left join public.procurement_intake_items i on i.id=case when e->>'intake_id' ~* '^[a-f0-9-]{36}$' then (e->>'intake_id')::uuid end
   where c.trigger_id=t.id order by e->>'intake_id',j.updated_at desc,j.id desc
  loop
   if item.intake_id is null then run_attention=false;continue;end if;
   if item.status in ('processed','ignored') or coalesce(h->'resolved_intake_ids','[]') ? item.intake_id::text then continue;end if;
   if cat<>'' and (case when item.category='historical_opportunity' then 'opportunity' else item.category end) is distinct from cat then
    if item.category is null or item.category not in ('forecast','opportunity','award','historical_opportunity') then run_attention=false;end if;continue;
   end if;
   if item.e->>'reason' ~* 'evidence.*(required|unproven|did not pass)|no supported.*evidence|no valid response deadline|conflicting|conflicts|identity|canonical.*validation|validation.*did not pass|overlap needs manual review|cannot be silently revived|older .*replace|provenance needs' then
    candidate_ids=array_append(candidate_ids,item.intake_id);run_issues=run_issues+1;
    if not issues ? ('validation:'||item.intake_id) then issues=jsonb_set(issues,array['validation:'||item.intake_id],jsonb_build_object('id',item.intake_id,'kind','validation','run_id',t.id,'request_id',item.search_request_id,'blocker','Saved evidence or identity validation did not pass.','next_action','Open the saved run results to inspect the validation issue.'));end if;
   elsif coalesce(item.e->>'reason','') !~* 'NAICS does not|does not establish Arkansas|not supported for automatic opportunity classification|outside|expired|irrelevant' then run_attention=false;end if;
  end loop;
  if exists(select 1 from public.procurement_trigger_requests c join public.procurement_jobs j on j.search_request_id=c.request_id where c.trigger_id=t.id and j.checkpoint#>>'{receipt,verified}'='true' and j.checkpoint->'automatic' is null) then run_attention=false;end if;
  attention_complete=attention_complete and run_attention;
  for item in
   select task.id,task.source_id,target.search_request_id,target.geography_id,target.target_key,task.kind category,
    public.procurement_saved_source_attention(task.id) attention
   from public.procurement_trigger_requests c join public.procurement_request_targets target on target.search_request_id=c.request_id
   join public.procurement_coverage_tasks task on task.target_id=target.id
   where c.trigger_id=t.id and (cat='' or task.kind=cat)
  loop
   if item.attention is null then continue;end if;
   if item.source_id is null then
    k='gap:'||coalesce(item.geography_id,item.target_key,item.id::text)||':'||item.category;
    run_gaps=array_append(run_gaps,k);gap_keys=array_append(gap_keys,k);
   else
    k='source:'||item.source_id;run_sources=array_append(run_sources,item.source_id);source_ids=array_append(source_ids,item.source_id);
   end if;
   if not issues ? k then issues=jsonb_set(issues,array[k],item.attention||jsonb_build_object('id',coalesce(item.source_id::text,k),'task_id',item.id,'kind',case when item.source_id is null then 'gap' else 'source' end,'run_id',t.id,'request_id',item.search_request_id));end if;
  end loop;
  public_runs=public_runs||jsonb_build_array(jsonb_build_object('id',t.id,'schedule_id',t.schedule_id,'target_kind',t.target_kind,'state',t.state,'origin',t.origin,'created_at',t.created_at,
   'identity_snapshot',identity_fp,'leads',counts,'timing',r->'timing','candidates_attention',public.procurement_saved_metric(run_issues,run_attention,'Some candidate dispositions are unavailable.'),'sources_attention',(select count(distinct v) from unnest(run_sources) v),'route_gaps',(select count(distinct v) from unnest(run_gaps) v)));
 end loop;
 select coalesce(jsonb_agg(value order by key),'[]') into members from jsonb_each(records);
 for k in select unnest(array['added','updated','unchanged']) loop
  select count(*) into n from jsonb_array_elements(members) where value->>'outcome'=k;
  outs=jsonb_set(outs,array[k],public.procurement_saved_metric(n,complete,'Historical identities or unsettled results are missing; known subtotal only.'));
  per_run=jsonb_set(per_run,array[k],public.procurement_saved_metric((per_run->>k)::bigint,complete,'Historical identities or unsettled results are missing; known subtotal only.'));
 end loop;
 for k in select unnest(array['forecast','opportunity','award']) loop
  select count(*) into n from jsonb_array_elements(members) where value->'categories' ? k;
  cats=jsonb_set(cats,array[k],public.procurement_saved_metric(n,complete and category_complete,'Some as-imported categories are unavailable.'));
 end loop;
 select jsonb_build_object('average_ms',avg(v),'median_ms',percentile_cont(0.5) within group(order by v),'samples',count(*),'excluded',total-count(*),'recorded_activity_unavailable',ct>=10000) into durations from unnest(samples) v;
 summary=jsonb_build_object('runs',total,'unique_leads',public.procurement_saved_metric(jsonb_array_length(members),complete,'Historical identities or unsettled results are missing; known subtotal only.'),
  'outcomes',outs,'run_events',per_run,'categories',cats,
  'historical_opportunities',public.procurement_saved_metric((select count(*) from jsonb_array_elements(members) where (value->>'historical')::boolean),complete and category_complete,'Historical subtype attribution is incomplete.'),
  'unclassified_known_leads',(select count(*) from jsonb_array_elements(members) where jsonb_array_length(value->'categories')=0),
  'candidates_attention',public.procurement_saved_metric((select count(distinct id) from unnest(candidate_ids) id),attention_complete,'Some candidate dispositions are unavailable.'),
  'validation_failures',public.procurement_saved_metric((select count(distinct id) from unnest(candidate_ids) id),attention_complete,'Some candidate dispositions are unavailable.'),
  'sources_attention',(select count(distinct id) from unnest(source_ids) id),'route_gaps',(select count(distinct id) from unnest(gap_keys) id),'timing',durations);
 -- Spend is selected by ledger event date, including matching older runs.
 select coalesce(jsonb_agg(jsonb_build_object('state',u.state,'usage',u.usage,'actual_usd',u.actual_usd,'reserved_usd',u.reserved_usd)),'[]') into ledger
 from public.procurement_usage_ledger u join public.procurement_triggers t on t.id=u.trigger_id
 where u.created_at<=boundary and (start_at is null or u.created_at>=start_at) and u.created_at<end_at and t.created_at<=boundary
  and (coalesce(f->>'schedule','')='' or f->>'schedule'='none' and t.schedule_id is null or t.schedule_id::text=f->>'schedule')
  and (coalesce(f->>'run','')='' or t.id::text=f->>'run') and (coalesce(f->>'target','')='' or t.target_kind=f->>'target')
  and (coalesce(f->>'origin','')='' or t.origin=f->>'origin') and (coalesce(f->>'outcome','')='' or t.state=f->>'outcome')
  and (coalesce(f->>'geography','')='' or f->>'geography'='05' and t.target_kind in ('state_source','sam') or t.config->'county_ids' ? (f->>'geography'))
  and (cat='' or t.config->'requested_categories' ? cat);
 if jsonb_array_length(ledger)>=10000 then return jsonb_build_object('unavailable','This report exceeds its read bound. Select a shorter period or narrower scope; no truncated totals are shown.');end if;
 usage=public.procurement_saved_usage_summary(ledger);
 if exists(select 1 from jsonb_array_elements(ledger) e where e->>'state'<>'not_sent' and coalesce(e#>>'{usage,quota_rejection}','false')<>'true' and (e->>'state'<>'completed' or e->>'actual_usd' is null)) then usage=jsonb_set(usage,'{actual_usd}','null');end if;
 if p_admin then summary=summary||jsonb_build_object('usage',usage);end if;
 result=jsonb_build_object('summary',summary,'coverage',jsonb_build_object('first_run',first_run,'last_run',last_run,'verified_identity_runs',verified_runs,'total_runs',total));
 fp=public.procurement_reporting_hash(jsonb_build_object('result',result||jsonb_build_object('summary',summary||jsonb_build_object('usage',usage)),'members',jsonb_build_object('records',members,'issues',issues),'runs',public_runs));
 if f ? 'snapshot' and f->>'snapshot'<>fp then return jsonb_build_object('unavailable',case when p_members then 'Results changed. Return to the originating report and reload it.' else 'Results changed while paging. Refresh stats to load a consistent report.' end);end if;
 if p_members then
  if metric_name is null then raise exception 'Metric required';end if;
  if f ? 'identity_snapshot' and f->>'identity_snapshot'<>public.procurement_reporting_hash(members) then return jsonb_build_object('unavailable','Results changed. Return to the originating report and reload it.');end if;
  if metric_name in ('candidates_attention','validation_failures','sources_attention','route_gaps') then
   select coalesce(jsonb_agg(value order by key),'[]') into selected from jsonb_each(issues) where value->>'kind'=case metric_name when 'sources_attention' then 'source' when 'route_gaps' then 'gap' else 'validation' end;
  else
   select coalesce(jsonb_agg(value order by value->>'id'),'[]') into selected from jsonb_array_elements(members) where metric_name='unique_leads' or metric_name='historical_opportunities' and (value->>'historical')::boolean or metric_name='unclassified_known_leads' and jsonb_array_length(value->'categories')=0 or value->>'outcome'=metric_name or value->'categories' ? metric_name;
  end if;
  known=jsonb_array_length(selected);
  if f ? 'expected' and (f->>'expected')::bigint<>known then return jsonb_build_object('unavailable','Results changed. Return to the originating report and reload it.');end if;
  return jsonb_build_object('kind',case when metric_name in ('candidates_attention','validation_failures','sources_attention','route_gaps') then 'issues' else 'leads' end,'metric',metric_name,
   'descriptor',coalesce(summary#>array['outcomes',metric_name],summary#>array['categories',metric_name],summary->metric_name),'items',coalesce((select jsonb_agg(case when metric_name in ('candidates_attention','validation_failures','sources_attention','route_gaps') then case when p_admin then value else value-'next_action' end else jsonb_build_object('id',value->'id') end order by ordinality) from jsonb_array_elements(selected) with ordinality where ordinality>off and ordinality<=off+lim),'[]'),
   'total',known,'next_offset',case when off+lim<known then off+lim else null end,'snapshot',fp,'as_of',boundary,'filters',filters);
 end if;
 select coalesce(jsonb_agg(value order by ord),'[]') into selected from (
  select value,row_number() over(order by
   case when coalesce(f->>'direction','desc')='asc' then case when coalesce(f->>'sort','created_at')='created_at' then value->>'created_at' end end asc nulls last,
   case when coalesce(f->>'direction','desc')='desc' then case when coalesce(f->>'sort','created_at')='created_at' then value->>'created_at' end end desc nulls last,
   case when f->>'direction'='asc' then case when f->>'sort'='activity' then (value#>>'{timing,recorded_activity_ms}')::numeric else (value#>>array['leads',f->>'sort','value'])::numeric end end asc nulls last,
   case when coalesce(f->>'direction','desc')='desc' then case when f->>'sort'='activity' then (value#>>'{timing,recorded_activity_ms}')::numeric else (value#>>array['leads',f->>'sort','value'])::numeric end end desc nulls last,value->>'id') ord
  from jsonb_array_elements(public_runs)) sorted where ord>off and ord<=off+lim;
 return result||jsonb_build_object('items',selected,'total',total,'next_offset',case when off+lim<total then off+lim else null end,'snapshot',fp,'as_of',boundary,'filters',filters,
 'basis',jsonb_build_object('leads','Run creation date · distinct lead IDs; category as imported','usage','Ledger event date · full usage of matching runs, not allocated by category','timezone','America/Chicago','bound','Fewer than 2,000 period runs and 10,000 rows per relation; narrow period/scope if exceeded'));
end $$;
revoke all on function public.procurement_saved_metric(bigint,boolean,text),public.procurement_saved_analytics(jsonb,boolean,boolean) from public,anon,authenticated;
commit;
