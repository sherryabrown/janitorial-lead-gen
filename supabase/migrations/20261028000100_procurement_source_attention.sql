begin;
-- A verified website-entry repair links the new registration to its original
-- entity assessment. Reuse the immutable job receipt instead of another table.
create index procurement_jobs_entry_review_source_idx on public.procurement_jobs ((checkpoint->>'saved_source_id'))
 where checkpoint->>'guided_entry'='true' and checkpoint#>>'{persistence,receipt,verified}'='true';
create or replace function public.procurement_source_review_scope(p_task uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('geography_id',t.route_geography_id,'category',t.kind,
   'source_id',case when entry_origin.linked or c.verification_evidence->'source_review_entity_routes' ? t.route_geography_id then null else t.source_id end,
   'capability_id',case when entry_origin.linked or c.verification_evidence->'source_review_entity_routes' ? t.route_geography_id or c.verification_evidence->'source_review_source_routes' ? t.route_geography_id then null else coalesce(root.id,t.capability_id) end)
 from public.procurement_coverage_tasks t left join public.procurement_source_capabilities c on c.id=t.capability_id
 left join public.procurement_source_capabilities root on root.source_id=c.source_id and root.kind=c.kind and root.id=
   case when c.verification_evidence->'source_review_roots'->>t.route_geography_id ~ '^[a-f0-9-]{36}$'
     then (c.verification_evidence->'source_review_roots'->>t.route_geography_id)::uuid else c.id end
 left join lateral (
  select true linked from public.procurement_jobs j
  join public.procurement_coverage_tasks origin on origin.id=case when j.checkpoint->>'review_task_id' ~ '^[a-f0-9-]{36}$' then (j.checkpoint->>'review_task_id')::uuid end
  where t.kind='source_entry' and j.checkpoint->>'guided_entry'='true'
   and j.checkpoint->>'saved_source_id'=t.source_id::text and j.checkpoint#>>'{persistence,receipt,verified}'='true'
   and origin.kind='source_entry' and origin.source_id is null and origin.route_geography_id=t.route_geography_id limit 1
 ) entry_origin on true
 where t.id=p_task;
$$;

-- A read projection, not another queue/table. Canonical scope is shared with
-- decisions and exclusions; dedicated repair requests are never new problems.
create or replace function public.procurement_source_attention_page(p_reviewed boolean default false,p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if p_offset<0 or p_offset>10000 or p_limit<1 or p_limit>100 then raise exception 'Invalid pagination'; end if;
 with observations as materialized (
  select t.id,t.updated_at,t.state,t.target_id,public.procurement_source_review_scope(t.id) scope
  from public.procurement_coverage_tasks t
  join public.procurement_request_targets target on target.id=t.target_id
  join public.procurement_search_requests r on r.id=target.search_request_id
  where coalesce(r.workflow_control->>'source_repair','false')<>'true'
 ), latest as (
  select distinct on(scope) * from observations order by scope,updated_at desc,id desc
 ), eligible as (
  select l.* from latest l left join public.procurement_action_requests a on a.review_scope=l.scope
  where (l.state in ('source_missing','method_missing','blocked','partial') or a.id is not null)
   and case when p_reviewed then coalesce(a.review_decision,'unreviewed') in ('fixed_verified','no_website','no_issue','wont_address')
     else coalesce(a.review_decision,'unreviewed') in ('unreviewed','repair_in_progress','needs_developer') end
 ), selected as (
  select * from eligible order by updated_at desc,id desc offset p_offset limit p_limit
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('task_id',s.id,'request_id',t.search_request_id,'run_id',
   (select link.trigger_id from public.procurement_trigger_requests link join public.procurement_triggers parent on parent.id=link.trigger_id
    where link.request_id=t.search_request_id order by parent.created_at desc,parent.id desc limit 1)) order by s.updated_at desc,s.id desc)
  from selected s join public.procurement_request_targets t on t.id=s.target_id),'[]'::jsonb),
  'total',(select count(*) from eligible),'next_offset',case when (select count(*) from eligible)>p_offset+p_limit then p_offset+p_limit else null end) into result;
 return result;
end $$;
revoke all on function public.procurement_source_attention_page(boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.procurement_source_attention_page(boolean,integer,integer) to service_role;
create or replace function public.procurement_source_review_context(p_tasks uuid[],p_private boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revisions',public.procurement_source_review_revisions(p_tasks),
   'scopes',coalesce(jsonb_object_agg(t.id::text,public.procurement_source_review_scope(t.id)),'{}'::jsonb),
   'current_tasks',coalesce(jsonb_object_agg(t.id::text,case when current.id is null then null else
      jsonb_build_object('id',current.id,'target_id',current.target_id,'state',current.state,'updated_at',current.updated_at) end),'{}'::jsonb),
   'reviews',coalesce(jsonb_object_agg(t.id::text,case when a.id is null then null when p_private then to_jsonb(a)||jsonb_build_object('reviewed_by_label',(select nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),'') from public.profiles p where p.user_id=a.reviewed_by)) else
      jsonb_build_object('id',a.id,'review_version',a.review_version,'review_decision',a.review_decision,
        'checks_excluded',a.checks_excluded,'reviewed_at',a.reviewed_at,'reviewed_by_label',(select nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),'') from public.profiles p where p.user_id=a.reviewed_by)) end),'{}'::jsonb),
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
commit;
