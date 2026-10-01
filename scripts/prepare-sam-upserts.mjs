import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adminClient } from './lib/supabase-admin.mjs';
import { awardIdentity, actionIdentity, awardDate, awardPayload, responseSummary, same } from './lib/sam-normalize.mjs';

// Reads live baseline, stages captures only with --capture, NEVER writes procurement_leads.
// Approved intake linking/promotion is a separate workflow: prepare-intake-processing.mjs.
// Historical 007 output is NOT the applied 008 batch; see docs/SAM-SEARCH-PLAYBOOK.md.
if(!process.argv.includes('--historical-batch')) {
  console.error('Historical September 16 batch tool. Use procurement-workflow.mjs for new batches. Explicit --historical-batch is required to run this archived workflow.');
  process.exit(2);
}
const capture = process.argv.includes('--capture');
const dir = resolve('outputs/sam-search');
const db = adminClient();
async function checked(query) { const {data,error} = await query; if(error) throw new Error(error.message); return data; }
const sources = await checked(db.from('procurement_sources').select('id,code'));
const sid = code => { const id=sources.find(s=>s.code===code)?.id; if(!id) throw new Error(`Missing source ${code}`); return id; };
const baseline = [];
for(let offset=0;;offset+=1000) {
  const rows=await checked(db.from('procurement_leads').select('id,source_id,external_id,payload,search_term_used,created_at').order('id').range(offset,offset+999));
  baseline.push(...rows); if(rows.length<1000) break;
}
writeFileSync(resolve(dir,'live-baseline.json'),JSON.stringify(baseline,null,2)+'\n');
const runs = readdirSync(dir).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>JSON.parse(readFileSync(resolve(dir,f),'utf8')))
  .filter(r=>r.collector==='sam-search' && r.upstream_status===200);
