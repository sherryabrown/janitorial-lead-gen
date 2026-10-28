import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {guidedSourceResolution} from '../../scripts/lib/guided-source-resolution.mjs';
import {hostedWorkflow} from '../../scripts/lib/hosted-workflow.mjs';
import {discoveryService} from '../../scripts/lib/hosted-discovery.mjs';
import {postgresTransport} from '../../scripts/lib/hosted-import.mjs';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';
import {sha} from '../../scripts/lib/hosted-store.mjs';
import {proposeAutomaticListing} from '../../scripts/lib/automatic-public-method.mjs';

export async function verifyGuidedRepair({pool,rehearsalPool,db,actor,noMethod=false}){
 const suffix=noMethod?'missing':'existing',host=noMethod?'repair-missing.example':'repair.example';
 if(!noMethod)await pool.query(readFileSync('supabase/migrations/20261027000100_procurement_guided_source_repairs.sql','utf8'));
 await pool.query("notify pgrst, 'reload schema'");
 let schemaReady=false;
 for(let n=0;n<40;n++){
  const probe=await db.rpc('queue_procurement_source_repair',{p_actor:'00000000-0000-4000-8000-000000000000',p_task:null,p_version:0,p_revision:'probe',p_key:'schema-probe-key',p_url:'https://example.gov/'});
  if(probe.error?.code==='42501'){schemaReady=true;break;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(schemaReady,'Guided queue RPC is present in the native gateway schema cache');
 const sourceId=randomUUID(),taskId=randomUUID(),priorMethodId=randomUUID();
 const listing=readFileSync('tests/fixtures/county/guided-repair-listing.html','utf8');
 await pool.query(`insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level,source_coverage_areas)
  values($1,'guided-repair-native-${suffix}','County repair website','https://${host}/old','other_public','county','[{"area_type":"county","state_code":"AR","county_name":"Arkansas County"}]');`,[sourceId]);
 if(!noMethod)await pool.query(`insert into procurement_source_capabilities(id,source_id,kind,method,endpoint_url,official_entry_url,route_geography_id,availability,
   verified_at,verified_until,verification_evidence,parser_version,method_spec) values($1,$2,'opportunity','browser','https://${host}/old','https://${host}/old','05001','active',
   now()-interval '1 day',now()+interval '30 days','{"automation_policy":"county-public-v1","route_geography_ids":["05001","05003"]}','county-public-v1',$3)`,
   [priorMethodId,sourceId,proposeAutomaticListing(Buffer.from(listing),`https://${host}/old`).spec]);
 await pool.query(`insert into procurement_coverage_tasks(id,target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,state,evidence,query_window,source_id,capability_id)
  select $1,t.target_id,'native-guided-repair-${suffix}',t.agency_scope,t.route_geography_id,'opportunity',t.priority,'Listing method needs review','method_missing','{}',t.query_window,$2,$3
  from procurement_coverage_tasks t where t.kind='opportunity' and t.route_geography_id='05001' limit 1`,[taskId,sourceId,noMethod?null:priorMethodId]);
 const original=(await pool.query('select t.*,r.search_request_id from procurement_coverage_tasks t join procurement_request_targets r on r.id=t.target_id where t.id=$1',[taskId])).rows[0];
 assert.ok(original);
 const oldJobs=(await pool.query('select id from procurement_jobs where search_request_id=$1 order by id',[original.search_request_id])).rows;
 const leadsBefore=(await pool.query('select id,stage from procurement_leads order by id')).rows;
 const objects=new Map(),artifacts={async put(value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));const key=sha(bytes);objects.set(key,bytes);return key;},async get(key){assert.ok(objects.has(key),'Saved private evidence exists');return objects.get(key);}};
 const calls=[],errors=[],project='zreplhkoxswtzxlchtjf';
 const fetcher=async url=>{calls.push(String(url));if(![`https://${host}/bids`,`https://${host}/bid/26-1`,`https://${host}/bid/26-2`].includes(String(url)))throw Error('Unexpected guided repair destination');return new Response(String(url).endsWith('/bids')?listing:'<main><h1>Janitorial services</h1><p>Arkansas County, AR · 26-1</p></main>',{headers:{'content-type':'text/html'}});};
 const options={db,project,artifacts,fetcher,resolveHost:async()=>[{address:'8.8.8.8',family:4}],transport:postgresTransport(pool,project),rehearse:nativeRehearsal(rehearsalPool)};
 const resolution=guidedSourceResolution(options);
 const discovery=discoveryService({...options,guardGuidedRepair:resolution.guardMethod,prepareGuidedCapture:resolution.prepareMethodCapture,finalizeGuidedRepair:resolution.finalizeMethod,
  collect:async()=>{throw Error('A repair must never collect/import an old run');}});
 const worker=hostedWorkflow({db,project,artifacts,processJob:(job,c,save)=>c.guided_entry?resolution.step(job,c,save):discovery.step(job,c,save),reportError:(_id,error)=>errors.push(error)});
 let view;
 for(let n=0;n<20;n++){try{view=await resolution.detail(original.search_request_id,taskId);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(view,'Native guided detail available after schema reload');
 await resolution.decide(original.search_request_id,taskId,{version:view.item.version,revision:view.item.revision,decision:'wont_address',
   reason:'Hold this affected check until verified and explicitly re-enabled',confirmed_scope:true,preview_token:view.preview_token},actor,`native-prerepair-hold-${suffix}`);
 view=await resolution.detail(original.search_request_id,taskId);assert.equal(view.item.checks_excluded,true);
 const queued=await resolution.verify(original.search_request_id,taskId,{url:`https://${host}/bids`,version:view.item.version,revision:view.item.revision},actor,`native-guided-entry-${suffix}`);
 assert.ok(queued.job_id);assert.equal((await worker.step()),true);if(errors.length)throw errors[0];
 view=await resolution.detail(original.search_request_id,taskId);
 assert.equal(view.verification.can_apply_website,true);
 assert.equal((await pool.query('select url from procurement_sources where id=$1',[sourceId])).rows[0].url,`https://${host}/old`,'Verification alone cannot mutate registry');
 await assert.rejects(resolution.apply(original.search_request_id,taskId,{job_id:queued.job_id,preview_token:view.preview_token,confirmed_scope:false},actor,'unconfirmed-apply'),e=>e.status===409);
 const entryApply={job_id:queued.job_id,preview_token:view.preview_token,confirmed_scope:true};
 await resolution.apply(original.search_request_id,taskId,entryApply,actor,`native-entry-apply-${suffix}`);
 assert.equal((await resolution.apply(original.search_request_id,taskId,entryApply,actor,`native-entry-apply-${suffix}`)).job_id,queued.job_id,'Lost entry apply acknowledgement replays safely');
 for(let n=0;n<20;n++){if(!await worker.step())break;if(errors.length)throw errors[0];}
 view=await resolution.detail(original.search_request_id,taskId);
 assert.equal(view.verification.can_apply_method,true,JSON.stringify(view.verification));
 assert.equal(view.item.decision,'repair_in_progress','A changed source revision is not prematurely called a verified fix');
 assert.equal((await pool.query('select id,url from procurement_sources where id=$1',[sourceId])).rows[0].url,`https://${host}/bids`);
 const methodApply={job_id:view.verification.job_id,preview_token:view.preview_token,confirmed_scope:true};
 await resolution.apply(original.search_request_id,taskId,methodApply,actor,`native-method-apply-${suffix}`);
 for(let n=0;n<8;n++){if(!await worker.step())break;if(errors.length)throw errors[0];}
 view=await resolution.detail(original.search_request_id,taskId);
 assert.equal(view.item.decision,'fixed_verified');assert.equal(view.verification.fixed,true);
 assert.equal(view.item.checks_excluded,true,'A successful repair never silently re-enables checks');
 const methods=(await pool.query('select * from procurement_source_capabilities where source_id=$1',[sourceId])).rows;
 const replacement=methods.find(m=>m.id!==priorMethodId);assert.ok(replacement);
 const retained=methods.find(m=>m.id===priorMethodId);
 if(!noMethod){assert.equal(retained.route_geography_id,'05003');assert.equal(retained.availability,'active','Other route keeps its original method');
 assert.equal(replacement.verification_evidence.source_review_roots['05001'],priorMethodId);}
 else assert.ok(replacement.verification_evidence.source_review_source_routes.includes('05001'),'First method retains the source-level review scope');
 const {rows:[future]}=await pool.query(`insert into procurement_coverage_tasks(target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,state,evidence,query_window,source_id,capability_id)
   select target_id,'native-repaired-next-check-${suffix}',agency_scope,route_geography_id,kind,priority,reason,'unchecked',evidence,query_window,source_id,$2
   from procurement_coverage_tasks where id=(select (checkpoint->>'task_id')::uuid from procurement_jobs where id=$1) returning id`,[view.verification.job_id,replacement.id]);
 assert.equal((await db.rpc('procurement_source_check_excluded',{p_task:future.id})).data,true,'Replacement inherits the scoped exclusion');
 const {rows:[futureJob]}=await pool.query(`insert into procurement_jobs(search_request_id,task_id,dedupe_key,kind,state)
   select target.search_request_id,$1,'native-repaired-skip-${suffix}','collect','pending' from procurement_coverage_tasks task
   join procurement_request_targets target on target.id=task.target_id where task.id=$1 returning id`,[future.id]);
 assert.equal((await db.rpc('claim_procurement_known_job',{p_job_id:futureJob.id})).data,null);
 const skipped=await db.rpc('procurement_source_review_context',{p_tasks:[future.id],p_private:false});assert.equal(skipped.error,null);
 assert.equal(skipped.data.skipped[future.id],true,'A future check is explicitly recorded as skipped by Admin');
 await resolution.decide(original.search_request_id,taskId,{version:view.item.version,revision:view.item.revision,decision:'unreviewed',reenable:true,
  reason:'Resume the verified source check',confirmed_scope:true,preview_token:view.preview_token},actor,`native-explicit-reenable-${suffix}`);
 assert.equal((await db.rpc('procurement_source_check_excluded',{p_task:future.id})).data,false);
 assert.equal((await db.rpc('procurement_source_review_context',{p_tasks:[future.id],p_private:false})).data.skipped[future.id],true,'Re-enable never rewrites a skipped check as performed');
 assert.equal((await resolution.detail(original.search_request_id,taskId)).item.decision,'fixed_verified','Re-enable preserves verified repair truth');
 assert.deepEqual((await pool.query('select id from procurement_jobs where search_request_id=$1 order by id',[original.search_request_id])).rows,oldJobs);
 const after=(await pool.query('select t.*,r.search_request_id from procurement_coverage_tasks t join procurement_request_targets r on r.id=t.target_id where t.id=$1',[taskId])).rows[0];
 assert.deepEqual(after,original,'Historical source attempt is immutable');
 assert.deepEqual((await pool.query('select id,stage from procurement_leads order by id')).rows,leadsBefore,'Repair does not import or change lead stages');
 assert.ok(calls.length<=4,'One entry verification and one bounded category verification only');
 assert.equal(calls.filter(url=>url===`https://${host}/bids`).length,1,'The category check reuses fresh entry bytes within the same repair request');
 return {passed:true,official_entry_then_category:true,native_rehearsal_and_readback:true,same_source_identity:true,no_old_run_collection:true,old_attempt_unchanged:true,apply_replay:true};
}
