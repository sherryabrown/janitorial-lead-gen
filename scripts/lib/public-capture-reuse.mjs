import {rows,sha} from './hosted-store.mjs';
import {safePublicUrl} from './known-source-execution.mjs';

// Acquisition sharing within one request or its county parent run only.
// Never reuses coverage conclusions, failed/in-flight writes or another run's freshness.
export async function requestPublicCapture(db,{requestId,sourceId,url,maxBytes,allowedHosts,research=false,allowJson=false}) {
  const link=(await rows(db,'procurement_trigger_requests',q=>q.eq('request_id',requestId),'trigger_id,role'))[0];
  const siblings=link&&['county','state_research'].includes(link.role)?await rows(db,'procurement_trigger_requests',q=>q.eq('trigger_id',link.trigger_id),'request_id,role'):[];
  const requestIds=[...new Set([requestId,...siblings.filter(s=>['county','state_research'].includes(s.role)).map(s=>s.request_id)])];
  const jobs=await rows(db,'procurement_jobs',q=>q.in('search_request_id',requestIds),'id');
  if(!jobs.length)return null;
  const runs=await rows(db,'procurement_runs',q=>q.eq('source_id',sourceId).in('job_id',jobs.map(j=>j.id)));
  const saved=runs.filter(r=>r.detail?.state==='content_saved'&&r.detail.requested_url===url);
  if(!saved.length)return null;
  const captures=await rows(db,'procurement_public_captures',q=>q.eq('source_id',sourceId).in('run_id',saved.map(r=>r.id)),'*',{order:'run_id'});
  for(const capture of captures) {
    const run=saved.find(r=>r.id===capture.run_id),body=Buffer.from(capture.content_base64,'base64');
    const hosts=research?[new URL(capture.final_url).hostname]:allowedHosts;
    if(capture.requested_url!==url||!body.length||body.length>maxBytes||sha(body)!==capture.content_sha256||
       run.detail.content_sha256!==capture.content_sha256||!safePublicUrl(capture.final_url,hosts)||
       !(/^(text\/(html|plain|xml)|application\/(pdf|xml|xhtml\+xml))(;|$)/i.test(capture.content_type)||allowJson&&/^application\/json(;|$)/i.test(capture.content_type))||
       !Number.isFinite(Date.parse(capture.retrieved_at))||Date.parse(capture.retrieved_at)>Date.now()+60000||Date.now()-Date.parse(capture.retrieved_at)>30*86400000)continue;
    return {...capture,state:'captured',body,bytes:body.length,redirects:run.detail.redirects??[],reused_run_id:capture.run_id};
  }
  return null;
}
