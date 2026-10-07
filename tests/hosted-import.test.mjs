import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareImport,applyImport } from '../scripts/lib/hosted-import.mjs';
import { importJobs } from '../scripts/lib/hosted-import-jobs.mjs';
import { makeInterpretationPacket } from '../scripts/lib/known-source-workflow.mjs';
import { planInterpretationIntake } from '../scripts/lib/interpretation-intake.mjs';
import { hash,planReviewedBatch,collectRuns } from '../scripts/lib/reviewed-batch.mjs';
import { samIntakeRows } from '../scripts/lib/sam-intake.mjs';
import {offlineNativeRehearsal} from './helpers/native-rehearsal.mjs';
import { context,result,id } from './helpers/known-workflow.mjs';
const baseline=JSON.parse(readFileSync('tests/fixtures/sam/intake-before.json','utf8'));
const schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json','utf8'));
function setup() {
  const source=baseline.procurement_sources.find(s=>s.code==='arbuy-janitorial');
  const request={...baseline.procurement_search_requests[0],id:id(1)};
  const before={project_ref:'zreplhkoxswtzxlchtjf',captured_at:'2026-10-01T00:00:00Z',
    ...Object.fromEntries([...new Set(schema.columns.map(c=>c.table))].map(t=>[t,[]])),
    procurement_sources:baseline.procurement_sources,procurement_search_requests:[request],
    procurement_request_sources:[],procurement_request_targets:[{id:id(9),search_request_id:request.id}],
    procurement_coverage_tasks:[{id:id(3),target_id:id(9),source_id:source.id,kind:'opportunity'}]};
  const ctx=context();ctx.source.id=source.id;ctx.task.source_id=source.id;ctx.capability.source_id=source.id;
  ctx.runs[0].source_id=source.id;ctx.captures[0].source_id=source.id;
  const packet=makeInterpretationPacket(ctx),r=result(packet);
  const item=planInterpretationIntake(packet,r,before,{[id(5)]:'private-evidence'}).manifest.rows[0].row;
  item.updated_at='2026-10-01T00:00:00Z';
  before.procurement_intake_items=[item];
  before.procurement_interpretations=[{request_id:request.id,is_current:true,staging_receipt:{intake_ids:[item.id]}}];
  const review={version:1,batch:'hosted-import-test',project_ref:before.project_ref,request_id:request.id,work_state:'AR',
    scope:'Arkansas janitorial fixture',limitations:'Offline fixture only',reviewed_by:'test',run_ids:[],allow_partial:false,
    decisions:[{intake_id:item.id,intake_hash:hash(item.payload),action:'process',approve_new:true,
      reason:'Reviewed fixture',request_match_reason:'Explicit Arkansas fixture work location'}]};
  const db={from(table){let predicates=[],offset=0,end=9999;const q={
    select(){return q;},eq(field,value){predicates.push(r=>r[field]===value);return q;},
    in(field,values){predicates.push(r=>values.includes(r[field]));return q;},order(){return q;},
    range(a,b){offset=a;end=b;return q;},then(resolve){resolve({data:(before[table]??[]).filter(r=>predicates.every(p=>p(r))).slice(offset,end+1)});}};return q;}};
  const files=new Map(),artifacts={async put(value){const data=Buffer.from(JSON.stringify(value)),path=`artifacts/${hash(data.toString())}`;files.set(path,data);return path;},async get(path){return files.get(path);}};
  return {db,project:before.project_ref,transport:{schema:async()=>schema,apply:async()=>{}},artifacts,review,actor:id(80),before,item,rehearse:offlineNativeRehearsal};
}

