import { randomUUID } from 'node:crypto';
import { checked,rows,one,sha } from './hosted-store.mjs';
import { hash } from './reviewed-batch.mjs';
import { discoveryView,validateHandoff } from './public-source-discovery.mjs';
import { planRegistry,persistenceSql,verifyPersistence } from './research-persistence.mjs';
import { adapterContract,capabilityCoversRoute,separateSamSource } from './known-source-execution.mjs';
import { schemaHash } from './hosted-import.mjs';
import {publicDiscovery} from './official-link-discovery.mjs';
import {rehearsalBlueprint,rehearsalPolicy} from './native-sql-rehearsal.mjs';
import {resolveOfficialDirectory} from './official-directory.mjs';

// A configured researcher can feed this contract. Missing search execution is a persisted
// human handoff, never an invented source or a silently successful discovery job.
export function discoveryService(options) {
  if(options.collect)return publicDiscovery({...options,persist:args=>saveDiscoveredMethod({...options,...args}),
    resolveSeed:args=>resolveDiscoverySeed({...options,...args}),
    reconcileHandoffs:args=>saveDiscoveryHandoffs({...options,...args})});
  const {db,artifacts}=options;
  return async(requestId,input,actor)=>{
    const [request,targets,geographies,capabilities,sources]=await Promise.all([
      one(db,'procurement_search_requests',requestId),rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId)),
      rows(db,'procurement_geographies'),rows(db,'procurement_source_capabilities'),rows(db,'procurement_sources')]);
    if(!request || !targets.length)throw new Error('Confirmed geography required');
    const gaps=discoveryView(request,targets,geographies,capabilities,sources);
    const task=input?.task_id?await one(db,'procurement_coverage_tasks',input.task_id):null;
    if(task&&!targets.some(t=>t.id===task.target_id))throw new Error('Discovery task belongs to another request');
    if(task&&!['source_missing','method_missing','blocked'].includes(task.state))throw new Error('Only persisted gaps require discovery');
    const dedupe=`hosted-discovery:${requestId}:${task?.id??'gaps'}`;
    const evidence=await artifacts.put({request_id:requestId,actor_id:actor,at:new Date().toISOString(),gaps});
    checked(await db.from('procurement_jobs').upsert({search_request_id:requestId,dedupe_key:dedupe,kind:'discover',state:'blocked',
      checkpoint:{stage:'discovery_handoff',actor_id:actor,evidence_artifact:evidence,task_id:task?.id??null,
        next_action:'Configure official research execution or supply verified method evidence; do not count this gap as coverage'}},
      {onConflict:'dedupe_key',ignoreDuplicates:true}));
    return {state:'blocked',blocker:'Official search/research execution provider is not configured',
      gaps,next_action:'Supply a verified official-source method through the guarded registration service; then resume the same request',
      limits:{search_queries_per_gap:5,candidate_pages_per_gap:10},aggregator_signup:false};
  };
}

