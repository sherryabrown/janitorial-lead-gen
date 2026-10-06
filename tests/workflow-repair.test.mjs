import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { collectRuns, planReviewedBatch, hash } from '../scripts/lib/reviewed-batch.mjs';
import { reconciliationSql } from '../scripts/lib/intake-reconcile.mjs';
import { testBatchSql } from '../scripts/lib/batch-sql-test.mjs';
import { samIntakeRows } from '../scripts/lib/sam-intake.mjs';
import { makeInterpretationPacket, validateInterpretation } from '../scripts/lib/known-source-workflow.mjs';
import { planInterpretationIntake } from '../scripts/lib/interpretation-intake.mjs';
import { persistInterpretation } from '../scripts/lib/interpretation-store.mjs';
import { workflowStatus } from '../scripts/lib/workflow-status.mjs';
import { stateListingArgs } from '../scripts/lib/state-listing-args.mjs';
import { adapterContract } from '../scripts/lib/known-source-execution.mjs';
import { planSourceRoutes } from '../scripts/lib/geography-routing.mjs';
import { context, result, id, intakeBefore } from './helpers/known-workflow.mjs';
import { pdfFixture } from './helpers/valid-pdf.mjs';

test('shell, access/error and unreadable PDF cannot become zero; empty listing requires bound evidence',()=>{
  for(const body of ['<div id="app"></div>','<title>Login</title><input type="password">',
    '<title>Service unavailable</title><table><tr><td>No results</td></tr></table>']) {
    const p=makeInterpretationPacket(context(Buffer.from(body)));
    const r={...result(p),findings:[],zero_basis:[{run_id:id(5),locator:'main',excerpt:'No results',kind:'empty_listing'}]};
    assert.throws(()=>validateInterpretation(p,r),/Zero/);
  }
  const p=makeInterpretationPacket(context(Buffer.from('<main>No current bids are available.</main>')));
  const r={...result(p),findings:[],zero_basis:[{run_id:id(5),locator:'main',excerpt:'No current bids are available.',kind:'empty_listing'}]};
  assert.equal(validateInterpretation(p,r).status,'reviewed_no_results');
  assert.throws(()=>validateInterpretation(p,{...r,zero_basis:[]}),/every/);
  assert.throws(()=>validateInterpretation(p,{...r,unresolved:[{reason:'Linked document unreviewed'}]}),/Unresolved/);
  const pdf=makeInterpretationPacket(context(Buffer.from('%PDF-1.4 broken'),'application/pdf'));
  assert.throws(()=>validateInterpretation(pdf,{...r,packet_hash:pdf.packet_hash}),/Zero/);
});

