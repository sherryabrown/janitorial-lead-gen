import {hash} from './reviewed-batch.mjs';
import {same} from './sam-normalize.mjs';
import {identityPolicy,leadSolicitation,mergeIdentity,redirectId} from './county-solicitation-identity.mjs';
const tables=['procurement_contacts','procurement_lead_links','procurement_intake_leads','procurement_request_leads','procurement_lead_notes','procurement_lead_note_edits','procurement_lead_stage_changes'];
export function planCountyDuplicateRepair(before,{originalId,duplicateId}){
 if(![originalId,duplicateId].every(id=>/^[a-f0-9-]{36}$/i.test(id)))throw Error('Exact UUID repair identities required');
 const original=before.procurement_leads.find(l=>l.id===originalId),duplicate=before.procurement_leads.find(l=>l.id===duplicateId);
 if(!original||!duplicate||original.id===duplicate.id||original.source_id!==duplicate.source_id||redirectId(original))throw Error('Exact same-source original and duplicate required');
 if(redirectId(duplicate)){
  if(redirectId(duplicate)!==original.id)throw Error('Different canonical target already recorded');
  return {kind:'county-duplicate-repair',policy:identityPolicy,originalId,duplicateId,records:[],protected:[],summary:{repaired:0,already_repaired:true}};
 }
 const a=leadSolicitation(original,before),b=leadSolicitation(duplicate,before);
 if(!a||!b||a.key!==b.key||!b.observations.some(o=>o.revision)||a.observations.some(o=>o.revision))throw Error('Published original and addendum relationship required');
 if(!['new',null,undefined].includes(duplicate.stage)||['notes','stage_reason','next_action','follow_up_on','estimated_annual_amount'].some(k=>duplicate[k]!=null&&duplicate[k]!=='')||
   (before.procurement_lead_notes??[]).some(n=>n.lead_id===duplicateId)||
   (before.procurement_lead_stage_changes??[]).some(n=>n.lead_id===duplicateId))throw Error('Duplicate has user sales data; resolve conflicts explicitly');
 for(const t of tables)if(!Array.isArray(before[t]))throw Error('Repair requires complete protected relationship/history inventory: '+t);
 const retained={...original.payload,county_solicitation_identity:mergeIdentity(a,b),
  intake_source_evidence:{...(original.payload.intake_source_evidence??{}),...(duplicate.payload.intake_source_evidence??{})},
  canonical_corrections:[...(original.payload.canonical_corrections??[]),{policy:identityPolicy,retired_id:duplicate.id,external_id:duplicate.external_id,reason:`Published ${b.observations[0].display_number} belongs to original ${a.observations[0].display_number}`,before_sha256:hash(duplicate)}]};
 // Keep both rows and all FK children. Only ordinary reads project the retained
 // identity; old receipts/history remain exactly as captured.
 const retired={...duplicate.payload,canonical_redirect:{policy:identityPolicy,lead_id:original.id,reason:'Published addendum reconciled to original solicitation',original_sha256:hash(original),duplicate_sha256:hash(duplicate)}};
 return {version:1,kind:'county-duplicate-repair',policy:identityPolicy,project_ref:before.project_ref,originalId,duplicateId,
  records:[{id:original.id,before:original,payload:retained},{id:duplicate.id,before:duplicate,payload:retired}],
  protected:tables.map(table=>({table,rows:before[table].filter(r=>table==='procurement_lead_note_edits'?(before.procurement_lead_notes??[]).some(n=>[originalId,duplicateId].includes(n.lead_id)&&n.id===r.note_id):table==='procurement_lead_links'?[originalId,duplicateId].includes(r.from_lead)||[originalId,duplicateId].includes(r.to_lead):[originalId,duplicateId].includes(r.lead_id))})),summary:{repaired:1,retained_lead:original.id,retired_lead:duplicate.id,preserved_fk_children:true}};
}
const literal=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
export function countyDuplicateRepairSql(m,{schema='public',transaction=true}={}){
 if(![m.originalId,m.duplicateId].every(id=>/^[a-f0-9-]{36}$/i.test(id)))throw Error('Exact UUID repair identities required');
 if(m.kind!=='county-duplicate-repair'||m.policy!==identityPolicy||!['public','procurement_test'].includes(schema))throw Error('Typed duplicate repair required');
 if(!m.records.length)return '-- Already repaired; no writes.';
 if(m.records.length!==2||m.records[0].id!==m.originalId||m.records[1].id!==m.duplicateId||
  m.records[1].payload.canonical_redirect?.lead_id!==m.originalId)throw Error('Exact original/duplicate repair required');
 const generated=['bid_type','business_category','contracting_entity_geo_level','work_performance_locations'];
 const preserved=Object.keys(m.records[0].before).filter(k=>!['payload','updated_at','detected_change_at',...generated].includes(k));
 if(preserved.some(k=>!/^[_a-z]+$/.test(k)))throw Error('Invalid repair columns');
 const protectedGuards=m.protected.map(({table,rows})=>{
  if(!tables.includes(table))throw Error('Unknown repair dependency');
  // These scoped baselines include note edits via their parent notes. Check
  // counts as well as IDs, so newly inserted user data cannot be lost in a race.
  const scope=table==='procurement_lead_links'?`from_lead in ('${m.originalId}','${m.duplicateId}') or to_lead in ('${m.originalId}','${m.duplicateId}')`:table==='procurement_lead_note_edits'?`note_id in (select id from ${schema}.procurement_lead_notes where lead_id in ('${m.originalId}','${m.duplicateId}'))`:`lead_id in ('${m.originalId}','${m.duplicateId}')`;
  return `if (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from ${schema}.${table} t where ${scope}) <> (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from jsonb_populate_recordset(null::${schema}.${table},${literal([...rows].sort((a,b)=>a.id.localeCompare(b.id)))}) x) then raise exception 'Protected repair dependency changed: ${table}'; end if;`;
 }).join('\n');
 return `${transaction?'begin;':''}
set local lock_timeout='10s';set local statement_timeout='90s';
lock table ${[...tables,'procurement_leads'].map(t=>schema+'.'+t).join(',')} in share row exclusive mode;
create temporary table county_repair_delta on commit drop as select * from jsonb_to_recordset(${literal(m.records)}) as d(id uuid,before jsonb,payload jsonb);
do $guard$ begin
 ${protectedGuards}
 if exists(select 1 from county_repair_delta d left join ${schema}.procurement_leads l on l.id=d.id where l.id is null or not
  (to_jsonb(l)=to_jsonb(jsonb_populate_record(null::${schema}.procurement_leads,d.before)) or
   (to_jsonb(l)-'payload'-'updated_at'-'detected_change_at'=to_jsonb(jsonb_populate_record(null::${schema}.procurement_leads,d.before))-'payload'-'updated_at'-'detected_change_at' and l.payload=d.payload)))
 then raise exception 'Duplicate repair baseline changed';end if;
end $guard$;
create temporary table county_repair_changed on commit drop as with changed as (
 update ${schema}.procurement_leads l set payload=d.payload from county_repair_delta d where l.id=d.id and l.payload is distinct from d.payload returning l.id) select id from changed;
-- AFTER_CANONICAL_UPSERT: offline fault-injection point.
update ${schema}.procurement_leads l set ${preserved.map(k=>`"${k}"=b."${k}"`).join(',')}
from county_repair_delta d,county_repair_changed c,jsonb_populate_record(null::${schema}.procurement_leads,d.before) b where l.id=d.id and c.id=d.id;
${transaction?'commit;':''}`;
}
export function verifyCountyDuplicateRepair(before,after,m){
 const errors=[];
 for(const r of m.records){const now=after.procurement_leads.find(l=>l.id===r.id);
  if(!now||!same(now.payload,r.payload))errors.push('Repair payload differs: '+r.id);
  for(const [k,v] of Object.entries(r.before))if(!['payload','updated_at','detected_change_at'].includes(k)&&!same(now?.[k],v))errors.push('Protected sales/canonical field differs: '+k);
 }
 for(const table of tables)if(!same(before[table],after[table]))errors.push('Protected relationship/history differs: '+table);
 for(const table of ['procurement_versions','procurement_events']){
  for(const row of before[table]??[])if(!same(row,after[table]?.find(r=>r.id===row.id)))errors.push('Existing source history differs');
  const added=(after[table]??[]).filter(r=>!(before[table]??[]).some(b=>b.id===r.id));
  for(const r of m.records){const changed=!same(before.procurement_leads.find(l=>l.id===r.id)?.payload,r.payload);if(added.filter(e=>e.lead_id===r.id).length!==(changed?1:0))errors.push('Source repair audit delta differs: '+table+'/'+r.id);}
  if(added.some(e=>!m.records.some(r=>r.id===e.lead_id)))errors.push('Unrelated source history added');
 }
 for(const l of before.procurement_leads)if(!m.records.some(r=>r.id===l.id)&&!same(l,after.procurement_leads.find(r=>r.id===l.id)))errors.push('Unrelated lead changed');
 return {verified:!errors.length,errors};
}
