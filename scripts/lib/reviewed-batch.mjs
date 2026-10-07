import { createHash } from 'node:crypto';
import { awardIdentity,actionIdentity,awardDate,awardPayload,responseSummary,same,stable } from './sam-normalize.mjs';
import { exactAwards } from './intake-reconcile.mjs';

export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(stable(value))).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const need=(condition,message)=>{if(!condition) throw new Error(message);};
const idFor=(batch,source,external)=>{
  const h=hash([batch,source,external]);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
export function validateReview(review) {
  need(review.version===1,'Unsupported batch version');
  need(/^[a-z0-9][a-z0-9_-]{0,79}$/.test(review.batch),'Use a simple unique batch name');
  need(/^[a-z]{20}$/.test(review.project_ref),'Explicit Supabase project_ref required');
  need(uuid.test(review.request_id),'Explicit request_id required');
  need(/^[A-Z]{2}$/.test(review.work_state),'Explicit two-letter work state required');
  need(typeof review.scope==='string'&&review.scope.trim(),'Describe service/geographic/date scope');
  need(typeof review.limitations==='string'&&review.limitations.trim(),'Record coverage limitations, not a claim of complete procurement coverage');
  need(typeof review.reviewed_by==='string'&&review.reviewed_by.trim(),'Record who reviewed this batch');
  need(Array.isArray(review.run_ids)&&new Set(review.run_ids).size===review.run_ids.length&&review.run_ids.every(x=>uuid.test(x)),'Invalid/duplicate run IDs');
  need(Array.isArray(review.decisions)&&review.decisions.length>0,'Review decisions are required; init does not approve anything');
  need(new Set(review.decisions.map(d=>d.intake_id)).size===review.decisions.length,'Duplicate intake decision');
  for(const d of review.decisions) {
    need(uuid.test(d.intake_id)&&['process','defer'].includes(d.action),'Each decision requires intake_id and process/defer');
    need(typeof d.reason==='string'&&d.reason.trim(),'Each decision needs a reason');
    need(/^[a-f0-9]{64}$/.test(d.intake_hash),'Each decision must bind the reviewed intake payload hash');
    if(d.action==='defer') need(!d.approve_new&&!d.target,'Deferred items cannot contain promotion instructions');
  }
}

export function collectRuns(runs,expectedIds,{allow_partial=false}={}) {
  need(same(runs.map(r=>r.run_id).sort(),[...expectedIds].sort()),'Capture files must match explicit run_ids exactly');
  const awards=new Map(),notices=new Map(),groups=new Map();let returned=0;
  for(const r of runs) {
    need(r.collector==='sam-search'&&r.upstream_status===200&&r.captured===true,'Failed or unaudited API capture cannot be processed');
    need(['awards','opportunities'].includes(r.kind),'Unsupported API kind');
    const limit=Number(r.filters?.limit),offset=Number(r.filters?.offset??0);
    need(Number.isInteger(limit)&&limit>0&&Number.isInteger(offset)&&offset>=0,'Explicit page size/index required');
    const summary=responseSummary(r.kind,r.response,limit,offset);
    need(summary.recognized,'Unknown API envelope cannot be treated as zero results');returned+=summary.count;
    const query={...r.filters};delete query.offset;
    const key=JSON.stringify(stable({kind:r.kind,query}));
    const pages=groups.get(key)||[];pages.push({offset,complete:summary.complete,count:summary.count});groups.set(key,pages);
    for(const row of r.response.awardSummary||[]) {
      const identity=awardIdentity(row),action=actionIdentity(row);
      const group=awards.get(identity)||{actions:new Map(),run_ids:new Set(),queries:new Set()};
      const old=group.actions.get(action);
      if(old&&!same(old,row)) {
        const od=old.awardDetails?.transactionData?.lastModifiedDate,nd=row.awardDetails?.transactionData?.lastModifiedDate;
        need(od&&nd&&od!==nd,'Conflicting versions of same award action without ordered modification timestamps');
        if(Date.parse(nd)>Date.parse(od)) group.actions.set(action,row);
      } else group.actions.set(action,row);
      group.run_ids.add(r.run_id);group.queries.add(r.query_url);awards.set(identity,group);
    }
    for(const row of r.response.opportunitiesData||[]) {
      need(typeof row.noticeId==='string'&&row.noticeId,'Missing SAM notice ID');
      const group=notices.get(row.noticeId)||{row,run_ids:new Set(),queries:new Set()};
      need(same(group.row,row),'Conflicting notice versions need an explicitly reviewed run set');
      group.run_ids.add(r.run_id);group.queries.add(r.query_url);notices.set(row.noticeId,group);
    }
  }
  const incomplete=[...groups.values()].filter(pages=>{
    pages.sort((a,b)=>a.offset-b.offset);
    need(new Set(pages.map(p=>p.offset)).size===pages.length,'Duplicate pages: choose one reviewed response per query/page');
    return pages.some((p,i)=>p.offset!==i)||!pages.at(-1)?.complete;
  });
  need(!incomplete.length||allow_partial,'Incomplete/duplicate/gapped pages: finish capture or explicitly approve partial coverage');
  return {awards,notices,returned,partial:incomplete.length>0};
}
function evidenceFor(i,collection) {
  const captureIdentity=i.payload.routed_capture?.record_identity??i.external_id;
  const award=collection.awards.get(captureIdentity);
  if(award&&i.payload.sam_api_evidence) {
    const rows=[...award.actions.values()].sort((a,b)=>awardDate(b).localeCompare(awardDate(a))||
      (b.awardDetails?.transactionData?.lastModifiedDate||'').localeCompare(a.awardDetails?.transactionData?.lastModifiedDate||''));
    const row=rows[0],identity=awardIdentity(row);
    const payload=awardPayload(row,`https://api.sam.gov/contract-awards/v1/search?piid=${encodeURIComponent(row.contractId.piid)}`);
    return {kind:'award',identity,payload,queries:[...award.queries].sort(),evidence:{contract_identity:identity,latest_action:row,
      action_ids:[...award.actions.keys()].sort(),reconciliation_note:'Latest signed action within the reviewed search window, not guaranteed all-time latest; canonical conflicts require separate review.'}};
  }
  const notice=collection.notices.get(captureIdentity);
  if(notice&&i.payload.sam_notice_evidence) return {kind:'notice',record:notice.row,queries:[...notice.queries].sort(),evidence:{record:notice.row}};
  need(!i.payload.sam_api_evidence&&!i.payload.sam_notice_evidence,'API intake lacks matching evidence in explicit batch captures');
  return {kind:'manual',queries:[],payload:i.payload};
}
export function planReviewedBatch(snapshot,review,runs) {
  validateReview(review);
  need(snapshot.project_ref===review.project_ref,'Snapshot project does not match reviewed project');
  const sources=Object.fromEntries(snapshot.procurement_sources.map(s=>[s.code,s.id]));
  need(Object.values(sources).every(id=>uuid.test(id)),'Invalid source registry UUID');
  if(review.run_ids.length)need(sources.sam&&sources['sam-awards']&&sources.usaspending,'Required SAM/USAspending sources missing');
  need(snapshot.procurement_search_requests.some(r=>r.id===review.request_id),'Reviewed request not found');
  const collection=collectRuns(runs,review.run_ids,{allow_partial:review.allow_partial===true});
  const records=new Map(),decisions=[],unresolved=[];let sameLead=0;
  const leads=snapshot.procurement_leads;
  for(const d of review.decisions) {
    const i=snapshot.procurement_intake_items.find(i=>i.id===d.intake_id);
    need(i&&hash(i.payload)===d.intake_hash,`Intake content changed/missing: ${d.intake_id}`);
    if(d.action==='defer') {unresolved.push({id:i.id,external_id:i.external_id,status:i.status,reason:d.reason});continue;}
    need(i.status!=='ignored','Ignored intake cannot be silently revived');
    const evidence=evidenceFor(i,collection);
    if(i.payload.manual_capture) {
      need(i.payload.manual_capture.confidence==='primary','Secondary candidate requires primary verification before promotion');
      need(i.payload.manual_capture.request_ids.includes(review.request_id),'Manual capture belongs to another geographic request');
      need(i.payload.manual_capture.evidence?.length,'Manual provenance missing');
      if(i.payload.bid_type==='opportunity')need(i.payload.deadline&&Date.parse(i.payload.deadline)>Date.parse(snapshot.captured_at),'Expired or undated manual solicitation cannot be presented as open');
    }
    if(evidence.kind==='notice') need(i.source_id===sources.sam,'Notice intake has wrong source');
    const manual=i.payload.manual_capture;
    const recordExternal=manual?.record_external_id??i.payload.routed_capture?.record_identity??i.external_id;
    let matches=leads.filter(l=>l.source_id===i.source_id&&l.external_id===recordExternal),identity=null;
    if(manual?.amends_intake_id) {
      const parent=snapshot.procurement_intake_items.find(x=>x.id===manual.amends_intake_id);
      need(parent&&parent.source_id===i.source_id&&parent.status!=='ignored'&&
        (parent.payload.manual_capture?.record_external_id??parent.external_id)===recordExternal,'Invalid amendment parent/record');
      need(snapshot.procurement_intake_leads.some(l=>l.intake_id===parent.id) ||
        (d.supersedes_pending_intake_id===parent.id&&parent.status==='pending'&&
          !snapshot.procurement_intake_leads.some(l=>l.intake_id===parent.id)),
        'Amendment parent must already link to one canonical lead; review the original first');
    }
    if(evidence.kind==='award') {
      need(i.source_id===sources['sam-awards'],'Award intake has wrong source');identity=evidence.identity;
      matches=exactAwards(leads,sources,identity);
      need(matches.length||!leads.some(l=>l.payload.award_id===evidence.payload.award_id),'PIID-only overlap needs manual review');
    }
    if(d.target) {
      const target=leads.filter(l=>l.source_id===sources[d.target.source_code]&&l.external_id===d.target.external_id);
      need(target.length===1,'Explicit target must be a unique existing lead');
      if(evidence.kind==='award') need(matches.length===1&&matches[0].id===target[0].id,'Target conflicts with full award identity');
      else if(evidence.kind==='notice'&&target[0].source_id!==i.source_id) {
        need(d.contract_identity&&collection.awards.has(d.contract_identity),'Notice-to-award link needs corroborating captured full identity');
        const award=collection.awards.get(d.contract_identity).actions.values().next().value;
        need(evidence.record.award?.number===award.contractId.piid&&exactAwards(leads,sources,d.contract_identity).some(l=>l.id===target[0].id),'Notice/award identity mismatch');
        identity=d.contract_identity;
      } else if(evidence.kind==='manual'&&i.external_id.startsWith('page:')) {
        const p=d.match_evidence;
        need(p&&target[0].source_id===i.source_id&&p.source_url===i.payload.url&&target[0].payload.source_url===p.source_url&&
          p.solicitation_id&&target[0].payload.solicitation_id===p.solicitation_id&&
          typeof p.exact_text==='string'&&p.exact_text.includes(p.solicitation_id)&&i.payload.text?.includes(p.exact_text),'Page backfill needs exact detail URL and explicit identifier text, not a title similarity');
      } else if(evidence.kind==='manual'&&target[0].source_id!==i.source_id) {
        const p=d.match_evidence;
        need(manual?.confidence==='primary'&&p?.solicitation_id&&
          p.solicitation_id===target[0].payload.solicitation_id&&
          p.solicitation_id===i.payload.solicitation_id&&
          p.source_url===i.payload.source_url&&
          typeof p.exact_text==='string'&&p.exact_text.includes(p.solicitation_id)&&
          manual.evidence.some(e=>e.url===p.source_url&&e.excerpt.includes(p.exact_text)),
          'Cross-source manual match needs primary evidence and an exact shared solicitation identifier');
      } else need(target[0].source_id===i.source_id&&target[0].external_id===recordExternal,'Unproven cross-source merge');
      matches=target;
    }
    need(matches.length<=1,'Ambiguous existing lead identity');
    const old=matches[0];
    if(manual?.amends_intake_id)need((old&&snapshot.procurement_intake_leads.some(l=>
      l.intake_id===manual.amends_intake_id&&l.lead_id===old.id)) ||
      (!old&&d.supersedes_pending_intake_id===manual.amends_intake_id),
      'Amendment target must match the parent canonical lead');
    need(old||d.approve_new===true,'New lead requires explicit approve_new decision');
    need(old||!i.external_id.startsWith('page:'),'Page snapshots cannot become canonical leads');
    let patch;
    if(evidence.kind==='award') {
      const ev=evidence.evidence;
      const prev=old?.payload.sam_api_evidence?.latest_action;
      if(prev) {
        need(awardDate(ev.latest_action)>=awardDate(prev),'Older capture would replace newer award evidence');
        if(awardDate(ev.latest_action)===awardDate(prev)&&prev.awardDetails?.transactionData?.lastModifiedDate&&ev.latest_action.awardDetails?.transactionData?.lastModifiedDate)
          need(Date.parse(ev.latest_action.awardDetails.transactionData.lastModifiedDate)>=Date.parse(prev.awardDetails.transactionData.lastModifiedDate),'Older modification would replace newer award evidence');
      }
      ev.canonical_differences=old?Object.fromEntries(['contract_start','contract_end','ultimate_end','incumbent','incumbent_uei']
        .filter(k=>evidence.payload[k]&&!same(evidence.payload[k],old.payload[k])).map(k=>[k,{existing:old.payload[k]??null,sam:evidence.payload[k]}])):{};
      patch=old?{sam_api_evidence:ev}:{...evidence.payload,sam_api_evidence:ev,status_note:'Awarded contract/incumbent research, not an open solicitation.',verification_notes:d.reason};
    } else if(evidence.kind==='notice') {
      const previous=old?.payload.sam_notice_evidence?.record;
      if(previous?.postedDate&&evidence.record.postedDate) need(evidence.record.postedDate>=previous.postedDate,'Older notice would replace newer evidence');
      patch=old?{sam_notice_evidence:evidence.evidence}:{...i.payload,sam_notice_evidence:evidence.evidence};
      if(!old) {
        need(same(i.payload.sam_notice_evidence.record,evidence.record),'New notice payload must reflect the reviewed current capture');
        need(['opportunity','historical_opportunity','award'].includes(d.new_bid_type),'Review the new notice classification explicitly');
        need(!evidence.record.award||d.new_bid_type==='award','Award notice cannot be presented as open');
        if(d.new_bid_type==='opportunity'&&evidence.record.responseDeadLine) need(Date.parse(evidence.record.responseDeadLine)>Date.parse(snapshot.captured_at),'Expired notice cannot be presented as open');
        patch.bid_type=d.new_bid_type;
      }
    } else {
      const provenance={intake_id:i.id,content_hash:hash(i.payload),reason:d.reason};
      const sourceFacts=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['manual_capture','intake_source_evidence','known_source_interpretation'].includes(k)));
      const parent=manual?.amends_intake_id?snapshot.procurement_intake_items.find(x=>x.id===manual.amends_intake_id):null;
      // Retrieval/scope-only observations get intake links, without a business-change event.
      const unchangedObservation=parent&&same(sourceFacts(parent.payload),sourceFacts(i.payload));
      patch=old?(unchangedObservation?{}:{intake_source_evidence:{...(old.payload.intake_source_evidence||{}),[i.id]:provenance}}):{...i.payload,intake_source_evidence:{[i.id]:provenance}};
    }
    if(d.promote_existing_to_award===true) {
      need(old&&evidence.kind==='manual'&&manual?.amends_intake_id&&
        old.payload.bid_type==='intent_to_award'&&i.payload.bid_type==='award'&&
        i.payload.executed_contract_verified===true&&
        i.payload.solicitation_id===old.payload.solicitation_id&&
        /^\d{4}-\d{2}-\d{2}$/.test(i.payload.contract_start||'')&&
        /^\d{4}-\d{2}-\d{2}$/.test(i.payload.contract_end||'')&&
        i.payload.contract_start<=i.payload.contract_end&&
        manual.evidence.some(e=>e.url===i.payload.source_url&&/signature|signed/i.test(e.locator)),
        'Existing award promotion needs a linked primary signed-contract amendment and exact solicitation');
      patch={...patch,bid_type:'award',award_stage:'executed_statewide_contract',
        executed_contract_verified:true,contract_start:i.payload.contract_start,
        contract_end:i.payload.contract_end,incumbent:i.payload.incumbent,
        status_note:i.payload.status_note};
    }
    if(!old) {
      need(patch.title&&/^https:\/\//.test(patch.source_url||'')&&['award','contract','forecast','opportunity','historical_opportunity','intent_to_award'].includes(patch.bid_type),'New lead must have verified source URL, title, and valid classification');
      need(Array.isArray(patch.work_performance_locations)&&patch.work_performance_locations.length,'Work-location evidence required');
      const knownStates=patch.work_performance_locations.map(l=>l.state_code).filter(Boolean);
      need(!knownStates.length||knownStates.includes(review.work_state),'Explicit out-of-state work cannot be imported through location uncertainty');
      need(patch.work_performance_locations.some(l=>l.state_code===review.work_state)||d.allow_location_uncertainty===true,'Out-of-scope/unknown location needs explicit review');
      need(typeof d.request_match_reason==='string'&&d.request_match_reason.trim(),'New lead requires request-location explanation');
    }
    const source=old?.source_id||i.source_id,external=old?.external_id||recordExternal,key=`${source}/${external}`;
    const prior=records.get(key),id=old?.id||prior?.id||idFor(review.batch,source,external);
    const links=snapshot.procurement_intake_leads.filter(k=>k.intake_id===i.id);
    need(links.every(k=>k.lead_id===id),'Existing multi-lead/conflicting provenance needs a separately reviewed mapping; do not overwrite it');
    const payload={...(prior?.payload||old?.payload||{}),...patch};
    if(prior) for(const k of Object.keys(patch)) need(!Object.hasOwn(prior.payload,k)||!['sam_api_evidence','sam_notice_evidence'].includes(k)||same(prior.payload[k],patch[k]),'Two intakes propose conflicting source evidence');
    const terms=[old?.search_term_used,prior?.search_term_used,...evidence.queries].filter(Boolean).flatMap(x=>x.split('\n'));
    records.set(key,{id,source_id:source,external_id:external,expected_payload:old?.payload??null,expected_search_term:old?.search_term_used??null,
      reviewed_award_promotion:d.promote_existing_to_award===true,
      payload,search_term_used:terms.length?[...new Set(terms)].sort().join('\n'):old?.search_term_used??null,
      identity:identity||prior?.identity||null,piid:identity?(evidence.payload?.award_id||evidence.record?.award?.number):prior?.piid||null});
    if(old) sameLead++;
    decisions.push({intake:i,lead_id:id,source_id:source,external_id:external,basis:d.reason,expected_links:links,
      request_reason:typeof d.request_match_reason==='string'&&d.request_match_reason.trim()?d.request_match_reason:null,expected_request:snapshot.procurement_request_leads.find(r=>r.lead_id===id&&r.search_request_id===review.request_id)||null});
  }
  // Never hide captured items simply because the reviewer selected a smaller processing subset.
  for(const [sourceCode,keys] of [['sam-awards',[...collection.awards.keys()]],['sam',[...collection.notices.keys()]]]) {
    for(const external of keys) {
      const selected=snapshot.procurement_intake_items.filter(i=>i.source_id===sources[sourceCode]&&
        (i.payload.routed_capture?.record_identity??i.external_id)===external);
      const i=selected.find(i=>review.decisions.some(d=>d.intake_id===i.id))??selected[0];
      if(!i||!review.decisions.some(d=>d.intake_id===i.id)) unresolved.push({id:i?.id||null,external_id:external,status:i?.status||'not_staged',
        reason:'Captured but not explicitly selected/reviewed in this batch; no processing performed'});
    }
  }
  const rows=[...records.values()];
  return {version:1,batch:review.batch,project_ref:review.project_ref,sources,request_id:review.request_id,run_ids:review.run_ids,
    coverage:{scope:review.scope,limitations:review.limitations,partial:collection.partial},records:rows,decisions,unresolved,
    summary:{baseline_leads:leads.length,found_actions_or_notices:collection.returned,distinct_awards:collection.awards.size,distinct_notices:collection.notices.size,
      scoped_intakes:review.decisions.length,already_staged:review.decisions.length,matched_existing_intakes:sameLead,
      new_leads:rows.filter(r=>!r.expected_payload).length,evidence_updates:rows.filter(r=>r.expected_payload&&!same(r.expected_payload,r.payload)).length,
      unchanged_leads:rows.filter(r=>r.expected_payload&&same(r.expected_payload,r.payload)&&r.expected_search_term===r.search_term_used).length,
      links_to_create:decisions.filter(d=>!d.expected_links.length).length,status_changes:decisions.filter(d=>d.intake.status!=='processed').length,
      processed_intakes:decisions.length,older_intake_matches:decisions.filter(d=>d.intake.external_id.startsWith('page:')).length,unresolved:unresolved.length}};
}
