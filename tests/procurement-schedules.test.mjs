import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { procurementSchedules } from '../scripts/lib/procurement-schedules.mjs';
import { countyTriggers } from '../scripts/lib/county-triggers.mjs';
import { workflowAudit } from '../scripts/lib/workflow-audit.mjs';
import { workflowServer } from '../scripts/lib/workflow-http.mjs';
import { adminDatabase,sqlApi } from './helpers/admin-trigger-db.mjs';
import { id } from './helpers/known-workflow.mjs';
const actor=id(1),key='schedule-key-one';
const input={name:'County checks',enabled:true,recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00','16:00']},
  config:{target_kind:'county_scope',county_ids:['05001'],maintain_sources:true,check_updates:true,requested_categories:['opportunity']},
  window_policy:{opportunity:{from_offset_days:0,to_offset_days:365,date_basis:'deadline'}}};
async function fixture() {
  const sql=await adminDatabase();
  await sql.exec(`alter table auth.users add column banned_until timestamptz;
    insert into auth.users(id)values('${actor}');
    insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values
    ('05','state','Arkansas','fixture','1','state'),('05001','county','Arkansas County','fixture','1','county');`);
  const db=sqlApi(sql),audit=workflowAudit(db),triggers=countyTriggers({db,audit,workflow:{},discovery:async()=>({state:'blocked'})});
  let time=new Date('2026-10-13T13:00:00Z');
  const schedules=procurementSchedules({db,triggers,now:()=>time});
  const p=await schedules.preview(input),saved=await schedules.save(null,{...input,confirmed_scope:true,preview_hash:p.preview_hash},actor,key);
  return {sql,db,audit,triggers,schedules,saved,setTime:t=>{time=new Date(t);}};
}
test('save/replay, edits/CAS, manual Run now and management audit share the existing trigger path',async()=>{
  const f=await fixture();try {
    const p=await f.schedules.preview(input);
    assert.equal((await f.schedules.save(null,{...input,confirmed_scope:true,preview_hash:p.preview_hash},actor,key)).id,f.saved.id);
    const first=await f.schedules.runNow(f.saved.id,{expected_version:1},actor,'run-now-key-one');
    const replay=await f.schedules.runNow(f.saved.id,{expected_version:1},actor,'run-now-key-one');assert.equal(first.id,replay.id);
    assert.equal((await f.schedules.get(f.saved.id)).next_due_at,f.saved.next_due_at);
    assert.equal((await f.sql.query('select origin from procurement_triggers where id=$1',[first.trigger_id])).rows[0].origin,'manual');
    const edited={...input,name:'Changed name',enabled:false};const preview=await f.schedules.preview(edited);
    const result=await f.schedules.save(f.saved.id,{...edited,confirmed_scope:true,preview_hash:preview.preview_hash,expected_version:1},actor,null);
    assert.equal(result.version,2);assert.equal(result.enabled,false);
    await assert.rejects(f.schedules.save(f.saved.id,{...edited,confirmed_scope:true,preview_hash:preview.preview_hash,expected_version:1},actor,null),/Database operation failed/);
    await assert.rejects(f.schedules.runNow(f.saved.id,{expected_version:1},actor,'different-run-key'),/version changed/);
    assert.ok((await f.schedules.events(f.saved.id)).items.some(e=>e.action==='edited'));
  }finally{await f.sql.close();}
});
test('duplicate ticks queue one due occurrence, snapshot windows, retain scope and skip overlap',async()=>{
  const f=await fixture();try {
    f.setTime('2026-10-13T14:00:00Z');
    const results=await Promise.all([f.schedules.tick(),f.schedules.tick()]);assert.equal(results.reduce((n,r)=>n+r.queued,0),1);
    const rows=(await f.sql.query('select * from procurement_schedule_occurrences')).rows;assert.equal(rows.length,1);
    assert.equal(rows[0].config.search_windows.opportunity.from,'2026-10-13');
    const trigger=(await f.sql.query('select * from procurement_triggers')).rows[0];assert.equal(trigger.origin,'scheduled');assert.equal(trigger.schedule_id,f.saved.id);
    f.setTime('2026-10-13T21:00:00Z');await f.schedules.tick();
    const skipped=(await f.sql.query("select * from procurement_schedule_occurrences where state='skipped'")).rows[0];assert.equal(skipped.reason,'previous_run_active');
    assert.equal((await f.sql.query('select count(*)::int n from procurement_triggers')).rows[0].n,1);
    await f.sql.query("update procurement_triggers set state='completed'");
    f.setTime('2026-10-20T20:00:00Z');await f.schedules.tick();
    const latest=(await f.sql.query('select * from procurement_schedule_occurrences order by created_at desc')).rows[0];
    assert.equal(latest.state,'queued');assert.ok(latest.missed_from);assert.ok(latest.missed_through);
    assert.equal(latest.config.search_windows.opportunity.from,'2026-10-20');
    assert.equal((await f.schedules.get(f.saved.id)).next_due_at,'2026-10-20T21:00:00.000Z');
  }finally{await f.sql.close();}
});
test('pause prevents automatic claims/sends, resume restores eligibility, inactive owner disables future runs',async()=>{
  const f=await fixture();try {
    f.setTime('2026-10-13T14:00:00Z');await f.schedules.tick();
    const child=(await f.sql.query('select request_id from procurement_trigger_requests limit 1')).rows[0];
    const paused=await f.schedules.control(f.saved.id,'pause',{expected_version:1},actor);
    assert.equal((await f.sql.query('select claim_procurement_workflow_job() job')).rows[0].job,null);
    let sent=false;
    await assert.rejects(f.audit.run(child.request_id,'fetch_page',async()=>{sent=true;}),/paused/);assert.equal(sent,false);
    const resumed=await f.schedules.control(f.saved.id,'resume',{expected_version:paused.version},actor);assert.equal(resumed.enabled,true);
    assert.ok((await f.sql.query('select claim_procurement_workflow_job() job')).rows[0].job);
    await f.sql.exec("update auth.users set banned_until='3000-01-01'");f.setTime('2026-10-14T14:00:00Z');await f.schedules.tick();
    const inactive=await f.schedules.get(f.saved.id);assert.equal(inactive.enabled,false);assert.equal(inactive.blocker,'owner_inactive');
    for(const table of ['procurement_schedules','procurement_schedule_occurrences','procurement_schedule_events','procurement_scheduler_settings','procurement_scheduler_deliveries'])
      assert.equal((await f.sql.query("select has_table_privilege('authenticated',$1,'select') allowed",[table])).rows[0].allowed,false);
  }finally{await f.sql.close();}
});
test('stale geography disables an occurrence rather than silently expanding city scope',async()=>{
  const f=await fixture();try {
    await f.sql.exec(`insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values('ARM${'a'.repeat(32)}','municipality','New City','fixture','1','new');insert into procurement_place_counties values('ARM${'a'.repeat(32)}','05001');`);
    f.setTime('2026-10-13T14:00:00Z');await f.schedules.tick();
    const schedule=await f.schedules.get(f.saved.id);assert.equal(schedule.enabled,false);assert.equal(schedule.blocker,'scope_changed');
    assert.equal((await f.sql.query('select count(*)::int n from procurement_triggers')).rows[0].n,0);
  }finally{await f.sql.close();}
});
test('private wake accepts only the scheduler secret and never browser JWTs/origins',async()=>{
  let ticks=0,kicks=0;
  const secret='a'.repeat(64),server=workflowServer({authenticate:async()=>({id:actor}),schedulerKey:secret,schedules:{tick:async()=>{ticks++;return {queued:0};}},kick:()=>{kicks++;},allowedOrigins:['https://app.example']});
  const call=(headers={})=>new Promise(resolve=>{const req=Readable.from(['{}']);Object.assign(req,{url:'/internal/procurement-scheduler/tick',method:'POST',headers:{'content-type':'application/json',...headers}});server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(text){resolve({status:this.status,data:JSON.parse(text)});}});});
  assert.equal((await call()).status,401);assert.equal((await call({authorization:'Bearer valid-user'})).status,401);
  assert.equal((await call({'x-procurement-scheduler-key':'wrong'})).status,401);
  assert.equal((await call({'x-procurement-scheduler-key':secret,origin:'https://app.example'})).status,403);
  assert.equal((await call({'x-procurement-scheduler-key':secret})).status,202);assert.equal(ticks,1);assert.equal(kicks,1);server.close();
});

