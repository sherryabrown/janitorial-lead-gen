import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {workflowAudit} from '../scripts/lib/workflow-audit.mjs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {countyTriggers} from '../scripts/lib/county-triggers.mjs';
import {procurementSchedules} from '../scripts/lib/procurement-schedules.mjs';
const actor='00000000-0000-4000-8000-000000000001';
async function fixture(){
 const sql=await adminDatabase();await sql.exec(`insert into auth.users values('${actor}');
 insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values('05','state','Arkansas','fixture','1','state'),('05125','county','Saline County','fixture','1','saline'),('05119','county','Pulaski County','fixture','1','pulaski');`);
 const db=sqlApi(sql),triggers=countyTriggers({db}),schedules=procurementSchedules({db,triggers,now:()=>new Date('2026-10-20T12:00:00Z')});
 const input={name:'County updates',enabled:true,config:{target_kind:'county_scope',county_ids:['05125'],maintain_sources:false,check_updates:true,requested_categories:['opportunity']},window_policy:{opportunity:{from_offset_days:0,to_offset_days:119,date_basis:'deadline'}},recurrence:{frequency:'daily',timezone:'America/Chicago',local_times:['09:00']}};
 const save=async(value,key)=>{const p=await schedules.preview(value);return schedules.save(null,{...value,confirmed_scope:true,preview_hash:p.preview_hash},actor,key);};
 return {sql,db,triggers,schedules,input,save};
}
test('county/work reservations include paused schedules, exclude state/SAM, and release on archive/delete',async()=>{
 const f=await fixture();try{
  const catalog=await f.triggers.counties(true);assert.equal(catalog.counties.length,2);assert.deepEqual(catalog.counties[0].cities,[]);assert.equal(typeof catalog.counties[0].selection_token,'string');
  const s=await f.save(f.input,'reservation-first');await f.schedules.control(s.id,'pause',{expected_version:1},actor);
  const p=await f.schedules.preview({...f.input,name:'Different name',recurrence:{...f.input.recurrence,local_times:['11:00']}});assert.equal(p.conflicts[0].schedule_id,s.id);
  await assert.rejects(f.save(f.input,'reservation-second'));
  await assert.rejects(f.save({...f.input,config:{...f.input.config,county_ids:['05119','05125']}},'reservation-partial-overlap'));
  await assert.rejects(f.save({...f.input,config:{...f.input.config,maintain_sources:true}},'reservation-both-work'));
  await assert.rejects(f.save({...f.input,config:{...f.input.config,requested_categories:['award']},window_policy:{award:{from_offset_days:10,to_offset_days:90,date_basis:'award_date'}}},'reservation-other-category'));
  assert.equal((await f.schedules.list()).total,1,'Partial overlaps never save a subset');
  const other={...f.input,name:'Source maintenance',config:{...f.input.config,maintain_sources:true,check_updates:false}};
  const m=await f.save(other,'reservation-maintain');assert.ok(m.id);
  await assert.rejects(f.sql.query('update procurement_schedules set config=jsonb_set(config,\'{check_updates}\',\'true\') where id=$1',[m.id]),/already reserves/);
  assert.equal((await f.schedules.get(m.id)).config.check_updates,false);
  await f.schedules.control(s.id,'archive',{expected_version:2},actor);
  const next=await f.save(f.input,'reservation-replacement');assert.ok(next.id);
  await f.schedules.control(next.id,'delete',{expected_version:1},actor);assert.ok((await f.save(f.input,'reservation-after-delete')).id);
  for(const table of ['procurement_schedule_work_reservations','procurement_schedule_state_memberships'])assert.equal((await f.sql.query("select has_table_privilege('authenticated',$1,'select') allowed",[table])).rows[0].allowed,false);
 }finally{await f.sql.close();}
});
test('one grouped state schedule dispatches every association once, shares ownership, and replays the same children',async()=>{
 const f=await fixture();try{
  const ids=[];for(const [i,county,category] of [[21,'05125','opportunity'],[22,'05119','award']]){
   const source=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;await f.sql.query("insert into procurement_sources(id,code,name,url,contracting_entity_geo_level,business_category)values($1,$2,$2,'https://example.gov','state','other_public')",[source,'State '+i]);
   ids.push((await f.db.rpc('associate_procurement_state_trigger',{p_source:source,p_category:category,p_scope:'state',p_county:county,p_evidence:{}})).data);
  }
  const input={...f.input,name:'Two state sources',config:{...f.input.config,target_kind:'state_source',state_trigger_ids:ids,county_ids:['05119','05125'],requested_categories:['opportunity','award']},window_policy:{...f.input.window_policy,award:{from_offset_days:0,to_offset_days:119,date_basis:'end_renewal'}}};
  const schedule=await f.save(input,'state-group-schedule');assert.equal(schedule.config.state_trigger_ids.length,2);
  const state=(await f.triggers.stateSources()).items;assert.ok(state.every(s=>s.schedule_id===schedule.id));
  await assert.rejects(f.save(input,'state-overlap-schedule'));
  const first=await f.schedules.runNow(schedule.id,{expected_version:1},actor,'state-group-run');assert.equal(first.state,'queued');
  const replay=await f.schedules.runNow(schedule.id,{expected_version:1},actor,'state-group-run');assert.equal(first.id,replay.id);
  const requests=(await f.sql.query('select r.id,r.workflow_control,r.requested_categories,r.requested_search_areas from procurement_search_requests r join procurement_trigger_requests c on c.request_id=r.id where c.trigger_id=$1',[first.trigger_id])).rows;
  assert.equal(requests.length,2);assert.equal(new Set(requests.map(r=>r.workflow_control.state_trigger_id)).size,2);assert.ok(requests.every(r=>r.requested_categories.length===1&&r.requested_search_areas.length===1));
  assert.equal((await f.sql.query('select count(*)::int n from procurement_triggers')).rows[0].n,1);
  // Parent billing limits apply across the grouped source requests, not per child.
  const steps=[];for(const request of requests)steps.push((await f.db.rpc('begin_procurement_step',{p_input:{trigger_id:first.trigger_id,request_id:request.id,actor_id:actor,origin:'manual',phase:'ai_interpretation',attempt_key:randomUUID()}})).data);
  const reserve=async i=>f.db.rpc('reserve_procurement_usage',{p_monthly_usd:10,p_entry:{id:randomUUID(),request_id:requests[i].id,step_id:steps[i],actor_id:actor,kind:'inference',provider:'fixture',model:'fixture',rate_version:'fixture',input_tokens:100,output_tokens:10,reserved_usd:.01}});
  assert.ok(!(await reserve(0)).error);assert.ok((await reserve(1)).error,'Uncertain sibling billing blocks additional calls');
  for(let n=0;n<3;n++){await f.sql.exec("update procurement_usage_ledger set state='completed',actual_usd=.001,usage='{\"input_tokens\":100,\"output_tokens\":10}'");assert.ok(!(await reserve(n%2)).error);}
  await f.sql.exec("update procurement_usage_ledger set state='completed',actual_usd=.001,usage='{\"input_tokens\":100,\"output_tokens\":10}'");
  assert.ok((await reserve(1)).error,'Four-call limit belongs to the parent');
  await f.sql.query("update procurement_jobs set state=case when search_request_id=$1 then 'succeeded' else 'blocked' end",[requests[0].id]);
  const coordinator=countyTriggers({db:f.db,audit:workflowAudit(f.db),workflow:{status:async()=>({total_candidates:0})}});
  assert.equal(await coordinator.step(),true);assert.equal((await f.triggers.status(first.trigger_id)).state,'needs_review');
  assert.equal((await f.triggers.status(first.trigger_id)).children.filter(c=>c.source_name).length,2);
  await f.schedules.control(schedule.id,'archive',{expected_version:1},actor);assert.ok((await f.triggers.stateSources()).items.every(s=>!s.schedule_id));
  assert.ok((await f.save(input,'state-after-archive')).id);
  await assert.rejects(f.triggers.preview({...input.config,requested_categories:['forecast'],search_windows:{forecast:{from:'2026-10-20',to:'2027-02-16',date_basis:'expected_solicitation'}}}),/does not match/);
 }finally{await f.sql.close();}
});
