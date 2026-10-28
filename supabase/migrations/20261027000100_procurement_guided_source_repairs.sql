begin;
alter table public.procurement_action_requests add column latest_review_task_id uuid references public.procurement_coverage_tasks(id) on delete set null;
alter table public.procurement_action_requests add column checks_excluded_at timestamptz;
create index procurement_jobs_admin_skip_context on public.procurement_jobs ((checkpoint->>'task_id'),task_id)
 where state='blocked' and checkpoint->>'not_checked_by_admin'='true';
update public.procurement_action_requests a set checks_excluded_at=coalesce((select min(e.created_at) from public.procurement_events e
 where e.detail->>'action_id'=a.id::text and e.detail->'result'->>'checks_excluded'='true'
 and e.created_at>coalesce((select max(r.created_at) from public.procurement_events r where r.detail->>'action_id'=a.id::text
   and r.detail->'result'->>'checks_excluded'='false'),'-infinity'::timestamptz)),a.reviewed_at,now()) where a.checks_excluded;
-- One canonical transactional transition supports human decisions and verified
-- repair stages. Browser roles cannot execute the internal transition.
create function public.procurement_transition_source_review(p_actor uuid,p_task uuid,p_version integer,
 p_decision text,p_reason text,p_key text,p_revision text,p_reenable boolean default false,p_job uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; identity text; prior public.procurement_action_requests%rowtype;
 receipt public.procurement_events%rowtype; fingerprint text; result jsonb; effective_decision text;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role::text='admin') then
   raise exception using errcode='42501',message='Admin role required';
 end if;
 if p_version is null or p_version<0 or p_key is null or p_reenable is null
   or p_key !~ '^[A-Za-z0-9_-]{8,100}$' or length(btrim(p_reason)) not between 1 and 1000
   or p_reason is null or p_decision not in ('unreviewed','no_website','no_issue','wont_address','needs_developer','repair_in_progress','fixed_verified')
   or p_decision is null then raise exception 'Invalid source decision'; end if;
 scope:=public.procurement_source_review_scope(p_task);
 if scope is null then raise exception 'Saved source task required'; end if;
 identity:='source-review:'||md5(scope::text);
 fingerprint:=case when p_job is null then md5(jsonb_build_array(p_actor,p_task,p_version,p_decision,p_reason,p_revision,p_reenable)::text)
   else md5(jsonb_build_array(p_actor,p_task,p_version,p_decision,p_reason,p_revision,p_reenable,p_job)::text) end;
 perform pg_advisory_xact_lock(hashtextextended(identity,0));
 select * into receipt from public.procurement_events where dedupe_key='source-review:'||p_actor||':'||p_key;
 if found then
   if receipt.detail->>'fingerprint'<>fingerprint then raise exception 'Idempotency key reused for different decision'; end if;
   return receipt.detail->'result';
 end if;
 if p_revision is null or p_revision is distinct from (public.procurement_source_review_revisions(array[p_task])->>p_task::text) then
   raise exception using errcode='40001',message='Source check changed; reload before saving';
 end if;
 select * into prior from public.procurement_action_requests where dedupe_key=identity for update;
 if found and prior.review_version<>p_version or not found and p_version<>0 then
   raise exception using errcode='40001',message='Source decision changed; reload before saving';
 end if;
 if p_reenable and (not coalesce(prior.checks_excluded,false) or p_decision<>'unreviewed') then
   raise exception 'Explicit re-enable requires an excluded source';
 end if;
 effective_decision:=case when p_reenable and prior.review_decision='fixed_verified' then 'fixed_verified' else p_decision end;
 -- Re-enabling restores eligibility, never fabricates a verified website/method.
 -- Required source validation remains in the existing planner and collector.
 if prior.id is null then
   insert into public.procurement_action_requests(source_id,capability_id,dedupe_key,kind,state,required_action,
     review_scope,review_version,review_decision,checks_excluded,reviewed_by,reviewed_at,review_reason,review_observed_revision,verification_reference,latest_review_task_id,checks_excluded_at)
   values((scope->>'source_id')::uuid,(scope->>'capability_id')::uuid,identity,'review',
     case when p_decision in ('unreviewed','repair_in_progress','needs_developer') then 'pending' else 'resolved' end,'Review source check',scope,1,p_decision,
     p_decision in ('no_website','wont_address'),p_actor,now(),btrim(p_reason),p_revision,p_job,p_task,
     case when p_decision in ('no_website','wont_address') then now() end) returning * into prior;
 else
   update public.procurement_action_requests set review_version=review_version+1,review_decision=effective_decision,
     state=case when effective_decision in ('unreviewed','repair_in_progress','needs_developer') then 'pending' else 'resolved' end,
     checks_excluded=case when p_reenable then false else checks_excluded or p_decision in ('no_website','wont_address') end,
     checks_excluded_at=case when p_reenable then null when checks_excluded then checks_excluded_at when p_decision in ('no_website','wont_address') then now() end,
     reviewed_by=p_actor,reviewed_at=now(),review_reason=btrim(p_reason),
     review_observed_revision=p_revision,verification_reference=coalesce(p_job,verification_reference),latest_review_task_id=p_task,
     resolved_at=case when p_decision in ('unreviewed','repair_in_progress','needs_developer') then null else now() end
   where id=prior.id returning * into prior;
 end if;
 result:=jsonb_build_object('id',prior.id,'version',prior.review_version,'decision',prior.review_decision,
   'checks_excluded',prior.checks_excluded,'reviewed_at',prior.reviewed_at);
 insert into public.procurement_events(source_id,event_type,dedupe_key,detail)
 values(prior.source_id,case when p_reenable then 'source_review_reenabled' else 'source_review_decision' end,
   'source-review:'||p_actor||':'||p_key,jsonb_build_object('action_id',prior.id,'task_id',p_task,
    'actor_id',p_actor,'scope',scope,'reason',btrim(p_reason),'fingerprint',fingerprint,'result',result));
 return result;
