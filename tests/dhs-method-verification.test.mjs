import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dhsAnnouncementsUrl, verifiedDhsOpportunityMethod } from '../scripts/lib/dhs-method-verification.mjs';

function fixture(serverSide = false) {
  const body = Buffer.from('<html><title>Procurement Announcements - Arkansas DHS</title><body>' +
    `<input id="table_1_desc" value='${JSON.stringify({ serverSide, tableWpId: 149 })}'>` +
    '<table id="table_1"><thead><tr><th>Title</th><th>Closing Date</th><th>Type</th></tr></thead>' +
    '<tbody><tr><td>Janitorial Services</td><td>01/02/2026</td><td>Anticipation to Award</td>' +
    '</tr></tbody></table></body></html>');
  return { state: 'captured', requested_url: dhsAnnouncementsUrl, final_url: dhsAnnouncementsUrl,
    content_type: 'text/html', bytes: body.length, body,
    content_sha256: createHash('sha256').update(body).digest('hex') };
}
const source = { id: 'source', code: 'dhs',
  url: 'https://humanservices.arkansas.gov/announcements/janitorial-services-multiple-counties/',
  source_coverage_areas: [{ area_type: 'state', state_code: 'AR' }] };
const geography = { id: '05', kind: 'state', state_code: 'AR', source_active: true };

test('DHS current index method preserves historical source and notice limits', () => {
  const method = verifiedDhsOpportunityMethod(source, geography, fixture());
  assert.equal(method.kind, 'opportunity');
  assert.equal(method.official_entry_url, source.url);
  assert.deepEqual(method.method_spec.urls, [dhsAnnouncementsUrl]);
  assert.match(method.verification_evidence.coverage_limit, /closed historical notices/);
  assert.match(method.verification_evidence.coverage_limit, /not executed awards/);
});

test('DHS paginated or altered table cannot be promoted to complete method', () => {
  assert.throws(() => verifiedDhsOpportunityMethod(source, geography, fixture(true)),
    /Complete DHS announcement table/);
  const capture = fixture();
  assert.throws(() => verifiedDhsOpportunityMethod(source, geography,
    { ...capture, content_sha256: '0'.repeat(64) }), /official DHS announcements capture/);
});