// A missing-source gap may reuse its associated official seed. A registered task
// still owns its identity; an arbitrary source ID cannot be attached by the client.
export function reviewedDiscoverySource(task,spec,sources,associations) {
  const source=sources.find(s=>s.id===task.source_id);
  if(task.source_id&&!source)throw new Error('Registered source missing');
  if(source&&spec.code!==source.code)throw new Error('Do not replace a registered source with a duplicate');
  if(source)return source;
  if(!spec.existing_id)return undefined;
  const seed=sources.find(s=>s.id===spec.existing_id&&s.code===spec.code);
  if(!seed||!associations.some(a=>a.source_id===seed.id)&&!task.evidence?.registered_source_ids?.includes(seed.id))
    throw new Error('Existing official seed must belong to this request or its saved registry route');
  return seed;
}
export function automaticRouteAssociation(capability,source,existingCaps) {
  if(capability.verification_evidence?.automation_policy!=='county-public-v1')return capability;
  const matches=existingCaps.filter(c=>c.source_id===source?.id&&c.kind===capability.kind&&c.method===capability.method&&c.endpoint_url===capability.endpoint_url);
  if(matches.length>1)throw Error('Ambiguous existing source method identity');
  const old=matches[0];
  return {...capability,route_geography_id:old?.route_geography_id??capability.route_geography_id,
    verification_evidence:{...capability.verification_evidence,route_geography_ids:[...new Set([
      capability.route_geography_id,...(old?[old.route_geography_id]:[]),
      ...(old?.verification_evidence?.automation_policy==='county-public-v1'?old.verification_evidence.route_geography_ids??[]:[])])].sort()}};
}
// Durable, versioned persistence entry point for a bounded researcher. It reuses the
// existing registry planner, SQL validation and baseline guards; it does not trust a model's URL claim.
export async function saveDiscoveredMethod({db,project,artifacts,transport,rehearse,requestId,taskId,sourceSpec,capability,actor,guidedRepair=false,handoffs:researchedHandoffs=[],beforeSend=async()=>{}}) {
  if(!transport||!rehearse)throw new Error('Reviewed method transport and native rehearsal required');
  const task=await one(db,'procurement_coverage_tasks',taskId);
  const target=task&&await one(db,'procurement_request_targets',task.target_id);
  if(target?.search_request_id!==requestId || task.kind!==capability.kind || task.route_geography_id!==capability.route_geography_id)
    throw new Error('Method must bind the saved geography/category gap');
  const [sources,requests,existingCaps,associations]=await Promise.all([
    rows(db,'procurement_sources'),rows(db,'procurement_search_requests',q=>q.eq('id',requestId)),rows(db,'procurement_source_capabilities'),
    rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId))]);
  const source=reviewedDiscoverySource(task,sourceSpec,sources,associations);
  adapterContract({...capability,source_id:source?.id??randomUUID(),availability:'active'},source??sourceSpec);
  const evidence=capability.verification_evidence;
  if(!evidence?.run_ids?.length)throw new Error('Audited official captures required for method verification');
  const captures=await rows(db,'procurement_public_captures',q=>q.in('run_id',evidence.run_ids),'*',{order:'run_id'});
  const runs=await rows(db,'procurement_runs',q=>q.in('id',evidence.run_ids));
  if(captures.length!==evidence.run_ids.length || runs.length!==captures.length ||
    runs.some(r=>r.coverage_task_id!==taskId||r.detail?.state!=='content_saved') ||
    captures.some(c=>source&&c.source_id!==source.id||sha(Buffer.from(c.content_base64,'base64'))!==c.content_sha256)||
    capability.method_spec.urls.some(url=>!captures.some(c=>c.final_url===url)))throw new Error('Matching saved discovery evidence required');
  const before={project_ref:project,procurement_sources:sources,procurement_search_requests:requests,
    procurement_geographies:await rows(db,'procurement_geographies'),procurement_source_capabilities:existingCaps,procurement_request_sources:associations,procurement_intake_items:[]};
  const proposed=automaticRouteAssociation(capability,source,existingCaps);
  if(guidedRepair&&!task.source_id){
    const existing=existingCaps.find(c=>c.source_id===source?.id&&c.kind===task.kind&&c.endpoint_url===capability.endpoint_url&&c.method===capability.method);
    if(existing&&capabilityCoversRoute(existing,task.route_geography_id)&&!existing.verification_evidence?.source_review_entity_routes?.includes(task.route_geography_id))
      throw Error('A separately reviewed method already serves this location; developer reconciliation required');
    proposed.verification_evidence={...proposed.verification_evidence,
      source_review_entity_routes:[...new Set([...(proposed.verification_evidence?.source_review_entity_routes??[]),task.route_geography_id])]};
  }
  if(guidedRepair&&task.capability_id){
    const prior=existingCaps.find(c=>c.id===task.capability_id&&c.source_id===source?.id&&c.kind===task.kind);
    if(!prior)throw Error('The original method must remain available for repair history');
    if(prior.verification_evidence?.source_review_entity_routes?.includes(task.route_geography_id))
      proposed.verification_evidence={...proposed.verification_evidence,source_review_entity_routes:[...new Set([...(proposed.verification_evidence.source_review_entity_routes??[]),task.route_geography_id])]};
    const rootId=prior.verification_evidence?.source_review_roots?.[task.route_geography_id]??prior.id;
    if(!existingCaps.some(c=>c.id===rootId&&c.source_id===source.id&&c.kind===task.kind))throw Error('Saved method review lineage needs reconciliation');
    const replacement=existingCaps.find(c=>c.source_id===source.id&&c.kind===task.kind&&c.endpoint_url===capability.endpoint_url&&c.method===capability.method);
    if(replacement&&replacement.id!==prior.id){
      const competingRoot=replacement.verification_evidence?.source_review_roots?.[task.route_geography_id]??replacement.id;
      const competing=await rows(db,'procurement_action_requests',q=>q.contains('review_scope',{source_id:source.id,geography_id:task.route_geography_id,category:task.kind,capability_id:competingRoot}));
      if(competing.length||capabilityCoversRoute(replacement,task.route_geography_id))throw Error('A separate existing method/review already covers this route; developer reconciliation required');
    }
    proposed.verification_evidence={...proposed.verification_evidence,source_review_roots:{...replacement?.verification_evidence?.source_review_roots,
      ...proposed.verification_evidence?.source_review_roots,[task.route_geography_id]:rootId}};
  }
  const spec={version:1,project_ref:project,authorization:`Official method review by ${actor}; request ${requestId}`,requests:[{...requests[0],key:'request'}],
    sources:[{...sourceSpec,existing_id:source?.id,request_keys:['request']}],capabilities:[{...proposed,source_code:sourceSpec.code}]};
  const manifest=planRegistry(spec,before);
  if(guidedRepair&&task.capability_id){
    const prior=existingCaps.find(c=>c.id===task.capability_id&&c.source_id===source?.id&&c.kind===task.kind);
    const replacement=manifest.rows.find(d=>d.table==='procurement_source_capabilities')?.row??existingCaps.find(c=>c.source_id===source?.id&&c.kind===task.kind&&c.endpoint_url===capability.endpoint_url&&c.method===capability.method);
    if(prior&&replacement&&prior.id!==replacement.id&&capabilityCoversRoute(prior,task.route_geography_id)){
      const remaining=[...new Set([prior.route_geography_id,...(prior.verification_evidence?.automation_policy==='county-public-v1'?prior.verification_evidence.route_geography_ids??[]:[])])].filter(id=>id!==task.route_geography_id);
      const revised={...prior,availability:remaining.length?prior.availability:'unavailable',
        route_geography_id:remaining[0]??prior.route_geography_id,
        verification_evidence:{...prior.verification_evidence,route_geography_ids:remaining},
        next_action:remaining.length?'Replaced only for the repaired route':'Replaced by the verified source repair'};
      delete revised.updated_at;
      manifest.rows.push({table:'procurement_source_capabilities',before:prior,row:revised});
    }
  }
  // A request association is not proof that every city in that request is
  // served by this agency. Automatic verification preserves registered scope.
  if(capability.verification_evidence?.automation_policy==='county-public-v1'&&source) {
    const delta=manifest.rows.find(d=>d.table==='procurement_sources'&&d.row.id===source.id);
    if(delta)delta.row.source_coverage_areas=source.source_coverage_areas;
  }
  return persistRegistry({db,artifacts,transport,rehearse,requestId,before,manifest,sourceSpec,researchedHandoffs,beforeSend});
}

