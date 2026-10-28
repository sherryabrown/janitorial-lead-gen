import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateWebsite,verifyWebsiteCandidate,repairStatus} from '../scripts/lib/guided-source-resolution.mjs';
import {Readable} from 'node:stream';
import {workflowServer} from '../scripts/lib/workflow-http.mjs';
const publicDns=async()=>[{address:'8.8.8.8',family:4}];
const source={id:'source',code:'official-county',name:'County',url:'https://county.example/',config:{}};
const geography={id:'05001',name:'Arkansas County',kind:'county',state_code:'AR',source_active:true};

test('a supplied website proves only an official entry, never a completed category check',async()=>{
 const calls=[];
 const verified=await verifyWebsiteCandidate({url:'https://county.example/bids',source,geography,resolveHost:publicDns,
  fetcher:async url=>{calls.push(url);return new Response('<main><h1>County website</h1><p>Contact purchasing</p></main>',{headers:{'content-type':'text/html'}});}});
 assert.equal(verified.outcome,'entry_verified');assert.equal(calls.length,1);
 assert.equal('fixed_verified' in verified,false);assert.equal('lead_count' in verified,false);
 assert.equal(Buffer.from(verified.capture.body,'base64').includes(Buffer.from('County website')),true);
});

test('wrong agency and private destinations are rejected before candidate fetch',async()=>{
 let fetches=0;
 const fetcher=async()=>{fetches++;throw Error('Must not fetch candidate');};
 const wrong=await verifyWebsiteCandidate({url:'https://other.example/bids',source,geography,fetcher,resolveHost:publicDns,
  directory:async()=>({state:'resolved',url:'https://county.example/'})});
 assert.equal(wrong.outcome,'wrong_entity');assert.equal(fetches,0);
 const privateAddress=await verifyWebsiteCandidate({url:'https://county.example/bids',source,geography,fetcher,
  resolveHost:async()=>[{address:'169.254.169.254',family:4}]});
 assert.equal(privateAddress.outcome,'needs_developer');assert.equal(fetches,0);
 for(const url of ['https://127.0.0.1/','https://localhost/','https://host.internal/','https://user:pass@county.example/','https://county.example/?api_key=secret','http://county.example/'])
  assert.throws(()=>candidateWebsite(url));
});

test('public redirects recheck DNS; unsupported portals and challenge pages do not become verified fixes',async()=>{
 const calls=[];
 const redirected=await verifyWebsiteCandidate({url:source.url,source,geography,
  resolveHost:async hostname=>[{address:hostname==='private.example'?'10.0.0.1':'8.8.8.8',family:4}],
  fetcher:async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'https://private.example/admin'}});}});
 assert.equal(redirected.outcome,'needs_developer');assert.deepEqual(calls,[source.url]);
 const portal=await verifyWebsiteCandidate({url:'https://agency.bonfirehub.com/portal/',source,geography,fetcher:async()=>{throw Error('Portal hold must not fetch');}});
 assert.equal(portal.outcome,'needs_developer');
 const challenge=await verifyWebsiteCandidate({url:source.url,source,geography,resolveHost:publicDns,
  fetcher:async()=>new Response('<html><title>Just a moment...</title><div id="challenge-running">Verify you are human</div></html>',{headers:{'content-type':'text/html'}})});
 assert.equal(challenge.outcome,'needs_developer');
});

test('size/content bounds and missing official identity retain an honest developer handoff',async()=>{
 const oversized=await verifyWebsiteCandidate({url:source.url,source,geography,resolveHost:publicDns,
  fetcher:async()=>new Response('x',{headers:{'content-type':'text/html','content-length':'3000000'}})});
 assert.equal(oversized.outcome,'needs_developer');
 const unknown=await verifyWebsiteCandidate({url:'https://new.example/',geography,directory:async()=>({state:'blocked'}),
  fetcher:async()=>{throw Error('Unverified identity must not fetch the candidate');}});
 assert.equal(unknown.outcome,'needs_developer');
});

test('repair status requires explicit apply and separates unknown saves from a verified repair',()=>{
 const ready=repairStatus({id:'job',state:'blocked',checkpoint:{guided_entry:true,stage:'discovery_source_entry_ready',verified_artifact:'capture'}});
 assert.equal(ready.can_apply_website,true);assert.equal(ready.fixed,false);assert.match(ready.explanation,/does not yet prove/);
 const unknown=repairStatus({id:'job',state:'blocked',checkpoint:{guided_method:true,stage:'discovery_save',persistence_intent:'intent'}});
 assert.equal(unknown.needs_reconciliation,true);assert.equal(unknown.fixed,false);
 const unsupported=repairStatus({id:'job',state:'blocked',checkpoint:{guided_method:true,stage:'discovery_verify',verification_failures:['private parser exception']}});
 assert.equal(JSON.stringify(unsupported).includes('private parser exception'),false);assert.match(unsupported.title,/Developer/);
});

test('source review does not wake or append execution logs to the old schedule run',async()=>{
 const actor='00000000-0000-4000-8000-000000000001',task='00000000-0000-4000-8000-000000000002';
 let wakes=0,audits=0,kicks=0,role='admin';
 const server=workflowServer({authenticate:async()=>({id:actor}),capabilities:async()=>({role,manage_schedules:true,manage_sources:role==='admin'}),db:{},
  sourceResolution:{decide:async()=>({saved:true}),verify:async()=>({job_id:task,state:'pending'}),status:async()=>({state:'blocked'})},
  triggers:{wake:async()=>{wakes++;}},audit:{run:async(_id,_phase,operation)=>{audits++;return operation();}},kick:()=>{kicks++;}});
 const call=(path,method='POST')=>new Promise(resolve=>{
  const req=Readable.from(method==='POST'?['{}']:[]);Object.assign(req,{url:path,method,headers:{authorization:'Bearer fixture','content-type':'application/json','idempotency-key':'source-review-http'}});
  server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(text){resolve({status:this.status,body:JSON.parse(text)});}});
 });
 try{
  assert.equal((await call(`/v1/requests/${actor}/source-reviews/${task}`)).status,200);
  assert.equal(wakes,0);assert.equal(audits,0);assert.equal(kicks,0);
  assert.equal((await call(`/v1/requests/${actor}/source-resolution/${task}/verify`)).status,200);
  assert.equal(kicks,1);assert.equal(wakes,0);assert.equal(audits,0);
  assert.equal((await call(`/v1/requests/${actor}/source-resolution/${task}/status?job=${task}`,'GET')).status,200);assert.equal(kicks,1);
  role='user';assert.equal((await call(`/v1/requests/${actor}/source-resolution/${task}/verify`)).status,403);assert.equal(kicks,1);
 }finally{server.close();}
});
