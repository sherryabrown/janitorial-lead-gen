import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedWorkflow } from '../scripts/lib/hosted-workflow.mjs';
import { importJobs } from '../scripts/lib/hosted-import-jobs.mjs';
import { attentionItems } from '../scripts/lib/hosted-attention.mjs';
import { checked, rows } from '../scripts/lib/hosted-store.mjs';
import { savedContentChange } from '../scripts/lib/source-change.mjs';

const marker='PRIVATE-DATABASE-DIAGNOSTIC';
function database(job) {
  return {
    async rpc(name,args) {
      if(name==='claim_procurement_workflow_job')return {data:job};
      if(name==='checkpoint_procurement_workflow') {
        job.state=args.p_state;job.checkpoint=structuredClone(args.p_checkpoint);return {data:true};
      }
      throw Error('Unexpected RPC');
    },
    from(table) {
      const data=table==='procurement_search_requests'?[{id:job.search_request_id,workflow_control:{cancelled:false}}]:table==='procurement_jobs'?[job]:[];
      const q={select(){return q;},eq(){return q;},order(){return q;},range(){return Promise.resolve({data});},
        maybeSingle:async()=>({data:data[0]??null})};return q;
    },
  };
}

test('worker failures keep diagnostics private across persisted request/import/attention status',async()=>{
  const job={id:'job',search_request_id:'request',dedupe_key:'api-import:request:hash',state:'running',lease_token:'lease',checkpoint:{stage:'import_prepare'}};
  const db=database(job),diagnostics=[];
  const workflow=hostedWorkflow({db,project:'fixture',artifacts:{},processJob:async()=>{throw Error(marker);},
    reportError:(id,error)=>diagnostics.push({id,message:error.message})});
  assert.equal(await workflow.step(),true);
  assert.equal(job.state,'blocked');
  assert.equal(job.checkpoint.error_code,'workflow_stage_failed');
  assert.equal(JSON.stringify(job.checkpoint).includes(marker),false);
  assert.equal(diagnostics[0].message,marker);
  assert.equal(diagnostics[0].id,job.checkpoint.diagnostic_id);
  const status=await workflow.status('request');
  const imports=await importJobs({db,project:'fixture'}).status('job');
  assert.equal(JSON.stringify([status,imports,attentionItems([job],[])]).includes(marker),false);
  // Old persisted exceptions are also prevented from leaking through status reads.
  job.checkpoint.next_action=marker;
  assert.equal(JSON.stringify(await workflow.status('request')).includes(marker),false);
  assert.equal(JSON.stringify(await importJobs({db,project:'fixture'}).status('job')).includes(marker),false);
});

test('bounded reads preserve stable paging and fail rather than returning incomplete results',async()=>{
  const values=Array.from({length:1005},(_,id)=>({id})),ranges=[],orders=[];
  const db={from(){const q={select(){return q;},order(key){orders.push(key);return q;},range(start,end){ranges.push([start,end]);return {data:values.slice(start,end+1)};}};return q;}};
  assert.equal((await rows(db,'fixture')).length,1005);
  assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
  assert.ok(orders.every(key=>key==='id'));
  await assert.rejects(rows(db,'fixture',q=>q,'*',{limit:1000}),/Scoped read exceeded bound/);
});


test('content-change probes preserve matches against any historical hash with constant-size responses',async()=>{
  const saved=Array.from({length:50000},(_,id)=>({id,source_id:'source',hash:`hash-${id}`}));
  const calls=[];
  const db={from(){let values=saved;const q={select(){return q;},eq(key,value){values=values.filter(row=>row[key]===value);return q;},
    order(){return q;},range(start,end){calls.push([start,end]);return {data:values.slice(start,end+1)};}};return q;}};
  assert.equal(await savedContentChange(db,'captures',q=>q.eq('source_id','source'),'hash','hash-0'),'unchanged');
  assert.equal(calls.length,1);
  assert.equal(await savedContentChange(db,'captures',q=>q.eq('source_id','source'),'hash','new-hash'),'changed');
  assert.equal(calls.length,3);
  assert.equal(await savedContentChange(db,'captures',q=>q.eq('source_id','other'),'hash','hash-0'),'new');
  assert.ok(calls.every(([start,end])=>start===0&&end===0));
});


test('checked database failures retain only private standardized error codes',async()=>{
  const job={id:'job',search_request_id:'request',dedupe_key:'api-import:request:hash',state:'running',lease_token:'lease',checkpoint:{stage:'import_prepare'}};
  const db=database(job),diagnostics=[];
  const workflow=hostedWorkflow({db,project:'fixture',artifacts:{},processJob:async()=>{
    checked({error:{code:'23505',message:marker,details:marker,hint:marker}});
  },reportError:(id,error)=>diagnostics.push({id,message:error.message,cause:error.cause})});
  assert.equal(await workflow.step(),true);
  assert.deepEqual(diagnostics[0].cause,{code:'23505'});
  assert.equal(diagnostics[0].id,job.checkpoint.diagnostic_id);
  assert.equal(JSON.stringify(diagnostics).includes(marker),false);
  const status=await workflow.status('request'),imports=await importJobs({db,project:'fixture'}).status('job');
  assert.equal(JSON.stringify([job.checkpoint,status,imports,attentionItems([job],[])]).includes('23505'),false);
  assert.equal(JSON.stringify([job.checkpoint,status,imports]).includes(marker),false);
  assert.throws(()=>checked({error:{code:marker}}),error=>error.cause.code==='unknown');
});
