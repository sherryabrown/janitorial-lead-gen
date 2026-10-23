import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {workflowServer} from '../scripts/lib/workflow-http.mjs';
import {publicOccurrence} from '../scripts/lib/schedule-activity.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('activity HTTP read requires authentication, validates paging and forwards only read filters',async()=>{
 let received;
 const server=workflowServer({authenticate:async()=>({id}),schedules:{activity:async(schedule,filters)=>{received={schedule,filters};if(filters.kind==='bad')throw Error('Invalid activity filters');return {items:[],total:0,next_offset:null};}}});
 const call=(query='',signed=true)=>new Promise(resolve=>{const request=Readable.from([]);Object.assign(request,{url:`/v1/schedules/${id}/activity${query}`,method:'GET',headers:signed?{authorization:'Bearer test'}:{}});server.emit('request',request,{setHeader(){},writeHead(status){this.status=status;},end(body){resolve({status:this.status,body:JSON.parse(body)});}});});
 assert.equal((await call('',false)).status,401);
 assert.equal((await call('?offset=20&limit=10&kind=attempt&private=secret')).status,200);
 assert.deepEqual(received,{schedule:id,filters:{offset:20,limit:10,kind:'attempt'}});
 assert.equal((await call('?limit=101')).status,400);assert.equal((await call('?kind=bad')).status,400);
});
test('dispatch projection retains public baseline evidence and omits private fields and diagnostic reasons',()=>{
 const projected=publicOccurrence({id,version:1,state:'blocked',reason:'private internal trace',actor_id:id,run_key:'private',baseline:[{source_id:id,capability_id:'bad',run_id:id,category:'private',finished_at:'bad',content_sha256:'a'.repeat(64),private:'secret'}]});
 assert.equal(projected.reason,'saved_reason');assert.ok(!('actor_id' in projected));assert.ok(!('run_key' in projected));assert.deepEqual(projected.baseline,[{source_id:id,capability_id:null,run_id:id,category:null,finished_at:null,content_sha256:'a'.repeat(64)}]);
});
