begin;
-- Reuse current human-action storage and domain events. No second issue/event
-- store, membership authority, copied run list or destructive history rewrite.
alter table public.procurement_action_requests alter column source_id drop not null;
alter table public.procurement_action_requests
 add column review_scope jsonb,
 add column review_version integer not null default 0 check(review_version>=0),
 add column review_decision text check(review_decision in ('unreviewed','repair_in_progress','fixed_verified','no_website','no_issue','wont_address','needs_developer')),
 add column checks_excluded boolean not null default false,
 add column reviewed_by uuid references auth.users(id),
 add column reviewed_at timestamptz,
 add column review_reason text,
 add column review_observed_revision text,
 add column verification_reference uuid references public.procurement_jobs(id);
alter table public.procurement_action_requests add constraint procurement_review_scope_check
 check ((review_scope is null and source_id is not null)
   or (kind='review' and jsonb_typeof(review_scope)='object' and review_scope ?& array['geography_id','category','source_id','capability_id']));
create index procurement_source_exclusions on public.procurement_action_requests
 ((review_scope->>'geography_id'),(review_scope->>'category')) where checks_excluded;

create function public.procurement_source_review_scope(p_task uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('geography_id',t.route_geography_id,'category',t.kind,
   'source_id',t.source_id,'capability_id',t.capability_id)
 from public.procurement_coverage_tasks t where t.id=p_task;
$$;
create function public.procurement_source_check_excluded(p_task uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.procurement_action_requests a,
   lateral (select public.procurement_source_review_scope(p_task) as scope) s
   where a.checks_excluded and a.review_scope->>'geography_id'=s.scope->>'geography_id'
   and a.review_scope->>'category'=s.scope->>'category'
   and (a.review_scope->>'source_id' is null or a.review_scope->>'source_id'=s.scope->>'source_id')
   and (a.review_scope->>'capability_id' is null or a.review_scope->>'capability_id'=s.scope->>'capability_id'));
$$;

create function public.procurement_source_review_revisions(p_tasks uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(t.id::text,md5(jsonb_build_array(
   public.procurement_source_review_scope(t.id),t.state,t.evidence->>'reason',s.url,
   s.config-'research_persistence',c.method_spec,c.endpoint_url,c.availability)::text)),'{}'::jsonb)
 from public.procurement_coverage_tasks t left join public.procurement_sources s on s.id=t.source_id
 left join public.procurement_source_capabilities c on c.id=t.capability_id
 where t.id=any(p_tasks) and cardinality(p_tasks)<=1000;
$$;

create function public.record_procurement_source_decision(p_actor uuid,p_task uuid,p_version integer,
 p_decision text,p_reason text,p_key text,p_revision text,p_reenable boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; identity text; prior public.procurement_action_requests%rowtype;
 receipt public.procurement_events%rowtype; fingerprint text; result jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role::text='admin') then
   raise exception using errcode='42501',message='Admin role required';
 end if;
 if p_version is null or p_version<0 or p_key is null or p_reenable is null
   or p_key !~ '^[A-Za-z0-9_-]{8,100}$' or length(btrim(p_reason)) not between 1 and 1000
   or p_reason is null or p_decision not in ('unreviewed','no_website','no_issue','wont_address','needs_developer')
   or p_decision is null then raise exception 'Invalid source decision'; end if;
 scope:=public.procurement_source_review_scope(p_task);
 if scope is null then raise exception 'Saved source task required'; end if;
 identity:='source-review:'||md5(scope::text);
 fingerprint:=md5(jsonb_build_array(p_actor,p_task,p_version,p_decision,p_reason,p_revision,p_reenable)::text);
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
 -- Re-enabling restores eligibility, never fabricates a verified website/method.
 -- Required source validation remains in the existing planner and collector.
 if prior.id is null then
   insert into public.procurement_action_requests(source_id,capability_id,dedupe_key,kind,state,required_action,
     review_scope,review_version,review_decision,checks_excluded,reviewed_by,reviewed_at,review_reason,review_observed_revision)
   values((scope->>'source_id')::uuid,(scope->>'capability_id')::uuid,identity,'review',
     case when p_decision='unreviewed' then 'pending' else 'resolved' end,'Review source check',scope,1,p_decision,
     p_decision in ('no_website','wont_address'),p_actor,now(),btrim(p_reason),p_revision) returning * into prior;
 else
   update public.procurement_action_requests set review_version=review_version+1,review_decision=p_decision,
     state=case when p_decision='unreviewed' then 'pending' else 'resolved' end,
     checks_excluded=case when p_reenable then false else checks_excluded or p_decision in ('no_website','wont_address') end,
     reviewed_by=p_actor,reviewed_at=now(),review_reason=btrim(p_reason),
     review_observed_revision=p_revision,
     resolved_at=case when p_decision='unreviewed' then null else now() end
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
revoke all on function public.procurement_source_review_scope(uuid),public.procurement_source_check_excluded(uuid),
 public.procurement_source_review_revisions(uuid[]),public.record_procurement_source_decision(uuid,uuid,integer,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.procurement_source_review_scope(uuid),public.procurement_source_check_excluded(uuid),
 public.procurement_source_review_revisions(uuid[]),public.record_procurement_source_decision(uuid,uuid,integer,text,text,text,text,boolean) to service_role;
commit;
