import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { same } from './lib/sam-normalize.mjs';
const [beforeFile,afterFile,manifestFile,reportFile]=process.argv.slice(2);
if(!reportFile||existsSync(reportFile)) throw new Error('Usage: BEFORE AFTER MANIFEST NEW_REPORT.json');
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const b=load(beforeFile),a=load(afterFile),m=load(manifestFile),touched=new Set(m.records.map(r=>r.id));
assert.equal(a.procurement_leads.length,b.procurement_leads.length+m.summary.new_leads);
for(const l of b.procurement_leads) {
  const next=a.procurement_leads.find(r=>r.id===l.id);assert.ok(next,`Lead disappeared ${l.id}`);
  for(const [key,value] of Object.entries(l)) if(!touched.has(l.id)||!['payload','search_term_used','updated_at','detected_change_at'].includes(key))
    assert.ok(same(next[key],value),`Unexpected change ${l.id}/${key}`);
}
for(const r of m.records) {
  const l=a.procurement_leads.find(l=>l.id===r.id);assert.ok(l);
  assert.ok(same(l.payload,r.payload));assert.equal(l.search_term_used,r.search_term_used);
  if(r.identity) assert.equal(a.procurement_leads.filter(x=>(x.source_id===m.sources.usaspending&&x.external_id===`CONT_AWD_${r.identity}`)||
    (x.source_id===m.sources['sam-awards']&&x.external_id===r.identity)).length,1,'Duplicate cross-source contract');
  if(!r.expected_payload) {
    assert.equal(l.bid_type,'award');assert.equal(l.estimated_annual_amount,null);assert.equal(l.stage,'new');
    assert.equal(l.contract_start_date,r.payload.contract_start);assert.equal(l.contract_current_end_date,r.payload.contract_end);
    assert.equal(l.contract_potential_end_date,r.payload.ultimate_end);assert.equal(l.work_performance_city,r.payload.work_performance_locations[0].city_name);
  }
}
for(const i of b.procurement_intake_items) {
  const next=a.procurement_intake_items.find(x=>x.id===i.id),d=m.decisions.find(d=>d.intake.id===i.id);assert.ok(next);
  if(!d) assert.ok(same(next,i),`Unrelated intake changed ${i.id}`);
  else {
    assert.equal(next.status,'processed');
    for(const [key,value] of Object.entries(i)) if(!['status','updated_at'].includes(key)) assert.ok(same(next[key],value));
    assert.equal(a.procurement_intake_leads.filter(l=>l.intake_id===i.id&&l.lead_id===d.lead_id).length,1);
    if(d.request_reason) {
      const request=a.procurement_request_leads.find(r=>r.lead_id===d.lead_id&&r.search_request_id===m.request_id);assert.ok(request);
      if(!d.expected_request) {assert.equal(request.match_status,'needs_location_review');assert.equal(request.match_reason,d.request_reason);}
    }
  }
}
assert.equal(a.procurement_intake_items.length,b.procurement_intake_items.length);
assert.equal(a.procurement_intake_leads.length,b.procurement_intake_leads.length+m.summary.links_to_create);
for(const table of ['procurement_sources','procurement_search_requests']) assert.ok(same(a[table],b[table]),`${table} changed`);
for(const table of ['procurement_request_leads','procurement_intake_leads','procurement_events','procurement_versions'])
  for(const row of b[table]) assert.ok(same(a[table].find(x=>x.id===row.id),row),`Existing ${table} row changed`);
for(const table of ['procurement_events','procurement_versions']) {
  const additions=a[table].filter(x=>!b[table].some(y=>y.id===x.id));
  assert.equal(additions.length,m.summary.new_leads+m.summary.evidence_updates);
  assert.ok(additions.every(e=>touched.has(e.lead_id)));
}
const report={verified_at:new Date().toISOString(),committed:true,lead_count_before:b.procurement_leads.length,lead_count_after:a.procurement_leads.length,
  new_awards:m.records.filter(r=>!r.expected_payload).map(r=>({id:r.id,award_number:r.payload.award_id,title:r.payload.title})),
  ...m.summary,status_counts:Object.fromEntries(['processed','pending','ignored'].map(status=>[status,a.procurement_intake_items.filter(i=>i.status===status).length])),
  existing_lead_fields_preserved:true,unrelated_intake_preserved:true,history_events_added:m.summary.new_leads+m.summary.evidence_updates,unresolved:m.unresolved};
writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,unresolved:report.unresolved.length},null,2));