test('stale dispatch, deleted owner, archive history and unknown billing prevent unsafe replay',async()=>{
  const f=await fixture();try {
    const before=(await f.sql.query('select * from procurement_schedules')).rows[0];
    const paused=await f.schedules.control(f.saved.id,'pause',{expected_version:1},actor);
    const stale=await f.db.rpc('enqueue_procurement_schedule',{p_id:before.id,p_version:1,p_origin:'scheduled',p_actor:actor,p_key:'stale-key',p_due:'2026-10-13T14:00:00Z',p_effective:'2026-10-13T14:00:00Z',p_next:'2026-10-13T21:00:00Z',p_now:'2026-10-13T14:00:00Z',p_config:before.config,p_hash:'a'.repeat(64),p_blocker:null});
    assert.equal(stale.data.state,'stale');
    const manual=await f.schedules.runNow(before.id,{expected_version:paused.version},actor,'paused-manual-key');assert.equal(manual.state,'queued');
    await f.sql.query("update procurement_triggers set state='outcome_unknown' where id=$1",[manual.trigger_id]);
    const retry=await f.schedules.runNow(before.id,{expected_version:paused.version},actor,'unknown-manual-key');assert.equal(retry.reason,'previous_run_active');
    const archived=await f.schedules.control(before.id,'archive',{expected_version:paused.version},actor);assert.equal(archived.archived,true);
    assert.equal((await f.sql.query('select state from procurement_triggers where id=$1',[manual.trigger_id])).rows[0].state,'outcome_unknown');
    assert.equal((await f.schedules.occurrences(before.id)).items.length,2);
    const orphanInput={...input,name:'Owner deleted'};const p=await f.schedules.preview(orphanInput);
    const orphan=await f.schedules.save(null,{...orphanInput,confirmed_scope:true,preview_hash:p.preview_hash},actor,'orphan-owner-key');
    // Simulate Auth deletion's ON DELETE SET NULL while preserving older actor evidence.
    await f.sql.query('update procurement_schedules set owner_id=null where id=$1',[orphan.id]);
    f.setTime('2026-10-14T14:00:00Z');await f.schedules.tick();assert.equal((await f.schedules.get(orphan.id)).blocker,'owner_inactive');
  }finally{await f.sql.close();}
});

