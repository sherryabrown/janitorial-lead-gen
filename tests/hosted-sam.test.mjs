import test from 'node:test';
import assert from 'node:assert/strict';
import {statewideSam} from '../scripts/lib/hosted-sam.mjs';
import {id} from './helpers/known-workflow.mjs';
import {readFileSync} from 'node:fs';
test('separate SAM validates bounds and preserves unknown/review checkpoints without a repeat fetch',async()=>{
  let calls=0,args;
  const sam=statewideSam({project:'zreplhkoxswtzxlchtjf',serverKey:()=> 'offline-key',artifacts:{},
    db:{rpc:async(name,input)=>{args={name,input};return {data:id(1)};}},fetcher:async()=>{calls++;throw new Error('unknown');}});
  await assert.rejects(sam.submit({category:'forecast',publication_window:{from:'2026-10-06',to:'2026-11-06'}},id(2),'sam-key-001'),/forecasts/);
  await assert.rejects(sam.submit({category:'opportunity',publication_window:{from:'2026-02-30',to:'2026-11-06'}},id(2),'sam-key-001'),/window/);
  await sam.submit({category:'opportunity',publication_window:{from:'2026-10-06',to:'2026-11-06'}},id(2),'sam-key-001');
  assert.equal(args.name,'submit_procurement_sam_request');assert.equal(args.input.p_filters.state,'AR');
  const c={stage:'sam_collect',kind:'opportunity',filters:args.input.p_filters},states=[];
  await sam.step({id:id(3)},c,async state=>states.push(state));
  assert.equal(c.stage,'sam_reconcile');assert.deepEqual(states,['running','outcome_unknown']);
  await sam.step({id:id(3)},c,async()=>{});assert.equal(calls,1);
  c.stage='sam_review';await sam.step({id:id(3)},c,async()=>{});assert.equal(calls,1);
});

test('saved statewide SAM pages stage immutable candidates and reject audit drift without fetching again',async()=>{
  const capture=JSON.parse(readFileSync('tests/fixtures/sam/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json','utf8'));
  const tables={procurement_runs:[{id:capture.run_id,detail:capture}],
    procurement_sources:[{id:id(4),code:'sam'},{id:id(5),code:'sam-awards'}],procurement_intake_items:[]};
  const db={from(table){const predicates=[];let insert;
    const q={select(){return q;},order(){return q;},range(){return q;},
      eq(k,v){predicates.push(r=>r[k]===v);return q;},in(k,v){predicates.push(r=>v.includes(r[k]));return q;},
      upsert(item){insert=item;return q;},
      maybeSingle(){return Promise.resolve({data:tables[table].find(r=>predicates.every(p=>p(r)))??null});},
      then(resolve){if(insert&&!tables[table].some(r=>r.source_id===insert.source_id&&r.external_id===insert.external_id))
        tables[table].push({...insert,id:id(6)});
        resolve({data:tables[table].filter(r=>predicates.every(p=>p(r)))});}};return q;}};
  let fetches=0;
  const sam=statewideSam({db,project:'zreplhkoxswtzxlchtjf',artifacts:{get:async()=>Buffer.from(JSON.stringify(capture))},
    fetcher:async()=>{fetches++;throw new Error('unexpected fetch');}});
  const c={stage:'sam_stage',capture_artifacts:['saved-page'],run_ids:[capture.run_id],terminal_confirmed:true};
  const states=[];await sam.step({},c,async state=>states.push(state));
  assert.equal(c.stage,'sam_review');assert.deepEqual(c.intake_ids,[id(6)]);assert.deepEqual(states,['blocked']);
  c.stage='sam_stage';await sam.step({},c,async()=>{});
  assert.equal(tables.procurement_intake_items.length,1);assert.equal(fetches,0);
  tables.procurement_runs[0].detail={...capture,upstream_status:403};
  await assert.rejects(sam.savedRuns(c),/saved audit/);
});


test('a definite later-page failure preserves the successful prefix for partial automatic saving',async()=>{
  const filters={state:'AR',ncode:'561720',limit:100,offset:1};let run;
  const db={from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:run})};return q;}};
  const sam=statewideSam({db,project:'isolated',serverKey:()=> 'private-test',artifacts:{},fetcher:async(_url,options)=>{
    const body=JSON.parse(options.body);run={id:id(60),job_id:id(61),detail:{collector:'sam-search',filters,workflow_attempt_id:body.workflow_execution.attempt_id,upstream_status:429}};
    return new Response(JSON.stringify({run_id:run.id,upstream_status:429}),{status:429});
  }});
  const c={stage:'sam_collect',kind:'opportunity',filters,capture_artifacts:['good-prefix'],run_ids:[id(62)],pages:1};
  const states=[];await sam.step({id:id(61),lease_token:id(63)},c,async state=>states.push(state));
  assert.equal(c.stage,'sam_stage');assert.equal(c.terminal_confirmed,false);assert.equal(c.failed_capture_run_id,id(60));
  assert.deepEqual(c.run_ids,[id(62)]);assert.deepEqual(c.capture_artifacts,['good-prefix']);assert.deepEqual(states,['running','pending']);
});


