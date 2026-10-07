import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {checked,rows,one,sha} from './hosted-store.mjs';
import {publicUrl,verifyPersistence} from './research-persistence.mjs';
import {safePublicUrl,adapterContract,separateSamSource} from './known-source-execution.mjs';
import {validateHandoff,discoveryView} from './public-source-discovery.mjs';
import {fetchPublicCheck} from './public-source-check.mjs';
const relevant=/procure|bid|solicitat|contract|forecast|award|purchas|janitorial|custodial|cleaning|developer|\bapi\b|vendor|register/i;
const key=(request,task)=>`api-workflow:discovery:${request}:${task}`;
export function officialLinks(bytes,url) {
  const dom=new JSDOM(bytes.toString('utf8'),{url});
  try{return [...new Map([...dom.window.document.querySelectorAll('a[href]')].flatMap(a=>{
    try{const link=publicUrl(a.href);return relevant.test(`${a.textContent} ${link}`)&&safePublicUrl(link,[new URL(link).hostname])?
      [[link,{url:link,label:a.textContent.replace(/\s+/g,' ').trim().slice(0,160)}]]:[];}catch{return [];}
  })).values()].slice(0,100);}finally{dom.window.close();}
}
export function publicReview(bytes,type) {
  if(/pdf/i.test(type))return 'PDF saved; use existing document extraction before method activation';
  if(!/html/i.test(type))return bytes.toString('utf8').slice(0,12000);
  const dom=new JSDOM(bytes.toString('utf8'));
  try{for(const node of dom.window.document.querySelectorAll('script,style,noscript,form,input'))node.remove();
    return (dom.window.document.body?.textContent??'').replace(/\s+/g,' ').trim().slice(0,12000);
  }finally{dom.window.close();}
}
export function validateDiscoveryReview(packet,input,task) {
  const {sourceSpec,capability,category_evidence:evidence}=input;
  if(!sourceSpec||!capability||capability.method_spec?.runner_id!=='public-fetch'||capability.kind!==task.kind||
    capability.route_geography_id!==task.route_geography_id)throw new Error('Reviewed public method must match saved gap');
  if(!evidence?.length||!input.check_instructions?.trim()||!input.terminal_instruction?.trim())throw new Error('Category quotations and check/terminal instructions required');
  for(const e of evidence)if(!e.excerpt?.trim()||!packet.pages.some(p=>p.run_id===e.run_id&&p.review.includes(e.excerpt)))
    throw new Error('Category quotation is not in saved capture');
  const spec=capability.method_spec;
  if(!Array.isArray(spec.urls)||spec.urls.some(url=>!packet.pages.some(p=>p.url===url))||
    !packet.pages.some(p=>p.url===sourceSpec.url)||!packet.pages.some(p=>p.url===capability.official_entry_url))
    throw new Error('Every destination and official identity require successful saved captures');
  const now=new Date().toISOString(),saved={...capability,availability:'active',verified_at:now,
    verified_until:new Date(Date.now()+30*86400000).toISOString(),
    verification_evidence:{run_ids:[...new Set([...evidence.map(e=>e.run_id),...packet.pages.filter(p=>spec.urls.includes(p.url)).map(p=>p.run_id)])],
      category_evidence:evidence,discovery_packet_hash:packet.packet_hash,scope:'reviewed_category_method'},
    method_spec:{...spec,check_instructions:input.check_instructions,terminal_instruction:input.terminal_instruction}};
  adapterContract({...saved,source_id:packet.seed_source_id},sourceSpec);
  if(!Array.isArray(input.handoffs)||!['portal','api'].every(channel=>input.handoffs.some(h=>h.channel===channel)))
    throw new Error('Portal and API documentation assessments required');
  if(input.handoffs.some(h=>h.evidence_urls.some(url=>!packet.pages.some(p=>p.url===url)&&!packet.links.some(l=>l.url===url))))
    throw new Error('Access handoff requires saved official evidence');
  return {sourceSpec,capability:saved,handoffs:input.handoffs};
}
// One page per durable worker stage. No paid search, browser, signup or lead coverage.
export function publicDiscovery({db,artifacts,persist,reconcileHandoffs,collect,fetcher=fetch}) {
  async function scope(requestId,taskId) {
    const request=await one(db,'procurement_search_requests',requestId),task=await one(db,'procurement_coverage_tasks',taskId);
    const target=task&&await one(db,'procurement_request_targets',task.target_id);
    if(!request||target?.search_request_id!==requestId||!['forecast','opportunity','award'].includes(task.kind))
      throw new Error('Persisted confirmed category gap required');
    return {request,task};
  }
  async function submit(requestId,input,actor) {
    if(!input?.task_id) {
      const request=await one(db,'procurement_search_requests',requestId),targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId));
      if(!request||!targets.length)throw new Error('Confirmed request required');
      return {state:'needs_selection',gaps:discoveryView(request,targets,await rows(db,'procurement_geographies'),
        await rows(db,'procurement_source_capabilities'),await rows(db,'procurement_sources')),next_action:'Select one saved category gap task_id'};
    }
    const {request,task}=await scope(requestId,input?.task_id);
    const old=checked(await db.from('procurement_jobs').select('*').eq('dedupe_key',key(requestId,task.id)).maybeSingle());
    if(old)return {job_id:old.id,state:old.state,next_action:old.checkpoint.next_action};
    if(request.workflow_control?.cancelled||!['source_missing','method_missing','blocked'].includes(task.state))throw new Error('Only active saved gaps require research');
    let source=task.source_id&&await one(db,'procurement_sources',task.source_id);
    if(!source&&input.seed_source_id) {
      if(!(await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId).eq('source_id',input.seed_source_id))).length)
        throw new Error('New-source research requires an associated official seed');
      source=await one(db,'procurement_sources',input.seed_source_id);
    }
    if(source&&separateSamSource(source))throw new Error('SAM has a separate statewide trigger');
    const seed=source&&publicUrl(source.url),job=checked(await db.from('procurement_jobs').upsert({search_request_id:requestId,
      dedupe_key:key(requestId,task.id),kind:'discover',state:seed?'pending':'blocked',checkpoint:{stage:'discovery_capture',actor_id:actor,
        task_id:task.id,seed_source_id:source?.id??null,queue:seed?[seed]:[],visited:[],run_ids:[],links:[],
        next_action:seed?'Inspect saved official entry and relevant same-host links':'Associate a verified official agency entry; no trusted seed exists'}},
      {onConflict:'dedupe_key',ignoreDuplicates:true}).select('*').single());
    return {job_id:job.id,state:job.state,next_action:job.checkpoint.next_action,lead_coverage:false,paid_search:false};
  }
  async function packet(requestId,taskId) {
    await scope(requestId,taskId);
    const job=checked(await db.from('procurement_jobs').select('*').eq('dedupe_key',key(requestId,taskId)).single());
    if(!job.checkpoint.packet_artifact)return {job_id:job.id,state:job.state,next_action:job.checkpoint.next_action};
    const bytes=await artifacts.get(job.checkpoint.packet_artifact);
    return {...JSON.parse(bytes),job_id:job.id,state:job.state,packet_hash:sha(bytes)};
  }
  async function finish(job,c,save) {
    const p={version:1,request_id:job.search_request_id,task_id:c.task_id,seed_source_id:c.seed_source_id,run_ids:c.run_ids,
      links:c.links,visited:c.visited,pages:[],lead_coverage:false,ai_calls:0,search_calls:0,resources:c.resources??{},blocker:c.blocker??null};
    for(const id of c.run_ids) {
      const capture=checked(await db.from('procurement_public_captures').select('*').eq('run_id',id).single());
      const bytes=Buffer.from(capture.content_base64,'base64');if(sha(bytes)!==capture.content_sha256)throw new Error('Capture hash changed');
      p.pages.push({run_id:id,url:capture.final_url,content_sha256:capture.content_sha256,content_type:capture.content_type,review:publicReview(bytes,capture.content_type)});
    }
    c.packet_artifact=await artifacts.put(p);c.stage='discovery_review';
    c.next_action='Review captured category evidence and portal/API links, then submit an evidence-bound method; keep unsupported categories as gaps. Paid search is disabled under the strict cap';
    await save('blocked');
  }
  async function step(job,c,save) {
    if(c.stage==='discovery_collect') {
      c.collection=await collect({requestId:job.search_request_id,sourceCode:c.source_code});
      c.stage='discovery_collected';c.next_action='Review captured category packet and persist candidates through the existing interpretation/import workflow';await save('succeeded');return;
    }
    if(c.stage==='discovery_save') {
      const review=JSON.parse(await artifacts.get(c.review_artifact));
      if(c.persistence_intent) {
        const saved=JSON.parse(await artifacts.get(c.persistence_intent)),after={...saved.before};
        for(const t of ['procurement_sources','procurement_source_capabilities','procurement_request_sources'])after[t]=await rows(db,t,t==='procurement_request_sources'?q=>q.eq('search_request_id',job.search_request_id):q=>q);
        const receipt=verifyPersistence(saved.before,after,saved.manifest);
        if(!receipt.verified)throw new Error('Method transaction outcome needs reconciliation before retry');
        if(!reconcileHandoffs)throw new Error('Private handoff reconciliation required before collection');
        await reconcileHandoffs({manifest:saved.manifest,...review});
        c.persistence={artifact:c.persistence_intent,receipt};
      }else c.persistence=await persist({requestId:job.search_request_id,taskId:c.task_id,...review,actor:c.actor_id,
        beforeSend:async artifact=>{c.persistence_intent=artifact;await save('running');}});
      await collect({requestId:job.search_request_id,sourceCode:c.source_code,planOnly:true});c.stage='discovery_collect';await save('pending');return;
    }
    if(c.stage!=='discovery_capture')throw new Error('Discovery needs saved review, not repeat research');
    if(!c.queue.length||c.visited.length>=10){await finish(job,c,save);return;}
    const source=await one(db,'procurement_sources',c.seed_source_id),url=c.queue[0],host=new URL(source.url).hostname,start=Date.now();
    if(!safePublicUrl(url,[host]))throw new Error('Discovery destination outside saved official host');
    const prior=await rows(db,'procurement_runs',q=>q.eq('job_id',job.id).eq('page_index',c.visited.length));let run=prior[0];
    if(run&&run.detail?.state!=='content_saved')throw new Error('Prior fetch outcome requires reconciliation; no repeat fetch');
    if(!run) {
      run=checked(await db.from('procurement_runs').insert({source_id:source.id,job_id:job.id,coverage_task_id:c.task_id,page_index:c.visited.length,
        page_attempt:1,started_at:new Date().toISOString(),status:'partial',record_count:0,
        detail:{collector:'official-link-discovery',scope:'research_only',state:'request_pending',requested_url:url}}).select('*').single());
      const capture=await fetchPublicCheck({runner_id:'public-fetch',allowed_hosts:[host],max_bytes:2000000},url,fetcher);
      if(capture.state!=='captured') {
        checked(await db.from('procurement_runs').update({status:'blocked',finished_at:new Date().toISOString(),detail:{collector:'official-link-discovery',
          scope:'research_only',state:capture.state,reason:capture.reason,requested_url:url}}).eq('id',run.id));
        c.blocker=capture.reason;await finish(job,c,save);return;
      }
      await artifacts.put(capture.body);
      checked(await db.from('procurement_public_captures').insert({run_id:run.id,source_id:source.id,requested_url:url,final_url:capture.final_url,
        content_type:capture.content_type,content_sha256:capture.content_sha256,content_base64:capture.body.toString('base64')}));
      checked(await db.from('procurement_runs').update({status:'review_required',finished_at:new Date().toISOString(),detail:{collector:'official-link-discovery',scope:'research_only',
        state:'content_saved',requested_url:url,final_url:capture.final_url,content_sha256:capture.content_sha256,upstream_status:200}}).eq('id',run.id));
    }
    const capture=checked(await db.from('procurement_public_captures').select('*').eq('run_id',run.id).single());
    const links=/html/i.test(capture.content_type)?officialLinks(Buffer.from(capture.content_base64,'base64'),capture.final_url):[];
    c.visited.push(url);c.queue.shift();c.run_ids.push(run.id);
    c.links=[...new Map([...c.links,...links.map(l=>({...l,from_run_id:run.id}))].map(l=>[l.url,l])).values()].slice(0,100);
    for(const l of links)if(new URL(l.url).hostname===host&&!/signup|register|login|sign.?in|logout|payment|subscribe|submit|delete|create.account/i.test(l.url)&&
      !c.visited.includes(l.url)&&!c.queue.includes(l.url)&&c.queue.length+c.visited.length<10)c.queue.push(l.url);
    let mem=null;try{mem=Number(await readFile('/sys/fs/cgroup/memory.current','utf8'));}catch{/* local lacks cgroups */}
    c.resources={elapsed_ms:(c.resources?.elapsed_ms??0)+Date.now()-start,sampled_peak_container_bytes:Math.max(c.resources?.sampled_peak_container_bytes??0,mem??0)||null,process_rss_bytes:process.memoryUsage().rss};
    if(!c.queue.length||c.visited.length>=10)await finish(job,c,save);else await save('pending');
  }
  async function review(requestId,input,actor) {
    const p=await packet(requestId,input?.task_id),{task}=await scope(requestId,input.task_id),job=await one(db,'procurement_jobs',p.job_id);
    if(job.checkpoint.stage!=='discovery_review')return {job_id:job.id,state:job.state,next_action:job.checkpoint.next_action};
    if(input.packet_hash!==p.packet_hash||!p.pages?.length)throw new Error('Exact saved discovery packet required');
    const verified=validateDiscoveryReview(p,input,task);
    const sources=await rows(db,'procurement_sources'),regs=await rows(db,'procurement_registrations'),handoffs=await rows(db,'procurement_access_handoffs');
    const proposed=sources.find(s=>s.code===verified.sourceSpec.code);
    for(const h of verified.handoffs)validateHandoff({...h,source_id:proposed?.id??p.seed_source_id},sources,regs,handoffs);
    const artifact=await artifacts.put(verified),checkpoint={...job.checkpoint,review_artifact:artifact,stage:'discovery_save',actor_id:actor,
      source_code:verified.sourceSpec.code,next_action:'Rehearse and persist reviewed method, then collect through existing runner'};
    const saved=checked(await db.from('procurement_jobs').update({checkpoint,state:'pending'}).eq('id',job.id).eq('state','blocked').select('id'));
    if(saved.length!==1)throw new Error('Concurrent discovery review; reconcile saved state');
    return {job_id:job.id,state:'pending',lead_coverage:false,next_action:checkpoint.next_action};
  }
  async function resume(requestId,input,actor) {
    const {request}=await scope(requestId,input?.task_id);
    if(request.workflow_control?.cancelled)throw new Error('Request is cancelled');
    const job=checked(await db.from('procurement_jobs').select('*').eq('dedupe_key',key(requestId,input.task_id)).single());
    if(job.checkpoint.stage==='discovery_review')return packet(requestId,input.task_id);
    if(job.state!=='blocked')return {job_id:job.id,state:job.state};
    const saved=checked(await db.from('procurement_jobs').update({state:'pending',checkpoint:{...job.checkpoint,resumed_by:actor}})
      .eq('id',job.id).eq('state','blocked').select('id'));
    if(saved.length!==1)throw new Error('Concurrent discovery continuation');
    return {job_id:job.id,state:'pending',lead_coverage:false};
  }
  async function measuredStep(job,c,save) {
    const started=Date.now();let peak=c.resources?.sampled_peak_container_bytes??0;
    const sample=async()=>{try{peak=Math.max(peak,Number(await readFile('/sys/fs/cgroup/memory.current','utf8')));}catch{/* local lacks cgroups */}};
    await sample();const timer=setInterval(()=>{void sample();},100);timer.unref();
    try {await step(job,c,async state=>{await sample();c.resources={...c.resources,sampled_peak_container_bytes:peak||null,
      last_stage_elapsed_ms:Date.now()-started,process_rss_bytes:process.memoryUsage().rss};await save(state);});}
    finally{clearInterval(timer);}
  }
  return Object.assign(submit,{step:measuredStep,packet,review,resume});
}