test('one independent state schedule serves associated counties; recurring counties never fan out state collection',async()=>{
  const f=await fixture();try {
    await f.sql.exec(`insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values('05003','county','Ashley County','fixture','1','county2');
      insert into procurement_sources(id,code,name,url,contracting_entity_geo_level,business_category)values('${id(21)}','state-fixture','State fixture','https://example.gov/bids','state','other_public');`);
    const args={p_source:id(21),p_category:'opportunity',p_scope:'state-scope',p_county:'05001',p_evidence:{basis:'registered_state_category'}};
    const a=await f.db.rpc('associate_procurement_state_trigger',args),b=await f.db.rpc('associate_procurement_state_trigger',{...args,p_county:'05003'});assert.equal(a.data,b.data);
    assert.equal((await f.triggers.stateSources()).items[0].schedule_id,null);
    const stateInput={...input,name:'State source',config:{...input.config,target_kind:'state_source',county_ids:['05001','05003'],state_trigger_id:a.data}};
    const p=await f.schedules.preview(stateInput),body={...stateInput,confirmed_scope:true,preview_hash:p.preview_hash};
    const saves=await Promise.allSettled([f.schedules.save(null,body,actor,'state-schedule-one'),f.schedules.save(null,body,actor,'state-schedule-two')]);
    assert.equal(saves.filter(s=>s.status==='fulfilled').length,1);
    f.setTime('2026-10-13T14:00:00Z');await f.schedules.tick();
    const state=(await f.sql.query("select * from procurement_triggers where target_kind='state_source'")).rows[0];
    assert.equal((await f.sql.query('select count(*)::int n from procurement_trigger_requests where trigger_id=$1',[state.id])).rows[0].n,1);
    assert.equal((await f.sql.query("select count(*)::int n from procurement_request_targets t join procurement_trigger_requests r on r.request_id=t.search_request_id where r.trigger_id=$1",[state.id])).rows[0].n,1);
    await f.sql.exec("update procurement_triggers set state='completed'");f.setTime('2026-10-13T21:00:00Z');await f.schedules.tick();
    assert.equal((await f.sql.query("select count(*)::int n from procurement_trigger_requests r join procurement_triggers t on t.id=r.trigger_id where t.target_kind='county_scope' and r.role='state_source'")).rows[0].n,0);
    assert.equal((await f.sql.query("select count(*)::int n from procurement_trigger_requests r join procurement_triggers t on t.id=r.trigger_id where t.target_kind='county_scope' and r.role='state_research'")).rows[0].n,1);
  }finally{await f.sql.close();}
});

