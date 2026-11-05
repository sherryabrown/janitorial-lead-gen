import {rows,one,checked} from './hosted-store.mjs';
import {verifiedRunOutcomes,identitySnapshot} from './reporting-identities.mjs';
import {verifiedLeadCounts,verifiedCategoryCounts} from './schedule-reporting.mjs';
import {canonicalReportingJobs} from './canonical-reporting.mjs';
import {hash} from './reviewed-batch.mjs';

// Reduce only persisted verified evidence. Original receipts are never rewritten.
export function runResultProjection(run,jobs,usage=[]){
 const result=verifiedRunOutcomes(run,jobs);
 const relevant=jobs.filter(j=>j.checkpoint?.automatic||j.checkpoint?.stage?.startsWith('import_'));
 const settled=run.state==='completed'&&!jobs.some(j=>['pending','running','partial','outcome_unknown'].includes(j.state)||j.kind==='collect'&&j.state!=='succeeded')
  &&!relevant.some(j=>j.state!=='succeeded'||!j.checkpoint?.receipt?.verified)&&!usage.some(u=>['reserved','outcome_unknown'].includes(u.state));
 const applicable=run.config?.check_updates!==false;
 const complete=applicable&&settled&&result.complete;
 const records=result.records.map(r=>({...r,categories:[...r.categories].sort(),historical:!!r.historical})).sort((a,b)=>a.id.localeCompare(b.id));
 const leads=verifiedLeadCounts(run,jobs),categories=verifiedCategoryCounts(run,jobs);
 if(applicable&&!settled){
  Object.assign(leads,{added:null,updated:null,unchanged:null,completeness:'unknown',reason:'Run results are not fully verified'});
  Object.assign(categories,{forecast:null,opportunity:null,award:null,historical_opportunity:null,completeness:'unknown'});
 }
 return {records,result:{complete,category_complete:complete&&result.categoryComplete,
  completeness:!applicable?'not_applicable':complete?'known':records.length?'partial':'unknown',
  known_subtotal:records.length,resolved_intake_ids:[...result.resolved].sort(),
  identity_snapshot:identitySnapshot(records),leads,categories}};
}
export async function persistRunResult(db,id){
 const run=await one(db,'procurement_triggers',id);if(!run)throw Error('Run unavailable');
 const children=await rows(db,'procurement_trigger_requests',q=>q.eq('trigger_id',id),'request_id');
 const requestIds=[...new Set(children.map(c=>c.request_id))],jobs=[];
 for(let n=0;n<requestIds.length;n+=50)jobs.push(...await rows(db,'procurement_jobs',q=>q.in('search_request_id',requestIds.slice(n,n+50)),'id,search_request_id,task_id,kind,state,dedupe_key,updated_at,checkpoint'));
 const normalized=await canonicalReportingJobs(db,jobs);
 const usage=await rows(db,'procurement_usage_ledger',q=>q.eq('trigger_id',id),'id,state');
 const {result,records}=runResultProjection(run,normalized,usage);
 const revision=hash({source_version:run.reporting_source_version,result,records});
 return checked(await db.rpc('procurement_publish_run_result',{p_trigger:id,p_source_version:run.reporting_source_version,p_revision:revision,p_result:result,p_members:records}));
}
export async function persistPendingRunResults(db,{limit=5,onError=()=>{}}={}){
 const ids=checked(await db.rpc('procurement_pending_run_results',{p_limit:limit}));
 const result=[];
 for(const id of ids)try{result.push({id,...await persistRunResult(db,id)});}catch{
  onError(id);
  // Preserve prior facts and execution state; do not starve unattempted runs.
  try{checked(await db.rpc('procurement_defer_run_result',{p_trigger:id}));}catch{/* Database recovery may also be unavailable. */}
 }
 return result;
}