export async function persistRegistry({db,artifacts,transport,rehearse,requestId,before,manifest,sourceSpec,researchedHandoffs=[],beforeSend}) {
  const sql=persistenceSql(manifest),schema=await transport.schema();
  const test=await rehearse({before,schema,manifest,sql});
  if(test.status!=='native_tests_passed'||test.policy!==rehearsalPolicy||!['rollback','readback','replay','cleanup'].every(k=>test[k]===true)||
    test.rehearsal_sql_sha256!==hash(rehearsalBlueprint(before,schema,manifest).sql))throw new Error('Native registry rehearsal required');
  const artifact=await artifacts.put({manifest,before,schema_hash:schemaHash(schema),sql_hash:hash(sql),test});
  if(schemaHash(await transport.schema())!==schemaHash(schema))throw new Error('Method schema changed before persistence');
  await beforeSend(artifact);await transport.apply(sql);
  const after={...before,procurement_sources:await rows(db,'procurement_sources'),procurement_source_capabilities:await rows(db,'procurement_source_capabilities'),
    procurement_request_sources:await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId))};
  const receipt=verifyPersistence(before,after,manifest);
  if(!receipt.verified)throw new Error('Method persistence readback failed');
  await saveDiscoveryHandoffs({db,manifest,sourceSpec,handoffs:researchedHandoffs});
  return {artifact,receipt,test,next_action:'Replan and execute the saved method through the common capture/review/import workflow'};
}

