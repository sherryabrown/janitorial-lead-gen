import { randomUUID } from 'node:crypto';
import { awardIdentity, awardPayload, same } from './sam-normalize.mjs';

export const requestId='152f27b9-6888-5020-bede-050439ef87ee';
export const runIds=[
  '205653fc-3e11-45b0-a353-995bf4733e6a','20bc470d-bfd8-4bd7-a4e0-926cdcd3696d',
  '40f1f909-b0cf-41b7-bf4d-8fc4c0d2f4fa','6bea0d5b-9bbe-411b-aa0c-86e2a89afc5a',
  '7517cb38-353d-4e8a-bf08-8e981022057b','8d91dea4-7c62-4c80-99c5-d7b2235b23b0',
  '95675705-79ab-473c-8817-754ba336dfca','b0098f0d-e96b-4c0b-bd66-c611634bb47e',
  'b50adc95-33ed-46da-b9ff-a92c59dab854','cca820ce-2940-46b4-8e25-08d575fdbe84',
];
export const approved={
  '12444026C0006_12C2_-NONE-_-NONE-':'Poteau/Cold Springs facilities need verification against SAM-reported Hot Springs National Park location. Reported 2031 current/potential completion does not prove all options exercised.',
  'W519TC26CA043_9700_-NONE-_-NONE-':'Scope names Pine Bluff Arsenal, but SAM reports Little Rock as performance city. Actual facility location needs verification; current and potential completion dates are distinct.',
  '697DCK24C00028_6920_-NONE-_-NONE-':'FAA QXR ARSR exact facility and janitorial/grounds scope need verification. SAM reports Little Rock and related-service NAICS 561210; 50/50 funding is not an annual revenue estimate.',
};
const own=(o,k)=>Object.hasOwn(o,k);
function cleanEvidence(value) {
  const e=structuredClone(value); delete e.capture_run_ids; delete e.search_queries; return e;
}
export function exactAwards(leads,sources,identity) {
  return leads.filter(l=>(l.source_id===sources['usaspending']&&l.external_id===`CONT_AWD_${identity}`)||
    (l.source_id===sources['sam-awards']&&l.external_id===identity));
}
export function reconcile(snapshot,runs) {
  const sources=Object.fromEntries(snapshot.procurement_sources.map(s=>[s.code,s.id]));
  for(const code of ['sam','sam-awards','usaspending','arbuy-janitorial']) if(!sources[code]) throw new Error(`Missing source ${code}`);
  if(!snapshot.procurement_search_requests.some(r=>r.id===requestId)) throw new Error('Missing pilot request');
  if(!same(runs.map(r=>r.run_id).sort(),[...runIds].sort())||runs.some(r=>r.upstream_status!==200)) throw new Error('Unexpected capture run set');
  const leads=snapshot.procurement_leads, intakes=snapshot.procurement_intake_items;
  const changes=new Map(), decisions=[], unresolved=[], seen=new Set(), identities=new Map();
  for(const run of runs) for(const a of run.response.awardSummary||[]) {
    const identity=awardIdentity(a); identities.set(identity,a.contractId.piid);
  }
  const notices=new Map();
  for(const run of runs) for(const n of run.response.opportunitiesData||[]) notices.set(n.noticeId,n);
  function stage(i,old,patch,queries,basis,identity=null,requestReason=null) {
    if(i.status==='ignored') throw new Error(`Approved intake unexpectedly ignored: ${i.id}`);
    const source=old?.source_id||i.source_id, external=old?.external_id||i.external_id, key=`${source}/${external}`;
    const prior=changes.get(key);
    const id=old?.id||prior?.id||randomUUID();
    const oldLinks=snapshot.procurement_intake_leads.filter(l=>l.intake_id===i.id);
    if(oldLinks.some(l=>l.lead_id!==id)) throw new Error(`Conflicting links require manual review: ${i.id}`);
    const payload={...(prior?.payload||old?.payload||{}),...patch};
    const terms=[old?.search_term_used,prior?.search_term_used,...queries].filter(Boolean).flatMap(s=>s.split('\n'));
    const search=terms.length?[...new Set(terms)].sort().join('\n'):old?.search_term_used??null;
    changes.set(key,{id,source_id:source,external_id:external,expected_payload:old?.payload??null,
      expected_search_term:old?.search_term_used??null,payload,search_term_used:search,identity:identity||prior?.identity||null,
      piid:identity?identities.get(identity):prior?.piid||null});
    decisions.push({intake:i,lead_id:id,source_id:source,external_id:external,basis,expected_links:oldLinks,request_reason:requestReason,
      expected_request:snapshot.procurement_request_leads.find(l=>l.search_request_id===requestId&&l.lead_id===id)||null});
  }
  for(const [identity,piid] of identities) {
    const found=intakes.filter(i=>i.source_id===sources['sam-awards']&&i.external_id===identity);
    if(found.length!==1) throw new Error(`Missing/ambiguous captured intake: ${identity}`);
    const i=found[0]; seen.add(i.id);
    const ev=i.payload.sam_api_evidence;
    if(!ev||awardIdentity(ev.latest_action)!==identity||!ev.capture_run_ids.every(id=>runIds.includes(id))) throw new Error(`Invalid intake evidence ${identity}`);
    if(!runs.some(r=>(r.response.awardSummary||[]).some(a=>same(a,ev.latest_action)))) throw new Error(`Award action differs from saved capture ${identity}`);
    const exact=exactAwards(leads,sources,identity);
    if(exact.length>1||(!exact.length&&leads.some(l=>l.payload.award_id===piid))) throw new Error(`Ambiguous full contract identity: ${identity}`);
    if(!exact.length&&!own(approved,identity)) {unresolved.push({id:i.id,external_id:identity,reason:'Unapproved new award'});continue;}
    const old=exact[0], evidence=cleanEvidence(ev);
    const normalized=awardPayload(ev.latest_action,i.payload.source_url);
    if(normalized.work_performance_locations[0].state_code!=='AR') throw new Error(`Unexpected geography ${identity}`);
    if(old) evidence.canonical_differences=Object.fromEntries(['contract_start','contract_end','ultimate_end','incumbent','incumbent_uei']
      .filter(k=>normalized[k]&&!same(normalized[k],old.payload[k])).map(k=>[k,{existing:old.payload[k]??null,sam:normalized[k]}]));
    const patch=old?{sam_api_evidence:evidence}:{...normalized,sam_api_evidence:evidence,
      status_note:'Awarded contract for incumbent/recompete research; not an open solicitation.',verification_notes:approved[identity]};
    stage(i,old,patch,ev.search_queries||[],'Full four-part contract identity',identity,own(approved,identity)?approved[identity]:null);
  }
  for(const [noticeId,notice] of notices) {
    const i=intakes.find(i=>i.source_id===sources.sam&&i.external_id===noticeId);
    if(!i) throw new Error(`Missing notice intake ${noticeId}`); seen.add(i.id);
    if(['ae70956e37264b6aaa810a75668a7bad','e2b978662702480f9d8fefb1406849d2'].includes(noticeId)) {
      unresolved.push({id:i.id,external_id:noticeId,reason:i.status==='ignored'?'Excluded construction; retain ignored':'Historical solicitation relationship unresolved'});continue;
    }
    if(!['b878faa7fc7a496c9fef1ac3f0798de6','4918f8a64da94373a72f5163ac8991c2','1a71da7afb094db3a2c8b9f5466ad6a2'].includes(noticeId)) throw new Error('Unexpected notice');
    let matches=leads.filter(l=>l.source_id===sources.sam&&l.external_id===noticeId),basis='Exact SAM notice ID';
    if(!matches.length&&notice.award?.number) {
      const ids=[...identities].filter(([,piid])=>piid===notice.award.number);
      if(ids.length!==1) throw new Error('Ambiguous notice award relationship');
      matches=exactAwards(leads,sources,ids[0][0]); basis=`Notice award number corroborated by full contract identity ${ids[0][0]}`;
    }
    if(matches.length!==1) throw new Error(`Notice target missing/ambiguous ${noticeId}`);
    const ev=i.payload.sam_notice_evidence;
    if(!same(ev?.record,notice)) throw new Error(`Notice intake differs from capture ${noticeId}`);
    stage(i,matches[0],{sam_notice_evidence:cleanEvidence(ev)},ev.search_queries||[],basis);
  }
  for(const i of intakes.filter(i=>!seen.has(i.id))) {
    // The reviewed historical detail page has BOTH an exact canonical URL and explicit solicitation ID.
    const matches=leads.filter(l=>l.source_id===i.source_id&&l.external_id==='S000000473'&&
      l.payload.solicitation_id==='S000000473'&&l.payload.source_url===i.payload.url);
    if(i.id==='c83634ab-b711-5b35-a0c5-64f745fa7916'&&i.source_id===sources['arbuy-janitorial']&&
      i.status!=='ignored'&&matches.length===1&&i.payload.text?.includes('Bid Solicitation: S000000473')) {
      stage(i,matches[0],{intake_source_evidence:{intake_id:i.id,source_url:i.payload.url,content_hash:i.payload.hash,
        observed_at:i.payload.observed_at,solicitation_id:'S000000473',note:'Original official detail-page text retained in linked intake; established canonical facts preserved.'}},[],
      'Reviewed exact detail-page URL, same source, and explicit solicitation S000000473');
    } else unresolved.push({id:i.id,external_id:i.external_id,source_id:i.source_id,url:i.payload.url||i.payload.source_url,
      reason:i.external_id==='FWS2025001061'?'Historical forecast promotion excluded from this batch':
        i.status==='ignored'?'Prior ignored status preserved':'No reviewed individual-lead identity; page-level snapshots are not equivalent to contracts'});
  }
  const records=[...changes.values()];
  return {batch:'008_intake_links_and_awards_2026_09_16',sources,request_id:requestId,run_ids:runIds,records,decisions,unresolved,
    summary:{baseline_leads:leads.length,new_leads:records.filter(r=>!r.expected_payload).length,
      evidence_updates:records.filter(r=>r.expected_payload&&!same(r.expected_payload,r.payload)).length,
      links_to_create:decisions.filter(d=>!d.expected_links.length).length,status_changes:decisions.filter(d=>d.intake.status!=='processed').length,
      processed_intakes:decisions.length,older_intake_matches:decisions.filter(d=>d.intake.external_id.startsWith('page:')).length,unresolved:unresolved.length}};
}

