import { hash } from './reviewed-batch.mjs';
import { checked,one } from './hosted-store.mjs';
import { inspectSamCapture } from './known-source-execution.mjs';
export function statewideSam({db,project,serverKey,artifacts,fetcher=fetch}) {
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
    }
    const assessment=inspectSamCapture(data,c.kind==='award'?'awards':'opportunities',100,c.filters.offset);
    if(!response.ok || ['partial','blocked','outcome_unknown'].includes(assessment.state)) {
      c.next_action=assessment.reason??'SAM capture incomplete; inspect saved audit';await save('blocked');return;
    }
    c.pages=(c.pages??0)+1;c.records=(c.records??0)+assessment.count;
    if(assessment.state==='next_page' && c.pages<10) {
      c.filters={...c.filters,offset:c.filters.offset+1};c.stage='sam_collect';await save('pending');return;
    }
    c.stage='sam_review';c.terminal_confirmed=assessment.state==='complete';
    c.next_action=c.terminal_confirmed?'Review saved statewide SAM captures, stage eligible records and use the existing reviewed import workflow':
      'SAM page bound reached; partial capture is not complete statewide coverage';
    await save('blocked');
  }
  return {submit,step};
}
