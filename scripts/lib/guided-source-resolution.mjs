import {checked,rows,one,sha} from './hosted-store.mjs';
import {publicUrl,planRegistry,verifyPersistence} from './research-persistence.mjs';
import {persistRegistry} from './hosted-discovery.mjs';
import {resolveOfficialDirectory} from './official-directory.mjs';
import {fetchPublicCheck,researchDestination} from './public-source-check.mjs';
import {safePublicUrl,separateSamSource,registeredPublicEntryUrl,adapterContract} from './known-source-execution.mjs';
import {same} from './sam-normalize.mjs';
import {profileCapabilities} from './procurement-capabilities.mjs';
import {sourceReviewService} from './source-decisions.mjs';
import {HttpError} from './workflow-http.mjs';
import {hash} from './reviewed-batch.mjs';
import {catalogProjection} from './admin-catalog.mjs';
import {sourceInventory} from './source-inventory.mjs';
import {publicReview} from './official-link-discovery.mjs';

const host=url=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
export function candidateWebsite(value){
 let url;try{url=publicUrl(value);}catch{throw new HttpError(400,'Enter a public HTTPS website without credentials.');}
 if(url.length>2000||!safePublicUrl(url,[new URL(url).hostname])||/^(localhost|\[)|\.(internal|local|localhost)$/i.test(new URL(url).hostname))
  throw new HttpError(400,'Enter a public HTTPS website without credentials.');
 return url;
}
export async function verifyWebsiteCandidate({url,source,geography,countyReferences=[],fetcher=fetch,resolveHost,directory=resolveOfficialDirectory}){
 url=candidateWebsite(url);
 if(source&&separateSamSource(source))return {outcome:'needs_developer',reason:'SAM sources use their existing statewide configuration.'};
 // Unsupported portals retain their existing hold. A supplied URL is not a bypass.
 if(/bonfirehub|eunaprocurement|eunasolutions/i.test(url))return {outcome:'needs_developer',reason:'This portal needs supported access before automatic checking can continue.'};
 let identity;
 if(source&&host(registeredPublicEntryUrl(source))===host(url)){
  const original=new URL(registeredPublicEntryUrl(source)),candidate=new URL(url);
  if(/(?:ionwave|bidnet|civicclerk|planetbids)/i.test(original.hostname)&&original.pathname!=='/'&&!candidate.pathname.startsWith(original.pathname.replace(/\/$/,'')))
   return {outcome:'wrong_entity',reason:'This address does not match the saved agency portal.'};
  identity={basis:'Existing official registration for this saved source check',url:registeredPublicEntryUrl(source)};
 }else{
  const resolved=await directory(geography,{fetcher,countyReferences});
  if(resolved.state!=='resolved')return {outcome:'needs_developer',reason:'The available official directory could not verify this agency website.'};
  if(host(resolved.url)!==host(url))return {outcome:'wrong_entity',reason:'This website does not match the official website for the selected location.'};
  identity={basis:'Official directory matched the saved location',url:resolved.url,evidence:resolved};
 }
 if(!await researchDestination(url,resolveHost))return {outcome:'needs_developer',reason:'This address is not a verified public network destination.'};
 const guardedFetch=async(destination,options)=>{
  if(!await researchDestination(String(destination),resolveHost))throw Error('Private website destination rejected');
  return fetcher(destination,options);
 };
 const capture=await fetchPublicCheck({runner_id:'public-fetch',allowed_hosts:[new URL(url).hostname],max_bytes:2_000_000},url,guardedFetch,{resolveHost,researchEntry:url});
 if(capture.state!=='captured')return {outcome:'needs_developer',reason:'The website did not provide a usable public page. Access or website support needs review.'};
 if(!capture.body?.length||!/^text\/(?:html|plain)|^application\/xhtml\+xml/i.test(capture.content_type))
  return {outcome:'needs_developer',reason:'This address did not provide a supported website page.'};
 const html=capture.body.toString('utf8');
 if(!publicReview(capture.body,capture.content_type,capture.final_url).trim()||
   /<title[^>]*>\s*(?:just a moment|attention required|access denied|forbidden|sign in|log in)|cf-chl-|challenge-running|verify (?:that )?you are human/i.test(html))
  return {outcome:'needs_developer',reason:'The website returned an empty page, sign-in page or human verification challenge.'};
 return {outcome:'entry_verified',identity,capture:{...capture,body:capture.body.toString('base64')},checked_at:new Date().toISOString()};
}
const snapshot=source=>({url:source.url,config:Object.fromEntries(Object.entries(source.config??{}).filter(([k])=>k!=='research_persistence')),identity_key:source.identity_key??null});
export function repairStatus(job){
 if(!job)return null;
 const c=job.checkpoint??{},entry=c.guided_entry===true;
 const changed=c.review_result?.decision_changed||c.review_result?.decision&&c.review_result.decision!=='fixed_verified';
 const readyWebsite=entry&&c.stage==='discovery_source_entry_ready'&&job.state==='blocked'&&!!c.verified_artifact;
 const readyMethod=c.guided_method===true&&c.stage==='discovery_save'&&job.state==='blocked'&&!!c.review_artifact&&!c.error_code;
 const uncertain=!!c.persistence_intent&&(!c.persistence?.receipt?.verified||job.state==='outcome_unknown');
 return {job_id:job.id,state:job.state,kind:entry?'website':'listing',checked_at:c.verified_at??c.method_verified_at??null,
  can_apply_website:readyWebsite,can_apply_method:readyMethod,needs_reconciliation:uncertain,
  fixed:!changed&&c.review_result?.decision==='fixed_verified'&&(c.stage==='discovery_repair_saved'||c.stage==='discovery_source_entry_saved'&&c.outcome==='fixed_verified'),
  title:changed?'Saved setup needs another review':uncertain?'Check the previous save before continuing':readyWebsite?'Official website entry verified':readyMethod?'Bid listing method verified':
   c.stage==='discovery_repair_saved'?'Verified repair saved':c.stage==='discovery_source_entry_saved'?'Website saved':
   ['pending','running'].includes(job.state)?'Checking this source':c.outcome==='wrong_entity'?'Website does not match this location':'Developer help is needed',
  explanation:changed?'The saved setup is retained. A newer check or admin decision needs review; no newer outcome was overwritten.':uncertain?'A save may already have completed. Reconcile its saved result before another attempt.':readyWebsite?
   'The website is verified. Saving it does not yet prove that its bid listings can be checked.':readyMethod?
   'The listing passed its supported checks. Apply the verified method after reviewing the shared impact.':
   c.stage==='discovery_repair_saved'?'The verified method was saved and read back. Earlier run results remain unchanged.':c.stage==='discovery_source_entry_saved'?'The website is saved. Its category listing check is separate.':
   ['pending','running'].includes(job.state)?'One bounded verification is running; other sources can continue.':
   c.outcome==='wrong_entity'?'Correct the website address; this address has not been saved.':
   'The available checks could not safely complete this repair. Record Needs developer to keep a clear handoff.',
  diagnostic_reference:c.diagnostic_id??job.id};
}

export function guidedSourceResolution({db,project,artifacts,transport,rehearse,fetcher=fetch,resolveHost,directory=resolveOfficialDirectory}){
 const reviews=sourceReviewService(db);
 async function requireAdmin(actor){if(!(await profileCapabilities(db,actor)).manage_sources)throw new HttpError(403,'An Admin is required to continue this repair.');}
 async function context(job){
  const task=await reviews.taskFor(job.search_request_id,job.checkpoint.task_id);
  const geography=await one(db,'procurement_geographies',task.route_geography_id);
  const source=task.source_id?await one(db,'procurement_sources',task.source_id):null;
  return {task,geography,source};
 }
 async function guardMethod(job,c){
  if(!c.guided_method)return;
  await requireAdmin(c.guided_actor);
  const source=await one(db,'procurement_sources',c.seed_source_id);
  if(!source||!same(snapshot(source),c.source_snapshot))throw new HttpError(409,'The website setup changed. Review it before applying this repair.');
 }
 async function prepareMethodCapture(job,c,save){
  if(c.entry_capture_reused||c.visited?.length||!c.entry_job_id)return;
  const entry=await one(db,'procurement_jobs',c.entry_job_id);
  if(entry?.checkpoint?.guided_entry!==true||entry.search_request_id!==job.search_request_id||entry.checkpoint.task_id!==c.task_id)
   throw Error('Method verification must bind its saved website entry');
  const verified=JSON.parse(await artifacts.get(entry.checkpoint.verified_artifact));
  const age=Date.now()-Date.parse(verified.checked_at);
  if(!Number.isFinite(age)||age< -60000||age>30*60*1000)return; // Recheck expired evidence through the normal bounded fetch.
  const capture=verified.capture,body=Buffer.from(capture.body,'base64'),url=c.queue?.[0];
  if(verified.outcome!=='entry_verified'||entry.checkpoint.candidate_url!==url||sha(body)!==capture.content_sha256)
   throw Error('Saved website verification changed');
  const prior=await rows(db,'procurement_runs',q=>q.eq('job_id',job.id).eq('page_index',0));
  if(prior.length>1)throw Error('Entry capture needs reconciliation');
  let run=prior[0];
  if(run&&(run.source_id!==c.seed_source_id||run.detail?.requested_url!==url||run.detail?.reused_entry_artifact!==entry.checkpoint.verified_artifact))
   throw Error('Existing method evidence differs from the verified entry');
  if(!run)run=checked(await db.from('procurement_runs').insert({source_id:c.seed_source_id,job_id:job.id,coverage_task_id:c.task_id,page_index:0,page_attempt:1,
   started_at:new Date().toISOString(),status:'partial',record_count:0,detail:{collector:'official-link-discovery',scope:'research_only',state:'request_pending',
    requested_url:url,reused_entry_artifact:entry.checkpoint.verified_artifact}}).select('*').single());
  let saved=checked(await db.from('procurement_public_captures').select('*').eq('run_id',run.id).maybeSingle());
  if(!saved){
   checked(await db.from('procurement_public_captures').upsert({run_id:run.id,source_id:c.seed_source_id,requested_url:url,final_url:capture.final_url,
    content_type:capture.content_type,content_sha256:capture.content_sha256,content_base64:capture.body,retrieved_at:verified.checked_at},{onConflict:'run_id',ignoreDuplicates:true}));
   saved=checked(await db.from('procurement_public_captures').select('*').eq('run_id',run.id).single());
  }
  if(saved.content_sha256!==capture.content_sha256||sha(Buffer.from(saved.content_base64,'base64'))!==capture.content_sha256)
   throw Error('Copied entry capture readback differs');
  checked(await db.from('procurement_runs').update({status:'review_required',finished_at:new Date().toISOString(),detail:{...run.detail,state:'content_saved',
   final_url:capture.final_url,content_sha256:capture.content_sha256,redirects:capture.redirects??[],upstream_status:200}}).eq('id',run.id));
  c.entry_capture_reused=true;await save('running');
 }
 async function step(job,c,save){
  await requireAdmin(c.guided_actor);
  if(c.stage==='discovery_source_entry_verify'){
   const ctx=await context(job),parents=ctx.geography.kind==='municipality'?await rows(db,'procurement_place_counties',q=>q.eq('place_id',ctx.geography.id),'county_id',{order:'county_id'}):[];
   const countyReferences=parents.length?await rows(db,'procurement_geographies',q=>q.in('id',parents.map(p=>p.county_id))):[];
   // Persist the attempt before I/O. An interrupted fetch is not silently resent.
   if(c.verification_started){c.outcome='needs_developer';c.public_reason='The previous website check was interrupted. Review its saved state before starting another check.';await save('blocked');return;}
   const existing=ctx.source??checked(await db.from('procurement_sources').select('*').eq('code',`official-${ctx.geography.id.toLowerCase()}`).maybeSingle());
   c.existing_source_id=existing?.id??null;c.registry_before_snapshot=existing?snapshot(existing):null;
   c.verification_started=true;await save('running');
   const verified=await verifyWebsiteCandidate({...ctx,url:c.candidate_url,countyReferences,fetcher,resolveHost,directory});
   c.outcome=verified.outcome;c.public_reason=verified.reason??'The official website entry is verified. Bid listing verification is a separate step.';
   if(verified.outcome!=='entry_verified'){await save('blocked');return;}
   c.verified_artifact=await artifacts.put(verified);c.verified_at=verified.checked_at;
   c.stage='discovery_source_entry_ready';await save('blocked');return;
  }
  if(c.stage==='discovery_source_entry_apply'){
   const {geography,source}=await context(job);
   const revision=checked(await db.rpc('procurement_source_review_revisions',{p_tasks:[c.review_task_id]}))[c.review_task_id];
   if(revision!==c.scope_revision&&!c.persistence_intent)throw new HttpError(409,'The source changed while this review was open. Reload before applying.');
   if(c.persistence_intent){
    const saved=JSON.parse(await artifacts.get(c.persistence_intent)),after={...saved.before};
    for(const table of ['procurement_sources','procurement_source_capabilities','procurement_request_sources'])after[table]=await rows(db,table,table==='procurement_request_sources'?q=>q.eq('search_request_id',job.search_request_id):q=>q);
    const receipt=verifyPersistence(saved.before,after,saved.manifest);
    if(!receipt.verified)throw Error('Website persistence requires reconciliation before another send');
    c.persistence={artifact:c.persistence_intent,receipt};
    c.saved_source_id=Object.values(saved.manifest.mappings.sources).flat()[0].id;
   }else{
    const verified=JSON.parse(await artifacts.get(c.verified_artifact)),body=Buffer.from(verified.capture.body,'base64');
    const evidenceAge=Date.now()-Date.parse(verified.checked_at);
    if(verified.outcome!=='entry_verified'||sha(body)!==verified.capture.content_sha256||!Number.isFinite(evidenceAge)||evidenceAge< -60000||evidenceAge>30*60*1000)
     throw Error('Current verified website evidence required');
    const sources=await rows(db,'procurement_sources'),request=await one(db,'procurement_search_requests',job.search_request_id);
    const existing=source??sources.find(s=>s.code===`official-${geography.id.toLowerCase()}`);
    if((existing?.id??null)!==c.existing_source_id||existing&&!same(snapshot(existing),c.registry_before_snapshot))
     throw new HttpError(409,'The source registration changed; verify it again before applying.');
    const sourceSpec={code:existing?.code??`official-${geography.id.toLowerCase()}`,local_key:'website',existing_id:existing?.id,
     name:existing?.name??geography.name,agency:existing?.name??geography.name,provider:new URL(c.candidate_url).hostname,
     url:c.candidate_url,geo_level:geography.kind==='municipality'?'city':geography.kind,
     identity_evidence:`Official website verification ${c.verified_artifact}; ${verified.identity.basis}`,
     metadata:{entry_verified_at:verified.checked_at,verification_artifact:c.verified_artifact},request_keys:['request']};
    const before={project_ref:project,procurement_sources:sources,procurement_search_requests:[request],
     procurement_geographies:await rows(db,'procurement_geographies'),procurement_source_capabilities:await rows(db,'procurement_source_capabilities'),
     procurement_request_sources:await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',job.search_request_id)),procurement_intake_items:[]};
    const manifest=planRegistry({version:1,project_ref:project,authorization:`Admin source repair ${job.id}`,requests:[{...request,key:'request'}],sources:[sourceSpec]},before,
     {verifiedUrlChange:existing?{source_id:existing.id,previous_url:existing.url,next_url:c.candidate_url,capture_sha256:verified.capture.content_sha256}:undefined});
    // Source repair must not expand an existing agency's registered coverage.
    const sourceDelta=manifest.rows.find(r=>r.table==='procurement_sources');
    if(sourceDelta)sourceDelta.row.source_coverage_areas=existing?existing.source_coverage_areas:[{area_type:geography.kind==='county'?'county':'city',state_code:'AR',
     [geography.kind==='county'?'county_name':'city_name']:geography.name}];
    c.persistence=await persistRegistry({db,artifacts,transport,rehearse,requestId:job.search_request_id,before,manifest,sourceSpec,
     beforeSend:async artifact=>{await requireAdmin(c.guided_actor);c.persistence_intent=artifact;await save('running');}});
    c.saved_source_id=manifest.mappings.sources.website[0].id;
   }
   c.stage='discovery_source_entry_finalize';await save('pending');return;
  }
  if(c.stage==='discovery_source_entry_finalize'){
   const {task}=await context(job);
   if(task.kind==='source_entry'){
   c.review_result=checked(await db.rpc('finish_procurement_guided_repair',{p_actor:c.guided_actor,p_job:job.id}));
    c.stage='discovery_source_entry_saved';c.outcome=c.review_result.decision_changed?'decision_changed':'fixed_verified';await save('succeeded');return;
   }
   c.method_job_id=checked(await db.rpc('queue_procurement_guided_method',{p_actor:c.guided_actor,p_entry:job.id,p_source:c.saved_source_id}));
   c.stage='discovery_source_entry_saved';c.outcome='entry_saved';await save('succeeded');return;
  }
  throw Error('Website repair needs explicit review before continuing');
 }
 async function finalizeMethod(job,c,save){
  await guardMethod(job,c);
  c.review_result=checked(await db.rpc('finish_procurement_guided_repair',{p_actor:c.guided_actor,p_job:job.id}));
  c.stage='discovery_repair_saved';await save('succeeded');
 }
 async function scopedJob(requestId,taskId,jobId){
  const job=checked(await db.rpc('procurement_scoped_source_repair',{p_request:requestId,p_task:taskId,p_job:jobId}));
  if(!job)
   throw new HttpError(404,'This verification is not part of the selected source review.');
  return job;
 }
 async function detail(requestId,taskId){
  const listing=await reviews.list(requestId,{includeReviewDetails:true}),item=listing.items.find(t=>t.task_id===taskId);
  if(!item)throw new HttpError(404,'Source check is not part of this run.');
  const task=listing.internal.tasks[taskId],review=listing.internal.reviews[taskId];
  const job=review?.verification_reference?await scopedJob(requestId,taskId,review.verification_reference):null;
  const sourceId=task.source_id??job?.checkpoint?.existing_source_id??job?.checkpoint?.seed_source_id;
  const [geographies,links,sources,capabilities,associations,schedules]=await Promise.all([
   rows(db,'procurement_geographies'),rows(db,'procurement_place_counties',q=>q,'place_id,county_id',{order:'place_id'}),
   rows(db,'procurement_sources'),rows(db,'procurement_source_capabilities'),rows(db,'procurement_state_trigger_associations',q=>q,'id,source_id,category,county_ids'),
   rows(db,'procurement_schedules',q=>q.is('deleted_at',null),'id,name,version,config,archived_at'),
  ]);
  const now=new Date(),inventory=sourceInventory(sources,capabilities,geographies,now),data={geographies,links,sources,capabilities,associations,inventory};
  const affected=schedules.filter(s=>!s.archived_at).filter(schedule=>{
   if(sourceId)return catalogProjection({...data,schedule},{source:sourceId,limit:1},now,'sources').sources.items.length>0;
   if(schedule.config.target_kind==='sam'||!schedule.config.requested_categories?.includes(task.kind))return false;
   return schedule.config.county_ids?.includes(task.route_geography_id)||schedule.config.counties?.some(c=>c.cities?.some(g=>g.id===task.route_geography_id));
  }).map(s=>({id:s.id,name:s.name,version:s.version}));
  const source=sources.find(s=>s.id===sourceId),verification=repairStatus(job);
  const currentTarget=item.current?.target_id&&item.current.task_id!==task.id?await one(db,'procurement_request_targets',item.current.target_id):null;
  let history={data:[]};
  if(review)history=await db.from('procurement_events').select('id,created_at,detail').contains('detail',{action_id:review.id}).order('created_at',{ascending:false}).order('id').range(0,20);
  const events=checked(history),preview_token=hash({scope:item.scope,version:item.version,revision:item.revision,
   source:source?snapshot(source):null,affected,job:job?{id:job.id,state:job.state,stage:job.checkpoint.stage}:null});
  let can_reenable=review?.review_decision==='fixed_verified';
  if(source&&task.capability_id)try{can_reenable=can_reenable||!!adapterContract(capabilities.find(c=>c.id===task.capability_id),source);}catch{/* Missing/expired methods still require verification. */}
  return {item,decision_task_id:item.current?.task_id??task.id,decision_request_id:currentTarget?.search_request_id??requestId,
   reason:review?.review_reason??'',website:source?.url??'',verification,can_reenable,
   impact:{scope:`${item.location} · ${item.category==='source_entry'?'Website entry':item.category}`,schedules:affected,
    explanation:'This decision affects the selected source check. Website or method changes may also affect the schedules listed here. In-flight work may finish; old run results and other sources remain unchanged.'},
   preview_token,history:events.slice(0,20).map(e=>({id:e.id,at:e.created_at,decision:e.detail.result?.decision??'recorded',reason:e.detail.reason??''})),more_history:events.length>20};
 }
 function confirmed(input,view){if(input?.confirmed_scope!==true||input.preview_token!==view.preview_token)throw new HttpError(409,'Review the current scope and confirm its impact before saving. Your note is kept.');}
 async function decide(requestId,taskId,input,actor,key){
  const view=await detail(requestId,taskId);
  if(['no_website','wont_address'].includes(input?.decision)||input?.reenable)confirmed(input,view);
  if(input?.reenable&&!view.can_reenable)throw new HttpError(409,'Verify a usable website and check method before re-enabling this check.');
  const {confirmed_scope:ignoredConfirmation,preview_token:ignoredPreview,...decision}=input??{};
  void ignoredConfirmation;void ignoredPreview;
  return reviews.decide(view.decision_request_id,view.decision_task_id,decision,actor,key);
 }
 async function apply(requestId,taskId,input,actor,key){
  await requireAdmin(actor);
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(key))throw new HttpError(400,'A stable repair confirmation is required.');
  const job=await scopedJob(requestId,taskId,input.job_id),status=repairStatus(job),fingerprint=hash({job:input.job_id,preview:input.preview_token,reconcile:input.reconcile===true});
  if(job.checkpoint.apply_key===key&&job.checkpoint.applying_admin===actor){
   if(job.checkpoint.apply_fingerprint!==fingerprint)throw new HttpError(409,'This confirmation was already used for a different repair.');
   return {job_id:job.id,state:job.state};
  }
  const view=await detail(requestId,taskId);confirmed(input,view);
  const proofTime=job.checkpoint.guided_entry?job.checkpoint.verified_at:job.checkpoint.method_verified_at;
  if(!status.needs_reconciliation&&(!Number.isFinite(Date.parse(proofTime??''))||view.item.current?.observed_at&&Date.parse(view.item.current.observed_at)>Date.parse(proofTime)))
   throw new HttpError(409,'A newer source check needs review. Verify the website again before applying older evidence.');
  if(status.needs_reconciliation&&!input.reconcile)throw new HttpError(409,'Reconcile the previous save before applying again.');
  if(!status.can_apply_website&&!status.can_apply_method&&!status.needs_reconciliation)throw new HttpError(409,'This repair is not ready to apply. Reload its current status.');
  const stage=job.checkpoint.guided_entry?'discovery_source_entry_apply':'discovery_save';
  const saved=checked(await db.from('procurement_jobs').update({state:'pending',checkpoint:{...job.checkpoint,stage,admin_apply_confirmed:true,guided_actor:actor,actor_id:actor,
   applying_admin:actor,apply_key:key,apply_fingerprint:fingerprint,scope_confirmation:view.preview_token}}).eq('id',job.id).eq('updated_at',job.updated_at).eq('state',job.state).select('id'));
  if(saved.length!==1)throw new HttpError(409,'Another admin changed this verification. Reload it; your note is kept.');
  return {job_id:job.id,state:'pending'};
 }
 return {step,guardMethod,prepareMethodCapture,finalizeMethod,requireAdmin,reviews,detail,decide,apply,
  async status(requestId,taskId,jobId){return repairStatus(await scopedJob(requestId,taskId,jobId));},
  async verify(request,task,input,actor,key){
   const view=await detail(request,task);
   if(input.version!==view.item.version||input.revision!==view.item.revision)throw new HttpError(409,'Source review changed. Reload it; your website is kept.');
   return checked(await db.rpc('queue_procurement_source_repair',{p_actor:actor,p_task:view.decision_task_id,p_version:input.version,p_revision:input.revision,p_key:key,p_url:candidateWebsite(input.url)}));
  },
 };
}
