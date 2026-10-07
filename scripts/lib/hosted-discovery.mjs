import { randomUUID } from 'node:crypto';
import { checked,rows,one,sha } from './hosted-store.mjs';
import { hash } from './reviewed-batch.mjs';
import { discoveryView,validateHandoff } from './public-source-discovery.mjs';
import { planRegistry,persistenceSql,verifyPersistence } from './research-persistence.mjs';
import { adapterContract } from './known-source-execution.mjs';
import { schemaHash } from './hosted-import.mjs';
import {publicDiscovery} from './official-link-discovery.mjs';
import {rehearsalBlueprint,rehearsalPolicy} from './native-sql-rehearsal.mjs';

// A configured researcher can feed this contract. Missing search execution is a persisted
// human handoff, never an invented source or a silently successful discovery job.
export function discoveryService(options) {
  if(options.collect)return publicDiscovery({...options,persist:args=>saveDiscoveredMethod({...options,...args}),
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

// Durable, versioned persistence entry point for a bounded researcher. It reuses the
// existing registry planner, SQL validation and baseline guards; it does not trust a model's URL claim.
export async function saveDiscoveredMethod({db,project,artifacts,transport,rehearse,requestId,taskId,sourceSpec,capability,actor,handoffs:researchedHandoffs=[],beforeSend=async()=>{}}) {
  if(!transport||!rehearse)throw new Error('Reviewed method transport and native rehearsal required');
  const task=await one(db,'procurement_coverage_tasks',taskId);
  const target=task&&await one(db,'procurement_request_targets',task.target_id);
  if(target?.search_request_id!==requestId || task.kind!==capability.kind || task.route_geography_id!==capability.route_geography_id)
    throw new Error('Method must bind the saved geography/category gap');
  const [sources,requests,existingCaps,associations]=await Promise.all([
    rows(db,'procurement_sources'),rows(db,'procurement_search_requests',q=>q.eq('id',requestId)),rows(db,'procurement_source_capabilities'),
    rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId))]);
  const source=sources.find(s=>s.id===task.source_id);
  if(task.source_id&&!source)throw new Error('Registered source missing');
  if(source&&sourceSpec.code!==source.code)throw new Error('Do not replace a registered source with a duplicate');
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
  const spec={version:1,project_ref:project,authorization:`Official method review by ${actor}; request ${requestId}`,requests:[{...requests[0],key:'request'}],
    sources:[{...sourceSpec,existing_id:source?.id,request_keys:['request']}],capabilities:[{...capability,source_code:sourceSpec.code}]};
  const manifest=planRegistry(spec,before),sql=persistenceSql(manifest),schema=await transport.schema();
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
