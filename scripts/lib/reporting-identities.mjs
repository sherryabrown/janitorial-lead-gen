import {hash} from './reviewed-batch.mjs';
const categories=['forecast','opportunity','award'];
export const reportingCategory=c=>c==='historical_opportunity'?'opportunity':categories.includes(c)?c:null;
export const outcomeRank={unchanged:0,updated:1,added:2};
const category=reportingCategory,rank=outcomeRank;
export function identitySnapshot(records){return hash(records.map(r=>({id:r.id,outcome:r.outcome,categories:[...(r.categories??[])].sort(),historical:!!r.historical})).sort((a,b)=>a.id.localeCompare(b.id)));}
export function verifiedRunOutcomes(run,jobs,selectedCategory){
 const imports=jobs.filter(j=>j.checkpoint?.automatic||j.checkpoint?.stage?.startsWith('import_'));
 const verified=imports.filter(j=>j.checkpoint?.receipt?.verified);
 let complete=imports.length>0&&!imports.some(j=>!j.checkpoint?.receipt?.verified)&&!jobs.some(j=>['pending','running','outcome_unknown'].includes(j.state))&&!['pending','running','outcome_unknown'].includes(run.state),categoryComplete=true;
 if(!imports.length&&jobs.some(j=>j.checkpoint?.stage==='sam_review'&&j.checkpoint.sam_completed===true)&&!jobs.some(j=>['pending','running','outcome_unknown'].includes(j.state))&&!['pending','running','outcome_unknown'].includes(run.state))complete=true;
 const records=new Map(),resolved=new Set();
 for(const j of verified){
  const c=j.checkpoint,versioned=c.reporting_records?.version===1?c.reporting_records.records:null;
  const saved=versioned??c.county_records;
  if(!Array.isArray(saved)){complete=false;categoryComplete=false;continue;}
  for(const r of saved){
   const outcome=versioned?r.outcome:r.added?'added':r.updated?'updated':'unchanged';
   if(typeof r.id!=='string'||!r.id||!(outcome in rank)||!versioned&&(typeof r.added!=='boolean'||typeof r.updated!=='boolean')){complete=false;continue;}
   for(const id of r.intake_ids??[])resolved.add(id);
   const prior=records.get(r.id);
   // Preserve all as-imported classifications for a category transition; a lead
   // is still counted only once in total and in its highest-precedence outcome.
   const cats=new Set([...(prior?.categories??[]),...(category(r.category)?[category(r.category)]:[])]);
   if(!category(r.category))categoryComplete=false;
   records.set(r.id,{id:r.id,outcome:prior&&rank[prior.outcome]>rank[outcome]?prior.outcome:outcome,categories:cats,
    historical:prior?.historical||r.category==='historical_opportunity'});
  }
 }
 if(run.config?.check_updates===false){complete=true;categoryComplete=true;}
 const filtered=[...records.values()].filter(r=>!selectedCategory||r.categories.has(selectedCategory));
 if(selectedCategory&&!categoryComplete)complete=false;
 return {records:filtered,complete,categoryComplete,resolved};
}
