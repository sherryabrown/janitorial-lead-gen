import test from 'node:test';
import assert from 'node:assert/strict';
import { supportingCapture } from '../scripts/lib/supporting-capture.mjs';
import { sha } from '../scripts/lib/hosted-store.mjs';
import { makeInterpretationPacket,validateInterpretation } from '../scripts/lib/known-source-workflow.mjs';
import { verifyEvidenceSpans,cacheReviewedFacts,evaluateFacts,extractionKey } from '../scripts/lib/hosted-interpretation.mjs';
import { context,result } from './helpers/known-workflow.mjs';
import { intakeBefore } from './helpers/known-workflow.mjs';
import { planInterpretationIntake } from '../scripts/lib/interpretation-intake.mjs';
import { validateFindingBounds,hostedWorkflow } from '../scripts/lib/hosted-workflow.mjs';

function fixture(fetcher=async()=>new Response('{"award_date":"2026-10-03"}',{headers:{'Content-Type':'application/json'}})) {
  const ctx=context();
  Object.assign(ctx.capability,{availability:'active',method:'browser',verified_at:'2026-01-01',verified_until:'2099-01-01',verification_evidence:{official:true},
    method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://example.gov/bids'],allowed_hosts:['example.gov'],
      max_bytes:2000000,max_pages:1,terminal_instruction:'Single listing',check_instructions:'Read listing'}});
  const packet=makeInterpretationPacket(ctx),saved=new Map();
  const artifacts={async put(value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));const path=`artifacts/${sha(bytes)}`;saved.set(path,bytes);return path;},
    async get(path){if(!saved.has(path))throw new Error('Missing artifact');return saved.get(path);}};
  const service=supportingCapture({artifacts,serverKey:()=> 'private-test-key',fetcher});
  return {ctx,packet,saved,artifacts,service};
}
test('official supporting evidence binds date, bytes and exact request; it is not cached as reusable coverage',async()=>{
  const f=fixture(),capture=await f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  assert.equal(capture.lead_coverage,false);
  const evidence={...capture,locator:'saved document',excerpt:'"award_date":"2026-10-03"'};
  const review=result(f.packet);review.findings[0].payload.award_date='2026-10-03';delete review.findings[0].payload.deadline;
  delete review.findings[0].payload.work_performance_locations;
  review.findings[0].supporting_evidence=[evidence];
  assert.throws(()=>validateInterpretation(f.packet,review),/Supporting document/);
  validateInterpretation(f.packet,review,{verifiedSupporting:true});
  await verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)});
  const planned=planInterpretationIntake(f.packet,review,intakeBefore(),{}, {verifiedSupporting:true});
  assert.equal(planned.manifest.rows.length,1);
  const persisted=planned.manifest.rows[0].row.payload.manual_capture.evidence;
  assert.equal(persisted[1].content_sha256,evidence.content_sha256);
  assert.equal(persisted[1].url,'https://example.gov/detail');
  assert.equal(persisted[1].capture_receipt,undefined);
  review.findings[0].payload.award_date='2026-10-04';
  await assert.rejects(verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)}),/award_date lacks/);
  review.findings[0].payload.award_date='2026-10-03';
  assert.deepEqual(cacheReviewedFacts({facts:[]},f.packet,review).facts,[]);
  await assert.rejects(f.service.load(f.ctx,{...f.packet,task_id:'foreign'},evidence),/provenance/);
  await assert.rejects(f.service.load(f.ctx,f.packet,{...evidence,url:'https://example.gov/other'}),/provenance/);
  f.saved.set(evidence.local_path,Buffer.from('changed'));
  await assert.rejects(f.service.load(f.ctx,f.packet,evidence),/hash/);
});
test('verified supporting work-site evidence qualifies the requested city without trusting unchecked evidence',async()=>{
  const body='{"site":"Texarkana","deadline":"2026-10-30"}';
  const f=fixture(async()=>new Response(body,{headers:{'Content-Type':'application/json'}}));
  f.ctx.request.requested_search_areas=[{area_type:'city',city_name:'Texarkana',state_code:'AR'}];
  f.ctx.task.query_window={from:'2026-10-01',to:'2026-10-31',date_basis:'deadline'};
  f.packet=makeInterpretationPacket(f.ctx);
  const captured=await f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  const review=result(f.packet);
  review.findings[0].supporting_evidence=[{...captured,locator:'saved document',excerpt:body}];
  assert.throws(()=>validateFindingBounds(f.packet,review),/location/);
  await verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)});
  validateFindingBounds(f.packet,review,{verifiedSupporting:true});
  f.packet.request_scope.requested_search_areas=[{area_type:'city',city_name:'Little Rock',state_code:'AR'}];
  assert.throws(()=>validateFindingBounds(f.packet,review,{verifiedSupporting:true}),/location/);
  f.packet.request_scope.requested_search_areas=[{area_type:'city',city_name:'Texarkana',state_code:'AR'}];
  f.packet.query_window.to='2026-10-04';
  assert.throws(()=>validateFindingBounds(f.packet,review,{verifiedSupporting:true}),/qualifying date/);
});

