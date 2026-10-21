import {auditPhase} from './workflow-audit.mjs';
import { checked,rows,one,publicJobAction } from './hosted-store.mjs';
import { hash } from './reviewed-batch.mjs';
import { prepareImport,applyImport,importSnapshot } from './hosted-import.mjs';
import { verifyBatch } from './batch-verification.mjs';
import {automaticSamReview,samAutomaticPolicy} from './sam-automatic-import.mjs';
import {rehearsalPolicy} from './native-sql-rehearsal.mjs';
import {countyAuthority,automaticCountyReview,countyAutomaticPolicy,countyImportStatus} from './county-automatic-import.mjs';
import {verifiedReportingRecords} from './verified-reporting-records.mjs';
const automaticPolicy=p=>[samAutomaticPolicy,countyAutomaticPolicy].includes(p);
export function importJobs({db,project,transport,artifacts,samSavedRuns,rehearse,countyEvidence}) {
  async function lookup(id) {
    const job=await one(db,'procurement_jobs',id);
    if(!job?.dedupe_key.startsWith('api-import:'))throw new Error('Import job required');return job;
  }
  async function prepareInternal(requestId,review,actor,automatic=null) {
    if(!transport||!rehearse)throw new Error('Reviewed PostgreSQL import and native rehearsal transports required');
    if(review.request_id!==requestId || review.project_ref!==project)throw new Error('Review request/project mismatch');
    const interpretations=await rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId).eq('is_current',true));
    const eligible=new Set(interpretations.flatMap(i=>i.staging_receipt?.intake_ids??[]));
    const samJobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId));
    if(samJobs.some(j=>j.dedupe_key?.startsWith('api-sam:'))&&!review.run_ids?.length)
      throw Error('Review must bind this separate statewide SAM request and its exact saved runs');
    let runs=[];
    if(review.run_ids?.length) {
      const samJob=samJobs.find(j=>j.dedupe_key?.startsWith('api-sam:')&&j.checkpoint?.stage==='sam_review');
      if(!samJob||!samSavedRuns||hash([...review.run_ids].sort())!==hash([...(samJob.checkpoint.run_ids??[])].sort()))
        throw new Error('Review must bind this separate statewide SAM request and its exact saved runs');
      for(const id of samJob.checkpoint.intake_ids??[])eligible.add(id);
      runs=await samSavedRuns(samJob.checkpoint);
    }
    if(!review.decisions?.length || review.decisions.some(d=>!eligible.has(d.intake_id)))throw new Error('Review must select persisted current candidates for this request');
    const dedupe=automatic?`api-import:${requestId}:auto:${automatic.key}`:`api-import:${requestId}:${hash({...review,reviewed_by:actor,validation_policy:rehearsalPolicy})}`;
    checked(await db.from('procurement_jobs').upsert({search_request_id:requestId,dedupe_key:dedupe,kind:'process',
      checkpoint:{stage:'import_prepare',actor_id:actor,...(automatic?{automatic}:{}),review,runs_artifact:runs.length?await artifacts.put(runs):null}},{onConflict:'dedupe_key',ignoreDuplicates:true}));
    const job=(await rows(db,'procurement_jobs',q=>q.eq('dedupe_key',dedupe)))[0];
    return {job_id:job.id,state:job.state,next_action:'Read import job status; approve the exact tested hash when ready'};
  }
  async function assertAutomaticCollectable() {
    const jobs=await rows(db,'procurement_jobs',q=>q.like('dedupe_key','api-import:%').in('state',['blocked','outcome_unknown']),'id,state,checkpoint');
    if(jobs.some(j=>j.checkpoint?.automatic?.policy===samAutomaticPolicy&&j.checkpoint?.stage==='import_reconcile'))
      {const error=Error('Reconcile the saved uncertain SAM import before collecting or saving another SAM result');error.code='sam_import_reconciliation_required';throw error;}
  }
  async function prepare(requestId,review,actor) {return prepareInternal(requestId,review,actor);}
  async function countyPolicy(requestId,selected=null) {
    const request=await one(db,'procurement_search_requests',requestId);
    if(!countyEvidence||!await countyAuthority(db,request))throw Error('Active confirmed county collection required');
    const current=await rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId).eq('is_current',true));
    const ids=[...new Set(current.flatMap(i=>i.staging_receipt?.intake_ids??[]))].filter(id=>!selected||selected.includes(id));
    if(selected&&ids.length!==selected.length)throw Error('Current county candidates changed');
    const candidates=ids.length?await rows(db,'procurement_intake_items',q=>q.in('id',ids)):[];
    if(candidates.length!==ids.length)throw Error('County candidate readback incomplete');
    const evidence=await countyEvidence(requestId,candidates);
    const snapshot=await importSnapshot(db,project,{request_id:requestId,decisions:candidates.map(i=>({intake_id:i.id}))});
    return {request,...automaticCountyReview({request,candidates,...evidence,snapshot})};
  }
  async function prepareCounty(requestId) {
    const request=await one(db,'procurement_search_requests',requestId);
    if(!countyEvidence||!await countyAuthority(db,request))return null;
    const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId));
    const imports=jobs.filter(j=>j.dedupe_key?.startsWith('api-import:'));
    if(imports.some(j=>['pending','running','outcome_unknown'].includes(j.state)||j.checkpoint.stage==='import_reconcile'))return countyImportStatus(jobs);
    const policy=await countyPolicy(requestId);
    const existing=imports.find(j=>j.checkpoint.automatic?.policy===countyAutomaticPolicy&&j.checkpoint.automatic.key===policy.key);
    if(existing)return countyImportStatus(jobs);
    // An unresolved write for the same source/record in another request is a hold.
    const holds=await rows(db,'procurement_jobs',q=>q.like('dedupe_key','api-import:%').in('state',['running','blocked','outcome_unknown']));
    for(const hold of holds.filter(j=>j.checkpoint.stage==='import_reconcile')) {
      if(!hold.checkpoint.package_artifact)throw Error('Import outcome requires reconciliation');
      const p=JSON.parse(await artifacts.get(hold.checkpoint.package_artifact));
      const snapshot=await importSnapshot(db,project,policy.review),candidateIds=new Set(policy.review.decisions.map(d=>d.intake_id));
      if(p.manifest.records.some(r=>snapshot.procurement_intake_items.some(i=>candidateIds.has(i.id)&&i.source_id===r.source_id&&(i.payload.manual_capture?.record_external_id??i.external_id)===r.external_id)))throw Error('Matching import outcome requires reconciliation');
    }
    if(!policy.review.decisions.length){
      // Persist the no-write result so exceptions and empty validation are durable.
      const dedupe=`api-import:${requestId}:auto:${policy.key}`;
      checked(await db.from('procurement_jobs').upsert({search_request_id:requestId,dedupe_key:dedupe,kind:'process',state:'succeeded',checkpoint:{stage:'import_verified',automatic:{policy:countyAutomaticPolicy,key:policy.key,exclusions:policy.exclusions},receipt:{verified:true,counts:{}},county_records:[]}},{onConflict:'dedupe_key',ignoreDuplicates:true}));
    }else await prepareInternal(requestId,policy.review,policy.request.initiated_by,{policy:countyAutomaticPolicy,key:policy.key,exclusions:policy.exclusions});
    return countyImportStatus(await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId)));
  }
  // Internal worker entry point only; no HTTP flag can grant automatic authority.
  async function prepareAutomatic(requestId) {
    await assertAutomaticCollectable();
    const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId));
    const sam=jobs.find(j=>j.dedupe_key===`api-sam:${requestId}`&&j.checkpoint?.stage==='sam_review');
    if(!sam||!samSavedRuns)throw Error('Saved SAM processing context required');
    const prior=jobs.find(j=>j.checkpoint?.automatic?.policy===samAutomaticPolicy);
    if(jobs.some(j=>j.id!==prior?.id&&j.dedupe_key?.startsWith('api-import:')&&
      (['pending','running','outcome_unknown'].includes(j.state)||j.checkpoint?.stage==='import_reconcile')))
      throw Error('Existing import must finish or reconcile before automatic SAM processing');
    if(prior)return {job_id:prior.id,exclusions:prior.checkpoint.automatic.exclusions};
    const request=await one(db,'procurement_search_requests',requestId);
    if(request.workflow_control?.cancelled)throw Error('Cancelled SAM request cannot process');
    const runs=await samSavedRuns(sam.checkpoint);
    const candidates=sam.checkpoint.intake_ids?.length?await rows(db,'procurement_intake_items',q=>q.in('id',sam.checkpoint.intake_ids)):[];
    if(candidates.length!==(sam.checkpoint.intake_ids??[]).length)throw Error('Saved SAM intake readback incomplete');
    if(!candidates.length)return {job_id:null,exclusions:[]};
    const baselineReview={request_id:requestId,decisions:candidates.map(i=>({intake_id:i.id}))};
    const snapshot=await importSnapshot(db,project,baselineReview);
    const policy=await auditPhase('prepare',()=>automaticSamReview({request,candidates,runs,snapshot,partial:!sam.checkpoint.terminal_confirmed}));
    if(!policy.review.decisions.length)return {job_id:null,exclusions:policy.exclusions};
    const automatic={key:policy.key,policy:samAutomaticPolicy,exclusions:policy.exclusions};
    return {...await prepareInternal(requestId,policy.review,request.initiated_by,automatic),exclusions:policy.exclusions};
  }
  async function status(id) {
    const job=await lookup(id),c=job.checkpoint;
    return {job_id:id,request_id:job.search_request_id,state:job.state,stage:c.stage,
      approval_sha256:c.approval_sha256??null,summary:c.summary??null,test:c.test??null,
      receipt:c.receipt??null,automatic:c.automatic?{policy:c.automatic.policy,exclusions:c.automatic.exclusions}:null,next_action:publicJobAction(job),error_code:c.error_code??null,diagnostic_id:c.diagnostic_id??null};
  }
  async function approve(id,input,actor) {
    const job=await lookup(id),c=job.checkpoint;
    if(c.stage==='import_verified')return status(id);
    if(c.stage!=='import_awaiting_approval' || input.approval_sha256!==c.approval_sha256)throw new Error('Exact tested approval required');
    const p=JSON.parse((await artifacts.get(c.package_artifact)).toString());
    if(p.version!==2||p.policy!==rehearsalPolicy)throw new Error('Reprepare this batch under the native rehearsal policy before approving');
    const changed=checked(await db.from('procurement_jobs').update({state:'pending',checkpoint:{...c,stage:'import_apply',approved_by:actor,
      approved_at:new Date().toISOString()}}).eq('id',id).eq('updated_at',job.updated_at).eq('state','blocked').select('id'));
    if(changed.length!==1)throw new Error('Import approval changed concurrently; reread status');
    return status(id);
  }
  async function reconcile(id,_input,actor) {
    const job=await lookup(id),c=job.checkpoint;
    if(c.stage!=='import_reconcile')throw new Error('No uncertain import to reconcile');
    const p=JSON.parse((await artifacts.get(c.package_artifact)).toString());
    const after=await importSnapshot(db,project,p.review,p.manifest),receipt=verifyBatch(p.before,after,p.manifest);
    if(!receipt.verified)throw new Error('Uncertain import did not verify; inspect baseline and affected records before retry');
    checked(await db.from('procurement_jobs').update({state:'succeeded',checkpoint:{...c,stage:'import_verified',receipt,reporting_records:verifiedReportingRecords(p.manifest),
      ...(c.automatic?.policy===countyAutomaticPolicy?{county_records:p.manifest.records.map(r=>({id:r.id,intake_ids:p.manifest.decisions.filter(d=>d.lead_id===r.id).map(d=>d.intake.id),added:!r.expected_payload,updated:!!r.expected_payload&&hash(r.payload)!==hash(r.expected_payload)}))}:{}),
      reconciled_by:actor,next_action:'Review imported leads'}}).eq('id',id).eq('updated_at',job.updated_at));
    return status(id);
  }
  async function step(job,c,save) {
    if(c.stage==='import_prepare') {
      const runs=c.runs_artifact?JSON.parse((await artifacts.get(c.runs_artifact)).toString()):[];
      Object.assign(c,await prepareImport({db,project,transport,artifacts,review:c.review,actor:c.automatic?`system:${c.automatic.policy}`:c.actor_id,runs,rehearse}));
      c.package_artifact=c.artifact;delete c.artifact;delete c.review;
      if(automaticPolicy(c.automatic?.policy)){
        c.stage='import_apply';c.authorization={kind:c.automatic.policy===countyAutomaticPolicy?'automatic_county_policy':'automatic_sam_policy',policy:c.automatic.policy,tested_sha256:c.approval_sha256};
        c.next_action='Automatically saving validated results';await save('pending');
      }else{c.stage='import_awaiting_approval';c.next_action='Approve the exact tested batch hash';await save('blocked');}
    } else if(c.stage==='import_apply') {
      const p=JSON.parse((await artifacts.get(c.package_artifact)).toString());
      if(c.automatic?.policy===samAutomaticPolicy)await assertAutomaticCollectable();
      if(c.automatic&&(!automaticPolicy(c.automatic.policy)||c.authorization?.tested_sha256!==c.approval_sha256||
        c.authorization.kind!==(c.automatic.policy===countyAutomaticPolicy?'automatic_county_policy':'automatic_sam_policy')||
        p.review.authorization?.kind!==c.authorization.kind||
        p.review.authorization?.version!==c.automatic.policy||p.review.request_id!==job.search_request_id))
        throw Error('Exact automatic policy/package context required');
      c.stage='import_reconcile';c.next_action='If interrupted, reconcile live readback before any retry';
      await save('running');
      let sent=false;
      try {
        if(c.automatic?.policy===countyAutomaticPolicy){
          const policy=await countyPolicy(job.search_request_id);
          if(hash(policy.review.authorization)!==hash(p.review.authorization)||hash(policy.review.decisions)!==hash(p.review.decisions))throw Error('County evidence or identity changed before send');
        }
        c.receipt=await applyImport({db,project,transport,artifacts,packageData:p,approval:c.approval_sha256,revalidateBaseline:Boolean(c.automatic),beforeSend:()=>{sent=true;}});
      }
      catch(error){
        if(c.automatic&&!sent){
          if(error.code==='schedule_paused'){c.stage='import_apply';await save('pending');throw error;}
          if((c.reprepare_count??0)<1){
            c.previous_packages=[...(c.previous_packages??[]),c.package_artifact];c.reprepare_count=(c.reprepare_count??0)+1;
            if(c.automatic.policy===countyAutomaticPolicy){
              let policy;try{policy=await countyPolicy(job.search_request_id);}catch{c.stage='import_precondition_failed';await save('blocked');return;}
              if(!policy.review.decisions.length){c.stage='import_precondition_failed';c.automatic.exclusions=policy.exclusions;await save('blocked');return;}
              c.review=policy.review;
            }else c.review=p.review;
            c.runs_artifact=await artifacts.put(p.runs??[]);c.stage='import_prepare';
            c.next_action='Revalidating changed import inputs before any database write';await save('pending');return;
          }
          c.stage='import_precondition_failed';c.next_action='Automatic write did not start; saved inputs or schema need correction';await save('blocked');return;
        }
        throw error;
      }
      if(c.automatic?.policy===countyAutomaticPolicy)c.county_records=p.manifest.records.map(r=>({id:r.id,intake_ids:p.manifest.decisions.filter(d=>d.lead_id===r.id).map(d=>d.intake.id),added:!r.expected_payload,updated:!!r.expected_payload&&hash(r.payload)!==hash(r.expected_payload)}));
      if(c.receipt?.verified)c.reporting_records=verifiedReportingRecords(p.manifest);
      c.stage='import_verified';c.next_action='Review imported leads';await save('succeeded');
    } else {c.next_action='Reconcile saved import outcome before retry';await save('outcome_unknown');}
  }
  return {prepare,prepareCounty,prepareAutomatic,assertAutomaticCollectable,status,approve,reconcile,step};
}