test('separate SAM import packages bind actual captured runs and pass the existing SQL safeguards',async()=>{
  const f=setup(),capture=JSON.parse(readFileSync('tests/fixtures/sam/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json','utf8'));
  const sources=f.before.procurement_sources;
  const candidate=samIntakeRows(collectRuns([capture],[capture.run_id]),code=>sources.find(s=>s.code===code).id)[0];
  f.before.procurement_intake_items=[{...f.item,...candidate}];
  f.before.procurement_jobs=[{search_request_id:f.review.request_id,dedupe_key:'api-sam:test',checkpoint:{stage:'sam_review',run_ids:[capture.run_id],intake_ids:[candidate.id]}}];
  f.review={...f.review,run_ids:[capture.run_id],decisions:[{...f.review.decisions[0],new_bid_type:'historical_opportunity',intake_hash:hash(candidate.payload)}]};
  await assert.rejects(prepareImport(f),/separate statewide SAM/);
  const prepared=await prepareImport({...f,runs:[capture]});
  assert.equal(prepared.test.rollback,true);assert.equal(prepared.test.replay,true);
  assert.equal(prepared.summary.new_leads,1);
  const p=JSON.parse((await f.artifacts.get(prepared.artifact)).toString());
  p.runs[0].response.opportunitiesData[0].title='Tampered capture';
  await assert.rejects(applyImport({...f,packageData:p,approval:prepared.approval_sha256}));
});
test('hosted preparation shares real SQL rollback/readback/replay checks and rejects changed approval/schema before sending an import',async()=>{
  const f=setup(),prepared=await prepareImport(f),p=JSON.parse((await f.artifacts.get(prepared.artifact)).toString());
  assert.equal(prepared.test.rollback,true);assert.equal(prepared.test.replay,true);assert.equal(prepared.summary.new_leads,1);
  let sent=0;f.transport.apply=async()=>{sent++;};
  await assert.rejects(applyImport({...f,packageData:p,approval:'0'.repeat(64)}),/approval/);
  f.transport.schema=async()=>({...schema,columns:[...schema.columns,{table:'procurement_leads',name:'drift',type:'text'}]});
  await assert.rejects(applyImport({...f,packageData:p,approval:prepared.approval_sha256}),/drift/);assert.equal(sent,0);
});

test('real FK validation retains earlier requests referenced by existing relevant leads',async()=>{
  const f=setup(),otherRequest={...f.before.procurement_search_requests[0],id:id(91)};
  const oldLead={...baseline.procurement_leads[0],id:id(92),source_id:f.item.source_id,external_id:'previous-linked-lead'};
  f.before.procurement_search_requests.push(otherRequest);f.before.procurement_leads=[oldLead];
  f.before.procurement_request_leads=[{...baseline.procurement_request_leads[0],search_request_id:otherRequest.id,lead_id:oldLead.id}];
  const prepared=await prepareImport(f),p=JSON.parse((await f.artifacts.get(prepared.artifact)).toString());
  assert.ok(p.before.procurement_search_requests.some(r=>r.id===otherRequest.id));
  assert.equal(prepared.test.rollback,true);assert.equal(prepared.test.replay,true);
});

test('native rehearsal is mandatory and failed/interrupted validation cannot produce an approval',async()=>{
  const f=setup();
  await assert.rejects(prepareImport({...f,rehearse:null}),/native SQL rehearsal transport/);
  await assert.rejects(prepareImport({...f,rehearse:async()=>{throw new Error('interrupted');}}),/interrupted/);
  await assert.rejects(prepareImport({...f,rehearse:async()=>({status:'native_tests_passed'})}),/receipt/);
});