test('forged private receipts, unreviewed URLs, expired methods and blocked redirects cannot become evidence',async()=>{
  const f=fixture();
  for(const url of ['https://evil.gov/detail','https://127.0.0.1/','https://example.gov/detail?token=secret'])
    await assert.rejects(f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url},'reviewer'),/verified method/);
  await assert.rejects(f.service.capture(f.ctx,f.packet,{packet_hash:'wrong',url:'https://example.gov/detail'},'reviewer'),/exact packet/);
  const path=await f.artifacts.put({kind:'supporting-capture-v1',state:'captured',signature:'0'.repeat(64)});
  await assert.rejects(f.service.load(f.ctx,f.packet,{capture_receipt:path}),/signature/);
  f.ctx.capability.verified_until='2020-01-01';
  await assert.rejects(f.service.capture(f.ctx,f.packet,{},'reviewer'),/expired/);
  const blocked=fixture(async()=>new Response(null,{status:302,headers:{location:'https://evil.gov/'}}));
  const receipt=await blocked.service.capture(blocked.ctx,blocked.packet,{packet_hash:blocked.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  assert.equal(receipt.state,'blocked');assert.equal(receipt.lead_coverage,false);
  await assert.rejects(blocked.service.load(blocked.ctx,blocked.packet,receipt),/provenance/);
});

