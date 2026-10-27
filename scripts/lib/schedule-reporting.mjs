import {canonicalReportingJobs} from './canonical-reporting.mjs';
import {verifiedRunOutcomes,identitySnapshot} from './reporting-identities.mjs';
import {rows} from './hosted-store.mjs';
import {usageSummary} from './workflow-audit.mjs';
import {countyPresentations,countyJobColumns,normalizeCountyJob} from './county-source-attention.mjs';

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
  const reporting=j.checkpoint.reporting_records;
  const saved=reporting?.version===1&&Array.isArray(reporting.records)?reporting.records.map(r=>({...r,added:['added','updated','unchanged'].includes(r.outcome)?r.outcome==='added':undefined,updated:r.outcome==='updated'})):j.checkpoint.county_records;
  if(Array.isArray(saved))for(const r of saved){
   if(typeof r.id!=='string'||!r.id||typeof r.added!=='boolean'||typeof r.updated!=='boolean'){malformed=true;continue;}
   const old=records.get(r.id);records.set(r.id,{added:!!r.added||old?.added,updated:!!r.updated||old?.updated});
  } else aggregates++;
 }
 const unsettled=malformed||['pending','running','outcome_unknown'].includes(run.state)||jobs.some(j=>['pending','running','outcome_unknown'].includes(j.state))||relevant.some(j=>!j.checkpoint?.receipt?.verified);
 if(aggregates===1&&verified.length===1&&!unsettled) {
  const c=verified[0].checkpoint.receipt.counts;
  if([c?.actual_new_leads,c?.evidence_updates,c?.actual_processed].every(n=>Number.isInteger(n)&&n>=0)&&c.actual_processed>=c.actual_new_leads+c.evidence_updates)
   return {added:c.actual_new_leads,updated:c.evidence_updates,unchanged:c.actual_processed-c.actual_new_leads-c.evidence_updates,completeness:'known',identities:false};
 }
 if(!aggregates&&verified.length&&!unsettled)return {added:[...records.values()].filter(r=>r.added).length,updated:[...records.values()].filter(r=>!r.added&&r.updated).length,unchanged:[...records.values()].filter(r=>!r.added&&!r.updated).length,completeness:'known'};
 return {added:null,updated:null,unchanged:null,completeness:'unknown',reason:unsettled?'Run results are not fully verified':'Historical verified identities unavailable'};
}
export function verifiedCategoryCounts(run,jobs){
 const leads=verifiedLeadCounts(run,jobs),sets={forecast:new Set(),opportunity:new Set(),award:new Set()},historical=new Set();let complete=leads.completeness==='known';
 for(const job of jobs.filter(j=>j.checkpoint?.receipt?.verified)){
  const c=job.checkpoint,saved=c.reporting_records?.version===1?c.reporting_records.records:null;
  if(!Array.isArray(saved)){if(c.county_records?.length!==0)complete=false;continue;}
  for(const r of saved){const category=r.category==='historical_opportunity'?'opportunity':r.category;if(!sets[category]||typeof r.id!=='string'){complete=false;continue;}sets[category].add(r.id);if(r.category==='historical_opportunity')historical.add(r.id);}
 }
 return {...Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,complete?v.size:null])),historical_opportunity:complete?historical.size:null,completeness:leads.completeness==='not_applicable'?'not_applicable':complete?'known':'unknown',reason:complete?'As-imported classifications; category transitions can overlap':'Verified historical category attribution is unavailable'};
}
export async function reportSchedules(db,items,seed={}) {
 const runs=items.flatMap(s=>s.last_run?[s.last_run]:[]),ids=runs.map(r=>r.id);
 const batch=async(table,column,keys,columns)=>{
  const result=[];const unique=[...new Set(keys)];
  for(let i=0;i<unique.length;i+=100)result.push(...await rows(db,table,q=>q.in(column,unique.slice(i,i+100)),columns));
  return result;
 };
 const [children,usage]=await Promise.all([
  seed.children??batch('procurement_trigger_requests','trigger_id',ids,'trigger_id,request_id,role'),
  seed.usage??batch('procurement_usage_ledger','trigger_id',ids,'id,trigger_id,state,input_tokens,output_tokens,actual_usd,reserved_usd,usage')]);
 const jobs=(await batch('procurement_jobs','search_request_id',children.map(c=>c.request_id),countyJobColumns)).map(normalizeCountyJob);
 const [normalized,presentations]=await Promise.all([
  canonicalReportingJobs(db,jobs),
  countyPresentations(db,runs,{children,usage,jobs})]);
 return items.map(s=>{
  if(!s.last_run)return {...s,reporting:{as_of:new Date().toISOString(),last_run:null,latest_occurrence:s.latest_occurrence}};
  const r=s.last_run,requests=new Set(children.filter(c=>c.trigger_id===r.id).map(c=>c.request_id));
  const js=normalized.filter(j=>requests.has(j.search_request_id));
  return {...s,reporting:{as_of:new Date().toISOString(),latest_occurrence:s.latest_occurrence,last_run:{...r,identity_snapshot:identitySnapshot(verifiedRunOutcomes(r,js).records),...(presentations.get(r.id)?{presentation:presentations.get(r.id)}:{}),leads:verifiedLeadCounts(r,js),categories:verifiedCategoryCounts(r,js),usage:usageSummary(usage.filter(u=>u.trigger_id===r.id))}}};
 });
}
