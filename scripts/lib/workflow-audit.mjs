import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { checked, rows } from './hosted-store.mjs';

const context = new AsyncLocalStorage();
export const currentAudit = () => context.getStore();
export async function auditPhase(phase, operation, metadata={}) {
  const active=currentAudit();
  return active ? active.audit.run(active.requestId,phase,operation,metadata) : operation();
}

// Reservations are estimates. Only provider-reported values are actual usage.
export function usageSummary(entries) {
  const sent=entries.filter(e=>e.state!=='not_sent');
  const unknown=sent.some(e=>['reserved','outcome_unknown'].includes(e.state)||
    e.state==='completed'&&!e.usage?.quota_rejection&&(!Number.isInteger(e.usage?.input_tokens)||!Number.isInteger(e.usage?.output_tokens)));
  const actual=sent.filter(e=>e.state==='completed'&&Number.isInteger(e.usage?.input_tokens)&&Number.isInteger(e.usage?.output_tokens));
  const reportedCredits=actual.filter(e=>Number.isFinite(e.usage.credits)&&e.usage.credits>=0&&
    typeof e.usage.credit_unit==='string'&&/^[a-zA-Z][a-zA-Z0-9 _-]{0,31}$/.test(e.usage.credit_unit));
  const creditUnit=new Set(reportedCredits.map(e=>e.usage.credit_unit));
  const creditsComplete=!unknown&&actual.length>0&&reportedCredits.length===actual.length&&creditUnit.size===1;
  return {ai:unknown?'unknown':actual.length?'used':'not_used',calls:sent.length,
    input_tokens:unknown?null:actual.reduce((n,e)=>n+e.usage.input_tokens,0),
    output_tokens:unknown?null:actual.reduce((n,e)=>n+e.usage.output_tokens,0),
    actual_usd:unknown?null:sent.reduce((n,e)=>n+Number(e.actual_usd??0),0),
    known_actual_usd:sent.reduce((n,e)=>n+Number(e.actual_usd??0),0),
    held_usd:sent.filter(e=>['reserved','outcome_unknown'].includes(e.state)).reduce((n,e)=>n+Number(e.reserved_usd),0),
    credits:creditsComplete?reportedCredits.reduce((n,e)=>n+e.usage.credits,0):null,credit_unit:creditsComplete?[...creditUnit][0]:null};
}
export function workflowAudit(db) {
  const rpc=async(name,args)=>checked(await db.rpc(name,args));
  async function run(requestId,phase,operation,meta={}) {
    const allowed=/^(plan|collect|interpret|resolve_sources|reuse_state_source|research|revalidate|fetch_page|fetch_api_page|fetch_document|research_fetch|compare|extract|stage|ai_interpretation|test_import|apply_import|readback|cancel|resume|discover|prepare|approve|reconcile|supporting-captures|discovery_(resolve|verify|save|capture|review|register|collect|handoff)|import_(prepare|apply|reconcile|verified|awaiting_approval))$/;
    phase=allowed.test(phase)?phase:'request_action';
    const link=(await rows(db,'procurement_trigger_requests',q=>q.eq('request_id',requestId)))[0];
    if(!link)return operation();
    const parent=(await rows(db,'procurement_triggers',q=>q.eq('id',link.trigger_id),'id,initiated_by,origin,state'))[0];
    if(parent.origin==='scheduled'&&meta.reason!=='manual'&&!await rpc('procurement_scheduled_trigger_runnable',{p_id:link.trigger_id})) {
      const error=Error('Scheduled execution paused; no new operation started');error.code='schedule_paused';throw error;
    }
    if(parent.state==='cancelled'&&!['cancel','resume'].includes(phase))throw Error('Trigger cancelled; no new operation started');
    const stepId=await rpc('begin_procurement_step',{p_input:{trigger_id:link.trigger_id,request_id:requestId,
      county_id:link.county_id,actor_id:meta.actor_id??parent.initiated_by,origin:parent.origin,execution:meta.reason==='manual'?'user':'worker',phase,
      attempt_key:randomUUID(),job_id:meta.job_id??currentAudit()?.jobId??null,
      job_attempt:meta.job_attempt??currentAudit()?.jobAttempt??null,task_id:meta.task_id??null,source_id:meta.source_id??null,reason:meta.reason??'deterministic'}});
    let state='completed',diagnostic=null,result,failure;
    try {
      result=await context.run({audit:{run},requestId,stepId,triggerId:link.trigger_id,jobId:meta.job_id??currentAudit()?.jobId,jobAttempt:meta.job_attempt??currentAudit()?.jobAttempt},operation);
    } catch(error) {state='failed';diagnostic=randomUUID();failure=error;}
    if(meta.outcome?.()==='failed')state='failed';
    const raw=meta.summary?.()??result;
    const summary={};
    for(const key of ['pages','records','inserted','existing_preserved','results_count'])
      if(Number.isInteger(raw?.[key])&&raw[key]>=0)summary[key]=raw[key];
    if(['captured','blocked','partial','outcome_unknown','unchanged','changed','new'].includes(raw?.state))summary.outcome=raw.state;
    if(meta.diagnostic?.())diagnostic=meta.diagnostic();
    if(!await rpc('finish_procurement_step',{p_id:stepId,p_state:state,p_summary:summary,p_diagnostic:diagnostic}))
      throw Error('Audit completion uncertain; reconcile saved operation before retry');
    if(failure)throw failure;
    return result;
  }
  return {run};
}
