import {rows} from './hosted-store.mjs';
import {countyImportStatus} from './county-automatic-import.mjs';
import {usageSummary} from './workflow-audit.mjs';

const gaps=new Set(['source_missing','method_missing','partial','blocked']);
// Avoid loading cached interpretation/project bodies for each Activity row.
const jobColumns='id,search_request_id,task_id,kind,state,dedupe_key,updated_at,c_stage:checkpoint->>stage,c_error:checkpoint->>error_code,c_task:checkpoint->>task_id,c_automatic:checkpoint->automatic,c_receipt:checkpoint->receipt,c_records:checkpoint->county_records,c_blocker:checkpoint->>blocker,c_hosted:checkpoint->hosted_browser_attempt,c_holds:checkpoint->bonfire_access_holds,c_failures:checkpoint->verification_failures,c_details:checkpoint->bonfire_details';
const latest=jobs=>[...jobs].sort((a,b)=>(b.updated_at??'').localeCompare(a.updated_at??'')||b.id.localeCompare(a.id))[0];
export function taskJobs(task,jobs){return jobs.filter(j=>j.task_id===task.id||j.checkpoint?.task_id===task.id);}
export function discoveryJob(task,jobs){return latest(taskJobs(task,jobs).filter(j=>j.kind==='discover'));}

// Only fixed public copy crosses this boundary; saved error strings are untrusted.
export function sourceAttention(task,jobs){
 if(!gaps.has(task.state))return null;
 const related=taskJobs(task,jobs),job=latest(related),c=job?.checkpoint??{};
 const make=(kind,blocker,next_action,action_kind='evidence')=>({kind,blocker,next_action,action_kind});
 if(related.some(j=>['pending','running','outcome_unknown'].includes(j.state)))return null;
 if(c.error_code)return make('diagnostic','This source check stopped with a workflow error.','Inspect the saved diagnostic before resuming.');
 if(c.hosted_browser_attempt?.failure_code==='human_verification_required'||c.bonfire_access_holds?.length)
  return make('manual_action','Portal access or human verification is required.','Review the saved access requirement; verification may need a person.');
 const detailJob=latest(jobs.filter(j=>j.checkpoint?.bonfire_details?.[task.id]&&j.checkpoint.bonfire_details[task.id].source_id===task.source_id));
 const details=detailJob?.checkpoint?.bonfire_details?.[task.id];
 if(details?.projects?.some(p=>!p.evidence?.length)){
  if(['pending','running','outcome_unknown'].includes(detailJob.state))return null;
  return make('details','Project details have not been captured or verified.','View saved portal evidence; project detail access or collection support needs verification.');
 }
 const reason=typeof c.blocker==='string'?c.blocker:typeof task.evidence?.reason==='string'?task.evidence.reason:typeof task.reason==='string'?task.reason:'';
 const http=reason.match(/^HTTP (\d{3})$/)?.[1];
 if(http&&['401','403'].includes(http))return make('access','The website denied access (HTTP '+http+').','View saved evidence to determine the access requirement.');
 if(http&&(['408','429'].includes(http)||Number(http)>=500)||reason==='Network request failed or timed out'){
  const discovery=discoveryJob(task,jobs);
  const retry=discovery?.state==='blocked'&&discovery.checkpoint?.automation_policy==='county-public-v1'&&['discovery_resolve','discovery_capture','discovery_verify'].includes(discovery.checkpoint.stage);
  return make('unavailable',http?'The website did not complete the check (HTTP '+http+').':'The website request failed or timed out.',retry?'Retry the source check or view saved evidence.':'View saved evidence; the website may be temporarily unavailable.',retry?'retry':'evidence');
 }
 if(reason==='Document exceeds verified byte bound'||/^(Response (?:body )?(?:exceeds|exceeded)|Declared response|Page bound reached|ARDOT (?:page bound|reported total exceeds))/.test(reason))
  return make('limit','Collection exceeded the supported size or page limit.','View saved evidence; a developer needs to adjust collection support.');
 if(reason.startsWith('Unsupported content type:'))return make('automation','This content format is not supported by the collector.','View saved evidence; a developer needs to add collection support.');
 if(task.state==='source_missing')return make('source_missing','No usable official source has been verified.','View checked evidence; manual research is needed to identify the official procurement channel.');
 if(task.state==='method_missing'||c.verification_failures?.includes('No supported opportunity listing heading'))
  return make('unverified','No supported procurement listing has been verified.','View saved evidence; a developer needs to verify the listing or its collection method.');
 return make('unknown','This source check could not finish.','Inspect saved evidence to determine the next step.');
}

