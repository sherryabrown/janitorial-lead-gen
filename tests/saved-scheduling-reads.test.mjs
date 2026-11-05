import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {persistRunResult} from '../scripts/lib/persisted-run-results.mjs';
import {hash} from '../scripts/lib/reviewed-batch.mjs';
import {usageSummary} from '../scripts/lib/workflow-audit.mjs';
import {countyPresentations} from '../scripts/lib/county-source-attention.mjs';
import {sourceReviewService} from '../scripts/lib/source-decisions.mjs';
import {aggregateAnalytics,analyticsFilters} from '../scripts/lib/admin-analytics.mjs';
test('saved scheduling RPCs are read-only and preserve User/Admin boundaries without worker access',async()=>{
 const sql=await adminDatabase();
 try{
  await sql.exec(`create table public.profiles(user_id uuid primary key,role text,first_name text,last_name text,updated_at timestamptz default now());create or replace function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
  // The lightweight fixture lacks unrelated portal tables. Install the exact
  // capability functions; full production policies are covered by native access.
  await sql.exec(readFileSync('supabase/migrations/20261026000200_procurement_profile_capabilities.sql','utf8').split('-- Restrictive policies')[0]+'commit;');
  for(const file of ['20261026000300_procurement_source_decisions.sql','20261026000400_procurement_source_exclusion_claims.sql','20261027000100_procurement_guided_source_repairs.sql','20261028000100_procurement_source_attention.sql',
   '20261104000100_persisted_run_results.sql','20261104000200_saved_scheduling_reads.sql','20261104000300_scheduling_read_api.sql','20261104000400_saved_schedule_analytics.sql','20261104000500_saved_reporting_status.sql','20261104000600_saved_source_read_inputs.sql','20261104000700_saved_source_setup.sql','20261104000800_saved_run_presentation.sql','20261105000100_bound_saved_reporting_work.sql'])await sql.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  const user=randomUUID(),admin=randomUUID(),run=randomUUID(),request=randomUUID(),lead=randomUUID(),sid=randomUUID();
  for(const [id,role] of [[user,'user'],[admin,'admin']]){await sql.query('insert into auth.users(id)values($1)',[id]);await sql.query('insert into profiles(user_id,role) values($1,$2)',[id,role]);}
  await sql.query(`insert into procurement_schedules(id,name,config,scope_hash,window_policy,recurrence,client_key,submission_hash,created_by,owner_id) values($1,'Saved scheduling','{"target_kind":"sam","private_token":"NEVER"}','scope','{}','{}',$2,'hash',$3,$3)`,[sid,sid,admin]);
  await sql.query(`insert into procurement_search_requests(id,name,search_boundary_mode,requested_search_areas)values($1,'Saved','exact_area','[{"area_type":"state","state_code":"AR"}]')`,[request]);
  await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,state,schedule_id)values($1,'sam','{"check_updates":true,"private_token":"NEVER"}',$2,$3,'hash','completed',$4)`,[run,admin,run,sid]);
  await sql.query(`insert into procurement_trigger_requests(trigger_id,request_id,role,scope)values($1,$2,'sam','{}')`,[run,request]);
  await sql.query(`insert into procurement_jobs(search_request_id,dedupe_key,kind,state,checkpoint)values($1,$2,'process','succeeded',$3)`,[request,run,{stage:'import_verified',receipt:{verified:true},reporting_records:{version:1,records:[{id:lead,outcome:'added',category:'award'}]},private_token:'NEVER'}]);
  await persistRunResult(sqlApi(sql),run);
  const target=randomUUID(),task=randomUUID();
  await sql.query(`insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values('05001','county','Arkansas County','fixture','1','fixture')on conflict(id)do nothing`);
  await sql.query(`insert into procurement_request_targets(id,search_request_id,target_key,geography_id)values($1,$2,'saved-read-source','05001')`,[target,request]);
  await sql.query(`insert into procurement_coverage_tasks(id,target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,state)values($1,$2,'saved-source-gap','county','05001','award',1,'Source missing','source_missing')`,[task,target]);
  await sql.query(`update procurement_triggers set target_kind='county_scope',config='{"target_kind":"county_scope","county_ids":["05001"],"requested_categories":["award"],"check_updates":true}' where id=$1`,[run]);
  await persistRunResult(sqlApi(sql),run);
  const rawRun=(await sql.query('select * from procurement_triggers where id=$1',[run])).rows[0];
  assert.deepEqual((await sql.query('select procurement_saved_run_timing($1) t',[run])).rows[0].t,(await sql.query("select procurement_saved_run($1,false)#>'{reporting,timing}' t",[run])).rows[0].t);
  const presentation=(await countyPresentations(sqlApi(sql),[rawRun])).get(run);
  assert.deepEqual((await sql.query('select procurement_saved_run_presentation($1) p',[run])).rows[0].p,presentation);
  const sourceReference=await sourceReviewService(sqlApi(sql)).list(request);
  const capabilityInputs=await sqlApi(sql).rpc('procurement_capability_read_inputs',{p_limit:25});assert.equal(capabilityInputs.error,undefined);
  const row=await sql.query('select procurement_reporting_hash($1) h',[{z:[1,2],a:'é'}]);assert.equal(row.rows[0].h,hash({z:[1,2],a:'é'}));
  for(const entries of [[],[{state:'not_sent'}],[{state:'completed',actual_usd:0.25,usage:{input_tokens:10,output_tokens:20,credits:2,credit_unit:'credits'}}],
   [{state:'reserved',reserved_usd:1,usage:{}}],[{state:'completed',actual_usd:0.25,usage:{input_tokens:'10',output_tokens:20}}],
   [{state:'completed',usage:{quota_rejection:true}}],[{state:'completed',actual_usd:0.1,usage:{input_tokens:-1,output_tokens:0}}]]){
   const actual=(await sql.query('select procurement_saved_usage_summary($1) u',[entries])).rows[0].u;assert.deepEqual(actual,usageSummary(entries));
  }
  const read=async(kind,id=null,filters={})=>(await sql.query('select procurement_scheduling_read($1,$2,$3) p',[kind,id,filters])).rows[0].p;
  await assert.rejects(()=>read('schedules'),/Scheduling access unavailable/);
  await sql.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await sql.exec('set role authenticated');
  const saved=await read('schedules');assert.equal(saved.total,1);assert.equal(saved.items[0].name,'Saved scheduling');assert.equal(JSON.stringify(saved).includes('NEVER'),false);assert.equal(saved.items[0].reporting.last_run.leads.added,1);
  const progress=await read('run',run);assert.equal(progress.state,'completed');assert.equal(progress.reporting.identity_snapshot.length,64);assert.equal(progress.usage,undefined);assert.equal(progress.config.private_token,undefined);
  assert.equal((await read('history')).items.length,1);
  assert.equal((await read('activity',sid)).items.length,1);
  assert.equal((await read('events',sid)).items.length,0);
  assert.equal((await read('occurrences',sid)).items.length,0);
  const sourceStatus=await read('source_status',request);assert.equal(sourceStatus.items.length,1);assert.equal(sourceStatus.items[0].title,sourceReference.items[0].title);assert.deepEqual(sourceStatus.items[0].scope,sourceReference.items[0].scope);assert.deepEqual(sourceStatus.items[0].allowed_actions,['view_status']);
  assert.equal((await read('source_setup',sid)).items.length,0);
  const report=await read('analytics',null,{run,period:'all'});assert.equal(report.summary.unique_leads.value,1);assert.equal(report.summary.outcomes.added.value,1);
  const memberPage=await read('metric_members',null,{run,period:'all',member_metric:'added',expected:1,as_of:report.as_of,snapshot:report.snapshot});assert.deepEqual(memberPage.items,[{id:lead}]);
  await assert.rejects(()=>read('steps',run),/Admin required/);await assert.rejects(()=>read('scheduler_status'),/Admin required/);
  await assert.rejects(()=>sql.query('select procurement_saved_run($1,true)',[run]));await assert.rejects(()=>sql.query('select * from procurement_run_result_members'));
  await assert.rejects(()=>read('schedules',null,{limit:101}),/Invalid read filters/);
  await sql.exec('reset role');await sql.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await sql.exec('set role authenticated');
  assert.equal((await read('steps',run)).items.length,0);assert.equal((await read('run',run)).usage.ai,'not_used');
  await sql.exec('reset role');assert.equal((await sql.query('select state from procurement_triggers where id=$1',[run])).rows[0].state,'completed');
  // Two runs contain the same lead with different historical outcomes/categories.
  // Reports deduplicate membership, union classifications, and retain added precedence.
  const secondRun=randomUUID(),secondRequest=randomUUID();
  await sql.query(`insert into procurement_search_requests(id,name,search_boundary_mode,requested_search_areas)values($1,'Second saved','exact_area','[{"area_type":"state","state_code":"AR"}]')`,[secondRequest]);
  await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,state,schedule_id)values($1,'sam','{"check_updates":true}',$2,$4,'hash','completed',$3)`,[secondRun,admin,sid,secondRun]);
  await sql.query(`insert into procurement_trigger_requests(trigger_id,request_id,role,scope)values($1,$2,'sam','{}')`,[secondRun,secondRequest]);
  await sql.query(`insert into procurement_jobs(search_request_id,dedupe_key,kind,state,checkpoint)values($1,$2,'process','succeeded',$3)`,[secondRequest,secondRun,{stage:'import_verified',receipt:{verified:true},reporting_records:{version:1,records:[{id:lead,outcome:'updated',category:'forecast'}]}}]);
  await persistRunResult(sqlApi(sql),secondRun);
  await sql.exec('set role authenticated');
  const combined=await read('analytics',null,{schedule:sid,period:'all'});
  assert.equal(combined.summary.unique_leads.value,1);assert.equal(combined.summary.outcomes.added.value,1);assert.equal(combined.summary.outcomes.updated.value,0);
  assert.deepEqual((await read('metric_members',null,{schedule:sid,period:'all',member_metric:'added',expected:1,snapshot:combined.snapshot,as_of:combined.as_of})).items,[{id:lead}]);
  await sql.exec('reset role');
  const inputs={runs:(await sql.query('select * from procurement_triggers')).rows,children:(await sql.query('select * from procurement_trigger_requests')).rows,jobs:(await sql.query('select * from procurement_jobs')).rows};
  for(const filters of [{schedule:sid,period:'all'}, {run:secondRun,period:'all'}, {schedule:sid,category:'award'}, {schedule:sid,from:'2026-11-01',through:'2026-11-01'}]){
   const normalized=analyticsFilters(filters);
   const runs=inputs.runs.filter(r=>(!filters.run||r.id===filters.run)&&(!filters.category||r.config.requested_categories?.includes(filters.category)));
   const expected=aggregateAnalytics({...inputs,runs},normalized);
   const actual=await read('analytics',null,{...filters,as_of:normalized.as_of});
   for(const key of ['unique_leads','outcomes','run_events','categories','historical_opportunities','unclassified_known_leads'])assert.deepEqual(actual.summary[key],expected.summary[key],key);
  }
 }finally{await sql.close();}
});

