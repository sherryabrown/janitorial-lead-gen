import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedSamMethod } from '../scripts/lib/sam-method-verification.mjs';

const state = { id: '05', kind: 'state', state_code: 'AR', source_active: true };
const source = { id: 'source', code: 'sam' };
const run = { id: 'run', source_id: source.id, started_at: new Date().toISOString(), status: 'success',
  detail: { state: 'response_captured', kind: 'opportunities', upstream_status: 200,
    complete_for_query: true, filters: { postedFrom: '10/01/2026', postedTo: '10/02/2026',
      state: 'AR', ncode: '561720', limit: 100, offset: 0 } } };

test('current successful SAM evidence verifies only the Arkansas state opportunity method', () => {
  const method = verifiedSamMethod('opportunity', run, source, state);
  assert.equal(method.route_geography_id, '05');
  assert.equal(method.method_spec.query_defaults.ncode, '561720');
  assert.equal(method.verification_evidence.run_id, 'run');
  assert.match(method.verification_evidence.work_location_limit, /city\/county match requires/);
  assert.throws(() => verifiedSamMethod('opportunity', run, source, { ...state, id: '05091', kind: 'county' }),
    /Arkansas state route/);
  assert.throws(() => verifiedSamMethod('opportunity', { ...run, detail: { ...run.detail,
    complete_for_query: false } }, source, state), /successful bounded/);
  assert.throws(() => verifiedSamMethod('opportunity', { ...run, detail: { ...run.detail,
    filters: { ...run.detail.filters, state: 'TX' } } }, source, state), /successful bounded/);
});

test('award method uses its own source, category and date filter', () => {
  const awards = { ...source, code: 'sam-awards' };
  const awardRun = { ...run, detail: { ...run.detail, kind: 'awards',
    filters: { lastModifiedDate: '[10/01/2026,10/02/2026]',
      placeOfPerformStateCode: 'AR', naicsCode: '561720', limit: 100, offset: 0 } } };
  const method = verifiedSamMethod('award', awardRun, awards, state);
  assert.equal(method.endpoint_url, 'https://api.sam.gov/contract-awards/v1/search');
  assert.deepEqual(method.method_spec.query_defaults, { naicsCode: '561720' });
  assert.throws(() => verifiedSamMethod('award', awardRun, source, state), /registered source/);
});
