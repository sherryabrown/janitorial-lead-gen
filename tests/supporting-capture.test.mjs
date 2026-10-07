import test from 'node:test';
import assert from 'node:assert/strict';
import { supportingCapture } from '../scripts/lib/supporting-capture.mjs';
import { sha } from '../scripts/lib/hosted-store.mjs';
import { makeInterpretationPacket,validateInterpretation } from '../scripts/lib/known-source-workflow.mjs';
import { verifyEvidenceSpans,cacheReviewedFacts } from '../scripts/lib/hosted-interpretation.mjs';
import { context,result } from './helpers/known-workflow.mjs';
import { intakeBefore } from './helpers/known-workflow.mjs';
import { planInterpretationIntake } from '../scripts/lib/interpretation-intake.mjs';
import { validateFindingBounds } from '../scripts/lib/hosted-workflow.mjs';

function fixture(fetcher=async()=>new Response('{"award_date":"2026-10-03"}',{headers:{'Content-Type':'application/json'}})) {
  const ctx=context();
  Object.assign(ctx.capability,{availability:'active',method:'browser',verified_at:'2026-01-01',verified_until:'2099-01-01',verification_evidence:{official:true},
    method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://example.gov/bids'],allowed_hosts:['example.gov'],
      max_bytes:2000000,max_pages:1,terminal_instruction:'Single listing',check_instructions:'Read listing'}});
  const packet=makeInterpretationPacket(ctx),saved=new Map();
  const artifacts={async put(value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));const path=`artifacts/${sha(bytes)}`;saved.set(path,bytes);return path;},
    async get(path){if(!saved.has(path))throw new Error('Missing artifact');return saved.get(path);}};
  const service=supportingCapture({artifacts,serverKey:()=> 'private-test-key',fetcher});
  return {ctx,packet,saved,artifacts,service};
}
test('official supporting evidence binds date, bytes and exact request; it is not cached as reusable coverage',async()=>{
  const f=fixture(),capture=await f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  assert.equal(capture.lead_coverage,false);
  const evidence={...capture,locator:'saved document',excerpt:'"award_date":"2026-10-03"'};
  const review=result(f.packet);review.findings[0].payload.award_date='2026-10-03';delete review.findings[0].payload.deadline;
  delete review.findings[0].payload.work_performance_locations;
  review.findings[0].supporting_evidence=[evidence];
  assert.throws(()=>validateInterpretation(f.packet,review),/Supporting document/);
  validateInterpretation(f.packet,review,{verifiedSupporting:true});
  await verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)});
  const planned=planInterpretationIntake(f.packet,review,intakeBefore(),{}, {verifiedSupporting:true});
  assert.equal(planned.manifest.rows.length,1);
  const persisted=planned.manifest.rows[0].row.payload.manual_capture.evidence;
  assert.equal(persisted[1].content_sha256,evidence.content_sha256);
  assert.equal(persisted[1].url,'https://example.gov/detail');
  assert.equal(persisted[1].capture_receipt,undefined);
  review.findings[0].payload.award_date='2026-10-04';
  await assert.rejects(verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)}),/award_date lacks/);
  review.findings[0].payload.award_date='2026-10-03';
  assert.deepEqual(cacheReviewedFacts({facts:[]},f.packet,review).facts,[]);
  await assert.rejects(f.service.load(f.ctx,{...f.packet,task_id:'foreign'},evidence),/provenance/);
  await assert.rejects(f.service.load(f.ctx,f.packet,{...evidence,url:'https://example.gov/other'}),/provenance/);
  f.saved.set(evidence.local_path,Buffer.from('changed'));
  await assert.rejects(f.service.load(f.ctx,f.packet,evidence),/hash/);
});
test('verified supporting work-site evidence qualifies the requested city without trusting unchecked evidence',async()=>{
  const body='{"site":"Texarkana","deadline":"2026-10-30"}';
  const f=fixture(async()=>new Response(body,{headers:{'Content-Type':'application/json'}}));
  f.ctx.request.requested_search_areas=[{area_type:'city',city_name:'Texarkana',state_code:'AR'}];
  f.ctx.task.query_window={from:'2026-10-01',to:'2026-10-31',date_basis:'deadline'};
  f.packet=makeInterpretationPacket(f.ctx);
  const captured=await f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  const review=result(f.packet);
  review.findings[0].supporting_evidence=[{...captured,locator:'saved document',excerpt:body}];
  assert.throws(()=>validateFindingBounds(f.packet,review),/location/);
  await verifyEvidenceSpans(f.packet,review,{loadSupporting:e=>f.service.load(f.ctx,f.packet,e)});
  validateFindingBounds(f.packet,review,{verifiedSupporting:true});
  f.packet.request_scope.requested_search_areas=[{area_type:'city',city_name:'Little Rock',state_code:'AR'}];
  assert.throws(()=>validateFindingBounds(f.packet,review,{verifiedSupporting:true}),/location/);
  f.packet.request_scope.requested_search_areas=[{area_type:'city',city_name:'Texarkana',state_code:'AR'}];
  f.packet.query_window.to='2026-10-04';
  assert.throws(()=>validateFindingBounds(f.packet,review,{verifiedSupporting:true}),/qualifying date/);
});

test('forged private receipts, unreviewed URLs, expired methods and blocked redirects cannot become evidence',async()=>{
  const f=fixture();
  for(const url of ['https://evil.gov/detail','https://127.0.0.1/','https://example.gov/detail?token=secret'])
    await assert.rejects(f.service.capture(f.ctx,f.packet,{packet_hash:f.packet.packet_hash,url},'reviewer'),/verified method/);
  await assert.rejects(f.service.capture(f.ctx,f.packet,{packet_hash:'wrong',url:'https://example.gov/detail'},'reviewer'),/exact packet/);
  const path=await f.artifacts.put({kind:'supporting-capture-v1',state:'captured',signature:'0'.repeat(64)});
  await assert.rejects(f.service.load(f.ctx,f.packet,{capture_receipt:path}),/signature/);
  f.ctx.capability.verified_until='2020-01-01';
  await assert.rejects(f.service.capture(f.ctx,f.packet,{},'reviewer'),/expired/);
  const blocked=fixture(async()=>new Response(null,{status:302,headers:{location:'https://evil.gov/'}}));
  const receipt=await blocked.service.capture(blocked.ctx,blocked.packet,{packet_hash:blocked.packet.packet_hash,url:'https://example.gov/detail'},'reviewer');
  assert.equal(receipt.state,'blocked');assert.equal(receipt.lead_coverage,false);
  await assert.rejects(blocked.service.load(blocked.ctx,blocked.packet,receipt),/provenance/);
});
