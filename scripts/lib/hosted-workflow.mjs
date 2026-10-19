import { auditPhase,usageSummary } from './workflow-audit.mjs';
import { hash } from './reviewed-batch.mjs';
import { checked,rows,one,publicJobAction } from './hosted-store.mjs';
import { randomUUID } from 'node:crypto';
import { geographyRequest } from './geography-service.mjs';
import { validateRequestScope } from './request-scope.mjs';
import { executeKnownSources } from './known-source-collection.mjs';
import { makeInterpretationPacket,validateInterpretation } from './known-source-workflow.mjs';
import { persistInterpretation } from './interpretation-store.mjs';
import { planInterpretationIntake } from './interpretation-intake.mjs';
import { extractFacts,evaluateFacts,extractionKey,verifyEvidenceSpans,cacheReviewedFacts,evidenceText } from './hosted-interpretation.mjs';
import { boundedInterpretation } from './hosted-ai.mjs';
import { accessNext } from './source-access.mjs';
import { recordAccessEvent } from './source-access-store.mjs';
import { supportingCapture } from './supporting-capture.mjs';
import {packetLink} from './api-record-links.mjs';
import {portalRecipe,matchingSession} from './portal-session.mjs';
import {continueBonfireDetails} from './bonfire-detail-continuation.mjs';

