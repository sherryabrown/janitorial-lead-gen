import assert from 'node:assert/strict';
import {hostedWorkflow} from '../../scripts/lib/hosted-workflow.mjs';
import {discoveryService} from '../../scripts/lib/hosted-discovery.mjs';
import {countyTriggers} from '../../scripts/lib/county-triggers.mjs';
import {executeKnownSources} from '../../scripts/lib/known-source-collection.mjs';
import {postgresTransport} from '../../scripts/lib/hosted-import.mjs';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';
import {checked,sha} from '../../scripts/lib/hosted-store.mjs';
import {procurementSchedules} from '../../scripts/lib/procurement-schedules.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {importJobs} from '../../scripts/lib/hosted-import-jobs.mjs';
import {proposeAutomaticListing} from '../../scripts/lib/automatic-public-method.mjs';

export async function verifyAutomaticCounty({db,artifacts,audit,livePool,rehearsalPool,actor,config}) {
  const project='zreplhkoxswtzxlchtjf',errors=[],calls=[];let showAddendum=false;
  const fetcher=async url=>{
    calls.push(String(url));let body;
    if(url==='https://www.arcounties.org/counties/')body='<div class="county"><a href="/counties/arkansas/">Arkansas</a></div>';
    else if(url==='https://www.arcounties.org/counties/arkansas/')body='<h2>Arkansas County</h2><h3><a href="https://county.example/">www.county.example</a></h3>';
    else if(url==='https://county.example/')body='<main><h1>Open bids</h1><p>2 open bids</p><table><tr><th>Bid number</th><th>Title</th><th>Work county</th><th>Work state</th><th>Deadline</th></tr><tr><td>26-1</td><td><a href="/bid/26-1">Janitorial services</a></td><td>Arkansas County</td><td>AR</td><td>2027-01-01</td></tr><tr><td>26-2</td><td><a href="/bid/26-1">Janitorial services annex</a></td><td></td><td>AR</td><td>2027-01-01</td></tr></table></main>';
    else if(url==='https://county.example/bid/26-1')body='<main><h1>Janitorial services</h1><p>Bid 26-1; work county: Arkansas County, AR. Deadline: 2027-01-01.</p></main>';
    else if(url==='https://arkansas.ionwave.net/SourcingEvents.aspx?SourceType=1'){body=readFileSync('tests/fixtures/county/ionwave-public-listing.html','utf8');if(showAddendum)body=body.replaceAll('26003','26003 Addendum 1').replaceAll('1642','1760');}
    else if(url==='https://arkansas.ionwave.net/PublicDetail.aspx?bidID=1642&SourceType=1')body=readFileSync('tests/fixtures/county/ionwave-public-detail.html');
    else if(url==='https://arkansas.ionwave.net/PublicDetail.aspx?bidID=1760&SourceType=1')body=readFileSync('tests/fixtures/county/ionwave-public-detail.html','utf8').replaceAll('26003','26003 Addendum 1');
    else if(url==='https://lrsd.ionwave.net/SourcingEvents.aspx?SourceType=1')body=readFileSync('tests/fixtures/county/lrsd-empty-published.html');
    else if(url==='https://clintonairport.gob2g.com/FrontEnd/proposalsearchpublic.asp')body=readFileSync('tests/fixtures/county/airport-b2g-published.html');
    else if(url==='https://vendors.planetbids.com/portal/90401/portal-home')return new Response(null,{status:202});
    else if(url==='https://saline-entry.example/')body='<main><h1>Saline County official website</h1><p>Contact purchasing for publication details.</p></main>';
    else if(url==='https://forecast.example/contractors/')body='<a href="/September.pdf">View the Forecast</a>';
    else if(url==='https://forecast.example/September.pdf')return new Response(readFileSync('tests/fixtures/county/airport-forecast-published.pdf'),{headers:{'content-type':'application/pdf'}});
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
    continueCollection:workflow.continueVerifiedCollection,collect:async({requestId,sourceCode,planOnly})=>executeKnownSources({db,project,artifacts,requestId,
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
  const imported=(await livePool.query("select id,checkpoint from procurement_jobs where search_request_id=$1 and checkpoint->>'stage'='import_verified' and checkpoint->'receipt'->>'verified'='true'",[child.request_id])).rows.find(j=>j.checkpoint.reporting_records?.records?.length);
  assert.ok(imported);assert.equal(imported.checkpoint.reporting_records.records[0].id,originalLead.id);
  await livePool.query("update procurement_jobs set state='outcome_unknown',checkpoint=$2 where id=$1",[imported.id,{...imported.checkpoint,stage:'import_reconcile'}]);
  await imports.reconcile(imported.id,{},actor);
  assert.deepEqual((await livePool.query('select checkpoint from procurement_jobs where id=$1',[imported.id])).rows[0].checkpoint.reporting_records,imported.checkpoint.reporting_records,'County reconciliation retains identical reporting without another import');
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
  // Keep two channels for the same agency independent using existing source
  // identities: one working public portal cannot resolve another portal's gap.
  const publicSources=[];
  for(const [code,url]of [['lrsd-public-native','https://lrsd.ionwave.net/SourcingEvents.aspx?SourceType=1'],['airport-b2g-native','https://clintonairport.gob2g.com/FrontEnd/proposalsearchpublic.asp'],['airport-planet-native','https://vendors.planetbids.com/portal/90401/portal-home']]) {
    const row={...source,id:randomUUID(),identity_key:randomUUID(),code,name:code,url};
    if(code==='lrsd-public-native') {
      row.url='https://lrsd.ionwave.net/original-index';
      row.config={...row.config,research_persistence:{coverage_by_scope:{fixture:{verified_public_entry:{url,official_entry_url:row.url,
        checked_at:new Date().toISOString(),content_sha256:'a'.repeat(64),official_link_artifact:await artifacts.put(Buffer.from('Official published bid link'))}}}}};
    }
    checked(await db.from('procurement_sources').insert(row));publicSources.push(row);
    if(code==='airport-planet-native')continue;
    const spec=code==='lrsd-public-native'?{version:1,runner_id:'public-fetch',check_when:'each_request',urls:[url],allowed_hosts:['lrsd.ionwave.net'],max_bytes:2000000,response_format:'html-table-v1',max_records:100,expected_organization:'Purchasing',table_selector:'table.rgMasterTable',row_selector:'tr.rgRow, tr.rgAltRow',public_details:{key:'BidID',endpoint:'https://lrsd.ionwave.net/PublicDetail.aspx',client_state_selector:'input#ctl00_mainContent_rgBidList_ClientState'}}:proposeAutomaticListing(readFileSync('tests/fixtures/county/airport-b2g-published.html'),url).spec;
    checked(await db.from('procurement_source_capabilities').insert({id:randomUUID(),source_id:row.id,kind:'opportunity',method:'browser',endpoint_url:url,official_entry_url:url,route_geography_id:city,availability:'active',verified_at:new Date().toISOString(),verified_until:'2027-12-31T00:00:00Z',verification_evidence:{automation_policy:'county-public-v1',fixture:true},parser_version:'saline-public-native',method_spec:spec}));
  }
  const detailPreview=await triggers.preview({...config,county_ids:['05001']});
  const detailRun=await triggers.submit({...detailPreview.config,confirmed_scope:true,preview_hash:detailPreview.preview_hash},actor,'public-detail-native-fixture');
  for(let n=0;n<100;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const detailChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',detailRun.trigger_id)).find(c=>c.role==='county');
  const detailStatus=await workflow.status(detailChild.request_id),candidate=detailStatus.candidates.find(c=>c.title==='Janitorial Services at Clearwater Administrative Building and Clearwater Maintenance Complex');
  for(const row of publicSources.slice(0,2))assert.ok(detailStatus.tasks.some(t=>t.source_id===row.id&&t.category==='opportunity'&&t.state==='reviewed_no_results'),JSON.stringify({source:row.code,tasks:detailStatus.tasks.filter(t=>t.source_id===row.id),jobs:detailStatus.jobs}));
  assert.ok(detailStatus.tasks.some(t=>t.source_id===publicSources[2].id&&t.category==='opportunity'&&t.state==='method_missing'),'Unverified PlanetBids remains separate from working B2Gnow');
  assert.equal(checked(await db.from('procurement_leads').select('id').in('source_id',publicSources.map(s=>s.id))).length,0,'No invented lead from empty listings or an inaccessible channel');
  assert.ok(candidate,JSON.stringify({message:'Actual public detail evidence reaches native intake',jobs:detailStatus.jobs,tasks:detailStatus.tasks,candidates:detailStatus.candidates}));
  const intake=checked(await db.from('procurement_intake_items').select('*').eq('id',candidate.intake_id).single());
  assert.equal(intake.source_id,sourceId);assert.equal(intake.payload.work_city,'Little Rock');assert.equal(intake.payload.deadline,'2026-11-05');
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',sourceId)).length,1,JSON.stringify({message:'Public detail collection automatically imports validated county result',automatic:detailStatus.automatic_import,jobs:detailStatus.jobs}));
  assert.equal((await workflow.status(detailChild.request_id)).automatic_import.verified,true);
  assert.equal(intake.payload.manual_capture.amends_intake_id,legacyParent);
  const repeatPreview=await triggers.preview({...config,maintain_sources:false,county_ids:['05001']});
  const detailRepeat=await triggers.submit({...repeatPreview.config,confirmed_scope:true,preview_hash:repeatPreview.preview_hash},actor,'public-detail-pending-parent-repeat');
  for(let n=0;n<100;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const repeatChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',detailRepeat.trigger_id)).find(c=>c.role==='county');
  const repeatedStatus=await workflow.status(repeatChild.request_id),repeatedCandidate=repeatedStatus.candidates.find(c=>c.title===candidate.title);
  assert.equal(repeatedCandidate?.state,'imported',JSON.stringify({automatic:repeatedStatus.automatic_import,jobs:repeatedStatus.jobs}));
  assert.ok(repeatedStatus.automatic_import.unchanged>=1);
  const publicLead=checked(await db.from('procurement_leads').select('id').eq('source_id',sourceId).single());
  const repeatReceipts=checked(await db.from('procurement_jobs').select('checkpoint').eq('search_request_id',repeatChild.request_id));
  assert.ok(repeatReceipts.some(j=>j.checkpoint?.receipt?.verified&&j.checkpoint.reporting_records?.records?.some(r=>r.id===publicLead.id&&r.outcome==='unchanged')),'The public source repeat specifically reports its one canonical lead unchanged');assert.equal(repeatedStatus.automatic_import.exclusions.some(e=>e.intake_id===repeatedCandidate.intake_id),false,'A verified save clears only its own earlier exception');
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',sourceId)).length,1,'Pending-parent sibling repeat reuses the canonical lead');
  assert.equal(checked(await db.from('procurement_intake_items').select('status').eq('id',legacyParent).single()).status,'pending','Do not import or rewrite the unreviewed ancestor');
  // Existing manual and naturally due scheduled entry points observe a new
  // public portal ID for the same published solicitation, without approval.
  const canonical=checked(await db.from('procurement_leads').select('*').eq('source_id',sourceId).single());
  await livePool.query("update procurement_leads set stage='applied',notes='Protected addendum sales data' where id=$1",[canonical.id]);
  const addendumActor=randomUUID();await livePool.query('insert into auth.users(id) values($1)',[addendumActor]);
  showAddendum=true;
  const addendumPreview=await triggers.preview({...config,maintain_sources:false,county_ids:['05001']});
  const addendumRun=await triggers.submit({...addendumPreview.config,confirmed_scope:true,preview_hash:addendumPreview.preview_hash},addendumActor,'public-detail-addendum');
  for(let n=0;n<120;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const addendumChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',addendumRun.trigger_id)).find(c=>c.role==='county');
  const addendumStatus=await workflow.status(addendumChild.request_id);
  assert.equal(addendumStatus.automatic_import.updated,1,JSON.stringify(addendumStatus.automatic_import));
  let preserved=checked(await db.from('procurement_leads').select('*').eq('source_id',sourceId).single());
  assert.equal(preserved.id,canonical.id);assert.equal(preserved.external_id,'1642');assert.equal(preserved.stage,'applied');assert.equal(preserved.notes,'Protected addendum sales data');
  assert.ok(preserved.payload.county_solicitation_identity.observations.some(o=>o.record_id==='1760'));
  let addendumClock=new Date();
  const addendumScheduler=procurementSchedules({db,triggers,audit,now:()=>addendumClock});
  const scheduleInput={...input,name:'Addendum due fixture',config:{...detailPreview.config,maintain_sources:false},recurrence:{timezone:'America/Chicago',frequency:'daily',local_times:['09:00']}};
  const sp=await addendumScheduler.preview(scheduleInput),saved=await addendumScheduler.save(null,{...scheduleInput,confirmed_scope:true,preview_hash:sp.preview_hash},addendumActor,'addendum-scheduled');
  addendumClock=new Date(Date.parse(saved.next_due_at)+1000);await addendumScheduler.tick();
  for(let n=0;n<120;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const due=(await addendumScheduler.occurrences(saved.id)).items[0],dueChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',due.trigger_id)).find(c=>c.role==='county');
  const dueStatus=await workflow.status(dueChild.request_id);
  assert.ok(dueStatus.automatic_import.unchanged>=1,JSON.stringify(dueStatus.automatic_import));
  const dueReceipts=checked(await db.from('procurement_jobs').select('checkpoint').eq('search_request_id',dueChild.request_id));
  assert.ok(dueReceipts.some(j=>j.checkpoint?.receipt?.verified&&j.checkpoint.reporting_records?.records?.some(r=>r.id===canonical.id&&r.outcome==='unchanged')),'Naturally scheduled addendum repeat reports the retained canonical lead unchanged');
  preserved=checked(await db.from('procurement_leads').select('*').eq('source_id',sourceId).single());assert.equal(preserved.id,canonical.id);assert.equal(preserved.stage,'applied');assert.equal(preserved.notes,'Protected addendum sales data');
  await addendumScheduler.control(saved.id,'archive',{expected_version:saved.version},addendumActor);
  const lrsd=publicSources[0];
  checked(await db.from('procurement_source_capabilities').update({verified_at:'2026-09-01T00:00:00Z',verified_until:'2026-10-01T00:00:00Z'}).eq('source_id',lrsd.id));
  const renewalActor=randomUUID();
  await livePool.query('insert into auth.users(id) values($1)',[renewalActor]);
  const renewPreview=await triggers.preview({...config,maintain_sources:true,county_ids:['05001']});
  const renew=await triggers.submit({...renewPreview.config,confirmed_scope:true,preview_hash:renewPreview.preview_hash},renewalActor,'public-table-renewal');
  for(let n=0;n<150;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const renewed=checked(await db.from('procurement_source_capabilities').select('*').eq('source_id',lrsd.id).single());
  const renewalChildren=checked(await db.from('procurement_trigger_requests').select('request_id').eq('trigger_id',renew.trigger_id));
  assert.ok(Date.parse(renewed.verified_until)>Date.now(),JSON.stringify({message:'Expired public table is reverified against fresh official listing bytes',jobs:checked(await db.from('procurement_jobs').select('kind,state,checkpoint').in('search_request_id',renewalChildren.map(c=>c.request_id)))}));
  assert.equal(calls.includes(lrsd.url),false,'Maintenance and renewal use the reviewed smaller entry without changing source identity');
  assert.equal(checked(await db.from('procurement_sources').select('url').eq('id',lrsd.id).single()).url,lrsd.url);
  assert.ok(renew.trigger_id);
  const forecastSource={...publicSources[1],id:randomUUID(),identity_key:randomUUID(),code:'airport-forecast-native',name:'Airport forecast native',url:'https://forecast.example/old.pdf',config:{}};
  const indexBody=Buffer.from('<a href="/September.pdf">View the Forecast</a>');
  forecastSource.config={research_persistence:{coverage_by_scope:{fixture:{verified_public_entry:{url:'https://forecast.example/contractors/',official_entry_url:forecastSource.url,checked_at:new Date().toISOString(),content_sha256:sha(indexBody),official_link_artifact:await artifacts.put(indexBody)}}}}};
  checked(await db.from('procurement_sources').insert(forecastSource));
  const forecastSpec={version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://forecast.example/contractors/'],allowed_hosts:['forecast.example'],max_bytes:2000000,linked_document:{anchor_text:'View the Forecast'}};
  checked(await db.from('procurement_source_capabilities').insert({id:randomUUID(),source_id:forecastSource.id,kind:'forecast',method:'document',endpoint_url:forecastSpec.urls[0],official_entry_url:forecastSource.url,route_geography_id:city,availability:'active',verified_at:new Date().toISOString(),verified_until:'2027-12-31T00:00:00Z',verification_evidence:{automation_policy:'county-public-v1',fixture:true},parser_version:'linked-forecast-native-v1',method_spec:forecastSpec}));
  const forecastConfig={...config,county_ids:['05001'],maintain_sources:false,requested_categories:['forecast'],search_windows:{forecast:{from:'2026-10-19',to:'2027-10-19',date_basis:'expected_solicitation'}}};
  const forecastPreview=await triggers.preview(forecastConfig);
  const forecastRun=await triggers.submit({...forecastPreview.config,confirmed_scope:true,preview_hash:forecastPreview.preview_hash},renewalActor,'forecast-native');
  for(let n=0;n<120;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const forecastChildren=checked(await db.from('procurement_trigger_requests').select('request_id').eq('trigger_id',forecastRun.trigger_id));
  const forecastTasks=checked(await db.from('procurement_coverage_tasks').select('*').eq('source_id',forecastSource.id));
  assert.ok(forecastTasks.some(t=>t.kind==='forecast'&&t.pages_reviewed===1),'Native worker captures the currently linked PDF');
  const forecastRuns=checked(await db.from('procurement_runs').select('*').eq('source_id',forecastSource.id));
  assert.ok(forecastRuns.some(r=>r.detail?.linked_index?.artifact?.startsWith('artifacts/')),'Published index provenance is immutable');
  const interpretations=checked(await db.from('procurement_interpretations').select('*').in('request_id',forecastChildren.map(c=>c.request_id)));
  assert.ok(interpretations.some(i=>JSON.stringify(i).includes('Q1 2027')),'Later PDF rows survive native interpretation');
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',forecastSource.id)).length,0,'Quarter support never bypasses missing routine-scope/location evidence');
  checked(await db.from('procurement_source_capabilities').update({verified_at:'2026-09-01T00:00:00Z',verified_until:'2026-10-01T00:00:00Z'}).eq('source_id',forecastSource.id));
  const forecastRenewPreview=await triggers.preview({...forecastConfig,maintain_sources:true});
  await triggers.submit({...forecastRenewPreview.config,confirmed_scope:true,preview_hash:forecastRenewPreview.preview_hash},renewalActor,'forecast-renew-native');
  for(let n=0;n<150;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const renewedForecast=checked(await db.from('procurement_source_capabilities').select('*').eq('source_id',forecastSource.id).single());
  assert.ok(Date.parse(renewedForecast.verified_until)>Date.now(),'Expired linked forecast method renews only after fresh index and recognizable PDF capture');
  assert.equal(renewedForecast.method,'document');
  assert.equal(calls.includes(forecastSource.url),false,'Renewal retains identity while following the reviewed current index');
  // Reproduce late directory registration after the leased interpreter has
  // already stopped. No verified method or manual collector invocation follows.
  await livePool.query("insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values('05125','county','Saline County','fixture','1','late-entry') on conflict(id) do nothing");
  const salineActor=randomUUID();await livePool.query('insert into auth.users(id) values($1)',[salineActor]);
  const salinePreview=await triggers.preview({...config,maintain_sources:false,check_updates:true,county_ids:['05125']});
  const saline=await triggers.submit({...salinePreview.config,confirmed_scope:true,preview_hash:salinePreview.preview_hash},salineActor,'saline-late-entry-capture');
  for(let n=0;n<50;n++)if(!await workflow.step()&&!await triggers.step())break;
  const salineChild=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',saline.trigger_id)).find(c=>c.role==='county');
  const salineRequest=salineChild.request_id;
  assert.equal((await livePool.query("select state from procurement_jobs where search_request_id=$1 and dedupe_key=$2",[salineRequest,`api-workflow:${salineRequest}`])).rows[0].state,'blocked');
  const lateSource={...offline,id:randomUUID(),identity_key:randomUUID(),code:'saline-late-entry',name:'Saline County late official entry',url:'https://saline-entry.example/',contracting_entity_geo_level:'county',source_coverage_areas:[{area_type:'county',county_name:'Saline County',state_code:'AR'}]};
  checked(await db.from('procurement_sources').insert(lateSource));
  await executeKnownSources({db,project,artifacts,command:'plan',requestId:salineRequest});
  const entry=(await livePool.query("select j.id from procurement_jobs j join procurement_coverage_tasks t on t.id=j.task_id where j.search_request_id=$1 and t.source_id=$2 and t.kind='source_entry' and j.state='pending'",[salineRequest,lateSource.id])).rows[0];
  assert.ok(entry,'Registration and replan queue the initial check');
  await triggers.wake(salineRequest);
  for(let n=0;n<50;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  assert.equal((await livePool.query('select state from procurement_jobs where id=$1',[entry.id])).rows[0].state,'succeeded','Coordinator hands the initial capture to the existing worker');
  const captures=(await livePool.query('select * from procurement_runs where job_id=$1',[entry.id])).rows;
  assert.equal(captures.length,1,'Exactly one saved initial capture');
  assert.equal(calls.filter(url=>url===lateSource.url).length,1);
  assert.equal((await livePool.query("select count(*)::integer as n from procurement_jobs where search_request_id=$1 and state in ('pending','running')",[salineRequest])).rows[0].n,0,'Saline settles without orphaned work');
  await workflow.continueVerifiedCollection(salineRequest,{initialCapturesOnly:true});
  assert.equal(await workflow.step(),false,'Completed entry checks do not create a polling loop');
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',lateSource.id)).length,0,'Entry capture alone cannot invent an opportunity');
  return {source_count:sources.length,candidates:status.total_candidates,scheduled_candidates:scheduledStatus.total_candidates,canonical_writes:2,saline_initial_captures:captures.length};
}
