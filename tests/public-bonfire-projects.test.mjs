import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicBonfireProjects, inspectPublicBonfireContracts } from '../scripts/lib/public-bonfire-projects.mjs';
import { adapterContract } from '../scripts/lib/known-source-execution.mjs';

const spec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
  urls: ['https://town.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData'],
  allowed_hosts: ['town.bonfirehub.com'], max_bytes: 2_000_000,
  response_format: 'bonfire-projects-v1', max_records: 100 };
const body = projects => Buffer.from(JSON.stringify({ success: 1,
  payload: { projects } }));

test('public Bonfire projects are bounded and reusable without a city code', () => {
  const method = { availability: 'active', method: 'browser', kind: 'opportunity',
    parser_version: 'bonfire-projects-v1', method_spec: spec,
    verification_evidence: { content_sha256: 'a' },
    verified_at: '2026-01-01T00:00:00Z', verified_until: '2027-01-01T00:00:00Z' };
  const contract = adapterContract(method, { code: 'town-public' }, new Date('2026-10-05'));
  const listing = inspectPublicBonfireProjects(body({ 17: { ProjectID: '17',
    ProjectName: 'Custodial services', DateClose: '2026-11-01 19:00:00' } }), contract);
  assert.equal(listing.terminal, true);
  assert.equal(listing.records[0].url, 'https://town.bonfirehub.com/opportunities/17');
  assert.throws(() => inspectPublicBonfireProjects(body({ 17: { ProjectID: '18',
    ProjectName: 'Bid', DateClose: '2026-11-01 19:00:00' } }), contract), /row changed/);
  assert.throws(() => inspectPublicBonfireProjects(Buffer.from('<html>Working...</html>'), contract), /not JSON/);
});

test('public Bonfire contract index validates stable IDs and dates', () => {
  const contract = { ...spec,
    urls: ['https://town.bonfirehub.com/PublicPortal/getPublicContractsSectionData'],
    response_format: 'bonfire-contracts-v1' };
  const body = Buffer.from(JSON.stringify({ success: 1, payload: { publicContracts: {
    0: { ContractID: '28', Name: 'Janitorial services',
      StartDate: '2026-01-01 06:00:00', EndDate: '2027-01-01 06:00:00' } } } }));
  assert.equal(inspectPublicBonfireContracts(body, contract).records[0].url,
    'https://town.bonfirehub.com/publicContracts/28');
  assert.throws(() => inspectPublicBonfireContracts(Buffer.from('{"success":1,"payload":{}}'), contract),
    /changed/);
});
