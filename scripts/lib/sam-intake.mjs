import { awardDate, awardPayload } from './sam-normalize.mjs';
import {noticeRecordLink} from './api-record-links.mjs';

export function samIntakeRows(collection, source, routeRecord=(_sourceId,identity)=>({external_id:identity,metadata:{}}),awardLinks={}) {
  const items=[];
  for (const [identity,g] of collection.awards) {
    const row=[...g.actions.values()].sort((a,b)=>awardDate(b).localeCompare(awardDate(a))||
      (b.awardDetails?.transactionData?.lastModifiedDate||'').localeCompare(a.awardDetails?.transactionData?.lastModifiedDate||''))[0];
    const routed=routeRecord(source('sam-awards'),identity,row);if(!routed)continue;
    items.push({source_id:source('sam-awards'),external_id:routed.external_id,status:'pending',review_reason:'Captured SAM contract actions; service, geography, identity and promotion require review.',
      payload:{...awardPayload(row,`https://api.sam.gov/contract-awards/v1/search?piid=${encodeURIComponent(row.contractId.piid)}`),
        ...(awardLinks[identity]??{}),
        ...routed.metadata,
        sam_api_evidence:{contract_identity:identity,latest_action:row,action_ids:[...g.actions.keys()].sort(),capture_run_ids:[...g.run_ids].sort(),search_queries:[...g.queries].sort()}}});
  }
  for (const [id,g] of collection.notices) {
    const n=g.row,loc=n.placeOfPerformance||{};
    const routed=routeRecord(source('sam'),id,n);if(!routed)continue;
    items.push({source_id:source('sam'),external_id:routed.external_id,status:'pending',review_reason:'Captured SAM notice; Active does not prove open. Review deadline, service, geography and relationships.',
      payload:{title:n.title,...noticeRecordLink(n,id,'https://api.sam.gov/opportunities/v2/search'),bid_type:n.award?'award':'opportunity',business_category:'other_public',
        ...routed.metadata,
        contracting_entity_geo_level:'federal',agency:n.fullParentPathName,solicitation_id:n.solicitationNumber,naics:n.naicsCode,deadline:n.responseDeadLine||null,
        work_performance_locations:[{city_name:loc.city?.name||null,state_code:loc.state?.code||null,evidence:loc.streetAddress||'SAM placeOfPerformance; not contracting office'}],
        sam_notice_evidence:{record:n,capture_run_ids:[...g.run_ids].sort(),search_queries:[...g.queries].sort()}}});
  }
  return items;
}