export function countyPresentation(trigger,{children=[],requests=[],tasks=[],jobs=[],interpretations=[],intakes=[],intakeLinks=[],requestLinks=[],usage=[]}){
 if(trigger.target_kind!=='county_scope'||!['needs_review','partial','completed'].includes(trigger.state)||!children.length)return null;
 if(usageSummary(usage).ai==='unknown'||requests.length!==children.length||requests.some(r=>r.workflow_control?.cancelled||r.workflow_control?.paused))return null;
 if(jobs.some(j=>['pending','running','outcome_unknown','cancelled','paused'].includes(j.state)))return null;
 // Resolved source attempts remain history, not current blockers. Never discard
 // an uncertain operation or an import based on a later source check.
 const taskById=new Map(tasks.map(t=>[t.id,t])),currentSources=new Map();
 for(const j of jobs.filter(j=>['collect','discover'].includes(j.kind))){
  const key=`${j.kind}:${j.task_id??j.checkpoint?.task_id}`,prior=currentSources.get(key);
  currentSources.set(key,prior?latest([prior,j]):j);
 }
 jobs=jobs.filter(j=>{
  if(!['collect','discover'].includes(j.kind))return true;
  const task=taskById.get(j.task_id??j.checkpoint?.task_id);
  if(!task)return true;
  if(['reviewed_no_results','reviewed_with_results','superseded'].includes(task.state))return false;
  const current=currentSources.get(`${j.kind}:${task.id}`);
  return current?.id===j.id||current?.state!=='succeeded';
 });
 if(jobs.some(j=>j.checkpoint?.error_code))return null;
 const attention=tasks.filter(t=>sourceAttention(t,jobs));
 if(!attention.length)return null;
 for(const child of children){
  const cj=jobs.filter(j=>j.search_request_id===child.request_id),automatic=countyImportStatus(cj);
  if(automatic.job_ids.length&&(!automatic.verified||automatic.state!=='verified'||automatic.exclusions.length))return null;
  const candidateIds=interpretations.filter(i=>i.request_id===child.request_id&&i.is_current!==false).flatMap(i=>i.staging_receipt?.intake_ids??[]);
  if(candidateIds.length&&(!automatic.verified||automatic.state!=='verified'||automatic.exclusions.length))return null;
  if(candidateIds.some(id=>!intakes.some(i=>i.id===id&&i.status==='processed')||!intakeLinks.some(l=>l.intake_id===id&&requestLinks.some(r=>r.search_request_id===child.request_id&&r.lead_id===l.lead_id))))return null;
  for(const j of cj.filter(j=>!['succeeded','partial'].includes(j.state))){
   const c=j.checkpoint??{};
   if(c.automatic?.policy==='county-automatic-v1'||c.stage?.startsWith('import_'))return null;
   if(child.role==='county'&&j.dedupe_key===`api-workflow:${child.request_id}`&&c.stage==='interpret')continue;
   if(!['collect','discover'].includes(j.kind)||!attention.some(t=>taskJobs(t,[j]).length)||j.kind==='discover'&&c.stage==='discovery_review')return null;
  }
 }
 return {outcome:'source_attention',attention_count:attention.length};
}

// Shared bounded loader for list/detail. Seeds reuse Activity's existing batches.
export async function countyPresentations(db,triggers,seed={}){
 const eligible=triggers.filter(t=>t.target_kind==='county_scope'&&['needs_review','partial','completed'].includes(t.state));
 if(!eligible.length)return new Map();
 const read=async(table,column,ids,columns)=>{const out=[],keys=[...new Set(ids)];for(let n=0;n<keys.length;n+=100)out.push(...await rows(db,table,q=>q.in(column,keys.slice(n,n+100)),columns));return out;};
 const children=seed.children??await read('procurement_trigger_requests','trigger_id',eligible.map(t=>t.id),'trigger_id,request_id,role');
 const requestIds=children.filter(c=>eligible.some(t=>t.id===c.trigger_id)).map(c=>c.request_id);
 const targets=seed.targets??await read('procurement_request_targets','search_request_id',requestIds,'id,search_request_id');
 const [requests,tasks,jobs,interpretations,usage]=await Promise.all([
  read('procurement_search_requests','id',requestIds,'id,workflow_control'),
  seed.tasks??read('procurement_coverage_tasks','target_id',targets.map(t=>t.id),'id,target_id,source_id,kind,state,reason,evidence'),
  seed.jobs??read('procurement_jobs','search_request_id',requestIds,jobColumns),
  seed.interpretations??read('procurement_interpretations','request_id',requestIds,'request_id,is_current,staging_receipt'),
  seed.usage??read('procurement_usage_ledger','trigger_id',eligible.map(t=>t.id),'trigger_id,state,actual_usd,reserved_usd,usage')]);
 const requestSet=new Set(requestIds);
 const ids=interpretations.filter(i=>requestSet.has(i.request_id)&&i.is_current!==false).flatMap(i=>i.staging_receipt?.intake_ids??[]);
 const [intakes,intakeLinks,requestLinks]=await Promise.all([read('procurement_intake_items','id',ids,'id,status'),read('procurement_intake_leads','intake_id',ids,'intake_id,lead_id'),ids.length?read('procurement_request_leads','search_request_id',requestIds,'search_request_id,lead_id'):[]]);
 const result=new Map();
 for(const trigger of eligible){
  const cc=children.filter(c=>c.trigger_id===trigger.id),rs=new Set(cc.map(c=>c.request_id)),ts=new Set(targets.filter(t=>rs.has(t.search_request_id)).map(t=>t.id));
  const scopedJobs=jobs.filter(j=>rs.has(j.search_request_id)).map(j=>j.checkpoint?j:{...j,checkpoint:{stage:j.c_stage,error_code:j.c_error,task_id:j.c_task,automatic:j.c_automatic,receipt:j.c_receipt,county_records:j.c_records,blocker:j.c_blocker,hosted_browser_attempt:j.c_hosted,bonfire_access_holds:j.c_holds,verification_failures:j.c_failures,bonfire_details:j.c_details}});
  result.set(trigger.id,countyPresentation(trigger,{children:cc,requests:requests.filter(r=>rs.has(r.id)),tasks:tasks.filter(t=>ts.has(t.target_id)),jobs:scopedJobs,interpretations:interpretations.filter(i=>rs.has(i.request_id)),usage:usage.filter(u=>u.trigger_id===trigger.id),intakes,intakeLinks,requestLinks}));
 }
 return result;
}
