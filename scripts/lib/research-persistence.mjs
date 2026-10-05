import {hash} from './reviewed-batch.mjs';
import {same} from './sam-normalize.mjs';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const stableId=value=>{const h=hash(value);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export function publicUrl(value){
 const u=new URL(value);need(u.protocol==='https:'&&!u.username&&!u.password,'Public HTTPS URL required');
 need(![...u.searchParams.keys()].some(k=>/token|signature|credential|api.?key|password|secret|code/i.test(k)),'Credential-bearing URL rejected');return u.href;
}
export function safeMetadata(value){
 const text=JSON.stringify(value);need(!/sb_secret_|sb_publishable_|Bearer\s|X-Amz-(Signature|Security-Token|Credential)|"(?:password|access_token|refresh_token|api_key|tax_id|ssn)"/i.test(text),'Sensitive data rejected');
 const walk=v=>{if(typeof v==='string') {
   need(!/\b(?:Bearer\s+|sb_secret_|sb_publishable_|sk_live_|re_[A-Za-z0-9]{20})/i.test(v),'Sensitive data rejected');
   for(const url of v.match(/https?:\/\/[^\s<>"']+/g)??[])publicUrl(url.replace(/^http:/,'https:'));
 } else if(v&&typeof v==='object')for(const [k,item] of Object.entries(v)){need(!/^(?:password|.*token|api[_-]?key|client[_-]?secret|secret|authorization_header|cookie|tax_id|ssn|mailbox|email_body|credentials)$/i.test(k),'Sensitive data rejected');walk(item);}};walk(value);
 return value;
}
function base(spec,before){need(spec.version===1&&spec.project_ref===before.project_ref,'Configured project/version mismatch');need(typeof spec.authorization==='string'&&spec.authorization.trim(),'Record scoped user authorization');}
function delta(table,before,row){return {table,before:before??null,row};}
const union=(a,b)=>[...new Map([...a,...b].map(x=>[hash(x),x])).values()];
const textKey=value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
export function canonicalUrl(value){const u=new URL(publicUrl(value));u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';u.searchParams.sort();return u.href;}
const scopeKey=s=>({...s,requested_search_areas:s.requested_search_areas.map(a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,typeof v==='string'?textKey(v):v]))).sort((a,b)=>hash(a).localeCompare(hash(b)))});
export function planRegistry(spec,before){
 base(spec,before);need(Array.isArray(spec.requests)&&spec.requests.length&&Array.isArray(spec.sources),'Explicit sources/requests required');
 const rows=[],requests={},sources={},requestSourcePairs=new Map();
 for(const r of spec.requests){
  need(r.key&&!requests[r.key]&&r.name&&r.requested_search_areas?.length,'Invalid/duplicate request key');
  need(r.requested_search_areas.every(a=>a.state_code==='AR'&&['city','county'].includes(a.area_type)&&(a.area_type==='city'?a.city_name:a.county_name)),'Resolved Arkansas city/county area required');
  const scope={search_boundary_mode:'exact_area',requested_search_areas:r.requested_search_areas,service_scope:r.service_scope,search_windows:r.search_windows};
  need(scope.service_scope&&scope.search_windows,'Service and date scope required');
  const normalized=scopeKey(scope);
  const matches=before.procurement_search_requests.filter(x=>x.requested_search_areas&&same(scopeKey(Object.fromEntries(Object.keys(scope).map(k=>[k,x[k]]))),normalized));
  need(matches.length<=1,'Ambiguous existing request');
  const old=matches[0],id=old?.id??stableId(['procurement-request',normalized]);requests[r.key]=id;
  if(!old)rows.push(delta('procurement_search_requests',null,{id,name:r.name,...scope,contracting_entity_geo_levels:['city','county','federal','municipality','state'],state_search_names:[],scope_resolution_state:'ready'}));
 }
 for(const s of spec.sources){
  need(/^[a-z0-9][a-z0-9-]*$/.test(s.code)&&s.local_key&&s.identity_evidence?.trim(),'Source code, local key and identity evidence required');
  publicUrl(s.url);safeMetadata(s.metadata??{});
  const matches=before.procurement_sources.filter(x=>x.code===s.code);need(matches.length<=1,'Ambiguous source code');
  const identity=hash([textKey(s.provider),textKey(s.agency),canonicalUrl(s.url),s.record_category??null]);
  const old=matches[0];need(old?(s.existing_id===old.id||(!s.existing_id&&old.identity_key===identity&&old.id===stableId(['procurement-source',identity]))):!s.existing_id,'Reviewed existing source ID changed or explicit alias missing');
  need(old||!before.procurement_sources.some(x=>x.identity_key===identity),'Existing source identity requires explicit alias mapping');
  need(old||!before.procurement_sources.some(x=>canonicalUrl(x.url)===canonicalUrl(s.url)&&[s.name,s.agency].some(n=>textKey(x.name)===textKey(n))),'Existing URL/agency requires reviewed alias mapping');
  const id=old?.id??stableId(['procurement-source',identity]);
  const associations=s.request_keys.map(k=>{need(requests[k],'Unknown request scope');return {search_request_id:requests[k],request_key:k};});
  const areas=s.request_keys.flatMap(k=>before.procurement_search_requests.find(r=>r.id===requests[k])?.requested_search_areas??spec.requests.find(r=>r.key===k).requested_search_areas);
  const prior=old?.config?.research_persistence??{};
  for(const a of associations){const p=prior.coverage_by_scope?.[a.search_request_id];need(!p?.checked_at||!s.metadata?.checked_at||Date.parse(s.metadata.checked_at)>=Date.parse(p.checked_at),'Older coverage would replace newer research');}
  const history=union(prior.coverage_history??[],associations.filter(a=>prior.coverage_by_scope?.[a.search_request_id]&&!same(prior.coverage_by_scope[a.search_request_id],s.metadata??{})).map(a=>({search_request_id:a.search_request_id,previous:prior.coverage_by_scope[a.search_request_id],replacement_checked_at:s.metadata?.checked_at??null})));
  const research={...prior,schema_version:1,local_keys:union(prior.local_keys??[],[s.local_key]),request_associations:union(prior.request_associations??[],associations),coverage_by_scope:{...(prior.coverage_by_scope??{}),...Object.fromEntries(associations.map(a=>[a.search_request_id,s.metadata??{}]))},coverage_history:history,identity_evidence:s.identity_evidence};
  const row={...(old??{id,code:s.code,name:s.name,url:s.url,identity_key:identity,contracting_entity_geo_level:s.geo_level,business_category:s.business_category??'other_public'}),source_coverage_areas:union(old?.source_coverage_areas??[],areas),config:{...(old?.config??{}),research_persistence:research}};
  if(old)delete row.updated_at;
  safeMetadata(row.config);if(!old||!Object.entries(row).every(([k,v])=>same(old[k],v)))rows.push(delta('procurement_sources',old,row));
  (sources[s.local_key]??=[]).push({id,code:s.code,request_ids:associations.map(a=>a.search_request_id)});
  for(const a of associations) requestSourcePairs.set(`${a.search_request_id}/${id}`,
    {search_request_id:a.search_request_id,source_id:id,discovery_reason:s.identity_evidence});
 }
 if(Array.isArray(before.procurement_request_sources)) for(const link of requestSourcePairs.values()){
  if(!before.procurement_request_sources.some(x=>x.search_request_id===link.search_request_id&&x.source_id===link.source_id))
    rows.push(delta('procurement_request_sources',null,
      {id:stableId(['procurement-request-source',link.search_request_id,link.source_id]),...link}));
 }
 for(const c of spec.capabilities??[]){
  need(Array.isArray(before.procurement_source_capabilities)&&Array.isArray(before.procurement_geographies),
    'Capability registration requires a fresh geography/capability snapshot');
  const sourceRow=rows.find(d=>d.table==='procurement_sources'&&d.row.code===c.source_code)?.row??
    before.procurement_sources.find(s=>s.code===c.source_code);
  need(sourceRow&&before.procurement_geographies.some(g=>g.id===c.route_geography_id&&g.source_active!==false),
    'Capability source and active route geography required');
  need(['forecast','opportunity','award'].includes(c.kind)&&['api','browser','document'].includes(c.method),
    'Capability kind and method required');
  publicUrl(c.endpoint_url);publicUrl(c.official_entry_url);
  need(c.method_spec?.version===1&&c.parser_version?.trim(),
    'Versioned method specification and parser required');
  need(c.verified_at&&c.verified_until&&Date.parse(c.verified_until)>Date.parse(c.verified_at)&&
    c.verification_evidence&&Object.keys(c.verification_evidence).length,
    'Current verification evidence and expiry required');
  safeMetadata(c.method_spec);safeMetadata(c.verification_evidence);
  const matches=before.procurement_source_capabilities.filter(x=>x.source_id===sourceRow.id&&x.kind===c.kind&&
    x.endpoint_url===c.endpoint_url&&x.method===c.method);
  need(matches.length<=1,'Ambiguous existing capability');
  const old=matches[0];
  need(!old?.verified_at||Date.parse(c.verified_at)>=Date.parse(old.verified_at),
    'Older method verification would replace newer evidence');
  const row={...(old??{id:stableId(['procurement-capability',sourceRow.id,c.kind,c.method,c.endpoint_url]),
    source_id:sourceRow.id,kind:c.kind,method:c.method,endpoint_url:c.endpoint_url}),
    official_entry_url:c.official_entry_url,route_geography_id:c.route_geography_id,
    agency_geography_id:c.agency_geography_id??old?.agency_geography_id??null,
    availability:'active',verified_at:c.verified_at,verified_until:c.verified_until,
    verification_evidence:c.verification_evidence,parser_version:c.parser_version,
    method_spec:c.method_spec,next_action:c.next_action??null};
  if(old) delete row.updated_at;
  if(!old||!Object.entries(row).every(([k,v])=>same(old[k],v))) rows.push(delta('procurement_source_capabilities',old,row));
 }
 need(new Set(rows.map(r=>r.table+'/'+r.row.id)).size===rows.length,'Duplicate physical source/request in one package');
 return {version:1,kind:'registry',project_ref:spec.project_ref,authorization:spec.authorization,rows,mappings:{requests,sources}};
}
export function planManual(spec,before){
 base(spec,before);need(Array.isArray(spec.findings)&&spec.findings.length,'Explicit manual findings required');const rows=[];
 for(const f of spec.findings){
  need(uuid.test(f.source_id)&&before.procurement_sources.some(x=>x.id===f.source_id),'Missing registered source');
  need(f.request_ids?.length&&f.request_ids.every(id=>before.procurement_search_requests.some(x=>x.id===id)),'Missing registered geographic request');
  const associations=before.procurement_sources.find(x=>x.id===f.source_id).config?.research_persistence?.request_associations;
  need(f.request_ids.every(id=>
    associations?.some(a=>a.search_request_id===id) ||
    before.procurement_request_sources?.some(a=>a.search_request_id===id&&a.source_id===f.source_id) ||
    before.procurement_coverage_tasks?.some(t=>t.source_id===f.source_id&&t.kind!=='source_entry'&&
      before.procurement_request_targets?.some(target=>target.id===t.target_id&&target.search_request_id===id))),
    'Source is not registered for the reviewed geographic request');
  need(f.external_id&&!f.external_id.startsWith('page:')&&f.payload?.title&&f.review_reason,'Record identity/title/review reason required');
  need(['primary','secondary'].includes(f.confidence),'Evidence confidence required');publicUrl(f.payload.source_url);safeMetadata(f.payload);
  need(f.evidence?.length&&f.evidence.every(e=>{publicUrl(e.url);return /^[a-f0-9]{64}$/.test(e.content_sha256)&&e.excerpt?.trim()&&e.retrieved_at&&e.locator;}),'Evidence URL/hash/excerpt/time/page required');
  const evidenceKeys = new Set(['url','content_sha256','excerpt','retrieved_at','locator','local_path','capture_kind']);
  need(f.evidence.every(e=>Object.keys(e).every(k=>evidenceKeys.has(k))),'Unsupported evidence metadata field');
  need(f.field_basis == null || (typeof f.field_basis==='object'&&!Array.isArray(f.field_basis)),'Field basis must be an object');
  need(Object.keys(f.field_basis??{}).length<=64&&Object.values(f.field_basis??{}).every(v=>typeof v==='string'&&v.length<=10000),'Field basis requires bounded text explanations');
  const capture={version:1,confidence:f.confidence,request_ids:f.request_ids,evidence:f.evidence.map(({local_path,...publicEvidence})=>publicEvidence),field_basis:f.field_basis??{},authorization:spec.authorization};
  let externalId=f.external_id;
  if(f.amends_intake_id) {
    const prior=before.procurement_intake_items.find(i=>i.id===f.amends_intake_id);
    need(prior&&prior.source_id===f.source_id&&prior.payload.manual_capture,'Missing same-source manual amendment parent');
    need((prior.payload.manual_capture.record_external_id??prior.external_id)===f.external_id,'Amendment record identity mismatch');
    need(prior.status!=='ignored','Ignored intake cannot be revived through an amendment');
    capture.record_external_id=f.external_id;
    capture.amends_intake_id=prior.id;
    externalId=f.external_id+'::observation:'+hash({...f.payload,manual_capture:capture});
  }
  const payload=safeMetadata({...f.payload,manual_capture:capture});
  const matches=before.procurement_intake_items.filter(x=>x.source_id===f.source_id&&x.external_id===externalId);need(matches.length<=1,'Ambiguous intake identity');
  const old=matches[0];need(!old||same(old.payload,payload),'Changed intake evidence: retain original and stage a reviewed amendment identity');
  if(!old)rows.push(delta('procurement_intake_items',null,{id:stableId(['manual-intake',f.source_id,externalId]),source_id:f.source_id,external_id:externalId,payload,status:'pending',review_reason:f.review_reason}));
 }
 need(new Set(rows.map(x=>x.row.id)).size===rows.length,'Duplicate manual finding');
 return {version:1,kind:'manual',project_ref:spec.project_ref,authorization:spec.authorization,rows};
}
const literal=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const quote=k=>{need(/^[a-z_]+$/.test(k),'Invalid SQL identifier');return '"'+k+'"';};
export function persistenceSql(m){
 const allowed=['procurement_sources','procurement_search_requests','procurement_intake_items','procurement_source_capabilities','procurement_request_sources'];
 const statements=m.rows.map(d=>{
  need(allowed.includes(d.table)&&uuid.test(d.row.id),'Invalid persistence target');const keys=Object.keys(d.row),table='public.'+quote(d.table),json=literal(d.row),before=literal(d.before);
  const projection=keys.map(k=>`'${k}',to_jsonb(t)->'${k}'`).join(',');
  const expected=`(select jsonb_build_object(${keys.map(k=>`'${k}',to_jsonb(x)->'${k}'`).join(',')}) from jsonb_populate_record(null::${table},${json}) x)`;
  return `do $guard$ begin
 if exists(select 1 from ${table} t where id='${d.row.id}' and not (jsonb_build_object(${projection})=${expected}${d.before?` or (to_jsonb(t)-'updated_at'=${before}-'updated_at' and t.updated_at=(${before}->>'updated_at')::timestamptz)`:''})) then raise exception 'Persistence baseline changed'; end if;
 ${d.before?`if not exists(select 1 from ${table} where id='${d.row.id}') then raise exception 'Persistence baseline missing'; end if;`:''}
 end $guard$;
 ${d.before?`update ${table} t set ${keys.filter(k=>k!=='id').map(k=>`${quote(k)}=x.${quote(k)}`).join(',')},updated_at=now() from jsonb_populate_record(null::${table},${json}) x where t.id=x.id and jsonb_build_object(${projection})<>${expected};`:`insert into ${table} (${keys.map(quote).join(',')}) select ${keys.map(quote).join(',')} from jsonb_populate_record(null::${table},${json}) on conflict(id) do nothing;`}`;
 }).join('\n');
 return `begin; set local lock_timeout='10s'; set local statement_timeout='90s';
lock table public.procurement_sources,public.procurement_search_requests,public.procurement_intake_items${m.rows.some(r=>r.table==='procurement_source_capabilities')?',public.procurement_source_capabilities':''}${m.rows.some(r=>r.table==='procurement_request_sources')?',public.procurement_request_sources':''} in share row exclusive mode;
${statements}
-- AFTER_CANONICAL_UPSERT: offline fault-injection point.
commit;\n`;
}
export function verifyPersistence(before,after,m){
 const errors=[];if(before.project_ref!==m.project_ref||after.project_ref!==m.project_ref)errors.push('Project mismatch');
 for(const d of m.rows){const row=after[d.table].find(x=>x.id===d.row.id);if(!row||!Object.entries(d.row).every(([k,v])=>same(row[k],v)))errors.push('Persistence postcondition: '+d.row.id);}
 for(const table of Object.keys(before).filter(k=>Array.isArray(before[k])&&Array.isArray(after[k]))){
  for(const old of before[table])if(!m.rows.some(d=>d.table===table&&d.row.id===old.id)&&!same(old,after[table].find(x=>x.id===old.id)))errors.push('Unrelated row changed: '+table+'/'+old.id);
  const added=after[table].filter(x=>!before[table].some(b=>b.id===x.id));if(added.some(x=>!m.rows.some(d=>d.table===table&&d.row.id===x.id)))errors.push('Unexpected rows: '+table);
 }
 return {status:errors.length?'verification_failed':'verified',verified:!errors.length,errors,counts:{inserted:m.rows.filter(d=>!before[d.table].some(x=>x.id===d.row.id)).length,updated:m.rows.filter(d=>d.before).length},mappings:m.mappings??null};
}