test('SAM packet counts provenance-only canonical matches as unchanged, not as missing results',async()=>{
  const capture=JSON.parse(readFileSync('tests/fixtures/sam/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json','utf8'));
  const requestId=id(72),autoId=id(73),tables={procurement_jobs:[{id:id(74),search_request_id:requestId,dedupe_key:`api-sam:${requestId}`,state:'succeeded',checkpoint:{stage:'sam_review',run_ids:[capture.run_id],capture_artifacts:['page'],terminal_confirmed:true,intake_ids:[],automatic_import_job_id:autoId}},
    {id:autoId,state:'succeeded',checkpoint:{stage:'import_verified',receipt:{verified:true,counts:{actual_new_leads:0,evidence_updates:0,unchanged_leads:0,actual_processed:1}}}}],
    procurement_runs:[{id:capture.run_id,detail:capture}],procurement_search_requests:[{id:requestId,search_windows:{opportunity:{}}}]};
  const db={from(table){const predicates=[];let single=false;const q={select(){return q;},eq(k,v){predicates.push(r=>r[k]===v);return q;},order(){return q;},range(){return q;},maybeSingle(){single=true;return q;},then(resolve){const found=(tables[table]??[]).filter(r=>predicates.every(p=>p(r)));resolve({data:single?found[0]:found});}};return q;}};
  const sam=statewideSam({db,artifacts:{get:async()=>Buffer.from(JSON.stringify(capture))}});
  const packet=await sam.packet(requestId);assert.equal(packet.automatic.unchanged,1);assert.equal(packet.canonical_writes,0);assert.equal(packet.automatic.verified,true);
});


test('uncertain import guard prevents another provider send and preserves the unsent collection checkpoint',async()=>{
  let sends=0;const sam=statewideSam({validateCollection:async()=>{throw Error('Reconcile prior import');},fetcher:async()=>{sends++;}});
  const c={stage:'sam_collect'};await assert.rejects(sam.step({},c,async()=>{}),/Reconcile prior import/);
  assert.equal(sends,0);assert.equal(c.stage,'sam_collect');assert.equal(c.request_attempt_id,undefined);
});


test('automatic status reads no capture artifacts or intake bodies at small and large evidence sizes',async()=>{
  for(const size of [1,1000]) {
    const requestId=id(80),autoId=id(81),capture=JSON.parse(readFileSync('tests/fixtures/sam/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json','utf8'));
    const entries=Array.from({length:size},(_,i)=>({id:id(100+i),payload:{title:'Cleaning',sam_notice_evidence:{record:{description:'x'.repeat(1000)}}}}));
    const tables={procurement_jobs:[{id:id(82),search_request_id:requestId,dedupe_key:`api-sam:${requestId}`,state:'blocked',checkpoint:{stage:'sam_review',kind:'opportunity',run_ids:[capture.run_id],capture_artifacts:['page'],intake_ids:entries.map(i=>i.id),automatic_import_job_id:autoId}},
      {id:autoId,state:'running',checkpoint:{stage:'import_prepare'}}],procurement_intake_items:entries,procurement_runs:[{id:capture.run_id,detail:capture}],procurement_search_requests:[{id:requestId,search_windows:{opportunity:{}}}]};
    let reads=0,artifacts=0;const touched=[];
    const db={from(table){reads++;touched.push(table);const predicates=[];let single=false,from=0,to=Infinity;const q={select(){return q;},eq(k,v){predicates.push(r=>r[k]===v);return q;},in(k,v){predicates.push(r=>v.includes(r[k]));return q;},order(){return q;},range(a,b){from=a;to=b;return q;},maybeSingle(){single=true;return q;},then(resolve){const found=(tables[table]??[]).filter(r=>predicates.every(p=>p(r))).slice(from,to+1);resolve({data:single?found[0]:found});}};return q;}};
    const sam=statewideSam({db,artifacts:{get:async()=>{artifacts++;return Buffer.from(JSON.stringify(capture));}}});
    const full=await sam.packet(requestId),fullBytes=Buffer.byteLength(JSON.stringify(full));
    const fullReads=reads;reads=0;artifacts=0;touched.length=0;
    let light;
    for(let i=0;i<3;i++)light=await sam.status(requestId);
    assert.equal(reads,6);assert.equal(artifacts,0);assert.ok(touched.every(t=>t==='procurement_jobs'));
    assert.equal(light.evidence_key,full.evidence_key);assert.equal(light.automatic.state,'running');
    assert.ok(!('candidates' in light));assert.ok(Buffer.byteLength(JSON.stringify(light))<fullBytes);
    console.log(JSON.stringify({sam_status_measurement:{candidates:size,full_reads:fullReads,status_reads_per_poll:2,full_bytes:fullBytes,status_bytes:Buffer.byteLength(JSON.stringify(light)),status_artifact_reads:0}}));
    tables.procurement_jobs[0].checkpoint.stage='sam_collect';tables.procurement_jobs[0].state='running';
    const pending=await sam.packet(requestId);assert.equal(pending.collection_pending,true);assert.equal(pending.automatic.state,'running');assert.equal(pending.terminal_confirmed,false);
  }
});