test('preview delegates every supported adapter, expiry and malformed bounds to execution policy',()=>{
  const source={id:id(2),code:'sam',name:'Source'};
  const cap={id:id(4),source_id:source.id,route_geography_id:'05',kind:'opportunity',method:'api',availability:'active',verified_at:'2026-01-01',verified_until:'2027-01-01',verification_evidence:{run:'fixture'},parser_version:'v1',method_spec:{version:1,runner_id:'sam-search',query_defaults:{ncode:'561720'}}};
  const publicCap={...cap,method:'browser',method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://example.gov/bids'],allowed_hosts:['example.gov'],max_bytes:10000}};
  const ardot={...cap,method:'browser',method_spec:{version:1,runner_id:'ardot-table',check_when:'each_request',entry_url:'https://ardot.gov/divisions/equipment-procurement/commodities-and-services/bids-by-fiscal-year/',ajax_url:'https://ardot.gov/wp-admin/admin-ajax.php?action=get_wdtable&table_id=53',page_size:100,max_pages:30,max_records:3000,max_bytes:2000000,allowed_hosts:['ardot.gov']}};
  const now=new Date('2026-10-05');
  for(const [c,s] of [[cap,source],[publicCap,{...source,code:'state-other'}],[ardot,{...source,code:'ardot'}]]) {
    assert.ok(adapterContract(c,s,now));
    assert.equal(planSourceRoutes([{id:'05',kind:'state'}],[c],[s],now)[0].categories.opportunity.known.length,
      c.method_spec.runner_id==='sam-search'?0:1);
    assert.equal(planSourceRoutes([{id:'05',kind:'state'}],[{...c,verified_until:'2025-01-01'}],[s],now)[0].categories.opportunity.known.length,0);
  }
  assert.equal(planSourceRoutes([{id:'05',kind:'state'}],[],[source],now)[0].categories.opportunity.known.length,0);
});

test('state listing preview and apply parse offline, extra arguments fail',()=>{
  assert.equal(stateListingArgs(['state-intents',id(1)]).flag,undefined);
  assert.equal(stateListingArgs(['state-other',id(1),'--apply']).flag,'--apply');
  assert.throws(()=>stateListingArgs(['state-other',id(1),'--apply','extra']),/Usage/);
});

test('a changed finding amends pending intake only with explicit reviewer selection',()=>{
  const packet=makeInterpretationPacket(context());
  const before=intakeBefore();
  const initial=result(packet);
  const first=planInterpretationIntake(packet,initial,before,{[id(5)]:'saved.html'}).manifest.rows[0].row;
  before.procurement_intake_items.push(first);
  const revised=structuredClone(initial);
  revised.findings[0].payload.deadline='2026-11-01T17:00:00Z';
  const second=planInterpretationIntake(packet,revised,before,{[id(5)]:'saved.html'}).manifest.rows[0].row;
  before.procurement_intake_items.push(second);
  assert.equal(second.payload.manual_capture.amends_intake_id,first.id);
  assert.equal(planInterpretationIntake(packet,revised,before,{[id(5)]:'saved.html'}).manifest.rows.length,0);
  const review={version:1,batch:'corrected-pending',project_ref:before.project_ref,request_id:id(1),
    work_state:'AR',scope:'Arkansas janitorial source',limitations:'Saved listing only',reviewed_by:'Offline reviewer',run_ids:[],
    decisions:[{intake_id:second.id,intake_hash:hash(second.payload),action:'process',approve_new:true,
      reason:'Reviewed correction',request_match_reason:'Arkansas work site stated in capture'}]};
  assert.throws(()=>planReviewedBatch(before,review,[]),/Amendment parent/);
  review.decisions[0].supersedes_pending_intake_id=first.id;
  assert.equal(planReviewedBatch(before,review,[]).records.length,1);
  assert.equal(first.status,'pending','Earlier candidate remains visible as history');
  first.status='processed';
  const canonical={id:id(90),source_id:id(2),external_id:'24-17',bid_type:'opportunity',
    search_term_used:'janitorial',payload:{title:'Previously reviewed title',source_url:'https://example.gov/bids',bid_type:'opportunity'}};
  before.procurement_leads=[canonical];
  before.procurement_intake_leads=[{id:id(91),intake_id:first.id,lead_id:canonical.id}];
  delete review.decisions[0].supersedes_pending_intake_id;
  delete review.decisions[0].approve_new;
  const amendment=planReviewedBatch(before,review,[]);
  assert.equal(amendment.records[0].payload.title,'Previously reviewed title',
    'Interpretation correction alone cannot rewrite canonical business facts');
});

test('interpretation revisions preserve decisions and repair interrupted staging/finalization',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table procurement_search_requests(id uuid primary key);
      create table procurement_request_targets(id uuid primary key,search_request_id uuid);
      create table procurement_coverage_tasks(id uuid primary key,target_id uuid,state text,evidence jsonb,results_count int);
      insert into procurement_search_requests values('${id(1)}');
      insert into procurement_request_targets values('${id(9)}','${id(1)}');
      insert into procurement_coverage_tasks values('${id(3)}','${id(9)}','needs_interpretation','{}',0);`);
    for(const file of ['20261004000300_known_source_interpretations.sql','20261005000100_known_source_workflow_repair.sql'])
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
    const client={rpc:async(name,args)=>{
      try {return {data:(await db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`,Object.values(args))).rows[0].value};}
      catch(e){return {error:{message:e.message}};}
    }};
    const p=makeInterpretationPacket(context()),r={...result(p),coverage:'partial'};
    const before=intakeBefore();let failAfterStage=true;
    const stage=async(packet,decision)=>{
      const {manifest,receipt}=planInterpretationIntake(packet,decision,before,{[id(5)]:'saved.html'});
      for(const row of manifest.rows){before.procurement_intake_items.push({...row.row,created_at:new Date().toISOString()});receipt.intake_ids.push(row.row.id);receipt.inserted++;}
      if(failAfterStage){failAfterStage=false;throw new Error('injected after staging');}
      return receipt;
    };
    await assert.rejects(persistInterpretation(client,p,r,stage),/injected/);
    const first=await persistInterpretation(client,p,r,stage);
    assert.equal(before.procurement_intake_items.length,1);
    assert.equal((await persistInterpretation(client,p,r,stage)).replayed,true);
    // Recover even an older receipt/task split; finalize always reconciles the task.
    await db.exec(`update procurement_coverage_tasks set state='needs_interpretation'`);
    await persistInterpretation(client,p,r,stage);
    assert.equal((await db.query('select state from procurement_coverage_tasks')).rows[0].state,'partial');
    const complete={...r,coverage:'complete',supersedes_id:first.interpretation_id};
    const second=await persistInterpretation(client,p,complete,stage);
    assert.equal(second.revision,2);assert.equal(before.procurement_intake_items.length,1);
    await assert.rejects(persistInterpretation(client,p,{...complete,reviewed_scope:'conflicting old revision'},stage),/Revision conflict/);
    const corrected=structuredClone(complete);corrected.supersedes_id=second.interpretation_id;
    corrected.findings[0].payload.deadline='2026-11-01T17:00:00Z';
    const third=await persistInterpretation(client,p,corrected,stage);
    assert.equal(third.revision,3);assert.equal(before.procurement_intake_items.length,2);
    assert.equal(before.procurement_intake_items[1].payload.manual_capture.amends_intake_id,before.procurement_intake_items[0].id);
    await persistInterpretation(client,p,corrected,stage);assert.equal(before.procurement_intake_items.length,2);
    assert.equal((await db.query('select count(*)::int n from procurement_interpretations')).rows[0].n,3);
    assert.equal((await db.query('select count(*)::int n from procurement_interpretations where is_current')).rows[0].n,1);
    await db.exec('set role authenticated');
    const denied=await client.rpc('finalize_procurement_interpretation',{p_id:third.interpretation_id,p_receipt:{intake_ids:[]}});
    assert.match(denied.error.message,/permission denied/);
  } finally {await db.close();}
});