test('signed supporting facts rebind across requests without fetching and recheck document, listing, method and bounds',async()=>{
  let fetches=0;
  const f=fixture(async()=>{fetches++;return new Response('{"city":"Texarkana","deadline":"2026-10-30"}',{headers:{'Content-Type':'application/json'}});});
  const capture=await f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  const evidence={...capture,locator:'saved document',excerpt:'{"city":"Texarkana","deadline":"2026-10-30"}'};
  const review=result(f.packet);review.findings[0].supporting_evidence=[evidence];
  await verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)});
  const portable=await f.service.portable(f.ctx,f.packet,evidence);
  const cached=cacheReviewedFacts({facts:[]},f.packet,review,{portableSupporting:new Map([['24-17',[portable]]])});
  const later={...f.packet,request_id:'later-request',task_id:'later-task',packet_hash:'b'.repeat(64),
    query_window:{from:'2026-10-01',to:'2026-11-01',date_basis:'deadline'},
    pages:f.packet.pages.map(page=>({...page,run_id:'later-run'}))};
  assert.equal(extractionKey(later,f.ctx.capability.method_spec),extractionKey(f.packet,f.ctx.capability.method_spec));
  const reused=evaluateFacts(later,cached),finding=reused.findings[0];
  finding.supporting_evidence=await Promise.all(finding.supporting_evidence.map(e=>f.service.rebind(f.ctx,later,e)));
  assert.equal(finding.evidence[0].run_id,'later-run');
  assert.equal(finding.supporting_evidence[0].retrieved_at,capture.retrieved_at);
  await verifyEvidenceSpans(later,reused,{loadSupporting:e=>f.service.load(f.ctx,later,e)});
  validateFindingBounds(later,reused,{verifiedSupporting:true});
  assert.equal(fetches,1);
  await assert.rejects(f.service.load(f.ctx,f.packet,finding.supporting_evidence[0]),/provenance/);
  later.query_window.from='2027-01-01';later.query_window.to='2027-12-31';
  assert.throws(()=>validateFindingBounds(later,reused,{verifiedSupporting:true}),/qualifying date/);
  later.request_scope={...later.request_scope,requested_search_areas:[{area_type:'city',city_name:'Little Rock',state_code:'AR'}]};
  later.query_window={from:'2026-10-01',to:'2026-11-01',date_basis:'deadline'};
  assert.throws(()=>validateFindingBounds(later,reused,{verifiedSupporting:true}),/location/);
  for(const changed of [{...later,source_id:'other-source'},{...later,method_version:'changed'},
    {...later,pages:later.pages.map(p=>({...p,content_sha256:'c'.repeat(64)}))}])
    await assert.rejects(f.service.rebind(f.ctx,changed,portable),/current listing and method/);
  const spec=f.ctx.capability.method_spec;
  f.ctx.capability.method_spec={...spec,check_instructions:'Changed method'};
  await assert.rejects(f.service.rebind(f.ctx,later,portable),/current listing and method/);
  f.ctx.capability.method_spec=spec;
  const forged=await f.artifacts.put({kind:'supporting-fact-v1',signature:'0'.repeat(64)});
  await assert.rejects(f.service.rebind(f.ctx,later,{...portable,reusable_receipt:forged}),/signature/);
  const unsigned=await f.artifacts.put({kind:'supporting-fact-v1'});
  await assert.rejects(f.service.rebind(f.ctx,later,{...portable,reusable_receipt:unsigned}),/signature/);
  f.saved.set(portable.local_path,Buffer.from('changed'));
  await assert.rejects(f.service.rebind(f.ctx,later,portable),/hash/);
  f.saved.delete(portable.local_path);
  await assert.rejects(f.service.rebind(f.ctx,later,portable),/Missing artifact/);
  f.ctx.capability.verified_until='2020-01-01';
  await assert.rejects(f.service.rebind(f.ctx,later,portable),/expired/);
});

test('an exactly reviewed structured row is replaced rather than left as an ambiguous duplicate',()=>{
  const f=fixture(),review=result(f.packet),record={Description:'Janitorial services',generated_internal_id:'24-17'};
  const excerpt=JSON.stringify(record);review.findings[0].evidence[0].excerpt=excerpt;
  const cached=cacheReviewedFacts({version:1,facts:[{page_index:0,record,title:'',excerpt,locator:'row 1'}]},f.packet,review);
  const reused=evaluateFacts(f.packet,cached);
  assert.equal(cached.facts.length,1);assert.equal(reused.findings.length,1);assert.equal(reused.unresolved.length,0);
  const other=cacheReviewedFacts({version:1,facts:[{page_index:0,record,title:'',excerpt:excerpt+' unrelated',locator:'row 1'}]},f.packet,review);
  assert.equal(evaluateFacts(f.packet,other).unresolved.length,1);
});

