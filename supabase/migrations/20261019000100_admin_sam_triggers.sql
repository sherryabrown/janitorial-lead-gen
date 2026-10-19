-- Add SAM to existing Admin triggers/schedules; preserve direct SAM and county clients.
begin;
alter table public.procurement_triggers drop constraint procurement_triggers_target_kind_check;
alter table public.procurement_triggers add constraint procurement_triggers_target_kind_check check(target_kind in ('county_scope','state_source','sam'));
alter table public.procurement_trigger_requests drop constraint procurement_trigger_requests_role_check;
alter table public.procurement_trigger_requests add constraint procurement_trigger_requests_role_check check(role in ('county','state_research','state_source','sam'));
alter table public.procurement_trigger_requests add constraint procurement_trigger_request_geography check(
 (role='sam' and county_id is null) or (role<>'sam' and county_id is not null));
-- SAM jobs intentionally have no geography coverage task. Retain the same run
-- identity/unique-page guard, admitting this exception only for the leased SAM job.
alter table public.procurement_runs drop constraint procurement_runs_execution_context_check;
alter table public.procurement_runs add constraint procurement_runs_execution_context_check check(
 (job_id is null and coverage_task_id is null and page_index is null) or (job_id is not null and page_index is not null));
create function public.validate_sam_run_context() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.procurement_jobs%rowtype;
begin
 if new.job_id is not null and new.coverage_task_id is null then
  select * into j from public.procurement_jobs where id=new.job_id;
  if not found or j.dedupe_key not like 'api-sam:%' or j.state<>'running' or j.lease_until<=now() or j.lease_until is null or
    nullif(j.checkpoint->>'request_attempt_id','') is null or new.page_attempt<>j.attempts or new.page_index<>(j.checkpoint->'filters'->>'offset')::integer or
    not exists(select 1 from public.procurement_sources s where s.id=new.source_id and s.code=case when j.checkpoint->>'kind'='award' then 'sam-awards' else 'sam' end) or
    new.detail->>'kind' is distinct from (case when j.checkpoint->>'kind'='award' then 'awards' else 'opportunities' end) or
    new.detail->>'collector' is distinct from 'sam-search' or j.checkpoint->>'stage' is distinct from 'sam_reconcile' or
    new.detail->>'workflow_attempt_id' is distinct from j.checkpoint->>'request_attempt_id' or
    new.detail->'filters' is distinct from j.checkpoint->'filters' then raise exception 'Leased SAM audit context required';end if;
 end if;
 return new;
end $$;
create trigger procurement_runs_sam_context before insert or update of job_id,coverage_task_id,page_index,page_attempt
 on public.procurement_runs for each row execute function public.validate_sam_run_context();
revoke all on function public.validate_sam_run_context() from public,anon,authenticated;

alter function public.submit_procurement_trigger(uuid,text,text,jsonb) rename to submit_procurement_trigger_before_sam;
create function public.submit_procurement_trigger(p_actor uuid,p_key text,p_hash text,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.procurement_triggers%rowtype;r uuid;k text;w jsonb;existing_id uuid;
begin
 if p_config->>'target_kind' is distinct from 'sam' then return public.submit_procurement_trigger_before_sam(p_actor,p_key,p_hash,p_config);end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_key !~ '^[A-Za-z0-9_-]{8,100}$' or p_hash !~ '^[a-f0-9]{64}$'
 or jsonb_array_length(p_config->'requested_categories') is distinct from 1 or p_config ?| array['county_ids','counties','state_trigger_id','maintain_sources','check_updates','search_windows']
 then raise exception 'Invalid separate SAM scope';end if;
 k:=p_config->'requested_categories'->>0;w:=p_config->'publication_window';
 if k not in ('opportunity','award') or (w->>'from')::date>(w->>'to')::date or (w->>'to')::date-(w->>'from')::date>365 or
 w->>'from' is null or w->>'to' is null or p_config->'sam_filters' is null then raise exception 'Bounded SAM category/window required';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-trigger-submit',0));
 select * into t from public.procurement_triggers where initiated_by=p_actor and client_key=p_key;
 if found then if t.submission_hash<>p_hash then raise exception 'Idempotency key reused for different input';end if;return t.id;end if;
 if (select count(*) from public.procurement_triggers where initiated_by=p_actor and created_at>now()-interval '1 hour')>=10 then raise exception 'Hourly trigger limit reached';end if;
 if exists(select 1 from public.procurement_jobs j join public.procurement_search_requests q on q.id=j.search_request_id
  where j.dedupe_key like 'api-sam:%' and k=any(q.requested_categories) and
   (j.state in ('pending','running','outcome_unknown') or j.checkpoint->>'stage'='sam_reconcile')) then raise exception 'Review active or uncertain SAM run before starting another';end if;
 insert into public.procurement_triggers(target_kind,config,initiated_by,client_key,submission_hash)
 values('sam',p_config,p_actor,p_key,p_hash) returning * into t;
 r:=public.submit_procurement_sam_request(p_actor,'admin-'||t.id, p_hash,k,w||'{"date_basis":"publication"}',p_config->'sam_filters');
 update public.procurement_search_requests set name='Admin statewide SAM janitorial',workflow_control=workflow_control||
  jsonb_build_object('cancelled',false,'admin_trigger_id',t.id,'admin_policy','sam') where id=r;
 insert into public.procurement_trigger_requests(trigger_id,request_id,county_id,role,scope)values(t.id,r,null,'sam',p_config);
 return t.id;
end $$;
revoke all on function public.submit_procurement_trigger(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_procurement_trigger(uuid,text,text,jsonb) to service_role;

alter function public.procurement_schedule_baseline(uuid) rename to procurement_schedule_baseline_before_sam;
create function public.procurement_schedule_baseline(p_trigger uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.procurement_triggers where id=p_trigger and target_kind='sam') then
 coalesce((select jsonb_agg(jsonb_build_object('run_id',prior.id,'finished_at',prior.finished_at,'filters',prior.detail->'filters')) from (
  select r.id,r.finished_at,r.detail from public.procurement_triggers t join public.procurement_runs r
   on r.detail->>'collector'='sam-search' and r.detail->>'kind'=case when t.config->'requested_categories'->>0='award' then 'awards' else 'opportunities' end
   and ((r.detail->'filters')-'offset')=((t.config->'sam_filters')-'offset')
  where t.id=p_trigger and r.detail->>'state'='response_captured' and r.detail->>'upstream_status'='200'
  order by r.finished_at desc,r.id limit 1
 ) prior),'[]'::jsonb)
 else public.procurement_schedule_baseline_before_sam(p_trigger) end;
$$;
revoke all on function public.procurement_schedule_baseline(uuid) from public,anon,authenticated;
grant execute on function public.procurement_schedule_baseline(uuid) to service_role;
commit;
