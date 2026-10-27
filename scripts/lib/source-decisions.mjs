import {checked,rows,one} from './hosted-store.mjs';
import {HttpError} from './workflow-http.mjs';
export function reviewScope(task){return {geography_id:task.route_geography_id,category:task.kind,source_id:task.source_id??null,capability_id:task.capability_id??null};}
const sameScope=(a,b)=>Object.keys(b).every(k=>(a?.[k]??null)===(b[k]??null));
const conditions={
 source_missing:['No verified website','This location has no verified website for this check.'],
 method_missing:['Bid listings need setup','The website has no verified method for checking this category.'],
 blocked:['Website could not be checked','This check did not finish. Other independent sources can continue.'],
 partial:['Website check is incomplete','Only part of this source could be checked.'],
 reviewed_no_results:['Checked · no matching records','This completed check found no matching records in its scope.'],
 reviewed_with_results:['Checked · records found','Matching records were captured; saved leads still depend on validation.'],
 superseded:['Replaced by a later check','This saved attempt remains part of run history.'],
 unchecked:['Waiting to check','No completed check is recorded for this attempt.'],
};
export function sourceReviewItem(task,{source,geography,capability,review,revision,excluded=false}={}){
 const [title,impact]=conditions[task.state]??['Check status unavailable','Review is needed before claiming complete coverage.'];
 return {task_id:task.id,id:review?.id??null,version:review?.review_version??0,
   scope:reviewScope(task),name:source?.name??geography?.name??'Source website',location:geography?.name??'Saved location',
   category:task.kind,title,impact,check:{state:task.state,observed_at:task.updated_at??null,last_success_at:capability?.last_success_at??null},
   revision,decision:review&&review.review_observed_revision===revision?review.review_decision:'unreviewed',
   previous_decision:review?.review_decision??null,checks_excluded:excluded||review?.checks_excluded||false,
   reviewed_at:review?.reviewed_at??null,responsibility:review?.review_decision==='needs_developer'?'Developer':'Admin',
   allowed_actions:['reviewed_no_results','reviewed_with_results','superseded'].includes(task.state)?[]:['provide_website','no_website','no_issue','wont_address','needs_developer'],
 };
}
export function sourceReviewService(db){
 async function taskFor(requestId,taskId){
  const task=await one(db,'procurement_coverage_tasks',taskId),target=task&&await one(db,'procurement_request_targets',task.target_id);
  if(!task||target?.search_request_id!==requestId)throw new HttpError(404,'Source check is not part of this run.');
  return task;
 }
 async function list(requestId){
  if(!await one(db,'procurement_search_requests',requestId))throw new HttpError(404,'Run results are unavailable.');
  const targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId),'id');
  const tasks=targets.length?await rows(db,'procurement_coverage_tasks',q=>q.in('target_id',targets.map(t=>t.id))):[];
  const sourceIds=[...new Set(tasks.map(t=>t.source_id).filter(Boolean))],geoIds=[...new Set(tasks.map(t=>t.route_geography_id))];
  const capIds=[...new Set(tasks.map(t=>t.capability_id).filter(Boolean))];
  const [sources,geographies,reviews,capabilities]=await Promise.all([
   sourceIds.length?rows(db,'procurement_sources',q=>q.in('id',sourceIds),'id,name'):[],
   geoIds.length?rows(db,'procurement_geographies',q=>q.in('id',geoIds),'id,name'):[],
   rows(db,'procurement_action_requests',q=>q.not('review_scope','is',null),'id,review_scope,review_version,review_decision,checks_excluded,reviewed_at,review_observed_revision'),
   capIds.length?rows(db,'procurement_source_capabilities',q=>q.in('id',capIds),'id,last_success_at'):[],
  ]);
  if(tasks.length>1000)throw new HttpError(422,'This source selection exceeds its safe bound. Select a narrower run.');
  const revisions=tasks.length?checked(await db.rpc('procurement_source_review_revisions',{p_tasks:tasks.map(t=>t.id)})):{};
  return {basis:'What was checked in this run',decision_basis:'Current admin decision; historical check outcomes are unchanged',
   items:tasks.map(task=>sourceReviewItem(task,{revision:revisions[task.id],source:sources.find(s=>s.id===task.source_id),geography:geographies.find(g=>g.id===task.route_geography_id),capability:capabilities.find(c=>c.id===task.capability_id),
    excluded:reviews.some(r=>r.checks_excluded&&r.review_scope.geography_id===task.route_geography_id&&r.review_scope.category===task.kind&&
      (!r.review_scope.source_id||r.review_scope.source_id===task.source_id)&&(!r.review_scope.capability_id||r.review_scope.capability_id===task.capability_id)),
    review:reviews.find(r=>sameScope(r.review_scope,reviewScope(task)))}))};
 }
 async function decide(requestId,taskId,input,actor,key){
  await taskFor(requestId,taskId);
  if(!input||Object.keys(input).some(k=>!['version','decision','reason','revision','reenable'].includes(k))||!Number.isInteger(input.version)||typeof input.reason!=='string'||typeof input.revision!=='string'||(input.reenable!==undefined&&typeof input.reenable!=='boolean'))throw new HttpError(400,'Choose a decision and provide a short reason.');
  const response=await db.rpc('record_procurement_source_decision',{p_actor:actor,p_task:taskId,p_version:input.version,
   p_decision:input.decision,p_reason:input.reason,p_key:key,p_revision:input.revision,p_reenable:input.reenable===true});
  if(response.error?.code==='40001')throw new HttpError(409,'Another admin changed this decision. Reload it; your note is preserved.');
  if(response.error?.code==='42501')throw new HttpError(403,'An Admin is required to review sources.');
  return checked(response);
 }
 return {list,decide,taskFor};
}