// Directory evidence is captured by the server, not accepted from the client.
async function resolveDiscoverySeed({db,project,artifacts,transport,rehearse,requestId,taskId,actor,beforeSend,fetcher}) {
  if(!transport||!rehearse)throw Error('Native registry rehearsal is required for official source resolution');
  const task=await one(db,'procurement_coverage_tasks',taskId),target=task&&await one(db,'procurement_request_targets',task.target_id);
  if(target?.search_request_id!==requestId)throw Error('Directory task scope mismatch');
  const geo=await one(db,'procurement_geographies',task.route_geography_id);
  const registered=await rows(db,'procurement_sources'),priorMethods=await rows(db,'procurement_source_capabilities');
  const known=registered.filter(source=>!separateSamSource(source)&&priorMethods.some(method=>method.source_id===source.id&&method.kind===task.kind&&
    capabilityCoversRoute(method,geo.id)&&method.verification_evidence&&Object.keys(method.verification_evidence).length));
  if(known.length===1) {
    checked(await db.from('procurement_coverage_tasks').update({evidence:{...task.evidence,
      registered_source_ids:[...new Set([...(task.evidence?.registered_source_ids??[]),known[0].id])],seed_basis:'registered_method_route'}}).eq('id',task.id));
    return {state:'resolved',source_id:known[0].id,url:known[0].url};
  }
  const parents=geo.kind==='municipality'?await rows(db,'procurement_place_counties',q=>q.eq('place_id',geo.id),'county_id',{order:'county_id'}):[];
  const countyReferences=parents.length?await rows(db,'procurement_geographies',q=>q.in('id',parents.map(p=>p.county_id))):[];
  const resolved=await resolveOfficialDirectory(geo,{fetcher,countyReferences,capture:e=>artifacts.put(e)});
  const directoryArtifact=await artifacts.put(resolved);
  if(resolved.state!=='resolved')return {...resolved,pages:undefined,directory_artifact:directoryArtifact};
  const sources=await rows(db,'procurement_sources'),requests=await rows(db,'procurement_search_requests',q=>q.eq('id',requestId));
  const matches=sources.filter(s=>s.url===resolved.url);
  if(matches.length>1)return {state:'blocked',reason:'Multiple saved sources match the official directory website',directory_artifact:directoryArtifact};
  const existing=matches[0],code=existing?.code??`official-${geo.id.toLowerCase()}`;
  const sourceSpec={code,local_key:code,existing_id:existing?.id,name:existing?.name??geo.name,url:resolved.url,
    agency:geo.name,provider:new URL(resolved.url).hostname,geo_level:geo.kind==='municipality'?'city':geo.kind,
    identity_evidence:`Official directory identifies ${geo.name}; immutable evidence ${directoryArtifact}`,metadata:{directory_artifact:directoryArtifact},request_keys:['request']};
  const before={project_ref:project,procurement_sources:sources,procurement_search_requests:requests,
    procurement_geographies:await rows(db,'procurement_geographies'),procurement_source_capabilities:await rows(db,'procurement_source_capabilities'),
    procurement_request_sources:await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId)),procurement_intake_items:[]};
  const manifest=planRegistry({version:1,project_ref:project,authorization:`Automatic official directory resolution for ${requestId}; actor ${actor}`,
    requests:[{...requests[0],key:'request'}],sources:[sourceSpec]},before);
  const row=manifest.rows.find(d=>d.table==='procurement_sources');
  if(row)row.row.source_coverage_areas=existing?.source_coverage_areas??[{area_type:geo.kind==='county'?'county':'city',state_code:'AR',
    [geo.kind==='county'?'county_name':'city_name']:geo.name}];
  const persisted=await persistRegistry({db,artifacts,transport,rehearse,requestId,before,manifest,sourceSpec,beforeSend});
  return {state:'resolved',source_id:manifest.mappings.sources[code][0].id,url:resolved.url,directory_artifact:directoryArtifact,persisted};
}

export async function saveDiscoveryHandoffs({db,manifest,sourceSpec,handoffs:researchedHandoffs=[]}) {
  const sources=await rows(db,'procurement_sources'),registrations=await rows(db,'procurement_registrations'),handoffs=await rows(db,'procurement_access_handoffs');
  for(const handoff of researchedHandoffs) {
    const sourceId=manifest.mappings.sources[sourceSpec.local_key][0].id;
    const saved=validateHandoff({...handoff,source_id:sourceId},sources,registrations,handoffs);
    const prior=handoffs.find(h=>h.source_id===saved.source_id&&h.channel===saved.channel&&h.tenant===saved.tenant);
    const {source_id,channel,tenant,checked_on,access_state,next_actor,next_action,registration_id,...details}=saved;
    const row={source_id,channel,tenant,checked_on,access_state,next_actor,next_action,registration_id,details};
    if(!prior)checked(await db.from('procurement_access_handoffs').insert(row));
    else {
      // Research may refresh evidence/requirements without resetting access progress,
      // saved account references or the separately owned lifecycle.
      const mergeAssessment=(old,fresh)=>Object.fromEntries(Object.entries(fresh??{}).map(([k,v])=>[k,v==='unknown'?(old?.[k]??v):v]));
      const refreshed={...prior.details,...details,
        requirements:mergeAssessment(prior.details?.requirements,details.requirements),categories:mergeAssessment(prior.details?.categories,details.categories)},
        unchanged=prior.checked_on===saved.checked_on&&hash(prior.details)===hash(refreshed);
      if(unchanged)continue;
      const updated={checked_on:saved.checked_on,details:refreshed,
        history:[...(prior.history??[]),{checked_on:prior.checked_on,access_state:prior.access_state,next_action:prior.next_action}],updated_at:new Date().toISOString()};
      const result=checked(await db.from('procurement_access_handoffs').update(updated).eq('id',prior.id).eq('updated_at',prior.updated_at).select('id'));
      if(result.length!==1)throw new Error('Method saved; access research changed concurrently and needs reconciliation');
    }
  }
}