test('shared candidate state separates legacy SAM from geography review and preserves import history',()=>{
  const data={tasks:[{id:id(3),source_id:id(2),state:'reviewed_with_results',evidence:{terminal_confirmed:true,run_ids:[id(5)]}}],sources:[{id:id(2),code:'sam'}],interpretations:[],intakes:[{id:id(7),source_id:id(2),status:'pending',payload:{sam_notice_evidence:{capture_run_ids:[id(5)]}}}],links:[],requestLinks:[],leads:[]};
  assert.match(workflowStatus(id(1),data).legacySamNext,/--legacy-sam/);
  assert.equal(workflowStatus(id(1),data).candidates.length,0);
  assert.equal(workflowStatus(id(1),data).legacySamCandidates[0].state,'pending_review');
  data.intakes[0].status='processed';data.links=[{intake_id:id(7),lead_id:id(8)}];data.leads=[{id:id(8)}];data.requestLinks=[{search_request_id:id(1),lead_id:id(8)}];
  assert.equal(workflowStatus(id(1),data).legacySamCandidates[0].state,'imported');
  assert.doesNotMatch(workflowStatus(id(1),data).next,/review-template/);
  data.interpretations=[{id:id(9),task_id:id(3),is_current:true,staging_receipt:null}];
  assert.equal(workflowStatus(id(1),data).current.length,0);
  assert.doesNotMatch(workflowStatus(id(1),data).next,/Resume interpret/);
  data.tasks.push({id:id(14),source_id:id(12),state:'reviewed_with_results'});
  data.interpretations=[{id:id(10),task_id:id(3),is_current:true,staging_receipt:{intake_ids:[id(11)]}}];
  assert.equal(workflowStatus(id(1),data).candidates.length,0);
  data.interpretations[0].task_id=id(14);
  data.intakes.push({id:id(11),source_id:id(12),status:'pending',payload:{title:'Public finding'}});
  assert.equal(workflowStatus(id(1),data).candidates.length,1);
  assert.match(workflowStatus(id(1),data).next,/review-template/);
  data.interpretations[0].staging_receipt=null;assert.match(workflowStatus(id(1),data).next,/Resume interpret/);
  data.interpretations=[];data.tasks[0].state='partial';assert.equal(workflowStatus(id(1),data).gaps.length,0);
  data.tasks.push({id:id(13),source_id:id(12),state:'partial'});
  assert.match(workflowStatus(id(1),data).next,/gaps/);
});

