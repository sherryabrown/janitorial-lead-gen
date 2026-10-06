import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryView, validateHandoff, ledgerHasAdvancedAccess } from '../scripts/lib/public-source-discovery.mjs';

const city = { id: 'city', kind: 'municipality', name: 'Pilot', source_active: true };
const county = { id: 'county', kind: 'county', name: 'County', source_active: true };
const state = { id: 'state', kind: 'state', name: 'Arkansas', source_active: true };
const request = { id: 'request', search_windows: { forecast: { from: '2026-01-01', to: '2026-01-31' },
  opportunity: { from: '2026-01-01', to: '2026-01-31' }, award: { from: '2026-01-01', to: '2026-01-31' } } };
const targets = [city, county, state].map((g, i) => ({ id: `target-${i}`, geography_id: g.id,
  checkpoint: { route_order: i } }));
const sourceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source = { id: sourceId, code: 'pilot', name: 'Pilot agency', url: 'https://example.gov/bids',
  source_coverage_areas: [{ state_code: 'AR', area_type: 'city', city_name: 'Pilot' }] };
const capability = { id: 'cap', source_id: sourceId, route_geography_id: city.id, kind: 'opportunity',
  availability: 'active', method: 'browser', parser_version: 'public-v1',
  verified_at: '2026-01-01T00:00:00Z', verified_until: '2027-01-01T00:00:00Z',
  verification_evidence: { url: source.url }, method_spec: { version: 1, runner_id: 'public-fetch',
    check_when: 'each_request', urls: [source.url], allowed_hosts: ['example.gov'], max_bytes: 1000000 } };

test('discovery distinguishes verified, registered missing, and truly missing routes without SAM', () => {
  const view = discoveryView(request, targets, [city, county, state], [capability], [source], new Date('2026-10-05'));
  assert(view.routes.some(r => r.route === 'Pilot' && r.category === 'opportunity' && r.status === 'verified_method' && r.verified_methods[0].source_code === 'pilot'));
  assert(view.routes.some(r => r.route === 'Pilot' && r.category === 'forecast' && r.status === 'registered_method_missing_or_expired' && r.registered_gaps[0].source_code === 'pilot'));
  assert(view.routes.some(r => r.route === 'County' && r.category === 'opportunity' && r.status === 'source_missing'));
  assert(view.routes.every(r => r.verified_methods.every(m => m.source_code !== 'sam')));
  assert.equal(view.routes.filter(r => r.route === 'Pilot' && r.category === 'opportunity' && r.status === 'source_missing').length, 0);
});

const handoff = { source_id: sourceId, channel: 'portal', tenant: 'pilot.example.gov',
  checked_on: '2026-10-05', access_state: 'unknown', next_actor: 'researcher',
  next_action: 'Inspect official signup requirements', evidence_urls: ['https://example.gov/bids'],
  signup_url: 'https://example.gov/signup', requirements: { public: 'yes', account: 'unknown',
    approval: 'unknown', api_key: 'no', payment: 'unknown' },
  categories: { forecast: 'unknown', opportunity: 'yes', award: 'unknown' } };
test('handoff preserves registration progress and rejects private or ambiguous metadata', () => {
  const reg = [{ id: 'reg', source_id: sourceId, status: 'pending' }];
  const saved = validateHandoff(handoff, [source], reg);
  assert.equal(saved.registration_id, 'reg');
  assert.equal(saved.access_state, 'pending');
  assert.throws(() => validateHandoff({ ...handoff, account_email: 'x@example.gov' }, [source], []));
  assert.throws(() => validateHandoff({ ...handoff, requirements: { ...handoff.requirements, password: 'secret' } }, [source], []));
  assert.throws(() => validateHandoff({ ...handoff, method_notes: 'Use owner@example.gov' }, [source], []));
  assert.throws(() => validateHandoff({ ...handoff, signup_url: 'https://example.gov/?api_key=secret' }, [source], []));
  assert.throws(() => validateHandoff(handoff, [source], [...reg, ...reg]));
  assert.throws(() => validateHandoff({ ...handoff, checked_on: '2026-09-01' }, [source], [],
    [{ source_id: sourceId, channel: 'portal', tenant: handoff.tenant, checked_on: '2026-10-05' }]));
});
test('private ledger stages prevent rediscovery from resetting access progress', () => {
  assert.equal(ledgerHasAdvancedAccess({portal:{registration:{state:'not_started'},sign_in:{state:'not_tested'}}},'portal'),false);
  assert.equal(ledgerHasAdvancedAccess({portal:{email_verification:{state:'verified'}}},'portal'),true);
  assert.equal(ledgerHasAdvancedAccess({api:{credential_issuance:{state:'issued'}}},'api'),true);
});
