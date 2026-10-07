import {apiProvenance,verifyAwardLink,noticeRecordLink,unresolvedLink} from './api-record-links.mjs';
import {hash} from './reviewed-batch.mjs';

export async function auditLeadLinks(before,saved={}, {limit=50,fetcher=fetch,userEditedIds=[]}={}) {
  const ids=new Set(before.procurement_leads.map(l=>l.id));
  const entries=Object.fromEntries(Object.entries(saved).filter(([id])=>ids.has(id)));let fetches=0;
  for(const lead of before.procurement_leads) {
    const baseline_hash=hash(lead);
    if(!userEditedIds.includes(lead.id) && entries[lead.id]?.baseline_hash===baseline_hash &&
      Date.now()-Date.parse(entries[lead.id].checked_at)<7*86400000)continue;
    delete entries[lead.id];
    const source=before.procurement_sources.find(s=>s.id===lead.source_id),provenance=apiProvenance(lead,source);
    const item={lead_id:lead.id,source_code:source?.code??'unknown',provenance,url:lead.source_url??lead.payload.source_url,
      baseline_hash,checked_at:new Date().toISOString()};
    if(provenance==='non_api'){entries[lead.id]={...item,outcome:'excluded_non_api'};continue;}
    if(provenance==='ambiguous'){entries[lead.id]={...item,outcome:'ambiguous_provenance',next_action:'Operator: inspect original capture/intake to establish API origin before any link changes.'};continue;}
    if(userEditedIds.includes(lead.id)||lead.source_url&&lead.payload.source_url&&lead.source_url!==lead.payload.source_url) {
      entries[lead.id]={...item,outcome:'preserved_user_override',next_action:'User: review the dedicated/payload link disagreement or saved URL edit before repair.'};continue;
    }
    let resolution;
    if(source.code==='usaspending'||source.code==='sam-awards') {
      if(fetches>=limit)continue;
      fetches++;
      const identity=source.code==='usaspending'?lead.external_id:`CONT_AWD_${lead.payload.sam_api_evidence?.contract_identity??lead.external_id}`;
      resolution=await verifyAwardLink(identity,{fetcher});
    }else if(source.code==='sam') {
      const record=lead.payload.sam_notice_evidence?.record;
      resolution={...noticeRecordLink(record,lead.external_id,lead.payload.api_capture_url),evidence:{record,origin:'saved_sam_notice'}};
    }
    else resolution=unresolvedLink(lead.external_id,'API public detail link method is not verified');
    const outcome=resolution.source_link.status==='verified'?
      item.url===resolution.source_url?'verified_unchanged':'needs_correct_link':'unresolved';
    entries[lead.id]={...item,outcome,resolution,next_action:resolution.source_link.next_action??null};
  }
  const by_source={};
  for(const lead of before.procurement_leads) {
    const source=before.procurement_sources.find(s=>s.id===lead.source_id)?.code??'unknown',item=entries[lead.id];
    const counts=by_source[source]??={checked:0,verified_unchanged:0,needs_correct_link:0,unresolved:0,excluded_non_api:0,ambiguous_provenance:0,preserved_user_override:0,pending:0,corrected:0};
    counts.checked++;counts[item?.outcome??'pending']++;
  }
  return {entries,by_source,checked:before.procurement_leads.length,fetches,pending:before.procurement_leads.filter(l=>!entries[l.id]).length,corrected:0};
}
