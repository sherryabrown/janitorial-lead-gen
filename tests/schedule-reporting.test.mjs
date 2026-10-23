import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleFilters,verifiedLeadCounts} from '../scripts/lib/schedule-reporting.mjs';
import {procurementSchedules} from '../scripts/lib/procurement-schedules.mjs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
const run={state:'completed',config:{check_updates:true}};
const job=(records,extra={})=>({state:'succeeded',checkpoint:{automatic:{policy:'county-automatic-v1'},receipt:{verified:true},county_records:records.map(r=>({added:false,updated:false,...r})),...extra}});
test('verified lead IDs deduplicate batches; unknown, source-only and aggregate SAM results stay distinct',()=>{
 assert.deepEqual(verifiedLeadCounts(run,[job([{id:'a',added:true},{id:'b',updated:true}]),job([{id:'a',updated:true},{id:'c'}])]),{added:1,updated:1,unchanged:1,completeness:'known'});
 assert.equal(verifiedLeadCounts(run,[]).added,null);
 assert.equal(verifiedLeadCounts({...run,state:'running'},[job([])]).completeness,'unknown');
 assert.equal(verifiedLeadCounts({config:{check_updates:false}},[]).completeness,'not_applicable');
 assert.equal(verifiedLeadCounts(run,[job([])]).added,0);
 const sam={checkpoint:{automatic:{policy:'sam-automatic-v1'},receipt:{verified:true,counts:{actual_new_leads:2,evidence_updates:1,actual_processed:4}}}};
 assert.deepEqual(verifiedLeadCounts(run,[sam]),{added:2,updated:1,unchanged:1,completeness:'known',identities:false});
 assert.equal(verifiedLeadCounts(run,[sam,sam]).completeness,'unknown');
 assert.equal(verifiedLeadCounts(run,[job([],{receipt:{verified:false}})]).added,null);
 assert.equal(verifiedLeadCounts(run,[job([]),{state:'pending',checkpoint:{stage:'discovery_capture'}}]).added,null);
 assert.equal(verifiedLeadCounts(run,[job([],{county_records:[{id:'missing-flags'}]})]).added,null);
 for(const input of [{sort:'config'},{direction:'sideways'},{q:'x'.repeat(101)},{geography:'unsafe'},{target:'company'}])assert.throws(()=>scheduleFilters(input));
});
test('schedule overview filters/sorts/counts full results and deterministically selects actual run separately from skipped occurrence',async()=>{
 const sql=await adminDatabase();try{
  const actor='00000000-0000-4000-8000-000000000001';
  await sql.query('insert into auth.users(id)values($1)',[actor]);
  for(let n=0;n<56;n++)await sql.query(`insert into procurement_schedules(id,name,config,scope_hash,window_policy,recurrence,client_key,submission_hash,created_by,owner_id,enabled) values($1,$2,$3,'scope','{}',$4,$5,'hash',$6,$6,$7)`,
   [`00000000-0000-4000-8000-${String(n+100).padStart(12,'0')}`,`Schedule ${String(n).padStart(2,'0')}`,{target_kind:n%2?'sam':'county_scope',county_ids:['05001'],requested_categories:['opportunity']},{frequency:'daily',timezone:'America/Chicago',local_times:['09:00']},`key-${n}`,actor,n%2===0]);
  const service=procurementSchedules({db:sqlApi(sql)});
  const first=await service.list({limit:20,target:'sam'});assert.equal(first.total,28);assert.equal(first.items.length,20);assert.equal(first.next_offset,20);
  const second=await service.list({limit:20,offset:20,target:'sam'});assert.equal(second.items.length,8);assert.equal(second.next_offset,null);
  assert.equal((await service.list({q:'55'})).total,1);assert.equal((await service.list({geography:'05001',target:'county_scope',lifecycle:'active'})).total,28);
  const sid=first.items[0].id;
  for(const ending of ['1','2'])await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,schedule_id,created_at,state)values($1,'sam','{}',$2,$3,'hash',$4,'2026-10-20T12:00:00Z','pending')`,[`10000000-0000-4000-8000-00000000000${ending}`,actor,`trigger-${ending}`,sid]);
  await sql.query(`insert into procurement_schedule_occurrences(schedule_id,version,due_at,effective_at,origin,run_key,config,actor_id,state,reason)values($1,1,now(),now(),'scheduled','skip','{}',$2,'skipped','previous_run_active')`,[sid,actor]);
  const found=(await service.list({q:first.items[0].name})).items[0];
  assert.equal(found.reporting.last_run.id,'10000000-0000-4000-8000-000000000002');assert.equal(found.reporting.latest_occurrence.state,'skipped');assert.equal(found.reporting.last_run.leads.added,null);
  await sql.exec('set role authenticated');await assert.rejects(()=>sql.query('select * from procurement_schedule_overview'));await sql.exec('reset role');
 }finally{await sql.close();}
});
