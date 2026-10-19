import assert from 'node:assert/strict';
import {hostedWorkflow} from '../../scripts/lib/hosted-workflow.mjs';
import {discoveryService} from '../../scripts/lib/hosted-discovery.mjs';
import {countyTriggers} from '../../scripts/lib/county-triggers.mjs';
import {executeKnownSources} from '../../scripts/lib/known-source-collection.mjs';
import {postgresTransport} from '../../scripts/lib/hosted-import.mjs';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';
import {checked} from '../../scripts/lib/hosted-store.mjs';
import {procurementSchedules} from '../../scripts/lib/procurement-schedules.mjs';

export async function verifyAutomaticCounty({db,artifacts,audit,livePool,rehearsalPool,actor,config}) {
  const project='zreplhkoxswtzxlchtjf',errors=[],calls=[];
  const fetcher=async url=>{
    calls.push(String(url));let body;
    if(url==='https://www.arcounties.org/counties/')body='<div class="county"><a href="/counties/arkansas/">Arkansas</a></div>';
    else if(url==='https://www.arcounties.org/counties/arkansas/')body='<h2>Arkansas County</h2><h3><a href="https://county.example/">www.county.example</a></h3>';
    else if(url==='https://county.example/')body='<main><h1>Open bids</h1><p>1 open bids</p><table><tr><th>Bid number</th><th>Title</th><th>Work county</th><th>Work state</th><th>Deadline</th></tr><tr><td>26-1</td><td><a href="/bid/26-1">Janitorial services</a></td><td>Arkansas County</td><td>AR</td><td>2027-01-01</td></tr></table></main>';
    else if(url==='https://county.example/bid/26-1')body='<main><h1>Janitorial services</h1><p>Bid 26-1; work county: Arkansas County, AR. Deadline: 2027-01-01.</p></main>';
    else throw Error(`Unexpected isolated county destination ${url}`);
    return new Response(body,{headers:{'content-type':'text/html'}});
  };
  let discovery;
  const workflow=hostedWorkflow({db,project,artifacts,audit,collectionFetch:fetcher,aiConfig:{enabled:false},
    processJob:(job,c,save)=>discovery.step(job,c,save),reportError:(_id,error)=>errors.push(error)});
  discovery=discoveryService({db,project,artifacts,fetcher,transport:postgresTransport(livePool,project),rehearse:nativeRehearsal(rehearsalPool),
    continueCollection:workflow.continueVerifiedCollection,collect:async({requestId,sourceCode,planOnly})=>executeKnownSources({db,project,requestId,
      selectedSourceCode:sourceCode,command:planOnly?'plan':'run',fetcher,maxJobs:4,retryPartial:false})});
  const triggers=countyTriggers({db,workflow,discovery,audit});
  const preview=await triggers.preview({...config,county_ids:['05001']});
  const run=await triggers.submit({...preview.config,confirmed_scope:true,preview_hash:preview.preview_hash},actor,'automatic-county-isolated');
  for(let n=0;n<65;n++)if(!await workflow.step()&&!await triggers.step())break;
  if(errors.length)throw errors[0];
  const children=checked(await db.from('procurement_trigger_requests').select('*').eq('trigger_id',run.trigger_id));
  const child=children.find(c=>c.role==='county');assert.ok(child);
  const status=await workflow.status(child.request_id);
  assert.equal(status.total_candidates,1,JSON.stringify(status.jobs));
  const sources=checked(await db.from('procurement_sources').select('id').eq('url','https://county.example/'));
  assert.equal(sources.length,1);
  const capabilities=checked(await db.from('procurement_source_capabilities').select('*').eq('source_id',sources[0].id));
  assert.equal(capabilities.length,1);assert.equal(capabilities[0].verification_evidence.automation_policy,'county-public-v1');
  assert.equal(checked(await db.from('procurement_intake_leads').select('lead_id').eq('intake_id',status.candidates[0].intake_id)).length,0,'Non-SAM import approval remains required');
  assert.ok(calls.includes('https://www.arcounties.org/counties/'));
  const before=calls.length;await discovery(child.request_id,{task_id:checked(await db.from('procurement_jobs').select('checkpoint').eq('search_request_id',child.request_id).eq('kind','discover'))[0].checkpoint.task_id},actor);
  assert.equal(calls.length,before,'Saved discovery replay does not refetch');
  const directoryReads=calls.filter(url=>url.includes('arcounties.org')).length;
  const schedules=procurementSchedules({db,triggers,now:()=>new Date('2026-10-13T14:00:00Z')});
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
  assert.equal(calls.filter(url=>url.includes('arcounties.org')).length,directoryReads,'Verified method reused on scheduled run');
  assert.equal(checked(await db.from('procurement_sources').select('id').eq('url','https://county.example/')).length,1);
  assert.equal(checked(await db.from('procurement_leads').select('id').eq('source_id',sources[0].id)).length,0);
  await schedules.control(schedule.id,'archive',{expected_version:schedule.version},actor);
  return {source_count:sources.length,candidates:status.total_candidates,scheduled_candidates:scheduledStatus.total_candidates,canonical_writes:0};
}
