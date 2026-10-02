import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureReview, gapReport } from '../scripts/lib/source-review.mjs';

test('coverage report distinguishes mapped methods from missing county sources', () => {
  const plan = { known: 2, entry_checks: 1, blocked: 0, tasks: [
    { route_geography_id: 'city', kind: 'forecast', state: 'method_missing',
      evidence: { registered_source_ids: ['source'] } },
    { route_geography_id: 'county', kind: 'opportunity', state: 'source_missing', evidence: {} },
    { route_geography_id: 'state', kind: 'award', state: 'unchecked' },
  ] };
  const places = [{ id: 'city', name: 'Texarkana' }, { id: 'county', name: 'Miller County' }];
  const sources = [{ id: 'source', code: 'tasd-public-board', url: 'https://www.tasd7.net/page/school-board-resources/' }];
  const result = gapReport('request-id', plan, places, sources,
    [{ source_code: 'tasd-public-board', run_id: 'saved-run', category: 'source_entry' }]);
  assert.equal(result.gaps.length, 2);
  assert.equal(result.gaps[0].registered_sources.length, 1);
  assert.match(result.markdown, /Miller County \| opportunity \| source_missing/);
  assert.match(result.markdown, /entry only; content awaits interpretation/);
  assert.match(gapReport('request-id', plan, places, sources,
    [{ source_code: 'state-contracts', run_id: 'award-run', category: 'award' }]).markdown,
    /award listing; content awaits interpretation/);
  assert.doesNotMatch(result.markdown, /zero results/i);
});

test('saved HTML review verifies bytes and identifies entry-only scope without interpreting leads', () => {
  const html = Buffer.from('<html><head><title>Board resources</title><script>secret()</script></head>' +
    '<body><main><h1>School Board Resources</h1><a href="/bids">Bid documents</a>' +
    '<table><thead><tr><th>RFP Name</th><th>Response Deadline</th></tr></thead>' +
    '<tbody><tr><td>Cleaning Services</td><td>10/20/2026</td></tr></tbody></table>' +
    '</main></body></html>');
  const hash = createHash('sha256').update(html).digest('hex');
  const capture = { run_id: 'run', source_id: 'source', content_base64: html.toString('base64'),
    content_sha256: hash, content_type: 'text/html', requested_url: 'https://example.gov/',
    final_url: 'https://example.gov/', retrieved_at: '2026-10-02T00:00:00Z' };
  const run = { id: 'run', coverage_task_id: 'task', detail: { state: 'content_saved', content_sha256: hash } };
  const task = { id: 'task', kind: 'source_entry', query_window: {} };
  const source = { id: 'source', name: 'District', code: 'district' };
  const review = captureReview(capture, run, task, source);
  assert.equal(review.summary.title, 'Board resources');
  assert.match(review.markdown, /Entry URL only; no forecast, opportunity, or award coverage verified/);
  assert.match(review.markdown, /School Board Resources/);
  assert.match(review.markdown, /https:\/\/example.gov\/bids/);
  assert.match(review.markdown, /\| RFP Name \| Response Deadline \|/);
  assert.match(review.markdown, /\| Cleaning Services \| 10\/20\/2026 \|/);
  assert.doesNotMatch(review.markdown, /secret\(\)/);
  assert.throws(() => captureReview({ ...capture, content_sha256: '0'.repeat(64) }, run, task, source),
    /hash does not match/);
});
