import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { planReviewedBatch,hash,collectRuns } from '../scripts/lib/reviewed-batch.mjs';
import { verifyBatch } from '../scripts/lib/batch-verification.mjs';
import { runIds } from '../scripts/lib/intake-reconcile.mjs';
const dir=resolve('tests/fixtures/sam'),load=f=>JSON.parse(readFileSync(join(dir,f),'utf8'));
const before={...load('intake-before.json'),project_ref:'zreplhkoxswtzxlchtjf'},old=load('008_intake_processing_reviewed.json');
const runs=runIds.map(id=>load(`${id}.json`));
function reviewFor(snapshot=before) {
  return {version:1,batch:'offline-reusable-batch',project_ref:before.project_ref,request_id:old.request_id,work_state:'AR',scope:'Arkansas janitorial; saved real September 16 captures',
    limitations:'Bounded historical windows; not complete federal coverage; offline replay only.',reviewed_by:'Offline test of previously approved real records',run_ids:runIds,allow_partial:false,
    decisions:old.decisions.map(d=>{
      const i=snapshot.procurement_intake_items.find(i=>i.id===d.intake.id),record=old.records.find(r=>r.id===d.lead_id);
      const item={intake_id:i.id,intake_hash:hash(i.payload),action:'process',reason:d.basis};
      if(!record.expected_payload) {item.approve_new=true;item.request_match_reason=d.request_reason;item.reason=d.request_reason;}
      if(i.source_id!==record.source_id&&i.payload.sam_notice_evidence) {
        item.target={source_code:'usaspending',external_id:record.external_id};item.contract_identity=record.identity;
      }
      if(i.external_id.startsWith('page:')) {
        item.target={source_code:'arbuy-janitorial',external_id:'S000000473'};
        item.match_evidence={source_url:i.payload.url,solicitation_id:'S000000473',exact_text:'Bid Solicitation: S000000473'};
      }
      return item;
    })};
}
test('reusable planner reproduces the reviewed scope without hard-coded approvals',()=>{
  const r=reviewFor(),a=planReviewedBatch(before,r,runs),b=planReviewedBatch(before,r,runs);
  assert.deepEqual(a,b,'Deterministic IDs and proposals');
  assert.equal(a.summary.new_leads,3);assert.equal(a.summary.evidence_updates,74);assert.equal(a.summary.links_to_create,78);
  assert.equal(a.summary.distinct_awards,74);assert.equal(a.summary.distinct_notices,5);
  assert.ok(a.records.every(x=>!x.expected_payload||Object.keys(x.expected_payload).every(k=>
    ['sam_api_evidence','sam_notice_evidence','intake_source_evidence'].includes(k)||hash(x.payload[k])===hash(x.expected_payload[k]))));
});
test('project, payload hash, explicit new approval and ignored status fail closed',()=>{
  const r=reviewFor();r.project_ref='aaaaaaaaaaaaaaaaaaaa';assert.throws(()=>planReviewedBatch(before,r,runs),/project/);
  const changed=reviewFor();changed.decisions[0].intake_hash='0'.repeat(64);assert.throws(()=>planReviewedBatch(before,changed,runs),/content changed/);
  const no=reviewFor();delete no.decisions.find(d=>d.approve_new).approve_new;assert.throws(()=>planReviewedBatch(before,no,runs),/explicit approve_new/);
  const ignored=structuredClone(before);ignored.procurement_intake_items.find(i=>i.id===reviewFor().decisions[0].intake_id).status='ignored';
  assert.throws(()=>planReviewedBatch(ignored,reviewFor(ignored),runs),/Ignored/);
});
test('partial/error/unknown envelopes and duplicate page requests cannot masquerade as complete',()=>{
  const broken=structuredClone(runs);broken[0].upstream_status=429;assert.throws(()=>collectRuns(broken,runIds),/Failed/);
  const gap=structuredClone(runs);gap[0].filters.offset=1;assert.throws(()=>collectRuns(gap,runIds),/Incomplete/);
  assert.equal(collectRuns(gap,runIds,{allow_partial:true}).partial,true);
  const unknown=structuredClone(runs);unknown[0].response={};assert.throws(()=>collectRuns(unknown,runIds),/Unknown/);
  const duplicate=structuredClone(runs);duplicate.push({...duplicate[0],run_id:'12345678-1234-4234-a234-123456789012'});
  assert.throws(()=>collectRuns(duplicate,duplicate.map(r=>r.run_id),{allow_partial:true}),/Duplicate pages/);
});
test('a newly reviewed run subset and batch name require no code edits',()=>{
  const r=reviewFor();r.batch='another-batch';
  const selected=runs.filter(x=>x.kind==='awards');r.run_ids=selected.map(r=>r.run_id);
  r.decisions=r.decisions.filter(d=>before.procurement_intake_items.find(i=>i.id===d.intake_id).payload.sam_api_evidence);
  const m=planReviewedBatch(before,r,selected);assert.equal(m.decisions.length,74);assert.equal(m.batch,'another-batch');
});
test('explicit deferral does not create records, links or status changes',()=>{
  const r=reviewFor();r.decisions=[{...r.decisions[0],action:'defer',reason:'Needs more evidence'}];
  const m=planReviewedBatch(before,r,runs);assert.equal(m.records.length,0);assert.ok(m.unresolved.some(x=>x.reason==='Needs more evidence'));
});
test('Texarkana SAM award notice is reviewed as outside the city and deferred without import',()=>{
  const capture=load('texarkana-routed-candidate.json');
  const notice=capture.response.opportunitiesData[0];
  assert.equal(collectRuns([capture],[capture.run_id]).notices.size,1);
  assert.equal(notice.type,'Award Notice');
  assert.equal(notice.placeOfPerformance.city.name,'Tichnor');
  assert.notEqual(notice.placeOfPerformance.city.name,'Texarkana');
  const snapshot=structuredClone(before);
  const requestId='52128503-d9d1-4a3d-84c4-8bbbd84bdf6d';
  snapshot.procurement_search_requests.push({id:requestId,name:'Texarkana Phase 2 bounded check'});
  const intake={id:'90000000-0000-4000-8000-000000000002',
    source_id:snapshot.procurement_sources.find(s=>s.code==='sam').id,
    external_id:notice.noticeId,status:'pending',payload:{title:notice.title,bid_type:'award',
      work_performance_locations:[{city_name:'Tichnor',state_code:'AR',evidence:'SAM placeOfPerformance'}],
      sam_notice_evidence:{record:notice,capture_run_ids:[capture.run_id]}}};
  snapshot.procurement_intake_items.push(intake);
  const review={version:1,batch:'texarkana-sam-location-review',project_ref:before.project_ref,
    request_id:requestId,work_state:'AR',scope:'Texarkana janitorial check on October 1–2, 2026',
    limitations:'Statewide SAM query; work locations require city review',reviewed_by:'Offline test',
    run_ids:[capture.run_id],allow_partial:false,decisions:[{intake_id:intake.id,
      intake_hash:hash(intake.payload),action:'defer',
      reason:'Award notice names Tichnor as the work site; no Texarkana work evidence'}]};
  const result=planReviewedBatch(snapshot,review,[capture]);
  assert.equal(result.records.length,0);
  assert.equal(result.decisions.length,0);
  assert.equal(result.summary.new_leads,0);
  assert.equal(result.unresolved[0].id,intake.id);
});
test('official state contract observation links to existing intent by exact solicitation, preserving classification',()=>{
  const snapshot=structuredClone(before);
  const detailUrl='https://sas.arkansas.gov/state_contracts/janitorial-services/';
  const exact='S000000473 Statewide Janitorial Services';
  const intake={id:'90000000-0000-4000-8000-000000000003',
    source_id:snapshot.procurement_sources.find(s=>s.code==='state-contracts').id,
    external_id:'4600058030',status:'pending',payload:{title:'Janitorial Services',
      source_url:detailUrl,solicitation_id:'S000000473',bid_type:'award',
      work_performance_locations:[{state_code:'AR',evidence:'Statewide contract; facility not identified'}],
      manual_capture:{version:1,confidence:'primary',request_ids:[old.request_id],
        evidence:[{url:detailUrl,content_sha256:'a'.repeat(64),excerpt:exact,
          retrieved_at:'2026-10-02T19:36:49Z',locator:'contract detail and linked PDF'}]}}};
  snapshot.procurement_intake_items.push(intake);
  const review={version:1,batch:'state-contract-evidence-handoff',project_ref:before.project_ref,
    request_id:old.request_id,work_state:'AR',scope:'Statewide janitorial contract evidence',
    limitations:'No Texarkana facility or signed contract identified',reviewed_by:'Offline test',
    run_ids:[],allow_partial:false,decisions:[{intake_id:intake.id,intake_hash:hash(intake.payload),
      action:'process',reason:'Official contract listing and exact solicitation reference',
      target:{source_code:'arbuy-janitorial',external_id:'S000000473'},
      match_evidence:{source_url:detailUrl,solicitation_id:'S000000473',exact_text:exact}}]};
  const result=planReviewedBatch(snapshot,review,[]);
  assert.equal(result.summary.new_leads,0);
  assert.equal(result.records[0].id,'04ebe88b-9152-5ed5-bef1-963e788844c6');
  assert.equal(result.records[0].payload.bid_type,'intent_to_award');
  assert.equal(result.summary.evidence_updates,1);
  const wrong=structuredClone(review);wrong.decisions[0].match_evidence.solicitation_id='S000000474';
  assert.throws(()=>planReviewedBatch(snapshot,wrong,[]),/exact shared solicitation/);
  const unlinked=structuredClone(review);delete unlinked.decisions[0].target;
  assert.throws(()=>planReviewedBatch(snapshot,unlinked,[]),/explicit approve_new/);
});
test('signed state contract amendment promotes only the exact linked intent to award',()=>{
  const snapshot=structuredClone(before);
  const lead=snapshot.procurement_leads.find(l=>l.external_id==='S000000473');
  const source=snapshot.procurement_sources.find(s=>s.code==='state-contracts');
  const pdf='https://sas.arkansas.gov/wp-content/uploads/S000000473-Statewide-Janitorial-Services-Contract.pdf';
  const parentId='90000000-0000-4000-8000-000000000004';
  snapshot.procurement_intake_items.push({id:parentId,source_id:source.id,external_id:'4600058030',status:'processed',
    payload:{solicitation_id:'S000000473',manual_capture:{record_external_id:'4600058030'}}});
  snapshot.procurement_intake_leads.push({intake_id:parentId,lead_id:lead.id});
  const intake={id:'90000000-0000-4000-8000-000000000005',source_id:source.id,
    external_id:'4600058030::observation:abc',status:'pending',payload:{title:'Statewide Janitorial Services',
      source_url:pdf,solicitation_id:'S000000473',bid_type:'award',executed_contract_verified:true,
      contract_start:'2026-06-01',contract_end:'2027-05-31',incumbent:'Sharp Properties dba A Sharper Image',
      status_note:'Signed statewide contract; no Texarkana work site proved.',
      manual_capture:{version:1,confidence:'primary',request_ids:[old.request_id],record_external_id:'4600058030',
        amends_intake_id:parentId,evidence:[{url:pdf,content_sha256:'a'.repeat(64),
          excerpt:'S000000473 Statewide Janitorial Services, signed',retrieved_at:'2026-10-02T20:14:07Z',
          locator:'PDF page 7, both digital signatures'}]}}};
  snapshot.procurement_intake_items.push(intake);
  const decision={intake_id:intake.id,intake_hash:hash(intake.payload),action:'process',
    reason:'Official signed services contract amends prior interpretation; statewide only',
    target:{source_code:'arbuy-janitorial',external_id:'S000000473'},
    match_evidence:{source_url:pdf,solicitation_id:'S000000473',exact_text:'S000000473 Statewide Janitorial Services'},
    promote_existing_to_award:true};
  const review={version:1,batch:'signed-state-contract-amendment',project_ref:before.project_ref,
    request_id:old.request_id,work_state:'AR',scope:'Statewide contract amendment',
    limitations:'No Texarkana work site proved',reviewed_by:'Offline test',run_ids:[],allow_partial:false,decisions:[decision]};
  const result=planReviewedBatch(snapshot,review,[]);
  assert.equal(result.summary.new_leads,0);
  assert.equal(result.records[0].id,lead.id);
  assert.equal(result.records[0].payload.bid_type,'award');
  assert.equal(result.records[0].payload.contract_start,'2026-06-01');
  assert.equal(result.records[0].payload.contract_end,'2027-05-31');
  const noPromotion=structuredClone(review);delete noPromotion.decisions[0].promote_existing_to_award;
  assert.equal(planReviewedBatch(snapshot,noPromotion,[]).records[0].payload.bid_type,'intent_to_award');
  const unsigned=structuredClone(snapshot);unsigned.procurement_intake_items.at(-1).payload.executed_contract_verified=false;
  const unsignedReview=structuredClone(review);unsignedReview.decisions[0].intake_hash=hash(unsigned.procurement_intake_items.at(-1).payload);
  assert.throws(()=>planReviewedBatch(unsigned,unsignedReview,[]),/signed-contract amendment/);
});
test('routed revision keeps immutable intake identity while reviewing the canonical notice',()=>{
  const snapshot=structuredClone(before);
  const original=snapshot.procurement_intake_items.find(i=>i.external_id==='b878faa7fc7a496c9fef1ac3f0798de6');
  const revision=structuredClone(original);
  revision.id='90000000-0000-4000-8000-000000000001';
  revision.external_id=`${original.external_id}@changed-hash`;
  revision.status='pending';
  revision.payload.routed_capture={record_identity:original.external_id,observation_hashes:['a'.repeat(64)]};
  snapshot.procurement_intake_items.push(revision);
  const review=reviewFor(snapshot);
  review.batch='routed-revision';
  review.decisions=[{intake_id:revision.id,intake_hash:hash(revision.payload),action:'process',
    reason:'Review routed revision against the saved SAM notice'}];
  const result=planReviewedBatch(snapshot,review,runs);
  assert.equal(result.decisions[0].external_id,original.external_id);
  assert.equal(result.summary.new_leads,0);
  assert.equal(result.decisions[0].intake.external_id,revision.external_id);
});
test('manual forecast can be explicitly reviewed without any invented SAM forecast API',()=>{
  const i=before.procurement_intake_items.find(i=>i.external_id==='FWS2025001061'),r=reviewFor();
  r.run_ids=[];r.batch='offline-forecast-example';r.decisions=[{intake_id:i.id,intake_hash:hash(i.payload),action:'process',approve_new:true,
    reason:'Offline test only: historical option-exercise forecast, not open solicitation',request_match_reason:'Official source identifies Crossett; review timing'}];
  const m=planReviewedBatch(before,r,[]);assert.equal(m.summary.new_leads,1);assert.equal(m.records[0].payload.bid_type,'forecast');
});
test('expired new notice cannot be classified as an open opportunity',()=>{
  const s=structuredClone(before),i=s.procurement_intake_items.find(i=>i.external_id==='b878faa7fc7a496c9fef1ac3f0798de6');
  s.procurement_leads=s.procurement_leads.filter(l=>l.external_id!==i.external_id);
  const r=reviewFor();r.decisions=[{intake_id:i.id,intake_hash:hash(i.payload),action:'process',approve_new:true,
    reason:'Offline classification test',request_match_reason:'Review work location',new_bid_type:'opportunity'}];
  assert.throws(()=>planReviewedBatch(s,r,runs),/Expired/);
  r.decisions[0].new_bid_type='historical_opportunity';assert.equal(planReviewedBatch(s,r,runs).summary.new_leads,1);
});
test('real committed readback verifies; missing link and duplicate/missing history fail verification',()=>{
  const m={...old,project_ref:before.project_ref},after={...load('intake-after.json'),project_ref:before.project_ref};
  assert.equal(verifyBatch(before,after,m).verified,true);
  const bad=structuredClone(after);bad.procurement_intake_leads.pop();assert.equal(verifyBatch(before,bad,m).verified,false);
  const history=structuredClone(after);history.procurement_events=history.procurement_events.filter(e=>e.lead_id!==m.records[0].id);
  assert.equal(verifyBatch(before,history,m).verified,false);
});
test('CLI prepares offline; rejects wrong approval and edited packages before accessing credentials',()=>{
  const temp=mkdtempSync(join(tmpdir(),'procurement-workflow-test-')),reviewFile=join(temp,'review.json'),snapshotFile=join(temp,'before.json'),out=join(temp,'package');
  writeFileSync(reviewFile,JSON.stringify(reviewFor()));writeFileSync(snapshotFile,JSON.stringify(before));
  const cli=resolve('scripts/procurement-workflow.mjs');
  execFileSync(process.execPath,[cli,'prepare',reviewFile,snapshotFile,dir,join(dir,'intake-schema.json'),out],{stdio:'pipe'});
  const result=spawnSync(process.execPath,[cli,'apply',out,'--approve','wrong'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Approval hash mismatch/);
  writeFileSync(join(out,'apply.sql'),'select 1;');
  const altered=spawnSync(process.execPath,[cli,'status',out],{encoding:'utf8'});
  assert.equal(altered.status,1);assert.match(altered.stderr,/Package changed/);
});
test('batch CLI uses local PGlite for schema/history, rollback and replay tests', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'procurement-local-engine-'));
  const reviewFile = join(temp, 'review.json');
  const snapshotFile = join(temp, 'before.json');
  const out = join(temp, 'package');
  const cli = resolve('scripts/procurement-workflow.mjs');
  writeFileSync(reviewFile, JSON.stringify(reviewFor()));
  writeFileSync(snapshotFile, JSON.stringify(before));
  const {linkReadySchema}=await import('./helpers/api-link-schema.mjs');
  const schemaFile=join(temp,'link-schema.json');
  writeFileSync(schemaFile,JSON.stringify(linkReadySchema(JSON.parse(readFileSync(join(dir,'intake-schema.json'))))));
  execFileSync(process.execPath, [cli, 'prepare', reviewFile, snapshotFile, dir, schemaFile, out], { stdio: 'pipe' });
  // No external module path or credentials; the inherited guard forbids network.
  execFileSync(process.execPath, [cli, 'test', out], { stdio: 'pipe' });
  const receipt = JSON.parse(readFileSync(join(out, 'offline-test.json'), 'utf8'));
  const bundle = JSON.parse(readFileSync(join(out, 'bundle.json'), 'utf8'));
  assert.equal(receipt.status, 'offline_tests_passed');
  assert.equal(receipt.approval_sha256, bundle.approval_sha256);
});

// Export reviewed real-data fixtures for the separate offline SQL integration runner.
export { before,reviewFor,runs };
