import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {adminAnalytics} from '../../scripts/lib/admin-analytics.mjs';
// Shared fixture runs against PGlite and the isolated native PostgreSQL/PostgREST.
export async function verifyAnalyticsDatabase({sql,db}){
 const actor=randomUUID(),sid=randomUUID(),request=randomUUID();
 await sql.query('insert into auth.users(id)values($1)',[actor]);
 await sql.query(`insert into procurement_schedules(id,name,config,scope_hash,window_policy,recurrence,client_key,submission_hash,created_by,owner_id)values($1,'Analytics isolated','{}','scope','{}','{}',$2,'hash',$3,$3)`,[sid,'analytics-'+sid,actor]);
 await sql.query(`insert into procurement_search_requests(id,name,search_boundary_mode,requested_search_areas)values($1,'Analytics','exact_area','[{"area_type":"state","state_code":"AR"}]')`,[request]);
 const runIds=[];
 for(let i=0;i<31;i++){
  const id=randomUUID();runIds.push(id);
  await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,schedule_id,state,created_at,finished_at)values($1,'state_source',$2,$3,$4,'hash',$5,'completed','2026-10-20T12:00:00Z','2026-10-20T12:01:00Z')`,[id,{target_kind:'state_source',county_ids:['05125'],requested_categories:['opportunity'],state_trigger_ids:[randomUUID(),randomUUID()]},actor,'analytics-'+id,sid]);
 }
 await sql.query(`insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values('05125','county','Saline County','fixture','1','analytics')on conflict(id)do nothing`);
 await sql.query(`insert into procurement_trigger_requests(trigger_id,request_id,county_id,role,scope)values($1,$2,'05125','state_source','{}')`,[runIds[0],request]);
 const lead=randomUUID(),checkpoint={stage:'import_verified',receipt:{verified:true},reporting_records:{version:1,records:[{id:lead,category:'historical_opportunity',outcome:'added',intake_ids:[]}]},private_trace:'NEVER PUBLIC'};
 await sql.query(`insert into procurement_jobs(search_request_id,dedupe_key,kind,state,checkpoint)values($1,$2,'process','succeeded',$3)`,[request,'api-import:analytics:'+request,checkpoint]);
 const service=adminAnalytics(db,{now:()=>new Date('2026-10-21T12:00:00Z')}),filter={schedule:sid,from:'2026-10-20',through:'2026-10-20',limit:10};
 const first=await service(filter);assert.equal(first.total,31);assert.equal(first.summary.runs,31);assert.equal(first.items.length,10);assert.equal(first.summary.unique_leads.value,null);assert.equal(first.summary.unique_leads.known_subtotal,1);assert.equal(first.summary.categories.opportunity.known_subtotal,1);assert.equal(first.summary.timing.samples,31);assert.equal(first.next_offset,10);
 assert.equal(JSON.stringify(first).includes('NEVER PUBLIC'),false);assert.equal(JSON.stringify(first).includes(lead),false,'Public totals do not download lead identities');
 const last=await service({...filter,offset:30,as_of:first.as_of,snapshot:first.snapshot});assert.equal(last.items.length,1);assert.equal(last.summary.unique_leads.known_subtotal,1);assert.equal(last.next_offset,null);
 await sql.query(`update procurement_triggers set created_at='2026-10-22T12:00:00Z' where id=$1`,[runIds[30]]);
 await assert.rejects(service({...filter,offset:10,as_of:first.as_of,snapshot:first.snapshot}),/changed/);
 assert.equal((await service({...filter,geography:'05001'})).total,0);
 assert.equal((await service({schedule:sid,period:'all'})).total,30);
 const older=randomUUID();
 await sql.query(`insert into procurement_triggers(id,target_kind,config,initiated_by,client_key,submission_hash,schedule_id,state,created_at)values($1,'sam',$2,$3,$4,'hash',$5,'completed','2026-09-01T12:00:00Z')`,[older,{target_kind:'sam',requested_categories:['opportunity']},actor,'analytics-'+older,sid]);
 await sql.query(`insert into procurement_usage_ledger(id,request_id,actor_id,kind,provider,model,rate_version,input_tokens,output_tokens,reserved_usd,actual_usd,state,usage,created_at,trigger_id)values($1,$2,$3,'inference','fixture','fixture','1',10,5,1,0.5,'completed',$4,'2026-10-20T13:00:00Z',$5)`,[randomUUID(),request,actor,{input_tokens:10,output_tokens:5},older]);
 assert.equal((await service(filter)).summary.usage.actual_usd,0.5,'Period spend includes ledger events from a run created before the period');
 await sql.query(`insert into procurement_triggers(target_kind,config,initiated_by,client_key,submission_hash,schedule_id,state,created_at)select 'sam','{}',$1,$2||n,'hash',$3,'completed','2026-01-01T12:00:00Z' from generate_series(1,2000)n`,[actor,'analytics-old-'+sid,sid]);
 assert.equal((await service(filter)).total,30,'A large older history does not prevent bounded period reporting');
 await assert.rejects(service({schedule:sid,period:'all'}),/exceeded bound/);
 await sql.query(`insert into procurement_workflow_steps(trigger_id,phase,attempt_key,state,actor_id,origin,started_at,finished_at)select $1,'compare',$2||n,'completed',$3,'manual','2026-10-20T12:00:00Z','2026-10-20T12:00:01Z' from generate_series(1,10000)n`,[runIds[0],'analytics-large-log-'+sid,actor]);
 const largeLogs=await service(filter);
 assert.equal(largeLogs.total,30);assert.equal(largeLogs.summary.unique_leads.known_subtotal,1);assert.equal(largeLogs.summary.usage.actual_usd,0.5);
 assert.equal(largeLogs.summary.timing.samples,30);assert.equal(largeLogs.summary.timing.recorded_activity_unavailable,true);
 assert.ok(largeLogs.items.every(r=>r.timing.recorded_activity_ms===null&&r.timing.completeness==='unknown'&&r.timing.reason.includes('view run logs')),'Oversized logs never hide unrelated analytics or become truncated timing');
 return {runs:31,paged:true,grouped_parent_once:true,snapshot_change_rejected:true};
}