test('durable dispatcher stays idle, records response loss and retries only pending work with fixed private destination',async()=>{
  const f=await fixture();try {
    await f.sql.exec(`create schema net;create schema vault;
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values('procurement_scheduler_wake_key',repeat('x',64));
      create table net._http_response(id bigint,status_code integer,timed_out boolean);
      create table net.sent(id bigserial primary key,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)returns bigint language sql as $$insert into net.sent(url,headers,body,timeout_milliseconds)values(url,headers,body,timeout_milliseconds)returning id$$;
      update procurement_scheduler_settings set enabled=true;
      update procurement_schedules set next_due_at=now()+interval '1 day';`);
    const dispatch=async()=>(await f.sql.query('select procurement_scheduler_dispatch() result')).rows[0].result;
    assert.equal((await dispatch()).state,'idle');
    await f.sql.exec("update procurement_schedules set next_due_at=now()-interval '1 minute'");
    assert.equal((await dispatch()).state,'sent');assert.equal((await dispatch()).state,'delivery_pending');
    const send=(await f.sql.query('select * from net.sent')).rows[0];assert.equal(send.url,'https://janitorial-procurement-backend.onrender.com/internal/procurement-scheduler/tick');assert.deepEqual(send.body,{});assert.equal(send.timeout_milliseconds,90000);
    await f.sql.exec("update procurement_scheduler_deliveries set sent_at=now()-interval '4 minutes'");assert.equal((await dispatch()).state,'sent');
    assert.equal((await f.sql.query("select count(*)::int n from procurement_scheduler_deliveries where state='outcome_unknown'")).rows[0].n,1);
    await f.sql.exec('insert into net._http_response values(2,202,false)');await dispatch();
    assert.equal((await f.sql.query('select state from procurement_scheduler_deliveries where net_request_id=2')).rows[0].state,'accepted');
    await f.sql.exec('update procurement_scheduler_settings set enabled=false');assert.equal((await dispatch()).state,'disabled');
  }finally{await f.sql.close();}
});

