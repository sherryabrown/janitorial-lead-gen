import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicJsonListing } from '../scripts/lib/public-json-listing.mjs';
import { adapterContract } from '../scripts/lib/known-source-execution.mjs';

const url = 'https://example.gov/wp-admin/admin-ajax.php?action=files.display&id=7&page_limit=100';
const spec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
  urls: [url], allowed_hosts: ['example.gov'], max_bytes: 2_000_000,
  response_format: 'json-files-v1', expected_category: '2026', max_records: 100 };
const body = pagination => Buffer.from(JSON.stringify({ category: { name: '2026' }, pagination,
  files: [{ ID: 41, post_title: 'Custodial services summary', created: '05-12-2026',
    linkdownload: 'https://example.gov/download/41.pdf' }] }));

test('verified JSON document listing is reusable across geography and source codes', () => {
  const method = { availability: 'active', method: 'browser', kind: 'opportunity',
    parser_version: 'json-files-v1', method_spec: spec,
    verification_evidence: { content_sha256: 'a' },
    verified_at: '2026-01-01T00:00:00Z', verified_until: '2027-01-01T00:00:00Z' };
  const contract = adapterContract(method, { code: 'another-town' }, new Date('2026-10-05'));
  assert.equal(contract.response_format, 'json-files-v1');
  assert.equal(inspectPublicJsonListing(body(false), contract).terminal, true);
  assert.equal(inspectPublicJsonListing(body(true), contract).terminal, false);
  assert.throws(() => inspectPublicJsonListing(Buffer.from('<html>blocked</html>'), contract), /not JSON/);
  assert.throws(() => inspectPublicJsonListing(Buffer.from(JSON.stringify({
    category: { name: 'Other' }, pagination: false, files: [] })), contract), /category changed/);
  assert.throws(() => inspectPublicJsonListing(Buffer.from(JSON.stringify({
    category: { name: '2026' }, pagination: false,
    files: [{ ID: 1, post_title: 'Bid', created: '01-01-2026', linkdownload: 'http://example.gov/1' }] })), contract), /safe stable identity/);
});
