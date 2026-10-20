import {rows} from './hosted-store.mjs';
import {usageSummary} from './workflow-audit.mjs';
import {countyPresentations} from './county-source-attention.mjs';

export function scheduleFilters(input={}) {
 const f={q:input.q??'',target:input.target??'all',geography:input.geography??'',lifecycle:input.lifecycle??'all',blocker:input.blocker??'all',sort:input.sort??'name',direction:input.direction??'asc'};
 if(typeof f.q!=='string'||f.q.length>100||!['all','county_scope','state_source','sam'].includes(f.target)||
 !['all','current','active','paused','archived'].includes(f.lifecycle)||!['all','blocked','clear'].includes(f.blocker)||
 !['name','target_kind','frequency','last_run_at','next_due_at','lifecycle'].includes(f.sort)||!['asc','desc'].includes(f.direction)||
 typeof f.geography!=='string'||f.geography&&!/^(05|05\d{3})$/.test(f.geography))throw Error('Invalid schedule filters');
 return f;
}
export function verifiedLeadCounts(run,jobs) {
 if(run.config?.check_updates===false)return {added:null,updated:null,unchanged:null,completeness:'not_applicable',reason:'Source maintenance only'};
 const relevant=jobs.filter(j=>j.checkpoint?.automatic||j.checkpoint?.stage?.startsWith('import_'));
 const verified=relevant.filter(j=>j.checkpoint?.receipt?.verified);
 const records=new Map(); let aggregates=0, malformed=false;
 for(const j of verified) {
  if(Array.isArray(j.checkpoint.county_records))for(const r of j.checkpoint.county_records){
   if(typeof r.id!=='string'||!r.id||typeof r.added!=='boolean'||typeof r.updated!=='boolean'){malformed=true;continue;}
   const old=records.get(r.id);records.set(r.id,{added:!!r.added||old?.added,updated:!!r.updated||old?.updated});
  } else aggregates++;
 }
 const unsettled=malformed||['pending','running','outcome_unknown'].includes(run.state)||jobs.some(j=>['pending','running','outcome_unknown'].includes(j.state))||relevant.some(j=>!j.checkpoint?.receipt?.verified);
 if(aggregates===1&&verified.length===1&&!unsettled) {
  const c=verified[0].checkpoint.receipt.counts;
  if([c?.actual_new_leads,c?.evidence_updates,c?.actual_processed].every(n=>Number.isInteger(n)&&n>=0)&&c.actual_processed>=c.actual_new_leads+c.evidence_updates)
   return {added:c.actual_new_leads,updated:c.evidence_updates,unchanged:c.actual_processed-c.actual_new_leads-c.evidence_updates,completeness:'known'};
 }
 if(!aggregates&&verified.length&&!unsettled)return {added:[...records.values()].filter(r=>r.added).length,updated:[...records.values()].filter(r=>!r.added&&r.updated).length,unchanged:[...records.values()].filter(r=>!r.added&&!r.updated).length,completeness:'known'};
 return {added:null,updated:null,unchanged:null,completeness:'unknown',reason:unsettled?'Run results are not fully verified':'Historical verified identities unavailable'};
}
export async function reportSchedules(db,items) {
 const runs=items.flatMap(s=>s.last_run?[s.last_run]:[]),ids=runs.map(r=>r.id);
 const batch=async(table,column,keys,columns)=>{
  const result=[];const unique=[...new Set(keys)];
  for(let i=0;i<unique.length;i+=100)result.push(...await rows(db,table,q=>q.in(column,unique.slice(i,i+100)),columns));
  return result;
 };
 const [children,usage]=await Promise.all([
  batch('procurement_trigger_requests','trigger_id',ids,'trigger_id,request_id,role'),
  batch('procurement_usage_ledger','trigger_id',ids,'id,trigger_id,state,input_tokens,output_tokens,actual_usd,reserved_usd,usage')]);
 const jobs=await batch('procurement_jobs','search_request_id',children.map(c=>c.request_id),'id,search_request_id,state,checkpoint:checkpoint->automatic,receipt:checkpoint->receipt,records:checkpoint->county_records,stage:checkpoint->>stage');
 const presentations=await countyPresentations(db,runs,{children,usage});
 return items.map(s=>{
  if(!s.last_run)return {...s,reporting:{as_of:new Date().toISOString(),last_run:null,latest_occurrence:s.latest_occurrence}};
  const r=s.last_run,requests=new Set(children.filter(c=>c.trigger_id===r.id).map(c=>c.request_id));
  const js=jobs.filter(j=>requests.has(j.search_request_id)).map(j=>({...j,checkpoint:{automatic:j.checkpoint,receipt:j.receipt,...(j.records?{county_records:j.records}:{}),stage:j.stage}}));
  return {...s,reporting:{as_of:new Date().toISOString(),latest_occurrence:s.latest_occurrence,last_run:{...r,...(presentations.get(r.id)?{presentation:presentations.get(r.id)}:{}),leads:verifiedLeadCounts(r,js),usage:usageSummary(usage.filter(u=>u.trigger_id===r.id))}}};
 });
}