const literal=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
export function reconciliationSql(m) {
  // Existing dedicated columns may intentionally differ from older payload facts. Evidence-only merges must not resync them.
  const preserved=['title','agency','source_url','solicitation_number','award_number','publication_date','response_deadline',
    'planned_advertisement_period','contract_start_date','contract_current_end_date','contract_potential_end_date','work_performance_city','work_performance_state'];
  return `-- Approved intake reconciliation. No UI changes or new API requests. Replay-safe guarded transaction.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
lock table public.procurement_leads,public.procurement_intake_items,public.procurement_intake_leads,public.procurement_request_leads in share row exclusive mode;
create temporary table reconciliation_manifest on commit drop as select ${literal(m)} as data;
create temporary table lead_delta on commit drop as select * from jsonb_to_recordset((select data->'records' from reconciliation_manifest))
 as x(id uuid,source_id uuid,external_id text,expected_payload jsonb,expected_search_term text,payload jsonb,search_term_used text,identity text,piid text);
create temporary table intake_delta on commit drop as select * from jsonb_to_recordset((select data->'decisions' from reconciliation_manifest))
 as x(intake jsonb,lead_id uuid,source_id uuid,external_id text,basis text,expected_links jsonb,request_reason text,expected_request jsonb);
do $guard$
begin
 if not exists(select 1 from public.procurement_search_requests where id='${m.request_id}') then raise exception 'Missing pilot request'; end if;
 if exists(select 1 from jsonb_each_text((select data->'sources' from reconciliation_manifest)) s
   where not exists(select 1 from public.procurement_sources p where p.id=s.value::uuid and p.code=s.key)) then raise exception 'Source registry changed'; end if;
 if exists(select 1 from lead_delta d left join public.procurement_leads l using(source_id,external_id)
   where (l.id is null and d.expected_payload is not null) or (l.id is not null and (l.id<>d.id or not (
     (l.payload is not distinct from d.expected_payload and l.search_term_used is not distinct from d.expected_search_term)
     or (l.payload=d.payload and l.search_term_used is not distinct from d.search_term_used))))) then raise exception 'Canonical baseline changed'; end if;
 if exists(select 1 from lead_delta d join public.procurement_leads l on l.id<>d.id
   and ((l.source_id='${m.sources.usaspending}' and l.external_id='CONT_AWD_'||d.identity)
     or (l.source_id='${m.sources['sam-awards']}' and l.external_id=d.identity)
     or (d.expected_payload is null and l.payload->>'award_id'=d.piid))
   where d.identity is not null) then raise exception 'Cross-source contract conflict'; end if;
 if exists(select 1 from intake_delta d left join public.procurement_intake_items i on i.id=(d.intake->>'id')::uuid
   where i.id is null or (to_jsonb(i)-'status'-'updated_at')<>(d.intake-'status'-'updated_at')
     or not ((i.status=d.intake->>'status' and i.updated_at=(d.intake->>'updated_at')::timestamptz)
       or (i.status='processed' and exists(select 1 from public.procurement_intake_leads k where k.intake_id=i.id and k.lead_id=d.lead_id)
         and exists(select 1 from public.procurement_leads l join lead_delta x on l.id=x.id where l.id=d.lead_id and l.payload=x.payload
           and l.search_term_used is not distinct from x.search_term_used)))) then raise exception 'Intake baseline changed'; end if;
 if exists(select 1 from intake_delta d join public.procurement_intake_leads k on k.intake_id=(d.intake->>'id')::uuid
   where k.lead_id<>d.lead_id or (jsonb_array_length(d.expected_links)>0 and not d.expected_links @> jsonb_build_array(to_jsonb(k))))
   or exists(select 1 from intake_delta d cross join lateral jsonb_array_elements(d.expected_links) k
     where not exists(select 1 from public.procurement_intake_leads l where to_jsonb(l)=k)) then raise exception 'Intake links changed'; end if;
 if exists(select 1 from intake_delta d where d.request_reason is not null and d.expected_request is not null
   and not exists(select 1 from public.procurement_request_leads r where to_jsonb(r)=d.expected_request)) then raise exception 'Request classification changed'; end if;
 if exists(select 1 from intake_delta d join public.procurement_request_leads r on r.lead_id=d.lead_id and r.search_request_id='${m.request_id}'
   where d.request_reason is not null and d.expected_request is null and (r.match_status<>'needs_location_review' or r.match_reason<>d.request_reason)) then raise exception 'New conflicting request classification'; end if;
end $guard$;
create temporary table canonical_columns_before on commit drop as
select l.id,${preserved.map(k=>`l.${k}`).join(',')} from public.procurement_leads l join lead_delta d on d.id=l.id;
insert into public.procurement_leads(id,source_id,external_id,payload,search_term_used)
select id,source_id,external_id,payload,search_term_used from lead_delta
on conflict(source_id,external_id) do update set payload=excluded.payload,search_term_used=excluded.search_term_used,updated_at=now(),
 detected_change_at=case when procurement_leads.payload is distinct from excluded.payload then now() else procurement_leads.detected_change_at end
where procurement_leads.payload is distinct from excluded.payload or procurement_leads.search_term_used is distinct from excluded.search_term_used;
-- The existing payload trigger resynchronizes dedicated fields. Restore existing values in this same transaction;
-- this non-payload update generates no source-change event and leaves newly inserted award fields intact.
update public.procurement_leads l set ${preserved.map(k=>`${k}=b.${k}`).join(',')}
from canonical_columns_before b where l.id=b.id and row(${preserved.map(k=>`l.${k}`).join(',')}) is distinct from row(${preserved.map(k=>`b.${k}`).join(',')});
-- AFTER_CANONICAL_UPSERT: offline fault-injection point.
insert into public.procurement_intake_leads(intake_id,lead_id)
select (intake->>'id')::uuid,lead_id from intake_delta on conflict(intake_id,lead_id) do nothing;
insert into public.procurement_request_leads(search_request_id,lead_id,match_status,match_reason)
select '${m.request_id}',lead_id,'needs_location_review',request_reason from intake_delta where request_reason is not null
on conflict(search_request_id,lead_id) do nothing;
update public.procurement_intake_items i set status='processed',updated_at=now()
from intake_delta d where i.id=(d.intake->>'id')::uuid and i.status<>'processed';
do $verify$
begin
 if exists(select 1 from intake_delta d left join public.procurement_intake_items i on i.id=(d.intake->>'id')::uuid
   where i.status is distinct from 'processed' or not exists(select 1 from public.procurement_intake_leads k where k.intake_id=i.id and k.lead_id=d.lead_id))
   or exists(select 1 from lead_delta d left join public.procurement_leads l on l.id=d.id where l.payload is distinct from d.payload
     or l.search_term_used is distinct from d.search_term_used) then raise exception 'Reconciliation postcondition failed'; end if;
end $verify$;
commit;
`;
}
