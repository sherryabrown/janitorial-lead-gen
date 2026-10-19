import {hash,planReviewedBatch,BatchValidationError} from './reviewed-batch.mjs';

export const samAutomaticPolicy='sam-automatic-v1';
// Only known deterministic validation messages can cross the public boundary.
const validationReasons=[
  'Ambiguous existing lead identity','PIID-only overlap needs manual review',
  'Older capture would replace newer award evidence','Older modification would replace newer award evidence',
  'Older notice would replace newer evidence','Ignored intake cannot be silently revived',
  'Two intakes propose conflicting source evidence',
  'Existing multi-lead/conflicting provenance needs a separately reviewed mapping; do not overwrite it',
];
export function automaticSamReview({request,candidates,runs,snapshot,partial}) {
  const key=hash({policy:samAutomaticPolicy,request:request.id,runs:runs.map(r=>r.run_id).sort(),
    candidates:candidates.map(i=>[i.id,hash(i.payload)]).sort()});
  const review={version:1,batch:`sam-auto-${key.slice(0,48)}`,project_ref:snapshot.project_ref,request_id:request.id,
    work_state:'AR',scope:'Arkansas statewide janitorial work, NAICS 561720, within the saved SAM request window',
    limitations:partial?'Only these audited partial SAM pages; no complete statewide coverage claimed':'Bounded saved SAM window, not all procurement coverage',
    reviewed_by:`system:${samAutomaticPolicy}`,run_ids:runs.map(r=>r.run_id).sort(),allow_partial:partial,
    authorization:{kind:'automatic_sam_policy',version:samAutomaticPolicy,initiated_by:request.initiated_by},decisions:[]};
  const exclusions=[],groups=new Map();
  for(const i of candidates) {
    const p=i.payload,n=p.sam_notice_evidence?.record;
    let reason;
    if(String(p.naics)!=='561720')reason='Official NAICS does not establish janitorial services (561720).';
    else if(!p.work_performance_locations?.some(l=>l.state_code==='AR'))reason='Official work-performance evidence does not establish Arkansas.';
    else if(n&&!n.award&&(!n.responseDeadLine||!Number.isFinite(Date.parse(n.responseDeadLine))))reason='Notice has no valid response deadline; open classification is unproven.';
    else if(n&&!n.award&&!['Combined Synopsis/Solicitation','Solicitation','Presolicitation','Sources Sought'].includes(n.type))reason='Notice type is not supported for automatic opportunity classification.';
    else if(!n&&!p.sam_api_evidence)reason='Saved record has no supported SAM evidence.';
    if(reason){exclusions.push({intake_id:i.id,title:p.title,reason});continue;}
    const d={intake_id:i.id,intake_hash:hash(p),action:'process',approve_new:true,
      reason:`Validated by ${samAutomaticPolicy} against saved official SAM evidence; not human review.`,
      request_match_reason:'Official SAM performance location identifies Arkansas and NAICS 561720 matches the statewide janitorial request.',
      ...(n?{new_bid_type:n.award?'award':Date.parse(n.responseDeadLine)>Date.parse(snapshot.captured_at)?'opportunity':'historical_opportunity'}:{})};
    const identity=p.sam_api_evidence?.contract_identity??p.routed_capture?.record_identity??i.external_id;
    const groupKey=`${i.source_id}:${identity}`;const group=groups.get(groupKey)??[];group.push({i,d});groups.set(groupKey,group);
  }
  for(const group of groups.values()) {
    try {planReviewedBatch(snapshot,{...review,decisions:group.map(x=>x.d)},runs);review.decisions.push(...group.map(x=>x.d));}
    catch(error) {
      if(!(error instanceof BatchValidationError))throw error;
      const reason=validationReasons.includes(error.message)?error.message:'Saved evidence did not pass canonical import validation; inspect its evidence before correcting the record.';
      exclusions.push(...group.map(({i})=>({intake_id:i.id,title:i.payload.title,reason})));
    }
  }
  // The combined plan remains authoritative, including cross-group conflicts.
  if(review.decisions.length)planReviewedBatch(snapshot,review,runs);
  return {key,review,exclusions};
}
