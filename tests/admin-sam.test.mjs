import test from 'node:test';
import assert from 'node:assert/strict';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {id} from './helpers/known-workflow.mjs';
import {countyTriggers} from '../scripts/lib/county-triggers.mjs';
import {procurementSchedules} from '../scripts/lib/procurement-schedules.mjs';
import {samRequest,samRollingWindow} from '../scripts/lib/sam-request.mjs';
import {statewideSam} from '../scripts/lib/hosted-sam.mjs';

test('SAM scope normalizes separate date/filter contracts and Arkansas rolling calendar days',()=>{
 const input={category:'opportunity',publication_window:{from:'2026-10-01',to:'2026-10-19'}};
 assert.equal(samRequest(input).filters.state,'AR');assert.equal(samRequest({...input,category:'award'}).filters.placeOfPerformStateCode,'AR');
 for(const change of [{category:'forecast'},{publication_window:{from:'2026-02-30',to:'2026-10-19'}},{publication_window:{from:'2024-01-01',to:'2026-10-19'}}])assert.throws(()=>samRequest({...input,...change}));
 assert.deepEqual(samRollingWindow({opportunity:{lookback_days:30}},'opportunity','2026-11-02T05:30:00Z'),{from:'2026-10-03',to:'2026-11-01'});
});

test('SAM Admin submission and scheduled occurrences are atomic, county-independent and replay-safe',async()=>{
 const sql=await adminDatabase();
 try {
  await sql.query('insert into auth.users(id)values($1)',[id(1)]);
  const db=sqlApi(sql),triggers=countyTriggers({db});
  const input={target_kind:'sam',requested_categories:['opportunity'],publication_window:{from:'2026-10-01',to:'2026-10-19'}};
  const preview=await triggers.preview(input);
  assert.equal(preview.config.target_kind,'sam');assert.equal(preview.budget.calls,0);
  for(const extra of [{county_ids:['05119']},{state_trigger_id:id(2)},{maintain_sources:true},{filters:{state:'TX'}}])await assert.rejects(triggers.preview({...input,...extra}),/separate|SAM requires/);
  const body={...input,confirmed_scope:true,preview_hash:preview.preview_hash};
  const first=await triggers.submit(body,id(1),'sam-admin-test-1');
  assert.equal((await triggers.submit(body,id(1),'sam-admin-test-1')).trigger_id,first.trigger_id);
  const children=(await sql.query('select * from procurement_trigger_requests')).rows;
  assert.equal(children.length,1);assert.equal(children[0].role,'sam');assert.equal(children[0].county_id,null);
  assert.equal((await sql.query('select count(*)::int n from procurement_request_targets')).rows[0].n,0);
  assert.equal((await sql.query('select count(*)::int n from procurement_jobs')).rows[0].n,1);
  await assert.rejects(triggers.submit({...body,preview_hash:preview.preview_hash},id(1),'sam-admin-test-2'),/Database operation/);
  assert.equal((await sql.query('select count(*)::int n from procurement_triggers')).rows[0].n,1);
  const job=(await sql.query('select * from procurement_jobs')).rows[0];
  const attempt=id(9),filters=job.checkpoint.filters;
  await sql.query("insert into procurement_sources(id,code,name,business_category,url)values($1,'sam','SAM','other_public','https://sam.gov')",[id(8)]);
  const checkpoint={...job.checkpoint,stage:'sam_reconcile',request_job_id:job.id,request_attempt_id:attempt};
  await sql.query("update procurement_jobs set state='running',attempts=1,lease_until=now()+interval '10 minutes',checkpoint=$2 where id=$1",[job.id,checkpoint]);
  const detail={collector:'sam-search',kind:'opportunities',filters,workflow_attempt_id:attempt,state:'response_captured',upstream_status:200,
    query_url:'https://api.sam.gov/opportunities/v2/search',complete_for_query:true,response:{totalRecords:0,opportunitiesData:[]}};
  const insert=(run,metadata)=>sql.query("insert into procurement_runs(id,source_id,job_id,page_index,page_attempt,started_at,status,detail)values($1,$2,$3,0,1,now(),'success',$4)",[run,id(8),job.id,metadata]);
  await assert.rejects(insert(id(10),{...detail,workflow_attempt_id:id(11)}),/Leased SAM/);
  await insert(id(10),detail);await assert.rejects(insert(id(11),detail),/unique/);
  await sql.query("update procurement_jobs set state='outcome_unknown',lease_until=null where id=$1",[job.id]);
  await sql.query("update procurement_triggers set state='outcome_unknown' where id=$1",[first.trigger_id]);
  let fetches=0;const artifacts={put:async()=> 'saved-offline-capture'};
  const sam=statewideSam({db,artifacts,fetcher:async()=>{fetches++;throw Error('No repeat upstream request');}});
  assert.equal((await sam.reconcile(children[0].request_id,id(1))).state,'pending');assert.equal(fetches,0);
  await triggers.wake(children[0].request_id,{reconciled:true});
  assert.equal((await triggers.status(first.trigger_id)).state,'pending');
  const reconciled=(await sql.query('select checkpoint from procurement_jobs where id=$1',[job.id])).rows[0].checkpoint;
  assert.equal(reconciled.stage,'sam_stage');assert.deepEqual(reconciled.run_ids,[id(10)]);
  await assert.rejects(sam.reconcile(children[0].request_id,id(1)),/Matching uncertain/);
  await sql.query("update procurement_jobs set state='blocked',checkpoint=checkpoint||'{\"stage\":\"sam_review\",\"terminal_confirmed\":true}' where id=$1",[job.id]);
  await sql.query("update procurement_triggers set state='needs_review'");
  let now=new Date('2026-10-20T15:00:00Z');
  const schedules=procurementSchedules({db,triggers,now:()=>now});
  const draft={name:'SAM mornings',enabled:true,config:input,window_policy:{opportunity:{lookback_days:30}},recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00','14:00']}};
  const p=await schedules.preview(draft);
  const saved=await schedules.save(null,{...draft,confirmed_scope:true,preview_hash:p.preview_hash},id(1),'sam-schedule-test-1');
  assert.equal(saved.config.target_kind,'sam');assert.equal(saved.next_due_at,'2026-10-20T19:00:00.000Z');
  now=new Date('2026-10-20T19:01:00Z');
  assert.equal((await schedules.tick()).queued,1);assert.equal((await schedules.tick()).queued,0);
  const occurrence=(await sql.query('select * from procurement_schedule_occurrences')).rows[0];
  assert.deepEqual(occurrence.config.publication_window,{from:'2026-09-21',to:'2026-10-20'});
  assert.equal((await triggers.status(occurrence.trigger_id)).children[0].county_id,null);
  const active=await schedules.get(saved.id);await schedules.control(saved.id,'pause',{expected_version:active.version},id(1));
  now=new Date('2026-10-21T19:01:00Z');assert.equal((await schedules.tick()).queued,0);
 }finally{await sql.close();}
});
