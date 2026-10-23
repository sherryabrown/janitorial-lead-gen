import {rows} from './hosted-store.mjs';
import {redirectId} from './county-solicitation-identity.mjs';
// Resolve immutable receipt IDs only in the current read projection. Never edit
// saved receipts or infer historical categories/outcomes from mutable leads.
export async function canonicalReportingJobs(db,jobs){
 const ids=[...new Set(jobs.flatMap(j=>j.checkpoint?.reporting_records?.records??j.checkpoint?.county_records??[]).map(r=>r.id).filter(Boolean))];
 const leads=[];
 for(let i=0;i<ids.length;i+=100)leads.push(...await rows(db,'procurement_leads',q=>q.in('id',ids.slice(i,i+100)),'id,source_id,payload'));
 const redirects=leads.filter(redirectId),targets=[...new Set(redirects.map(redirectId))],canonical=[];
 for(let i=0;i<targets.length;i+=100)canonical.push(...await rows(db,'procurement_leads',q=>q.in('id',targets.slice(i,i+100)),'id,source_id,payload'));
 const map=new Map();
 for(const alias of redirects){const target=canonical.find(l=>l.id===redirectId(alias));if(!target||redirectId(target)||target.source_id!==alias.source_id)throw Error('Canonical reporting identity requires reconciliation');map.set(alias.id,target.id);}
 return jobs.map(j=>{const c=j.checkpoint??{},convert=r=>map.has(r.id)?{...r,id:map.get(r.id),canonical_aliases:[...new Set([...(r.canonical_aliases??[]),r.id])]}:r;
  return {...j,checkpoint:{...c,...(c.reporting_records?.records?{reporting_records:{...c.reporting_records,records:c.reporting_records.records.map(convert)}}:{}),...(c.county_records?{county_records:c.county_records.map(convert)}:{})}};
 });
}
