import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { workflowServer } from '../scripts/lib/workflow-http.mjs';
import { requestedCategories,validateRequestScope } from '../scripts/lib/request-scope.mjs';
import { makeInterpretationPacket } from '../scripts/lib/known-source-workflow.mjs';
import { extractionKey,verifyEvidenceSpans,extractFacts,evaluateFacts,cacheReviewedFacts } from '../scripts/lib/hosted-interpretation.mjs';
import { validateFindingBounds } from '../scripts/lib/hosted-workflow.mjs';
import { quotaExhausted,boundedInterpretation } from '../scripts/lib/hosted-ai.mjs';
import { encryptSession,decryptSession,artifactStore } from '../scripts/lib/hosted-store.mjs';
import { context,result,id } from './helpers/known-workflow.mjs';
import { pdfFixture } from './helpers/valid-pdf.mjs';

async function call(server,path,{method='GET',headers={},input}={}) {
  const req=Readable.from(input===undefined?[]:[JSON.stringify(input)]);
  Object.assign(req,{url:path,method,headers});
  return new Promise(resolve=>server.emit('request',req,{headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status){this.status=status;},
    end(text){resolve({status:this.status,headers:this.headers,data:JSON.parse(text)});}}));
}
const actor=id(88),auth={authorization:'Bearer valid-session','content-type':'application/json'};
test('supporting capture endpoint requires sign-in, records actor and does not wake unrelated collection',async()=>{
  let kicks=0,recorded;
  const server=workflowServer({authenticate:async()=>({id:actor}),kick:()=>{kicks++;},workflow:{
    captureSupporting:async(...args)=>{recorded=args;return {state:'captured',lead_coverage:false};}}});
  const path=`/v1/requests/${id(1)}/tasks/${id(3)}/supporting-captures`;
  assert.equal((await call(server,path,{method:'POST',input:{}})).status,401);
  const response=await call(server,path,{method:'POST',headers:auth,input:{url:'https://example.gov/detail'}});
  assert.equal(response.status,200);assert.equal(recorded[3],actor);assert.equal(response.data.lead_coverage,false);
  assert.equal(kicks,0);server.close();
});
test('HTTP contract validates sessions, denies origins/anonymous callers, preserves actor and strips raw packet bytes',async()=>{
  const recorded=[];
  const server=workflowServer({allowedOrigins:['https://existing.netlify.app'],authenticate:async token=>token==='valid-session'?{id:actor}:null,
    workflow:{submit:async(...args)=>{recorded.push(args);return {request_id:id(1)};},packet:async()=>({pages:[{body:Buffer.from('private'),extension:'.html',review:'public evidence'}]})},kick:()=>{}});
  assert.equal((await call(server,'/v1/requests',{method:'POST',input:{}})).status,401);
  assert.equal((await call(server,'/v1/requests',{method:'POST',headers:{...auth,origin:'https://bad.example'},input:{}})).status,403);
  assert.equal((await call(server,'/v1/requests',{method:'POST',headers:{...auth,authorization:'Bearer privileged-key'},input:{}})).status,401);
  const response=await call(server,'/v1/requests',{method:'POST',headers:{...auth,'idempotency-key':'request-key'},input:{kind:'city'}});
  assert.equal(response.status,202);assert.equal(recorded[0][1],actor);assert.equal(recorded[0][2],'request-key');
  const packet=await call(server,`/v1/requests/${id(1)}/tasks/${id(3)}/packet`,{headers:auth});
  assert.deepEqual(packet.data.pages,[{review:'public evidence'}]);
  assert.equal(packet.headers['Cache-Control'],'no-store');
  assert.equal((await call(server,`/v1/requests/${id(1)}?limit=500`,{headers:auth})).status,400);
  server.close();
});
test('attention and separate SAM review endpoints require sign-in and do not wake collection',async()=>{
  let kicks=0;
  const server=workflowServer({authenticate:async()=>({id:actor}),workflow:{},kick:()=>{kicks++;},
    attention:async(request_id,paging)=>({request_id,...paging,items:[]}),
    samPacket:async request_id=>({request_id,canonical_writes:0})});
  assert.equal((await call(server,`/v1/requests/${id(1)}/attention`)).status,401);
  const attention=await call(server,`/v1/requests/${id(1)}/attention?offset=2&limit=3`,{headers:auth});
  assert.equal(attention.data.offset,2);assert.equal(attention.data.limit,3);
  assert.equal((await call(server,`/v1/requests/${id(1)}/attention?limit=101`,{headers:auth})).status,400);
  assert.equal((await call(server,`/v1/sam/requests/${id(1)}/packet`,{headers:auth})).data.canonical_writes,0);
  assert.equal(kicks,0);server.close();
});
test('selected category scope has strict date bases and retains legacy all-category behavior',()=>{
  assert.deepEqual(requestedCategories({}),['forecast','opportunity','award']);
  const input={requested_categories:['opportunity'],service_scope:{service:'janitorial'},
    search_windows:{opportunity:{from:'2026-10-06',to:'2027-10-05',date_basis:'deadline'}}};
  assert.deepEqual(validateRequestScope(input),['opportunity']);
  assert.throws(()=>validateRequestScope({...input,search_windows:{opportunity:{...input.search_windows.opportunity,from:'2026-02-30'}}}),/valid/);
  assert.throws(()=>validateRequestScope({...input,search_windows:{opportunity:{...input.search_windows.opportunity,date_basis:'end_renewal'}}}),/date_basis/);
});
test('cache identity excludes request/window/run IDs but changes with content, method and parser policy',()=>{
  const p=makeInterpretationPacket(context());
  const key=extractionKey(p,{runner_id:'public-fetch'});
  assert.equal(extractionKey({...p,request_id:id(70),query_window:{from:'2027-01-01'},pages:p.pages.map(x=>({...x,run_id:id(72)}))},{runner_id:'public-fetch'}),key);
  assert.notEqual(extractionKey({...p,method_version:'new'},{runner_id:'public-fetch'}),key);
  assert.notEqual(extractionKey({...p,pages:p.pages.map(x=>({...x,content_sha256:'a'.repeat(64)}))},{runner_id:'public-fetch'}),key);
});
test('fabricated quotations, unquoted work locations and out-of-bound dates cannot stage candidates',async()=>{
  const body=Buffer.from('<html><title>Procurement</title><main><table><tr><td>Janitorial services at Texarkana Arkansas 2026-10-30</td></tr></table></main></html>');
  const ctx=context(body),p=makeInterpretationPacket(ctx),review=result(p);
  review.findings[0].evidence[0].excerpt='Janitorial services at Texarkana Arkansas 2026-10-30';
  review.findings[0].payload.deadline='2026-10-30';
  review.findings[0].payload.work_city='Texarkana';
  await verifyEvidenceSpans(p,review);
  review.findings[0].evidence[0].excerpt='Invented cleaning contract';
  await assert.rejects(verifyEvidenceSpans(p,review),/does not occur/);
  review.findings[0].evidence[0].excerpt='Janitorial services at Texarkana Arkansas 2026-10-30';
  p.query_window={from:'2026-10-01',to:'2026-10-04',date_basis:'deadline'};
  assert.throws(()=>validateFindingBounds(p,review),/qualifying date/);
  p.query_window.to='2026-10-31';validateFindingBounds(p,review);
  p.request_scope.requested_search_areas=[{area_type:'city',city_name:'Little Rock',state_code:'AR'}];
  assert.throws(()=>validateFindingBounds(p,review),/location/);
});
test('structured extraction leaves ambiguous janitorial work unresolved and never infers the site from source scope',async()=>{
  const body=Buffer.from(JSON.stringify({success:1,payload:{projects:{'123':{ProjectID:'123',ProjectName:'Janitorial services',DateClose:'2026-10-20 14:00:00'}}}}));
  const ctx=context(body,'application/json');ctx.capability.method_spec={response_format:'bonfire-projects-v1',max_records:100,allowed_hosts:['example.gov']};
  const p=makeInterpretationPacket(ctx),facts=await extractFacts(p,ctx.capability.method_spec),review=evaluateFacts(p,facts);
  assert.equal(review.findings.length,0);assert.equal(review.unresolved.length,1);assert.equal(review.coverage,'partial');
  await verifyEvidenceSpans(p,review);
});
test('private browser session artifacts bind tenant and reject tampering; artifacts survive local file loss',async()=>{
  const key=Buffer.alloc(32,7).toString('base64'),bytes=Buffer.from('sensitive session'),encrypted=encryptSession(bytes,key,'tenant-a');
  assert.equal(decryptSession(encrypted,key,'tenant-a').toString(),bytes.toString());
  assert.throws(()=>decryptSession(encrypted,key,'tenant-b'));
  encrypted[30]^=1;assert.throws(()=>decryptSession(encrypted,key,'tenant-a'));
  const store=new Map(),artifacts=artifactStore({storage:{from:()=>({upload:async(path,data)=>{store.set(path,data);return {};},
    download:async path=>({data:new Blob([store.get(path)])})})}});
  const path=await artifacts.put(bytes);assert.deepEqual(await artifacts.get(path),bytes);
});
test('AI is disabled without approval; quota fallback is distinct from rate limits and auth errors',async()=>{
  let calls=0;
  await assert.rejects(boundedInterpretation({config:{enabled:false},fetcher:async()=>{calls++;}}),/disabled/);
  assert.equal(calls,0);
  assert.equal(quotaExhausted(429,{code:'insufficient_quota'}),true);
  assert.equal(quotaExhausted(429,{code:'rate_limit_exceeded'}),false);
  assert.equal(quotaExhausted(401,{code:'insufficient_quota'}),false);
});
test('PDF evidence must occur on the cited page, not merely have a PDF signature',async()=>{
  const body=pdfFixture(),p=makeInterpretationPacket(context(body,'application/pdf')),review=result(p);
  review.findings[0].title='Janitorial floor care';review.findings[0].payload.title='Janitorial floor care';
  review.findings[0].payload.deadline=null;delete review.findings[0].payload.work_performance_locations;
  review.findings[0].evidence[0]={run_id:p.pages[0].run_id,locator:'PDF page 1',excerpt:'24-18 Janitorial floor care'};
  await verifyEvidenceSpans(p,review);
  review.findings[0].evidence[0].excerpt='Fabricated award';await assert.rejects(verifyEvidenceSpans(p,review),/does not occur/);
});


