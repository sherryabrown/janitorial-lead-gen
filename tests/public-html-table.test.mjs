import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicHtmlTable } from '../scripts/lib/public-html-table.mjs';
import { adapterContract } from '../scripts/lib/known-source-execution.mjs';

const spec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
  urls: ['https://example.gov/SourcingEvents.aspx?SourceType=1'],
  allowed_hosts: ['example.gov'], max_bytes: 2_000_000,
  response_format: 'html-table-v1', max_records: 100,
  expected_organization: 'Example County',
  table_selector: 'table.rgMasterTable', row_selector: 'tr.rgRow, tr.rgAltRow' };
const html = (pager='2 items in 1 pages') => `<body><table class="rgMasterTable">
  <tr><th></th><th>Bid Number</th><th>Bid Title</th><th>Bid Type</th><th>Organization</th></tr>
  <tr class="rgRow"><td></td><td>26-01</td><td>Cleaning</td><td>ITB</td><td>Example County</td><td>9/1/2026</td><td>10/1/2026</td></tr>
  <tr class="rgAltRow"><td></td><td>26-02</td><td>Roads</td><td>ITB</td><td>Other City</td><td>9/1/2026</td><td>10/1/2026</td></tr>
  </table><div>${pager}</div></body>`;

test('public bid table scopes organization and rejects incomplete pagination', () => {
  const method = { availability: 'active', method: 'browser', kind: 'opportunity',
    parser_version: 'html-table-v1', method_spec: spec,
    verification_evidence: { content_sha256: 'a' },
    verified_at: '2026-01-01T00:00:00Z', verified_until: '2027-01-01T00:00:00Z' };
  const contract = adapterContract(method, { code: 'generic-county' }, new Date('2026-10-05'));
  const listing = inspectPublicHtmlTable(html(), contract);
  assert.equal(listing.terminal, true);
  assert.equal(listing.records.length, 1);
  assert.equal(listing.records[0].title, 'Cleaning');
  assert.equal(inspectPublicHtmlTable(html('20 items in 2 pages'), contract).terminal, false);
  assert.throws(() => inspectPublicHtmlTable(html('pager unavailable'), contract), /unconfirmed/);
  assert.throws(() => inspectPublicHtmlTable('<body>Login</body>', contract), /table changed/);
});
