import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { countyTriggers,adminSourcePlan } from '../scripts/lib/county-triggers.mjs';
import { workflowAudit,usageSummary,currentAudit } from '../scripts/lib/workflow-audit.mjs';
import { workflowServer } from '../scripts/lib/workflow-http.mjs';
import { executeKnownSources } from '../scripts/lib/known-source-collection.mjs';
import { adminDatabase,sqlApi } from './helpers/admin-trigger-db.mjs';
import { id } from './helpers/known-workflow.mjs';

const city='ARM'+'a'.repeat(32),actor=id(1);
const input={county_ids:['05001','05003'],target_kind:'county_scope',maintain_sources:true,check_updates:true,
  requested_categories:['opportunity'],search_windows:{opportunity:{from:'2026-10-13',to:'2027-10-13',date_basis:'deadline'}}};
async function fixture() {
  const sql=await adminDatabase();
  await sql.exec(`insert into auth.users values('${actor}');
    insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values
    ('05','state','Arkansas','fixture','1','state'),('05001','county','Arkansas County','fixture','1','a'),
    ('05003','county','Ashley County','fixture','1','b'),('${city}','municipality','Almyra','fixture','1','c');
    insert into procurement_place_counties values('${city}','05001');`);
  const db=sqlApi(sql),audit=workflowAudit(db),calls=[];
  const service=countyTriggers({db,audit,discovery:async(requestId,task)=>{calls.push({requestId,task});return {state:'blocked'};},
    workflow:{status:async()=>({total_candidates:0})}});
  return {sql,db,audit,service,calls};
}
test('a planning failure cannot appear completed just because it created no coverage tasks',async()=>{
  const {sql,service}=await fixture();try {
    const config={...input,maintain_sources:false},preview=await service.preview(config);
    const run=await service.submit({...config,confirmed_scope:true,preview_hash:preview.preview_hash},actor,'blocked-before-plan');
    await sql.exec("update procurement_jobs set state='blocked',checkpoint=jsonb_build_object('stage','plan','error_code','workflow_stage_failed')");
    assert.equal((await sql.query('select count(*)::int n from procurement_coverage_tasks')).rows[0].n,0);
    await service.step();assert.equal((await service.status(run.trigger_id)).state,'needs_review');
  }finally{await sql.close();}
});

test('a failed collection coordinator yields attention instead of starving newer runs behind untouched captures',async()=>{
  const {sql,service}=await fixture();try {
    const config={...input,county_ids:['05001'],maintain_sources:false},p=await service.preview(config),submission={...config,confirmed_scope:true,preview_hash:p.preview_hash};
    const first=await service.submit(submission,actor,'failed-collection-old');
    const request=(await service.status(first.trigger_id)).children[0].request_id;
    await sql.query("update procurement_jobs set state='blocked',checkpoint=$2 where search_request_id=$1",[request,{stage:'collect',error_code:'workflow_stage_failed'}]);
    await sql.query("insert into procurement_jobs(search_request_id,dedupe_key,kind,state) values($1,'untouched-capture','collect','pending')",[request]);
    const second=await service.submit(submission,actor,'failed-collection-new');
    await service.step();assert.equal((await service.status(first.trigger_id)).state,'needs_review');
    await service.step();
    const values=(await sql.query('select id,attempts from procurement_triggers')).rows;
    assert.equal(values.find(r=>r.id===first.trigger_id).attempts,1);assert.equal(values.find(r=>r.id===second.trigger_id).attempts,1);
    assert.equal((await sql.query("select state from procurement_jobs where dedupe_key='untouched-capture'")).rows[0].state,'pending','No failed collection is retried or discarded');
  }finally{await sql.close();}
});

