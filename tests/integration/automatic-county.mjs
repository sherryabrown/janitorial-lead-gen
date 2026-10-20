import assert from 'node:assert/strict';
import {hostedWorkflow} from '../../scripts/lib/hosted-workflow.mjs';
import {discoveryService} from '../../scripts/lib/hosted-discovery.mjs';
import {countyTriggers} from '../../scripts/lib/county-triggers.mjs';
import {executeKnownSources} from '../../scripts/lib/known-source-collection.mjs';
import {postgresTransport} from '../../scripts/lib/hosted-import.mjs';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';
import {checked} from '../../scripts/lib/hosted-store.mjs';
import {procurementSchedules} from '../../scripts/lib/procurement-schedules.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {importJobs} from '../../scripts/lib/hosted-import-jobs.mjs';

export async function verifyAutomaticCounty({db,artifacts,audit,livePool,rehearsalPool,actor,config}) {
  const project='zreplhkoxswtzxlchtjf',errors=[],calls=[];
  const fetcher=async url=>{
    calls.push(String(url));let body;
    if(url==='https://www.arcounties.org/counties/')body='<div class="county"><a href="/counties/arkansas/">Arkansas</a></div>';
    else if(url==='https://www.arcounties.org/counties/arkansas/')body='<h2>Arkansas County</h2><h3><a href="https://county.example/">www.county.example</a></h3>';
    else if(url==='https://county.example/')body='<main><h1>Open bids</h1><p>2 open bids</p><table><tr><th>Bid number</th><th>Title</th><th>Work county</th><th>Work state</th><th>Deadline</th></tr><tr><td>26-1</td><td><a href="/bid/26-1">Janitorial services</a></td><td>Arkansas County</td><td>AR</td><td>2027-01-01</td></tr><tr><td>26-2</td><td><a href="/bid/26-1">Janitorial services annex</a></td><td></td><td>AR</td><td>2027-01-01</td></tr></table></main>';
    else if(url==='https://county.example/bid/26-1')body='<main><h1>Janitorial services</h1><p>Bid 26-1; work county: Arkansas County, AR. Deadline: 2027-01-01.</p></main>';
    else if(url==='https://arkansas.ionwave.net/SourcingEvents.aspx?SourceType=1')body=readFileSync('tests/fixtures/county/ionwave-public-listing.html');
    else if(url==='https://arkansas.ionwave.net/PublicDetail.aspx?bidID=1642&SourceType=1')body=readFileSync('tests/fixtures/county/ionwave-public-detail.html');
    else throw Error(`Unexpected isolated county destination ${url}`);
    return new Response(body,{headers:{'content-type':'text/html'}});
  };
  let discovery,imports,aiCalls=0;
  const workflow=hostedWorkflow({db,project,artifacts,audit,collectionFetch:fetcher,supportingFetch:fetcher,serverKey:'isolated-county-public-evidence-key',aiConfig:{enabled:true},
    ai:async({packet})=>{if(++aiCalls>1){const error=Error('Fixture budget reached');error.code='ai_budget_reached';throw error;}
      return {version:1,packet_hash:packet.packet_hash,reviewed_by:'fixture',reviewed_scope:'Fixture invalid AI',coverage:'partial',
        findings:[],exclusions:[],unresolved:[{reason:'Invalid quotation fixture',evidence:[{run_id:packet.pages[0].run_id,locator:'saved document',excerpt:'This quotation never occurred'}]}]};},
    automaticCounty:id=>imports.prepareCounty(id),processJob:(job,c,save)=>c.stage.startsWith('import_')?imports.step(job,c,save):discovery.step(job,c,save),reportError:(_id,error)=>errors.push(error)});
  imports=importJobs({db,project,artifacts,transport:postgresTransport(livePool,project),rehearse:nativeRehearsal(rehearsalPool),countyEvidence:(id,candidates)=>workflow.countyEvidence(id,candidates)});
  discovery=discoveryService({db,project,artifacts,fetcher,transport:postgresTransport(livePool,project),rehearse:nativeRehearsal(rehearsalPool),
    continueCollection:workflow.continueVerifiedCollection,collect:async({requestId,sourceCode,planOnly})=>executeKnownSources({db,project,requestId,
      selectedSourceCode:sourceCode,command:planOnly?'plan':'run',fetcher,maxJobs:4,retryPartial:false})});
  const triggers=countyTriggers({db,workflow,discovery,audit,automaticCounty:id=>imports.prepareCounty(id)});
  const preview=await triggers.preview({...config,county_ids:['05001']});
  const run=await triggers.submit({...preview.config,confirmed_scope:true,preview_hash:preview.preview_hash},actor,'automatic-county-isolated');
  for(let n=0;n<65;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const children=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',run.trigger_id));
  const child=children.find(c=>c.role==='county');assert.ok(child);
  const status=await workflow.status(child.request_id);
  assert.equal(status.total_candidates,1,JSON.stringify(status.jobs));
  const process=checked(await db.from('procurement_jobs').select('checkpoint').eq('search_request_id',child.request_id).eq('kind','process'));
  assert.ok(process.some(job=>job.checkpoint.ai_rejected_task_ids?.length),'Invalid AI evidence falls back without stopping valid deterministic candidates');
  const sources=checked(await db.from('procurement_sources').select('id').eq('url','https://county.example/'));
  assert.equal(sources.length,1);
  const capabilities=checked(await db.from('procurement_source_capabilities').select('*').eq('source_id',sources[0].id));
  assert.equal(capabilities.length,1);assert.equal(capabilities[0].verification_evidence.automation_policy,'county-public-v1');
  assert.equal(checked(await db.from('procurement_intake_leads').select('lead_id').eq('intake_id',status.candidates[0].intake_id)).length,1,JSON.stringify({message:'Valid county result automatically imports without approval',jobs:status.jobs,automatic:status.automatic_import}));
  const originalLead=checked(await db.from('procurement_leads').select('*').eq('source_id',sources[0].id).single());
  await livePool.query("update procurement_leads set stage='hold',notes='Protected sales note' where id=$1",[originalLead.id]);
  assert.ok(calls.includes('https://www.arcounties.org/counties/'));
  const before=calls.length;await discovery(child.request_id,{task_id:checked(await db.from('procurement_jobs').select('checkpoint').eq('search_request_id',child.request_id).eq('kind','discover'))[0].checkpoint.task_id},actor);
  assert.equal(calls.length,before,'Saved discovery replay does not refetch');
  const directoryReads=calls.filter(url=>url.includes('arcounties.org')).length;
  await livePool.query("insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values('05003','county','Ashley County','fixture','1','shared-route')");
  await livePool.query("update procurement_source_capabilities set route_geography_id='05003',verification_evidence=verification_evidence || '{\"route_geography_ids\":[\"05001\",\"05003\"]}'::jsonb where id=$1",[capabilities[0].id]);
  const sharedCity='ARM'+ 'c'.repeat(32);
  await livePool.query("insert into procurement_geographies(id,kind,name,incorporated,dataset_url,dataset_version,dataset_hash) values($1,'municipality','Fixture City',true,'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41','fixture','shared-city')",[sharedCity]);
  await livePool.query("insert into procurement_place_counties(place_id,county_id) values($1,'05001')",[sharedCity]);
  await livePool.query("update procurement_source_capabilities set verification_evidence=verification_evidence || jsonb_build_object('route_geography_ids',jsonb_build_array('05001','05003',$1::text)) where id=$2",[sharedCity,capabilities[0].id]);
  // A later request must reverify an expired registered method without requiring
  // an already-existing request/source association or another directory lookup.
  await livePool.query("update procurement_source_capabilities set verified_at='2026-09-01T00:00:00Z',verified_until='2026-10-01T00:00:00Z' where id=$1",[capabilities[0].id]);
  const offline={...checked(await db.from('procurement_sources').select('*').eq('id',sources[0].id).single()),
    id:randomUUID(),identity_key:randomUUID(),config:{},code:'automatic-offline',name:'Offline county website',url:'https://offline.example/'};
  checked(await db.from('procurement_sources').insert(offline));
  const rootReads=calls.filter(url=>url==='https://county.example/').length;
  let scheduleAt='2026-10-13T14:00:00Z';
  const schedules=procurementSchedules({db,triggers,now:()=>new Date(scheduleAt)});
  const input={name:'Automatic county isolated',enabled:true,config:{...config,county_ids:['05001']},
    recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00']},window_policy:{opportunity:{from_offset_days:0,to_offset_days:365,date_basis:'deadline'}}};
  const scheduledPreview=await schedules.preview(input);
  const schedule=await schedules.save(null,{...input,confirmed_scope:true,preview_hash:scheduledPreview.preview_hash},actor,'automatic-county-schedule');
  await livePool.query("update procurement_schedules set next_due_at='2026-10-13T14:00:00Z' where id=$1",[schedule.id]);
  await schedules.tick();await schedules.tick();
  for(let n=0;n<65;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const occurrences=await schedules.occurrences(schedule.id);assert.equal(occurrences.items.length,1);
  const scheduledChildren=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',occurrences.items[0].trigger_id));
  const scheduledStatus=await workflow.status(scheduledChildren.find(c=>c.role==='county').request_id);
  assert.equal(scheduledStatus.total_candidates,1);
  assert.equal(calls.filter(url=>url==='https://county.example/').length-rootReads,1,'City/county discovery and collection share one actual page acquisition');
  assert.ok((await livePool.query("select count(*)::integer as n from procurement_runs r join procurement_jobs j on j.id=r.job_id where j.search_request_id=$1 and r.detail ? 'reused_run_id'",[scheduledChildren.find(c=>c.role==='county').request_id])).rows[0].n>0,'Per-route runs retain capture reuse provenance');
  assert.equal(scheduledStatus.tasks.filter(task=>task.source_id===sources[0].id&&task.state==='method_missing').length,0,'Shared-route method gaps reconcile after activation');
  assert.equal(scheduledStatus.tasks.some(task=>task.state==='superseded'),false,'Resolved historic gaps are omitted from current county results');
  assert.equal(checked(await db.from('procurement_source_capabilities').select('route_geography_id').eq('id',capabilities[0].id).single()).route_geography_id,'05003','Native shared-route registration retains original method identity');
  const guardClient=await livePool.connect();
  try {
    await guardClient.query('begin');
    await guardClient.query("update procurement_source_capabilities set verification_evidence=verification_evidence-'automation_policy' where id=$1",[capabilities[0].id]);
    const requestId=scheduledChildren.find(c=>c.role==='county').request_id;
    const target=(await guardClient.query('select id from procurement_request_targets where search_request_id=$1 and geography_id=$2',[requestId,'05001'])).rows[0];
    await assert.rejects(guardClient.query('select create_procurement_known_plan($1,$2::jsonb)',[requestId,JSON.stringify([{target_id:target.id,
      route_geography_id:'05001',kind:'opportunity',state:'unchecked',task_key:'unverified-association',query_window:{},priority:1,agency_scope:'county',
      capability_id:capabilities[0].id,source_id:sources[0].id}])]),/current runnable capability/);
  } finally {await guardClient.query('rollback');guardClient.release();}
  assert.ok(checked(await db.from('procurement_jobs').select('checkpoint').eq('search_request_id',scheduledChildren.find(c=>c.role==='county').request_id).eq('kind','process')).some(job=>job.checkpoint.ai_budget_reached),'Budget exhaustion retains deterministic candidates');
  assert.equal(calls.filter(url=>url.includes('arcounties.org')).length,directoryReads,'Verified method reused on scheduled run');
  assert.equal(checked(await db.from('procurement_sources').select('id').eq('url','https://county.example/')).length,1);
  const savedLead=checked(await db.from('procurement_leads').select('*').eq('source_id',sources[0].id).single());
  assert.equal(savedLead.id,originalLead.id);assert.equal(savedLead.stage,'hold');assert.equal(savedLead.notes,'Protected sales note');
  const scheduledRequest=scheduledChildren.find(c=>c.role==='county').request_id;
  const failed=(await livePool.query("select j.id,j.task_id from procurement_jobs j join procurement_coverage_tasks t on t.id=j.task_id where j.search_request_id=$1 and t.source_id=$2 and t.kind='source_entry'",[scheduledRequest,offline.id])).rows[0];
  assert.ok(failed,'Offline entry is checked independently');
  assert.equal((await livePool.query('select state from procurement_jobs where id=$1',[failed.id])).rows[0].state,'partial','Read-only failure cannot hold future schedules');
  // Reproduce an older deployment's documented failed GET for native recovery.
  await livePool.query("update procurement_jobs set state='outcome_unknown' where id=$1",[failed.id]);
  await livePool.query("update procurement_runs set detail=detail || '{\"state\":\"request_pending\"}'::jsonb where job_id=$1",[failed.id]);
  await livePool.query("update procurement_triggers set state='outcome_unknown' where id=$1",[occurrences.items[0].trigger_id]);
  const protectedClient=await livePool.connect();
  try {
    await protectedClient.query('begin');
    await protectedClient.query("insert into procurement_jobs(search_request_id,kind,state,dedupe_key,checkpoint) values($1,'process','outcome_unknown','fixture-uncertain-effect','{\"stage\":\"import_reconcile\"}')",[scheduledRequest]);
    await protectedClient.query('select reconcile_procurement_county_reads($1,null)',[schedule.id]);
    assert.equal((await protectedClient.query('select state from procurement_triggers where id=$1',[occurrences.items[0].trigger_id])).rows[0].state,'outcome_unknown','True unknown effects keep the overlap guard');
  } finally {await protectedClient.query('rollback');protectedClient.release();}
  scheduleAt='2026-10-14T14:00:00Z';await schedules.tick();await schedules.tick();
  for(let n=0;n<100;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const repeated=await schedules.occurrences(schedule.id);
  assert.equal(repeated.items.length,2);assert.ok(repeated.items.every(o=>o.trigger_id&&o.state==='queued'),'Second occurrence runs after safe failed-read reconciliation');
  assert.equal((await livePool.query('select state from procurement_jobs where id=$1',[failed.id])).rows[0].state,'partial');
  assert.equal(checked(await db.rpc('reconcile_procurement_county_reads',{p_schedule:schedule.id})),0,'Reconciliation replays without new work');
  assert.equal((await livePool.query("select has_function_privilege('authenticated','reconcile_procurement_county_reads(uuid,uuid)','EXECUTE') as allowed")).rows[0].allowed,false);
  await schedules.control(schedule.id,'archive',{expected_version:schedule.version},actor);
  // Exercise the actual public detail continuation through native intake, not
  // just the pure parser. All HTTP responses are saved fixtures in this harness.
  const city='ARM'+'d'.repeat(32),sourceId=randomUUID(),capId=randomUUID();
  await livePool.query("insert into procurement_geographies(id,kind,name,state_code,incorporated,dataset_url,dataset_version,dataset_hash) values($1,'municipality','Little Rock','AR',true,'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41','fixture','public-detail')",[city]);
  await livePool.query("insert into procurement_place_counties(place_id,county_id) values($1,'05001')",[city]);
  const source={...offline,id:sourceId,identity_key:randomUUID(),code:'public-detail-fixture',name:'Fixture public bid table',url:'https://arkansas.ionwave.net/SourcingEvents.aspx?SourceType=1',source_coverage_areas:[{area_type:'city',city_name:'Little Rock',state_code:'AR'}],config:{known_source_route:{home_city:'Little Rock'}}};
  checked(await db.from('procurement_sources').insert(source));
  // An old, unimported observation can remain the staging parent after a newer
  // sibling establishes the canonical lead. Real intake rows have no created_at.
  const legacyParent='ffffffff-ffff-4fff-8fff-fffffffffff0';
  checked(await db.from('procurement_intake_items').insert({id:legacyParent,source_id:sourceId,external_id:'1642',status:'pending',review_reason:'Historical pending fixture',payload:{title:'Historical pending observation',manual_capture:{version:1,record_external_id:'1642'}}}));
  checked(await db.from('procurement_source_capabilities').insert({id:capId,source_id:sourceId,kind:'opportunity',method:'browser',endpoint_url:source.url,official_entry_url:source.url,route_geography_id:city,availability:'active',verified_at:new Date().toISOString(),verified_until:'2027-12-31T00:00:00Z',verification_evidence:{automation_policy:'county-public-v1',fixture:true},parser_version:'public-detail-native-fixture',method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:[source.url],allowed_hosts:['arkansas.ionwave.net'],max_bytes:2000000,response_format:'html-table-v1',max_records:100,expected_organization:'Little Rock Water Reclamation Authority',table_selector:'table.rgMasterTable',row_selector:'tr.rgRow, tr.rgAltRow',public_details:{key:'BidID',endpoint:'https://arkansas.ionwave.net/PublicDetail.aspx',client_state_selector:'input#ctl00_mainContent_rgBidList_ClientState'}}}));
  const detailPreview=await triggers.preview({...config,county_ids:['05001']});
  const detailRun=await triggers.submit({...detailPreview.config,confirmed_scope:true,preview_hash:detailPreview.preview_hash},actor,'public-detail-native-fixture');
  for(let n=0;n<100;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const detailChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',detailRun.trigger_id)).find(c=>c.role==='county');
  const detailStatus=await workflow.status(detailChild.request_id),candidate=detailStatus.candidates.find(c=>c.title==='Janitorial Services at Clearwater Administrative Building and Clearwater Maintenance Complex');
  assert.ok(candidate,JSON.stringify({message:'Actual public detail evidence reaches native intake',jobs:detailStatus.jobs,tasks:detailStatus.tasks,candidates:detailStatus.candidates}));
  const intake=checked(await db.from('procurement_intake_items').select('*').eq('id',candidate.intake_id).single());
  assert.equal(intake.source_id,sourceId);assert.equal(intake.payload.work_city,'Little Rock');assert.equal(intake.payload.deadline,'2026-11-05');
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',sourceId)).length,1,'Public detail collection automatically imports validated county result');
  assert.equal((await workflow.status(detailChild.request_id)).automatic_import.verified,true);
  assert.equal(intake.payload.manual_capture.amends_intake_id,legacyParent);
  const repeatPreview=await triggers.preview({...config,maintain_sources:false,county_ids:['05001']});
  const detailRepeat=await triggers.submit({...repeatPreview.config,confirmed_scope:true,preview_hash:repeatPreview.preview_hash},actor,'public-detail-pending-parent-repeat');
  for(let n=0;n<100;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const repeatChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',detailRepeat.trigger_id)).find(c=>c.role==='county');
  const repeatedStatus=await workflow.status(repeatChild.request_id),repeatedCandidate=repeatedStatus.candidates.find(c=>c.title===candidate.title);
  assert.equal(repeatedCandidate?.state,'imported',JSON.stringify({automatic:repeatedStatus.automatic_import,jobs:repeatedStatus.jobs}));
  assert.equal(repeatedStatus.automatic_import.unchanged,1);assert.equal(repeatedStatus.automatic_import.exclusions.some(e=>e.intake_id===repeatedCandidate.intake_id),false,'A verified save clears only its own earlier exception');
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',sourceId)).length,1,'Pending-parent sibling repeat reuses the canonical lead');
  assert.equal(checked(await db.from('procurement_intake_items').select('status').eq('id',legacyParent).single()).status,'pending','Do not import or rewrite the unreviewed ancestor');
  return {source_count:sources.length,candidates:status.total_candidates,scheduled_candidates:scheduledStatus.total_candidates,canonical_writes:2};
}
