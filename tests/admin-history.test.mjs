import test from 'node:test';
import assert from 'node:assert/strict';
import {adminRunHistory,historyFilters,activityTiming} from '../scripts/lib/admin-run-history.mjs';
import {procurementSchedules} from '../scripts/lib/procurement-schedules.mjs';
import {countyTriggers} from '../scripts/lib/county-triggers.mjs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
const actor='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002';
const rid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('recorded activity unions nested/overlapping intervals without inventing exact execution duration',()=>{
 const run={state:'needs_review',created_at:'2026-10-20T00:00:00Z',finished_at:null};
 const step=(a,b)=>({started_at:`2026-10-20T00:00:${a}Z`,finished_at:b?`2026-10-20T00:00:${b}Z`:null});
 const timing=activityTiming(run,[step('01','10'),step('03','05'),step('08','15'),step('20','22'),step('25',null)]);
 assert.equal(timing.recorded_activity_ms,16000);assert.equal(timing.completeness,'partial');assert.equal(timing.created_to_finished_ms,null);
 assert.equal(activityTiming(run,[]).recorded_activity_ms,null);
 assert.equal(activityTiming({...run,state:'completed',finished_at:'2026-10-20T00:01:00Z'},[]).created_to_finished_ms,60000);
 for(const input of [{schedule:'bad'},{run:'<script>'},{target:'companies'},{origin:'robot'},{outcome:'fake'},{from:'2026-02-30'},{from:'2026-10-21',through:'2026-10-20'}])assert.throws(()=>historyFilters(input));
});
test('history filters cover the full dataset, standalone runs, CT boundaries, snapshots and safe step projections',async()=>{
 const sql=await adminDatabase();try{
  await sql.query('insert into auth.users(id) values($1)',[actor]);
  await sql.query(`insert into procurement_schedules(id,name,config,scope_hash,window_policy,recurrence,client_key,submission_hash,created_by,owner_id) values($1,'Renamed schedule','{}','scope','{}','{}','history-test','hash',$2,$2)`,[sid,actor]);
  for(let n=1;n<=56;n++)await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,state,schedule_id,origin,created_at)values($1,$2,$3,$4,$5,'hash','completed',$6,$7,$8)`,
   [rid(n),n%2?'sam':'county_scope',{target_kind:n%2?'sam':'county_scope',county_ids:['05125'],check_updates:true},actor,`history-${n}`,n%2?null:sid,n%2?'manual':'scheduled','2026-10-20T05:00:00Z']);
  const history=adminRunHistory(sqlApi(sql));
  const first=await history({limit:20});assert.equal(first.total,56);assert.equal(first.items.length,20);assert.equal(first.next_offset,20);
  assert.equal((await history({limit:20,offset:40})).items.length,16);
  assert.equal((await history({schedule:'none',target:'sam',origin:'manual'})).total,28);
  assert.equal((await history({schedule:sid,geography:'05125',origin:'scheduled',from:'2026-10-20',through:'2026-10-20'})).total,28);
  assert.equal((await history({from:'2026-10-19',through:'2026-10-19'})).total,0);
  assert.equal((await history({run:rid(2)})).items[0].leads.completeness,'unknown');
  await sql.query(`insert into procurement_schedule_occurrences(schedule_id,version,due_at,effective_at,origin,run_key,config,state,reason)values($1,1,now(),now(),'scheduled','skipped', $2,'skipped','previous_run_active')`,[sid,{target_kind:'county_scope',county_ids:['05125'],counties:[{id:'05125',name:'Original county snapshot',cities:[]}]}]);
  const schedules=procurementSchedules({db:sqlApi(sql)}),occ=(await schedules.occurrences(sid)).items[0];
  assert.equal(occ.run,null);assert.equal(occ.config.counties[0].name,'Original county snapshot');
  await sql.query(`insert into procurement_workflow_steps(trigger_id,phase,attempt_key,state,actor_id,origin,reason,summary,finished_at)values($1,'compare','test','failed',$2,'manual','sensitive untrusted trace',$3,now())`,[rid(2),actor,{raw_trace:'private secret',records:2,outcome:'blocked'}]);
  const service=countyTriggers({db:sqlApi(sql)}),steps=await service.steps(rid(2));
  assert.equal(steps.items[0].reason,'saved_step');assert.equal(steps.items[0].summary.raw_trace,undefined);assert.equal(steps.items[0].summary.records,2);
  assert.equal((await history({run:rid(2)})).items[0].schedule_name,'Renamed schedule');
  await sql.query(`update procurement_triggers set checkpoint=$1,lease_token=$2 where id=$3`,[{private_artifact:'not public'},actor,rid(2)]);
  const status=await service.status(rid(2));assert.equal(status.reporting.checkpoint,undefined);assert.equal(status.reporting.lease_token,undefined);assert.equal(JSON.stringify(status).includes('not public'),false);
  await sql.query(`update procurement_triggers set created_at='2026-03-09T04:59:00Z' where id=$1`,[rid(1)]);
  await sql.query(`update procurement_triggers set created_at='2026-03-09T05:00:00Z' where id=$1`,[rid(3)]);
  assert.equal((await history({from:'2026-03-08',through:'2026-03-08'})).total,1,'CT DST day ends at 05:00Z, not a fixed 24-hour offset');
  await sql.query(`insert into procurement_schedule_events(schedule_id,action,version,summary) values($1,'edited',2,$2)`,[sid,{raw_trace:'private secret',occurrence_id:sid,reason:'private exception'}]);
  const event=(await schedules.events(sid)).items[0];assert.equal(event.summary.raw_trace,undefined);assert.equal(event.summary.reason,'saved_reason');
  await sql.query(`insert into procurement_workflow_steps(trigger_id,phase,attempt_key,state,actor_id,origin,started_at,finished_at) select $1,'compare','large-history-'||n,'completed',$2,'manual','2026-10-20T12:00:00Z'::timestamptz,'2026-10-20T12:00:01Z'::timestamptz from generate_series(1,10000) n`,[rid(2),actor]);
  const large=await history();assert.equal(large.total,56);assert.equal(large.items.length,50);assert.ok(large.items.every(r=>r.timing.recorded_activity_ms===null&&r.timing.completeness==='unknown'&&r.timing.reason.includes('Timing unavailable')));
  const logPage=await service.steps(rid(2),{limit:50});assert.equal(logPage.items.length,50);assert.ok(logPage.next_cursor,'Detailed logs remain paginated and readable');
  const sequence=String(logPage.items[0].sequence);
  const refreshed=await service.steps(rid(2),{sequences:sequence});assert.equal(refreshed.items.length,1);assert.equal(refreshed.items[0].id,logPage.items[0].id);assert.equal(refreshed.next_cursor,null);
  assert.equal((await service.steps(rid(1),{sequences:sequence})).items.length,0,'Mutable refresh cannot cross trigger scope');
  for(const sequences of ['', '1 OR TRUE', Array(51).fill('1').join(',')])await assert.rejects(()=>service.steps(rid(2),{sequences}),/Invalid step selection/);
  await assert.rejects(()=>service.steps(rid(2),{sequences:sequence,cursor:'1'}),/Invalid step selection/);
  const index=await sql.query("select indexdef from pg_indexes where indexname='procurement_steps_trigger_sequence'");assert.match(index.rows[0].indexdef,/trigger_id, sequence/);
  const plan=await sql.query('explain (analyze,buffers) select id,sequence from procurement_workflow_steps where trigger_id=$1 and sequence>$2 order by sequence limit 51',[rid(2),sequence]);
  assert.match(plan.rows.map(r=>r['QUERY PLAN']).join('\n'),/procurement_steps_trigger_sequence/,'Later log pages use the run/sequence index');
 }finally{await sql.close();}
});
