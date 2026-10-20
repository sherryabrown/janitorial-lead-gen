import test from 'node:test';import assert from 'node:assert/strict';
import {countyPresentation,sourceAttention,discoveryJob,countyPresentations} from '../scripts/lib/county-source-attention.mjs';
const trigger={id:'trigger',target_kind:'county_scope',state:'needs_review'};
const task={id:'gap',target_id:'target',source_id:'source',kind:'opportunity',state:'method_missing'};
const seed=()=>({children:[{trigger_id:'trigger',request_id:'request',role:'county'}],requests:[{id:'request',workflow_control:{}}],tasks:[task],jobs:[{id:'wait',search_request_id:'request',kind:'process',dedupe_key:'api-workflow:request',state:'blocked',checkpoint:{stage:'interpret'}}],interpretations:[],usage:[]});
test('settled county source-only/empty gaps have presentation without changing state; complete and other workflows do not',()=>{
 assert.equal(countyPresentation(trigger,seed()).outcome,'source_attention');assert.equal(trigger.state,'needs_review');
 assert.equal(countyPresentation({...trigger,target_kind:'sam'},seed()),null);assert.equal(countyPresentation({...trigger,target_kind:'state_source'},seed()),null);
 assert.equal(countyPresentation(trigger,{...seed(),tasks:[{...task,state:'reviewed_no_results'}]}),null);
 for(const state of ['pending','running','outcome_unknown','cancelled'])assert.equal(countyPresentation({...trigger,state},seed()),null);
});
test('active children, paused/cancelled requests, actual faults and unresolved imports retain stronger status',()=>{
 for(const state of ['pending','running','outcome_unknown','cancelled','paused']){
  const s=seed();s.jobs.push({id:'active',state,checkpoint:{},search_request_id:'request'});assert.equal(countyPresentation(trigger,s),null);
 }
 for(const c of [{stage:'interpret',error_code:'workflow_stage_failed'},{stage:'import_awaiting_approval'},{stage:'import_reconcile'}]){
  const s=seed();s.jobs.push({id:'fault',state:'blocked',search_request_id:'request',checkpoint:c});assert.equal(countyPresentation(trigger,s),null);
 }
 for(const flag of ['paused','cancelled']){const s=seed();s.requests[0].workflow_control[flag]=true;assert.equal(countyPresentation(trigger,s),null);}
 const multi=seed();multi.children.push({request_id:'second',role:'county'});multi.requests.push({id:'second',workflow_control:{}});multi.jobs.push({id:'second-job',state:'running',search_request_id:'second'});assert.equal(countyPresentation(trigger,multi),null);
 const ai=seed();ai.usage=[{state:'reserved',reserved_usd:1}];assert.equal(countyPresentation(trigger,ai),null);
});
test('verified Added or Unchanged Saline-style saves need exact intake/request links and no validation exclusions',()=>{
 for(const added of [true,false]){
  const s=seed();s.interpretations=[{request_id:'request',staging_receipt:{intake_ids:['candidate']}}];s.intakes=[{id:'candidate',status:'processed'}];s.intakeLinks=[{intake_id:'candidate',lead_id:'lead'}];s.requestLinks=[{search_request_id:'request',lead_id:'lead'}];
  const j={id:'save',state:'succeeded',search_request_id:'request',checkpoint:{stage:'import_verified',automatic:{policy:'county-automatic-v1',exclusions:[]},receipt:{verified:true},county_records:[{id:'lead',added,intake_ids:['candidate']}]}};s.jobs.push(j);
  assert.equal(countyPresentation(trigger,s).outcome,'source_attention');
  j.checkpoint.automatic.exclusions=[{intake_id:'invalid'}];assert.equal(countyPresentation(trigger,s),null);j.checkpoint.automatic.exclusions=[];
  s.requestLinks=[];assert.equal(countyPresentation(trigger,s),null);
 }
});
test('blockers use safe fixed copy, distinguish actual access from denial, and restrict retries',()=>{
 const job=c=>({id:'discovery',kind:'discover',state:'blocked',checkpoint:{task_id:'gap',stage:'discovery_verify',automation_policy:'county-public-v1',...c}});
 assert.equal(sourceAttention(task,[job({hosted_browser_attempt:{failure_code:'human_verification_required'}})]).kind,'manual_action');
 const denied=sourceAttention(task,[job({blocker:'HTTP 403'})]);assert.equal(denied.kind,'access');assert.doesNotMatch(denied.blocker,/Cloudflare|human/);assert.equal(denied.action_kind,'evidence');
 const acceptedWithoutContent=sourceAttention(task,[job({blocker:'HTTP 202'})]);assert.equal(acceptedWithoutContent.kind,'automation');assert.match(acceptedWithoutContent.blocker,/202/);assert.equal(acceptedWithoutContent.action_kind,'evidence');assert.doesNotMatch(acceptedWithoutContent.next_action,/log in|Cloudflare/);
 assert.equal(sourceAttention(task,[job({blocker:'Network request failed or timed out'})]).action_kind,'retry');
 assert.equal(sourceAttention(task,[job({blocker:'HTTP 503',automation_policy:undefined})]).action_kind,'evidence','Do not offer automatic retries for unsupported legacy workflows');
 assert.equal(sourceAttention({...task,reason:'Response exceeds byte limit'},[]).kind,'limit');
 assert.equal(sourceAttention({...task,evidence:{reason:'Document exceeds verified byte bound'}},[]).kind,'limit');
 assert.equal(sourceAttention({...task,reason:'Unsupported content type: secret'},[]).kind,'automation');
 assert.equal(sourceAttention({...task,state:'source_missing'},[]).kind,'source_missing');
 const unknown=sourceAttention({...task,state:'partial'},[job({blocker:'secret token=<untrusted>'})]);assert.equal(unknown.kind,'unknown');assert.doesNotMatch(JSON.stringify(unknown),/secret|untrusted/);
 assert.equal(sourceAttention({...task,state:'reviewed_no_results'},[job({blocker:'HTTP 403'})]),null);
 const old=job({blocker:'HTTP 403'}),newer={...job({}),id:'new',state:'succeeded',updated_at:'2026-10-20'};
 assert.equal(discoveryJob(task,[old,newer]).id,'new');
 const portal={id:'portal',state:'blocked',checkpoint:{bonfire_details:{gap:{source_id:'source',projects:[{state:'pending',title:'untrusted',url:'private'}]}}}};
 assert.equal(sourceAttention({...task,state:'partial'},[portal]).kind,'details');assert.doesNotMatch(JSON.stringify(sourceAttention({...task,state:'partial'},[portal])),/untrusted|private/);
 const s=seed();s.tasks.push({...task,id:'resolved',state:'reviewed_no_results'});s.jobs.push({id:'old-failure',kind:'discover',task_id:'resolved',state:'blocked',search_request_id:'request',checkpoint:{error_code:'old_error'}});
 assert.equal(countyPresentation(trigger,s).outcome,'source_attention','Resolved source history does not override remaining current source gaps');
});
test('list/detail loader reuses batches, remains read-only and agrees with pure projection',async()=>{
 const s=seed(),tables={procurement_trigger_requests:s.children,procurement_request_targets:[{id:'target',search_request_id:'request'}],procurement_search_requests:s.requests,procurement_coverage_tasks:s.tasks,procurement_jobs:s.jobs,procurement_interpretations:[],procurement_usage_ledger:[]},calls=[];
 const db={from(table){calls.push(table);return {select(){return this;},in(){return this;},order(){return this;},async range(){return {data:tables[table]??[]};}};}};
 const detail=await countyPresentations(db,[trigger]);assert.deepEqual(detail.get(trigger.id),countyPresentation(trigger,s));
 calls.length=0;const list=await countyPresentations(db,[trigger],{...s,targets:tables.procurement_request_targets});assert.deepEqual(list.get(trigger.id),detail.get(trigger.id));assert.deepEqual(calls,['procurement_search_requests']);
});
