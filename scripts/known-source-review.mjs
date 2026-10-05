import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { adminClient } from './lib/supabase-admin.mjs';
import { buildKnownSourcePlan } from './lib/known-source-execution.mjs';
import { captureReview, gapReport } from './lib/source-review.mjs';
import { sourceInventory, inventoryReport } from './lib/source-inventory.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [command, requestId, runId] = process.argv.slice(2);
if (command === 'registry' ? requestId !== undefined :
    !['report', 'capture'].includes(command) || !uuid.test(requestId || '') ||
    (command === 'capture' ? !uuid.test(runId || '') : runId !== undefined))
  throw new Error('Usage: node scripts/known-source-review.mjs registry | report REQUEST_UUID | capture REQUEST_UUID RUN_UUID');

const db = adminClient();
async function rows(table, columns = '*', filter = null) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from(table).select(columns);
    if (filter) query = filter(query);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
function writeOnce(file, content) {
  if (existsSync(file)) {
    if (!readFileSync(file).equals(Buffer.from(content)))
      throw new Error(`Existing review file differs: ${file}`);
    return;
  }
  writeFileSync(file, content, { flag: 'wx' });
}

if (command === 'registry') {
  const [sources, capabilities, geographies] = await Promise.all([
    rows('procurement_sources'), rows('procurement_source_capabilities'), rows('procurement_geographies')]);
  const inventory = sourceInventory(sources,capabilities,geographies);
  const report = inventoryReport(inventory);
  const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex').slice(0,12);
  const directory = resolve('outputs','known-source','registry');
  mkdirSync(directory,{recursive:true});
  const file=join(directory,`inventory-${digest}.md`);
  writeOnce(file,report.markdown);
  writeOnce(join(directory,`inventory-${digest}.json`),JSON.stringify(inventory,null,2)+'\n');
  console.log(JSON.stringify({...report.summary,file,next:'Review unresolved mappings and each source/category before the next build batch'},null,2));
} else {
const request = (await rows('procurement_search_requests', '*', q => q.eq('id', requestId)))[0];
if (!request) throw new Error('Search request does not exist');
const targets = await rows('procurement_request_targets', '*', q => q.eq('search_request_id', requestId));
if (!targets.length) throw new Error('Search request has no geography targets');
const directory = resolve('outputs', 'known-source', requestId);
mkdirSync(directory, { recursive: true });

if (command === 'report') {
  const [geographies, capabilities, sources, tasks] = await Promise.all([
    rows('procurement_geographies'), rows('procurement_source_capabilities'),
    rows('procurement_sources'),
    rows('procurement_coverage_tasks', '*', q => q.in('target_id', targets.map(t => t.id))),
  ]);
  const plan = buildKnownSourcePlan(request, targets, geographies, capabilities, sources);
  const mappingMissing = sourceInventory(sources,capabilities,geographies)
    .filter(s => s.mapping_status === 'mapping_missing').map(s => ({ source_id:s.source_id,code:s.code,next_action:s.next_action }));
  const runs = tasks.length ? await rows('procurement_runs', 'id,coverage_task_id,detail', q =>
    q.in('coverage_task_id', tasks.map(task => task.id))) : [];
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const publicChecks = runs.filter(run => run.detail?.state === 'content_saved').map(run => ({
    run_id: run.id, category: taskById.get(run.coverage_task_id)?.kind ?? 'unknown',
    source_code: sourceById.get(taskById.get(run.coverage_task_id)?.source_id)?.code ?? 'unknown',
  }));
  const report = gapReport(requestId, plan, geographies, sources, publicChecks);
  report.markdown += '\n## Registry sources with unresolved geography (not assigned to this request)\n\n'+
    (mappingMissing.map(s => `- ${s.code}: ${s.next_action}`).join('\n') || 'None.')+'\n';
  const digest = createHash('sha256').update(report.markdown).digest('hex').slice(0, 12);
  const file = join(directory, `coverage-review-${digest}.md`);
  writeOnce(file, report.markdown);
  console.log(JSON.stringify({ request_id: requestId, known: plan.known,
    entry_checks: plan.entry_checks, source_gaps:plan.source_gaps, mapping_missing:mappingMissing, gaps: report.gaps.map(g => ({ geography: g.geography,
      category: g.category, state: g.state, registered_sources: g.registered_sources.length,
      source_code:g.source_code,scope:g.scope,
      next_action: g.next_action })), saved_public_captures: publicChecks,
    file, next: 'Review category methods for known sources; source_missing routes need Phase 3 research.' }, null, 2));
} else {
  const run = (await rows('procurement_runs', '*', q => q.eq('id', runId)))[0];
  const task = run && (await rows('procurement_coverage_tasks', '*', q => q.eq('id', run.coverage_task_id)))[0];
  if (!task || !targets.some(target => target.id === task.target_id))
    throw new Error('Run does not belong to this search request');
  const [capture, source] = await Promise.all([
    rows('procurement_public_captures', '*', q => q.eq('run_id', runId)).then(result => result[0]),
    rows('procurement_sources', '*', q => q.eq('id', run.source_id)).then(result => result[0]),
  ]);
  const review = captureReview(capture, run, task, source);
  const rawFile = join(directory, `${runId}${review.extension}`);
  const reviewHash = createHash('sha256').update(review.markdown).digest('hex').slice(0, 12);
  const reviewFile = join(directory, `${runId}.${reviewHash}.review.md`);
  writeOnce(rawFile, review.body);
  writeOnce(reviewFile, review.markdown);
  console.log(JSON.stringify({ request_id: requestId, run_id: runId,
    ...review.summary, review_file: reviewFile, raw_file: rawFile,
    next: task.kind === 'source_entry' ? 'Verify a category-specific source method; entry content is not lead coverage.'
      : 'Review the captured category content before staging any candidate lead.' }, null, 2));
}
}
