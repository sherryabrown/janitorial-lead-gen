import test from 'node:test';
import assert from 'node:assert/strict';
import {portalRecipe,validateSessionState,sessionIdentity,guardPortalContext} from '../scripts/lib/portal-session.mjs';
import {accessHash} from '../scripts/lib/source-access.mjs';
import {browserService,sanitizeBrowserDocument} from '../scripts/lib/hosted-browser.mjs';
import {sha,decryptSession} from '../scripts/lib/hosted-store.mjs';
import {pdfFixture} from './helpers/valid-pdf.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const recipe=()=>({version:1,official_portal:true,verified_at:'2026-10-01',verified_until:'2099-01-01',evidence_reference:'official:signin',
 allowed_hosts:['agency.example.gov','account.example.gov'],entry_url:'https://agency.example.gov/login',verify_url:'https://agency.example.gov/portal',
 authenticated_selector:'a[href="/logout"]',login_steps:[{action:'fill',selector:'#email',secret:'PROCUREMENT_PORTAL_EMAIL'},
 {action:'fill',selector:'#password',secret:'PROCUREMENT_PORTAL_PASSWORD'},{action:'click',selector:'#login'}]});
const state=()=>({cookies:[{name:'auth',value:'private-fixture',domain:'agency.example.gov',path:'/',expires:-1,secure:true,httpOnly:true,sameSite:'Lax'}],origins:[]});
function fixture({credentials=true,documentFetch,redirectRequired=false,completionFails=false}={}){
 let handoff={id,source_id:'source',channel:'portal',tenant:'agency.example.gov',updated_at:'2026-10-01T00:00:00Z',lifecycle_revision:0,
 lifecycle:{version:1,stages:{registration:{state:'submitted',provenance:'user_reported'}},attempts:[],events:[],
 account:{kind:'existing_account',provider:'agency.example.gov',reference:'existing'}},details:{hosted_access_recipe:recipe()}};
 const saved=new Map(),stats={launches:0,closed:0,fills:0,redirectWaits:0};
 const tables={};
 const db={from(table){let filters=[],updates,single=false;
 const q={select(){return this;},eq(k,v){filters.push(h=>h[k]===v);return this;},in(k,v){filters.push(h=>v.includes(h[k]));return this;},order(){return this;},range(){return this;},maybeSingle(){single=true;return this;},
 update(v){updates=v;return this;},then(resolve,reject){return Promise.resolve().then(()=>{let data=(table==='procurement_access_handoffs'?[handoff]:tables[table]??[]).filter(h=>filters.every(fn=>fn(h)));
 if(updates)for(const row of data)Object.assign(row,updates);return {data:single?structuredClone(data[0]??null):structuredClone(data),error:null};}).then(resolve,reject);}};return q;},
 async rpc(name,a){
 if(name==='claim_procurement_known_job'){const job=tables.procurement_jobs.find(j=>j.id===a.p_job_id);job.state='running';job.lease_token='lease';return {data:structuredClone(job)};}
 if(name==='record_procurement_browser_capture'){
  const job=tables.procurement_jobs.find(j=>j.id===a.p_job_id);assert.equal(a.p_lease_token,'lease');job.state='partial';
  tables.procurement_runs=a.p_pages.map(p=>({id:p.run_id,source_id:'source',job_id:job.id,started_at:p.retrieved_at,coverage_task_id:'task',detail:{
   state:'content_saved',collector:'authenticated-browser',upstream_status:200,access_handoff_id:id,kind:'opportunity',method_spec:a.p_method_spec,content_sha256:p.content_sha256}}));
  tables.procurement_coverage_tasks=[{id:'task',kind:'opportunity'}];tables.procurement_public_captures=a.p_pages.map(p=>({...p,source_id:'source'}));
  return {data:{run_ids:a.p_pages.map(p=>p.run_id)}};
 }
 assert.equal(a.p_expected_revision,handoff.lifecycle_revision);handoff.lifecycle=a.p_lifecycle;handoff.lifecycle_revision++;return {data:{status:'saved'}};}};
 const artifacts={async put(value){const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),path=`artifacts/${sha(b)}`;saved.set(path,b);return path;},async get(path){return saved.get(path);}};
 const launch=async()=>{stats.launches++;let connected=true;return {isConnected:()=>connected,async close(){connected=false;stats.closed++;},
 async newContext(options){let signed=!!options.storageState,redirectPending=false;
 return {async close(){},async route(){},async cookies(){return [{name:'auth',value:'private-fixture'}];},async storageState(){return state();},async newPage(){return {async goto(){if(redirectPending)throw Error('Login interrupted by navigation');return {status:()=>200};},url:()=>recipe().verify_url,
 async waitForURL(predicate){stats.redirectWaits++;assert.equal(predicate(new URL('https://foreign.gov/portal')),false);assert.equal(predicate(new URL(recipe().verify_url+'?tab=open')),true);if(completionFails)throw Error('Login completion timeout');redirectPending=false;},
 async title(){return 'Contract opportunities';},async content(){return '<html><title>Contracts</title><main>Janitorial work</main></html>';},
 locator(_selector){return {first(){return this;},async count(){return 0;},async isVisible(){return false;},async waitFor(){if(!signed)throw Error('Not authenticated');},
 async fill(){stats.fills++;},async click(){signed=true;redirectPending=redirectRequired;}};}};}};}};};
 const key=Buffer.alloc(32,7).toString('base64');
 const service=browserService({db,artifacts,sessionKey:key,launch,documentFetch,secrets:()=>credentials?'private-value':undefined,memory:async n=>n==='max'?536870912:300000000});
 return {service,stats,saved,key,tables,get handoff(){return handoff;},set handoff(h){handoff=h;}};
}
test('reviewed recipes and session state reject expired, aggregator and foreign tenant data',()=>{
 const h={channel:'portal',tenant:'agency.example.gov',details:{hosted_access_recipe:recipe()}};
 assert.equal(portalRecipe(h).version,1);validateSessionState(state(),recipe().allowed_hosts);
 for(const change of [{verified_until:'2020-01-01'},{verify_url:'https://foreign.gov/portal'},{login_steps:[{action:'fill',selector:'#x',secret:'PROCUREMENT_DATABASE_URL'}]}])
 assert.throws(()=>portalRecipe({...h,details:{hosted_access_recipe:{...recipe(),...change}}}));
 assert.throws(()=>portalRecipe({...h,details:{...h.details,aggregator:true}}),/Aggregator/);
 const foreign=state();foreign.cookies[0].domain='foreign.gov';assert.throws(()=>validateSessionState(foreign,recipe().allowed_hosts),/hosts/);
 assert.throws(()=>validateSessionState({...state(),origins:[{origin:'https://foreign.gov',localStorage:[]}]},recipe().allowed_hosts),/hosts/);
});
test('credential sign-in encrypts isolated state, preserves signup history and reuses session without credentials',async()=>{
 const f=fixture();let result=await f.service.continueAccess(id,actor);
 assert.equal(result.state,'signed_in');assert.equal(result.lead_coverage,false);assert.equal(f.stats.fills,2);assert.equal(f.stats.closed,1);
 const encrypted=f.saved.get(f.handoff.details.hosted_session.artifact);
 assert.equal(encrypted.includes(Buffer.from('private-fixture')),false);
 assert.deepEqual(JSON.parse(decryptSession(encrypted,f.key,sessionIdentity(f.handoff))),state());
 assert.throws(()=>decryptSession(encrypted,f.key,'another-tenant'));
 assert.equal(f.handoff.lifecycle.stages.registration.state,'submitted');assert.equal(f.handoff.lifecycle.attempts.length,0);
 assert.equal(f.handoff.lifecycle.stages.sign_in.provenance,'observed');
 result=await f.service.continueAccess(id,actor);assert.equal(result.session_reused,true);assert.equal(f.stats.fills,2);assert.equal(f.stats.closed,2);
 assert.equal(JSON.stringify(result).includes('private-fixture'),false);
});

