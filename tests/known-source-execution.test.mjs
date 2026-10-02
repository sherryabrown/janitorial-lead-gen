import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adapterContract, buildKnownSourcePlan, samFilters, inspectSamCapture, samObservations, routedCapture } from '../scripts/lib/known-source-execution.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = { id: id(1), code: 'sam-awards', name: 'SAM Awards' };
const capability = { id: id(2), source_id: source.id, route_geography_id: 'AR-COUNTY',
  kind: 'award', method: 'api', availability: 'active', verified_at: '2026-01-01T00:00:00Z',
  verified_until: '2027-01-01T00:00:00Z', verification_evidence: { fixture: 'reviewed' },
  parser_version: 'sam-awards-v1', method_spec: { version: 1, runner_id: 'sam-search',
    page_size: 100, max_pages: 3, query_defaults: { q: 'cleaning' } } };
const request = { id: id(3), search_windows: { award: { from: '2026-09-01', to: '2026-09-30' } } };
const targets = [{ id: id(4), geography_id: 'AR-CITY', checkpoint: { route_order: 0 } },
  { id: id(5), geography_id: 'AR-COUNTY', checkpoint: { route_order: 1 } }];
const geographies = [{ id: 'AR-CITY', kind: 'municipality', source_active: true },
  { id: 'AR-COUNTY', kind: 'county', source_active: true }];

test('known county route is runnable while city and other categories need discovery', () => {
  const plan = buildKnownSourcePlan(request, targets, geographies, [capability], [source], new Date('2026-10-02'));
  assert.equal(plan.known, 1);
  assert.equal(plan.gaps, 5);
  assert.equal(plan.tasks.find(t => t.route_geography_id === 'AR-COUNTY' && t.kind === 'award').state, 'unchecked');
  assert.equal(plan.tasks.find(t => t.route_geography_id === 'AR-CITY' && t.kind === 'award').state, 'source_missing');
  assert.equal(adapterContract(capability, source).parser_version, 'sam-awards-v1');
  assert.deepEqual(samFilters(capability, source, request.search_windows.award, 2), {
    q: 'cleaning', lastModifiedDate: '[09/01/2026,09/30/2026]', placeOfPerformStateCode: 'AR', limit: 100, offset: 2,
  });
  assert.throws(() => samFilters(capability, source, request.search_windows.award, 3), /bounded/);
});

test('stale or unconfigured methods are not runnable', () => {
  const stale = buildKnownSourcePlan(request, targets, geographies, [{ ...capability, verified_until: '2026-09-01' }], [source], new Date('2026-10-02'));
  assert.equal(stale.known, 0);
  const unsupported = buildKnownSourcePlan(request, targets, geographies, [{ ...capability,
    method_spec: { ...capability.method_spec, query_defaults: {} } }], [source], new Date('2026-10-02'));
  assert.equal(unsupported.blocked, 1);
  assert.equal(unsupported.known, 0);
});

test('page accounting distinguishes terminal zero, more pages, blocked and unconfirmed capture', () => {
  const base = { run_id: id(6), captured: true, upstream_status: 200, response: { totalRecords: 101, awardSummary: Array(100).fill({}) } };
  assert.equal(inspectSamCapture(base, 'awards', 100, 0).state, 'next_page');
  assert.equal(inspectSamCapture({ ...base, response: { totalRecords: 101, awardSummary: [{}] } }, 'awards', 100, 1).state, 'complete');
  assert.equal(inspectSamCapture({ ...base, response: { awardResponse: { totalRecords: 0 },
    message: 'No Data found for requested search criteria' } }, 'awards', 100, 0).state, 'complete');
  assert.deepEqual(samObservations({ kind: 'awards', response: { awardResponse: { totalRecords: 0 },
    message: 'No Data found for requested search criteria' } }), []);
  assert.equal(inspectSamCapture({ ...base, upstream_status: 429 }, 'awards', 100, 0).state, 'blocked');
  assert.equal(inspectSamCapture({ ...base, captured: false }, 'awards', 100, 0).state, 'outcome_unknown');
  assert.equal(inspectSamCapture({ ...base, response: { message: 'unexpected' } }, 'awards', 100, 0).state, 'partial');
});

test('award modification is part of identity and content revisions have distinct hashes', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sam/b0098f0d-e96b-4c0b-bd66-c611634bb47e.json', import.meta.url), 'utf8'));
  const row = fixture.response.awardSummary[0];
  const original = samObservations({ kind: 'awards', response: { awardSummary: [row] } })[0];
  const changed = samObservations({ kind: 'awards', response: { awardSummary: [{ ...row, revised: true }] } })[0];
  const modified = samObservations({ kind: 'awards', response: { awardSummary: [{ ...row,
    contractId: { ...row.contractId, modificationNumber: 'P00001' } }] } })[0];
  assert.equal(original.external_id, changed.external_id);
  assert.notEqual(original.payload_hash, changed.payload_hash);
  assert.notEqual(original.external_id, modified.external_id);
  assert.equal(original.record_group, modified.record_group);
  const observation={payload_hash:original.payload_hash,change_type:'new',first_run_id:id(7)};
  assert.equal(routedCapture(original.record_group,[observation],row,new Set([original.payload_hash])),null,
    'a legacy intake or lead with identical evidence is not staged again');
  const revised=routedCapture(original.record_group,[{...observation,payload_hash:changed.payload_hash,
    change_type:'changed'}],{...row,revised:true},new Set([original.payload_hash]));
  assert.equal(revised.metadata.routed_capture.record_identity,original.record_group);
  assert.notEqual(revised.external_id,original.record_group);
});
