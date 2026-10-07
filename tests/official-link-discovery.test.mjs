import test from 'node:test';
import assert from 'node:assert/strict';
import {officialLinks,publicReview,validateDiscoveryReview,publicDiscovery} from '../scripts/lib/official-link-discovery.mjs';
import {persistenceSql} from '../scripts/lib/research-persistence.mjs';
import {rehearsalBlueprint} from '../scripts/lib/native-sql-rehearsal.mjs';
import {offlineNativeSession} from './helpers/native-rehearsal.mjs';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {workflowServer} from '../scripts/lib/workflow-http.mjs';
import {saveDiscoveryHandoffs} from '../scripts/lib/hosted-discovery.mjs';
const source='00000000-0000-4000-8000-000000000001',run='00000000-0000-4000-8000-000000000002';
const url='https://agency.gov/bids';
function fixture(){
 const packet={seed_source_id:source,packet_hash:'a'.repeat(64),pages:[{run_id:run,url,review:'Official agency bid opportunities. Janitorial solicitation.'}],links:[]};
 const task={kind:'opportunity',route_geography_id:'05'};
 const handoff=channel=>({source_id:source,channel,tenant:'agency.gov',checked_on:'2026-10-07',access_state:'public',next_actor:'researcher',next_action:'Reuse public method',
   evidence_urls:[url],requirements:{public:'yes',account:'no',approval:'no',api_key:'no',payment:'no'},categories:{forecast:'unknown',opportunity:'yes',award:'unknown'}});
 const input={sourceSpec:{code:'agency',url},capability:{kind:'opportunity',route_geography_id:'05',method:'browser',parser_version:'official-page-v1',official_entry_url:url,endpoint_url:url,
   method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:[url],allowed_hosts:['agency.gov'],max_bytes:2000000}},
   category_evidence:[{run_id:run,excerpt:'Official agency bid opportunities.'}],check_instructions:'Read all bid rows and linked routine janitorial documents',
   terminal_instruction:'One saved listing only; missing archive is partial',handoffs:['portal','api'].map(handoff)};
 return {packet,task,input};
}
test('discovery links retain official provenance, reject credential URLs and ignore irrelevant navigation',()=>{
 const links=officialLinks(Buffer.from('<a href="/bids">Bids</a><a href="https://provider.example/register">Vendor registration</a><a href="/login?token=secret">Procurement</a><a href="/sports">Sports</a>'),url);
 assert.deepEqual(links.map(l=>l.url),[url,'https://provider.example/register']);
 assert.equal(publicReview(Buffer.from('<script>danger</script><form><input value="private"></form><p>Bid rows</p>'),'text/html'),'Bid rows');
});
test('activation binds category, literal quotations, captured URLs and portal/API evidence',()=>{
 const {packet,task,input}=fixture(),saved=validateDiscoveryReview(packet,input,task);
 assert.deepEqual(saved.capability.verification_evidence.run_ids,[run]);
 assert.equal(saved.capability.method_spec.check_when,'each_request');
 for(const bad of [{...input,category_evidence:[{run_id:run,excerpt:'Invented award'}]},
  {...input,capability:{...input.capability,kind:'award'}},{...input,capability:{...input.capability,method_spec:{...input.capability.method_spec,urls:['https://agency.gov/guessed']}}},
  {...input,handoffs:[input.handoffs[0]]}])assert.throws(()=>validateDiscoveryReview(packet,bad,task));
});
test('native registry SQL preserves default production target and isolates rehearsal without commit',()=>{
 const m={kind:'registry',project_ref:'test',rows:[]};
 assert.match(persistenceSql(m),/^begin;/);
 const sql=persistenceSql(m,{schema:'procurement_test',transaction:false});
 assert.doesNotMatch(sql,/public\.|\bbegin;|\bcommit;/);assert.throws(()=>persistenceSql(m,{schema:'other'}));
 const schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json'));
 assert.equal(rehearsalBlueprint({},schema,m).sql,sql);
});
test('real native registry rehearsal proves rollback, persistence, replay and cleanup',async()=>{
 const session=await offlineNativeSession();
 try {
  const schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json'));
  const m={kind:'registry',project_ref:'test',rows:[{table:'procurement_sources',before:null,row:{id:source,code:'new-official',name:'Official agency',url,contracting_entity_geo_level:'state',business_category:'other_public',source_coverage_areas:[],config:{}}}]};
  const receipt=await session.run({before:{project_ref:'test'},schema,manifest:m,sql:persistenceSql(m)});
  assert.equal(receipt.status,'native_tests_passed');assert.ok(receipt.cleanup&&receipt.rollback&&receipt.readback&&receipt.replay);
 }finally{await session.close();}
});
test('discovery submission resumes a saved job without repeated research',async()=>{
 const job={id:run,state:'blocked',checkpoint:{next_action:'Review saved page'}};
 const data={procurement_search_requests:{id:source},procurement_coverage_tasks:{id:run,kind:'opportunity',target_id:'target'},procurement_request_targets:{search_request_id:source},procurement_jobs:job};
 let writes=0,fetches=0;
 const db={from(table){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:data[table]}),upsert:()=>{writes++;throw Error('no duplicate');}};return q;}};
 const discovery=publicDiscovery({db,fetcher:()=>{fetches++;}});
 assert.equal((await discovery(source,{task_id:run},source)).job_id,run);assert.equal(writes,0);assert.equal(fetches,0);
});

