import test from 'node:test';
import assert from 'node:assert/strict';
import {countyTriggers} from '../scripts/lib/county-triggers.mjs';
import {procurementSchedules} from '../scripts/lib/procurement-schedules.mjs';
import {adminRunHistory} from '../scripts/lib/admin-run-history.mjs';

function recordingDb(children=1){
 const calls=[];
 const trigger={id:'10000000-0000-4000-8000-000000000001',target_kind:'county_scope',state:'completed',config:{county_ids:['05125'],check_updates:true},created_at:'2026-10-20T00:00:00Z'};
 const data={procurement_triggers:[trigger],procurement_trigger_requests:Array.from({length:children},(_,n)=>({trigger_id:trigger.id,request_id:`request-${n}`,county_id:'05125',role:'county',scope:{}})),procurement_search_requests:Array.from({length:children},(_,n)=>({id:`request-${n}`,workflow_control:{}}))};
 const db={from(table){let single=false;const query=new Proxy({}, {get(_,name){if(name==='then')return resolve=>{calls.push(table);resolve({data:single?(data[table]?.[0]??null):(data[table]??[]),count:data[table]?.length??0,error:null});};return ()=>{if(name==='maybeSingle'||name==='single')single=true;return query;};}});return query;},async rpc(name){calls.push('rpc:'+name);return {data:[],error:null};}};
 return {db,calls,trigger,data};
}
test('status shares each relationship once for one and seventy-five county children',async()=>{
 for(const size of [1,75]){
  const {db,calls,trigger}=recordingDb(size),value=await countyTriggers({db}).status(trigger.id);
  assert.equal(value.id,trigger.id);assert.equal(value.children.length,size);
  assert.equal(value.reporting.leads.completeness,'unknown');
  for(const relation of ['procurement_trigger_requests','procurement_usage_ledger','procurement_jobs','procurement_request_targets','procurement_search_requests','procurement_interpretations'])assert.equal(calls.filter(c=>c===relation).length,1,relation);
  assert.equal(calls.length,9,'Previously 17 calls for the same fixture; no per-child query growth');
  assert.equal('checkpoint' in value.reporting,false);
 }
});
test('shared status usage retains trigger attribution, and active progress avoids report relations',async()=>{
 const {db,calls,trigger,data}=recordingDb();
 data.procurement_usage_ledger=[{id:'usage',trigger_id:trigger.id,state:'completed',actual_usd:0.25,reserved_usd:0,usage:{input_tokens:100,output_tokens:20}}];
 const service=countyTriggers({db}),full=await service.status(trigger.id);
 assert.equal(full.reporting.usage.actual_usd,0.25);assert.deepEqual(full.reporting.usage,full.usage);
 calls.length=0;trigger.state='running';const progress=await service.status(trigger.id,{projection:'progress'});
 assert.equal(progress.state,'running');assert.equal(progress.usage.actual_usd,0.25);assert.equal('reporting' in progress,false);
 assert.deepEqual(calls,['procurement_triggers','procurement_trigger_requests','procurement_usage_ledger']);
 trigger.state='completed';calls.length=0;assert.ok((await service.status(trigger.id,{projection:'progress'})).reporting,'Settling returns the full verified report');
 assert.equal(calls.length,9);
});
test('choice projections skip lead metrics and timing; schedule names need only one query',async()=>{
 const {db,calls}=recordingDb();
 await procurementSchedules({db}).list({projection:'choices'});
 assert.deepEqual(calls,['procurement_schedule_overview']);calls.length=0;
 const page=await adminRunHistory(db)({projection:'choices'});
 assert.equal(page.items.length,1);assert.equal('leads' in page.items[0],false);assert.equal('config' in page.items[0],false);
 assert.equal(calls.includes('procurement_workflow_steps'),false);assert.equal(calls.includes('procurement_leads'),false);
 await assert.rejects(()=>adminRunHistory(db)({projection:'private'}),/Invalid/);
});
