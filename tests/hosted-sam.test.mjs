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
