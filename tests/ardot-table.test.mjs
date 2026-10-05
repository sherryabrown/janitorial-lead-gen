import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ardotUrl, ardotAjaxUrl, inspectArdotEntry, ardotPostBody,
  inspectArdotPage, verifiedArdotMethod, fetchArdotPage } from '../scripts/lib/ardot-table.mjs';

function entryCapture(serverSide = true) {
  const config = { tableWpId: 53, serverSide,
    dataTableParams: { ajax: { url: ardotAjaxUrl, type: 'POST' },
      columnDefs: Array.from({ length: 14 }, (_, i) => ({ name: `col${i}`,
        searchable: true, orderable: true })) } };
  const body = Buffer.from('<html><title>Bid Openings by Fiscal Year - ARDOT</title><body>' +
    `<input id="table_1_desc" value='${JSON.stringify(config)}'>` +
    '<input id="wdtNonceFrontendServerSide_53" value="abcdef123456"></body></html>');
  return { state: 'captured', requested_url: ardotUrl, final_url: ardotUrl,
    content_type: 'text/html', body, bytes: body.length,
    content_sha256: createHash('sha256').update(body).digest('hex') };
}
function page(index = 0, total = 101, count = 100) {
  const data = Array.from({ length: count }, (_, i) => {
    const row = Array(14).fill('');
    row[0] = String(index * 100 + i + 1);
    row[6] = `H-27-${index * 100 + i + 1}`;
    row[7] = `https://media.ark.org/ardot/H-27-${index * 100 + i + 1}.pdf`;
    row[11] = i === 99 ? 'Janitorial Services' : 'Road supplies';
    return row;
  });
  return Buffer.from(JSON.stringify({ draw: index + 1, recordsTotal: String(total),
    recordsFiltered: String(total), data }));
}
const source = { id: 'source', code: 'ardot', url: ardotUrl,
  source_coverage_areas: [{ area_type: 'state', state_code: 'AR' }] };
const geography = { id: '05', kind: 'state', state_code: 'AR', source_active: true };

test('ARDOT adapter requires official server-side config and bounded POST fields', () => {
  const entry = inspectArdotEntry(entryCapture());
  const body = ardotPostBody(entry, 1);
  assert.equal(body.get('wdtNonce'), 'abcdef123456');
  assert.equal(body.get('start'), '100');
  assert.equal(body.get('length'), '100');
  assert.equal(body.get('columns[13][name]'), 'col13');
  assert.throws(() => inspectArdotEntry(entryCapture(false)), /settings changed/);
  assert.throws(() => ardotPostBody(entry, 30), /bound exceeded/);
});

test('ARDOT page accounting requires every row and a confirmed terminal', () => {
  const first = inspectArdotPage(page(), 0);
  const last = inspectArdotPage(page(1, 101, 1), 1);
  assert.equal(first.terminal, false);
  assert.equal(first.rows, 100);
  assert.equal(last.terminal, true);
  assert.equal(last.records[0].bid_number, 'H-27-101');
  assert.throws(() => inspectArdotPage(page(0, 101, 99), 0), /length does not match/);
  assert.throws(() => inspectArdotPage(page(0, 3001, 100), 0), /incomplete/);
});

test('ARDOT method and fetch retain bounded live page evidence', async () => {
  const entry = entryCapture();
  const firstBody = page();
  const method = verifiedArdotMethod(source, geography, entry,
    { status: 200, body: firstBody });
  assert.equal(method.method_spec.runner_id, 'ardot-table');
  assert.equal(method.method_spec.max_pages, 30);
  assert.match(method.verification_evidence.coverage_limit, /PDFs need separate review/);
  const fetched = await fetchArdotPage(inspectArdotEntry(entry), 0, 100,
    async (url, options) => {
      assert.equal(url, ardotAjaxUrl);
      assert.equal(options.body.get('wdtNonce'), 'abcdef123456');
      return new Response(firstBody, { status: 200 });
    });
  assert.equal(fetched.state, 'captured');
  assert.equal(fetched.rows, 100);
  assert.equal(fetched.content_sha256.length, 64);
});
