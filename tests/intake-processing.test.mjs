import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcile,runIds,exactAwards } from '../scripts/lib/intake-reconcile.mjs';
const load=name=>JSON.parse(readFileSync(new URL(`./fixtures/sam/${name}`,import.meta.url),'utf8'));
const before=load('intake-before.json'), runs=runIds.map(id=>load(`${id}.json`));
test('reviewed batch has three awards, 74 enrichments, 78 links including one older intake',()=>{
  const m=reconcile(before,runs);
  assert.deepEqual(m.summary,{baseline_leads:321,new_leads:3,evidence_updates:74,links_to_create:78,status_changes:78,processed_intakes:78,older_intake_matches:1,unresolved:24});
  assert.equal(new Set(m.decisions.map(d=>d.lead_id)).size,77);
  for(const r of m.records.filter(r=>r.expected_payload)) for(const [k,v] of Object.entries(r.expected_payload))
    if(!['sam_api_evidence','sam_notice_evidence','intake_source_evidence'].includes(k)) assert.deepEqual(r.payload[k],v);
  assert.ok(m.records.filter(r=>!r.expected_payload).every(r=>r.payload.bid_type==='award'&&r.payload.verification_notes&&!r.payload.estimated_annual_amount));
  assert.ok(m.records.filter(r=>r.payload.sam_api_evidence).every(r=>r.identity));
  assert.ok(m.unresolved.some(r=>r.external_id==='FWS2025001061'));
});
test('full identity excludes matching PIID with different subtier or parent',()=>{
  const sources={'usaspending':'u','sam-awards':'s'};
  const rows=[{source_id:'u',external_id:'CONT_AWD_A_9700_PARENT_9700'},{source_id:'s',external_id:'A_1234_PARENT_9700'}];
  assert.equal(exactAwards(rows,sources,'A_9700_PARENT_9700').length,1);
  assert.equal(exactAwards(rows,sources,'A_9700_-NONE-_-NONE-').length,0);
});
test('malformed evidence, conflicting links and duplicate full identities fail closed',()=>{
  const m=reconcile(before,runs), first=m.decisions[0];
  const bad=structuredClone(before); bad.procurement_intake_items.find(i=>i.id===first.intake.id).payload.sam_api_evidence.latest_action.contractId.piid=null;
  assert.throws(()=>reconcile(bad,runs),/Missing award identity/);
  const links=structuredClone(before); links.procurement_intake_leads.push({id:crypto.randomUUID(),intake_id:first.intake.id,lead_id:'00000000-0000-0000-0000-000000000001'});
  assert.throws(()=>reconcile(links,runs),/Conflicting links/);
  const dup=structuredClone(before), existing=m.records.find(r=>r.expected_payload&&r.identity);
  dup.procurement_leads.push({...dup.procurement_leads.find(l=>l.id===existing.id),id:crypto.randomUUID(),source_id:m.sources['sam-awards'],external_id:existing.identity});
  assert.throws(()=>reconcile(dup,runs),/Ambiguous full contract/);
});
test('ignored approval is not revived, unexpected run sets cannot expand scope',()=>{
  const bad=structuredClone(before);bad.procurement_intake_items.find(i=>i.external_id==='W519TC26CA043_9700_-NONE-_-NONE-').status='ignored';
  assert.throws(()=>reconcile(bad,runs),/ignored/);
  assert.throws(()=>reconcile(before,runs.slice(1)),/Unexpected capture run set/);
});
test('existing cross-source candidate resolves rather than inserts twice',()=>{
  const s=structuredClone(before), m=reconcile(s,runs), r=m.records.find(r=>!r.expected_payload);
  s.procurement_leads.push({id:r.id,source_id:m.sources.usaspending,external_id:`CONT_AWD_${r.identity}`,payload:r.payload,search_term_used:r.search_term_used});
  const next=reconcile(s,runs);assert.equal(next.summary.new_leads,2);
  assert.equal(next.decisions.find(d=>d.intake.external_id===r.identity).lead_id,r.id);
});