for(const [coordinator,child,expected] of [
  ['pending','pending','pending'],['blocked','running','pending'],['blocked','outcome_unknown','outcome_unknown'],
])test(`collection attention preserves ${coordinator} coordinator / ${child} capture safeguards`,async()=>{
 const {sql,service}=await fixture();try{
  const config={...input,county_ids:['05001'],maintain_sources:false},p=await service.preview(config),run=await service.submit({...config,confirmed_scope:true,preview_hash:p.preview_hash},actor,'collection-safeguard');
  const request=(await service.status(run.trigger_id)).children[0].request_id;
  await sql.query('update procurement_jobs set state=$2,checkpoint=$3 where search_request_id=$1',[request,coordinator,{stage:'collect',...(coordinator==='blocked'?{error_code:'workflow_stage_failed'}:{})}]);
  await sql.query("insert into procurement_jobs(search_request_id,dedupe_key,kind,state) values($1,'capture-safeguard','collect',$2)",[request,child]);
  await service.step();assert.equal((await service.status(run.trigger_id)).state,expected);
 }finally{await sql.close();}
});
test('confirmed multi-county submission is atomic, all-city scoped, idempotent and skips repeated state onboarding',async()=>{
  const {sql,service}=await fixture();try {
    const preview=await service.preview(input);
    assert.deepEqual(preview.config.counties[0].cities,[{id:city,name:'Almyra'}]);
    await assert.rejects(service.submit({...input,confirmed_scope:true,preview_hash:'changed'},actor,'admin-key-one'),/Scope changed/);
    assert.equal((await sql.query('select count(*)::int n from procurement_triggers')).rows[0].n,0);
    const submitted={...input,confirmed_scope:true,preview_hash:preview.preview_hash};
    const first=await service.submit(submitted,actor,'admin-key-one');
    assert.equal((await service.submit(submitted,actor,'admin-key-one')).trigger_id,first.trigger_id);
    assert.equal((await service.submit({...submitted,county_ids:[...submitted.county_ids].reverse()},actor,'admin-key-one')).trigger_id,first.trigger_id);
    await assert.rejects(service.submit({...submitted,check_updates:false},actor,'admin-key-one'),/different input/);
    const scope=(await sql.query("select selected_city_ids from procurement_search_requests where workflow_control->>'admin_policy'='county_scope' and requested_geography_id='05001'")).rows[0];
    assert.deepEqual(scope.selected_city_ids,[city]);
    const stateTargets=(await sql.query("select t.* from procurement_request_targets t join procurement_search_requests r on r.id=t.search_request_id where workflow_control->>'admin_policy'='county_scope' and geography_id='05'")).rows;
    assert.equal(stateTargets.length,0);
    await service.submit(submitted,actor,'admin-key-two');
    assert.equal((await sql.query('select count(*)::int n from procurement_county_state_research')).rows[0].n,2);
    assert.equal((await sql.query("select count(*)::int n from procurement_trigger_requests where role='state_research'")).rows[0].n,2);
    const noAi=(await service.status(first.trigger_id)).usage;
    assert.equal(noAi.ai,'not_used');assert.equal(noAi.actual_usd,0);
    const activity=await service.list({limit:1});assert.equal(activity.items.length,1);assert.ok(activity.next_offset);
    assert.equal(activity.items[0].county_count,2);assert.equal(activity.items[0].candidate_count,0);assert.equal(activity.items[0].evidence_count,0);assert.equal(activity.items[0].usage.actual_usd,0);
    assert.equal('config' in activity.items[0],false);
  }finally{await sql.close();}
});
test('source planner uses existing adapters, preserves legacy state routes and isolates Admin source targets',async()=>{
  const {sql,db,service}=await fixture();try {
    const p=await service.preview(input),result=await service.submit({...input,preview_hash:p.preview_hash,confirmed_scope:true},actor,'admin-key-one');
    const children=(await service.status(result.trigger_id)).children;
    for(const child of children)await executeKnownSources({db,project:'fixture',command:'plan',requestId:child.request_id});
    const county=children.find(c=>c.role==='county');
    const taskGeographies=(await sql.query('select route_geography_id from procurement_coverage_tasks t join procurement_request_targets r on r.id=t.target_id where r.search_request_id=$1',[county.request_id])).rows;
    assert.ok(taskGeographies.every(t=>t.route_geography_id!=='05'));
    const request={requested_categories:['opportunity'],search_windows:input.search_windows};
    const targets=[{id:id(9),geography_id:'05'}],geos=[{id:'05',kind:'state',source_active:true}];
    assert.ok(adminSourcePlan(request,targets,geos,[],[]).tasks.some(t=>t.route_geography_id==='05'));
    assert.equal(adminSourcePlan({...request,workflow_control:{admin_policy:'state_research',check_updates:false}},targets,geos,[],[]).tasks.some(t=>t.capability_id||t.kind==='source_entry'),false);
  }finally{await sql.close();}
});
test('SQL shares budgets across children and requires a committed active step before inference',async()=>{
  const {sql,service,db,audit}=await fixture();try {
    const p=await service.preview(input),t=await service.submit({...input,preview_hash:p.preview_hash,confirmed_scope:true},actor,'admin-key-one');
    const children=(await service.status(t.trigger_id)).children;
    const entry=(requestId)=>({id:crypto.randomUUID(),request_id:requestId,actor_id:actor,kind:'inference',provider:'openai',model:'fixture',rate_version:'fixture',input_tokens:8000,output_tokens:2000,reserved_usd:0.2});
    const reserve=async e=>{const r=await db.rpc('reserve_procurement_usage',{p_entry:e,p_monthly_usd:10});if(r.error)throw r.error;return r.data;};
    await assert.rejects(reserve(entry(children[0].request_id)),/active audit step/);
    for(let n=0;n<4;n++)await audit.run(children[n%children.length].request_id,'ai_interpretation',async()=>{
      const e={...entry(children[n%children.length].request_id),step_id:currentAudit().stepId};
      await reserve(e);
      await assert.rejects(reserve({...e,id:crypto.randomUUID()}),/unresolved|budget exhausted/);
      await sql.query("update procurement_usage_ledger set state='completed',actual_usd=0.01,usage=$2 where id=$1",[e.id,{input_tokens:10,output_tokens:5}]);
    },{reason:'provider'});
    await assert.rejects(audit.run(children[0].request_id,'ai_interpretation',()=>reserve({...entry(children[0].request_id),step_id:currentAudit().stepId})),/budget exhausted/);
    const status=await service.status(t.trigger_id);assert.equal(status.usage.input_tokens,40);assert.equal(status.usage.output_tokens,20);assert.equal(status.usage.calls,4);
    const page=await service.steps(t.trigger_id,{limit:2});assert.equal(page.items.length,2);assert.ok(page.next_cursor);
    const next=await service.steps(t.trigger_id,{cursor:page.next_cursor,limit:2});assert.equal(next.items.length,2);assert.notEqual(page.items[0].id,next.items[0].id);
    assert.equal(JSON.stringify(status).includes('rate_version'),false);
  }finally{await sql.close();}
});
test('state-source associations deduplicate across counties; standalone state run never fans out collection',async()=>{
  const {sql,db,service}=await fixture();try {
    await sql.exec(`insert into procurement_sources(id,code,name,url,contracting_entity_geo_level,business_category) values('${id(21)}','state-fixture','State fixture','https://example.gov/bids','state','other_public');`);
    const args={p_source:id(21),p_category:'opportunity',p_scope:'saved-state-scope',p_county:'05001',p_evidence:{basis:'registered_state_category'}};
    const a=await db.rpc('associate_procurement_state_trigger',args),b=await db.rpc('associate_procurement_state_trigger',{...args,p_county:'05003'});
    assert.equal(a.data,b.data);assert.equal((await service.stateSources()).items.length,1);
    const sourceInput={...input,target_kind:'state_source',state_trigger_id:a.data};
    const p=await service.preview(sourceInput),t=await service.submit({...sourceInput,preview_hash:p.preview_hash,confirmed_scope:true},actor,'source-key-one');
    assert.equal((await service.status(t.trigger_id)).children.length,1);
    const request=(await sql.query('select * from procurement_search_requests')).rows[0];
    assert.equal(request.requested_search_areas.length,2);
    assert.equal((await sql.query('select count(*)::int n from procurement_request_targets')).rows[0].n,1);
    await service.control(t.trigger_id,'cancel',actor);assert.equal((await service.status(t.trigger_id)).state,'cancelled');
    await service.control(t.trigger_id,'resume',actor);assert.equal((await service.status(t.trigger_id)).state,'pending');
  }finally{await sql.close();}
});
test('new tables and privileged helpers deny browser roles; coordinator lease is recoverable',async()=>{
  const {sql,service}=await fixture();try {
    const p=await service.preview(input),t=await service.submit({...input,preview_hash:p.preview_hash,confirmed_scope:true},actor,'admin-key-one');
    for(const table of ['procurement_triggers','procurement_trigger_requests','procurement_workflow_steps','procurement_county_state_research','procurement_state_trigger_associations'])
      assert.equal((await sql.query("select has_table_privilege('authenticated',$1,'select') allowed",[table])).rows[0].allowed,false);
    await sql.exec('set role authenticated');await assert.rejects(sql.query('select claim_procurement_trigger()'),/permission denied/);await sql.exec('reset role');
    await sql.query("update procurement_jobs set state='blocked'");
    const first=(await sql.query('select claim_procurement_trigger() t')).rows[0].t;
    assert.equal(first.id,t.trigger_id);assert.equal((await sql.query('select claim_procurement_workflow_job() j')).rows[0].j,null);
    assert.equal((await sql.query('select claim_procurement_trigger() t')).rows[0].t,null);
    await sql.query("update procurement_triggers set lease_until=now()-interval '1 second'");
    const second=(await sql.query('select claim_procurement_trigger() t')).rows[0].t;assert.notEqual(first.lease_token,second.lease_token);
    assert.equal((await sql.query("select checkpoint_procurement_trigger($1,$2,'completed','{}') saved",[first.id,first.lease_token])).rows[0].saved,false);
  }finally{await sql.close();}
});
test('usage projections distinguish actual, reserved, unknown and unbilled quota fallback',()=>{
  assert.equal(usageSummary([]).ai,'not_used');
  const unknown=usageSummary([{state:'outcome_unknown',input_tokens:8000,output_tokens:2000,reserved_usd:0.2}]);
  assert.equal(unknown.ai,'unknown');assert.equal(unknown.input_tokens,null);assert.equal(unknown.actual_usd,null);assert.equal(unknown.held_usd,0.2);
  const complete=usageSummary([{state:'completed',usage:{quota_rejection:true},actual_usd:0},{state:'completed',usage:{input_tokens:15,output_tokens:3},actual_usd:0.001}]);
  assert.equal(complete.ai,'used');assert.equal(complete.input_tokens,15);assert.equal(complete.calls,2);assert.equal(complete.credits,null);
  const credits=usageSummary([{state:'completed',usage:{input_tokens:15,output_tokens:3,credits:0.2,credit_unit:'provider units'},actual_usd:0.001}]);
  assert.equal(credits.credits,0.2);assert.equal(credits.credit_unit,'provider units');
});
test('coordinator delegates missing-source research, retains gaps, and audit failure prevents sends',async()=>{
  const {sql,db,service,calls,audit}=await fixture();try {
    const p=await service.preview(input),t=await service.submit({...input,preview_hash:p.preview_hash,confirmed_scope:true},actor,'admin-key-one');
    const children=(await service.status(t.trigger_id)).children;
    for(const child of children)await executeKnownSources({db,project:'fixture',command:'plan',requestId:child.request_id});
    await sql.exec("update procurement_jobs set state='blocked'");
    assert.equal(await service.step(),true);assert.ok(calls.length>0);
    assert.equal((await service.status(t.trigger_id)).state,'needs_review');
    assert.equal((await sql.query("select count(*)::int n from procurement_county_state_research where state='partial'")).rows[0].n,2);
    const logs=await service.steps(t.trigger_id);assert.ok(logs.items.every(s=>s.state==='completed'&&s.usage.ai==='not_used'));
    await audit.run(children[0].request_id,'PRIVATE-PHASE-TEXT',async()=>true);
    assert.equal(JSON.stringify(await service.steps(t.trigger_id)).includes('PRIVATE-PHASE-TEXT'),false);
    const job=(await sql.query('select id from procurement_jobs where search_request_id=$1 limit 1',[children[0].request_id])).rows[0];
    const orphan=(await db.rpc('begin_procurement_step',{p_input:{trigger_id:t.trigger_id,request_id:children[0].request_id,
      job_id:job.id,job_attempt:1,phase:'collect',attempt_key:crypto.randomUUID(),actor_id:actor,origin:'manual'}})).data;
    await audit.run(children[0].request_id,'collect',async()=>true,{job_id:job.id,job_attempt:2});
    assert.equal((await sql.query('select state from procurement_workflow_steps where id=$1',[orphan])).rows[0].state,'interrupted');
    let sent=false;
    const broken=workflowAudit({...db,rpc:async(name,args)=>name==='begin_procurement_step'?{error:{message:'private failure'}}:db.rpc(name,args)});
    await assert.rejects(broken.run(children[0].request_id,'fetch_page',async()=>{sent=true;}),/Database operation failed/);
    assert.equal(sent,false);
    await service.control(t.trigger_id,'cancel',actor);
    await assert.rejects(audit.run(children[0].request_id,'fetch_page',async()=>{sent=true;}),/cancelled/);
    assert.equal(sent,false);
  }finally{await sql.close();}
});
test('HTTP does not acknowledge a mutation before its audit completion succeeds',async()=>{
  const server=workflowServer({authenticate:async()=>({id:actor}),workflow:{interpret:async()=>({state:'saved'})},
    audit:{run:async(_id,_phase,operation)=>{await operation();throw Error('private completion failure');}}});
  const req=Readable.from([JSON.stringify({findings:[]})]);Object.assign(req,{url:`/v1/requests/${id(3)}/tasks/${id(4)}/interpret`,method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'}});
  let ends=0;const response=await new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(text){ends++;resolve({status:this.status,data:JSON.parse(text)});}}));
  assert.equal(response.status,422);assert.equal(ends,1);assert.equal(JSON.stringify(response).includes('private completion'),false);server.close();
});
test('first county research reuses registered state sources and later county requests never enqueue their collection',async()=>{
  const {sql,db,service}=await fixture();try {
    await sql.exec(`insert into procurement_sources(id,code,name,url,contracting_entity_geo_level,business_category)
      values('${id(21)}','state-fixture','State fixture','https://example.gov/bids','state','other_public');
      insert into procurement_source_capabilities(source_id,kind,method,endpoint_url,official_entry_url,route_geography_id,availability,verified_at,verified_until,verification_evidence,parser_version,method_spec)
      values('${id(21)}','opportunity','browser','https://example.gov/bids','https://example.gov/bids','05','active',now()-interval '1 day',now()+interval '30 days','{"basis":"official fixture"}','fixture-v1',
        '{"version":1,"runner_id":"public-fetch","check_when":"each_request","urls":["https://example.gov/bids"],"allowed_hosts":["example.gov"],"max_bytes":2000}');`);
    const p=await service.preview(input),submitted={...input,preview_hash:p.preview_hash,confirmed_scope:true};
    const first=await service.submit(submitted,actor,'admin-key-one');
    for(const child of (await service.status(first.trigger_id)).children)await executeKnownSources({db,project:'fixture',command:'plan',requestId:child.request_id});
    await sql.exec("update procurement_jobs set state='blocked'");await service.step();
    const saved=(await service.stateSources()).items;assert.equal(saved.length,1);assert.deepEqual(saved[0].county_ids,['05001','05003']);assert.equal(saved[0].scheduled,false);
    const second=await service.submit(submitted,actor,'admin-key-two');
    const secondChildren=(await service.status(second.trigger_id)).children;assert.equal(secondChildren.some(c=>c.role==='state_research'),false);
    for(const child of secondChildren)await executeKnownSources({db,project:'fixture',command:'plan',requestId:child.request_id});
    assert.equal((await sql.query("select count(*)::int n from procurement_jobs j join procurement_coverage_tasks c on c.id=j.task_id where j.kind='collect' and c.source_id=$1",[id(21)])).rows[0].n,0);
    assert.equal((await service.status(second.trigger_id)).related_state_sources[0].id,saved[0].id);
  }finally{await sql.close();}
});
test('Admin HTTP contract authenticates, bounds pagination and preserves actor/idempotency input',async()=>{
  let submitted;
  const server=workflowServer({authenticate:async()=>({id:actor}),workflow:{},triggers:{counties:async()=>({counties:[]}),submit:async(...a)=>{submitted=a;return {trigger_id:id(3)};}}});
  const call=(path,method='GET',input,auth=true)=>new Promise(resolve=>{
    const req=Readable.from(input?[JSON.stringify(input)]:[]);Object.assign(req,{url:path,method,headers:{...(auth?{authorization:'Bearer fixture'}:{}),'content-type':'application/json','idempotency-key':'admin-key-one'}});
    server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(text){resolve({status:this.status,data:JSON.parse(text)});}});
  });
  assert.equal((await call('/v1/counties','GET',null,false)).status,401);
  assert.equal((await call('/v1/triggers?limit=101')).status,400);
  assert.equal((await call('/v1/triggers','POST',{confirmed_scope:true})).status,202);
  assert.equal(submitted[1],actor);assert.equal(submitted[2],'admin-key-one');server.close();
});
