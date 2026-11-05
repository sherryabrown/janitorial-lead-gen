begin;
-- Cache only contract validation performed by the existing execution-side validator.
-- Expiry and availability are still checked at read time. No private spec is exposed.
alter table public.procurement_source_capabilities add column reporting_contract_hash text;
alter table public.procurement_source_capabilities add column reporting_contract_valid boolean;
create function public.procurement_capability_contract_hash(c public.procurement_source_capabilities) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(c.source_id,c.kind,c.method,c.method_spec,c.parser_version,c.availability,
  case jsonb_typeof(c.verification_evidence) when 'object' then c.verification_evidence<>'{}' when 'array' then jsonb_array_length(c.verification_evidence)>0 when 'string' then length(c.verification_evidence#>>'{}')>0 else false end,
  (select code from public.procurement_sources where id=c.source_id))::text);
$$;
create function public.procurement_capability_read_inputs(p_limit integer default 25) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_limit<1 or p_limit>100 then raise exception 'Invalid capability batch';end if;
 return coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('input_fingerprint',public.procurement_capability_contract_hash(c),'source_code',(select code from public.procurement_sources where id=c.source_id)))
  from (select * from public.procurement_source_capabilities c where reporting_contract_hash is distinct from public.procurement_capability_contract_hash(c) order by id limit p_limit) c),'[]');
end $$;
create function public.procurement_publish_capability_readiness(p_id uuid,p_input text,p_valid boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.procurement_source_capabilities c set reporting_contract_hash=p_input,reporting_contract_valid=p_valid
  where id=p_id and public.procurement_capability_contract_hash(c)=p_input;
 return found;
end $$;
create function public.procurement_saved_source_status(p_request uuid,p_admin boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare tasks uuid[]; context jsonb; items jsonb; titles jsonb='{
 "source_missing":["No verified website","This location has no verified website for this check."],
 "method_missing":["Bid listings need setup","The website has no verified method for checking this category."],
 "blocked":["Website could not be checked","This check did not finish. Other independent sources can continue."],
 "partial":["Website check is incomplete","Only part of this source could be checked."],
 "reviewed_no_results":["Checked · no matching records","This completed check found no matching records in its scope."],
 "reviewed_with_results":["Checked · records found","Matching records were captured; saved leads still depend on validation."],
 "superseded":["Replaced by a later check","This saved attempt remains part of run history."],
 "unchecked":["Waiting to check","No completed check is recorded for this attempt."]}';
begin
 if not exists(select 1 from public.procurement_search_requests where id=p_request) then raise exception 'Run results unavailable';end if;
 select coalesce(array_agg(t.id order by t.id),'{}') into tasks from public.procurement_coverage_tasks t join public.procurement_request_targets target on target.id=t.target_id where target.search_request_id=p_request;
 if cardinality(tasks)>1000 then raise exception 'This source selection exceeds its safe bound. Select a narrower run.';end if;
 context=case when cardinality(tasks)>0 then public.procurement_source_review_context(tasks,false) else '{}' end;
 select coalesce(jsonb_agg(jsonb_build_object('task_id',t.id,'id',context#>array['reviews',t.id::text,'id'],'version',coalesce(context#>array['reviews',t.id::text,'review_version'],'0'),
 'scope',context#>array['scopes',t.id::text],'name',coalesce(s.name,g.name,'Source website'),'location',coalesce(g.name,'Saved location'),'category',t.kind,
 'title',case when context#>>array['skipped',t.id::text]='true' then 'Not checked by admin decision' else coalesce(titles#>>array[t.state,'0'],'Check status unavailable') end,
 'impact',case when context#>>array['skipped',t.id::text]='true' then 'This check was skipped. Other source checks continued.' else coalesce(titles#>>array[t.state,'1'],'Review is needed before claiming complete coverage.') end,
 'check',jsonb_build_object('state',case when context#>>array['skipped',t.id::text]='true' then 'admin_excluded' else t.state end,'observed_at',t.updated_at,'last_success_at',cap.last_success_at),
 'current',jsonb_build_object('task_id',coalesce(context#>array['current_tasks',t.id::text,'id'],to_jsonb(t.id)),'target_id',coalesce(context#>array['current_tasks',t.id::text,'target_id'],to_jsonb(t.target_id)),
  'state',coalesce(context#>>array['current_tasks',t.id::text,'state'],t.state),
  'title',coalesce(titles#>>array[coalesce(context#>>array['current_tasks',t.id::text,'state'],t.state),'0'],'Source needs review'),
  'impact',coalesce(titles#>>array[coalesce(context#>>array['current_tasks',t.id::text,'state'],t.state),'1'],'The saved source check needs review before claiming complete coverage.'),
  'observed_at',coalesce(context#>array['current_tasks',t.id::text,'updated_at'],to_jsonb(t.updated_at))),
 'revision',coalesce(context#>array['current_revisions',t.id::text],context#>array['revisions',t.id::text]),
 'decision',coalesce(context#>>array['reviews',t.id::text,'review_decision'],'unreviewed'),'previous_decision',context#>array['reviews',t.id::text,'review_decision'],
 'checks_excluded',coalesce((context#>>array['excluded',t.id::text])::boolean,false) or coalesce((context#>>array['reviews',t.id::text,'checks_excluded'])::boolean,false),
 'reviewed_at',context#>array['reviews',t.id::text,'reviewed_at'],'reviewed_by_label',context#>array['reviews',t.id::text,'reviewed_by_label'],
 'responsibility',case when context#>>array['reviews',t.id::text,'review_decision']='needs_developer' then 'Developer' else 'Admin' end,
 'allowed_actions',case when not p_admin then '["view_status"]'::jsonb when t.state in ('reviewed_no_results','reviewed_with_results','superseded') then '[]'::jsonb else '["provide_website","no_website","no_issue","wont_address","needs_developer"]'::jsonb end) order by t.id),'[]') into items
 from public.procurement_coverage_tasks t left join public.procurement_sources s on s.id=t.source_id left join public.procurement_geographies g on g.id=t.route_geography_id left join public.procurement_source_capabilities cap on cap.id=t.capability_id where t.id=any(tasks);
 return jsonb_build_object('basis','What was checked in this run','decision_basis','Current admin decision; historical check outcomes are unchanged','items',items);
end $$;
revoke all on function public.procurement_capability_contract_hash(public.procurement_source_capabilities),public.procurement_capability_read_inputs(integer),public.procurement_publish_capability_readiness(uuid,text,boolean),public.procurement_saved_source_status(uuid,boolean) from public,anon,authenticated;
grant execute on function public.procurement_capability_read_inputs(integer),public.procurement_publish_capability_readiness(uuid,text,boolean) to service_role;
commit;