const awards = new Map(), notices = new Map(), queries = [], excluded = [], review = [];
for(const run of runs) {
  const s=responseSummary(run.kind,run.response,Number(run.filters.limit),Number(run.filters.offset));
  queries.push({run_id:run.run_id,kind:run.kind,query_url:run.query_url,...s});
  if(capture && (s.count!==run.record_count || s.complete!==run.complete_for_query)) {
    // Correct local parser metadata only, from the already-captured response; never resend SAM requests.
    const prior = await checked(db.from('procurement_runs').select('detail').eq('id',run.run_id).single());
    await checked(db.from('procurement_runs').update({record_count:s.count,status:s.complete?'success':'partial',
      detail:{...prior.detail,complete_for_query:s.complete,parser_reconciled:true}}).eq('id',run.run_id));
    run.record_count=s.count; run.complete_for_query=s.complete; run.status=s.complete?'success':'partial';
    writeFileSync(resolve(dir,`${run.run_id}.json`),JSON.stringify(run,null,2)+'\n');
  }
  for(const row of run.response.awardSummary || []) {
    const id=awardIdentity(row), action=actionIdentity(row);
    const group=awards.get(id)||{rows:new Map(),queries:new Set(),run_ids:new Set()};
    group.rows.set(action,row); group.queries.add(run.query_url); group.run_ids.add(run.run_id); awards.set(id,group);
  }
  for(const row of run.response.opportunitiesData || []) {
    const group=notices.get(row.noticeId)||{row,queries:new Set(),run_ids:new Set()};
    group.queries.add(run.query_url); group.run_ids.add(run.run_id); notices.set(row.noticeId,group);
  }
}
const changes = new Map(), staged = [];
function propose(sourceId,externalId,payload,queryStrings,existing=null) {
  // Observation IDs and query windows belong in runs/intake/search_term_used, not payload changes.
  payload=structuredClone(payload);
  for(const key of ['sam_api_evidence','sam_notice_evidence']) if(payload[key]) {
    delete payload[key].capture_run_ids; delete payload[key].search_queries;
  }
  const key=`${sourceId}/${externalId}`;
  const previous=changes.get(key);
  const before=previous?.expected_payload ?? existing?.payload ?? null;
  const merged={...(previous?.payload || existing?.payload || {}),...payload};
  const search=[existing?.search_term_used,previous?.search_term_used,...queryStrings].filter(Boolean);
  const searchTerm=[...new Set(search.flatMap(s=>s.split('\n')))].sort().join('\n');
  changes.set(key,{id:existing?.id||null,source_id:sourceId,external_id:externalId,payload:merged,
    expected_payload:before,expected_search_term:existing?.search_term_used??null,search_term_used:searchTerm});
}
for(const [identity,g] of awards) {
  const rows=[...g.rows.values()].sort((a,b)=>awardDate(b).localeCompare(awardDate(a)) ||
    (b.awardDetails?.transactionData?.lastModifiedDate||'').localeCompare(a.awardDetails?.transactionData?.lastModifiedDate||''));
  const row=rows[0], piid=row.contractId.piid;
  const exact=baseline.filter(l=>(l.source_id===sid('usaspending')&&l.external_id===`CONT_AWD_${identity}`)||
    (l.source_id===sid('sam-awards')&&l.external_id===identity));
  const other=baseline.filter(l=>l.payload.award_id===piid);
  const queryUrl=`https://api.sam.gov/contract-awards/v1/search?piid=${encodeURIComponent(piid)}`;
  const normalized=awardPayload(row,queryUrl);
  const evidence={contract_identity:identity,latest_action:row,action_ids:[...g.rows.keys()].sort(),
    search_queries:[...g.queries].sort(),capture_run_ids:[...g.run_ids].sort(),
    reconciliation_note:'Latest signed action within this search window; not a guarantee of all-time latest action. Existing canonical fields retained; compare this evidence before replacing dates/values.'};
  if(exact.length===1) evidence.canonical_differences=Object.fromEntries(['contract_start','contract_end','ultimate_end','incumbent','incumbent_uei']
    .filter(k=>normalized[k] && !same(normalized[k],exact[0].payload[k])).map(k=>[k,{existing:exact[0].payload[k]??null,sam:normalized[k]}]));
  staged.push({source_id:sid('sam-awards'),external_id:identity,payload:{...normalized,sam_api_evidence:evidence},
    review_reason:'SAM award actions captured for guarded upsert; modifications consolidated and prior canonical facts preserved.'});
  if(exact.length>1 || (!exact.length&&other.length)) {
    review.push({identity,reason:'Award number exists but full source identity is ambiguous; no automatic duplicate lead proposed'}); continue;
  }
  if(normalized.work_performance_locations[0].state_code!=='AR') {
    review.push({identity,reason:'Structured work location is not Arkansas'}); continue;
  }
  if(exact.length) {
    // Add SAM evidence; do not downgrade Friday's canonical dates, contacts or locations.
    propose(exact[0].source_id,exact[0].external_id,{sam_api_evidence:evidence},[...g.queries],exact[0]);
  } else {
    review.push({identity,reason:'New award candidate staged; service/geography and cross-source match require review before a new canonical lead is inserted'});
  }
}
for(const [id,g] of notices) {
  const r=g.row;
  const old=baseline.find(l=>l.source_id===sid('sam')&&l.external_id===id);
  const location=r.placeOfPerformance || {};
  const payload={title:r.title,source_url:`https://sam.gov/opp/${id}/view`,bid_type:r.award?'award':'opportunity',
    business_category:'other_public',contracting_entity_geo_level:'federal',agency:r.fullParentPathName,
    solicitation_id:r.solicitationNumber,naics:r.naicsCode,notice_type:r.type,active:r.active==='Yes',
    deadline:r.responseDeadLine || null,
    work_performance_locations:[{city_name:location.city?.name||null,state_code:location.state?.code||null,
      evidence:location.streetAddress||'SAM placeOfPerformance field; office address not substituted'}],
    sam_notice_evidence:{record:r,search_queries:[...g.queries].sort(),capture_run_ids:[...g.run_ids].sort()},
    status_note:'SAM Active does not mean open for offers. Check deadline and subsequent award.'};
  staged.push({source_id:sid('sam'),external_id:id,payload,review_reason:'SAM notice capture; retain existing detailed geography/publication history and review open-vs-historical status.'});
  if(/Clean and Seal Bridge Decks/i.test(r.title)) {
    staged[staged.length-1].status='ignored';
    staged[staged.length-1].review_reason='Excluded from janitorial leads: bridge-deck sealing/construction, NAICS 238390.';
    excluded.push({id,title:r.title,reason:'Bridge-deck sealing/construction (238390), not janitorial; retained in raw capture only, not proposed as a lead'}); continue;
  }
  if(old) { propose(old.source_id,id,{sam_notice_evidence:payload.sam_notice_evidence},[...g.queries],old); continue; }
  if(r.award?.number) {
    const matches=baseline.filter(l=>l.payload.award_id===r.award.number);
    const contract=[...awards.values()].flatMap(a=>[...a.rows.values()]).find(a=>a.contractId.piid===r.award.number);
    if(matches.length===1&&contract&&matches[0].external_id===`CONT_AWD_${awardIdentity(contract)}`) {
      propose(matches[0].source_id,matches[0].external_id,{sam_notice_evidence:payload.sam_notice_evidence},[...g.queries],matches[0]); continue;
    }
  }
  review.push({id,title:r.title,reason:'New notice staged; multi-site geography/relationship to existing award requires review; no duplicate lead inserted'});
}
const forecast=JSON.parse(readFileSync(resolve(dir,'forecast-capture.json'),'utf8'));
for(const r of forecast.records) {
  const old=baseline.find(l=>l.source_id===sid(forecast.source_code)&&l.external_id===r.external_id);
  const payload={...r.payload,discovery_provenance:{method:forecast.retrieval_method,search_terms_used:forecast.query}};
  staged.push({source_id:sid(forecast.source_code),external_id:r.external_id,payload,review_reason:'Historical forecast for option exercise; not an open solicitation.'});
  propose(sid(forecast.source_code),r.external_id,payload,[forecast.query],old);
}
let stagedNew=0,stagedExisting=0;
if(capture) {
  for(const row of staged) {
    const old=await checked(db.from('procurement_intake_items').select('id').eq('source_id',row.source_id).eq('external_id',row.external_id).maybeSingle());
    if(old) { stagedExisting++; continue; } // Never overwrite prior reviewed/ignored intake.
    await checked(db.from('procurement_intake_items').upsert(row,{onConflict:'source_id,external_id',ignoreDuplicates:true})); stagedNew++;
  }
  const oldRun=await checked(db.from('procurement_runs').select('id').eq('source_id',sid('gsa-forecast')).contains('detail',{capture_id:'gsa-forecast-2026-09-16-FWS2025001061'}));
  if(!oldRun.length) await checked(db.from('procurement_runs').insert({source_id:sid('gsa-forecast'),started_at:new Date().toISOString(),
    status:'review_required',record_count:forecast.records.length,detail:{...forecast,capture_id:'gsa-forecast-2026-09-16-FWS2025001061'}}));
}
const delta=[...changes.values()].filter(x=>!same(x.expected_payload,x.payload)||x.expected_search_term!==x.search_term_used);
writeFileSync(resolve(dir,'upsert-records.json'),JSON.stringify({records:delta,review,excluded},null,2)+'\n');
const literal="'"+JSON.stringify(delta).replaceAll("'","''")+"'::jsonb";
const sql=`-- Live SAM captures plus official GSA forecast, 2026-09-16. PREPARED ONLY; not auto-applied.
-- Source/external IDs preserved. Existing canonical fields retained; new API evidence appended.
-- Preserves sales owner, stage/reason, notes, follow-up, annual amount and created_at.
-- New/unmatched award candidates remain in procurement_intake_items for review.
-- Locks and baseline guards reject changed data. Replaying identical data is a no-op.
begin;
create temporary table sam_delta on commit drop as
select * from jsonb_to_recordset(${literal}) as x(id uuid,source_id uuid,external_id text,payload jsonb,expected_payload jsonb,expected_search_term text,search_term_used text);
lock table public.procurement_leads in share row exclusive mode;
do $guard$
begin
 if exists(select 1 from sam_delta d left join public.procurement_leads l using(source_id,external_id)
   where (d.expected_payload is not null and l.id is null)
      or (l.id is not null and d.id is not null and l.id <> d.id)
      or (l.id is not null and not (
        (l.payload is not distinct from d.expected_payload and l.search_term_used is not distinct from d.expected_search_term)
        or (l.payload = d.payload and l.search_term_used is not distinct from d.search_term_used)))) then
   raise exception 'Live procurement data differs from captured baseline; regenerate/review before applying';
 end if;
end $guard$;
insert into public.procurement_leads(id,source_id,external_id,payload,search_term_used)
select coalesce(id,gen_random_uuid()),source_id,external_id,payload,search_term_used from sam_delta
on conflict(source_id,external_id) do update set payload=excluded.payload,search_term_used=excluded.search_term_used,
 updated_at=now(),detected_change_at=case when procurement_leads.payload is distinct from excluded.payload then now() else procurement_leads.detected_change_at end
where procurement_leads.payload is distinct from excluded.payload or procurement_leads.search_term_used is distinct from excluded.search_term_used;
insert into public.procurement_request_leads(search_request_id,lead_id,match_status,match_reason)
select '152f27b9-6888-5020-bede-050439ef87ee'::uuid,l.id,'matches',
 'Official GSA forecast identifies Crossett, Arkansas; historical option exercise, not a verified open bid'
from sam_delta d join public.procurement_leads l using(source_id,external_id)
where d.expected_payload is null and d.source_id='31664b92-c523-5cc5-a64d-13b569ab2e64'::uuid
on conflict(search_request_id,lead_id) do nothing;
commit;
`;
writeFileSync(resolve(dir,'007_incremental_sam_capture_2026_09_16.sql'),sql);
const summary={baseline_leads:baseline.length,api_requests:queries.length,queries,award_actions:[...awards.values()].reduce((n,g)=>n+g.rows.size,0),
  distinct_award_contracts:awards.size,distinct_notices:notices.size,forecast_candidates:forecast.records.length,
  staged_new:stagedNew,staged_existing:stagedExisting,proposed_new:delta.filter(r=>!r.expected_payload).length,
  proposed_enrichments:delta.filter(r=>r.expected_payload).length,review,excluded,canonical_upserts_applied:false};
writeFileSync(resolve(dir,'capture-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,queries:undefined},null,2));
