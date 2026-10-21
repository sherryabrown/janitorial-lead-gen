import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsFilters,aggregateAnalytics} from '../scripts/lib/admin-analytics.mjs';
import {verifiedReportingRecords} from '../scripts/lib/verified-reporting-records.mjs';
import {verifyAnalyticsDatabase} from './helpers/analytics-db.mjs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {workflowServer} from '../scripts/lib/workflow-http.mjs';
import {Readable} from 'node:stream';
const now=new Date('2026-10-20T17:00:00Z'),f=analyticsFilters({},now);
const run=(id,config={})=>({id,state:'completed',target_kind:'county_scope',origin:'manual',created_at:'2026-10-20T12:00:00Z',finished_at:'2026-10-20T12:01:00Z',config:{requested_categories:['opportunity','award'],check_updates:true,...config}});
const job=(id,records,extra={})=>({id,state:'succeeded',search_request_id:id,checkpoint:{stage:'import_verified',automatic:{exclusions:[]},receipt:{verified:true},reporting_records:{version:1,records},...extra}});
const record=(id,outcome='added',category='opportunity')=>({id,outcome,category,intake_ids:[id]});
test('CT calendar defaults and DST boundaries are real dates, not fixed 24-hour offsets',()=>{
 assert.equal(f.from,'2026-10-14');assert.equal(f.through,'2026-10-20');assert.equal(f.start,'2026-10-14T05:00:00.000Z');
 for(const [date,start,end] of [['2026-03-08','2026-03-08T06:00:00.000Z','2026-03-09T05:00:00.000Z'],['2026-11-01','2026-11-01T05:00:00.000Z','2026-11-02T06:00:00.000Z']]){const b=analyticsFilters({from:date,through:date},new Date('2026-12-01T00:00:00Z'));assert.equal(b.start,start);assert.equal(b.end,end);}
 for(const bad of [{from:'2026-02-30'},{period:'all'},{sort:'checkpoint'},{category:'company'},{as_of:'2099-01-01T00:00:00Z'},{from:'2020-01-01'}])assert.throws(()=>analyticsFilters(bad,now));
});
test('distinct IDs, outcome precedence, grouped parent runs, category transitions, legacy and unsettled results',()=>{
 const runs=[run('a'),run('b',{target_kind:'sam'})],children=[{trigger_id:'a',request_id:'one'},{trigger_id:'a',request_id:'two'},{trigger_id:'b',request_id:'three'}];
 const jobs=[job('one',[record('lead'),record('same','unchanged')]),job('two',[record('lead','updated')]),job('three',[record('lead','updated','award'),record('new','added','historical_opportunity')])];
 const input={runs,children,jobs,steps:[{trigger_id:'a',started_at:'2026-10-20T12:00:00Z',finished_at:'2026-10-20T12:00:10Z'},{trigger_id:'a',started_at:'2026-10-20T12:00:03Z',finished_at:'2026-10-20T12:00:05Z'}]};
 const result=aggregateAnalytics(input,f);assert.equal(result.summary.runs,2);assert.equal(result.summary.unique_leads.value,3);assert.equal(result.summary.outcomes.added.value,2);assert.equal(result.summary.outcomes.updated.value,0);assert.equal(result.summary.outcomes.unchanged.value,1);
 assert.equal(result.summary.run_events.updated.value,1);assert.equal(result.summary.categories.award.value,1);assert.equal(result.summary.categories.opportunity.value,3);assert.equal(result.summary.historical_opportunities.value,1);assert.equal(result.runs[0].timing.recorded_activity_ms,10000);assert.equal(result.summary.timing.samples,2);
 assert.deepEqual(aggregateAnalytics({...input,jobs:[...jobs].reverse()},f),result);
 const legacy=aggregateAnalytics({runs:[run('a')],children,jobs:[job('one',[],{reporting_records:null,county_records:[{id:'old',added:true,updated:false}]})]},f);assert.equal(legacy.summary.unique_leads.value,1);assert.equal(legacy.summary.categories.opportunity.value,null);assert.equal(legacy.summary.unclassified_known_leads,1);
 const unknown=aggregateAnalytics({...input,jobs:[...jobs,{...job('two',[record('unverified')]),state:'outcome_unknown',checkpoint:{stage:'import_reconcile',receipt:{verified:false}}}]},f);assert.equal(unknown.summary.unique_leads.value,null);assert.equal(unknown.summary.unique_leads.known_subtotal,3);
 assert.equal(aggregateAnalytics({runs:[]},f).summary.unique_leads.value,0);
});
test('attention counts unresolved actionable intake only; sources and route gaps deduplicate independently',()=>{
 const runs=[run('a'),run('b')],children=[{trigger_id:'a',request_id:'one'},{trigger_id:'b',request_id:'two'}];
 const exclusions=[{intake_id:'bad',reason:'Current validated evidence is required.'},{intake_id:'fixed',reason:'Conflicting current observations require correction.'},{intake_id:'tx',reason:'Official work-performance evidence does not establish Arkansas.'}];
 const jobs=[job('one',[],{automatic:{exclusions}}),job('two',[],{automatic:{exclusions}})];
 const targets=[{id:'t1',search_request_id:'one',geography_id:'05125'},{id:'t2',search_request_id:'two',geography_id:'05125'}];
 const tasks=targets.flatMap(t=>[{id:t.id+'s',target_id:t.id,source_id:'shared',state:'method_missing',kind:'opportunity'},{id:t.id+'g',target_id:t.id,source_id:null,state:'source_missing',kind:'opportunity'}]);
 const r=aggregateAnalytics({runs,children,jobs,targets,tasks,intakes:[{id:'fixed',status:'processed'}]},f);
 assert.equal(r.summary.candidates_attention.value,1);assert.equal(r.summary.validation_failures.value,1);assert.equal(r.summary.sources_attention,1);assert.equal(r.summary.route_gaps,1);
});
test('ledger events count once, mixed/missing credits and held or failed usage never become zero actuals',()=>{
 const entry=(id,unit)=>({id,trigger_id:'a',created_at:'2026-10-20T12:00:00Z',state:'completed',actual_usd:0.1,reserved_usd:1,usage:{input_tokens:10,output_tokens:5,credits:2,credit_unit:unit}});
 const a=entry('u1','credits'),b=entry('u2','other');
 const r=aggregateAnalytics({runs:[{...run('a'),created_at:'2026-10-01T00:00:00Z'}],usage:[a,a,b]},f);
 assert.equal(r.summary.runs,0);assert.equal(r.summary.usage.actual_usd,0.2);assert.equal(r.summary.usage.credits,null);assert.equal(r.summary.usage.input_tokens,20);
 const unknown=aggregateAnalytics({runs:[run('a')],usage:[a,{...b,state:'outcome_unknown',actual_usd:null}]},f).summary.usage;
 assert.equal(unknown.ai,'unknown');assert.equal(unknown.actual_usd,null);assert.equal(unknown.known_actual_usd,0.1);assert.equal(unknown.held_usd,1);
 assert.equal(aggregateAnalytics({runs:[]},f).summary.usage.ai,'not_used');
 const missing=aggregateAnalytics({runs:[run('a')],usage:[{...a,actual_usd:null}]},f).summary.usage;assert.equal(missing.actual_usd,null);
});
test('verified manifest reporting is deterministic and contains no private payload or mutable sales data',()=>{
 const manifest={records:[{id:'a',expected_payload:null,payload:{bid_type:'award',notes:'private'}},{id:'b',expected_payload:{bid_type:'opportunity'},payload:{bid_type:'opportunity'}}],decisions:[{lead_id:'a',intake:{id:'i'}}]};
 const r=verifiedReportingRecords(manifest);assert.deepEqual(r,{version:1,records:[{id:'a',category:'award',outcome:'added',intake_ids:['i']},{id:'b',category:'opportunity',outcome:'unchanged',intake_ids:[]}]});assert.equal(JSON.stringify(r).includes('private'),false);
});
test('SAM saved zero-write validation retains actionable exceptions without inflating leads or awards',()=>{
 const sam={id:'a',state:'succeeded',search_request_id:'r',checkpoint:{stage:'sam_review',sam_completed:true,sam_exclusions:[{intake_id:'bad',reason:'Saved record has no supported SAM evidence.'},{intake_id:'tx',reason:'Official work-performance evidence does not establish Arkansas.'}]}};
 const result=aggregateAnalytics({runs:[run('s')],children:[{trigger_id:'s',request_id:'r'}],jobs:[sam]},f);assert.equal(result.summary.unique_leads.value,0);assert.equal(result.summary.candidates_attention.value,1);
 const intent=aggregateAnalytics({runs:[run('s')],children:[{trigger_id:'s',request_id:'r'}],jobs:[job('r',[record('intent','added','intent_to_award')])]},f);assert.equal(intent.summary.categories.award.value,null);assert.equal(intent.summary.categories.award.known_subtotal,0);assert.equal(intent.summary.unclassified_known_leads,1);
});
test('SQL reporting includes full filtered totals beyond page one and rejects changing snapshots',async()=>{const sql=await adminDatabase();try{await verifyAnalyticsDatabase({sql,db:sqlApi(sql)});}finally{await sql.close();}});
test('analytics HTTP boundary authenticates, bounds pages and exposes only fixed safe failures',async()=>{
 const actor='00000000-0000-4000-8000-000000000001';let fail=false;
 const server=workflowServer({authenticate:async()=>({id:actor}),schedules:{analytics:async input=>{if(fail)throw Error('Scoped read exceeded bound; narrow the query before proceeding');return {total:0,filters:input};}}});
 const call=(path,headers={})=>new Promise(resolve=>{const req=Readable.from([]);Object.assign(req,{url:path,method:'GET',headers});server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(body){resolve({status:this.status,body:JSON.parse(body)});}});});
 const url='/v1/admin/analytics',auth={authorization:'Bearer fixture'};assert.equal((await call(url)).status,401);assert.equal((await call(url+'?limit=101',auth)).status,400);fail=true;assert.match((await call(url,auth)).body.unavailable,/no truncated totals/);
});
