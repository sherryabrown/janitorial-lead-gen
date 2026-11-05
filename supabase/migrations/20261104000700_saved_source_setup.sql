begin;
create function public.procurement_saved_source_setup(p_schedule uuid,p_limit integer,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare config jsonb; counties jsonb; route_ids text[]; state_ids uuid[]; sources jsonb; missing jsonb; total integer; gap_count integer; pending_contract boolean;
begin
 select s.config into config from public.procurement_schedules s where s.id=p_schedule;
 if not found then raise exception 'Schedule unavailable';end if;
 counties=coalesce(config->'county_ids','[]');
 if config->>'target_kind'='state_source' then
  select coalesce(array_agg(a.source_id),'{}'),counties||coalesce(jsonb_path_query_array(jsonb_agg(a.county_ids),'$[*][*]'),'[]') into state_ids,counties from public.procurement_state_trigger_associations a
   where coalesce(config->'state_trigger_ids',jsonb_build_array(config->>'state_trigger_id')) ? a.id::text;
 end if;
 select array_agg(g.id) into route_ids from public.procurement_geographies g where
  config->>'target_kind'='sam' and g.id='05' or config->>'target_kind'<>'sam' and (g.id='05' or counties ? g.id or exists(select 1 from public.procurement_place_counties pc where pc.place_id=g.id and counties ? pc.county_id));
 with inventory as materialized (
  select s.id,s.name,s.url,s.code,s.contracting_entity_geo_level,g.id geography_id,g.name geography,g.kind geo_kind,cat.category,
   case when exists(select 1 from public.procurement_source_capabilities cap where cap.source_id=s.id and cap.kind=cat.category
    and (cap.route_geography_id=g.id or cap.verification_evidence->>'automation_policy'='county-public-v1' and cap.verification_evidence->'route_geography_ids' ? g.id)
    and cap.reporting_contract_hash=public.procurement_capability_contract_hash(cap) and cap.reporting_contract_valid and cap.availability='active' and cap.verified_at<=now() and cap.verified_until>now()) then 'verified_method'
   when exists(select 1 from public.procurement_source_capabilities cap where cap.source_id=s.id and cap.kind=cat.category and (cap.route_geography_id=g.id or cap.verification_evidence->>'automation_policy'='county-public-v1' and cap.verification_evidence->'route_geography_ids' ? g.id)) then 'method_blocked'
   when exists(select 1 from jsonb_array_elements(coalesce(s.config#>'{known_source_review,category_assessments}','[]')) a where a->>'kind'=cat.category and a->>'route_geography_id'=g.id and a->>'status'='unsupported' and length(trim(a->>'reason'))>0 and a->'evidence'<>'{}' and public.procurement_saved_timestamp(a->>'checked_at')<=now() and public.procurement_saved_timestamp(a->>'valid_until')>now()) then 'unsupported' else 'category_unresolved' end status,
   exists(select 1 from public.procurement_source_capabilities cap where cap.source_id=s.id and cap.kind=cat.category
    and (cap.route_geography_id=g.id or cap.verification_evidence->>'automation_policy'='county-public-v1' and cap.verification_evidence->'route_geography_ids' ? g.id)
    and cap.reporting_contract_hash is distinct from public.procurement_capability_contract_hash(cap)) pending_contract,
   exists(select 1 from public.procurement_action_requests a where a.checks_excluded and a.review_scope->>'geography_id'=g.id and a.review_scope->>'category'=cat.category and (a.review_scope->>'source_id' is null or a.review_scope->>'source_id'=s.id::text)
    and (a.review_scope->>'capability_id' is null or exists(select 1 from public.procurement_source_capabilities cap where cap.source_id=s.id and cap.kind=cat.category
     and (cap.route_geography_id=g.id or cap.verification_evidence->>'automation_policy'='county-public-v1' and cap.verification_evidence->'route_geography_ids' ? g.id)
     and (cap.id::text=a.review_scope->>'capability_id' or cap.verification_evidence#>>array['source_review_roots',g.id]=a.review_scope->>'capability_id')))) checks_excluded
  from public.procurement_sources s cross join public.procurement_geographies g cross join unnest(array['forecast','opportunity','award']) cat(category)
  where g.source_active and g.id=any(route_ids)
   and (config->>'target_kind'='sam' and s.code in ('sam','sam-awards') or config->>'target_kind'='state_source' and s.id=any(state_ids) or config->>'target_kind'='county_scope' and s.code not in ('sam','sam-awards'))
   and (g.id<>'05' or config->>'target_kind'<>'county_scope' or exists(select 1 from public.procurement_state_trigger_associations a cross join unnest(a.county_ids) cid where a.source_id=s.id and counties ? cid))
   and (exists(select 1 from public.procurement_source_capabilities cap where cap.source_id=s.id and (cap.route_geography_id=g.id or cap.verification_evidence->>'automation_policy'='county-public-v1' and cap.verification_evidence->'route_geography_ids' ? g.id))
    or exists(select 1 from jsonb_array_elements(coalesce(s.source_coverage_areas,'[]')) a where a->>'state_code'='AR' and (
      g.kind='municipality' and a->>'area_type'='city' and regexp_replace(regexp_replace(lower(a->>'city_name'),'\m(county|city|town)\M','','g'),'[^a-z0-9]','','g')=regexp_replace(regexp_replace(lower(g.name),'\m(county|city|town)\M','','g'),'[^a-z0-9]','','g')
      or g.kind='county' and a->>'area_type'='county' and regexp_replace(regexp_replace(lower(a->>'county_name'),'\m(county|city|town)\M','','g'),'[^a-z0-9]','','g')=regexp_replace(regexp_replace(lower(g.name),'\m(county|city|town)\M','','g'),'[^a-z0-9]','','g')
      or g.kind='state' and a->>'area_type'='state') or g.kind='state' and a->>'area_type'='country' and a->>'country_code'='US'))
 ), grouped as (
  select i.id,i.name,min(i.url) url,min(case when i.code in ('sam','sam-awards') then 'sam' else i.contracting_entity_geo_level end) kind,
   array_agg(distinct geography order by geography) locations,bool_or(i.pending_contract and config->'requested_categories' ? category) pending_contract,
   coalesce(jsonb_agg(jsonb_build_object('location',geography,'category',category,'status',status,'checks_excluded',checks_excluded) order by geography,category) filter(where config->'requested_categories' ? category),'[]') routes
  from inventory i group by i.id,i.name
 ), page as (select * from grouped order by name,id offset p_offset limit p_limit), captures as materialized (
  select r.source_id,r.started_at,r.finished_at,r.id,case when r.status in ('review_required','success','partial','error','blocked','completed','failed','running') then r.status else 'recorded' end status
  from public.procurement_runs r where source_id in(select id from page) order by started_at desc,id limit 500
 ),gaps as (
  select g.id geography_id,g.name location,c.category,c.position,exists(select 1 from public.procurement_action_requests a where a.checks_excluded and a.review_scope->>'source_id' is null and a.review_scope->>'geography_id'=g.id and a.review_scope->>'category'=c.category) checks_excluded
  from public.procurement_geographies g cross join unnest(array['forecast','opportunity','award']) with ordinality c(category,position)
  where config->>'target_kind'='county_scope' and g.id=any(route_ids) and g.kind in ('county','municipality') and g.source_active
   and not exists(select 1 from inventory i where i.geography_id=g.id and i.category=c.category)
 ) select (select count(*) from grouped),coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind,'locations',p.locations,'routes',p.routes,
 'url',case when p.url ~ '^https://[A-Za-z0-9.-]+(:443)?(/|$)' and p.url !~ '[?#]' and p.url !~* '^https://(localhost|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[^/]+\.(local|internal|localhost))(:443)?(/|$)' then p.url else null end,
 'last_check',(select jsonb_build_object('finished_at',r.finished_at,'status',r.status) from captures r where r.source_id=p.id order by r.started_at desc,r.id limit 1)) order by p.name,p.id) from page p),'[]'),
 coalesce((select jsonb_agg(jsonb_build_object('location',g.location,'category',g.category,'checks_excluded',g.checks_excluded) order by g.geography_id,g.position) from (select * from gaps order by geography_id,position limit p_limit) g where config->'requested_categories' ? g.category),'[]'),(select count(*) from gaps),coalesce((select bool_or(p.pending_contract) from page p),false) into total,sources,missing,gap_count,pending_contract;
 if pending_contract then raise exception 'Saved source method status is not yet available';end if;
 return jsonb_build_object('basis','Current source setup; earlier run outcomes remain unchanged','as_of',now(),'items',sources,'total',total,'next_offset',case when p_offset+p_limit<total then p_offset+p_limit else null end,'gaps',missing,'more_gaps',gap_count>p_limit);
end $$;
revoke all on function public.procurement_saved_timestamp(text),public.procurement_saved_source_setup(uuid,integer,integer) from public,anon,authenticated;
commit;
