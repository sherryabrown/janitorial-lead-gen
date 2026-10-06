import { randomUUID } from 'node:crypto';
import { accessHash, usableAccess } from './source-access.mjs';
import { accessRows, recordAccessEvent } from './source-access-store.mjs';

export async function collectKnownApi(db,{job,task,capability,source,project,serverAuthorization},fetcher=fetch) {
  const spec=capability.method_spec;
  const h=(await accessRows(db,'procurement_access_handoffs',q=>q.eq('id',spec.access_handoff_id)))[0];
  const result={run_ids:[],pages:0,job_state:'partial',task_state:'partial',reason:'API page bound reached before terminal evidence'};
  if(!h || h.source_id!==source.id || h.channel!=='api' || !usableAccess(h,task.kind))
    return {...result,job_state:'blocked',task_state:'blocked',reason:'API access proof is missing or expired; resume source-access next'};
  for(let page=0;page<spec.max_pages;page++) {
    const runs=await accessRows(db,'procurement_runs',q=>q.eq('job_id',job.id).eq('page_index',page));
    let run=runs.find(r=>r.detail?.state==='content_saved') ?? runs.find(r=>r.detail?.state==='request_pending');
    if(run && run.detail.state!=='content_saved')return {...result,job_state:'outcome_unknown',reason:'Previous API request outcome unknown; reconcile saved audit before retry'};
    if(!run) {
      const runId=randomUUID();let response;
      try {response=await fetcher(`https://${project}.supabase.co/functions/v1/source-api`,{method:'POST',
        headers:{apikey:serverAuthorization(),'Content-Type':'application/json'},
        body:JSON.stringify({run_id:runId,job_id:job.id,lease_token:job.lease_token,capability_id:capability.id,page_index:page}),signal:AbortSignal.timeout(60000)});
        await response.json();}catch {return {...result,job_state:'outcome_unknown',reason:'API function outcome unknown; inspect saved run audit'};}
      run=(await accessRows(db,'procurement_runs',q=>q.eq('id',runId)))[0];
      if(!run)return {...result,job_state:response.status===409?'blocked':'outcome_unknown',
        task_state:response.status===409?'blocked':'partial',reason:'API function did not save a capture; inspect access state and audit before retry'};
    }
    if(run.detail.state!=='content_saved') {
      if([401,403].includes(run.detail.upstream_status)) {
        await recordAccessEvent(db,h,{id:`failure:${run.id}`,type:'stage',stage:'request_verification',state:'failed',
          at:run.finished_at,provenance:'observed',actor:'user',next_action:'Correct API access or scope, then verify again; do not create another account',
          blocker:`HTTP ${run.detail.upstream_status}`,evidence:[{url:spec.endpoint_url,note:'Current bounded API request was denied'}]});
      }
      return {...result,job_state:run.detail.state==='blocked'?'blocked':run.detail.state==='outcome_unknown'?'outcome_unknown':'partial',
        task_state:run.detail.state==='blocked'?'blocked':'partial',reason:run.detail.reason ?? 'API response incomplete'};
    }
    if(accessHash(run.detail.method_spec)!==accessHash(spec) || accessHash(run.detail.query_window)!==accessHash(task.query_window))
      return {...result,job_state:'blocked',task_state:'blocked',reason:'Saved API capture belongs to a different method or query window'};
    result.run_ids.push(run.id);result.pages++;
    if(run.detail.terminal===true)return {...result,job_state:'succeeded',task_state:'needs_interpretation',reason:null};
  }
  return result;
}