test('verified cached facts rebind evidence to a later request and still enforce its dates and geography',async()=>{
  const p=makeInterpretationPacket(context()),r=result(p);
  const cached=cacheReviewedFacts({facts:[]},p,r);
  const later={...p,request_id:id(81),pages:p.pages.map(page=>({...page,run_id:id(82)}))};
  const reused=evaluateFacts(later,cached);
  assert.equal(reused.findings.length,1);assert.equal(reused.findings[0].evidence[0].run_id,id(82));
  later.query_window={from:'2026-10-01',to:'2026-10-31',date_basis:'deadline'};
  validateFindingBounds(later,reused);
  later.query_window={from:'2027-10-01',to:'2027-10-31',date_basis:'deadline'};
  assert.throws(()=>validateFindingBounds(later,reused),/qualifying date/);
});

test('explicit primary quota rejection permits backup; an unknown call never switches providers',async()=>{
  const writes=[],reservations=[];
  const db={rpc:async(name,args)=>{reservations.push(args);return {data:{}};},
    from:()=>({update:value=>({eq:async()=>{writes.push(value);return {data:null};}})})};
  const rate={key:'fixture-key',model:'fixture',rateVersion:'offline',inputUsdPerMillion:1,outputUsdPerMillion:1};
  const config={enabled:true,monthlyUsd:10,openai:rate,anthropic:rate},packet=makeInterpretationPacket(context());
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const urls=[];
  const output={findings:[],exclusions:[],unresolved:[]};
  await boundedInterpretation({db,requestId:packet.request_id,actor,packet,config,fetcher:async url=>{
    urls.push(url);
    if(url.includes('input_tokens')||url.includes('count_tokens'))return reply({input_tokens:100});
    if(url.includes('openai'))return reply({error:{code:'insufficient_quota'}},429);
    return reply({usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify(output)}]});
  }});
  assert.equal(reservations.length,2);assert.equal(writes[0].actual_usd,0);assert.ok(urls.some(u=>u.includes('anthropic')));
  urls.length=0;
  await assert.rejects(boundedInterpretation({db,requestId:packet.request_id,actor,packet,config,fetcher:async url=>{
    urls.push(url);if(url.includes('input_tokens'))return reply({input_tokens:100});throw new Error('network outcome unknown');
  }}),/outcome unknown/);
  assert.equal(writes.at(-1).state,'outcome_unknown');assert.equal(urls.some(u=>u.includes('anthropic')),false);
});
