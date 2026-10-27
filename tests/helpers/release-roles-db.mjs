import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {workflowServer} from '../../scripts/lib/workflow-http.mjs';
import {profileCapabilities} from '../../scripts/lib/procurement-capabilities.mjs';

export async function verifyReleaseRoles({pool,db,api,first,second,userToken,adminToken}){
 await pool.query(`create type public.app_role as enum ('user','admin');
 create table public.profiles(id uuid primary key default gen_random_uuid(),user_id uuid unique not null references auth.users(id),
 email text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 role public.app_role not null default 'user',first_name text,last_name text,zip_code text);
 alter table public.profiles enable row level security;
 create policy profile_self_read on public.profiles for select using (auth.uid()=user_id);
 create policy profile_self_update on public.profiles for update using (auth.uid()=user_id);
 create policy profile_self_insert on public.profiles for insert with check (auth.uid()=user_id);
 grant select,insert,update on public.profiles to authenticated;
 grant all on public.profiles to service_role;`);
 await pool.query("insert into public.profiles(user_id,email,role) values($1,'user@example.test','user'),($2,'admin@example.test','admin')",[first,second]);
 for(const name of ['20261026000100_protect_profile_role.sql','20261026000200_procurement_profile_capabilities.sql',
   '20261026000300_procurement_source_decisions.sql','20261026000400_procurement_source_exclusion_claims.sql'])
   await pool.query(readFileSync('supabase/migrations/'+name,'utf8'));
 await pool.query("notify pgrst, 'reload schema'");
 let ready=false;
 for(let n=0;n<30;n++){
  const r=await api('rpc/procurement_capabilities',userToken,{});
  if(r.status===200){assert.equal(r.body.role,'user');ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,'New RPC visible through native PostgREST');
 assert.equal((await api('rpc/procurement_capabilities',adminToken,{})).body.role,'admin');
 const personal=await api(`profiles?user_id=eq.${first}`,userToken,{first_name:'Pat'},'PATCH');assert.ok([200,204].includes(personal.status));
 assert.equal((await api(`profiles?user_id=eq.${first}`,userToken,{role:'admin'},'PATCH')).status,403);
 assert.equal((await api('procurement_sources?select=*&limit=1',userToken)).body.length,0);
 const labels=await api('procurement_source_labels?select=*&limit=1',userToken);assert.equal(labels.status,200);assert.ok(labels.body.length);
 assert.ok((await api('procurement_sources?select=id&limit=1',adminToken)).body.length);
 assert.equal((await api('rpc/record_procurement_source_decision',userToken,{p_actor:second,p_task:first,p_version:0,p_decision:'no_issue',p_reason:'spoof',p_key:'spoof-admin-key',p_revision:'spoof'})).status,403);
 const {rows:[task]}=await pool.query(`insert into procurement_coverage_tasks(target_id,task_key,agency_scope,route_geography_id,kind,
   priority,reason,state,evidence,query_window,source_id,capability_id)
   select target_id,'native-review-scope',agency_scope,route_geography_id,kind,priority,reason,state,evidence,query_window,source_id,capability_id
   from procurement_coverage_tasks where kind='opportunity' limit 1 returning *`);
 assert.ok(task,'Native source decision uses a real scoped coverage task');
 const revisions=await db.rpc('procurement_source_review_revisions',{p_tasks:[task.id]});assert.equal(revisions.error,null);
 const decision={p_actor:second,p_task:task.id,p_version:0,p_decision:'no_website',p_reason:'Native scoped source decision',p_key:'native-decision-key',p_revision:revisions.data[task.id],p_reenable:false};
 const saved=await db.rpc('record_procurement_source_decision',decision);assert.equal(saved.error,null);assert.equal(saved.data.checks_excluded,true);
 const replay=await db.rpc('record_procurement_source_decision',decision);assert.equal(replay.error,null);assert.deepEqual(replay.data,saved.data);
 const stale=await db.rpc('record_procurement_source_decision',{...decision,p_key:'native-stale-review'});assert.equal(stale.error?.code,'40001');
 assert.equal((await pool.query('select state from procurement_coverage_tasks where id=$1',[task.id])).rows[0].state,task.state);
 const {rows:[job]}=await pool.query(`insert into procurement_jobs(search_request_id,task_id,dedupe_key,kind,state)
   select search_request_id,$1,'native-source-excluded','collect','pending' from procurement_request_targets where id=$2 returning id`,[task.id,task.target_id]);
 assert.equal((await db.rpc('claim_procurement_known_job',{p_job_id:job.id})).data,null);
 assert.equal((await pool.query('select state from procurement_jobs where id=$1',[job.id])).rows[0].state,'blocked');
 const reopened=await db.rpc('record_procurement_source_decision',{...decision,p_version:1,p_decision:'unreviewed',p_key:'native-review-reopen'});
 assert.equal(reopened.error,null);assert.equal(reopened.data.checks_excluded,true);
 const enabled=await db.rpc('record_procurement_source_decision',{...decision,p_version:2,p_decision:'unreviewed',p_key:'native-review-enable',p_reenable:true});
 assert.equal(enabled.error,null);assert.equal(enabled.data.checks_excluded,false);
 // No legacy membership is consulted; deleting the disposable Admin membership
 // cannot change trusted profile capabilities. No production data is contacted.
 const legacy=(await pool.query('delete from procurement_members where user_id=$1 returning id,user_id',[second])).rows;
 assert.equal((await profileCapabilities(db,second)).manage_sources,true);
 for(const row of legacy)await pool.query('insert into procurement_members(id,user_id) values($1,$2)',[row.id,row.user_id]);
 const originalMemberships=(await pool.query('select * from procurement_members order by id')).rows;
 await pool.query(readFileSync('supabase/migrations/20261026000500_retire_procurement_members.sql','utf8'));
 assert.equal((await pool.query("select to_regclass('public.procurement_members') as name")).rows[0].name,null);
 const archived=(await pool.query("select detail->'record' as record from procurement_events where event_type='legacy_procurement_membership_archived' order by detail->'record'->>'id'")).rows.map(r=>r.record);
 assert.deepEqual(archived,originalMemberships);
 assert.equal((await pool.query("select count(*)::int as n from pending_procurement_events('native-external-consumer',1000) where event_type like 'source_review_%' or event_type='legacy_procurement_membership_archived'")).rows[0].n,0);
 assert.equal((await profileCapabilities(db,second)).manage_sources,true);
 const server=workflowServer({authenticate:async token=>({id:token==='admin'?second:first}),
  capabilities:actor=>profileCapabilities(db,actor),schedules:{list:async()=>({items:[],next_offset:null})},
  triggers:{steps:async()=>({items:[{private:'must not leak'}]})}});
 const call=(path,token)=>new Promise(resolve=>{
  const req=Readable.from([]);Object.assign(req,{url:path,method:'GET',headers:{authorization:`Bearer ${token}`}});
  server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(text){resolve({status:this.status,body:JSON.parse(text)});}});
 });
 try{
  assert.equal((await call('/v1/schedules','user')).status,200);
  assert.equal((await call(`/v1/triggers/${first}/steps`,'user')).status,403);
  assert.equal((await call(`/v1/triggers/${first}/steps`,'admin')).status,200);
  await pool.query("update profiles set role='user' where user_id=$1",[second]);
  assert.equal((await call(`/v1/triggers/${first}/steps`,'admin')).status,403,'Stale token loses authority immediately');
 }finally{server.close();}
 return {passed:true,profile_authority:true,direct_role_escalation_denied:true,safe_source_labels:true,stale_role_denied:true,production_contacted:false};
}