test('saved API, HTML and valid PDF evidence reach local reviewed canonical readback with replay and rollback',async()=>{
  const sam=JSON.parse(readFileSync('tests/fixtures/sam/texarkana-routed-candidate.json','utf8'));
  const collection=collectRuns([sam],[sam.run_id]);
  assert.equal(collection.notices.size,1,'Saved API notice is recognized and audited');
  const baseline=JSON.parse(readFileSync('tests/fixtures/research/build-persistence-before.json','utf8'));
  const schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json','utf8'));
  const source=baseline.procurement_sources.find(s=>s.code==='state-contracts');
  const request=baseline.procurement_search_requests[0];
  baseline.procurement_request_targets=[{id:id(9),search_request_id:request.id}];
  baseline.procurement_coverage_tasks=[];
  baseline.procurement_request_sources=[];
  const captures=[
    {body:Buffer.from('<html><main><table><tbody><tr><td>24-17 Janitorial services</td></tr></tbody></table></main></html>'),type:'text/html',record:'24-17'},
    {body:pdfFixture(),type:'application/pdf',record:'24-18'},
  ];
  const intakes=[];
  const samItems=samIntakeRows(collection,code=>baseline.procurement_sources.find(s=>s.code===code).id);
  assert.equal(samItems.length,1);
  const samIntake={...samItems[0],id:id(80),updated_at:baseline.captured_at};
  baseline.procurement_intake_items.push(samIntake);intakes.push(samIntake);
  for(let index=0;index<captures.length;index++){
    const {body,type,record}=captures[index];const input=context(body,type);
    input.request.id=request.id;input.source.id=source.id;
    input.task.id=id(30+index);input.task.source_id=source.id;
    input.job.task_id=input.task.id;
    input.runs[0].source_id=source.id;input.runs[0].coverage_task_id=input.task.id;
    input.captures[0].source_id=source.id;
    input.capability.source_id=source.id;
    input.task.target_id=id(9);
    baseline.procurement_coverage_tasks.push({id:input.task.id,target_id:id(9),source_id:source.id,kind:'opportunity'});
    const packet=makeInterpretationPacket(input);
    const decision=result(packet);decision.findings[0].record_id=record;
    decision.findings[0].title=index?'Janitorial floor care':'Janitorial services';
    decision.findings[0].payload.title=decision.findings[0].title;
    decision.findings[0].evidence[0].excerpt=index?'24-18 Janitorial floor care':'24-17 Janitorial services';
    assert.equal(validateInterpretation(packet,decision).status,'reviewed_with_results');
    const {manifest}=planInterpretationIntake(packet,decision,baseline,{[id(5)]:index?'saved.pdf':'saved.html'});
    assert.equal(manifest.rows.length,1);
    const intake=manifest.rows[0].row;
    intake.updated_at=baseline.captured_at;
    baseline.procurement_intake_items.push(intake);intakes.push(intake);
    assert.equal(planInterpretationIntake(packet,decision,baseline,{[id(5)]:index?'saved.pdf':'saved.html'}).manifest.rows.length,0);
  }
  const review={version:1,batch:'known-source-local-end-to-end',project_ref:baseline.project_ref,
    request_id:request.id,work_state:'AR',scope:'Saved Arkansas janitorial listings',
    limitations:'Two offline public records; SAM API notice checked separately and excluded from this city import',
    reviewed_by:'Offline fixture reviewer',run_ids:[sam.run_id],allow_partial:false,
    decisions:intakes.map(item=>({intake_id:item.id,intake_hash:hash(item.payload),action:'process',approve_new:true,
      reason:'Reviewed official saved evidence',request_match_reason:'Arkansas work site stated in saved evidence',
      ...(item.id===samIntake.id?{new_bid_type:'award'}:{})}))};
  const manifest=planReviewedBatch(baseline,review,[sam]);
  assert.equal(manifest.records.length,3);
  const verified=await testBatchSql(PGlite,baseline,schema,manifest,reconciliationSql(manifest));
  assert.equal(verified.status,'offline_tests_passed');
  assert.equal(verified.rollback,true);assert.equal(verified.readback,true);assert.equal(verified.replay,true);
});
