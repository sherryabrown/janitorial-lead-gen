import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { arbuyOpenBidsUrl, verifiedArbuyOpenMethod } from '../scripts/lib/arbuy-open-method-verification.mjs';

const source = { id: 'source', code: 'arbuy', url: 'https://arbuy.arkansas.gov/bso/view/login/login.xhtml',
  source_coverage_areas: [{ area_type: 'state', state_code: 'AR' }] };
const geography = { id: '05', kind: 'state', state_code: 'AR', source_active: true };
function capture(result = 'No records found.') {
  const body = Buffer.from('<html><title>ARBuy - /view/search/external/advancedSearchBid.xhtml - openBids=true</title>' +
    '<body><form id="bidSearchResultsForm"></form><table><thead><tr><th>Bid Solicitation #</th>' +
    `<th>Bid Opening Date</th></tr></thead><tbody><tr><td>${result}</td></tr></tbody></table></body></html>`);
  return { state: 'captured', requested_url: arbuyOpenBidsUrl, final_url: arbuyOpenBidsUrl,
    content_type: 'text/html', body, bytes: body.length,
    content_sha256: createHash('sha256').update(body).digest('hex') };
}

test('ARBuy public open-bids view is limited to active legacy rows', () => {
  const method = verifiedArbuyOpenMethod(source, geography, capture());
  assert.equal(method.kind, 'opportunity');
  assert.deepEqual(method.method_spec.urls, [arbuyOpenBidsUrl]);
  assert.match(method.verification_evidence.coverage_limit, /historical search.*not covered/);
  assert.match(method.verification_evidence.coverage_limit, /not a verified zero/);
});

test('ARBuy login page cannot masquerade as an open-bids result', () => {
  const fake = capture();
  const altered = Buffer.from('<html><title>ARBuy Login</title><body>No records found.</body></html>');
  assert.throws(() => verifiedArbuyOpenMethod(source, geography, {
    ...fake, body: altered, bytes: altered.length,
    content_sha256: createHash('sha256').update(altered).digest('hex'),
  }), /result table was not found/);
});
