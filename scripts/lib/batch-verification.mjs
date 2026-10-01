import { same } from './sam-normalize.mjs';

export function verifyBatch(before,after,m) {
  const errors=[];
  const check=(yes,message)=>{if(!yes) errors.push(message);};
  check(after.project_ref===m.project_ref&&before.project_ref===m.project_ref,'Snapshot project mismatch');
  const scoped=new Set(m.records.map(r=>r.id));
  const mutable=new Set(['payload','search_term_used','updated_at','detected_change_at']);
  for(const r of m.records) {
    const a=after.procurement_leads.find(l=>l.id===r.id),b=before.procurement_leads.find(l=>l.id===r.id);
    check(a&&same(a.payload,r.payload)&&a.search_term_used===r.search_term_used,`Lead postcondition: ${r.id}`);
    if(!a) continue;
    check(a.source_id===r.source_id&&a.external_id===r.external_id,`Lead identity: ${r.id}`);
    if(b) for(const [k,v] of Object.entries(b)) if(!mutable.has(k)) check(same(a[k],v),`Preserved lead field differs: ${r.id}/${k}`);
    if(!b) {
      check(a.bid_type===r.payload.bid_type,`New lead classification: ${r.id}`);
      check(a.estimated_annual_amount===null,`Unexpected annual estimate: ${r.id}`);
    }
    if(r.identity) check(after.procurement_leads.filter(l=>(l.source_id===m.sources.usaspending&&l.external_id===`CONT_AWD_${r.identity}`)||
      (l.source_id===m.sources['sam-awards']&&l.external_id===r.identity)).length===1,`Cross-source duplicate: ${r.identity}`);
  }
  for(const d of m.decisions) {
    const a=after.procurement_intake_items.find(i=>i.id===d.intake.id);
    check(a?.status==='processed',`Intake not processed: ${d.intake.id}`);
    if(a) for(const [k,v] of Object.entries(d.intake)) if(!['status','updated_at'].includes(k)) check(same(a[k],v),`Intake evidence changed: ${d.intake.id}/${k}`);
    check(after.procurement_intake_leads.filter(k=>k.intake_id===d.intake.id&&k.lead_id===d.lead_id).length===1,`Missing/duplicate intake link: ${d.intake.id}`);
    check(after.procurement_intake_leads.filter(k=>k.intake_id===d.intake.id).every(k=>k.lead_id===d.lead_id),`Unexpected intake target: ${d.intake.id}`);
    if(d.request_reason) {
      const r=after.procurement_request_leads.find(r=>r.lead_id===d.lead_id&&r.search_request_id===m.request_id);
      check(r&&(d.expected_request?same(r,d.expected_request):r.match_status==='needs_location_review'&&r.match_reason===d.request_reason),`Request classification: ${d.lead_id}`);
    }
  }
  for(const table of ['procurement_leads','procurement_intake_items']) for(const b of before[table]) {
    const touched=table==='procurement_leads'?scoped.has(b.id):m.decisions.some(d=>d.intake.id===b.id);
    if(!touched) check(same(after[table].find(r=>r.id===b.id),b),`Unrelated row changed; concurrent activity needs review: ${table}/${b.id}`);
  }
  let actualEvents=0;
  for(const table of ['procurement_events','procurement_versions']) {
    for(const b of before[table]) check(same(after[table].find(r=>r.id===b.id),b),`Existing history changed: ${table}/${b.id}`);
    const added=after[table].filter(r=>scoped.has(r.lead_id)&&!before[table].some(b=>b.id===r.id));
    const expected=m.records.filter(r=>{
      const b=before.procurement_leads.find(l=>l.id===r.id);return !b||!same(b.payload,r.payload);
    }).length;
    check(added.length===expected,`History delta ${table}: expected ${expected}, got ${added.length}`);
    for(const r of m.records) {
      const b=before.procurement_leads.find(l=>l.id===r.id),count=added.filter(x=>x.lead_id===r.id).length;
      check(count===(!b||!same(b.payload,r.payload)?1:0),`History per-lead mismatch: ${table}/${r.id}`);
    }
    if(table==='procurement_events') actualEvents=added.length;
  }
  for(const table of ['procurement_intake_leads','procurement_request_leads']) for(const b of before[table])
    check(same(after[table].find(r=>r.id===b.id),b),`Prior relationship changed: ${table}/${b.id}`);
  return {status:errors.length?'verification_failed':'verified',verified:!errors.length,errors,
    counts:{...m.summary,actual_new_leads:m.records.filter(r=>!before.procurement_leads.some(b=>b.id===r.id)&&after.procurement_leads.some(a=>a.id===r.id)).length,
      actual_new_links:after.procurement_intake_leads.filter(k=>m.decisions.some(d=>d.intake.id===k.intake_id&&d.lead_id===k.lead_id)&&!before.procurement_intake_leads.some(b=>b.id===k.id)).length,
      actual_processed:m.decisions.filter(d=>after.procurement_intake_items.some(i=>i.id===d.intake.id&&i.status==='processed')).length,actual_history_events:actualEvents},
    new_leads:m.records.filter(r=>!r.expected_payload).map(r=>({id:r.id,external_id:r.external_id,title:r.payload.title})),unresolved:m.unresolved};
}
