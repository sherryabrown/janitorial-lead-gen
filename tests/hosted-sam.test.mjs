import test from 'node:test';
import assert from 'node:assert/strict';
import {statewideSam} from '../scripts/lib/hosted-sam.mjs';
import {id} from './helpers/known-workflow.mjs';
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
