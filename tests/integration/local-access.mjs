// Real PostgreSQL + PostgREST/JWT integration. No production connection is used.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bin=process.env.ACCESS_TEST_PG_BIN || 'C:/Program Files/PostgreSQL/15/bin';
const gateway=process.env.ACCESS_TEST_POSTGREST_BIN || resolve('outputs/procurement-access/local-access-runtime/postgrest/postgrest.exe');
const exe=name=>join(bin,name+(process.platform==='win32'?'.exe':''));
for(const path of [exe('initdb'),exe('pg_ctl'),exe('psql'),gateway]) if(!existsSync(path)) throw Error('Missing local test runtime. See tests/integration/README.md; no production fallback is allowed.');
const freePort=()=>new Promise((accept,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>accept(port));});});
const dbPort=await freePort(),httpPort=await freePort();
const folder=mkdtempSync(join(tmpdir(),'procurement-access-'));
const data=join(folder,'data'),secret=randomBytes(48).toString('hex');
const options={encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,maxBuffer:8*1024*1024};
const sql=statement=>execFileSync(exe('psql'),['-X','-q','-h','127.0.0.1','-p',String(dbPort),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{...options,input:statement});
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const token=(role,sub,expired=false)=>{
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,sub,exp:Math.floor(Date.now()/1000)+(expired?-3600:3600)});
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
};
const first=randomUUID(),second=randomUUID(),sourceId=randomUUID(),leadId=randomUUID();
let server,started=false;
const api=async(path,jwt,body,method=body?'POST':'GET')=>{
  const response=await fetch(`http://127.0.0.1:${httpPort}/${path}`,{method,headers:{'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null};
};
try {
  execFileSync(exe('initdb'),['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],options);
  // Detached PostgreSQL children must not inherit captured pipes on Windows.
  execFileSync(exe('pg_ctl'),['-D',data,'-l',join(folder,'postgres.log'),'-o',`-h 127.0.0.1 -p ${dbPort} -F`,'-w','-t','30','start'],{...options,stdio:'ignore',timeout:40000});
  started=true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create role authenticator login noinherit; grant anon,authenticated,service_role to authenticator;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claims'',true)::jsonb->>''sub'','''')::uuid';
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for(const path of ['supabase/baselines/20260930_public_procurement.sql','supabase/migrations/20260930000100_authenticated_procurement_reads.sql','supabase/migrations/20260930000200_procurement_queue_pages.sql','supabase/migrations/20261001000100_queue_bounds_and_historical_dates.sql',
    'supabase/migrations/20261005000700_public_source_access_handoffs.sql','supabase/migrations/20261006000100_source_access_lifecycle.sql']) sql(readFileSync(path,'utf8'));
  const fixtures=JSON.parse(readFileSync('tests/fixtures/research/mapping.json','utf8'));
  const source=fixtures.procurement_sources[0],payload=fixtures.procurement_leads[1].payload;
  sql(`insert into auth.users values('${first}'),('${second}'); insert into procurement_members(user_id) values('${second}');
    insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level)
      select '${sourceId}',code,name,url,business_category,contracting_entity_geo_level from jsonb_populate_record(null::procurement_sources,${literal(source)});
    insert into procurement_leads(id,source_id,external_id,payload) values('${leadId}','${sourceId}','isolated-primary',${literal(payload)});
    insert into procurement_leads(source_id,external_id,payload) select '${sourceId}','isolated-'||n,${literal(payload)} from generate_series(1,1004) n;`);
  const config=join(folder,'postgrest.conf');
  writeFileSync(config,`db-uri = "postgresql://authenticator@127.0.0.1:${dbPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "127.0.0.1"\nserver-port = ${httpPort}\njwt-secret = "${secret}"\n`);
  server=spawn(gateway,[config],{windowsHide:true,stdio:'ignore',env:{...process.env,PATH:bin+';'+process.env.PATH}});
  let ready=false;
  for(let attempt=0;attempt<50;attempt++) {try{const r=await api('procurement_leads?select=id&limit=1');if([401,403].includes(r.status)){ready=true;break;}}catch{/* Startup only. */}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Local PostgREST did not become ready');
  const nonMember=token('authenticated',first),member=token('authenticated',second);
  for(const table of ['procurement_leads','procurement_sources','procurement_versions','procurement_events','procurement_registrations','spin_contract_opportunities']) assert.ok([401,403].includes((await api(`${table}?select=*&limit=1`)).status),`Anonymous ${table} read denied`);
  for(const jwt of ['invalid-token',token('authenticated',first,true)]) assert.equal((await api('procurement_leads?select=id&limit=1',jwt)).status,401,'Invalid/expired JWT rejected by real HTTP gateway');
  for(const jwt of [nonMember,member]) assert.equal((await api(`procurement_leads?id=eq.${leadId}&select=id`,jwt)).body[0].id,leadId);
  for(const jwt of [undefined,nonMember,member]) {
    assert.ok([401,403].includes((await api('procurement_access_handoffs?select=id',jwt)).status),'Private lifecycle is not readable by browser roles');
    assert.ok([401,403].includes((await api('rpc/record_procurement_access_event',jwt,{
      p_handoff_id:randomUUID(),p_expected_revision:0,p_expected_updated_at:new Date().toISOString(),p_event_id:'denied',p_input_hash:'a'.repeat(64),p_lifecycle:{}})).status),'Browser cannot execute lifecycle transition');
  }
  assert.equal((await api('procurement_access_handoffs?select=id',token('service_role'))).status,200,'Trusted server can resume private lifecycle');
  assert.equal((await api('rpc/update_procurement_lead_stage',nonMember,{p_lead_id:leadId,p_new_stage:'interested',p_reason_code:null,p_reason_note:null})).status,200);
  assert.equal((await api('rpc/bulk_update_procurement_lead_stage',member,{p_lead_ids:[leadId],p_new_stage:'applied',p_reason_code:null,p_reason_note:null})).status,200);
  assert.ok([401,403].includes((await api('rpc/update_procurement_lead_stage',undefined,{p_lead_id:leadId,p_new_stage:'won',p_reason_code:null,p_reason_note:null})).status));
  const history=await api(`procurement_lead_stage_changes?lead_id=eq.${leadId}`,nonMember);
  assert.equal(history.body.length,2);assert.deepEqual(new Set(history.body.map(r=>r.changed_by)),new Set([first,second]));
  const note=await api('rpc/create_lead_note',nonMember,{p_lead_id:leadId,p_body:'Isolated author note'});assert.equal(note.status,200);
  const denied=await api('rpc/edit_lead_note',member,{p_note_id:note.body.id,p_new_body:'Wrong author'});assert.ok(denied.status>=400);
  assert.equal((await api('rpc/edit_lead_note',nonMember,{p_note_id:note.body.id,p_new_body:'Author update'})).status,200);
  const page=await api('rpc/procurement_queue_page',nonMember,{p_filters:{status:'open',query:'SSC'},p_limit:50,p_offset:1000});
  assert.equal(page.status,200);assert.equal(page.body.total,1005);assert.equal(page.body.rows.length,5);
  assert.equal(page.body.rows[0].payload.manual_capture,undefined);
  assert.ok([401,403].includes((await api('rpc/procurement_queue_page',undefined,{})).status));
  assert.equal((await api(`procurement_leads?id=eq.${leadId}&select=id`,token('service_role'))).status,200);
  const intakeBody={p_source_id:sourceId,p_external_id:'isolated-server-intake',p_payload:payload,p_review_reason:'Isolated server-ingestion regression'};
  assert.ok((await api('rpc/ingest_procurement_intake',nonMember,intakeBody)).status>=400,'Browser role cannot import');
  assert.equal((await api('rpc/ingest_procurement_intake',token('service_role'),intakeBody)).status,200,'Authorized server ingestion remains available');
  console.log(JSON.stringify({status:'passed',engine:'PostgreSQL 15 + PostgREST',checks:['anonymous reads/RPC denial','member and non-member reads/stages','signed expired and invalid JWT HTTP rejection','note ownership','atomic actor history','1005-row paged queue','service workflow access'],production_contacted:false},null,2));
} finally {
  if(server && server.exitCode===null && server.signalCode===null) {server.kill();await new Promise(r=>server.once('exit',r));}
  if(started) execFileSync(exe('pg_ctl'),['-D',data,'-m','fast','-w','stop'],options);
  // Retain the disposable directory for diagnostic evidence; never remove another cluster.
}
