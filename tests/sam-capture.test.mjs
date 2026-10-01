import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { awardIdentity, actionIdentity, awardPayload, responseSummary } from '../scripts/lib/sam-normalize.mjs';
const load=id=>JSON.parse(readFileSync(new URL(`../outputs/sam-search/${id}.json`,import.meta.url),'utf8'));
const awards=load('40f1f909-b0cf-41b7-bf4d-8fc4c0d2f4fa');
test('real SAM award response contains 92 actions and is fully paginated',()=>{
  assert.deepEqual(responseSummary('awards',awards.response,100,0),{count:92,complete:true,recognized:true});
});
test('real no-data envelope is recognized without treating it as a parser failure',()=>{
  assert.deepEqual(responseSummary('awards',load('7517cb38-353d-4e8a-bf08-8e981022057b').response,100,0),{count:0,complete:true,recognized:true});
});
test('unknown success envelopes are never called a complete search',()=>{
  assert.equal(responseSummary('awards',{},100,0).complete,false);
});
test('short page with a larger declared total remains incomplete',()=>{
  assert.equal(responseSummary('awards',{awardSummary:[{}],totalRecords:'5'},100,0).complete,false);
});
test('compound identity matches existing USAspending identifier and separates actions',()=>{
  const rows=awards.response.awardSummary.filter(r=>r.contractId.piid==='FA446026F0001');
  assert.equal(awardIdentity(rows[0]),'FA446026F0001_9700_FA446026D0001_9700');
  assert.equal(new Set(rows.map(actionIdentity)).size,rows.length);
});
test('award mapping uses performance location and does not invent an annual value',()=>{
  const r=awards.response.awardSummary.find(r=>r.contractId.piid==='12444026P0168');
  const p=awardPayload(r,'https://api.sam.gov/contract-awards/v1/search?piid=12444026P0168');
  assert.equal(p.work_performance_locations[0].city_name,'WALDRON');
  assert.equal(p.contract_end,'2027-05-31'); assert.equal(p.ultimate_end,'2031-05-31');
  assert.equal(p.estimated_annual_amount,undefined);
});
test('prepared existing lead changes preserve every previous canonical field',()=>{
  const {records}=JSON.parse(readFileSync(new URL('../outputs/sam-search/upsert-records.json',import.meta.url),'utf8'));
  for(const row of records.filter(r=>r.expected_payload)) {
    for(const [key,value] of Object.entries(row.expected_payload)) {
      if(!['sam_api_evidence','sam_notice_evidence'].includes(key)) assert.deepEqual(row.payload[key],value,`${row.external_id}: ${key}`);
    }
  }
});