test('native snapshot retains cross-source lead parents of older processed intake links',async()=>{
  const f=setup(),otherRequest={...f.before.procurement_search_requests[0],id:id(91)};
  const oldLead={...baseline.procurement_leads[0],id:id(92)};
  assert.notEqual(oldLead.source_id,f.item.source_id);
  const oldIntake={...f.item,id:id(93),external_id:'older-processed-observation',status:'processed'};
  f.before.procurement_search_requests.push(otherRequest);
  f.before.procurement_leads=[oldLead];
  f.before.procurement_intake_items.push(oldIntake);
  f.before.procurement_intake_leads=[{id:id(94),intake_id:oldIntake.id,lead_id:oldLead.id}];
  f.before.procurement_request_leads=[{...baseline.procurement_request_leads[0],search_request_id:otherRequest.id,lead_id:oldLead.id}];
  const prepared=await prepareImport(f),p=JSON.parse((await f.artifacts.get(prepared.artifact)).toString());
  assert.ok(p.before.procurement_leads.some(l=>l.id===oldLead.id));
  assert.ok(p.before.procurement_search_requests.some(r=>r.id===otherRequest.id));
  assert.equal(prepared.test.readback,true);assert.equal(prepared.test.replay,true);
});
test('an interrupted hosted import checkpoints reconciliation before SQL and never blindly resends',async()=>{
  const f=setup(),prepared=await prepareImport(f),jobs=importJobs(f);
  const checkpoint={stage:'import_apply',package_artifact:prepared.artifact,approval_sha256:prepared.approval_sha256};
  let sent=0;f.transport.apply=async()=>{sent++;throw new Error('simulated uncertain commit');};
  const stages=[];
  await assert.rejects(jobs.step({id:id(40)},checkpoint,async state=>stages.push({state,stage:checkpoint.stage})),/uncertain/);
  assert.deepEqual(stages,[{state:'running',stage:'import_reconcile'}]);assert.equal(sent,1);
  await jobs.step({id:id(40)},checkpoint,async state=>stages.push({state,stage:checkpoint.stage}));
  assert.equal(sent,1);assert.equal(stages.at(-1).state,'outcome_unknown');
});
test('unchanged source facts in a new request create provenance links without a lead payload/history change',()=>{
  const f=setup(),parent=f.item;parent.status='processed';
  const lead={id:id(90),source_id:parent.source_id,external_id:parent.external_id,payload:parent.payload,bid_type:'opportunity',search_term_used:'janitorial'};
  const child={...parent,id:id(91),external_id:`${parent.external_id}::observation:new-request`,status:'pending',
    payload:{...parent.payload,known_source_interpretation:{request_id:id(92),packet_hash:'b'.repeat(64)},
      manual_capture:{...parent.payload.manual_capture,record_external_id:parent.external_id,amends_intake_id:parent.id}}};
  f.before.procurement_intake_items.push(child);f.before.procurement_leads=[lead];
  f.before.procurement_intake_leads=[{id:id(93),intake_id:parent.id,lead_id:lead.id}];
  const review={...f.review,decisions:[{...f.review.decisions[0],intake_id:child.id,intake_hash:hash(child.payload)}]};
  const manifest=planReviewedBatch(f.before,review,[]);
  assert.equal(manifest.summary.new_leads,0);assert.equal(manifest.summary.evidence_updates,0);
  assert.deepEqual(manifest.records[0].payload,lead.payload);assert.equal(manifest.summary.links_to_create,1);
});

test('approval binds all package inputs and native receipt; outdated or no longer current candidates cannot write',async()=>{
  const f=setup(),prepared=await prepareImport(f),p=JSON.parse((await f.artifacts.get(prepared.artifact)).toString());
  let writes=0;f.transport.apply=async()=>{writes++;};
  for(const mutate of [
    q=>{q.version=1;},q=>{q.policy='unknown';},q=>{q.test.cleanup=false;},q=>{q.test.resources.copied_rows++;},
    q=>{q.before.captured_at='changed';},q=>{q.review.reviewed_by=id(81);},q=>{q.sql+='select 1;';},
  ]){
    const altered=structuredClone(p);mutate(altered);
    await assert.rejects(applyImport({...f,packageData:altered,approval:prepared.approval_sha256}));
  }
  f.before.procurement_interpretations[0].is_current=false;
  await assert.rejects(applyImport({...f,packageData:p,approval:prepared.approval_sha256}),/Current request candidate/);
  assert.equal(writes,0);
});
