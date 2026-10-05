import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifiedStateRecordMethod } from '../scripts/lib/state-record-method-verification.mjs';

const url = 'https://arbuy.arkansas.gov/bso/external/bidDetail.sda?docId=S000000473&external=true&parentUrl=close';
const source = { id: 'source', code: 'arbuy-janitorial', url,
  source_coverage_areas: [{ area_type: 'state', state_code: 'AR' }] };
const geography = { id: '05', kind: 'state', state_code: 'AR', source_active: true };
const lead = { id: 'lead', source_id: source.id, external_id: 'S000000473',
  bid_type: 'award', payload: { executed_contract_verified: true } };
function capture(status = 'Intent to Award has been issued') {
  const body = Buffer.from(`<html><title>State of Arkansas - Bid Solicitation - S000000473</title><body>` +
    `<script>malicious()</script>Bid Number: S000000473 Description: Statewide Janitorial Services ${status}` +
    '</body></html>');
  return { state: 'captured', requested_url: url, final_url: url, content_type: 'text/html',
    bytes: body.length, body, content_sha256: createHash('sha256').update(body).digest('hex') };
}

test('record-specific watcher preserves canonical award and intent distinction', () => {
  const method = verifiedStateRecordMethod(source, geography, lead, capture());
  assert.equal(method.kind, 'award');
  assert.equal(method.verification_evidence.lead_id, lead.id);
  assert.deepEqual(method.method_spec.urls, [url]);
  assert.match(method.verification_evidence.coverage_limit, /intent is not executed-award proof/);
});

test('changed ARBuy record identity or status requires renewed review', () => {
  assert.throws(() => verifiedStateRecordMethod(source, geography, lead, capture('Cancelled')),
    /identity or intent status changed/);
  assert.throws(() => verifiedStateRecordMethod(source, geography,
    { ...lead, external_id: 'S000000474' }, capture()), /Matching official ARBuy/);
});