end $$;
revoke all on function public.procurement_transition_source_review(uuid,uuid,integer,text,text,text,text,boolean,uuid) from public,anon,authenticated,service_role;

create or replace function public.record_procurement_source_decision(p_actor uuid,p_task uuid,p_version integer,p_decision text,p_reason text,p_key text,p_revision text,p_reenable boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_decision is null or p_decision not in ('unreviewed','no_website','no_issue','wont_address','needs_developer') then raise exception 'Invalid source decision'; end if;
 return public.procurement_transition_source_review(p_actor,p_task,p_version,p_decision,p_reason,p_key,p_revision,p_reenable,null);
end $$;

-- A replacement method inherits the review identity only for the repaired
-- route. Other routes/methods keep their identities. Exclusions survive a fix
-- until explicit Admin re-enable, without suppressing unrelated methods.
create or replace function public.procurement_source_review_scope(p_task uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('geography_id',t.route_geography_id,'category',t.kind,
   'source_id',case when c.verification_evidence->'source_review_entity_routes' ? t.route_geography_id then null else t.source_id end,
   'capability_id',case when c.verification_evidence->'source_review_entity_routes' ? t.route_geography_id then null else coalesce(root.id,t.capability_id) end)
 from public.procurement_coverage_tasks t left join public.procurement_source_capabilities c on c.id=t.capability_id
 left join public.procurement_source_capabilities root on root.source_id=c.source_id and root.kind=c.kind and root.id=
   case when c.verification_evidence->'source_review_roots'->>t.route_geography_id ~ '^[a-f0-9-]{36}$'
     then (c.verification_evidence->'source_review_roots'->>t.route_geography_id)::uuid else c.id end
 where t.id=p_task;
$$;
create function public.procurement_source_review_context(p_tasks uuid[],p_private boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revisions',public.procurement_source_review_revisions(p_tasks),
   'scopes',coalesce(jsonb_object_agg(t.id::text,public.procurement_source_review_scope(t.id)),'{}'::jsonb),
   'current_tasks',coalesce(jsonb_object_agg(t.id::text,case when current.id is null then null else
      jsonb_build_object('id',current.id,'target_id',current.target_id,'state',current.state,'updated_at',current.updated_at) end),'{}'::jsonb),
   'reviews',coalesce(jsonb_object_agg(t.id::text,case when a.id is null then null when p_private then to_jsonb(a) else
      jsonb_build_object('id',a.id,'review_version',a.review_version,'review_decision',a.review_decision,
        'checks_excluded',a.checks_excluded,'reviewed_at',a.reviewed_at) end),'{}'::jsonb),
   'excluded',coalesce(jsonb_object_agg(t.id::text,public.procurement_source_check_excluded(t.id)),'{}'::jsonb),
   'skipped',coalesce(jsonb_object_agg(t.id::text,exists(select 1 from public.procurement_jobs j where j.state='blocked'
     and j.checkpoint->>'not_checked_by_admin'='true' and (j.task_id=t.id or j.checkpoint->>'task_id'=t.id::text))),'{}'::jsonb),
   'current_revisions',coalesce(jsonb_object_agg(t.id::text,
     public.procurement_source_review_revisions(array[coalesce(current.id,t.id)])->>coalesce(current.id,t.id)::text),'{}'::jsonb))
 from public.procurement_coverage_tasks t
 left join public.procurement_action_requests a on a.dedupe_key='source-review:'||md5(public.procurement_source_review_scope(t.id)::text)
 left join public.procurement_coverage_tasks current on current.id=a.latest_review_task_id
   and public.procurement_source_review_scope(current.id)=public.procurement_source_review_scope(t.id)
 where t.id=any(p_tasks) and cardinality(p_tasks)<=1000;
$$;
create function public.procurement_scoped_source_repair(p_request uuid,p_task uuid,p_job uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(j) from public.procurement_jobs j
 join public.procurement_coverage_tasks origin on origin.id=case when j.checkpoint->>'review_task_id' ~ '^[a-f0-9-]{36}$' then (j.checkpoint->>'review_task_id')::uuid end
 join public.procurement_coverage_tasks selected on selected.id=p_task
 join public.procurement_request_targets target on target.id=selected.target_id and target.search_request_id=p_request
 join public.procurement_action_requests a on a.review_scope=public.procurement_source_review_scope(selected.id)
 left join public.procurement_jobs current on current.id=a.verification_reference
 where j.id=p_job and j.checkpoint->>'source_repair_authorized'='true'
 and public.procurement_source_review_scope(origin.id)=public.procurement_source_review_scope(selected.id)
 and (a.verification_reference=j.id or current.checkpoint->>'entry_job_id'=j.id::text);
$$;
revoke all on function public.procurement_source_review_context(uuid[],boolean),public.procurement_scoped_source_repair(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.procurement_source_review_context(uuid[],boolean),public.procurement_scoped_source_repair(uuid,uuid,uuid) to service_role;

create function public.queue_procurement_source_repair(p_actor uuid,p_task uuid,p_version integer,p_revision text,p_key text,p_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_id uuid; origin_request uuid; repair_target_id uuid; verification_task uuid;
 job public.procurement_jobs%rowtype; result jsonb; fingerprint text;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role::text='admin') then raise exception using errcode='42501',message='Admin role required'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,100}$' or p_url is null or length(p_url)>2000 or p_url !~ '^https://' then raise exception 'Public website and stable request key required'; end if;
 select r.search_request_id into origin_request from public.procurement_coverage_tasks t join public.procurement_request_targets r on r.id=t.target_id where t.id=p_task;
 if not found then raise exception 'Saved source task required'; end if;
 fingerprint:=md5(jsonb_build_array(p_task,p_version,p_revision,p_url)::text);
 perform pg_advisory_xact_lock(hashtextextended('source-repair-actor:'||p_actor,0));
 select * into job from public.procurement_jobs where dedupe_key='api-workflow:source-repair:'||p_actor||':'||p_key;
 if found then
  if job.checkpoint->>'input_fingerprint' is distinct from fingerprint then raise exception 'Idempotency key reused for different website'; end if;
  return jsonb_build_object('job_id',job.id,'state',job.state);
 end if;
 if (select count(*) from public.procurement_jobs where checkpoint->>'guided_actor'=p_actor::text and created_at>now()-interval '1 hour')>=4 then raise exception 'Website verification limit reached; wait before starting another check'; end if;
 if exists(select 1 from public.procurement_action_requests a join public.procurement_jobs j on j.id=a.verification_reference
   where a.dedupe_key='source-review:'||md5(public.procurement_source_review_scope(p_task)::text) and j.state in ('pending','running'))
   then raise exception using errcode='40001',message='A website check is already running'; end if;
 -- A repair owns its request/attempt evidence. It neither wakes an old schedule
 -- nor adds fresh capture/worker state to a historical run's reporting inputs.
 insert into public.procurement_search_requests(name,search_boundary_mode,requested_search_areas,contracting_entity_geo_levels,
   state_search_names,service_scope,search_windows,scope_resolution_state,requested_geography_id,selected_city_ids,
   cities_confirmed_at,request_origin,initiated_by,client_request_key,submission_hash,requested_categories,workflow_control)
 select 'Source website verification',search_boundary_mode,requested_search_areas,contracting_entity_geo_levels,
   state_search_names,service_scope,search_windows,scope_resolution_state,requested_geography_id,selected_city_ids,
   cities_confirmed_at,'api',p_actor,'source-repair:'||p_key,fingerprint||fingerprint,requested_categories,
   jsonb_build_object('source_repair',true,'check_updates',false)
 from public.procurement_search_requests where id=origin_request returning id into request_id;
 insert into public.procurement_request_targets(search_request_id,target_key,geography_id,original_inputs,state,checkpoint,unresolved_reason)
 select request_id,r.target_key,r.geography_id,r.original_inputs,r.state,r.checkpoint,r.unresolved_reason
 from public.procurement_request_targets r join public.procurement_coverage_tasks t on t.target_id=r.id where t.id=p_task returning id into repair_target_id;
 insert into public.procurement_coverage_tasks(target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,state,evidence,query_window,source_id,capability_id)
 select repair_target_id,t.task_key,t.agency_scope,t.route_geography_id,t.kind,t.priority,t.reason,t.state,t.evidence,t.query_window,t.source_id,t.capability_id
 from public.procurement_coverage_tasks t where t.id=p_task returning id into verification_task;
 insert into public.procurement_jobs(search_request_id,dedupe_key,kind,state,checkpoint)
 values(request_id,'api-workflow:source-repair:'||p_actor||':'||p_key,'discover','pending',
  jsonb_build_object('stage','discovery_source_entry_verify','guided_entry',true,'guided_actor',p_actor,'actor_id',p_actor,
   'task_id',verification_task,'review_task_id',p_task,'candidate_url',p_url,'input_fingerprint',fingerprint,'scope_revision',p_revision,'source_repair_authorized',true)) returning * into job;
 result:=public.procurement_transition_source_review(p_actor,p_task,p_version,'repair_in_progress',
   'Verifying the supplied official website',p_key,p_revision,false,job.id);
 return jsonb_build_object('job_id',job.id,'state',job.state,'review',result);
end $$;

create function public.queue_procurement_guided_method(p_actor uuid,p_entry uuid,p_source uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare entry public.procurement_jobs%rowtype; method public.procurement_jobs%rowtype; scope jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role::text='admin') then raise exception using errcode='42501',message='Admin role required'; end if;
 select * into entry from public.procurement_jobs where id=p_entry and checkpoint->>'guided_entry'='true' and checkpoint->>'guided_actor'=p_actor::text;
 if not found or (entry.checkpoint->'persistence'->'receipt'->>'verified') is distinct from 'true'
   or (entry.checkpoint->>'stage') is distinct from 'discovery_source_entry_finalize'
   or entry.state<>'running' or entry.lease_until<=now() then raise exception 'Verified saved website required'; end if;
 if not exists(select 1 from public.procurement_sources where id=p_source and url=entry.checkpoint->>'candidate_url') then raise exception 'Saved website readback changed'; end if;
 scope:=public.procurement_source_review_scope((entry.checkpoint->>'review_task_id')::uuid);
 perform pg_advisory_xact_lock(hashtextextended('source-review:'||md5(scope::text),0));
 if not exists(select 1 from public.procurement_action_requests where dedupe_key='source-review:'||md5(scope::text)
   and verification_reference=entry.id and review_decision='repair_in_progress') then return null; end if;
 insert into public.procurement_jobs(search_request_id,dedupe_key,kind,state,checkpoint)
 values(entry.search_request_id,'api-workflow:source-method-repair:'||entry.id,'discover','pending',
  jsonb_build_object('stage','discovery_capture','guided_method',true,'entry_job_id',entry.id,'actor_id',p_actor,
   'guided_actor',p_actor,'task_id',entry.checkpoint->>'task_id','review_task_id',entry.checkpoint->>'review_task_id','seed_source_id',p_source,'source_repair_authorized',true,
   'queue',jsonb_build_array(entry.checkpoint->>'candidate_url'),'visited','[]'::jsonb,'run_ids','[]'::jsonb,'links','[]'::jsonb,
   'observed_hosts','[]'::jsonb,'automation_policy','county-public-v1','next_action','Checking the bid listings',
   'source_snapshot',(select jsonb_build_object('url',url,'config',config-'research_persistence','identity_key',identity_key) from public.procurement_sources where id=p_source)))
 on conflict(dedupe_key) do nothing;
 select * into method from public.procurement_jobs where dedupe_key='api-workflow:source-method-repair:'||entry.id;
 update public.procurement_action_requests set verification_reference=method.id where dedupe_key='source-review:'||md5(scope::text)
   and verification_reference=entry.id and review_decision='repair_in_progress';
 return method.id;
end $$;

create function public.finish_procurement_guided_repair(p_actor uuid,p_job uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.procurement_jobs%rowtype; task public.procurement_coverage_tasks%rowtype;
 action public.procurement_action_requests%rowtype; scope jsonb; cached jsonb; revision text; key text; proof_time timestamptz; newer public.procurement_coverage_tasks%rowtype;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role::text='admin') then raise exception using errcode='42501',message='Admin role required'; end if;
 select * into job from public.procurement_jobs where id=p_job and checkpoint->>'guided_actor'=p_actor::text;
 if not found then raise exception 'Scoped website repair required'; end if;
 key:='repair-complete-'||job.id;
 select detail->'result' into cached from public.procurement_events where dedupe_key='source-review:'||p_actor||':'||key;
 if found then return cached; end if;
 select * into task from public.procurement_coverage_tasks where id=(job.checkpoint->>'review_task_id')::uuid;
 if job.checkpoint->'persistence'->'receipt'->>'verified' is distinct from 'true' or
   not coalesce(((job.checkpoint->>'guided_method'='true' and job.checkpoint->>'stage'='discovery_repair_finalize') or
     (job.checkpoint->>'guided_entry'='true' and task.kind='source_entry' and job.checkpoint->>'stage'='discovery_source_entry_finalize')),false)
   or job.state<>'running' or job.lease_until<=now() then raise exception 'Current verified repair/readback lease required'; end if;
 scope:=public.procurement_source_review_scope(task.id);
 perform pg_advisory_xact_lock(hashtextextended('source-review:'||md5(scope::text),0));
 select * into action from public.procurement_action_requests where dedupe_key='source-review:'||md5(scope::text);
 if action.review_decision is distinct from 'repair_in_progress' or action.verification_reference is distinct from job.id then
  return jsonb_build_object('decision_changed',true,'message','A newer admin decision was retained');
 end if;
 proof_time:=case when job.checkpoint->>'guided_entry'='true' then (job.checkpoint->>'verified_at')::timestamptz else (job.checkpoint->>'method_verified_at')::timestamptz end;
 if proof_time is null then raise exception 'Current verified evidence time required'; end if;
 select * into newer from public.procurement_coverage_tasks where id=action.latest_review_task_id;
 if found and newer.updated_at>proof_time then
  revision:=public.procurement_source_review_revisions(array[newer.id])->>newer.id::text;
  return public.procurement_transition_source_review(p_actor,newer.id,action.review_version,'unreviewed',
    'A newer source check needs review after the saved verification',key,revision,false,job.id);
 end if;
 revision:=public.procurement_source_review_revisions(array[task.id])->>task.id::text;
 return public.procurement_transition_source_review(p_actor,task.id,action.review_version,'fixed_verified',
   case when task.kind='source_entry' then 'Official website entry verified and saved' else 'Category listing method verified and saved' end,
   key,revision,false,job.id);
end $$;

revoke all on function public.queue_procurement_source_repair(uuid,uuid,integer,text,text,text),
 public.queue_procurement_guided_method(uuid,uuid,uuid),public.finish_procurement_guided_repair(uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_procurement_source_repair(uuid,uuid,integer,text,text,text),
 public.queue_procurement_guided_method(uuid,uuid,uuid),public.finish_procurement_guided_repair(uuid,uuid) to service_role;

-- Repair verification is an explicit Admin task, not an automatic check. It may
-- verify a repair while exclusion remains, but it never re-enables collection.
create or replace function public.procurement_block_excluded_source_jobs() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.procurement_action_requests where checks_excluded) then return; end if;
 with excluded as (
  select j.id,bool_or(j.attempts=0 and j.created_at>=a.checks_excluded_at) as not_started
  from public.procurement_jobs j join public.procurement_coverage_tasks t on t.id=coalesce(j.task_id,
    case when j.checkpoint->>'task_id' ~ '^[a-f0-9-]{36}$' then (j.checkpoint->>'task_id')::uuid end)
  join public.procurement_action_requests a on a.checks_excluded and a.review_scope->>'geography_id'=t.route_geography_id
    and a.review_scope->>'category'=t.kind
    and (a.review_scope->>'source_id' is null or a.review_scope->>'source_id'=t.source_id::text)
    and (a.review_scope->>'capability_id' is null or a.review_scope->>'capability_id'=public.procurement_source_review_scope(t.id)->>'capability_id')
  where j.kind in ('collect','discover') and coalesce(j.checkpoint->>'source_repair_authorized','false')<>'true'
    and (j.state in ('pending','partial') or j.state='running' and j.lease_until<now()) group by j.id)
 update public.procurement_jobs j set state='blocked',lease_token=null,lease_until=null,
   checkpoint=j.checkpoint||jsonb_build_object('source_check_excluded',true,'not_checked_by_admin',excluded.not_started,'blocker','Not checked by admin decision'),updated_at=now()
 from excluded where j.id=excluded.id
   and (j.state in ('pending','partial') or j.state='running' and j.lease_until<now())
 ;
end $$;

create function public.procurement_observe_source_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope jsonb; revision text; prior public.procurement_action_requests%rowtype; decision text;
begin
 if new.state not in ('source_missing','method_missing','blocked','partial') or exists(
  select 1 from public.procurement_request_targets target join public.procurement_search_requests request on request.id=target.search_request_id
  where target.id=new.target_id and request.workflow_control->>'source_repair'='true') then return new; end if;
 scope:=public.procurement_source_review_scope(new.id);
 if not exists(select 1 from public.procurement_action_requests where dedupe_key='source-review:'||md5(scope::text)) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('source-review:'||md5(scope::text),0));
 select * into prior from public.procurement_action_requests where dedupe_key='source-review:'||md5(scope::text) for update;
 revision:=public.procurement_source_review_revisions(array[new.id])->>new.id::text;
 if revision is not distinct from prior.review_observed_revision then
  update public.procurement_action_requests set latest_review_task_id=new.id where id=prior.id and latest_review_task_id is distinct from new.id;
  return new;
 end if;
 if exists(select 1 from public.procurement_events where dedupe_key='source-review-observed:'||new.id||':'||revision) then return new; end if;
 decision:=case when prior.review_decision in ('no_issue','fixed_verified') then 'unreviewed' else prior.review_decision end;
 update public.procurement_action_requests set review_version=review_version+1,review_decision=decision,review_observed_revision=revision,
  latest_review_task_id=new.id,state=case when decision in ('unreviewed','repair_in_progress','needs_developer') then 'pending' else 'resolved' end,
  resolved_at=case when decision='unreviewed' then null else resolved_at end where id=prior.id;
 insert into public.procurement_events(source_id,event_type,dedupe_key,detail) values(prior.source_id,'source_review_observed',
  'source-review-observed:'||new.id||':'||revision,jsonb_build_object('action_id',prior.id,'task_id',new.id,
   'reason','A newer source check was recorded; historical outcomes remain unchanged',
   'result',jsonb_build_object('decision',decision,'version',prior.review_version+1)));
 return new;
end $$;
revoke all on function public.procurement_observe_source_review() from public,anon,authenticated,service_role;
create trigger procurement_source_review_observed after insert or update of state,evidence on public.procurement_coverage_tasks
for each row execute function public.procurement_observe_source_review();
commit;
