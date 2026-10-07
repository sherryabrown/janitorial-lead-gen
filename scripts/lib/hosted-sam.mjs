import { hash,collectRuns } from './reviewed-batch.mjs';
import { checked,one,rows } from './hosted-store.mjs';
import { samIntakeRows } from './sam-intake.mjs';
import { inspectSamCapture } from './known-source-execution.mjs';
import {resolveSamAwardLinks} from './api-record-links.mjs';
export function statewideSam({db,project,serverKey,artifacts,fetcher=fetch}) {
  async function packet(requestId) {
    const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId));
    const job=jobs.find(j=>j.dedupe_key===`api-sam:${requestId}`&&j.checkpoint?.stage==='sam_review');
    if(!job)throw new Error('Persisted separate SAM review candidates required');
    const c=job.checkpoint,runs=await savedRuns(c);
    const ids=c.intake_ids??[];
    const candidates=ids.length?await rows(db,'procurement_intake_items',q=>q.in('id',ids)):[];
    if(candidates.length!==ids.length)throw new Error('SAM candidate readback incomplete');
    return {request_id:requestId,run_ids:c.run_ids,terminal_confirmed:c.terminal_confirmed,
      partial:!c.terminal_confirmed,canonical_writes:0,
      candidates:candidates.map(i=>({intake_id:i.id,intake_hash:hash(i.payload),status:i.status,
        source_id:i.source_id,title:i.payload.title,agency:i.payload.agency,bid_type:i.payload.bid_type,
        source_url:i.payload.source_url,deadline:i.payload.deadline,contract_start:i.payload.contract_start,
        contract_end:i.payload.contract_end,work_performance_locations:i.payload.work_performance_locations,
        notice:i.payload.sam_notice_evidence?.record,award:i.payload.sam_api_evidence?.latest_action})),
      captures:runs.map(r=>({run_id:r.run_id,kind:r.kind,filters:r.filters,query_url:r.query_url})),
      next_action:'Review service, Arkansas work location, dates and notice classification; prepare the exact reviewed import package'};
  }
  async function savedRuns(c) {
    if(!c.capture_artifacts?.length)throw new Error('Saved SAM page evidence required');
    const runs=[];
    for(const artifact of c.capture_artifacts) {
      const capture=JSON.parse((await artifacts.get(artifact)).toString());
      const audit=await one(db,'procurement_runs',capture.run_id);
      if(!audit||!c.run_ids.includes(audit.id)||hash(audit.detail.response)!==hash(capture.response)||
        audit.detail.collector!=='sam-search'||audit.detail.kind!==capture.kind||audit.detail.upstream_status!==200||
        audit.detail.query_url!==capture.query_url||hash(audit.detail.filters)!==hash(capture.filters))
        throw new Error('SAM capture does not match its saved audit');
      runs.push(capture);
    }
    collectRuns(runs,c.run_ids,{allow_partial:!c.terminal_confirmed});return runs;
  }
  async function stage(c) {
    const runs=await savedRuns(c),collection=collectRuns(runs,c.run_ids,{allow_partial:!c.terminal_confirmed});
    const sources=await rows(db,'procurement_sources',q=>q.in('code',['sam','sam-awards']));
    const source=code=>{const match=sources.find(s=>s.code===code);if(!match)throw new Error('SAM registry missing');return match.id;};
    if(collection.awards.size&&!c.link_artifact)c.link_artifact=await artifacts.put(await resolveSamAwardLinks(collection,{fetcher}));
    const awardLinks=c.link_artifact?JSON.parse((await artifacts.get(c.link_artifact)).toString()):{};
    const items=samIntakeRows(collection,source,(sourceId,identity,row)=>({
      external_id:`${identity}@${hash({row,run_ids:c.run_ids}).slice(0,24)}`,metadata:{routed_capture:{record_identity:identity}}}),awardLinks);
    const ids=[];
    for(const item of items) {
      checked(await db.from('procurement_intake_items').upsert(item,{onConflict:'source_id,external_id',ignoreDuplicates:true}));
      const saved=(await rows(db,'procurement_intake_items',q=>q.eq('source_id',item.source_id).eq('external_id',item.external_id)))[0];
      if(!saved||hash(saved.payload)!==hash(item.payload))throw new Error('SAM candidate differs from immutable saved evidence; review existing intake');
      ids.push(saved.id);
    }
    c.intake_ids=ids;c.stage='sam_review';c.next_action='Review persisted statewide SAM candidates and prepare an exact import package';
  }
  async function submit(input,actor,key) {
    if(!['opportunity','award'].includes(input.category) || !/^[A-Za-z0-9_-]{8,100}$/.test(key??''))
      throw new Error('Separate opportunity/award SAM request and idempotency key required; forecasts use agency sources');
    const window=input.publication_window;
    const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
    if(!valid(window?.from)||!valid(window?.to)||window.from>window.to)throw new Error('Explicit bounded SAM publication/modification window required');
    const date=d=>`${d.slice(5,7)}/${d.slice(8,10)}/${d.slice(0,4)}`;
    const filters=input.category==='opportunity'?{postedFrom:date(window.from),postedTo:date(window.to),state:'AR',ncode:'561720',limit:100,offset:0}:
      {lastModifiedDate:`[${date(window.from)},${date(window.to)}]`,placeOfPerformStateCode:'AR',naicsCode:'561720',limit:100,offset:0};
    const id=checked(await db.rpc('submit_procurement_sam_request',{p_actor:actor,p_key:key,p_hash:hash(input),p_kind:input.category,
      p_window:{...window,date_basis:'publication'},p_filters:filters}));
    return {request_id:id,state:'pending',statewide_sam:{separate:true,included_in_geography_coverage:false},
      next_action:'Read request status; review saved SAM runs through the existing separate statewide intake/import workflow'};
  }
  async function step(job,c,save) {
    if(c.stage==='sam_review') {await save('blocked');return;}
    if(c.stage==='sam_stage') {await stage(c);await save('blocked');return;}
    if(!['sam_collect','sam_reconcile'].includes(c.stage))throw new Error('Unknown SAM checkpoint');
    if(c.stage==='sam_reconcile') {c.next_action='Inspect SAM audit runs for this saved attempt before resending';await save('outcome_unknown');return;}
    c.stage='sam_reconcile';c.attempted_at=new Date().toISOString();await save('running');
    const key=serverKey();
    let response,data;
    try {
      response=await fetcher(`https://${project}.supabase.co/functions/v1/sam-search`,{method:'POST',
        headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({kind:c.kind==='award'?'awards':'opportunities',filters:c.filters}),
        signal:AbortSignal.timeout(100000)});
      data=await response.json();
    }catch {c.next_action='SAM request outcome unknown; inspect saved procurement_runs audit before retry';await save('outcome_unknown');return;}
    if(JSON.stringify(data).includes(key))throw new Error('SAM response failed private credential validation');
    if(data.run_id) {
      const run=await one(db,'procurement_runs',data.run_id);
      if(!run || run.detail?.collector!=='sam-search')throw new Error('SAM audit readback failed');
      c.run_ids=[...(c.run_ids??[]),data.run_id];c.capture_artifact=await artifacts.put(data);
      c.capture_artifacts=[...(c.capture_artifacts??[]),c.capture_artifact];
    }
    const assessment=inspectSamCapture(data,c.kind==='award'?'awards':'opportunities',100,c.filters.offset);
    if(!response.ok || ['partial','blocked','outcome_unknown'].includes(assessment.state)) {
      c.next_action=assessment.reason??'SAM capture incomplete; inspect saved audit';await save('blocked');return;
    }
    c.pages=(c.pages??0)+1;c.records=(c.records??0)+assessment.count;
    if(assessment.state==='next_page' && c.pages<10) {
      c.filters={...c.filters,offset:c.filters.offset+1};c.stage='sam_collect';await save('pending');return;
    }
    c.stage='sam_stage';c.terminal_confirmed=assessment.state==='complete';
    c.next_action=c.terminal_confirmed?'Review saved statewide SAM captures, stage eligible records and use the existing reviewed import workflow':
      'SAM page bound reached; partial capture is not complete statewide coverage';
    await save('pending');
  }
  return {submit,step,savedRuns,packet};
}
