import { hash } from './reviewed-batch.mjs';
import { same } from './sam-normalize.mjs';
import { validLinkState,linkPolicy } from './api-record-links.mjs';

const identifier=value=>{if(!/^[a-z_]+$/.test(value))throw new Error('Invalid repair column');return `"${value}"`;};
const mutable=['payload','source_url','updated_at','detected_change_at'];
const generated=['bid_type','business_category','contracting_entity_geo_level','work_performance_locations'];
export function planLinkRepair(before,proposals) {
  if(proposals.length>50)throw new Error('Link repair batch exceeds 50 records');
  const records=proposals.map(({lead_id,resolution})=>{
    const lead=before.procurement_leads.find(l=>l.id===lead_id);
    if(!lead || !validLinkState(resolution))throw new Error('Existing lead and validated link state required');
    if(![lead.external_id,`CONT_AWD_${lead.payload.sam_api_evidence?.contract_identity??lead.external_id}`].includes(resolution.source_link.identity))
      throw new Error('Repair must identify the exact canonical record');
    if(lead.source_url===resolution.source_url && lead.payload.source_url===resolution.source_url &&
        lead.payload.source_link?.policy===linkPolicy && lead.payload.source_link.status===resolution.source_link.status)
      return null;
    const originals=[lead.source_url,lead.payload.source_url].filter(Boolean);
    const payload={...lead.payload,source_url:resolution.source_url,source_link:resolution.source_link,
      api_link_evidence:{original_urls:[...new Set(originals)],previous:lead.payload.api_link_evidence??null,
        capture_url:resolution.api_capture_url??null}};
    return {id:lead.id,before:lead,source_url:resolution.source_url,payload};
  }).filter(Boolean).filter(r=>!same(r.before.payload,r.payload)||r.before.source_url!==r.source_url);
  if(new Set(records.map(r=>r.id)).size!==records.length)throw new Error('Duplicate repair target');
  return {version:1,kind:'api-link-repair',policy:linkPolicy,project_ref:before.project_ref,records,
    summary:{proposed_changes:records.length,public_links_corrected:records.filter(r=>r.source_url&&r.before.source_url!==r.source_url).length,
      unresolved_marked:records.filter(r=>!r.source_url).length}};
}
export function linkRepairSql(manifest,{schema='public',transaction=true}={}) {
  if(manifest.kind!=='api-link-repair'||manifest.policy!==linkPolicy||!['public','procurement_test'].includes(schema))throw new Error('Typed link repair required');
  for(const r of manifest.records) {
    const allowed={source_url:r.source_url,source_link:r.payload.source_link};
    if(!validLinkState(allowed)||!same(Object.fromEntries(Object.entries(r.payload).filter(([k])=>!['source_url','source_link','api_link_evidence'].includes(k))),
      Object.fromEntries(Object.entries(r.before.payload).filter(([k])=>!['source_url','source_link','api_link_evidence'].includes(k)))))throw new Error('Repair changes unrelated facts');
  }
  const preserved=[...new Set(manifest.records.flatMap(r=>Object.keys(r.before)))].filter(k=>!mutable.includes(k)&&!generated.includes(k));
  const literal=`'${JSON.stringify(manifest).replaceAll("'","''")}'::jsonb`;
  return `${transaction?'begin;':''}
set local lock_timeout='10s'; set local statement_timeout='90s';
lock table ${schema}.procurement_leads in share row exclusive mode;
create temporary table link_repair_manifest on commit drop as select ${literal} as data;
create temporary table link_repair_delta on commit drop as select * from jsonb_to_recordset((select data->'records' from link_repair_manifest)) as d(id uuid,before jsonb,source_url text,payload jsonb);
do $guard$ begin
 if exists(select 1 from link_repair_delta d left join ${schema}.procurement_leads l on l.id=d.id where l.id is null or not
   (to_jsonb(l)=to_jsonb(jsonb_populate_record(null::${schema}.procurement_leads,d.before)) or
     (to_jsonb(l)-'updated_at'-'detected_change_at'=
       to_jsonb(jsonb_populate_record(null::${schema}.procurement_leads,jsonb_set(jsonb_set(d.before,'{payload}',d.payload),'{source_url}',coalesce(to_jsonb(d.source_url),'null'::jsonb))))-'updated_at'-'detected_change_at')))
 then raise exception 'Link repair baseline changed; reconcile before retry'; end if;
end $guard$;
create temporary table link_repair_changed on commit drop as
with changed as (update ${schema}.procurement_leads l set payload=d.payload,source_url=d.source_url
 from link_repair_delta d where l.id=d.id and (l.payload is distinct from d.payload or l.source_url is distinct from d.source_url) returning l.id)
select id from changed;
-- AFTER_CANONICAL_UPSERT: offline fault-injection point.
${preserved.length?`update ${schema}.procurement_leads l set ${preserved.map(k=>`${identifier(k)}=b.${identifier(k)}`).join(',')}
from link_repair_delta d,link_repair_changed c,jsonb_populate_record(null::${schema}.procurement_leads,d.before) b
where l.id=d.id and c.id=d.id;`:''}
${transaction?'commit;':''}`;
}
export function verifyLinkRepair(before,after,manifest) {
  const errors=[],changed=new Set(manifest.records.map(r=>r.id));
  for(const r of manifest.records) {
    const lead=after.procurement_leads.find(l=>l.id===r.id);
    if(!lead||!same(lead.payload,r.payload)||lead.source_url!==r.source_url)errors.push(`Link readback differs: ${r.id}`);
    const original=before.procurement_leads.find(l=>l.id===r.id);
    if(lead)for(const [key,value] of Object.entries(original??r.before))if(!mutable.includes(key)&&!same(lead[key],value))errors.push(`Protected field differs: ${r.id}/${key}`);
  }
  for(const [table,rows] of Object.entries(before))if(Array.isArray(rows)) {
    const current=after[table]??[];
    if(['procurement_events','procurement_versions'].includes(table)) {
      if(rows.some(r=>!same(current.find(c=>c.id===r.id),r)))errors.push(`Prior history changed: ${table}`);
      for(const r of manifest.records)if(current.filter(c=>c.lead_id===r.id&&!rows.some(b=>b.id===c.id)).length!==1)errors.push(`History delta differs: ${table}/${r.id}`);
      if(current.some(c=>!rows.some(b=>b.id===c.id)&&!changed.has(c.lead_id)))errors.push(`Unrelated history changed: ${table}`);
    }else if(table==='procurement_leads') {
      if(current.length!==rows.length||rows.some(r=>!changed.has(r.id)&&!same(current.find(c=>c.id===r.id),r)))errors.push('Unrelated lead or identity changed');
    }else if(!same(rows,current))errors.push(`Unrelated table changed: ${table}`);
  }
  return {verified:!errors.length,errors,counts:manifest.summary};
}
export const repairApproval=p=>hash({kind:p.kind,policy:p.policy,project_ref:p.project_ref,before:p.before,schema:p.schema,
  manifest:p.manifest,sql:p.sql,test:p.test,evidence:p.evidence});
