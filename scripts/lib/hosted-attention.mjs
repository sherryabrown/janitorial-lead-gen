import { rows,one } from './hosted-store.mjs';
import { accessNext } from './source-access.mjs';

// Deliberately derive messages from states, never private error or access text.
export function attentionItems(jobs, tasks, handoffs=[]) {
  const items=[];
  for(const job of jobs) {
    if(!['blocked','outcome_unknown'].includes(job.state))continue;
    const stage=job.checkpoint?.stage;
    const approval=stage==='import_awaiting_approval';
    items.push({id:`job:${job.id}`,kind:'job',reference_id:job.id,request_id:job.search_request_id,
      state:job.state,actor:approval?'user':'operator',
      next_action:approval?'Review and approve the tested import package':
        job.state==='outcome_unknown'?'Reconcile saved evidence before retrying':'Review the saved workflow blocker',
      updated_at:job.updated_at});
  }
  for(const task of tasks) {
    if(!['blocked','source_missing','method_missing','partial','awaiting_browser_capture'].includes(task.state))continue;
    items.push({id:`task:${task.id}`,kind:'coverage',reference_id:task.id,request_id:task.request_id,
      state:task.state,actor:'operator',next_action:'Review incomplete category coverage and its saved evidence',updated_at:task.updated_at});
  }
  for(const handoff of handoffs) {
    const next=accessNext(handoff);
    if(handoff.access_state==='public'||handoff.access_state==='verified'&&!next.blocker)continue;
    items.push({id:`access:${handoff.id}`,kind:'access',reference_id:handoff.id,source_id:handoff.source_id,
      state:handoff.access_state,actor:['user','agency','provider'].includes(next.actor)?next.actor:'operator',
      next_action:'Review the saved access requirements and resume the existing setup record',updated_at:handoff.updated_at});
  }
  return items.sort((a,b)=>a.id.localeCompare(b.id));
}
export function attentionService(db) {
  return async(requestId,{offset=0,limit=50}={})=>{
    if(!await one(db,'procurement_search_requests',requestId))throw new Error('Request not found');
    const targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',requestId),'id');
    const [jobs,tasks]=await Promise.all([
      rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId),'id,search_request_id,state,checkpoint,updated_at'),
      targets.length?rows(db,'procurement_coverage_tasks',q=>q.in('target_id',targets.map(t=>t.id)),'id,source_id,state,updated_at'):[],
    ]);
    const associations=await rows(db,'procurement_request_sources',q=>q.eq('search_request_id',requestId),'source_id');
    const sourceIds=[...new Set([...tasks,...associations].map(r=>r.source_id).filter(Boolean))];
    const handoffs=sourceIds.length?await rows(db,'procurement_access_handoffs',q=>q.in('source_id',sourceIds)):[];
    const items=attentionItems(jobs,tasks.map(t=>({...t,request_id:requestId})),handoffs);
    return {request_id:requestId,total:items.length,items:items.slice(offset,offset+limit),offset,limit};
  };
}
