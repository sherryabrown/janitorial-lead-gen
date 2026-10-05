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

test('readable review surfaces janitorial rows beyond the first fifty without promoting them', () => {
  const rows=Array.from({length:60},(_,index)=>
    `<tr><td>${index===59?'Janitorial Services':'Office Supplies'}</td><td>${index===59?'4600058030':index}</td></tr>`).join('');
  const body=Buffer.from(`<html><title>State Contracts</title><body><main><table><thead><tr><th>Commodity</th><th>Contract Tracking Number</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`);
  const digest=createHash('sha256').update(body).digest('hex');
  const capture={run_id:'run',source_id:'source',content_base64:body.toString('base64'),
    content_sha256:digest,content_type:'text/html',requested_url:'https://example.gov/',
    final_url:'https://example.gov/',retrieved_at:'2026-10-02T00:00:00Z'};
  const run={id:'run',coverage_task_id:'task',detail:{state:'content_saved',content_sha256:digest}};
  const review=captureReview(capture,run,{id:'task',kind:'award',query_window:{}},
    {id:'source',name:'State Contracts',code:'state-contracts'});
  assert.match(review.markdown,/Janitorial keyword rows \(1 matches/);
  assert.match(review.markdown,/\| 60 \| Janitorial Services \| 4600058030 \|/);
  assert.match(review.markdown,/candidates for review/);
  assert.doesNotMatch(review.markdown,/verified zero/i);
});

test('legacy intent table is readable without tbody and keeps document link', () => {
  const body = Buffer.from('<html><title>Arkansas Department of Shared Administrative Services</title>' +
    '<body><table><tr><td><table><tr class="table_head3"><td>Bid #</td><td>Description</td>' +
    '<td>Vendor/Documentation</td></tr><tr class="rowitem1_bold"><td>SP-27-022</td>' +
    '<td>Janitorial Services</td><td><a href="https://sas.arkansas.gov/ata/sp-27-022/">Download List</a>' +
    '</td></tr></table></td></tr></table></body></html>');
  const hash = createHash('sha256').update(body).digest('hex');
  const capture = { run_id: 'run', source_id: 'source', content_base64: body.toString('base64'),
    content_sha256: hash, content_type: 'text/html', requested_url: 'https://www.ark.org/',
    final_url: 'https://www.ark.org/', retrieved_at: '2026-10-04T00:00:00Z' };
  const run = { id: 'run', coverage_task_id: 'task', detail: { state: 'content_saved', content_sha256: hash } };
  const review = captureReview(capture, run, { id: 'task', kind: 'award', query_window: {} },
    { id: 'source', name: 'Intent notices', code: 'state-intents' });
  assert.equal(review.summary.tables.length, 1);
  assert.match(review.markdown, /\| Bid # \| Description \| Vendor\/Documentation \|/);
  assert.match(review.markdown, /SP-27-022 \| Janitorial Services/);
  assert.match(review.markdown, /https:\/\/sas.arkansas.gov\/ata\/sp-27-022\//);
});

test('record watcher review exposes semantic unchanged status and narrow scope', () => {
  const body = Buffer.from('<html><title>ARBuy detail</title><body>S000000473' +
    '<a href="javascript:downloadFile(\'16273\');">Solicitation PDF</a></body></html>');
  const hash = createHash('sha256').update(body).digest('hex');
  const capture = { run_id: 'run', source_id: 'source', content_base64: body.toString('base64'),
    content_sha256: hash, content_type: 'text/html', requested_url: 'https://arbuy.arkansas.gov/',
    final_url: 'https://arbuy.arkansas.gov/', retrieved_at: '2026-10-04T00:00:00Z' };
  const run = { id: 'run', coverage_task_id: 'task', detail: { state: 'content_saved',
    content_sha256: hash, semantic_sha256: 'a'.repeat(64), change_type: 'unchanged' } };
  const review = captureReview(capture, run, { id: 'task', kind: 'award', query_window: {} },
    { id: 'source', code: 'arbuy-janitorial', name: 'Statewide contract' });
  assert.match(review.markdown, /record watch only/);
  assert.match(review.markdown, /Change: unchanged/);
  assert.match(review.markdown, /Semantic SHA-256: a{64}/);
  assert.match(review.markdown, /Solicitation PDF: ARBuy document 16273/);
  assert.match(review.markdown, /not downloaded files/);
});

test('ARDOT JSON capture review shows candidate bid and tab links with page scope', () => {
  const row = Array(14).fill('');
  row[0] = '15350'; row[6] = 'H-27-201A';
  row[7] = 'https://media.ark.org/ardot/H-27-201A.pdf';
  row[8] = '<a href="https://media.ark.org/ardot/H-27-201A-Tab.pdf">Tab</a>';
  row[11] = 'Janitorial Services';
  const body = Buffer.from(JSON.stringify({ draw: 1, recordsTotal: '1', recordsFiltered: '1', data: [row] }));
  const hash = createHash('sha256').update(body).digest('hex');
  const capture = { run_id: 'run', source_id: 'source', content_base64: body.toString('base64'),
    content_sha256: hash, content_type: 'application/json', requested_url: 'https://ardot.gov/wp-admin/admin-ajax.php',
    final_url: 'https://ardot.gov/wp-admin/admin-ajax.php', retrieved_at: '2026-10-04T00:00:00Z' };
  const run = { id: 'run', source_id: 'source', page_index: 0, coverage_task_id: 'task',
    detail: { state: 'content_saved', content_sha256: hash } };
  const review = captureReview(capture, run, { id: 'task', kind: 'opportunity', query_window: {} },
    { id: 'source', code: 'ardot', name: 'ARDOT' });
  assert.match(review.markdown, /ARDOT table page 1/);
  assert.match(review.markdown, /Janitorial keyword rows/);
  assert.match(review.markdown, /H-27-201A-Tab.pdf/);
  assert.match(review.markdown, /full table needs all pages/);
});
