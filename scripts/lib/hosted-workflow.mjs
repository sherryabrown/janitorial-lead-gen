import { hash } from './reviewed-batch.mjs';
import { checked,rows,one } from './hosted-store.mjs';
import { geographyRequest } from './geography-service.mjs';
import { validateRequestScope } from './request-scope.mjs';
import { executeKnownSources } from './known-source-collection.mjs';
import { makeInterpretationPacket,validateInterpretation } from './known-source-workflow.mjs';
import { persistInterpretation } from './interpretation-store.mjs';
import { planInterpretationIntake } from './interpretation-intake.mjs';
import { extractFacts,evaluateFacts,extractionKey,verifyEvidenceSpans,cacheReviewedFacts } from './hosted-interpretation.mjs';
import { boundedInterpretation } from './hosted-ai.mjs';
import { accessNext } from './source-access.mjs';
import { recordAccessEvent } from './source-access-store.mjs';
import { supportingCapture } from './supporting-capture.mjs';
import {packetLink} from './api-record-links.mjs';

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
export function hostedWorkflow({db,project,serverKey,artifacts,aiConfig,ai=boundedInterpretation,processJob}) {
  const supporting=supportingCapture({artifacts,serverKey,loadReviewedIntake:async id=>{
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
  async function packet(requestId,taskId) {return makeInterpretationPacket(await context(requestId,taskId));}
  async function captureSupporting(requestId,taskId,input,actor) {
    const ctx=await context(requestId,taskId);
    return supporting.capture(ctx,makeInterpretationPacket(ctx),input,actor);
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
    const targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId));
    const [tasks,interpretations,jobs,usage]=await Promise.all([
      targets.length?rows(db,'procurement_coverage_tasks',q=>q.in('target_id',targets.map(t=>t.id))):[],
      rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId)),rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId)),
      rows(db,'procurement_usage_ledger',q=>q.eq('request_id',requestId))]);
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
    return {request_id:requestId,cancelled:request.workflow_control.cancelled===true,requested_categories:request.requested_categories,
      search_windows:request.search_windows,jobs:jobs.map(j=>({id:j.id,state:j.state,kind:j.kind,stage:j.checkpoint?.stage,run_ids:j.checkpoint?.run_ids??[],pages:j.checkpoint?.pages??null,
        records:j.checkpoint?.records??null,terminal_confirmed:j.checkpoint?.terminal_confirmed??false,
        next_action:j.checkpoint?.next_action??null})),
      tasks:tasks.map(t=>({id:t.id,source_id:t.source_id,category:t.kind,state:t.state,reason:t.reason,pages:t.pages_reviewed})),
      candidates,total_candidates:ids.length,next_offset:offset+limit<ids.length?offset+limit:null,
      usage:{calls:usage.filter(u=>u.kind==='inference'&&u.state!=='not_sent').length,
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
  async function step() {
    const job=await rpc('claim_procurement_workflow_job',{});
    if(!job)return false;
    let checkpoint={...job.checkpoint};
    const save=async state=>{if(!await rpc('checkpoint_procurement_workflow',{p_job:job.id,p_lease:job.lease_token,p_state:state,p_checkpoint:checkpoint}))
      throw new Error('Workflow lease expired; saved evidence must be reconciled');};
    const request=await one(db,'procurement_search_requests',job.search_request_id);
    if(request.workflow_control.cancelled){await save('cancelled');return true;}
    const timer=setInterval(()=>save('running').catch(()=>{}),60000);timer.unref();
    try {
      if((checkpoint.stage.startsWith('import_')||checkpoint.stage.startsWith('sam_')||checkpoint.stage.startsWith('discovery_'))) {
        await processJob(job,checkpoint,save);
      } else if(checkpoint.stage==='plan') {
        await executeKnownSources({db,project,serverKey,command:'plan',requestId:request.id});
        checkpoint.stage='collect';await save('pending');
      } else if(checkpoint.stage==='collect') {
        const result=await executeKnownSources({db,project,serverKey,command:'run',requestId:request.id,maxJobs:1,retryPartial:false,
          cancelled:async()=>!!(await one(db,'procurement_search_requests',request.id)).workflow_control.cancelled});
        const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',request.id).eq('kind','collect'));
        const browserIds=new Set(result.routes.filter(r=>r.state==='awaiting_browser_capture').map(r=>r.job_id));
        // Blocked/browser/partial jobs need explicit continuation, not an automatic polling loop.
        const active=jobs.some(j=>j.state==='pending'&&!browserIds.has(j.id));
        if(!active)checkpoint.stage='interpret';
        await save('pending');
      } else if(checkpoint.stage==='interpret') {
        const data=await status(request.id),done=new Set(checkpoint.interpreted_task_ids??[]);
        const task=data.tasks.find(t=>t.category!=='source_entry'&&t.state==='needs_interpretation'&&!done.has(t.id));
        if(!task){checkpoint.next_action=data.next_action;await save('blocked');return true;}
        const p=await packet(request.id,task.id),ctx=await context(request.id,task.id),key=extractionKey(p,ctx.capability.method_spec);
        let cached=checked(await db.from('procurement_extraction_cache').select('*').eq('cache_key',key).maybeSingle());
        if(!cached) {
          const facts=await extractFacts(p,ctx.capability.method_spec);
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
        if(result.unresolved.length && aiConfig?.enabled) {
          const response=await ai({db,requestId:request.id,actor:request.initiated_by,packet:p,config:aiConfig});
          result={...result,...response,coverage:'partial'};
        }
        await interpret(request.id,task.id,result,`worker:${request.initiated_by}`);
        checkpoint.interpreted_task_ids=[...done,task.id];await save('pending');
      } else throw new Error('Unsupported saved workflow stage');
    } catch(error) {
      checkpoint.next_action=error.message;
      // Error messages are controlled and never include server secrets or raw queries.
      await save('blocked');
    } finally {clearInterval(timer);}
    return true;
  }
  async function access(id) {
    const h=await one(db,'procurement_access_handoffs',id);
    if(!h)throw new Error('Saved access handoff not found');
    return {id:h.id,source_id:h.source_id,channel:h.channel,tenant:h.tenant,revision:h.lifecycle_revision,next:accessNext(h)};
  }
  async function accessEvent(id,event,actor) {
    const h=await one(db,'procurement_access_handoffs',id);
    if(!h)throw new Error('Saved handoff required');
    if(/aggregator/i.test(h.details?.provider_type??'')||h.details?.aggregator===true)
      throw new Error('Aggregator signup prohibited');
    await recordAccessEvent(db,h,{...event,next_action:`${event.next_action} (recorded by ${actor})`});
    return access(id);
  }
  return {submit,preview:input=>geographyRequest(db,'preview',input),context,packet,captureSupporting,interpret,status,control,step,access,accessEvent};
}