test('comparable baseline keeps latest confirmed evidence and excludes mismatched parser/window observations',async()=>{
  const f=await fixture();try {
    await f.sql.exec(`insert into procurement_sources(id,code,name,url,contracting_entity_geo_level,business_category)values('${id(30)}','county-fixture','County fixture','https://example.gov/bids','county','other_public');
      insert into procurement_source_capabilities(id,source_id,kind,method,endpoint_url,official_entry_url,agency_geography_id,route_geography_id,parser_version)values('${id(31)}','${id(30)}','opportunity','browser','https://example.gov/bids','https://example.gov/bids','05001','05001','fixture-v1');
      insert into procurement_jobs(id,capability_id,dedupe_key,kind,state)values('${id(32)}','${id(31)}','baseline-fixture','collect','succeeded');`);
    const manual=await f.schedules.runNow(f.saved.id,{expected_version:1},actor,'baseline-manual-key');
    await f.sql.exec(`insert into procurement_coverage_tasks(id,target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,capability_id,source_id)
      select '${id(37)}',t.id,'baseline-task','county','05001','opportunity',1,'fixture','${id(31)}','${id(30)}' from procurement_request_targets t
      join procurement_search_requests r on r.id=t.search_request_id where r.workflow_control->>'admin_policy'='county_scope' limit 1;
      update procurement_triggers set state='completed' where id='${manual.trigger_id}';`);
    const window={from:'2026-10-13',to:'2027-10-13',date_basis:'deadline'};
    for(const [n,parser,query] of [[33,'fixture-v1',window],[34,'fixture-v1',window],[35,'other-parser',window],[36,'fixture-v1',{...window,from:'2026-10-14'}]])
      await f.sql.query("insert into procurement_runs(id,source_id,job_id,coverage_task_id,page_index,started_at,finished_at,status,detail)values($1,$2,$3,$6,$7,'2026-10-12', $4,'review_required',$5)",[id(n),id(30),id(32),`2026-10-12T${n-25}:00:00Z`,{state:'content_saved',parser_version:parser,query_window:query,content_sha256:String(n).repeat(32)},id(37),n-33]);
    f.setTime('2026-10-13T14:00:00Z');await f.schedules.tick();
    const o=(await f.sql.query("select baseline from procurement_schedule_occurrences where origin='scheduled'")).rows[0];assert.equal(o.baseline.length,1);assert.equal(o.baseline[0].run_id,id(34));
    assert.equal((await f.sql.query('select count(*)::int n from procurement_runs')).rows[0].n,4);
  }finally{await f.sql.close();}
});

test('saved county identity is immutable in SQL; never-run deletion retains audit and rejects all future work',async()=>{
 const f=await fixture();try{
  assert.equal((await f.schedules.get(f.saved.id)).can_delete,true);
  const same={...input,name:'Renamed'};const preview=await f.schedules.preview(same);
  await f.schedules.save(f.saved.id,{...same,preview_hash:preview.preview_hash,confirmed_scope:true,expected_version:1},actor,null);
  for(const config of [{...input.config,county_ids:[]},{...input.config,county_ids:['05125']},{...input.config,target_kind:'sam'}]){
   await assert.rejects(f.sql.query('update procurement_schedules set config=$2 where id=$1',[f.saved.id,config]),/To change counties/);
  }
  const result=await f.schedules.control(f.saved.id,'delete',{expected_version:2},actor);assert.equal(result.deleted,true);
  assert.equal((await f.schedules.list()).total,0);
  assert.equal((await f.schedules.control(f.saved.id,'delete',{expected_version:2},actor)).deleted,true,'Acknowledgement-loss replay');
  assert.ok((await f.schedules.events(f.saved.id)).items.some(e=>e.action==='delete'));
  await assert.rejects(f.schedules.get(f.saved.id));
  await assert.rejects(f.schedules.runNow(f.saved.id,{expected_version:3},actor,'deleted-run-key'));
  await assert.rejects(f.schedules.control(f.saved.id,'resume',{expected_version:3},actor));
  assert.equal((await f.schedules.tick()).queued,0);
  assert.equal((await f.sql.query('select count(*)::int n from procurement_triggers')).rows[0].n,0);
 }finally{await f.sql.close();}
});
test('a real run wins over deletion and its evidence/audit links survive',async()=>{
 const f=await fixture();try{
  const run=await f.schedules.runNow(f.saved.id,{expected_version:1},actor,'run-before-delete');assert.ok(run.trigger_id);
  assert.equal((await f.schedules.get(f.saved.id)).can_delete,false);
  await assert.rejects(f.schedules.control(f.saved.id,'delete',{expected_version:1},actor));
  assert.equal((await f.schedules.list()).total,1);
  assert.equal((await f.sql.query('select count(*)::int n from procurement_triggers where schedule_id=$1',[f.saved.id])).rows[0].n,1);
 }finally{await f.sql.close();}
});
