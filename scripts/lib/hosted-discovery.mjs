import { randomUUID } from 'node:crypto';
import { checked,rows,one } from './hosted-store.mjs';
import { hash } from './reviewed-batch.mjs';
import { discoveryView,validateHandoff } from './public-source-discovery.mjs';
import { planRegistry,persistenceSql,verifyPersistence } from './research-persistence.mjs';
import { adapterContract } from './known-source-execution.mjs';
import { testBatchSql } from './batch-sql-test.mjs';
import { schemaHash } from './hosted-import.mjs';

// A configured researcher can feed this contract. Missing search execution is a persisted
// human handoff, never an invented source or a silently successful discovery job.
export function discoveryService({db,artifacts}) {
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
export async function saveDiscoveredMethod({db,project,artifacts,transport,requestId,taskId,sourceSpec,capability,actor,handoff}) {
  if(!transport)throw new Error('Reviewed method persistence transport required');
  const task=await one(db,'procurement_coverage_tasks',taskId);
  const target=task&&await one(db,'procurement_request_targets',task.target_id);
  if(target?.search_request_id!==requestId || task.kind!==capability.kind || task.route_geography_id!==capability.route_geography_id)
    throw new Error('Method must bind the saved geography/category gap');
  const [sources,requests,existingCaps,associations,registrations,handoffs]=await Promise.all([
    rows(db,'procurement_sources'),rows(db,'procurement_search_requests',q=>q.eq('id',requestId)),rows(db,'procurement_source_capabilities'),
    rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId)),rows(db,'procurement_registrations'),rows(db,'procurement_access_handoffs')]);
  const source=sources.find(s=>s.id===task.source_id);
  if(task.source_id&&!source)throw new Error('Registered source missing');
  if(source&&sourceSpec.code!==source.code)throw new Error('Do not replace a registered source with a duplicate');
  adapterContract({...capability,source_id:source?.id??randomUUID(),availability:'active'},source??sourceSpec);
  const evidence=capability.verification_evidence;
  if(!evidence?.run_ids?.length)throw new Error('Audited official captures required for method verification');
  const captures=await rows(db,'procurement_public_captures',q=>q.in('run_id',evidence.run_ids),'*',{order:'run_id'});
  if(captures.length!==evidence.run_ids.length || captures.some(c=>source&&c.source_id!==source.id))throw new Error('Matching saved discovery evidence required');
  const before={project_ref:project,procurement_sources:sources,procurement_search_requests:requests,
    procurement_geographies:await rows(db,'procurement_geographies'),procurement_source_capabilities:existingCaps,procurement_request_sources:associations,procurement_intake_items:[]};
  const spec={version:1,project_ref:project,authorization:`Official method review by ${actor}; request ${requestId}`,requests:[{...requests[0],key:'request'}],
    sources:[{...sourceSpec,existing_id:source?.id,request_keys:['request']}],capabilities:[{...capability,source_code:sourceSpec.code}]};
  const manifest=planRegistry(spec,before),sql=persistenceSql(manifest),schema=await transport.schema();
  const {PGlite}=await import('@electric-sql/pglite');
  const test=await testBatchSql(PGlite,before,schema,manifest,sql,{verify:verifyPersistence});
  const artifact=await artifacts.put({manifest,before,schema_hash:schemaHash(schema),sql_hash:hash(sql),test});
  if(schemaHash(await transport.schema())!==schemaHash(schema))throw new Error('Method schema changed before persistence');
  await transport.apply(sql);
  const after={...before,procurement_sources:await rows(db,'procurement_sources'),procurement_source_capabilities:await rows(db,'procurement_source_capabilities'),
    procurement_request_sources:await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId))};
  const receipt=verifyPersistence(before,after,manifest);
  if(!receipt.verified)throw new Error('Method persistence readback failed');
  if(handoff) {
    const saved=validateHandoff(handoff,after.procurement_sources,registrations,handoffs);
    const prior=handoffs.find(h=>h.source_id===saved.source_id&&h.channel===saved.channel&&h.tenant===saved.tenant);
    const {source_id,channel,tenant,checked_on,access_state,next_actor,next_action,registration_id,...details}=saved;
    const row={source_id,channel,tenant,checked_on,access_state,next_actor,next_action,registration_id,details};
    if(!prior)checked(await db.from('procurement_access_handoffs').insert(row));
    // Existing lifecycle cannot be reset by discovery; use the existing CAS access service to continue it.
  }
  return {artifact,receipt,next_action:'Replan and execute the saved method through the common capture/review/import workflow'};
}
