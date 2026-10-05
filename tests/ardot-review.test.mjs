import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { summarizeArdotPages } from '../scripts/lib/ardot-review.mjs';

function saved(index, total, count) {
  const data = Array.from({ length: count }, (_, i) => {
    const row = Array(14).fill('');
    row[0] = String(index * 100 + i + 1);
    row[6] = `H-27-${index * 100 + i + 1}`;
    row[7] = 'https://media.ark.org/ardot/bid.pdf';
    row[11] = index === 1 ? 'Janitorial Services' : 'Road supplies';
    return row;
  });
  const body = Buffer.from(JSON.stringify({ draw: index + 1,
    recordsTotal: String(total), recordsFiltered: String(total), data }));
  const hash = createHash('sha256').update(body).digest('hex');
  const run = { id: `run-${index}`, source_id: 'source', page_index: index,
    detail: { state: 'content_saved', content_sha256: hash,
      records_total: total, rows: count, terminal: index === 1 } };
  const capture = { run_id: run.id, source_id: 'source', content_type: 'application/json',
    content_base64: body.toString('base64'), content_sha256: hash };
  return { run, capture };
}

test('ARDOT review accounts for all pages and surfaces later candidate', () => {
  const pages = [saved(0, 101, 100), saved(1, 101, 1)];
  const review = summarizeArdotPages([...pages].reverse());
  assert.equal(review.total_rows, 101);
  assert.equal(review.candidates.length, 1);
  assert.match(review.markdown, /H-27-101/);
  assert.match(review.markdown, /human review only/);
});

test('ARDOT review rejects missing, changed or duplicated pages', () => {
  const pages = [saved(0, 101, 100), saved(1, 101, 1)];
  assert.throws(() => summarizeArdotPages(pages.slice(0, 1)), /terminal page/);
  const changed = structuredClone(pages);
  changed[1].capture.content_sha256 = '0'.repeat(64);
  assert.throws(() => summarizeArdotPages(changed), /hash mismatch/);
  const duplicate = structuredClone(pages);
  const body = Buffer.from(duplicate[1].capture.content_base64, 'base64');
  const json = JSON.parse(body.toString());
  json.data[0][0] = '1';
  const revised = Buffer.from(JSON.stringify(json));
  const hash = createHash('sha256').update(revised).digest('hex');
  duplicate[1].capture.content_base64 = revised.toString('base64');
  duplicate[1].capture.content_sha256 = hash;
  duplicate[1].run.detail.content_sha256 = hash;
  assert.throws(() => summarizeArdotPages(duplicate), /identity repeated/);
});
