begin;
-- Private helpers have no browser grants. All entrypoints resolve profiles.role.
create function public.procurement_reporting_json(p_value jsonb) returns text
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_value)='object' then
  return '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||public.procurement_reporting_json(value),',' order by key collate "C") from jsonb_each(p_value)),'')||'}';
 elsif jsonb_typeof(p_value)='array' then
  return '['||coalesce((select string_agg(public.procurement_reporting_json(value),',' order by ordinality) from jsonb_array_elements(p_value) with ordinality),'')||']';
 end if;
 return coalesce(p_value::text,'null');
end $$;
create function public.procurement_reporting_hash(p_value jsonb) returns text
language sql immutable set search_path='' as $$select encode(sha256(convert_to(public.procurement_reporting_json(p_value),'UTF8')),'hex')$$;
create function public.procurement_saved_read_role() returns text
language plpgsql stable security definer set search_path='' as $$
declare actor_role text;
begin
 select role::text into actor_role from public.profiles where user_id=auth.uid();
 if actor_role is null or actor_role not in ('user','admin') then raise exception using errcode='42501',message='Scheduling access unavailable';end if;
 return actor_role;
end $$;

-- Current canonical projection of frozen imported facts; never today's lead classification.
create function public.procurement_saved_run_members(p_trigger uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare members jsonb;
begin
 if exists(select 1 from public.procurement_run_result_members m
  join public.procurement_leads l on l.id=m.lead_id
  left join public.procurement_leads target on target.id=case when l.payload#>>'{canonical_redirect,lead_id}' ~* '^[a-f0-9-]{36}$' then (l.payload#>>'{canonical_redirect,lead_id}')::uuid end
  where m.trigger_id=p_trigger and l.payload#>>'{canonical_redirect,policy}'='county-ionwave-solicitation-v1'
   and (target.id is null or target.source_id is distinct from l.source_id or target.payload#>>'{canonical_redirect,policy}'='county-ionwave-solicitation-v1')) then
  raise exception 'Canonical reporting identity requires reconciliation';
 end if;
 with identities as (
  select m.*,case when l.payload#>>'{canonical_redirect,policy}'='county-ionwave-solicitation-v1' then (l.payload#>>'{canonical_redirect,lead_id}')::uuid else m.lead_id end canonical_id
  from public.procurement_run_result_members m left join public.procurement_leads l on l.id=m.lead_id where m.trigger_id=p_trigger
 ), grouped as (
  select canonical_id,max(case outcome when 'added' then 2 when 'updated' then 1 else 0 end) outcome,bool_or(historical) historical,
   array(select distinct cat from identities sub cross join unnest(sub.categories) cat where sub.canonical_id=i.canonical_id order by cat) categories,
   array(select distinct alias from identities sub cross join unnest(sub.canonical_aliases||case when sub.lead_id<>sub.canonical_id then array[sub.lead_id] else '{}'::uuid[] end) alias where sub.canonical_id=i.canonical_id order by alias) aliases
  from identities i group by canonical_id
 ) select coalesce(jsonb_agg(jsonb_build_object('id',canonical_id,'outcome',case outcome when 2 then 'added' when 1 then 'updated' else 'unchanged' end,'categories',categories,'historical',historical)
   ||case when cardinality(aliases)>0 then jsonb_build_object('canonical_aliases',aliases) else '{}' end order by canonical_id),'[]') into members from grouped;
 return members;
end $$;

create function public.procurement_saved_usage(p_trigger uuid,p_step uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 with ledger as (select * from public.procurement_usage_ledger where trigger_id=p_trigger and (p_step is null or step_id=p_step)),
 flags as (select count(*) filter(where state<>'not_sent' and coalesce((usage->>'quota_rejection')::boolean,false)=false) calls,
  count(*) filter(where state in ('reserved','outcome_unknown') and coalesce((usage->>'quota_rejection')::boolean,false)=false)>0 unknown,
  count(*) filter(where state='completed' and coalesce((usage->>'quota_rejection')::boolean,false)=false) actual,
  coalesce(sum((usage->>'input_tokens')::bigint) filter(where state='completed'),0) inputs,
  coalesce(sum((usage->>'output_tokens')::bigint) filter(where state='completed'),0) outputs,
  coalesce(sum(actual_usd) filter(where state<>'not_sent'),0) spent,
  coalesce(sum(reserved_usd) filter(where state in ('reserved','outcome_unknown')),0) held from ledger)
 select jsonb_build_object('ai',case when unknown then 'unknown' when actual>0 then 'used' else 'not_used' end,'calls',calls,
  'input_tokens',case when unknown then null else inputs end,'output_tokens',case when unknown then null else outputs end,
  'actual_usd',case when unknown then null else spent end,'known_actual_usd',spent,'held_usd',held,'credits',null,'credit_unit',null) from flags;
$$;

create function public.procurement_saved_run(p_trigger uuid,p_admin boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype; h public.procurement_run_results%rowtype;
 members jsonb; result jsonb; leads jsonb; cats jsonb; children jsonb; presentation jsonb; complete boolean; timing jsonb; count_steps integer;
begin
 select * into t from public.procurement_triggers where id=p_trigger;
 if not found then raise exception 'Run unavailable';end if;
 select * into h from public.procurement_run_results where trigger_id=p_trigger;
 members=public.procurement_saved_run_members(p_trigger);
 -- Keep the existing distinction between overview count availability and
 -- identity-based analytics (e.g. proven empty SAM versus aggregate-only receipts).
 complete=coalesce(h.source_version=t.reporting_source_version and t.state='completed' and (h.result->>'complete')::boolean and h.result#>>'{leads,completeness}'='known',false);
 select jsonb_object_agg(k,jsonb_build_object('value',case when complete then (select count(*) from jsonb_array_elements(members) m where m->>'outcome'=k) else null end,
  'known_subtotal',(select count(*) from jsonb_array_elements(members) m where m->>'outcome'=k),
  'completeness',case when t.config->>'check_updates'='false' then 'not_applicable' when complete then 'known' when jsonb_array_length(members)>0 then 'partial' else 'unknown' end,
  'reason',case when t.config->>'check_updates'='false' then 'Source maintenance only' when complete then null else 'Historical identities or unsettled results are missing; known subtotal only.' end)) into leads from unnest(array['added','updated','unchanged']) k;
 select jsonb_object_agg(k,case when complete and coalesce((h.result->>'category_complete')::boolean,false) then to_jsonb((select count(*) from jsonb_array_elements(members) m where (k='historical_opportunity' and (m->>'historical')::boolean) or m->'categories' ? k)) else 'null'::jsonb end) into cats from unnest(array['forecast','opportunity','award','historical_opportunity']) k;
 cats=cats||jsonb_build_object('completeness',case when t.config->>'check_updates'='false' then 'not_applicable' when complete and (h.result->>'category_complete')::boolean then 'known' else 'unknown' end,'reason','As-imported classifications; category transitions can overlap');
 children=public.procurement_saved_children(p_trigger);
 select count(*) into count_steps from public.procurement_workflow_steps where trigger_id=p_trigger;
 with intervals as (
  select started_at a,finished_at b from public.procurement_workflow_steps where trigger_id=p_trigger and finished_at>=started_at and count_steps<10000
 ), prior as (select *,max(b) over(order by a,b rows between unbounded preceding and 1 preceding) previous_end from intervals)
 select jsonb_build_object('created_at',t.created_at,'finished_at',t.finished_at,
  'created_to_finished_ms',case when t.state in ('completed','cancelled') and t.finished_at>=t.created_at then extract(epoch from (t.finished_at-t.created_at))*1000 else null end,
  'recorded_activity_ms',sum(greatest(0,extract(epoch from (b-greatest(a,coalesce(previous_end,a))))*1000)),
  'completeness',case when count(*)=0 then 'unknown' when count(*)=count_steps then 'known' else 'partial' end,
  'basis','Union of completed recorded step intervals; not end-to-end execution time') into timing from prior;
 result=jsonb_build_object('id',t.id,'target_kind',t.target_kind,'state',t.state,'config',t.config,'created_at',t.created_at,'finished_at',t.finished_at,'origin',t.origin,'schedule_id',t.schedule_id,'occurrence_id',t.occurrence_id,
  'reporting_pending',t.reporting_source_version>0 and (h.source_version is null or h.source_version<>t.reporting_source_version),
  'schedule_name',(select name from public.procurement_schedules where id=t.schedule_id),'children',children,
  'reporting',jsonb_build_object('id',t.id,'target_kind',t.target_kind,'state',t.state,'config',public.procurement_saved_config(t.config),'created_at',t.created_at,'finished_at',t.finished_at,'origin',t.origin,'schedule_id',t.schedule_id,'occurrence_id',t.occurrence_id,
   'identity_snapshot',public.procurement_reporting_hash(members),'leads',jsonb_build_object('added',case when complete then leads#>'{added,value}' else null end,'updated',case when complete then leads#>'{updated,value}' else null end,'unchanged',case when complete then leads#>'{unchanged,value}' else null end,
    'known_subtotal',jsonb_build_object('added',leads#>'{added,known_subtotal}','updated',leads#>'{updated,known_subtotal}','unchanged',leads#>'{unchanged,known_subtotal}'),
    'completeness',case when t.config->>'check_updates'='false' then 'not_applicable' when complete then 'known' else 'unknown' end),'categories',cats,'timing',timing,
   'candidates_attention',jsonb_build_object('value',null,'completeness',case when t.config->>'check_updates'='false' then 'not_applicable' else 'unknown' end,'reason',case when t.config->>'check_updates'='false' then 'Source maintenance only' else 'Review saved candidate validation; intake count is not a blocker count' end)),
  'next_action',case when t.state in ('pending','running') then 'Read saved progress' when t.state='needs_review' then 'Review saved source evidence and candidates' when t.state='partial' then 'Review unresolved coverage and resume' when t.state='outcome_unknown' then 'Reconcile saved operation before resuming' when t.state='cancelled' then 'Resume when ready' else 'Review results' end,
  'related_state_sources',case when t.target_kind='sam' then '[]'::jsonb else coalesce((select jsonb_agg(s||jsonb_build_object('evidence_policy','Review saved source run; verify county work location and dates before import')) from jsonb_array_elements(public.procurement_state_trigger_status()) s where exists(select 1 from jsonb_array_elements_text(s->'county_ids') c where t.config->'county_ids' ? c)),'[]') end);
 presentation=public.procurement_saved_run_presentation(p_trigger);
 if presentation is not null then
  result=result||jsonb_build_object('presentation',presentation);result=jsonb_set(result,'{reporting,presentation}',presentation);
 end if;
 if h.source_version=t.reporting_source_version and t.state='completed' and h.result#>>'{leads,identities}'='false' and h.result#>>'{leads,completeness}'='known' then
  result=jsonb_set(result,'{reporting,leads}',h.result->'leads');
 end if;
 if p_admin then result=jsonb_set(result,'{reporting,usage}',public.procurement_saved_usage(t.id))||jsonb_build_object('usage',public.procurement_saved_usage(t.id));end if;
 if not p_admin then result=result-'next_action';end if;
 return result;
end $$;

-- No browser can choose p_admin or invoke an internal helper directly.
revoke all on function public.procurement_reporting_json(jsonb),public.procurement_reporting_hash(jsonb),public.procurement_saved_read_role(),public.procurement_saved_run_members(uuid),public.procurement_saved_usage(uuid,uuid),public.procurement_saved_run(uuid,boolean) from public,anon,authenticated;
commit;
