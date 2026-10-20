import {auditPhase} from './workflow-audit.mjs';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {checked,rows,one,sha} from './hosted-store.mjs';
import {publicUrl,verifyPersistence} from './research-persistence.mjs';
import {safePublicUrl,adapterContract,separateSamSource,registeredPublicEntryUrl} from './known-source-execution.mjs';
import {inspectPublicHtmlTable} from './public-html-table.mjs';
import {validateHandoff,discoveryView} from './public-source-discovery.mjs';
import {fetchPublicCheck} from './public-source-check.mjs';
import {automaticCountyPolicy,proposeAutomaticListing} from './automatic-public-method.mjs';
import {requestPublicCapture} from './public-capture-reuse.mjs';
const relevant=/procure|bid|solicitat|contract|forecast|award|purchas|janitorial|custodial|cleaning|developer|\bapi\b|vendor|register/i;
const key=(request,task)=>`api-workflow:discovery:${request}:${task}`;
const freshCapture=capture=>Number.isFinite(Date.parse(capture.retrieved_at))&&Date.now()-Date.parse(capture.retrieved_at)<=30*86400000;
export function officialLinks(bytes,url,{automatic=false}={}) {
  const dom=new JSDOM(bytes.toString('utf8'),{url,virtualConsole:new VirtualConsole()});
  try{
    const doc=dom.window.document,pattern=automatic?/procure|bid|solicitat|contract|forecast|award|purchas|janitorial|custodial|cleaning|proposal|\brfp\b|\brfq\b|public notices|business (?:office|department)/i:relevant;
    const anchors=[...doc.querySelectorAll('a[href]')];
    if(automatic) {
      // Apptegy publishes its navigation as flat, indexed JSON. Read only
      // explicit published link records; never evaluate JavaScript or guess URLs.
      try {
        const raw=doc.querySelector('script#__NUXT_DATA__[type="application/json"]')?.textContent;
        const values=raw&&raw.length<=2_000_000?JSON.parse(raw):null;
        const seenHtml=new Set();
        if(Array.isArray(values)&&values.length<=50000)for(const item of values) {
          // Published Apptegy page content can contain official bid links that
          // are absent from the initial DOM. Parse literal HTML, never scripts.
          if(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===1&&
              Number.isInteger(item.html)&&typeof values[item.html]==='string'&&!seenHtml.has(item.html)) {
            seenHtml.add(item.html);
            const template=doc.createElement('template');template.innerHTML=values[item.html];
            for(const a of template.content.querySelectorAll('a[href]')) {
              try {
                const anchor=doc.createElement('a');anchor.href=new URL(a.getAttribute('href'),url).href;
                anchor.textContent=a.textContent;anchors.push(anchor);
              }catch{/* Malformed published links cannot suppress the remaining links. */}
            }
          }
          if(!item||Array.isArray(item)||typeof item!=='object'||values[item.type]!=='link'||values[item.status]!=='published'||
              values[item.hidden]!==false||!Number.isInteger(item.name)||!Number.isInteger(item.url))continue;
          const name=values[item.name],target=values[item.url];
          if(typeof name!=='string'||typeof target!=='string'||!pattern.test(name))continue;
          const anchor=doc.createElement('a');anchor.href=target;anchor.textContent=name;anchors.push(anchor);
        }
      }catch{/* Unrecognized menu data does not establish any source link. */}
    }
    return [...new Map(anchors.flatMap(a=>{
    try{
      const observed=new URL(a.href);
      if(automatic&&observed.protocol==='http:'&&observed.hostname===new URL(url).hostname&&!observed.port)observed.protocol='https:';
      const link=publicUrl(observed.href);return pattern.test(`${a.textContent} ${link}`)&&safePublicUrl(link,[new URL(link).hostname])?
      [[link,{url:link,label:a.textContent.replace(/\s+/g,' ').trim().slice(0,160)}]]:[];}catch{return [];}
  })).values()].slice(0,100);}finally{dom.window.close();}
}
export function publicReview(bytes,type) {
  if(/pdf/i.test(type))return 'PDF saved; use existing document extraction before method activation';
  if(!/html/i.test(type))return bytes.toString('utf8').slice(0,12000);
  const dom=new JSDOM(bytes.toString('utf8'),{virtualConsole:new VirtualConsole()});
  try{for(const node of dom.window.document.querySelectorAll('script,style,noscript,form,input'))node.remove();
    return (dom.window.document.body?.textContent??'').replace(/\s+/g,' ').trim().slice(0,12000);
  }finally{dom.window.close();}
}
export function validateDiscoveryReview(packet,input,task,registeredSource=null) {
  const {sourceSpec,capability,category_evidence:evidence}=input;
  if(!sourceSpec||!capability||capability.method_spec?.runner_id!=='public-fetch'||capability.kind!==task.kind||
    capability.route_geography_id!==task.route_geography_id)throw new Error('Reviewed public method must match saved gap');
  if(!evidence?.length||!input.check_instructions?.trim()||!input.terminal_instruction?.trim())throw new Error('Category quotations and check/terminal instructions required');
  for(const e of evidence)if(!e.excerpt?.trim()||!packet.pages.some(p=>p.run_id===e.run_id&&p.review.includes(e.excerpt)))
    throw new Error('Category quotation is not in saved capture');
  const spec=capability.method_spec;
  const reviewedIdentity=registeredSource?.id===packet.seed_source_id&&registeredSource?.url===sourceSpec.url&&
    registeredPublicEntryUrl(registeredSource)!==registeredSource.url&&
    packet.pages.some(p=>p.url===registeredPublicEntryUrl(registeredSource));
  if(!Array.isArray(spec.urls)||spec.urls.some(url=>!packet.pages.some(p=>p.url===url))||
    !reviewedIdentity&&!packet.pages.some(p=>p.url===sourceSpec.url||p.requested_url===sourceSpec.url)||
    !packet.pages.some(p=>p.url===capability.official_entry_url||p.requested_url===capability.official_entry_url))
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
export function publicDiscovery({db,artifacts,persist,reconcileHandoffs,resolveSeed,collect,continueCollection,fetcher=fetch,resolveHost}) {
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
      if(!(await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId).eq('source_id',input.seed_source_id))).length&&
          !task.evidence?.registered_source_ids?.includes(input.seed_source_id))
        throw new Error('New-source research requires an associated official seed');
      source=await one(db,'procurement_sources',input.seed_source_id);
    }
    if(source&&separateSamSource(source))throw new Error('SAM has a separate statewide trigger');
    const automatic=['county_scope','state_research'].includes(request.workflow_control?.admin_policy);
    const seed=source&&publicUrl(automatic?registeredPublicEntryUrl(source):source.url),job=checked(await db.from('procurement_jobs').upsert({search_request_id:requestId,
      dedupe_key:key(requestId,task.id),kind:'discover',state:seed||automatic?'pending':'blocked',checkpoint:{stage:!seed&&automatic?'discovery_resolve':'discovery_capture',actor_id:actor,
        task_id:task.id,seed_source_id:source?.id??null,queue:seed?[seed]:[],visited:[],run_ids:[],links:[],
        ...(automatic&&seed?{observed_hosts:[new URL(seed).hostname]}:{}),
        ...(['county_scope','state_research'].includes(request.workflow_control?.admin_policy)?{automation_policy:automaticCountyPolicy}:{}),
        next_action:seed?'Inspect saved official entry and relevant same-host links':automatic?'Finding official website':'Associate a verified official agency entry; no trusted seed exists'}},
      {onConflict:'dedupe_key',ignoreDuplicates:true}).select('*').single());
    return {job_id:job.id,state:job.state,next_action:job.checkpoint.next_action,lead_coverage:false,paid_search:false};
  }
  async function packet(requestId,taskId) {
    const {task}=await scope(requestId,taskId);
    const job=checked(await db.from('procurement_jobs').select('*').eq('dedupe_key',key(requestId,taskId)).single());
    if(!job.checkpoint.packet_artifact)return {job_id:job.id,state:job.state,next_action:job.checkpoint.next_action};
    const bytes=await artifacts.get(job.checkpoint.packet_artifact);
    const seed=job.checkpoint.seed_source_id&&await one(db,'procurement_sources',job.checkpoint.seed_source_id);
    const verified=job.checkpoint.persistence?.receipt?.verified===true;
    const registered=verified?(await rows(db,'procurement_sources',q=>q.eq('code',job.checkpoint.source_code)))[0]:null;
    const identity=registered??seed;
    const source=identity?{id:identity.id,code:identity.code,name:identity.name,url:identity.url,contracting_entity_geo_level:identity.contracting_entity_geo_level,business_category:identity.business_category}:null;
    return {...JSON.parse(bytes),job_id:job.id,state:job.state,packet_hash:sha(bytes),source,route_geography_id:task.route_geography_id,registration_verified:verified};
  }
  async function finish(job,c,save) {
    const p={version:1,request_id:job.search_request_id,task_id:c.task_id,seed_source_id:c.seed_source_id,run_ids:c.run_ids,
      links:c.links,visited:c.visited,pages:[],lead_coverage:false,ai_calls:0,search_calls:0,resources:c.resources??{},blocker:c.blocker??null};
    for(const id of c.run_ids) {
      const capture=checked(await db.from('procurement_public_captures').select('*').eq('run_id',id).single());
      const bytes=Buffer.from(capture.content_base64,'base64');if(sha(bytes)!==capture.content_sha256)throw new Error('Capture hash changed');
      p.pages.push({run_id:id,url:capture.final_url,requested_url:capture.requested_url,content_sha256:capture.content_sha256,content_type:capture.content_type,review:publicReview(bytes,capture.content_type)});
    }
    c.packet_artifact=await artifacts.put(p);c.stage=c.automation_policy===automaticCountyPolicy?'discovery_verify':'discovery_review';
    c.next_action='Review captured category evidence and portal/API links, then submit an evidence-bound method; keep unsupported categories as gaps. Paid search is disabled under the strict cap';
    await save(c.stage==='discovery_verify'?'pending':'blocked');
  }
  async function step(job,c,save) {
    if(c.automation_policy===automaticCountyPolicy&&['discovery_resolve','discovery_capture','discovery_verify'].includes(c.stage)) {
      const {task}=await scope(job.search_request_id,c.task_id);
      if(['superseded','reviewed_no_results','reviewed_with_results'].includes(task.state)) {
        c.stage='discovery_satisfied';c.next_action='Source coverage was resolved by the existing verified method';await save('succeeded');return;
      }
    }
    if(c.stage==='discovery_resolve') {
      let result;
      if(c.seed_intent) {
        const saved=JSON.parse(await artifacts.get(c.seed_intent)),after={...saved.before};
        for(const table of ['procurement_sources','procurement_source_capabilities','procurement_request_sources'])
          after[table]=await rows(db,table,table==='procurement_request_sources'?q=>q.eq('search_request_id',job.search_request_id):q=>q);
        if(!verifyPersistence(saved.before,after,saved.manifest).verified)throw Error('Official source persistence needs reconciliation');
        const mapping=Object.values(saved.manifest.mappings.sources).flat()[0];
        const source=after.procurement_sources.find(s=>s.id===mapping.id);
        result={state:'resolved',source_id:source.id,url:source.url};
      }else result=await auditPhase('research',()=>resolveSeed({requestId:job.search_request_id,taskId:c.task_id,actor:c.actor_id,
        beforeSend:async artifact=>{c.seed_intent=artifact;await save('running');}}),{task_id:c.task_id});
      c.directory_artifact=result.directory_artifact??c.directory_artifact;
      if(result.state!=='resolved'){c.next_action=result.reason;await save('blocked');return;}
      c.seed_source_id=result.source_id;c.queue=[result.url];c.stage='discovery_capture';c.next_action='Checking official source';await save('pending');return;
    }
    if(c.stage==='discovery_verify') {
      const {task}=await scope(job.search_request_id,c.task_id);
      const source=await one(db,'procurement_sources',c.seed_source_id);
      const packetBytes=await artifacts.get(c.packet_artifact),p={...JSON.parse(packetBytes),packet_hash:sha(packetBytes)};
      const failures=[];
      if(task.kind==='opportunity'&&source)for(const page of p.pages) {
        if(!/html/i.test(page.content_type))continue;
        const capture=checked(await db.from('procurement_public_captures').select('*').eq('run_id',page.run_id).single());
        if(!freshCapture(capture)){failures.push('Source evidence is stale; recapture required');continue;}
        const body=Buffer.from(capture.content_base64,'base64');
        if(sha(body)!==page.content_sha256)throw Error('Automatic verification capture changed');
        let verified;
        try {
          let verifiedListing;
          try {verifiedListing=proposeAutomaticListing(body,page.url);}
          catch(error) {
            // Reverify an existing reviewed table contract against new bytes;
            // expiry requires fresh evidence, not a new parser or guessed URLs.
            const previous=await rows(db,'procurement_source_capabilities',q=>q.eq('source_id',source.id).eq('kind',task.kind));
            const matches=previous.filter(method=>method.endpoint_url===page.url&&method.method_spec?.response_format==='html-table-v1');
            if(matches.length!==1)throw error;
            const method=matches[0],now=new Date();
            adapterContract({...method,availability:'active',verified_at:now.toISOString(),verified_until:new Date(+now+86400000).toISOString()},source,now);
            const listing=inspectPublicHtmlTable(body,method.method_spec);
            if(!listing.terminal)throw Error('Public table pagination is incomplete');
            verifiedListing={spec:method.method_spec,listing:{...listing,evidence:listing.records[0]?.title??'No records to display.'}};
          }
          const {spec,listing}=verifiedListing;
          const input={sourceSpec:{existing_id:source.id,local_key:source.code,code:source.code,name:source.name,url:source.url,
            agency:source.name,provider:new URL(source.url).hostname,geo_level:source.contracting_entity_geo_level,
            identity_evidence:`Existing registered source ${source.id}; saved official capture ${page.run_id}`},
            capability:{kind:task.kind,route_geography_id:task.route_geography_id,method:'browser',parser_version:automaticCountyPolicy,
              official_entry_url:registeredPublicEntryUrl(source),endpoint_url:page.url,method_spec:spec},
            category_evidence:[{run_id:page.run_id,excerpt:listing.evidence}],
            check_instructions:'Execute the verified bounded listing parser; preserve unresolved locations and dates.',
            terminal_instruction:'Require the saved listing heading and exact terminal count or explicit empty state on every run.',
            handoffs:['portal','api'].map(channel=>({channel,source_id:source.id,tenant:new URL(source.url).hostname,
              checked_on:new Date().toISOString().slice(0,10),access_state:'unknown',next_actor:'researcher',
              next_action:'Public listing verified; separate authenticated access has not been assessed',evidence_urls:[page.url],
              requirements:{public:'unknown',account:'unknown',approval:'unknown',api_key:'unknown',payment:'unknown'},
              categories:{forecast:'unknown',opportunity:'unknown',award:'unknown'}}))};
          verified=validateDiscoveryReview(p,input,task,source);
          verified.capability.verification_evidence.automation_policy=automaticCountyPolicy;
        } catch(error){failures.push(error.message);}
        if(verified) {
          c.review_artifact=await artifacts.put(verified);c.source_code=source.code;c.stage='discovery_save';
          c.next_action='Save the verified source method and continue requested work';await save('pending');return;
        }
      }
      c.verification_failures=[...new Set(failures)].slice(0,5);
      c.next_action=c.blocker?'Website unavailable; saved evidence retained':
        'Source could not be verified automatically; supported listing evidence is missing';
      await save('blocked');return;
    }
    if(c.stage==='discovery_collect') {
      c.collection=await collect({requestId:job.search_request_id,sourceCode:c.source_code});
      if(c.automation_policy===automaticCountyPolicy)await continueCollection?.(job.search_request_id);
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
    const allowedHosts=[host,...(c.automation_policy===automaticCountyPolicy?[host.startsWith('www.')?host.slice(4):`www.${host}`]:[]),...(c.observed_hosts??[])];
    if(!safePublicUrl(url,allowedHosts))throw new Error('Discovery destination outside saved official host');
    const pageIndex=(c.page_offset??0)+c.visited.length;
    const prior=await rows(db,'procurement_runs',q=>q.eq('job_id',job.id).eq('page_index',pageIndex));let run=prior[0];
    if(run&&run.detail?.state!=='content_saved')throw new Error('Prior fetch outcome requires reconciliation; no repeat fetch');
    if(!run) {
      run=checked(await db.from('procurement_runs').insert({source_id:source.id,job_id:job.id,coverage_task_id:c.task_id,page_index:pageIndex,
        page_attempt:1,started_at:new Date().toISOString(),status:'partial',record_count:0,
        detail:{collector:'official-link-discovery',scope:'research_only',state:'request_pending',requested_url:url}}).select('*').single());
      const reusable=c.automation_policy===automaticCountyPolicy?await requestPublicCapture(db,{requestId:job.search_request_id,sourceId:source.id,url,maxBytes:2000000,allowedHosts,research:true}):null;
      const capture=await auditPhase(reusable?'compare':'research_fetch',()=>reusable??fetchPublicCheck({runner_id:'public-fetch',allowed_hosts:allowedHosts,max_bytes:2000000},url,fetcher,
        {resolveHost,researchEntry:c.automation_policy===automaticCountyPolicy?source.url:undefined}),{source_id:source.id,task_id:c.task_id,reason:reusable?'request_capture_reuse':'deterministic'});
      if(capture.state!=='captured') {
        checked(await db.from('procurement_runs').update({status:'blocked',finished_at:new Date().toISOString(),detail:{collector:'official-link-discovery',
          scope:'research_only',state:capture.state,reason:capture.reason,requested_url:url}}).eq('id',run.id));
        c.blocker=capture.reason;await finish(job,c,save);return;
      }
      await artifacts.put(capture.body);
      checked(await db.from('procurement_public_captures').insert({run_id:run.id,source_id:source.id,requested_url:url,final_url:capture.final_url,
        content_type:capture.content_type,content_sha256:capture.content_sha256,content_base64:capture.body.toString('base64'),...(capture.reused_run_id?{retrieved_at:capture.retrieved_at}:{})}));
      checked(await db.from('procurement_runs').update({status:'review_required',finished_at:new Date().toISOString(),detail:{collector:'official-link-discovery',scope:'research_only',
        state:'content_saved',requested_url:url,final_url:capture.final_url,content_sha256:capture.content_sha256,upstream_status:200,
        redirects:capture.redirects,...(capture.reused_run_id?{reused_run_id:capture.reused_run_id}:{})}}).eq('id',run.id));
    }
    const capture=checked(await db.from('procurement_public_captures').select('*').eq('run_id',run.id).single());
    if(c.automation_policy===automaticCountyPolicy)c.observed_hosts=[...new Set([...(c.observed_hosts??[]),new URL(capture.final_url).hostname])];
    const links=/html/i.test(capture.content_type)?officialLinks(Buffer.from(capture.content_base64,'base64'),capture.final_url,{automatic:c.automation_policy===automaticCountyPolicy}):[];
    c.visited.push(url);c.queue.shift();c.run_ids.push(run.id);
    c.links=[...new Map([...c.links,...links.map(l=>({...l,from_run_id:run.id}))].map(l=>[l.url,l])).values()].slice(0,100);
    for(const l of links)if((c.automation_policy===automaticCountyPolicy||new URL(l.url).hostname.replace(/^www\./,'')===host.replace(/^www\./,''))&&!/signup|register|login|sign.?in|logout|payment|subscribe|submit|delete|create.account/i.test(l.url)&&
      !c.visited.includes(l.url)&&!c.queue.includes(l.url)&&c.queue.length+c.visited.length<10){
      c.observed_hosts=[...new Set([...(c.observed_hosts??[]),new URL(l.url).hostname])];c.queue.push(l.url);
    }
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
    if(['county_scope','state_research'].includes(request.workflow_control?.admin_policy)&&job.state==='blocked'&&
        (['discovery_review','discovery_verify','discovery_resolve'].includes(job.checkpoint.stage)||
          job.checkpoint.stage==='discovery_capture'&&!job.checkpoint.seed_source_id)) {
      // Explicit retry upgrades saved research, without automatically replaying
      // uncertain fetches or resetting registration intents.
      const checkpoint={...job.checkpoint,automation_policy:automaticCountyPolicy,resumed_by:actor,
        stage:job.checkpoint.packet_artifact?'discovery_verify':'discovery_resolve'};
      // A user-requested retry can replace expired evidence, never an uncertain
      // write. Retain every old packet/run and reserve new page indexes so a
      // worker restart cannot accidentally reuse stale response bytes.
      if(checkpoint.packet_artifact&&!checkpoint.persistence_intent&&!checkpoint.review_artifact&&!checkpoint.blocker) {
        const captures=await rows(db,'procurement_public_captures',q=>q.in('run_id',checkpoint.run_ids??[]),'*',{order:'run_id'});
        if(captures.some(capture=>!freshCapture(capture))) {
          const source=await one(db,'procurement_sources',checkpoint.seed_source_id);
          const runs=await rows(db,'procurement_runs',q=>q.eq('job_id',job.id));
          checkpoint.previous_packets=[...(checkpoint.previous_packets??[]),checkpoint.packet_artifact];
          checkpoint.page_offset=Math.max(-1,...runs.map(run=>run.page_index))+1;
          checkpoint.queue=[publicUrl(source.url)];checkpoint.visited=[];checkpoint.run_ids=[];checkpoint.links=[];
          delete checkpoint.packet_artifact;delete checkpoint.verification_failures;
          checkpoint.stage='discovery_capture';checkpoint.next_action='Refreshing expired source evidence';
        }
      }
      const saved=checked(await db.from('procurement_jobs').update({state:'pending',checkpoint})
        .eq('id',job.id).eq('state','blocked').eq('updated_at',job.updated_at).select('id'));
      if(saved.length!==1)throw Error('Concurrent source retry; refresh saved progress');
      return {job_id:job.id,state:'pending'};
    }
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
