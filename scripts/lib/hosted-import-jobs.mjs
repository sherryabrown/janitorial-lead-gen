import { checked,rows,one } from './hosted-store.mjs';
import { hash } from './reviewed-batch.mjs';
import { prepareImport,applyImport,importSnapshot } from './hosted-import.mjs';
import { verifyBatch } from './batch-verification.mjs';
import {rehearsalPolicy} from './native-sql-rehearsal.mjs';
export function importJobs({db,project,transport,artifacts,samSavedRuns,rehearse}) {
  async function lookup(id) {
    const job=await one(db,'procurement_jobs',id);
    if(!job?.dedupe_key.startsWith('api-import:'))throw new Error('Import job required');return job;
  }
  async function prepare(requestId,review,actor) {
    if(!transport||!rehearse)throw new Error('Reviewed PostgreSQL import and native rehearsal transports required');
    if(review.request_id!==requestId || review.project_ref!==project)throw new Error('Review request/project mismatch');
    const interpretations=await rows(db,'procurement_interpretations',q=>q.eq('request_id',requestId).eq('is_current',true));
    const eligible=new Set(interpretations.flatMap(i=>i.staging_receipt?.intake_ids??[]));
    let runs=[];
    if(review.run_ids?.length) {
      const samJobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId));
      const samJob=samJobs.find(j=>j.dedupe_key?.startsWith('api-sam:')&&j.checkpoint?.stage==='sam_review');
      if(!samJob||!samSavedRuns||hash([...review.run_ids].sort())!==hash([...(samJob.checkpoint.run_ids??[])].sort()))
        throw new Error('Review must bind this separate statewide SAM request and its exact saved runs');
      for(const id of samJob.checkpoint.intake_ids??[])eligible.add(id);
      runs=await samSavedRuns(samJob.checkpoint);
    }
    if(!review.decisions?.length || review.decisions.some(d=>!eligible.has(d.intake_id)))throw new Error('Review must select persisted current candidates for this request');
    const dedupe=`api-import:${requestId}:${hash({...review,reviewed_by:actor,validation_policy:rehearsalPolicy})}`;
    checked(await db.from('procurement_jobs').upsert({search_request_id:requestId,dedupe_key:dedupe,kind:'process',
      checkpoint:{stage:'import_prepare',actor_id:actor,review,runs_artifact:runs.length?await artifacts.put(runs):null}},{onConflict:'dedupe_key',ignoreDuplicates:true}));
    const job=(await rows(db,'procurement_jobs',q=>q.eq('dedupe_key',dedupe)))[0];
    return {job_id:job.id,state:job.state,next_action:'Read import job status; approve the exact tested hash when ready'};
  }
  async function status(id) {
    const job=await lookup(id),c=job.checkpoint;
    return {job_id:id,request_id:job.search_request_id,state:job.state,stage:c.stage,
      approval_sha256:c.approval_sha256??null,summary:c.summary??null,test:c.test??null,
      receipt:c.receipt??null,next_action:c.next_action??null};
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
    checked(await db.from('procurement_jobs').update({state:'succeeded',checkpoint:{...c,stage:'import_verified',receipt,
      reconciled_by:actor,next_action:'Review imported leads'}}).eq('id',id).eq('updated_at',job.updated_at));
    return status(id);
  }
  async function step(job,c,save) {
    if(c.stage==='import_prepare') {
      const runs=c.runs_artifact?JSON.parse((await artifacts.get(c.runs_artifact)).toString()):[];
      Object.assign(c,await prepareImport({db,project,transport,artifacts,review:c.review,actor:c.actor_id,runs,rehearse}));
      c.package_artifact=c.artifact;delete c.artifact;delete c.review;
      c.stage='import_awaiting_approval';c.next_action='Approve the exact tested batch hash';await save('blocked');
    } else if(c.stage==='import_apply') {
      const p=JSON.parse((await artifacts.get(c.package_artifact)).toString());
      c.stage='import_reconcile';c.next_action='If interrupted, reconcile live readback before any retry';
      await save('running');
      c.receipt=await applyImport({db,project,transport,artifacts,packageData:p,approval:c.approval_sha256});
      c.stage='import_verified';c.next_action='Review imported leads';await save('succeeded');
    } else {c.next_action='Reconcile saved import outcome before retry';await save('outcome_unknown');}
  }
  return {prepare,status,approve,reconcile,step};
}
