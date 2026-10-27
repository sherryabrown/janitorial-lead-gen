import {verifyScheduleActivity} from '../helpers/schedule-activity-db.mjs';
import {verifyScheduleAudit} from '../helpers/schedule-audit-db.mjs';
import {verifyReleaseRoles} from '../helpers/release-roles-db.mjs';
// Real PostgreSQL + PostgREST/JWT integration. No production connection is used.
import assert from 'node:assert/strict';
import { adminMigrations } from '../helpers/admin-trigger-db.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, openSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHmac, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { procurementSchedules } from '../../scripts/lib/procurement-schedules.mjs';
import { countyTriggers } from '../../scripts/lib/county-triggers.mjs';
import { workflowAudit } from '../../scripts/lib/workflow-audit.mjs';
import { hostedWorkflow } from '../../scripts/lib/hosted-workflow.mjs';
import { workflowServer } from '../../scripts/lib/workflow-http.mjs';
import pg from 'pg';
import {importJobs} from '../../scripts/lib/hosted-import-jobs.mjs';
import {postgresTransport} from '../../scripts/lib/hosted-import.mjs';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';
import {statewideSam} from '../../scripts/lib/hosted-sam.mjs';
import {verifyAutomaticCounty} from './automatic-county.mjs';
import {verifyAnalyticsDatabase} from '../helpers/analytics-db.mjs';

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
let server,backend,started=false;
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
    'supabase/migrations/20261005000700_public_source_access_handoffs.sql','supabase/migrations/20261006000100_source_access_lifecycle.sql','supabase/migrations/20261007000500_api_record_link_state.sql']) sql(readFileSync(path,'utf8'));
  sql('create schema storage; create table storage.buckets(id text primary key,name text,public boolean);');
  for(const name of adminMigrations)sql(readFileSync('supabase/migrations/'+name,'utf8'));
  sql(readFileSync('supabase/migrations/20261020000100_forecast_quarter_queue.sql','utf8'));
  sql(readFileSync('supabase/migrations/20261023000100_canonical_county_lead_reads.sql','utf8'));
  const fixtures=JSON.parse(readFileSync('tests/fixtures/research/mapping.json','utf8'));
  const source=fixtures.procurement_sources[0],payload=fixtures.procurement_leads[1].payload;
  sql(`insert into auth.users values('${first}'),('${second}'); insert into procurement_members(user_id) values('${second}');
    insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level)
      select '${sourceId}',code,name,url,business_category,contracting_entity_geo_level from jsonb_populate_record(null::procurement_sources,${literal(source)});
    insert into procurement_leads(id,source_id,external_id,payload) values('${leadId}','${sourceId}','isolated-primary',${literal(payload)});
    insert into procurement_leads(source_id,external_id,payload) select '${sourceId}','isolated-'||n,${literal(payload)} from generate_series(1,1004) n;`);
  const config=join(folder,'postgrest.conf');
  writeFileSync(config,`db-uri = "postgresql://authenticator@127.0.0.1:${dbPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "127.0.0.1"\nserver-port = ${httpPort}\njwt-secret = "${secret}"\n`);
  server=spawn(gateway,[config,'+RTS','-N1','-RTS'],{windowsHide:true,stdio:['ignore',openSync(join(folder,'postgrest.log'),'a'),openSync(join(folder,'postgrest.log'),'a')],env:{...process.env,PATH:bin+';'+process.env.PATH}});
  let ready=false,lastStatus=null;
  for(let attempt=0;attempt<150;attempt++) {try{const r=await api('procurement_leads?select=id&limit=1');lastStatus=r.status;if([401,403].includes(r.status)){ready=true;break;}}catch{/* Startup only. */}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,`Local PostgREST did not become ready (last HTTP ${lastStatus}, exit ${server.exitCode}); diagnostics: ${join(folder,'postgrest.log')}`);
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
  // New Admin persistence stays server-only, while any authenticated user can use the HTTP management layer.
  const serverToken=token('service_role');
  for(const table of ['procurement_triggers','procurement_trigger_requests','procurement_county_state_research','procurement_state_trigger_associations','procurement_workflow_steps','procurement_schedules','procurement_schedule_overview','procurement_schedule_deletion','procurement_schedule_occurrences','procurement_schedule_events','procurement_scheduler_settings','procurement_scheduler_deliveries']) {
    for(const jwt of [undefined,nonMember,member])assert.ok([401,403].includes((await api(table+'?select=*&limit=1',jwt)).status),'Private Admin table denied');
    assert.equal((await api(table+'?select=id&limit=1',serverToken)).status,200);
  }
  const adminConfig={target_kind:'county_scope',counties:[{id:'05001',name:'Arkansas County',city_ids:[],cities:[],selection_token:'fixture'}],
    county_ids:['05001'],maintain_sources:true,check_updates:true,requested_categories:['opportunity'],search_windows:{opportunity:{from:'2026-10-13',to:'2027-10-13',date_basis:'deadline'}}};
  sql("insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values('05','state','Arkansas','fixture','1','state'),('05001','county','Arkansas County','fixture','1','county');");
  assert.ok([401,403].includes((await api('rpc/procurement_state_trigger_status',nonMember,{})).status),'State-target summary is server-only');
  for(const fn of ['procurement_scheduler_status','procurement_scheduler_dispatch']) {
    for(const jwt of [undefined,nonMember,member])assert.ok([401,403].includes((await api('rpc/'+fn,jwt,{})).status),'Private scheduler RPC denied');
    assert.equal((await api('rpc/'+fn,serverToken,{})).status,200);
  }
  const scheduleArgs={p_id:null,p_actor:first,p_key:'isolated-schedule-key',p_hash:'b'.repeat(64),p_expected_version:null,p_now:'2026-10-13T13:00:00Z',
    p_input:{name:'Isolated schedule',config:adminConfig,scope_hash:'fixture',window_policy:{opportunity:{from_offset_days:0,to_offset_days:365,date_basis:'deadline'}},
      recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00']},enabled:true,next_due_at:'2026-10-13T14:00:00Z'}};
  for(const jwt of [undefined,nonMember,member])assert.ok([401,403].includes((await api('rpc/save_procurement_schedule',jwt,scheduleArgs)).status),'Browser cannot save schedule through private RPC');
  const savedSchedule=await api('rpc/save_procurement_schedule',serverToken,scheduleArgs);assert.equal(savedSchedule.status,200);
  assert.equal((await api('rpc/save_procurement_schedule',serverToken,scheduleArgs)).body,savedSchedule.body);
  const submission={p_actor:first,p_key:'isolated-admin-key',p_hash:'a'.repeat(64),p_config:adminConfig};
  assert.ok([401,403].includes((await api('rpc/submit_procurement_trigger',nonMember,submission)).status));
  const admin=await api('rpc/submit_procurement_trigger',serverToken,submission);assert.equal(admin.status,200);
  assert.equal((await api('rpc/submit_procurement_trigger',serverToken,submission)).body,admin.body);
  const children=(await api('procurement_trigger_requests?trigger_id=eq.'+admin.body+'&select=request_id',serverToken)).body;
  assert.equal(children.length,2);
  const stepIds=[];
  for(const child of children) {const r=await api('rpc/begin_procurement_step',serverToken,{p_input:{trigger_id:admin.body,request_id:child.request_id,phase:'ai_interpretation',attempt_key:randomUUID(),actor_id:first,origin:'manual'}});assert.equal(r.status,200);stepIds.push(r.body);}
  const reserve=(index)=>api('rpc/reserve_procurement_usage',serverToken,{p_monthly_usd:10,p_entry:{id:randomUUID(),request_id:children[index].request_id,step_id:stepIds[index],actor_id:first,kind:'inference',provider:'fixture',model:'fixture',rate_version:'fixture',input_tokens:100,output_tokens:100,reserved_usd:0.1}});
  const concurrent=await Promise.all([reserve(0),reserve(1)]);assert.equal(concurrent.filter(r=>r.status===200).length,1,'Shared parent budget serializes concurrent children');
  assert.equal(concurrent.filter(r=>r.status>=400).length,1,'Unknown earlier outcome blocks second child');
  assert.ok((await api('rpc/control_procurement_trigger',serverToken,{p_id:admin.body,p_actor:first,p_action:'resume'})).status>=400,'Reconcile held usage before resume');
  sql("update procurement_usage_ledger set state='completed',actual_usd=0,usage='{\"input_tokens\":100,\"output_tokens\":10}' where trigger_id='"+admin.body+"';");
  for(let n=0;n<3;n++){assert.equal((await reserve(n%2)).status,200);sql("update procurement_usage_ledger set state='completed',actual_usd=0,usage='{\"input_tokens\":100,\"output_tokens\":10}' where trigger_id='"+admin.body+"';");}
  assert.ok((await reserve(1)).status>=400,'Four calls apply across all children');
  // No app/browser involved: private HTTP wake queues a persisted occurrence and
  // executes a real shared planning stage against this isolated PostgREST database.
  sql("update procurement_jobs set state='cancelled'; update procurement_triggers set state='completed';");
  const db=createClient(`http://127.0.0.1:${httpPort}`,serverToken,{auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:(url,options)=>fetch(String(url).replace('/rest/v1/','/'),options)}});
  let samWorker,automaticImports;
  const audit=workflowAudit(db),workflow=hostedWorkflow({db,audit,aiConfig:{enabled:false},processJob:(job,c,save)=>c.stage.startsWith('import_')?automaticImports.step(job,c,save):samWorker.step(job,c,save),reportError:(_id,error)=>console.error("Isolated workflow failure:",error.privateDiagnostic?.message??error.message)});
  const triggers=countyTriggers({db,audit,workflow,discovery:async()=>({state:'blocked'})});
  const schedules=procurementSchedules({db,triggers,now:()=>new Date('2026-10-13T14:00:00Z')});
  // Server-side preview uses the actual registry; bind its current revision.
  const input={name:'Browser closed',enabled:true,config:{...adminConfig,county_ids:['05001']},
    recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00']},window_policy:{opportunity:{from_offset_days:0,to_offset_days:365,date_basis:'deadline'}}};
  const preview=await schedules.preview(input);
  sql("update procurement_schedules set config="+literal(preview.config)+",scope_hash='"+preview.scope_hash+"' where id='"+savedSchedule.body+"';");
  const wakeKey=randomBytes(32).toString('hex');let work;
  backend=workflowServer({schedules,authenticate:async jwt=>jwt===nonMember?{id:first}:null,samStatus:id=>samWorker.status(id),schedulerKey:wakeKey,kick:()=>{work=workflow.step();}});
  await new Promise(r=>backend.listen(0,'127.0.0.1',r));
  const wake=()=>fetch(`http://127.0.0.1:${backend.address().port}/internal/procurement-scheduler/tick`,{method:'POST',headers:{'Content-Type':'application/json','x-procurement-scheduler-key':wakeKey},body:'{}'});
  const wakeStarted=Date.now();
  assert.equal((await wake()).status,202);assert.equal(await work,true);
  const isolatedWakeAndStageMs=Date.now()-wakeStarted;
  const occurrences=await schedules.occurrences(savedSchedule.body);assert.equal(occurrences.items.length,1);
  const steps=await triggers.steps(occurrences.items[0].trigger_id,{limit:50});assert.ok(steps.items.some(s=>s.state==='completed'));
  assert.ok(steps.items.every(s=>s.usage.ai==='not_used'));
  assert.equal((await wake()).status,202);await work;assert.equal((await schedules.occurrences(savedSchedule.body)).items.length,1);
  await schedules.control(savedSchedule.body,'pause',{expected_version:1},first);
  assert.equal(await workflow.step(),false,'Pause stops queued automatic continuations');
  await schedules.control(savedSchedule.body,'archive',{expected_version:2},first);
  const adminRead=path=>fetch(`http://127.0.0.1:${backend.address().port}${path}`,{headers:{Authorization:`Bearer ${nonMember}`}});
  const overviewResponse=await adminRead('/v1/schedules?lifecycle=archived&sort=last_run_at&direction=desc&limit=1');
  assert.equal(overviewResponse.status,200);const overview=await overviewResponse.json();
  assert.equal(overview.items[0].id,savedSchedule.body);assert.ok(overview.total>=1);
  assert.equal(overview.items[0].reporting.last_run.id,occurrences.items[0].trigger_id);
  assert.equal(overview.items[0].reporting.last_run.usage.ai,'not_used');
  assert.equal((await adminRead('/v1/schedules?sort=unsafe')).status,422);
  const globalHistoryResponse=await adminRead(`/v1/admin/history?schedule=${savedSchedule.body}&origin=scheduled&limit=1`);
  assert.equal(globalHistoryResponse.status,200);const globalHistory=await globalHistoryResponse.json();
  assert.equal(globalHistory.items[0].id,occurrences.items[0].trigger_id);assert.ok(globalHistory.total>=1);assert.ok(globalHistory.items[0].timing);
  assert.equal(globalHistory.items[0].checkpoint,undefined);assert.equal(globalHistory.items[0].lease_token,undefined);
  const safeRun=await triggers.status(occurrences.items[0].trigger_id);assert.equal(safeRun.reporting.checkpoint,undefined);assert.equal(safeRun.reporting.lease_token,undefined);
  assert.equal((await adminRead('/v1/admin/history?origin=unsafe')).status,422);
  // Two HTTP/private-RPC callers cannot reserve the same paused county/work key.
  const reservationInput={...input,name:'Native work reservation',enabled:false};
  const rp=await schedules.preview(reservationInput);
  const claim=key=>schedules.save(null,{...reservationInput,confirmed_scope:true,preview_hash:rp.preview_hash},first,key);
  const claims=await Promise.allSettled([claim('native-work-first'),claim('native-work-second')]);
  assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);
  const reserved=claims.find(c=>c.status==='fulfilled').value;
  const conflicts=await schedules.preview(reservationInput);assert.equal(conflicts.conflicts[0].schedule_id,reserved.id);
  await schedules.control(reserved.id,'archive',{expected_version:1},first);
  for(const table of ['procurement_schedule_work_reservations','procurement_schedule_state_memberships'])
   for(const jwt of [undefined,nonMember,member])assert.ok([401,403].includes((await api(table+'?select=*&limit=1',jwt)).status));
  // Grouped state dispatch uses the actual native SQL and PostgREST contracts.
  const groupActor=randomUUID();sql("insert into auth.users(id) values('"+groupActor+"');");
  const stateAssociations=[];
  for(const suffix of ['a','b']){
   const source=randomUUID();
   const inserted=await db.from('procurement_sources').insert({id:source,code:'native-state-'+suffix,name:'Native state '+suffix,url:'https://example.gov/'+suffix,contracting_entity_geo_level:'state',business_category:'other_public'});assert.equal(inserted.error,null);
   const association=await db.rpc('associate_procurement_state_trigger',{p_source:source,p_category:'opportunity',p_scope:'native-group',p_county:'05001',p_evidence:{basis:'fixture'}});assert.equal(association.error,null);stateAssociations.push(association.data);
  }
  const groupInput={...input,name:'Native grouped state sources',config:{...input.config,target_kind:'state_source',state_trigger_ids:stateAssociations}};
  const gp=await schedules.preview(groupInput),group=await schedules.save(null,{...groupInput,confirmed_scope:true,preview_hash:gp.preview_hash},groupActor,'native-group-schedule');
  const gr=await schedules.runNow(group.id,{expected_version:1},groupActor,'native-group-run');assert.equal(gr.state,'queued');
  const groupStatus=await triggers.status(gr.trigger_id);assert.equal(groupStatus.children.length,2);assert.equal(new Set(groupStatus.children.map(c=>c.source_id)).size,2);
  assert.equal((await schedules.runNow(group.id,{expected_version:1},groupActor,'native-group-run')).id,gr.id);
  assert.ok((await triggers.stateSources()).items.every(s=>s.schedule_id===group.id));
  await schedules.control(group.id,'archive',{expected_version:1},first);
  assert.ok((await triggers.stateSources()).items.every(s=>s.schedule_id===null));
  sql("update procurement_jobs set state='cancelled' where search_request_id in(select request_id from procurement_trigger_requests where trigger_id='"+gr.trigger_id+"');update procurement_triggers set state='completed' where id='"+gr.trigger_id+"';");
  // Never-run deletion is serialized against the same row lock used by enqueue.
  const neverInput={...input,name:'Disposable never-run',enabled:false};
  const neverPreview=await schedules.preview(neverInput);
  const never=await schedules.save(null,{...neverInput,preview_hash:neverPreview.preview_hash,confirmed_scope:true},first,'native-delete-test');
  const lockClient=new pg.Client({host:'127.0.0.1',port:dbPort,user:'postgres',database:'postgres'});
  const enqueueClient=new pg.Client({host:'127.0.0.1',port:dbPort,user:'postgres',database:'postgres'});
  await lockClient.connect();await enqueueClient.connect();
  try{
   await lockClient.query('begin');
   await lockClient.query('select delete_procurement_schedule($1,$2,1,$3)',[never.id,first,'2026-10-13T14:00:00Z']);
   let enqueueSettled=false;
   const attempted=enqueueClient.query("select enqueue_procurement_schedule($1,1,'manual',$2,'native-delete-race',$3,$3,null,$3,$4,'hash',null) as result",[never.id,first,'2026-10-13T14:00:00Z',neverPreview.config]).then(r=>{enqueueSettled=true;return r;});
   await new Promise(r=>setTimeout(r,100));assert.equal(enqueueSettled,false,'Enqueue waits for deletion row lock');
   await lockClient.query('commit');assert.equal((await attempted).rows[0].result.state,'stale');
   assert.equal((await schedules.list()).items.some(s=>s.id===never.id),false);
   assert.ok((await schedules.events(never.id)).items.some(e=>e.action==='delete'));
   assert.equal((await api('rpc/delete_procurement_schedule',nonMember,{p_id:never.id,p_actor:first,p_version:1,p_now:'2026-10-13T14:00:00Z'})).status>=400,true);
   await assert.rejects(schedules.control(savedSchedule.body,'delete',{expected_version:2},first),'A schedule with a run cannot be deleted');
  }finally{await lockClient.end();await enqueueClient.end();}

  assert.equal((await fetch(`http://127.0.0.1:${backend.address().port}/v1/admin/history`)).status,401);
  const historyResponse=await adminRead(`/v1/schedules/${savedSchedule.body}/occurrences`);
  assert.equal(historyResponse.status,200);assert.equal((await historyResponse.json()).items[0].trigger_id,occurrences.items[0].trigger_id);
  const eventsResponse=await adminRead(`/v1/schedules/${savedSchedule.body}/events`);
  assert.equal(eventsResponse.status,200);assert.ok((await eventsResponse.json()).items.some(e=>e.action==='archive'));

  // Same private wake/worker, actual SQL captures and audit, fixture SAM response.
  // This proves isolated execution; it is not production/provider acceptance.
  const samSource=randomUUID(),artifactBytes=new Map();let samCalls=0,samRows=[];
  sql(`insert into procurement_sources(id,code,name,url,business_category)values('${samSource}','sam','SAM fixture','https://sam.gov','other_public');`);
  const artifacts={put:async value=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),path='artifacts/'+createHash('sha256').update(bytes).digest('hex');artifactBytes.set(path,bytes);return path;},get:async path=>artifactBytes.get(path)};
  const samFetcher=async(_url,options)=>{
    samCalls++;const input=JSON.parse(options.body),e=input.workflow_execution;
    const job=(await db.from('procurement_jobs').select('*').eq('id',e.job_id).single()).data;
    const detail={collector:'sam-search',kind:input.kind,filters:input.filters,workflow_attempt_id:e.attempt_id,
      query_url:'https://api.sam.gov/opportunities/v2/search',state:'response_captured',upstream_status:200,complete_for_query:true,response:{totalRecords:samRows.length,opportunitiesData:samRows}};
    const inserted=await db.from('procurement_runs').insert({source_id:samSource,job_id:job.id,page_index:e.page_index,page_attempt:job.attempts,
      started_at:new Date().toISOString(),status:'success',record_count:samRows.length,detail}).select('id').single();
    assert.equal(inserted.error,null);
    return new Response(JSON.stringify({run_id:inserted.data.id,captured:true,status:'success',record_count:samRows.length,...detail}),{status:200});
  };
  samWorker=statewideSam({db,project:'isolated',serverKey:()=> 'private-offline',artifacts,fetcher:samFetcher});
  const samInput={name:'Isolated SAM',enabled:true,config:{target_kind:'sam',requested_categories:['opportunity'],publication_window:{from:'2026-10-01',to:'2026-10-13'}},
    recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00']},window_policy:{opportunity:{lookback_days:30}}};
  const sp=await schedules.preview(samInput),ss=await schedules.save(null,{...samInput,confirmed_scope:true,preview_hash:sp.preview_hash},first,'isolated-sam-schedule');
  sql(`update procurement_schedules set next_due_at='2026-10-13T14:00:00Z' where id='${ss.id}';`);
  const samArgs={p_actor:first,p_key:'private-sam-check',p_hash:'c'.repeat(64),p_config:{...sp.config,sam_filters:{state:'AR'}}};
  for(const jwt of [undefined,nonMember,member])assert.ok([401,403].includes((await api('rpc/submit_procurement_trigger',jwt,samArgs)).status));
  assert.equal((await wake()).status,202);assert.equal(await work,true);assert.equal(samCalls,1);
  const so=(await schedules.occurrences(ss.id)).items;assert.equal(so.length,1);
  const samParent=await triggers.status(so[0].trigger_id);assert.equal(samParent.children[0].county_id,null);
  assert.equal(samParent.children[0].role,'sam');
  await schedules.control(ss.id,'pause',{expected_version:1},first);assert.equal(await workflow.step(),false);
  await schedules.control(ss.id,'resume',{expected_version:2},first);assert.equal(await workflow.step(),true);assert.equal(samCalls,1);
  assert.equal(await triggers.step(),true);assert.equal((await triggers.status(samParent.id)).state,'needs_review');
  const samSteps=await triggers.steps(samParent.id);assert.ok(samSteps.items.some(s=>s.phase==='fetch_api_page'));
  assert.ok(samSteps.items.every(s=>s.usage.ai==='not_used'));
  assert.equal((await wake()).status,202);await work;assert.equal(samCalls,1);assert.equal((await schedules.occurrences(ss.id)).items.length,1);
  await schedules.control(ss.id,'archive',{expected_version:3},first);
  await assert.rejects(samWorker.processSaved(samParent.children[0].request_id),/Paused or cancelled/);
  // The real shared SAM/import worker now validates and writes a nonempty capture
  // to the disposable canonical tables, with the actual isolated native rehearsal.
  sql("create role procurement_rehearsal_backend login;create schema procurement_test authorization procurement_rehearsal_backend;");
  for(const code of ['sam-awards','usaspending'])sql(`insert into procurement_sources(id,code,name,url,business_category)values('${randomUUID()}','${code}','${code}','https://sam.gov','other_public');`);
  const livePool=new pg.Pool({host:'127.0.0.1',port:dbPort,user:'postgres',database:'postgres',max:1});
  const rehearsalPool=new pg.Pool({host:'127.0.0.1',port:dbPort,user:'procurement_rehearsal_backend',database:'postgres',max:1});
  try {
    const project='zreplhkoxswtzxlchtjf';
    samWorker=statewideSam({db,project,serverKey:()=> 'private-offline',artifacts,fetcher:samFetcher,automaticImport:id=>automaticImports.prepareAutomatic(id),validateCollection:()=>automaticImports.assertAutomaticCollectable()});
    automaticImports=importJobs({db,project,transport:postgresTransport(livePool,project),artifacts,samSavedRuns:samWorker.savedRuns,rehearse:nativeRehearsal(rehearsalPool)});
    const fixture=JSON.parse(readFileSync('tests/fixtures/sam/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json','utf8')).response.opportunitiesData[0];
    const notice={...fixture,noticeId:'11111111111111111111111111111111',type:'Combined Synopsis/Solicitation',title:'Native automatic janitorial check',postedDate:'2026-10-13',responseDeadLine:'2030-11-04T10:00:00-06:00',naicsCode:'561720',placeOfPerformance:{state:{code:'AR'}}};
    samRows=[notice,{...structuredClone(notice),noticeId:'22222222222222222222222222222222',placeOfPerformance:{state:{code:'TX'}}}];
    const mp=await triggers.preview(sp.config);
    const manual=await triggers.submit({...mp.config,confirmed_scope:true,preview_hash:mp.preview_hash},first,'automatic-manual-sam');
    const drain=async()=>{for(let n=0;n<35;n++){const worked=await workflow.step(),parent=await triggers.step();if(!worked&&!parent)break;}};
    await drain();
    let leads=(await db.from('procurement_leads').select('*').eq('source_id',samSource)).data;
    assert.equal(leads.length,1,JSON.stringify((await db.from('procurement_jobs').select('state,checkpoint').eq('search_request_id',(await triggers.status(manual.trigger_id)).children[0].request_id)).data));assert.equal(leads[0].payload.title,notice.title);
    assert.equal((await triggers.status(manual.trigger_id)).state,'partial');
    const child=(await triggers.status(manual.trigger_id)).children[0];
    const packet=await samWorker.packet(child.request_id);assert.equal(packet.automatic.verified,true);assert.equal(packet.automatic.added,1);assert.equal(packet.automatic.exclusions.length,1);
    const imported=(await livePool.query("select id,checkpoint from procurement_jobs where search_request_id=$1 and checkpoint->>'stage'='import_verified'",[child.request_id])).rows[0];
    assert.equal(imported.checkpoint.reporting_records.version,1);assert.equal(imported.checkpoint.reporting_records.records[0].outcome,'added');
    await livePool.query("update procurement_jobs set state='outcome_unknown',checkpoint=$2 where id=$1",[imported.id,{...imported.checkpoint,stage:'import_reconcile'}]);
    await automaticImports.reconcile(imported.id,{},first);
    assert.deepEqual((await livePool.query('select checkpoint from procurement_jobs where id=$1',[imported.id])).rows[0].checkpoint.reporting_records,imported.checkpoint.reporting_records,'SAM reconciliation records identical verified identities without replaying SQL');
    assert.equal(packet.automatic.stage,'import_verified');
    const statusResponse=await adminRead(`/v1/sam/requests/${child.request_id}/status`);
    assert.equal(statusResponse.status,200);const savedStatus=await statusResponse.json();
    assert.equal(savedStatus.automatic.added,1);assert.equal(savedStatus.automatic.verified,true);assert.equal(savedStatus.evidence_key,packet.evidence_key);assert.equal(savedStatus.candidates,undefined);

    const repeat=await triggers.submit({...mp.config,confirmed_scope:true,preview_hash:mp.preview_hash},first,'automatic-manual-sam');assert.equal(repeat.trigger_id,manual.trigger_id);
    // A scheduled capture of the same canonical notice must update/link rather than duplicate.
    samRows=[notice];const preview=await schedules.preview({...samInput,name:'Automatic scheduled SAM'});
    const schedule=await schedules.save(null,{...samInput,name:'Automatic scheduled SAM',confirmed_scope:true,preview_hash:preview.preview_hash},first,'automatic-scheduled-sam');
    sql(`update procurement_schedules set next_due_at='2026-10-13T14:00:00Z' where id='${schedule.id}';`);
    await schedules.tick();await drain();
    const occurrence=(await schedules.occurrences(schedule.id)).items[0];assert.ok(occurrence.trigger_id);
    assert.equal((await triggers.status(occurrence.trigger_id)).state,'completed');
    leads=(await db.from('procurement_leads').select('*').eq('source_id',samSource)).data;assert.equal(leads.length,1);
    const scheduleChild=(await triggers.status(occurrence.trigger_id)).children[0];
    const scheduledPacket=await samWorker.packet(scheduleChild.request_id);assert.equal(scheduledPacket.automatic.verified,true);assert.equal(scheduledPacket.automatic.added,0);
    await schedules.control(schedule.id,'archive',{expected_version:1},first);
    // The public Bonfire continuation uses existing private checkpoints, not a new table.
    // Exercise the actual JSON containment and compare-and-swap HTTP filters.
    const holdJob=randomUUID(),hold={source_id:samSource,method_hash:'a'.repeat(64)};
    const checkpoint={stage:'interpret',bonfire_access_holds:[hold]};
    const held=await db.from('procurement_jobs').insert({id:holdJob,search_request_id:child.request_id,
      dedupe_key:`api-workflow:hold-fixture:${holdJob}`,kind:'process',state:'blocked',checkpoint});
    assert.equal(held.error,null);
    const matching=await db.from('procurement_jobs').select('id').eq('kind','process')
      .contains('checkpoint',{bonfire_access_holds:[hold]}).neq('id',randomUUID()).limit(1);
    assert.equal(matching.error,null);assert.equal(matching.data[0].id,holdJob);
    const reconcile=()=>db.from('procurement_jobs').update({checkpoint:{...checkpoint,bonfire_access_holds:[]},state:'pending'})
      .eq('id',holdJob).eq('state','blocked').eq('checkpoint',JSON.stringify(checkpoint)).select('id');
    const reconciled=await reconcile();assert.equal(reconciled.error,null);assert.equal(reconciled.data.length,1);
    const stale=await reconcile();assert.equal(stale.error,null);assert.equal(stale.data.length,0,'Stale reconciliation cannot overwrite a changed checkpoint');
    sql("update procurement_jobs set state='cancelled'; update procurement_triggers set state='completed';");
    console.log('Automatic county acceptance:',await verifyAutomaticCounty({db,artifacts,audit,livePool,rehearsalPool,actor:first,config:adminConfig}));
    console.log('Schedule audit native acceptance:',await verifyScheduleAudit(livePool));
    console.log('Analytics native acceptance:',await verifyAnalyticsDatabase({sql:livePool,db}));
    console.log('Schedule activity native acceptance:',await verifyScheduleActivity({sql:livePool,db,triggers}));
    console.log('Release roles native acceptance:',await verifyReleaseRoles({pool:livePool,db,api,first,second,userToken:nonMember,adminToken:member}));
  }finally {await livePool.end();await rehearsalPool.end();}
  console.log(JSON.stringify({status:'passed',engine:'PostgreSQL 15 + PostgREST',checks:['anonymous reads/RPC denial','member and non-member reads/stages','signed expired and invalid JWT HTTP rejection','note ownership','atomic actor history','1005-row paged queue','service workflow access','Admin private table/RPC denial','Admin atomic replay','concurrent parent AI reservations and four-call cap','scheduling private tables/RPC denial and atomic replay','concurrent active/paused county-work ownership and archive release','grouped state native dispatch/replay/membership/source identities','browser-independent private HTTP wake/shared worker/audit/replay/pause','nonempty automatic SAM manual/scheduled native validation/write/readback/deduplication','private detail hold containment and checkpoint CAS/stale-write rejection'],isolated_wake_and_stage_ms:isolatedWakeAndStageMs,production_contacted:false},null,2));
} finally {
  if(backend)await new Promise(r=>backend.close(r));
  if(server && server.exitCode===null && server.signalCode===null) {server.kill();await new Promise(r=>server.once('exit',r));}
  if(started) execFileSync(exe('pg_ctl'),['-D',data,'-m','fast','-w','stop'],options);
  // Retain the disposable directory for diagnostic evidence; never remove another cluster.
}
