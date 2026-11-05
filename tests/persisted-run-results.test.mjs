import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {runResultProjection,persistRunResult,persistPendingRunResults} from '../scripts/lib/persisted-run-results.mjs';
import {projectRunResults} from '../scripts/project-run-results.mjs';
const checkpoint=(records)=>({stage:'import_verified',receipt:{verified:true},reporting_records:{version:1,records}});
const job=(records)=>({state:'succeeded',checkpoint:checkpoint(records)});
test('completed and incomplete run projections preserve facts and qualified known subtotals',()=>{
 const id=randomUUID(),run={state:'completed',config:{check_updates:true}};
 const jobs=[job([{id,outcome:'updated',category:'forecast'}]),job([{id,outcome:'added',category:'historical_opportunity'}])];
 const value=runResultProjection(run,jobs);assert.equal(value.records.length,1);assert.equal(value.records[0].outcome,'added');assert.deepEqual(value.records[0].categories,['forecast','opportunity']);assert.equal(value.records[0].historical,true);assert.equal(value.result.complete,true);
 for(const state of ['pending','running','partial','needs_review','outcome_unknown','cancelled']){
  const partial=runResultProjection({...run,state},jobs);assert.equal(partial.result.complete,false);assert.equal(partial.result.known_subtotal,1);assert.equal(partial.result.completeness,'partial');assert.equal(partial.result.leads.added,null);
 }
 assert.equal(runResultProjection({...run,config:{check_updates:false}},[]).result.completeness,'not_applicable');
 assert.equal(runResultProjection(run,[]).result.complete,false);
 assert.equal(runResultProjection(run,[job([])]).result.complete,true);
 assert.equal(runResultProjection(run,[job([{id,outcome:'added'}])]).result.category_complete,false);
 assert.equal(runResultProjection(run,[job([{id:'bad',outcome:'not_real'}])]).result.complete,false);
 for(const state of ['pending','running','partial','outcome_unknown','failed'])assert.equal(runResultProjection(run,[...jobs,{kind:'collect',state,checkpoint:{}}]).result.complete,false);
 assert.equal(runResultProjection(run,jobs,[{state:'reserved'}]).result.complete,false);
 assert.equal(runResultProjection(run,jobs,[{state:'outcome_unknown'}]).result.complete,false);
});
test('publication is atomic, idempotent, invalidates on late evidence, and recovers without import writes',async()=>{
 const sql=await adminDatabase();
 try{
  await sql.exec(readFileSync('supabase/migrations/20261104000100_persisted_run_results.sql','utf8'));
  const actor=randomUUID(),request=randomUUID(),run=randomUUID(),lead=randomUUID(),jobId=randomUUID();
  await sql.query('insert into auth.users(id)values($1)',[actor]);
  await sql.query(`insert into procurement_search_requests(id,name,search_boundary_mode,requested_search_areas)values($1,'Result fixture','exact_area','[{"area_type":"state","state_code":"AR"}]')`,[request]);
  await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,state)values($1,'sam','{"check_updates":true}',$2,$3,'hash','completed')`,[run,actor,run]);
  await sql.query(`insert into procurement_trigger_requests(trigger_id,request_id,role,scope)values($1,$2,'sam','{}')`,[run,request]);
  await sql.query(`insert into procurement_jobs(id,search_request_id,dedupe_key,kind,state,checkpoint)values($1,$2,$3,'process','succeeded',$4)`,[jobId,request,jobId,checkpoint([{id:lead,category:'award',outcome:'added'}])]);
  const db=sqlApi(sql),first=await persistRunResult(db,run);assert.equal(first.replayed,false);
  assert.equal((await persistRunResult(db,run)).replayed,true);
  assert.equal((await persistPendingRunResults(db)).length,0);
  const before=(await sql.query('select * from procurement_run_results where trigger_id=$1',[run])).rows[0];
  const invalid=await db.rpc('procurement_publish_run_result',{p_trigger:run,p_source_version:before.source_version,p_revision:'b'.repeat(64),p_result:{},p_members:[{id:lead,outcome:'invalid',categories:[],historical:false}]});
  assert.ok(invalid.error);assert.equal((await sql.query('select revision from procurement_run_results where trigger_id=$1',[run])).rows[0].revision,before.revision);
  await sql.query("update procurement_triggers set state='pending' where id=$1",[run]);
  const stale=await db.rpc('procurement_publish_run_result',{p_trigger:run,p_source_version:before.source_version,p_revision:before.revision,p_result:before.result,p_members:[]});assert.equal(stale.error.code,'40001');
  await persistPendingRunResults(db);let saved=(await sql.query('select result from procurement_run_results where trigger_id=$1',[run])).rows[0].result;assert.equal(saved.complete,false);assert.equal(saved.known_subtotal,1);
  await sql.query("update procurement_triggers set state='completed' where id=$1",[run]);
  const version=(await sql.query('select reporting_source_version as v from procurement_triggers where id=$1',[run])).rows[0].v;
  await sql.query('update procurement_jobs set checkpoint=$1 where id=$2',[checkpoint([{id:lead,category:'award',outcome:'updated'}]),jobId]);
  assert.notEqual((await sql.query('select reporting_source_version as v from procurement_triggers where id=$1',[run])).rows[0].v,version);
  await persistPendingRunResults(db);saved=(await sql.query('select result from procurement_run_results where trigger_id=$1',[run])).rows[0].result;assert.equal(saved.complete,true);
  assert.equal((await sql.query('select outcome from procurement_run_result_members where trigger_id=$1',[run])).rows[0].outcome,'updated');
  const preflight=(await sql.query('select * from procurement_run_results')).rows;
  let progress=0;const dry=await projectRunResults(db,[run],{onProgress:()=>{progress++;}});
  assert.equal(progress,1);assert.equal(dry[0].known_subtotal,1);assert.equal(dry[0].evidence.versioned_jobs,1);assert.equal(dry[0].published,undefined);
  assert.deepEqual((await sql.query('select * from procurement_run_results')).rows,preflight,'Operator dry run writes no projections');
  await sql.exec('set role authenticated');await assert.rejects(()=>sql.query('select * from procurement_run_results'));await assert.rejects(()=>sql.query('select procurement_pending_run_results(5)'));await sql.exec('reset role');
  assert.equal((await sql.query('select state from procurement_jobs where id=$1',[jobId])).rows[0].state,'succeeded');
 }finally{await sql.close();}
});