export function validateFindingBounds(packet,result,{verifiedSupporting=false}={}) {
  const basis=packet.query_window.date_basis??'published';
  const fields={published:['published_date','posted_date'],publication:['published_date','posted_date'],deadline:['deadline'],
    expected_solicitation:['expected_solicitation_date'],expected_solicitation_date:['expected_solicitation_date'],
    end_renewal:['contract_end_date','renewal_date'],contract_end_date:['contract_end_date'],award_date:['award_date']}[basis];
  if(!fields)throw new Error('Unsupported date basis');
  for(const f of result.findings) {
    const dates=fields.map(k=>f.payload[k]).filter(Boolean).map(d=>new Date(d).toISOString().slice(0,10));
    if(!dates.some(d=>d>=packet.query_window.from && d<=packet.query_window.to))throw new Error('Finding lacks a qualifying date for this request');
    const locations=f.payload.work_performance_locations??[{city_name:f.payload.work_city,county_name:f.payload.work_county,state_code:f.payload.work_state}];
    const quoted=[...f.evidence,...(verifiedSupporting?f.supporting_evidence??[]:[])].map(e=>e.excerpt).join(' ').toLowerCase();
    const areas=packet.request_scope.requested_search_areas;
    const equal=(a,b)=>a&&b&&a.toLowerCase()===b.toLowerCase();
    if(!locations.some(l=>l.state_code==='AR' && areas.some(a=>a.state_code==='AR' &&
      (a.area_type==='state' || a.area_type==='city' && equal(l.city_name,a.city_name) && quoted.includes(l.city_name.toLowerCase()) ||
        a.area_type==='county' && equal(l.county_name,a.county_name) && quoted.includes(l.county_name.toLowerCase())))))
      throw new Error('Finding actual work location is unverified or outside requested geography');
  }
}
export function hostedWorkflow({db,project,serverKey,artifacts,aiConfig,ai=boundedInterpretation,processJob,captureBrowser,canCaptureBrowser,audit,supportingFetch=fetch,collectionFetch=fetch,reportError=(id,error)=>console.error('Workflow stage failed',id,error)}) {
  const supporting=supportingCapture({artifacts,serverKey,fetcher:supportingFetch,loadReviewedIntake:async id=>{
    const item=await one(db,'procurement_intake_items',id);
    if(!item)return null;
    const links=await rows(db,'procurement_intake_leads',q=>q.eq('intake_id',id));
    return {...item,reviewed_lead_ids:[...new Set(links.map(l=>l.lead_id))]};
  }});
  const rpc=async(name,args)=>checked(await db.rpc(name,args));
  async function submit(input,actor,key) {
    const categories=validateRequestScope(input);
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(key??''))throw new Error('Idempotency-Key of 8–100 characters required');
    const canonical={...input,search_windows:Object.fromEntries(Object.entries(input.search_windows).map(([kind,window])=>[kind,{...window,
      date_basis:({published:'publication',expected_solicitation:'expected_solicitation_date'})[window.date_basis]??window.date_basis}]))};
    return geographyRequest(db,'create',canonical,{create:args=>db.rpc('submit_procurement_api_request',{
      p_actor:actor,p_key:key,p_hash:hash(input),p_input:args,p_categories:categories})});
  }
  async function context(requestId,taskId) {
    const [request,task]=await Promise.all([one(db,'procurement_search_requests',requestId),one(db,'procurement_coverage_tasks',taskId)]);
    const target=task&&await one(db,'procurement_request_targets',task.target_id);
    if(!request || target?.search_request_id!==requestId || task.kind==='source_entry')throw new Error('Matching category task required');
    const runIds=task.evidence?.run_ids??[];
    if(!runIds.length)throw new Error('No confirmed category captures');
    const [jobs,source,capability,runs,captures]=await Promise.all([
      rows(db,'procurement_jobs',q=>q.eq('task_id',taskId)),one(db,'procurement_sources',task.source_id),
      one(db,'procurement_source_capabilities',task.capability_id),rows(db,'procurement_runs',q=>q.in('id',runIds)),
      rows(db,'procurement_public_captures',q=>q.in('run_id',runIds),'*',{order:'run_id'})]);
    return {request,task,job:jobs[0],source,capability,runs:runIds.map(id=>runs.find(r=>r.id===id)),captures:runIds.map(id=>captures.find(c=>c.run_id===id))};
  }
  async function packet(requestId,taskId) {
    const ctx=await context(requestId,taskId),packet=makeInterpretationPacket(ctx);
    let detail_collection;
    if(packet.project_links) {
      const parent=(await rows(db,'procurement_jobs',q=>q.eq('dedupe_key',`api-workflow:${requestId}`),'checkpoint'))[0];
      const progress=parent?.checkpoint?.bonfire_details?.[taskId];
      if(progress?.packet_hash===packet.packet_hash&&progress.method_hash===hash({id:ctx.capability.id,version:ctx.capability.parser_version,spec:ctx.capability.method_spec})) {
        detail_collection={complete:progress.complete,reason:progress.reason,projects:progress.projects.map(project=>({
          id:project.id,state:project.state,documents_complete:project.documents_complete,document_overflow:project.document_overflow,
          evidence:[project,...project.documents].filter(d=>d.evidence).map(d=>d.evidence),
        }))};
      }
    }
    const current=(await rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId).eq('task_id',taskId).eq('is_current',true),'id,packet_hash,result'))[0];
    // The immutable packet hash remains unchanged. A review revision explicitly supersedes
    // the current interpretation; only matching-packet outcomes may be appended by the UI.
    return {...packet,...(detail_collection?{detail_collection}:{}),current_interpretation:current?{id:current.id,packet_hash:current.packet_hash,counts:Object.fromEntries(['findings','exclusions','unresolved'].map(k=>[k,current.result[k].length]))}:null};
  }
  async function sourceOptions(requestId,{offset=0,limit=50}={}) {
    if(!await one(db,'procurement_search_requests',requestId))throw Error('Request not found');
    const ids=(await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId),'source_id')).map(s=>s.source_id);
    if(!ids.length)return {items:[],next_offset:null};
    const values=checked(await db.from('procurement_sources').select('id,code,name,url').in('id',ids).order('name').order('id').range(offset,offset+limit));
    return {items:values.slice(0,limit),next_offset:values.length>limit?offset+limit:null};
  }
  async function captureSupporting(requestId,taskId,input,actor) {
    const ctx=await context(requestId,taskId);
    const p=makeInterpretationPacket(ctx),bonfire=ctx.capability.method_spec.response_format==='bonfire-projects-v1';
    const parent=bonfire?(await rows(db,'procurement_jobs',q=>q.eq('dedupe_key',`api-workflow:${requestId}`)))[0]:null;
    const checkpoint=parent&&structuredClone(parent.checkpoint),progress=checkpoint?.bonfire_details?.[taskId];
    const project=progress?.projects.find(project=>project.url===input.url||project.documents.some(d=>d.url===input.url));
    const previous=project?.url===input.url?project:project?.documents.find(d=>d.url===input.url);
    if(bonfire&&['attempt_pending','outcome_unknown'].includes(previous?.state)&&!input.saved_evidence)
      throw Error('Reconcile the saved uncertain capture with its verified receipt before sending another request');
    let outcome;
    if(bonfire&&input.saved_evidence) {
      if(input.packet_hash!==p.packet_hash||input.saved_evidence.url!==input.url)throw Error('Exact saved packet and destination required');
      await supporting.load(ctx,p,input.saved_evidence);
      outcome={...Object.fromEntries(['capture_receipt','url','content_sha256','content_type','retrieved_at','local_path']
        .map(key=>[key,input.saved_evidence[key]])),state:'captured',lead_coverage:false,fresh_capture:false};
    }else outcome=await supporting.capture(ctx,p,input,actor);
    // An explicit successful recapture can reconcile only this request's matching
    // public attempt. It never renews a hosted session or grants browser acceptance.
    if(bonfire&&outcome.state==='captured') {
      if(parent&&['pending','blocked'].includes(parent.state)&&progress?.packet_hash===p.packet_hash&&project&&
          progress.method_hash===hash({id:ctx.capability.id,version:ctx.capability.parser_version,spec:ctx.capability.method_spec})&&
          !(await one(db,'procurement_search_requests',requestId)).workflow_control?.cancelled) {
        const target=project.url===outcome.url?project:project.documents.find(d=>d.url===outcome.url);
        target.evidence=outcome;target.state='captured';target.capture_receipt=outcome.capture_receipt;delete target.reason;
        if(target===project) {
          const links=await supporting.documentLinks(ctx,p,outcome);
          project.documents=links.slice(0,4).map(url=>project.documents.find(d=>d.url===url)??{url,state:'pending'});
          project.document_overflow=links.length>4;project.documents_complete=project.documents.length===0;
        }
        progress.complete=false;delete progress.reason;
        checkpoint.bonfire_access_holds=(checkpoint.bonfire_access_holds??[]).filter(h=>h.source_id!==p.source_id||h.method_hash!==progress.method_hash);
        checkpoint.interpreted_task_ids=(checkpoint.interpreted_task_ids??[]).filter(id=>id!==taskId);
        checkpoint.bonfire_resume_tasks=[...new Set([...(checkpoint.bonfire_resume_tasks??[]),taskId])];
        checkpoint.stage='interpret';
        const changed=checked(await db.from('procurement_jobs').update({checkpoint,state:'pending'})
          .eq('id',parent.id).eq('state',parent.state).eq('checkpoint',JSON.stringify(parent.checkpoint)).select('id'));
        return {...outcome,continuation:changed.length?'saved':'Refresh saved workflow; its checkpoint changed during capture'};
      }
    }
    return outcome;
  }
  async function readSupporting(requestId,taskId,evidence) {
    const ctx=await context(requestId,taskId),p=makeInterpretationPacket(ctx);
    const body=await supporting.load(ctx,p,evidence);
    return {review:(await evidenceText({...evidence,body})).map(page=>`${page.locator}: ${page.text}`).join('\n').slice(0,30000)};
  }
  async function stage(packet,result) {
    if(!result.findings.length)return {inserted:0,existing_preserved:0,intake_ids:[]};
    const [sources,requests,associations,targets,tasks,intakes]=await Promise.all([
      rows(db,'procurement_sources',q=>q.eq('id',packet.source_id)),rows(db,'procurement_search_requests',q=>q.eq('id',packet.request_id)),
      rows(db,'procurement_request_sources',q=>q.eq('search_request_id',packet.request_id)),rows(db,'procurement_request_targets',q=>q.eq('search_request_id',packet.request_id)),
      rows(db,'procurement_coverage_tasks',q=>q.eq('id',packet.task_id)),rows(db,'procurement_intake_items',q=>q.eq('source_id',packet.source_id))]);
    const before={project_ref:project,procurement_sources:sources,procurement_search_requests:requests,
      procurement_request_sources:associations,procurement_request_targets:targets,procurement_coverage_tasks:tasks,procurement_intake_items:intakes};
    const paths=Object.fromEntries(await Promise.all(packet.pages.map(async p=>[p.run_id,await artifacts.put(p.body)])));
    const {manifest,receipt}=planInterpretationIntake(packet,result,before,paths,{verifiedSupporting:true});
    const items=manifest.rows.map(d=>d.row);
    if(!items.length)return receipt;
    checked(await db.from('procurement_intake_items').upsert(items,{onConflict:'source_id,external_id',ignoreDuplicates:true}));
    const saved=await rows(db,'procurement_intake_items',q=>q.in('id',items.map(i=>i.id)));
    if(items.some(i=>!saved.some(s=>s.id===i.id&&hash(s.payload)===hash(i.payload))))throw new Error('Intake readback mismatch; reconcile before retry');
    return {...receipt,inserted:items.length,intake_ids:[...receipt.intake_ids,...items.map(i=>i.id)]};
  }
  async function interpret(requestId,taskId,result,actor) {
    const p=await packet(requestId,taskId);
    if(result.append_to_current) {
      const current=(await rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId).eq('task_id',taskId).eq('is_current',true),'id,packet_hash,result'))[0];
      if(!current||current.id!==result.supersedes_id||current.packet_hash!==p.packet_hash)throw Error('Review changed; refresh the current packet');
      result={...result,...Object.fromEntries(['findings','exclusions','unresolved'].map(k=>[k,[...current.result[k],...result[k]]]))};
    }
    const reviewed={...result,reviewed_by:actor,findings:result.findings.map(f=>({ ...f,payload:{...f.payload,
      ...(packetLink(p,f)??{}),
      ...(f.payload.work_city||f.payload.work_county?{work_performance_locations:[{state_code:f.payload.work_state,
        city_name:f.payload.work_city,county_name:f.payload.work_county,evidence:f.work_location_basis}]}:{})} }))};
    const ctx=await context(requestId,taskId);
    validateInterpretation(p,reviewed,{verifiedSupporting:true});
    await verifyEvidenceSpans(p,reviewed,{loadSupporting:e=>supporting.load(ctx,p,e)});
    validateFindingBounds(p,reviewed,{verifiedSupporting:true});
    const receipt=await persistInterpretation(db,p,reviewed,stage,{verifiedSupporting:true});
    if(reviewed.findings.length) {
      const ctx=await context(requestId,taskId),key=extractionKey(p,ctx.capability.method_spec);
      const cached=checked(await db.from('procurement_extraction_cache').select('*').eq('cache_key',key).maybeSingle());
      const original=cached?.facts??await extractFacts(p,ctx.capability.method_spec);
      const portableSupporting=new Map();
      for(const finding of reviewed.findings)if(finding.supporting_evidence?.length)
        portableSupporting.set(finding.record_id,await Promise.all(finding.supporting_evidence.map(e=>supporting.portable(ctx,p,e))));
      const refined=cacheReviewedFacts(original,p,reviewed,{portableSupporting});
      if(!cached)checked(await db.from('procurement_extraction_cache').upsert({cache_key:key,source_id:p.source_id,facts:refined},{onConflict:'cache_key',ignoreDuplicates:true}));
      else if(!await rpc('refine_procurement_extraction',{p_key:key,p_expected:cached.facts,p_facts:refined}))
        throw new Error('Reviewed findings persisted; concurrent cache refinement needs reconciliation');
    }
    return receipt;
  }
  async function status(requestId,{offset=0,limit=50}={}) {
    const request=await one(db,'procurement_search_requests',requestId);
    if(!request)throw new Error('Request not found');
    const targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId),'id');
    const [tasks,interpretations,jobs,usage]=await Promise.all([
      targets.length?rows(db,'procurement_coverage_tasks',q=>q.in('target_id',targets.map(t=>t.id)),'id,source_id,route_geography_id,kind,state,reason,pages_reviewed'):[],
      rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId),'id,is_current,staging_receipt'),rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId),'id,state,kind,dedupe_key,checkpoint,capability_id'),
      rows(db,'procurement_usage_ledger',q=>q.eq('request_id',requestId),'id,kind,state,provider,model,rate_version,input_tokens,output_tokens,reserved_usd,actual_usd,usage')]);
    const capabilityIds=[...new Set(jobs.map(j=>j.capability_id).filter(Boolean))];
    const sourceIds=[...new Set(tasks.map(t=>t.source_id).filter(Boolean))],geoIds=[...new Set(tasks.map(t=>t.route_geography_id).filter(Boolean))];
    const [taskSources,taskPlaces]=await Promise.all([
      sourceIds.length?rows(db,'procurement_sources',q=>q.in('id',sourceIds),'id,name'):[],
      geoIds.length?rows(db,'procurement_geographies',q=>q.in('id',geoIds),'id,name'):[]]);
    const browserCapabilities=capabilityIds.length?await rows(db,'procurement_source_capabilities',q=>q.in('id',capabilityIds),'id,method_spec'):[];
    const ids=[...new Set([...interpretations.filter(i=>i.is_current!==false).flatMap(i=>i.staging_receipt?.intake_ids??[]),
      ...jobs.filter(j=>j.dedupe_key?.startsWith('api-sam:')&&j.checkpoint?.stage==='sam_review').flatMap(j=>j.checkpoint.intake_ids??[])])];
    const selected=ids.slice(offset,offset+limit),intakes=selected.length?await rows(db,'procurement_intake_items',q=>q.in('id',selected)):[];
    const links=selected.length?await rows(db,'procurement_intake_leads',q=>q.in('intake_id',selected)):[];
    const leadIds=[...new Set(links.map(l=>l.lead_id))];
    const [leads,requestLinks]=leadIds.length?await Promise.all([rows(db,'procurement_leads',q=>q.in('id',leadIds),'id'),
      rows(db,'procurement_request_leads',q=>q.eq('search_request_id',requestId).in('lead_id',leadIds))]):[[],[]];
    const candidates=intakes.map(i=>({intake_id:i.id,intake_hash:hash(i.payload),title:i.payload.title,
      state:i.status==='processed'&&links.some(l=>l.intake_id===i.id&&leads.some(r=>r.id===l.lead_id)&&requestLinks.some(r=>r.lead_id===l.lead_id))?'imported':
        i.status==='processed'?'link_review_required':i.status==='ignored'?'ignored':'pending_review'}));
    const automaticCounty=['county_scope','state_research'].includes(request.workflow_control?.admin_policy);
    return {request_id:requestId,cancelled:request.workflow_control.cancelled===true,requested_categories:request.requested_categories,
      automatic_county:automaticCounty,check_updates:request.workflow_control?.check_updates!==false,
      search_windows:request.search_windows,jobs:jobs.map(j=>({id:j.id,state:j.state,kind:j.kind,stage:j.checkpoint?.stage,run_ids:j.checkpoint?.run_ids??[],pages:j.checkpoint?.pages??null,
        records:j.checkpoint?.records??null,terminal_confirmed:j.checkpoint?.terminal_confirmed??false,
        access_handoff_id:browserCapabilities.find(c=>c.id===j.capability_id&&c.method_spec?.runner_id==='authenticated-browser')?.method_spec.access_handoff_id??null,
        capture_state:j.checkpoint?.hosted_browser_attempt?.state??null,
        next_action:publicJobAction(j),error_code:j.checkpoint?.error_code??null,diagnostic_id:j.checkpoint?.diagnostic_id??null})),
      tasks:tasks.filter(t=>!automaticCounty||t.state!=='superseded').map(t=>({id:t.id,source_id:t.source_id,category:t.kind,state:t.state,reason:t.reason,pages:t.pages_reviewed,
        source_name:taskSources.find(s=>s.id===t.source_id)?.name??null,location_name:taskPlaces.find(g=>g.id===t.route_geography_id)?.name??null,
        discovery_state:jobs.find(j=>j.kind==='discover'&&j.checkpoint?.task_id===t.id)?.state??null,
        discovery_action:(()=>{const j=jobs.find(j=>j.kind==='discover'&&j.checkpoint?.task_id===t.id);return j?publicJobAction(j):null;})()})),
      candidates,total_candidates:ids.length,next_offset:offset+limit<ids.length?offset+limit:null,
      usage:request.workflow_control?.admin_trigger_id?usageSummary(usage):{calls:usage.filter(u=>u.kind==='inference'&&u.state!=='not_sent').length,
        input_tokens:usage.reduce((n,u)=>n+(u.usage?.input_tokens??u.input_tokens),0),
        output_tokens:usage.reduce((n,u)=>n+(u.usage?.output_tokens??u.output_tokens),0),
        reserved_usd:usage.filter(u=>['reserved','outcome_unknown'].includes(u.state)).reduce((n,u)=>n+Number(u.reserved_usd),0),
        actual_usd:usage.reduce((n,u)=>n+Number(u.actual_usd??0),0),
        entries:usage.map(u=>({provider:u.provider,model:u.model,rate_version:u.rate_version,state:u.state,actual_usd:u.actual_usd}))},
      statewide_sam:{separate:true,included_in_geography_coverage:false},
      next_action:candidates.some(c=>c.state==='pending_review')?'Review candidates and prepare an exact import package':
        'Inspect pending evidence, source gaps or exact access action; entry checks are not lead coverage'};
  }
  async function control(requestId,action,actor) {
    return rpc('control_procurement_workflow',{p_request:requestId,p_actor:actor,p_action:action});
  }
  async function continueVerifiedCollection(requestId) {
    const request=await one(db,'procurement_search_requests',requestId);
    if(request.workflow_control?.cancelled||request.workflow_control?.check_updates===false)return;
    const job=checked(await db.from('procurement_jobs').select('id,state,checkpoint,updated_at')
      .eq('search_request_id',requestId).eq('dedupe_key',`api-workflow:${requestId}`).maybeSingle());
    if(job?.state==='blocked'&&!job.checkpoint?.error_code&&job.checkpoint?.stage==='interpret') {
      checked(await db.from('procurement_jobs').update({state:'pending',checkpoint:{...job.checkpoint,stage:'collect'}})
        .eq('id',job.id).eq('state','blocked').eq('updated_at',job.updated_at));
    }
  }
  async function step() {
    const job=await rpc('claim_procurement_workflow_job',{});
    if(!job)return false;
    let checkpoint={...job.checkpoint};
    const save=async state=>{if(!await rpc('checkpoint_procurement_workflow',{p_job:job.id,p_lease:job.lease_token,p_state:state,p_checkpoint:checkpoint}))
      throw new Error('Workflow lease expired; saved evidence must be reconciled');};
    const request=await one(db,'procurement_search_requests',job.search_request_id);
    if(request.workflow_control.cancelled){await save('cancelled');return true;}
    const execute=async()=>{
    const timer=setInterval(()=>save('running').catch(()=>{}),60000);timer.unref();
    try {
      delete checkpoint.error_code;delete checkpoint.diagnostic_id;
      if((checkpoint.stage.startsWith('import_')||checkpoint.stage.startsWith('sam_')||checkpoint.stage.startsWith('discovery_'))) {
        await processJob(job,checkpoint,save);
      } else if(checkpoint.stage==='plan') {
        await executeKnownSources({db,project,serverKey,command:'plan',requestId:request.id});
        checkpoint.stage=request.workflow_control?.check_updates===false?'interpret':'collect';await save('pending');
      } else if(checkpoint.stage==='collect') {
        const result=await executeKnownSources({db,project,serverKey,command:'run',requestId:request.id,maxJobs:1,retryPartial:false,fetcher:collectionFetch,
          cancelled:async()=>!!(await one(db,'procurement_search_requests',request.id)).workflow_control.cancelled});
        const browserRoute=result.routes.find(r=>r.state==='awaiting_browser_capture');
        if(browserRoute&&captureBrowser&&(!request.workflow_control?.admin_trigger_id||await canCaptureBrowser?.(browserRoute.job_id))) {
          const captured=await captureBrowser(browserRoute.job_id,request.initiated_by);
          if(captured.receipt)checkpoint.browser_task_ids=[...new Set([...(checkpoint.browser_task_ids??[]),browserRoute.task_id])];
        }
        const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',request.id).eq('kind','collect'));
        const browserIds=new Set(result.routes.filter(r=>r.state==='awaiting_browser_capture').map(r=>r.job_id));
        // Blocked/browser/partial jobs need explicit continuation, not an automatic polling loop.
        const active=jobs.some(j=>j.state==='pending'&&!browserIds.has(j.id));
        if(!active)checkpoint.stage='interpret';
        await save('pending');
      } else if(checkpoint.stage==='interpret') {
        const data=await status(request.id),done=new Set(checkpoint.interpreted_task_ids??[]);
        const task=data.tasks.find(t=>t.category!=='source_entry'&&!done.has(t.id)&&
          (t.state==='needs_interpretation'||t.state==='partial'&&checkpoint.browser_task_ids?.includes(t.id)));
        if(!task){checkpoint.next_action=data.next_action;await save('blocked');return true;}
        const ctx=await context(request.id,task.id),p=makeInterpretationPacket(ctx),key=extractionKey(p,ctx.capability.method_spec);
        if(ctx.capability.method_spec.response_format==='bonfire-projects-v1') {
          const guarded=supportingCapture({artifacts,serverKey,fetcher:supportingFetch,beforeFetch:async()=>{
            if((await one(db,'procurement_search_requests',request.id)).workflow_control?.cancelled) {
              const error=Error('Request cancelled before project fetch');error.code='request_cancelled';throw error;
            }
          }});
          const detailsDone=await continueBonfireDetails({context:ctx,packet:p,supporting:guarded,checkpoint,save,actor:request.initiated_by,
            priorHold:async hold=>{
              const previous=checked(await db.from('procurement_jobs').select('id').eq('kind','process')
                .contains('checkpoint',{bonfire_access_holds:[hold]}).neq('id',job.id).limit(1));
              return previous.length>0;
            }});
          if(!detailsDone)return true;
          if(checkpoint.bonfire_resume_tasks?.includes(task.id)) {
            const current=(await rows(db,'procurement_interpretations',q=>q.eq('request_id',request.id).eq('task_id',task.id).eq('is_current',true),'id'))[0];
            if(current){checkpoint.interpreted_task_ids=[...done,task.id];await save('pending');return true;}
          }
        }
        let cached=checked(await db.from('procurement_extraction_cache').select('*').eq('cache_key',key).maybeSingle());
        const cacheUsed=Boolean(cached);
        if(!cached) {
          const facts=await auditPhase('extract',()=>extractFacts(p,ctx.capability.method_spec),{task_id:task.id,source_id:p.source_id});
          checked(await db.from('procurement_extraction_cache').upsert({cache_key:key,source_id:p.source_id,facts},{onConflict:'cache_key',ignoreDuplicates:true}));
          cached={facts};
        } else checkpoint.cache_hits=(checkpoint.cache_hits??0)+1;
        let result=evaluateFacts(p,cached.facts);
        // Reapply bounds independently to each cached positive fact. A previous request
        // never decides coverage for a different geography or date window.
        const eligible=[];
        for(const finding of result.findings) {
          try {
            if(finding.supporting_evidence?.length) {
              finding.supporting_evidence=await Promise.all(finding.supporting_evidence.map(e=>supporting.rebind(ctx,p,e)));
              await verifyEvidenceSpans(p,{findings:[finding],exclusions:[],unresolved:[]},{loadSupporting:e=>supporting.load(ctx,p,e)});
            }
            validateFindingBounds(p,{findings:[finding]},{verifiedSupporting:!!finding.supporting_evidence?.length});eligible.push(finding);
          }
          catch {result.unresolved.push({reason:'Cached source fact does not establish this request scope/date; review before exclusion',evidence:finding.evidence});}
        }
        result.findings=eligible;
        // A Bonfire index has no protected project/document content to interpret.
        // Preserve its unresolved evidence rather than pay AI to guess access gaps.
        const listingNeedsDetail=ctx.capability.method_spec?.response_format==='bonfire-projects-v1';
        if(result.unresolved.length && aiConfig?.enabled && !listingNeedsDetail) {
          const automaticCounty=['county_scope','state_research'].includes(request.workflow_control?.admin_policy);
          let response;
          const limitedResult=()=>({...result,unresolved:result.unresolved.map(item=>({...item,
            reason:`${item.reason}; ${checkpoint.ai_output_rejected?'AI response could not be validated; saved evidence retained':'AI budget reached'}`}))});
          try {
            response=automaticCounty&&(checkpoint.ai_budget_reached||checkpoint.ai_output_rejected)?limitedResult():
              await auditPhase('ai_interpretation',()=>ai({db,requestId:request.id,actor:request.initiated_by,packet:p,config:aiConfig}),{task_id:task.id,source_id:p.source_id,reason:'provider'});
          }
          catch(error) {
            if(!automaticCounty||!['ai_budget_reached','ai_output_rejected'].includes(error.code))throw error;
            checkpoint[error.code]=true;
            response=limitedResult();
          }
          const proposed={...result,...response,coverage:'partial'};
          if(automaticCounty) {
            try {
              validateInterpretation(p,proposed,{verifiedSupporting:true});
              await verifyEvidenceSpans(p,proposed,{loadSupporting:e=>supporting.load(ctx,p,e)});
              validateFindingBounds(p,proposed,{verifiedSupporting:true});
              result=proposed;
            } catch {
              // Retain only the original deterministic evidence; never stage an
              // unsupported AI claim or repeat a paid call for this saved task.
              checkpoint.ai_rejected_task_ids=[...(checkpoint.ai_rejected_task_ids??[]),task.id];
              result={...result,coverage:'partial',unresolved:result.unresolved.map(item=>({...item,
                reason:`${item.reason}; automatic interpretation did not pass evidence validation`}))};
            }
          } else result=proposed;
        }
        await auditPhase('stage',()=>interpret(request.id,task.id,result,`worker:${request.initiated_by}`),{task_id:task.id,source_id:p.source_id,reason:cacheUsed?'cache':'deterministic'});
        checkpoint.interpreted_task_ids=[...done,task.id];await save('pending');
      } else throw new Error('Unsupported saved workflow stage');
    } catch(error) {
      if(error.code==='request_cancelled'){await save('cancelled');return true;}
      if(error.code==='schedule_paused') {await save('pending');return true;}
      if(error.code==='sam_import_reconciliation_required'&&checkpoint.stage.startsWith('sam_')){
        checkpoint.error_code=error.code;checkpoint.next_action='Reconcile the previous SAM database result before collecting or saving more SAM records';
        await save('blocked');return true;
      }
      checkpoint.error_code='workflow_stage_failed';
      checkpoint.diagnostic_id=randomUUID();
      checkpoint.next_action='Review the saved workflow blocker and server diagnostics before resuming';
      // Server logs are private; only this correlation ID crosses the status boundary.
      reportError(checkpoint.diagnostic_id,error);
      await save('blocked');
    } finally {clearInterval(timer);}
    return true;
    };
    try {return await (audit?audit.run(request.id,checkpoint.stage,execute,{job_id:job.id,job_attempt:job.attempts,outcome:()=>checkpoint.error_code?'failed':'completed',diagnostic:()=>checkpoint.diagnostic_id,summary:()=>checkpoint}):execute());}
    catch(error){if(error.code==='schedule_paused'){await save('pending');return true;}throw error;}
  }
  async function access(id) {
    const h=await one(db,'procurement_access_handoffs',id);
    if(!h)throw new Error('Saved access handoff not found');
    let recipe_current=false,session_current=false;
    if(h.channel==='portal')try {const recipe=portalRecipe(h);recipe_current=true;session_current=!!matchingSession(h,recipe);}catch { /* retain reviewed expiry */ }
    return {id:h.id,source_id:h.source_id,channel:h.channel,tenant:h.tenant,revision:h.lifecycle_revision,next:accessNext(h),
      ...(h.channel==='portal'?{hosted:{recipe_current,session_current},
        ...(!recipe_current?{next:{actor:'researcher',action:'Revalidate the expired or missing reviewed portal recipe before hosted sign-in; manual browser success does not renew it'}}:{})}:{})};
  }
  async function accessEvent(id,event,actor) {
    const h=await one(db,'procurement_access_handoffs',id);
    if(!h)throw new Error('Saved handoff required');
    if(/aggregator/i.test(h.details?.provider_type??'')||h.details?.aggregator===true)
      throw new Error('Aggregator signup prohibited');
    await recordAccessEvent(db,h,{...event,next_action:`${event.next_action} (recorded by ${actor})`});
    return access(id);
  }
  return {submit,preview:input=>geographyRequest(db,'preview',input),context,packet,sourceOptions,captureSupporting,readSupporting,interpret,status,control,continueVerifiedCollection,step,access,accessEvent};
}
