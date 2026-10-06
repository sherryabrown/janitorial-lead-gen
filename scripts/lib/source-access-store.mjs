import { transitionAccess, accessHash } from './source-access.mjs';

export async function accessRows(db,table,filter=q=>q) {
  const result=[];
  for(let offset=0; ;offset+=1000) {
    const {data,error}=await filter(db.from(table).select('*')).range(offset,offset+999);
    if(error)throw new Error(`${table}: access lookup failed`);
    result.push(...data);if(data.length<1000)return result;
  }
}
export async function recordAccessEvent(db,handoff,event) {
  const result=transitionAccess(handoff,event);
  if(result.unchanged)return {status:'unchanged',id:handoff.id};
  if(event.run_id) {
    const run=(await accessRows(db,'procurement_runs',q=>q.eq('id',event.run_id)))[0];
    if(!run || run.source_id!==handoff.source_id || run.detail?.state!=='content_saved' || run.detail.upstream_status!==200 ||
      (handoff.channel==='api' ? run.detail.collector!=='api-bounded' : run.detail.collector!=='authenticated-browser'))
      throw new Error('Audited capture from this access channel required');
    if(event.stage?.endsWith('_access')) {
      const category=event.stage.slice(0,-7);
      const task=run.coverage_task_id ? (await accessRows(db,'procurement_coverage_tasks',q=>q.eq('id',run.coverage_task_id)))[0] : null;
      if(task?.kind!==category && !(run.detail.verification===true && run.detail.kind===category))
        throw new Error('Category proof must match audited task or verification request');
    }
    if(run.detail.access_handoff_id!==handoff.id || Date.parse(event.at)<Date.parse(run.started_at))
      throw new Error('Access proof does not match this handoff or capture time');
  }
  const {data,error}=await db.rpc('record_procurement_access_event',{
    p_handoff_id:handoff.id,p_expected_revision:handoff.lifecycle_revision,
    p_expected_updated_at:handoff.updated_at,p_event_id:event.id,p_input_hash:accessHash(event),p_lifecycle:result.lifecycle });
  if(error || !data)throw new Error('Access transition failed; reread before retry');
  const saved=(await accessRows(db,'procurement_access_handoffs',q=>q.eq('id',handoff.id)))[0];
  if(!saved?.lifecycle?.events.some(e=>e.id===event.id && e.input_hash===accessHash(event)))
    throw new Error('Access transition readback failed; reconcile before further action');
  return {receipt:data,record:saved};
}
