import {checked,rows,one} from './hosted-store.mjs';
import {HttpError} from './workflow-http.mjs';
export function reviewScope(task){return {geography_id:task.route_geography_id,category:task.kind,source_id:task.source_id??null,capability_id:task.capability_id??null};}
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
export function sourceReviewItem(task,{source,geography,capability,review,revision,scope,currentTask,currentRevision,skipped=false,excluded=false}={}){
 const [title,impact]=skipped?['Not checked by admin decision','This check was skipped. Other source checks continued.']:
  conditions[task.state]??['Check status unavailable','Review is needed before claiming complete coverage.'];
 const latest=currentTask??task,[currentTitle,currentImpact]=conditions[latest.state]??['Source needs review','The saved source check needs review before claiming complete coverage.'];
 return {task_id:task.id,id:review?.id??null,version:review?.review_version??0,
   scope:scope??reviewScope(task),name:source?.name??geography?.name??'Source website',location:geography?.name??'Saved location',
   category:task.kind,title,impact,check:{state:skipped?'admin_excluded':task.state,observed_at:task.updated_at??null,last_success_at:capability?.last_success_at??null},
   current:{task_id:latest.id,target_id:latest.target_id,state:latest.state,title:currentTitle,impact:currentImpact,observed_at:latest.updated_at??null},
   revision:currentRevision??revision,decision:review?.review_decision??'unreviewed',
   previous_decision:review?.review_decision??null,checks_excluded:excluded||review?.checks_excluded||false,
   reviewed_at:review?.reviewed_at??null,reviewed_by_label:review?.reviewed_by_label??null,responsibility:review?.review_decision==='needs_developer'?'Developer':'Admin',
   allowed_actions:['reviewed_no_results','reviewed_with_results','superseded'].includes(task.state)?[]:['provide_website','no_website','no_issue','wont_address','needs_developer'],
 };
}
export function sourceReviewService(db){
 async function taskFor(requestId,taskId){
  const task=await one(db,'procurement_coverage_tasks',taskId),target=task&&await one(db,'procurement_request_targets',task.target_id);
  if(!task||target?.search_request_id!==requestId)throw new HttpError(404,'Source check is not part of this run.');
  return task;
 }
 async function list(requestId,{includeReviewDetails=false}={}){
  if(!await one(db,'procurement_search_requests',requestId))throw new HttpError(404,'Run results are unavailable.');
  const targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId),'id');
  const tasks=targets.length?await rows(db,'procurement_coverage_tasks',q=>q.in('target_id',targets.map(t=>t.id)),
   'id,target_id,route_geography_id,kind,state,updated_at,source_id,capability_id'):[];
  return project(tasks,{includeReviewDetails});
 }
 async function project(tasks,{includeReviewDetails=false}={}){
  const sourceIds=[...new Set(tasks.map(t=>t.source_id).filter(Boolean))],geoIds=[...new Set(tasks.map(t=>t.route_geography_id))];
  const capIds=[...new Set(tasks.map(t=>t.capability_id).filter(Boolean))];
  const [sources,geographies,capabilities]=await Promise.all([
   sourceIds.length?rows(db,'procurement_sources',q=>q.in('id',sourceIds),'id,name'):[],
   geoIds.length?rows(db,'procurement_geographies',q=>q.in('id',geoIds),'id,name'):[],
   capIds.length?rows(db,'procurement_source_capabilities',q=>q.in('id',capIds),'id,last_success_at'):[],
  ]);
  if(tasks.length>1000)throw new HttpError(422,'This source selection exceeds its safe bound. Select a narrower run.');
  const context=tasks.length?checked(await db.rpc('procurement_source_review_context',{p_tasks:tasks.map(t=>t.id),p_private:includeReviewDetails})):{revisions:{},scopes:{},current_tasks:{},current_revisions:{},reviews:{},excluded:{},skipped:{}};
  return {basis:'What was checked in this run',decision_basis:'Current admin decision; historical check outcomes are unchanged',
   ...(includeReviewDetails?{internal:{reviews:context.reviews,tasks:Object.fromEntries(tasks.map(t=>[t.id,t]))}}:{}),
   items:tasks.map(task=>sourceReviewItem(task,{scope:context.scopes[task.id],revision:context.revisions[task.id],currentTask:context.current_tasks[task.id],currentRevision:context.current_revisions[task.id],source:sources.find(s=>s.id===task.source_id),geography:geographies.find(g=>g.id===task.route_geography_id),capability:capabilities.find(c=>c.id===task.capability_id),
    skipped:context.skipped[task.id],excluded:context.excluded[task.id],review:context.reviews[task.id]}))};
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
 async function attention({reviewed=false,offset=0,limit=25}={}){
  const page=checked(await db.rpc('procurement_source_attention_page',{p_reviewed:reviewed,p_offset:offset,p_limit:limit}));
  const ids=page.items.map(i=>i.task_id);
  const tasks=ids.length?await rows(db,'procurement_coverage_tasks',q=>q.in('id',ids),'id,target_id,route_geography_id,kind,state,updated_at,source_id,capability_id'):[];
  const result=await project(tasks);
  return {...page,items:page.items.map(i=>({...result.items.find(t=>t.task_id===i.task_id),request_id:i.request_id,run_id:i.run_id??null}))};
 }
 return {list,decide,taskFor,attention};
}