test('reviewed sign-in completion waits for the tenant redirect before verification and fails closed on timeout',async()=>{
 const f=fixture({redirectRequired:true});f.handoff.details.hosted_access_recipe.sign_in_complete_url=recipe().verify_url;
 const result=await f.service.continueAccess(id,actor);assert.equal(result.state,'signed_in');assert.equal(f.stats.redirectWaits,1);
 assert.equal(f.stats.closed,1);
 const blocked=fixture({redirectRequired:true,completionFails:true});blocked.handoff.details.hosted_access_recipe.sign_in_complete_url=recipe().verify_url;
 const failure=await blocked.service.continueAccess(id,actor);assert.equal(failure.state,'needs_attention');assert.equal(blocked.stats.closed,1);
 assert.equal(blocked.handoff.details.hosted_session,undefined);assert.equal(blocked.handoff.lifecycle.stages.registration.state,'submitted');
 assert.throws(()=>portalRecipe({...f.handoff,details:{hosted_access_recipe:{...recipe(),sign_in_complete_url:'https://foreign.gov/portal'}}}),/reviewed tenant/);
});
test('missing credentials and unresolved signup preserve exact handoff without duplicate external actions',async()=>{
 const f=fixture({credentials:false});const r=await f.service.continueAccess(id,actor);
 assert.equal(r.state,'needs_attention');assert.match(r.next_action,/existing account/);assert.equal(f.stats.launches,0);
 f.handoff.lifecycle.attempts=[{id:'prior',type:'submission_intent'}];
 const pending=await f.service.continueAccess(id,actor);assert.equal(pending.state,'blocked');assert.equal(f.stats.launches,0);
 assert.equal(f.handoff.lifecycle.attempts.length,1);
});
test('private session adoption verifies tenant rather than trusting supplied cookies, with cleanup on failure',async()=>{
 const f=fixture({credentials:false});const r=await f.service.adoptSession(id,{storage_state:state()},actor);
 assert.equal(r.state,'signed_in');assert.equal(f.stats.closed,1);
 const foreign=state();foreign.cookies[0].domain='foreign.gov';
 const failed=await f.service.adoptSession(id,{storage_state:foreign},actor);assert.equal(failed.state,'needs_attention');assert.equal(f.stats.launches,1);
});
test('password or terms signup requires a precise human action without submitting or creating an attempt',async()=>{
 const f=fixture({credentials:false});delete f.handoff.lifecycle.account;f.handoff.lifecycle.stages.registration={state:'not_started'};
 f.handoff.details.hosted_access_recipe.signup={free:true,url:'https://agency.example.gov/register',fields:[],
 submit_selector:'#submit',success_selector:'#sent',requires_new_password:true};
 const result=await f.service.continueAccess(id,actor);assert.equal(result.state,'needs_attention');assert.match(result.next_action,/password\/terms/);
 assert.equal(f.stats.launches,0);assert.equal(f.handoff.lifecycle.attempts.length,0);
});
test('authenticated collection persists partial audited evidence and category proof without treating access as complete coverage',async()=>{
 const f=fixture();await f.service.continueAccess(id,actor);
 const spec={version:1,runner_id:'authenticated-browser',check_when:'each_request',access_handoff_id:id,
  urls:[recipe().verify_url],allowed_hosts:['agency.example.gov'],max_bytes:10000,check_instructions:'Read category',terminal_instruction:'Pagination remains unverified'};
 f.tables.procurement_source_capabilities=[{id:'cap',source_id:'source',kind:'opportunity',method:'browser',parser_version:'v1',availability:'active',
  verified_at:'2026-10-01',verified_until:'2099-01-01',verification_evidence:{official:true},method_spec:spec}];
 f.tables.procurement_sources=[{id:'source'}];f.tables.procurement_jobs=[{id:'job',capability_id:'cap',state:'pending',checkpoint:{},updated_at:'2026-10-01'}];
 const result=await f.service.capture('job',actor,id);assert.equal(result.state,'partial');assert.equal(result.receipt.run_ids.length,1);
 assert.equal(f.handoff.lifecycle.stages.opportunity_access.state,'accessible');assert.equal(f.tables.procurement_jobs[0].checkpoint.hosted_browser_attempt.state,'captured');
 assert.equal(f.stats.fills,2);assert.equal(f.stats.closed,2);
 await assert.rejects(f.service.capture('job',actor,'foreign-handoff'),/another access/);
});
test('expired interrupted read reconciles absent audit before retry and refuses an active lease',async()=>{
 const f=fixture(),spec={access_handoff_id:id};f.tables.procurement_source_capabilities=[{id:'cap',method_spec:spec,source_id:'source'}];
 f.tables.procurement_jobs=[{id:'job',capability_id:'cap',state:'running',lease_until:'2099-01-01',updated_at:'2026-10-01',
  checkpoint:{hosted_browser_attempt:{run_ids:[actor],method_hash:accessHash(spec),state:'request_pending'}}}];
 await assert.rejects(f.service.reconcileCapture(id,'job'),/still leased/);
 f.tables.procurement_jobs[0].lease_until='2020-01-01';const result=await f.service.reconcileCapture(id,'job');
 assert.equal(result.state,'not_saved');assert.equal(f.tables.procurement_jobs[0].state,'pending');assert.equal(f.stats.launches,0);
});
test('authenticated PDF uses only reviewed URL cookies, bounded streaming and genuine document bytes',async()=>{
 const pdf=await pdfFixture();let requested;
 const f=fixture({documentFetch:async(url,options)=>{requested={url,cookie:options.headers.Cookie};return new Response(pdf,{headers:{'Content-Type':'application/pdf'}});}});
 await f.service.continueAccess(id,actor);
 const spec={version:1,runner_id:'authenticated-browser',check_when:'each_request',access_handoff_id:id,
  urls:['https://agency.example.gov/document.pdf'],allowed_hosts:['agency.example.gov'],max_bytes:10000,check_instructions:'Review document',terminal_instruction:'One bounded document'};
 f.tables.procurement_source_capabilities=[{id:'cap',source_id:'source',kind:'opportunity',method:'browser',parser_version:'v1',availability:'active',
  verified_at:'2026-10-01',verified_until:'2099-01-01',verification_evidence:{official:true},method_spec:spec}];
 f.tables.procurement_sources=[{id:'source'}];f.tables.procurement_jobs=[{id:'job',capability_id:'cap',state:'pending',checkpoint:{},updated_at:'2026-10-01'}];
 const result=await f.service.capture('job',actor,id);assert.equal(result.state,'partial');assert.equal(requested.url,spec.urls[0]);
 assert.equal(requested.cookie,'auth=private-fixture');assert.equal(f.tables.procurement_public_captures[0].content_type,'application/pdf');
 assert.equal(JSON.stringify(result).includes('private-fixture'),false);assert.equal(f.stats.closed,2);
});
test('collection blocks writes, foreign hosts and costly media; evidence removes account and session markup',async()=>{
 let handler;await guardPortalContext({async route(_p,fn){handler=fn;}},['agency.example.gov']);
 for(const [url,method,expected] of [['https://agency.example.gov/a','GET','continue'],['https://foreign.gov/a','GET','abort'],['https://agency.example.gov/a','POST','abort']]){
 let action;await handler({request:()=>({url:()=>url,method:()=>method,resourceType:()=> 'document'}),continue:()=>{action='continue';},abort:()=>{action='abort';}});assert.equal(action,expected);}
 const raw='<html><title>Awards</title><nav>private@example.gov</nav><main data-token="secret"><p>Custodial award</p><p>private@example.gov</p><input type="hidden" value="secret"><script>secret</script></main></html>';
 const text=sanitizeBrowserDocument(raw).toString();assert.match(text,/Custodial award/);assert.doesNotMatch(text,/secret|private@example/);
});
