import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { makeInterpretationPacket, validateInterpretation, manualSpecFromInterpretation, samStageScope } from '../scripts/lib/known-source-workflow.mjs';
import { planManual } from '../scripts/lib/research-persistence.mjs';
import { planReviewedBatch, hash } from '../scripts/lib/reviewed-batch.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bytes=Buffer.from('<html><title>Bid list</title><main><table><thead><tr><th>Bid #</th><th>Description</th></tr></thead><tbody><tr><td>24-17</td><td>Janitorial services</td></tr></tbody></table></main></html>');
const sha=b=>createHash('sha256').update(b).digest('hex');
function context(body=bytes,type='text/html') {
  const request={id:id(1),service_scope:{service:'janitorial'},search_windows:{opportunity:{from:'2026-10-01',to:'2026-10-04'}},requested_search_areas:[{area_type:'city',city_name:'Texarkana',state_code:'AR'}]};
  const source={id:id(2),code:'sample',name:'Official bids',config:{}};
  const task={id:id(3),target_id:id(9),source_id:source.id,capability_id:id(4),kind:'opportunity',
    query_window:request.search_windows.opportunity,pages_reviewed:1,
    evidence:{terminal_confirmed:true,run_ids:[id(5)]}};
  const job={id:id(6),task_id:task.id,state:'succeeded'};
  const capability={id:id(4),source_id:source.id,parser_version:'public-v1',method_spec:{version:1}};
  const capture={run_id:id(5),source_id:source.id,requested_url:'https://example.gov/bids',
    final_url:'https://example.gov/bids',retrieved_at:'2026-10-04T12:00:00Z',
    content_type:type,content_sha256:sha(body),content_base64:body.toString('base64')};
  const run={id:id(5),source_id:source.id,job_id:job.id,coverage_task_id:task.id,
    page_index:0,detail:{state:'content_saved',content_sha256:capture.content_sha256}};
  return {request,source,task,job,capability,runs:[run],captures:[capture]};
}
function result(packet) {
  return {version:1,packet_hash:packet.packet_hash,reviewed_by:'Reviewer',
    reviewed_scope:'Saved row 1 only',coverage:'complete',
    findings:[{record_id:'24-17',title:'Janitorial services',classification:'opportunity',
      reason:'Official solicitation row for janitorial services',work_location_basis:'City work location stated in linked solicitation',
      payload:{title:'Janitorial services',source_url:'https://example.gov/bids',bid_type:'opportunity',
        business_category:'other_public',deadline:'2026-10-30T17:00:00Z',
        work_performance_locations:[{city_name:'Texarkana',state_code:'AR',evidence:'Solicitation work location'}]},
      evidence:[{run_id:id(5),locator:'table 1 row 1',excerpt:'24-17 Janitorial services'}]}],
    exclusions:[],unresolved:[]};
}
test('HTML and PDF packets bind saved source bytes, request scope and method version',()=>{
  const html=makeInterpretationPacket(context());
  assert.equal(html.complete,true);
  assert.match(html.pages[0].review,/Janitorial services/);
  assert.equal(validateInterpretation(html,result(html)).status,'reviewed_with_results');
  const pdf=makeInterpretationPacket(context(Buffer.from('%PDF-1.4\nprocurement'), 'application/pdf'));
  assert.match(pdf.pages[0].review,/No PDF text was inferred/);
  assert.notEqual(pdf.packet_hash,html.packet_hash);
  const altered=context();altered.request.id=id(20);
  assert.notEqual(makeInterpretationPacket(altered).packet_hash,html.packet_hash);
  altered.request.id=id(1);altered.capability.parser_version='public-v2';
  assert.notEqual(makeInterpretationPacket(altered).packet_hash,html.packet_hash);
});
test('review cannot invent zero, cross-run evidence, or complete partial pages',()=>{
  const packet=makeInterpretationPacket(context());
  const no={...result(packet),findings:[],reviewed_scope:'All saved rows'};
  assert.equal(validateInterpretation(packet,no).status,'reviewed_no_results');
  const wrong=structuredClone(result(packet));wrong.findings[0].evidence[0].run_id=id(8);
  assert.throws(()=>validateInterpretation(packet,wrong),/saved run/);
  const partialContext=context();partialContext.job.state='partial';
  const partial=makeInterpretationPacket(partialContext);
  assert.throws(()=>validateInterpretation(partial,{...no,packet_hash:partial.packet_hash}),/Incomplete/);
  const unresolved={...no,unresolved:[{reason:'Linked PDF was not captured',evidence:[{run_id:id(5),locator:'row 1 link',excerpt:'Bid PDF'}]}]};
  assert.throws(()=>validateInterpretation(packet,unresolved),/Unresolved/);
  const entry=context();entry.task.kind='source_entry';
  assert.throws(()=>makeInterpretationPacket(entry),/Entry-only/);
});
test('interpretation feeds existing immutable intake and explicit reviewed handoff',()=>{
  const packet=makeInterpretationPacket(context()),decision=result(packet);
  const spec=manualSpecFromInterpretation(packet,decision,'zreplhkoxswtzxlchtjf',{[id(5)]:'saved.html'});
  const before={project_ref:spec.project_ref,captured_at:'2026-10-04T12:00:00Z',
    procurement_sources:[{id:id(2),code:'sample',config:{}}],
    procurement_search_requests:[{id:id(1)}],
    procurement_request_sources:[],
    procurement_request_targets:[{id:id(9),search_request_id:id(1)}],
    procurement_coverage_tasks:[{id:id(3),target_id:id(9),source_id:id(2),kind:'opportunity'}],
    procurement_intake_items:[],procurement_leads:[],procurement_intake_leads:[],
    procurement_request_leads:[],procurement_versions:[],procurement_events:[]};
  const m=planManual(spec,before);
  assert.equal(m.rows.length,1);
  const intake=m.rows[0].row;
  assert.equal(intake.payload.manual_capture.evidence[0].content_sha256,packet.pages[0].content_sha256);
  before.procurement_intake_items.push(intake);
  assert.equal(planManual(spec,before).rows.length,0,'Replay creates no duplicate intake');
  const review={version:1,batch:'known-source-test',project_ref:spec.project_ref,
    request_id:id(1),work_state:'AR',scope:'Texarkana janitorial opportunity',
    limitations:'Only the saved official bid row was reviewed',reviewed_by:'Reviewer',run_ids:[],
    decisions:[{intake_id:intake.id,intake_hash:hash(intake.payload),action:'defer',reason:'Await linked bid document'}]};
  const reviewed=planReviewedBatch(before,review,[]);
  assert.equal(reviewed.records.length,0,'Explicit deferral does not create a lead');
  review.decisions[0]={...review.decisions[0],action:'process',approve_new:true,
    reason:'Reviewed source and work location',request_match_reason:'Solicitation says Texarkana Arkansas'};
  const approved=planReviewedBatch(before,review,[]);
  assert.equal(approved.records.length,1);
  const pdfPacket=makeInterpretationPacket(context(Buffer.from('%PDF-1.4\nprocurement'),'application/pdf'));
  const pdfResult=result(pdfPacket);
  const pdfSpec=manualSpecFromInterpretation(pdfPacket,pdfResult,spec.project_ref,{[id(5)]:'saved.pdf'});
  const pdfBefore={...before,procurement_intake_items:[]};
  const pdfIntake=planManual(pdfSpec,pdfBefore).rows[0].row;
  pdfBefore.procurement_intake_items=[pdfIntake];
  review.decisions[0].intake_id=pdfIntake.id;
  review.decisions[0].intake_hash=hash(pdfIntake.payload);
  assert.equal(planReviewedBatch(pdfBefore,review,[]).records.length,1,
    'A reviewed PDF finding uses the same import contract');
});
test('checkpoint migration is private and retains one decision per packet',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.procurement_search_requests(id uuid primary key);
      create table public.procurement_coverage_tasks(id uuid primary key);
      insert into public.procurement_search_requests values ('${id(1)}');
      insert into public.procurement_coverage_tasks values ('${id(3)}');`);
    await db.exec(readFileSync('supabase/migrations/20261004000300_known_source_interpretations.sql','utf8'));
    const packet=makeInterpretationPacket(context()),res=result(packet);
    await db.query('insert into public.procurement_interpretations(request_id,task_id,packet_hash,result_hash,result,outcome) values($1,$2,$3,$4,$5,$6)',
      [id(1),id(3),packet.packet_hash,hash(res),res,'reviewed_with_results']);
    await assert.rejects(db.query('insert into public.procurement_interpretations(request_id,task_id,packet_hash,result_hash,result,outcome) values($1,$2,$3,$4,$5,$6)',
      [id(1),id(3),packet.packet_hash,hash(res),res,'reviewed_with_results']),/unique|duplicate/i);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.procurement_interpretations'),/permission denied/);
  } finally { await db.close(); }
});
test('only completed SAM route captures are selected for intake staging',()=>{
  const requestId=id(1),sources=[{id:id(2),code:'sam'},{id:id(3),code:'sam-awards'},{id:id(4),code:'other'}];
  const scope=samStageScope(requestId,[
    {source_id:id(2),evidence:{terminal_confirmed:true,run_ids:[id(6)]}},
    {source_id:id(3),evidence:{terminal_confirmed:false,run_ids:[id(7)]}},
    {source_id:id(4),evidence:{terminal_confirmed:true,run_ids:[id(8)]}},
  ],sources);
  assert.deepEqual(scope.run_ids,[id(6)]);
  assert.equal(scope.routed,true);
});
