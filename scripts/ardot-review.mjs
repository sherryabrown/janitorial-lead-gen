import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { adminClient } from './lib/supabase-admin.mjs';
import { summarizeArdotPages } from './lib/ardot-review.mjs';

const requestId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId ?? '') ||
    process.argv.length !== 3)
  throw new Error('Usage: node scripts/ardot-review.mjs REQUEST_UUID');
const db = adminClient();
async function rows(table, columns, filter) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await filter(db.from(table).select(columns)).range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
const source = (await rows('procurement_sources', 'id,code', q => q.eq('code', 'ardot')))[0];
if (!source) throw new Error('ARDOT source missing');
const tasks = await rows('procurement_coverage_tasks', 'id,target_id,kind,source_id,state', q =>
  q.eq('source_id', source.id).eq('kind', 'opportunity'));
const targets = await rows('procurement_request_targets', 'id', q => q.eq('search_request_id', requestId));
const matched = tasks.filter(task => task.state === 'needs_interpretation' &&
  targets.some(target => target.id === task.target_id));
if (matched.length !== 1)
  throw new Error('One completed ARDOT opportunity task required for this request');
const runs = await rows('procurement_runs', '*', q =>
  q.eq('coverage_task_id', matched[0].id).eq('status', 'review_required'));
const captures = await rows('procurement_public_captures', '*', q =>
  q.in('run_id', runs.map(run => run.id)));
const byRun = new Map(captures.map(capture => [capture.run_id, capture]));
const summary = summarizeArdotPages(runs.map(run => ({ run, capture: byRun.get(run.id) })));
const directory = resolve('outputs', 'known-source', requestId);
mkdirSync(directory, { recursive: true });
const digest = createHash('sha256').update(summary.markdown).digest('hex').slice(0, 12);
const file = join(directory, `ardot-review-${digest}.md`);
if (!existsSync(file)) writeFileSync(file, summary.markdown, { flag: 'wx' });
console.log(JSON.stringify({ request_id: requestId, pages: summary.pages,
  total_rows: summary.total_rows, keyword_candidates: summary.candidates.length,
  file, next: 'Review candidate bid/tab PDFs and location before staging any lead.' }, null, 2));
