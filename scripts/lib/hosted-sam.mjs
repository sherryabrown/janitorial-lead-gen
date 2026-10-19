import { hash,collectRuns } from './reviewed-batch.mjs';
import { checked,one,rows } from './hosted-store.mjs';
import { samIntakeRows } from './sam-intake.mjs';
import { inspectSamCapture } from './known-source-execution.mjs';
import {resolveSamAwardLinks} from './api-record-links.mjs';
import {samRequest} from './sam-request.mjs';
import {auditPhase} from './workflow-audit.mjs';
import {randomUUID} from 'node:crypto';
export function statewideSam({db,project,serverKey,artifacts,fetcher=fetch,automaticImport,validateCollection}) {
  async function history({offset=0,limit=50}={}) {
    const jobs=checked(await db.from('procurement_jobs').select('id,search_request_id,state,checkpoint,created_at').like('dedupe_key','api-sam:%')
      .order('created_at',{ascending:false}).order('id').range(offset,offset+limit));
    const selected=jobs.slice(0,limit),ids=selected.map(j=>j.search_request_id);
    const requests=ids.length?await rows(db,'procurement_search_requests',q=>q.in('id',ids),'id,requested_categories,search_windows'):[];
    const links=ids.length?await rows(db,'procurement_trigger_requests',q=>q.in('request_id',ids),'request_id,trigger_id'):[];
    return {items:selected.map(j=>{const request=requests.find(r=>r.id===j.search_request_id),category=request?.requested_categories?.[0];
      return {request_id:j.search_request_id,category,publication_window:request?.search_windows?.[category],state:j.state,stage:j.checkpoint?.stage,
        created_at:j.created_at,parent_trigger_id:links.find(l=>l.request_id===j.search_request_id)?.trigger_id??null};}),next_offset:jobs.length>limit?offset+limit:null};
  }
  async function packet(requestId) {
    const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId));
    const job=jobs.find(j=>j.dedupe_key===`api-sam:${requestId}`&&j.checkpoint?.stage==='sam_review');
    if(!job)throw new Error('Persisted separate SAM review candidates required');
    const c=job.checkpoint,runs=await savedRuns(c);
    const ids=c.intake_ids??[];
    const candidates=ids.length?await rows(db,'procurement_intake_items',q=>q.in('id',ids)):[];
    if(candidates.length!==ids.length)throw new Error('SAM candidate readback incomplete');
    const request=await one(db,'procurement_search_requests',requestId),automatic=await automaticStatus(c,job);
    return {request_id:requestId,category:c.kind,publication_window:request?.search_windows?.[c.kind],pages:c.pages??runs.length,records:c.records??null,run_ids:c.run_ids,terminal_confirmed:c.terminal_confirmed,
      partial:!c.terminal_confirmed,...automatic,
      candidates:candidates.map(i=>({intake_id:i.id,intake_hash:hash(i.payload),status:i.status,
        source_id:i.source_id,title:i.payload.title,agency:i.payload.agency,bid_type:i.payload.bid_type,
        source_url:i.payload.source_url,deadline:i.payload.deadline,contract_start:i.payload.contract_start,
        contract_end:i.payload.contract_end,work_performance_locations:i.payload.work_performance_locations,
        notice:i.payload.sam_notice_evidence?.record,award:i.payload.sam_api_evidence?.latest_action})),
      captures:runs.map(r=>({run_id:r.run_id,kind:r.kind,filters:r.filters,query_url:r.query_url})),
      next_action:automatic.next_action};
  }
  async function automaticStatus(c,samJob) {
    const job=c.automatic_import_job_id?await one(db,'procurement_jobs',c.automatic_import_job_id):null;
    const receipt=job?.checkpoint?.receipt,counts=receipt?.verified?receipt.counts:null;
    return {canonical_writes:counts?(counts.actual_new_leads??0)+(counts.evidence_updates??0):0,
      automatic:{job_id:job?.id??null,state:job?.state??(c.automatic_completed?'succeeded':samJob?.state==='blocked'?'blocked':'pending'),stage:job?.checkpoint?.stage??'sam_validate',
        added:counts?.actual_new_leads??0,updated:counts?.evidence_updates??0,unchanged:counts?Math.max(0,counts.actual_processed-counts.actual_new_leads-counts.evidence_updates):0,
        exclusions:c.automatic_exclusions??[],verified:Boolean(receipt?.verified||c.automatic_completed),
        partial:!c.terminal_confirmed,collection_blocker:c.collection_blocker??null,can_continue:!c.automatic_import_job_id&&!c.automatic_completed&&samJob?.state==='blocked'},
      next_action:!job&&!c.automatic_completed&&samJob?.state==='blocked'?'Continue automatic saving of these saved results without a new search':job?.state==='succeeded'||c.automatic_completed?'View saved leads and validation results':job?.state==='blocked'||job?.state==='outcome_unknown'?'Automatic saving stopped; inspect saved evidence or reconcile the database result':'SAM results are being validated and saved automatically'};
  }
  async function savedRuns(c) {
    if(!c.capture_artifacts?.length)throw new Error('Saved SAM page evidence required');
    const runs=[];
    for(const artifact of c.capture_artifacts) {
      const capture=JSON.parse((await artifacts.get(artifact)).toString());
      const audit=await one(db,'procurement_runs',capture.run_id);
      if(!audit||!c.run_ids.includes(audit.id)||hash(audit.detail.response)!==hash(capture.response)||
        audit.detail.collector!=='sam-search'||audit.detail.kind!==capture.kind||audit.detail.upstream_status!==200||
        audit.detail.query_url!==capture.query_url||hash(audit.detail.filters)!==hash(capture.filters))
        throw new Error('SAM capture does not match its saved audit');
      runs.push(capture);
    }
    collectRuns(runs,c.run_ids,{allow_partial:!c.terminal_confirmed});return runs;
  }
  async function stage(c) {
    const runs=await savedRuns(c),collection=collectRuns(runs,c.run_ids,{allow_partial:!c.terminal_confirmed});
    const sources=await rows(db,'procurement_sources',q=>q.in('code',['sam','sam-awards']));
    const source=code=>{const match=sources.find(s=>s.code===code);if(!match)throw new Error('SAM registry missing');return match.id;};
    if(collection.awards.size&&!c.link_artifact)c.link_artifact=await artifacts.put(await resolveSamAwardLinks(collection,{fetcher:(...args)=>auditPhase('revalidate',()=>fetcher(...args),{reason:'award_link'})}));
    const awardLinks=c.link_artifact?JSON.parse((await artifacts.get(c.link_artifact)).toString()):{};
    const items=samIntakeRows(collection,source,(sourceId,identity,row)=>({
      external_id:`${identity}@${hash({row,run_ids:c.run_ids}).slice(0,24)}`,metadata:{routed_capture:{record_identity:identity}}}),awardLinks);
    const ids=[];
    for(const item of items) {
      checked(await db.from('procurement_intake_items').upsert(item,{onConflict:'source_id,external_id',ignoreDuplicates:true}));
      const saved=(await rows(db,'procurement_intake_items',q=>q.eq('source_id',item.source_id).eq('external_id',item.external_id)))[0];
      if(!saved||hash(saved.payload)!==hash(item.payload))throw new Error('SAM candidate differs from immutable saved evidence; review existing intake');
      ids.push(saved.id);
    }
    c.intake_ids=ids;c.stage='sam_review';c.next_action='Review persisted statewide SAM candidates and prepare an exact import package';
  }
  async function submit(input,actor,key) {
    if(!['opportunity','award'].includes(input.category) || !/^[A-Za-z0-9_-]{8,100}$/.test(key??''))
      throw new Error('Separate opportunity/award SAM request and idempotency key required; forecasts use agency sources');
    const {publication_window:window,filters}=samRequest(input);
    const id=checked(await db.rpc('submit_procurement_sam_request',{p_actor:actor,p_key:key,p_hash:hash(input),p_kind:input.category,
      p_window:{...window,date_basis:'publication'},p_filters:filters}));
    return {request_id:id,state:'pending',statewide_sam:{separate:true,included_in_geography_coverage:false},
      next_action:'Read request status; valid SAM results are automatically saved after validation'};
  }
  async function consume(c,save,data,ok) {
    if(data.run_id) {
      const run=await one(db,'procurement_runs',data.run_id);
      if(!run || run.detail?.collector!=='sam-search'||c.request_job_id&&
        (run.job_id!==c.request_job_id||run.detail.workflow_attempt_id!==c.request_attempt_id||hash(run.detail.filters)!==hash(c.filters)))throw new Error('SAM audit readback failed');
      if(!ok||run.detail.upstream_status!==200){
        c.failed_capture_run_id=data.run_id;c.collection_blocker='A later SAM page was not successful; only earlier audited pages can be saved.';
        if(c.capture_artifacts?.length){c.stage='sam_stage';c.terminal_confirmed=false;await save('pending');}
        else {c.next_action='SAM provider response was not successful; inspect saved access diagnostics';await save('blocked');}
        return;
      }
      c.run_ids=[...new Set([...(c.run_ids??[]),data.run_id])];c.capture_artifact=await artifacts.put(data);
      c.capture_artifacts=[...new Set([...(c.capture_artifacts??[]),c.capture_artifact])];
    }
    const assessment=inspectSamCapture(data,c.kind==='award'?'awards':'opportunities',100,c.filters.offset);
    if(!ok || ['partial','blocked','outcome_unknown'].includes(assessment.state)) {
      c.next_action=assessment.reason??'SAM capture incomplete; inspect saved audit';await save('blocked');return;
    }
    c.pages=(c.pages??0)+1;c.records=(c.records??0)+assessment.count;
    if(assessment.state==='next_page' && c.pages<10) {
      c.filters={...c.filters,offset:c.filters.offset+1};c.stage='sam_collect';await save('pending');return;
    }
    c.stage='sam_stage';c.terminal_confirmed=assessment.state==='complete';
    c.next_action=c.terminal_confirmed?'Automatically validate and save captured SAM results':
      'SAM page bound reached; partial capture is not complete statewide coverage';
    await save('pending');
  }
  async function reconcile(requestId,actor) {
    const job=(await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId))).find(j=>j.dedupe_key===`api-sam:${requestId}`);
    if(job?.state!=='outcome_unknown'||job.checkpoint?.stage!=='sam_reconcile'||!job.checkpoint.request_attempt_id)
      throw Error('Matching uncertain SAM attempt required; no automatic resend');
    const c={...job.checkpoint};
    const matches=(await rows(db,'procurement_runs',q=>q.eq('job_id',job.id).eq('page_index',c.filters.offset)))
      .filter(r=>r.detail?.workflow_attempt_id===c.request_attempt_id&&r.detail?.kind===(c.kind==='award'?'awards':'opportunities')&&hash(r.detail.filters)===hash(c.filters));
    if(matches.length!==1||matches[0].detail.state!=='response_captured'||matches[0].detail.upstream_status!==200)
      throw Error('SAM audit does not prove one successful response; retain uncertainty and inspect private diagnostics');
    const run=matches[0];let state;
    await consume(c,s=>{state=s;},{run_id:run.id,captured:true,status:run.status,record_count:run.record_count,...run.detail},true);
    c.reconciled_by=actor;
    const changed=checked(await db.from('procurement_jobs').update({checkpoint:c,state,lease_token:null,lease_until:null,updated_at:new Date().toISOString()})
      .eq('id',job.id).eq('updated_at',job.updated_at).eq('state','outcome_unknown').select('id'));
    if(changed.length!==1)throw Error('SAM reconciliation changed concurrently; reread saved status');
    return {request_id:requestId,state,next_action:c.next_action};
  }
  async function processSaved(requestId) {
    const job=(await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId))).find(j=>j.dedupe_key===`api-sam:${requestId}`);
    if(job?.checkpoint?.stage!=='sam_review')throw Error('Saved staged SAM results required; collection is not restarted');
    const request=await one(db,'procurement_search_requests',requestId);
    if(request.workflow_control?.cancelled)throw Error('Cancelled SAM request cannot process');
    const link=(await rows(db,'procurement_trigger_requests',q=>q.eq('request_id',requestId)))[0];
    if(link){const parent=await one(db,'procurement_triggers',link.trigger_id);
      if(parent.state==='cancelled'||parent.origin==='scheduled'&&!checked(await db.rpc('procurement_scheduled_trigger_runnable',{p_id:parent.id})))throw Error('Paused or cancelled SAM work cannot process');}
    if(job.checkpoint.automatic_import_job_id||job.checkpoint.automatic_completed||['pending','running'].includes(job.state))return {request_id:requestId,state:job.state};
    if(job.state!=='blocked')throw Error('Only saved staged SAM results can continue');
    const changed=checked(await db.from('procurement_jobs').update({state:'pending',updated_at:new Date().toISOString()}).eq('id',job.id).eq('updated_at',job.updated_at).eq('state','blocked').select('id'));
    if(changed.length!==1)throw Error('SAM processing changed concurrently; read saved results');
    return {request_id:requestId,state:'pending'};
  }
  async function step(job,c,save) {
    if(c.stage==='sam_review') {
      if(!automaticImport){await save('blocked');return;}
      if(!c.automatic_import_job_id&&!c.automatic_completed){
        const result=await automaticImport(job.search_request_id);
        c.automatic_import_job_id=result.job_id;c.automatic_exclusions=result.exclusions;
        c.automatic_completed=!result.job_id;
      }
      c.next_action='SAM results are saved automatically after validation';await save('succeeded');return;
    }
    if(c.stage==='sam_stage') {await auditPhase('stage',()=>stage(c));await save(automaticImport?'pending':'blocked');return;}
    if(!['sam_collect','sam_reconcile'].includes(c.stage))throw new Error('Unknown SAM checkpoint');
    if(c.stage==='sam_reconcile') {c.next_action='Inspect SAM audit runs for this saved attempt before resending';await save('outcome_unknown');return;}
    if(validateCollection)await validateCollection();
    c.stage='sam_reconcile';c.attempted_at=new Date().toISOString();c.request_attempt_id=randomUUID();c.request_job_id=job.id;await save('running');
    const key=serverKey();
    let response,data;
    try {
      response=await auditPhase('fetch_api_page',()=>fetcher(`https://${project}.supabase.co/functions/v1/sam-search`,{method:'POST',
        headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({kind:c.kind==='award'?'awards':'opportunities',filters:c.filters,
          workflow_execution:{job_id:job.id,lease_token:job.lease_token,page_index:c.filters.offset,attempt_id:c.request_attempt_id}}),
        signal:AbortSignal.timeout(100000)}),{reason:c.kind});
      data=await response.json();
    }catch(error) {
      if(error.code==='schedule_paused'){c.stage='sam_collect';delete c.attempted_at;await save('pending');throw error;}
      c.next_action='SAM request outcome unknown; inspect saved procurement_runs audit before retry';await save('outcome_unknown');return;
    }
    if(JSON.stringify(data).includes(key))throw new Error('SAM response failed private credential validation');
    try {await consume(c,save,data,response.ok);}
    catch {
      c.stage='sam_reconcile';c.next_action='SAM response persistence needs reconciliation against the saved audit before another request';
      await save('outcome_unknown');
    }
  }
  return {submit,step,savedRuns,packet,reconcile,history,processSaved};
}