test('the worker reuses a signed cached positive without AI, stages once and preserves lease checkpoints',async()=>{
  let aiCalls=0;
  const f=fixture(async()=>new Response('{"site":"Texarkana","deadline":"2026-10-30"}',{headers:{'Content-Type':'application/json'}}));
  const capture=await f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  const review=result(f.packet);review.findings[0].supporting_evidence=[{...capture,locator:'saved document',excerpt:'{"site":"Texarkana","deadline":"2026-10-30"}'}];
  const portable=await f.service.portable(f.ctx,f.packet,review.findings[0].supporting_evidence[0]);
  f.ctx.request.search_windows.opportunity={from:'2026-10-01',to:'2026-11-01',date_basis:'deadline'};
  f.ctx.request.workflow_control={};f.ctx.request.initiated_by='reviewer';
  f.ctx.task.query_window=f.ctx.request.search_windows.opportunity;f.ctx.task.state='needs_interpretation';
  const later=makeInterpretationPacket(f.ctx),cached=cacheReviewedFacts({version:1,facts:[]},f.packet,review,{portableSupporting:new Map([['24-17',[portable]]])});
  const worker={id:'worker',search_request_id:f.ctx.request.id,state:'running',lease_token:'lease',checkpoint:{stage:'interpret'}};
  const tables={procurement_search_requests:[f.ctx.request],procurement_request_targets:[{id:f.ctx.task.target_id,search_request_id:f.ctx.request.id}],
    procurement_coverage_tasks:[f.ctx.task],procurement_jobs:[f.ctx.job,worker],procurement_sources:[f.ctx.source],
    procurement_source_capabilities:[f.ctx.capability],procurement_runs:f.ctx.runs,procurement_public_captures:f.ctx.captures,
    procurement_extraction_cache:[{cache_key:extractionKey(later,f.ctx.capability.method_spec),facts:cached}],
    procurement_interpretations:[],procurement_intake_items:[],procurement_request_sources:[],procurement_usage_ledger:[],procurement_intake_leads:[]};
  let claim=true,savedInterpretation;
  const db={from(table){
    const filters=[];let single=false,operation;
    const query={select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},in(k,v){filters.push(r=>v.includes(r[k]));return this;},
      order(){return this;},range(){return this;},maybeSingle(){single=true;return this;},
      upsert(value){operation=()=>{for(const row of [].concat(value))if(!tables[table].some(r=>r.id===row.id))tables[table].push(row);};return this;},
      then(resolve,reject){return Promise.resolve().then(()=>{operation?.();const data=(tables[table]??[]).filter(r=>filters.every(fn=>fn(r)));return {data:single?data[0]??null:data};}).then(resolve,reject);}};
    return query;
  },async rpc(name,args){
    if(name==='claim_procurement_workflow_job'){const data=claim?worker:null;claim=false;return {data};}
    if(name==='checkpoint_procurement_workflow'){assert.equal(args.p_lease,'lease');worker.checkpoint=args.p_checkpoint;worker.state=args.p_state;return {data:true};}
    if(name==='reserve_procurement_interpretation'){savedInterpretation={id:'interpretation',revision:1};return {data:savedInterpretation};}
    if(name==='finalize_procurement_interpretation'){savedInterpretation.staging_receipt=args.p_receipt;return {data:savedInterpretation};}
    if(name==='refine_procurement_extraction'){tables.procurement_extraction_cache[0].facts=args.p_facts;return {data:true};}
    throw Error('Unexpected fixture RPC');
  }};
  const workflow=hostedWorkflow({db,project:'zreplhkoxswtzxlchtjf',serverKey:()=> 'private-test-key',artifacts:f.artifacts,
    aiConfig:{enabled:true},ai:async()=>{aiCalls++;throw Error('Ambiguous row requires AI review');}});
  assert.equal(await workflow.step(),true);
  assert.equal(aiCalls,0);assert.equal(worker.state,'pending');assert.equal(worker.checkpoint.cache_hits,1);
  assert.deepEqual(worker.checkpoint.interpreted_task_ids,[f.ctx.task.id]);assert.equal(tables.procurement_intake_items.length,1);
  assert.equal(await workflow.step(),false);assert.equal(tables.procurement_intake_items.length,1);
  tables.procurement_extraction_cache[0].facts.facts.push({page_index:0,locator:'unstructured',unstructured:true,excerpt:'Unknown maintenance',title:''});
  claim=true;worker.checkpoint={stage:'interpret'};
  await workflow.step();assert.equal(aiCalls,1);assert.equal(worker.state,'blocked');
  assert.equal(worker.checkpoint.next_action,'Ambiguous row requires AI review');assert.equal(tables.procurement_intake_items.length,1);
});