test('private research handoffs replay without duplicate history or resetting access progress',async()=>{
 const {input}=fixture();let writes=0;
 const saved=structuredClone(input.handoffs[0]);
 const {source_id,channel,tenant,checked_on,...details}=saved;
 delete details.access_state;delete details.next_actor;delete details.next_action;
 const prior={id:run,source_id,channel,tenant,checked_on,details,access_state:'signed_in',next_action:'Continue saved session',history:[]};
 const data={procurement_sources:[{id:source}],procurement_registrations:[],procurement_access_handoffs:[prior]};
 const db={from(table){const q={select:()=>q,order:()=>q,range:async()=>({data:data[table]}),update:()=>{writes++;throw Error('no replay write');},insert:()=>{writes++;throw Error('no duplicate');}};return q;}};
 await saveDiscoveryHandoffs({db,manifest:{mappings:{sources:{agency:[{id:source}]}}},sourceSpec:{local_key:'agency'},handoffs:[saved]});
 assert.equal(writes,0);assert.equal(prior.access_state,'signed_in');assert.deepEqual(prior.history,[]);
});
test('registration migration grants only three existing tables and no delete or client permissions',async()=>{
 const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite();
 try {
  await db.exec('create role procurement_import_backend; create role authenticated; create role anon;');
  for(const t of ['procurement_sources','procurement_source_capabilities','procurement_request_sources'])await db.exec(`create table public.${t}(id uuid primary key);alter table public.${t} enable row level security;`);
  await db.exec(readFileSync('supabase/migrations/20261007000600_hosted_official_method_registration.sql','utf8'));
  for(const t of ['procurement_sources','procurement_source_capabilities','procurement_request_sources']) {
   const result=await db.query(`select has_table_privilege('procurement_import_backend','public.${t}','INSERT') as ins,has_table_privilege('procurement_import_backend','public.${t}','UPDATE') as upd,has_table_privilege('procurement_import_backend','public.${t}','DELETE') as del,has_table_privilege('authenticated','public.${t}','INSERT') as client`);
   assert.deepEqual(result.rows[0],{ins:true,upd:true,del:false,client:false});
  }
 }finally{await db.close();}
});
test('discovery stops at ten pages without another fetch and preserves a truthful research packet',async()=>{
 let fetches=0,saved,artifact;
 const service=publicDiscovery({db:{},artifacts:{put:async p=>{artifact=p;return 'private';}},fetcher:()=>{fetches++;}});
 const c={stage:'discovery_capture',visited:Array(10).fill(url),queue:[url],run_ids:[],links:[],task_id:run,seed_source_id:source};
 await service.step({search_request_id:source},c,async state=>{saved=state;});
 assert.equal(saved,'blocked');assert.equal(fetches,0);assert.equal(artifact.lead_coverage,false);assert.equal(artifact.ai_calls,0);
});
test('discovery review/packet/resume HTTP actions require a session and preserve actor',async()=>{
 const actor='00000000-0000-4000-8000-000000000088';let recorded,kicks=0;
 const discovery=Object.assign(async()=>({}),{packet:async()=>({pages:[{review:'Public text'}]}),
   review:async(...args)=>{recorded=args;return {state:'pending'};},resume:async()=>({state:'pending'})});
 const server=workflowServer({authenticate:async()=>({id:actor}),discovery,kick:()=>{kicks++;}});
 async function call(path,headers={},input={}) {
  const req=Readable.from([JSON.stringify(input)]);Object.assign(req,{url:path,method:'POST',headers});
  return new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(body){resolve({status:this.status,data:JSON.parse(body)});}}));
 }
 const path=`/v1/requests/${source}/discover/review`;
 assert.equal((await call(path)).status,401);
 assert.equal((await call(path,{authorization:'Bearer session','content-type':'application/json'},{task_id:run})).status,202);
 assert.equal(recorded[2],actor);assert.equal(kicks,1);server.close();
});
