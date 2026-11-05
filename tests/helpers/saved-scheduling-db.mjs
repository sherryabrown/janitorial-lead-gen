import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {persistRunResult} from '../../scripts/lib/persisted-run-results.mjs';
import {persistCapabilityReadiness} from '../../scripts/lib/persisted-capability-readiness.mjs';
export const savedReadMigrations=[
 '20261104000100_persisted_run_results.sql','20261104000200_saved_scheduling_reads.sql','20261104000300_scheduling_read_api.sql',
 '20261104000400_saved_schedule_analytics.sql','20261104000500_saved_reporting_status.sql','20261104000600_saved_source_read_inputs.sql','20261104000700_saved_source_setup.sql','20261104000800_saved_run_presentation.sql','20261105000100_bound_saved_reporting_work.sql'];
export async function verifySavedSchedulingReads({pool,db,api,user,admin,userToken,adminToken}){
 assert.equal(pool.options.host,'127.0.0.1');
 // The preceding stale-token test intentionally downgraded this fixture Admin.
 await pool.query("update profiles set role='admin' where user_id=$1",[admin]);
 for(const migration of savedReadMigrations)await pool.query(readFileSync('supabase/migrations/'+migration,'utf8'));
 await pool.query("notify pgrst, 'reload schema'");
 let ready=false;
 for(let n=0;n<40;n++){
  const r=await api('rpc/procurement_scheduling_read',userToken,{p_read:'counties'});
  if(r.status===200){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,'Native gateway exposes saved-read RPC');
 const sid=randomUUID(),run=randomUUID(),request=randomUUID(),lead=randomUUID(),source=randomUUID(),capability=randomUUID();
 await pool.query(`insert into procurement_schedules(id,name,config,scope_hash,window_policy,recurrence,client_key,submission_hash,created_by,owner_id)values($1,'Decoupled read fixture','{"target_kind":"county_scope","county_ids":["05001"],"requested_categories":["opportunity"]}','scope','{}','{}',$2,'hash',$3,$3)`,[sid,sid,user]);
 await pool.query(`insert into procurement_search_requests(id,name,search_boundary_mode,requested_search_areas)values($1,'Decoupled','exact_area','[{"area_type":"state","state_code":"AR"}]')`,[request]);
 await pool.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,state,schedule_id)values($1,'sam','{"check_updates":true,"requested_categories":["opportunity"]}',$2,$3,'hash','completed',$4)`,[run,admin,run,sid]);
 await pool.query(`insert into procurement_trigger_requests(trigger_id,request_id,role,scope)values($1,$2,'sam','{}')`,[run,request]);
 await pool.query(`insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level,source_coverage_areas)values($1,$2,'Decoupled source','https://read-fixture.example/','other_public','county','[{"area_type":"county","state_code":"AR","county_name":"Arkansas County"}]')`,[source,'read-fixture-'+source]);
 await pool.query(`insert into procurement_source_capabilities(id,source_id,kind,method,endpoint_url,official_entry_url,route_geography_id,availability,verified_at,verified_until,verification_evidence,parser_version,method_spec)
 values($1,$2,'opportunity','browser','https://read-fixture.example/','https://read-fixture.example/','05001','active',now()-interval '1 day',now()+interval '1 day','{"proof":"fixture","private_token":"NEVER_PUBLIC"}','fixture-v1',$3)`,[capability,source,{version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://read-fixture.example/'],allowed_hosts:['read-fixture.example'],max_bytes:1000}]);
 await pool.query(`insert into procurement_leads(id,source_id,external_id,payload)values($1,$2,$3,'{"title":"Fixture janitorial services","source_url":"https://read-fixture.example/bid","bid_type":"opportunity","business_category":"other_public","contracting_entity_geo_level":"county","work_performance_locations":[{"state_code":"AR","county_name":"Arkansas County"}]}')`,[lead,source,lead]);
 await pool.query(`insert into procurement_jobs(search_request_id,dedupe_key,kind,state,checkpoint)values($1,$2,'process','succeeded',$3)`,[request,run,{stage:'import_verified',receipt:{verified:true},reporting_records:{version:1,records:[{id:lead,outcome:'added',category:'opportunity'}]}}]);
 await persistRunResult(db,run);await persistCapabilityReadiness(db,{limit:100});
 const call=async(p_read,p_id=null,p_filters={},jwt=userToken)=>{const r=await api('rpc/procurement_scheduling_read',jwt,{p_read,p_id,p_filters});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const before=await pool.query('select state,reporting_source_version from procurement_triggers where id=$1',[run]);
 const report=await call('analytics',null,{run,period:'all'});assert.equal(report.summary.unique_leads.value,1);assert.equal(report.summary.usage,undefined);
 assert.deepEqual((await call('metric_members',null,{run,period:'all',member_metric:'added',expected:1,snapshot:report.snapshot,as_of:report.as_of})).items,[{id:lead}]);
 const setup=await call('source_setup',sid);assert.ok(setup.items.some(s=>s.id===source));assert.equal(JSON.stringify(setup).includes('NEVER_PUBLIC'),false);
 assert.equal((await call('run',run)).usage,undefined);assert.equal((await call('run',run,{},adminToken)).usage.ai,'not_used');
 assert.equal((await api('rpc/procurement_scheduling_read',userToken,{p_read:'steps',p_id:run,p_filters:{p_admin:true}})).status,403);
 assert.ok([401,403].includes((await api('rpc/procurement_scheduling_read',undefined,{p_read:'schedules'})).status));
 assert.ok([401,403,404].includes((await api('rpc/procurement_saved_run',userToken,{p_trigger:run,p_admin:true})).status));
 const raw=await api('procurement_run_result_members?select=*',userToken);assert.ok([401,403].includes(raw.status));
 assert.deepEqual((await pool.query('select state,reporting_source_version from procurement_triggers where id=$1',[run])).rows,before.rows,'All saved reads are side-effect free');
 await pool.query("update procurement_triggers set state='needs_review' where id=$1",[run]);
 const changed=await call('analytics',null,{run,period:'all',snapshot:report.snapshot,as_of:report.as_of});assert.ok(changed.unavailable);
 const replay=await persistRunResult(db,run);assert.equal((await persistRunResult(db,run)).revision,replay.revision);
 assert.equal((await call('analytics',null,{run,period:'all'})).summary.unique_leads.known_subtotal,1);
 assert.equal((await call('analytics',null,{run,period:'all'})).summary.unique_leads.value,null);
 const survivor=randomUUID();
 await pool.query(`insert into procurement_leads(id,source_id,external_id,payload)select $1,source_id,$2,payload||'{"bid_type":"award","title":"Mutable current classification"}' from procurement_leads where id=$3`,[survivor,survivor,lead]);
 await pool.query(`update procurement_leads set payload=payload||jsonb_build_object('canonical_redirect',jsonb_build_object('policy','county-ionwave-solicitation-v1','lead_id',$1::text)) where id=$2`,[survivor,lead]);
 const merged=await call('analytics',null,{run,period:'all'});
 assert.deepEqual((await call('metric_members',null,{run,period:'all',member_metric:'added',expected:1,snapshot:merged.snapshot,as_of:merged.as_of})).items,[{id:survivor}]);
 assert.equal((await pool.query('select categories from procurement_run_result_members where trigger_id=$1',[run])).rows[0].categories[0],'opportunity','Merge retains historical classification');
 const oldPage=await call('metric_members',null,{run,period:'all',member_metric:'added',expected:1,snapshot:report.snapshot,as_of:report.as_of});assert.ok(oldPage.unavailable);
 await pool.query(`update procurement_leads set payload=payload||jsonb_build_object('canonical_redirect',jsonb_build_object('policy','county-ionwave-solicitation-v1','lead_id',$1::text)) where id=$2`,[lead,survivor]);
 assert.equal((await api('rpc/procurement_scheduling_read',userToken,{p_read:'analytics',p_filters:{run,period:'all'}})).status,400,'Chained/cyclic canonical identity fails closed');
 await pool.query("update procurement_triggers set state='running' where id=$1",[run]);
 const active=await call('run',run,{projection:'progress'});assert.equal(active.progress_only,true);assert.equal(active.state,'running');assert.equal(active.reporting_pending,true);
 return {native_roles:true,source_setup:true,member_count_equality:true,reopen:true,canonical_merge:true,historical_classification:true,active_progress:true,read_mutations:0,production_contacted:false};
}
