import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {planRegistry,planManual} from '../scripts/lib/research-persistence.mjs';
import {hash,planReviewedBatch} from '../scripts/lib/reviewed-batch.mjs';
import {automaticCountyReview,countyImportStatus,countyAutomaticPolicy,countyAuthority} from '../scripts/lib/county-automatic-import.mjs';
const load=k=>JSON.parse(readFileSync(`tests/fixtures/research/${k}.json`));
function fixture(){
 const snapshot=load('build-persistence-before'),registry=planRegistry(load('build-registry-spec'),snapshot);
 for(const d of registry.rows){snapshot[d.table]=snapshot[d.table].filter(i=>i.id!==d.row.id);snapshot[d.table].push(d.row);}
 const spec=load('build-manual-spec');spec.findings=spec.findings.slice(0,1);
 const candidate=planManual(spec,snapshot).rows[0].row;snapshot.procurement_intake_items.push(candidate);
 const request=snapshot.procurement_search_requests.find(r=>r.id===spec.findings[0].request_ids[0]);
 const proofs=[{intake_id:candidate.id,payload_hash:hash(candidate.payload),packet_hash:'a'.repeat(64)}];
 return {request,candidates:[candidate],proofs,snapshot};
}
test('only bound evidence produces server-owned canonical decisions; missing and ignored records do not import',()=>{
 const f=fixture(),result=automaticCountyReview(f);assert.equal(result.review.decisions.length,1);assert.equal(result.review.decisions[0].approve_new,true);
 assert.equal(automaticCountyReview({...f,proofs:[]}).review.decisions.length,0);
 assert.notEqual(automaticCountyReview({...f,candidates:[],proofs:[]}).key,automaticCountyReview({...f,proofs:[]}).key,'Late candidates cannot reuse an empty validation receipt');
 f.candidates[0].status='ignored';assert.equal(automaticCountyReview(f).review.decisions.length,0);
});
test('pending observations use stable canonical identity, and older observations cannot replace newer facts',()=>{
 const f=fixture(),parent=f.candidates[0],i={...structuredClone(parent),id:'10000000-0000-4000-8000-000000000001',external_id:parent.external_id+'::observation:test'};
 i.payload.manual_capture={...i.payload.manual_capture,amends_intake_id:parent.id,record_external_id:parent.external_id};f.snapshot.procurement_intake_items.push(i);
 const input={...f,candidates:[i],proofs:[{intake_id:i.id,payload_hash:hash(i.payload)}]},policy=automaticCountyReview(input);
 assert.equal(policy.review.decisions[0].supersedes_pending_intake_id,parent.id);
 const manifest=planReviewedBatch(f.snapshot,policy.review,[]);assert.equal(manifest.records[0].external_id,parent.external_id);
 const lead={...manifest.records[0],stage:'hold',notes:'Owner note'};f.snapshot.procurement_leads.push(lead);
 f.snapshot.procurement_intake_leads.push({id:'10000000-0000-4000-8000-000000000002',intake_id:parent.id,lead_id:lead.id});
 parent.payload.manual_capture.evidence[0].retrieved_at='2030-01-01T00:00:00Z';
 assert.equal(automaticCountyReview(input).review.decisions.length,0);
 assert.equal(lead.notes,'Owner note');assert.equal(lead.stage,'hold');
});
test('verified summaries count canonical identities, retain Added across later waves, and surface uncertain writes',()=>{
 const job=(added,updated)=>({id:'job',state:'succeeded',checkpoint:{stage:'import_verified',automatic:{policy:countyAutomaticPolicy,exclusions:[]},receipt:{verified:true},county_records:[{id:'lead',added,updated}]}});
 const status=countyImportStatus([job(true,false),job(false,true)]);assert.equal(status.added,1);assert.equal(status.updated,0);
 assert.equal(countyImportStatus([{...job(false,false),state:'outcome_unknown',checkpoint:{...job(false,false).checkpoint,stage:'import_reconcile'}}]).state,'outcome_unknown');
});

test('client policy flags cannot grant county authority without a server-owned county trigger',async()=>{
 const empty={from(){return {select(){return this;},eq(){return this;},order(){return this;},async range(){return {data:[]};}};}};
 const request={id:'request',cities_confirmed_at:'2026-10-19',workflow_control:{admin_policy:'county_scope',admin_trigger_id:'forged',check_updates:true}};
 assert.equal(await countyAuthority(empty,request),false);
 assert.equal(await countyAuthority({}, {...request,workflow_control:{...request.workflow_control,admin_policy:'state_source'}}),false);
 assert.equal(await countyAuthority({}, {...request,workflow_control:{...request.workflow_control,check_updates:false}}),false);
});
