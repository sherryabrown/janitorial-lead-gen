import test from 'node:test';
import assert from 'node:assert/strict';
import {sha} from '../scripts/lib/hosted-store.mjs';
import {requestPublicCapture} from '../scripts/lib/public-capture-reuse.mjs';

test('request-local capture reuse requires exact source, URL, completed audit, original timestamp and verified bounded bytes',async()=>{
  const body=Buffer.from('<main>Official listing</main>'),digest=sha(body),date=new Date().toISOString();
  const data={procurement_trigger_requests:[{request_id:'request',trigger_id:'parent',role:'county'},{request_id:'sibling',trigger_id:'parent',role:'state_research'}],procurement_jobs:[{id:'job',search_request_id:'request'}],
    procurement_runs:[{id:'run',source_id:'source',job_id:'job',detail:{state:'content_saved',requested_url:'https://agency.example/bids',content_sha256:digest}}],
    procurement_public_captures:[{run_id:'run',source_id:'source',requested_url:'https://agency.example/bids',final_url:'https://agency.example/bids',
      retrieved_at:date,content_type:'text/html',content_sha256:digest,content_base64:body.toString('base64')}]};
  const db={from(table){const filters=[];let start=0,end=999;const q={select:()=>q,order:()=>q,range:(a,b)=>{start=a;end=b;return q;},
    eq:(key,value)=>{filters.push(row=>row[key]===value);return q;},in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q;},
    then(resolve){resolve({data:data[table].filter(row=>filters.every(f=>f(row))).slice(start,end+1)});}};return q;}};
  const input={requestId:'request',sourceId:'source',url:'https://agency.example/bids',maxBytes:2000,allowedHosts:['agency.example']};
  const result=await requestPublicCapture(db,input);assert.equal(result.reused_run_id,'run');assert.equal(result.retrieved_at,date);assert.deepEqual(result.body,body);
  assert.equal((await requestPublicCapture(db,{...input,requestId:'sibling'})).reused_run_id,'run');
  for(const change of [{requestId:'other'},{sourceId:'other'},{url:'https://agency.example/bids?page=2'},{maxBytes:1},{allowedHosts:['other.example']}])
    assert.equal(await requestPublicCapture(db,{...input,...change}),null);
  const capture=data.procurement_public_captures[0];
  for(const [key,value] of [['content_base64','eA=='],['retrieved_at','2020-01-01'],['content_type','application/json']]) {
    const old=capture[key];capture[key]=value;assert.equal(await requestPublicCapture(db,input),null);capture[key]=old;
  }
  data.procurement_runs[0].detail.state='request_pending';assert.equal(await requestPublicCapture(db,input),null);
});
