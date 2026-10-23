import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishedSolicitation,resolveCountyIdentity,mergeIdentity} from '../scripts/lib/county-solicitation-identity.mjs';
import {hash,planReviewedBatch} from '../scripts/lib/reviewed-batch.mjs';
import {planRegistry,planManual} from '../scripts/lib/research-persistence.mjs';
import {automaticCountyReview} from '../scripts/lib/county-automatic-import.mjs';
const fixture=JSON.parse(readFileSync('tests/fixtures/county/clearwater-addendum.json'));
export function addendumFixture(){
 const load=k=>JSON.parse(readFileSync(`tests/fixtures/research/${k}.json`));
 const snapshot=load('build-persistence-before');
 for(const d of planRegistry(load('build-registry-spec'),snapshot).rows){snapshot[d.table]=snapshot[d.table].filter(r=>r.id!==d.row.id);snapshot[d.table].push(d.row);}
 const spec=load('build-manual-spec');spec.findings=spec.findings.slice(0,1);
 const sample=planManual(spec,snapshot).rows[0].row,request=snapshot.procurement_search_requests.find(r=>r.id===spec.findings[0].request_ids[0]);
 const candidates=fixture.records.map((r,n)=>({...structuredClone(sample),id:`10000000-0000-4000-8000-00000000010${n}`,external_id:r.external_id,
  payload:{...structuredClone(r.payload),manual_capture:{...structuredClone(r.payload.manual_capture),request_ids:[request.id]}}}));
 snapshot.captured_at='2026-10-23T12:00:00Z';snapshot.procurement_intake_items.push(...candidates);
 return {snapshot,request,candidates,proofs:candidates.map(i=>({intake_id:i.id,payload_hash:hash(i.payload)}))};
}
test('published issuer/base solicitation links original and addendum without title-based merging',()=>{
 const [a,b]=fixture.records,pa=publishedSolicitation(a.payload,a.external_id),pb=publishedSolicitation(b.payload,b.external_id);
 assert.equal(pa.key,pb.key);assert.equal(pa.base,'26003');assert.equal(pb.observations[0].revision,'Addendum 1');
 assert.equal(publishedSolicitation(b.payload,'wrong-id'),null);
 const other=structuredClone(b);other.payload.manual_capture.evidence[0].excerpt=other.payload.manual_capture.evidence[0].excerpt.replace('26003 Addendum 1','27004');
 assert.notEqual(publishedSolicitation(other.payload,other.external_id).key,pa.key);
 assert.deepEqual(mergeIdentity(pa,pa),pa);
});
test('automatic addendum targets original while keeping its source ID, stage and notes',()=>{
 const f=addendumFixture(),[a,b]=f.candidates;
 const old={id:'10000000-0000-4000-8000-000000000200',source_id:a.source_id,external_id:a.external_id,payload:a.payload,stage:'applied',notes:'Keep sales notes'};
 f.snapshot.procurement_leads.push(old);f.snapshot.procurement_intake_leads.push({id:'10000000-0000-4000-8000-000000000201',intake_id:a.id,lead_id:old.id});
 const review=automaticCountyReview({...f,candidates:[b]});assert.equal(review.review.decisions.length,1,JSON.stringify(review.exclusions));
 const m=planReviewedBatch(f.snapshot,review.review,[]);assert.equal(m.records.length,1);assert.equal(m.records[0].id,old.id);assert.equal(m.records[0].external_id,'1642');assert.equal(m.summary.new_leads,0);assert.equal(m.summary.evidence_updates,1);
 assert.equal(old.stage,'applied');assert.equal(old.notes,'Keep sales notes');assert.equal(m.county_identity_scope[0].leads.length,f.snapshot.procurement_leads.filter(l=>l.source_id===a.source_id).length);
});
test('two current published IDs produce one manifest identity, with independent solicition numbers distinct',()=>{
 const f=addendumFixture(),review=automaticCountyReview(f);assert.equal(review.review.decisions.length,2,JSON.stringify(review.exclusions));
 const m=planReviewedBatch(f.snapshot,review.review,[]);assert.equal(m.records.length,1);assert.equal(m.summary.new_leads,1);assert.equal(new Set(m.decisions.map(d=>d.lead_id)).size,1);
 const reversed=planReviewedBatch(f.snapshot,{...review.review,decisions:[...review.review.decisions].reverse()},[]);assert.equal(reversed.records.length,1);assert.equal(reversed.records[0].external_id,'1642','The original wins within a batch regardless of listing order');
 const [a,b]=f.candidates,old={id:'10000000-0000-4000-8000-000000000200',source_id:a.source_id,external_id:a.external_id,payload:a.payload};
 f.snapshot.procurement_leads.push(old);b.payload.manual_capture.evidence[0].excerpt=b.payload.manual_capture.evidence[0].excerpt.replace('26003 Addendum 1','27004');
 assert.equal(resolveCountyIdentity(f.snapshot,b).target,undefined);
});
test('an amended intake can follow its retained duplicate parent without losing canonical identity',()=>{
 const f=addendumFixture(),[a,b]=f.candidates,originalId='10000000-0000-4000-8000-000000000210',retiredId='10000000-0000-4000-8000-000000000211';
 f.snapshot.procurement_leads.push({id:originalId,source_id:a.source_id,external_id:a.external_id,payload:a.payload},{id:retiredId,source_id:b.source_id,external_id:b.external_id,payload:{...b.payload,canonical_redirect:{policy:'county-ionwave-solicitation-v1',lead_id:originalId}}});
 b.status='processed';f.snapshot.procurement_intake_leads.push({id:'10000000-0000-4000-8000-000000000212',intake_id:b.id,lead_id:retiredId});
 const next={...structuredClone(b),id:'10000000-0000-4000-8000-000000000213',status:'pending',external_id:'1760::repeat'};Object.assign(next.payload.manual_capture,{record_external_id:'1760',amends_intake_id:b.id});f.snapshot.procurement_intake_items.push(next);
 const result=automaticCountyReview({...f,candidates:[next],proofs:[{intake_id:next.id,payload_hash:hash(next.payload)}]});assert.equal(result.review.decisions.length,1,JSON.stringify(result.exclusions));assert.equal(planReviewedBatch(f.snapshot,result.review,[]).records[0].id,originalId);
});
test('ambiguous originals, missing primary identity and issuer conflict never silently merge',()=>{
 const f=addendumFixture(),[a,b]=f.candidates;
 f.snapshot.procurement_leads.push({id:'first',source_id:a.source_id,external_id:a.external_id,payload:a.payload},{id:'second',source_id:b.source_id,external_id:b.external_id,payload:b.payload});
 assert.throws(()=>resolveCountyIdentity(f.snapshot,b),/Duplicate solicitation/);
 f.snapshot.procurement_leads.pop();b.payload.manual_capture.evidence=[];
 assert.throws(()=>resolveCountyIdentity(f.snapshot,b),/published issuer/);
 b.payload.source_url='https://another-county.example/bids/separate-record';assert.equal(resolveCountyIdentity(f.snapshot,b).target,undefined,'Unrelated collectors retain their existing exact-ID behavior');
});
