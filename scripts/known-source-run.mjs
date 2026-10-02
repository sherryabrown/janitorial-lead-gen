import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { adminClient, project, serverKey } from './lib/supabase-admin.mjs';
import { buildKnownSourcePlan, adapterContract, registeredEntryContract, samFilters, inspectSamCapture, samObservations } from './lib/known-source-execution.mjs';
import { fetchPublicCheck, contentChangeType } from './lib/public-source-check.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [command, requestId, ...options] = process.argv.slice(2);
const sourceOption = options.find(x => x.startsWith('--source='));
const selectedSourceCode = sourceOption?.slice('--source='.length);
if (!['plan', 'run'].includes(command) || !uuid.test(requestId || '') || options.length > 1 ||
    (options.length && (command !== 'run' || !sourceOption ||
      !/^[a-z0-9][a-z0-9-]{1,79}$/.test(selectedSourceCode))))
  throw new Error('Usage: node scripts/known-source-run.mjs plan REQUEST_UUID | run REQUEST_UUID [--source=SOURCE_CODE]');
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
async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}
const request = (await rows('procurement_search_requests', '*', q => q.eq('id', requestId)))[0];
if (!request) throw new Error('Search request does not exist');
const targets = await rows('procurement_request_targets', '*', q => q.eq('search_request_id', requestId));
if (!targets.length || targets.some(t => !t.geography_id || t.state === 'needs_review'))
  throw new Error('Request needs confirmed, resolved geography targets');
const [geographies, capabilities, sources] = await Promise.all([
  rows('procurement_geographies'), rows('procurement_source_capabilities'), rows('procurement_sources'),
]);
const plan = buildKnownSourcePlan(request, targets, geographies, capabilities, sources);
if (command === 'plan') {
  const persisted = await rpc('create_procurement_known_plan', { p_request_id: requestId, p_tasks: plan.tasks });
  console.log(JSON.stringify({ ...persisted, known: plan.known, entry_checks: plan.entry_checks,
    gaps: plan.gaps, blocked: plan.blocked,
    next: plan.known || plan.entry_checks ? `node scripts/known-source-run.mjs run ${requestId}` :
      'Verify missing source methods before collection' }, null, 2));
} else {
  const jobs = await rows('procurement_jobs', '*', q => q.eq('search_request_id', requestId).eq('kind', 'collect').not('task_id', 'is', null));
  const tasks = await rows('procurement_coverage_tasks', '*', q => q.in('target_id', targets.map(t => t.id)));
  if (selectedSourceCode && !sources.some(s => s.code === selectedSourceCode))
    throw new Error(`Source code ${selectedSourceCode} is not registered`);
  const output = [];
  for (const candidate of jobs) {
    if (!['pending', 'partial', 'running'].includes(candidate.state)) continue;
    if (selectedSourceCode && sources.find(s => s.id === tasks.find(t => t.id === candidate.task_id)?.source_id)?.code !== selectedSourceCode)
      continue;
    const job = await rpc('claim_procurement_known_job', { p_job_id: candidate.id });
    if (!job) continue;
    const task = tasks.find(t => t.id === job.task_id);
    const capability = capabilities.find(c => c.id === job.capability_id);
    const source = sources.find(s => s.id === task?.source_id);
    if (!task || !source || task.state === 'source_missing' || task.state === 'method_missing' ||
        (task.kind !== 'source_entry' && (!capability || task.capability_id !== capability.id ||
          capability.source_id !== source.id)))
      throw new Error(`Leased job ${job.id} has an invalid route`);
    let contract;
    try {
      contract = task.kind === 'source_entry' ? registeredEntryContract(source) : adapterContract(capability, source);
      if (!contract || task.kind === 'source_entry' && task.evidence?.entry_url !== source.url)
        throw new Error('Registered source entry URL changed since planning');
    }
    catch (error) {
      const evidence = { runner: task.kind === 'source_entry' ? 'registry-entry' :
        capability?.method_spec?.runner_id, reason: error.message, pages_confirmed: 0 };
      const finished = await rpc('finish_procurement_known_job', {
        p_job_id: job.id, p_lease_token: job.lease_token, p_job_state: 'blocked',
        p_task_state: 'blocked', p_checkpoint: job.checkpoint, p_evidence: evidence,
        p_pages: 0, p_results: 0, p_last_error: error.message,
      });
      if (!finished) throw new Error(`Job ${job.id} lease expired while recording blocked method`);
      output.push({ task_id: task.id, kind: task.kind, route_geography_id: task.route_geography_id,
        state: 'blocked', pages: 0, results: 0, run_ids: [], reason: error.message });
      continue;
    }
    if (contract.runner_id === 'public-fetch') {
      const runIds = []; let pages = 0, jobState = 'succeeded', taskState = 'needs_interpretation';
      let reason = null;
      for (const [page, url] of contract.urls.entries()) {
        const attempts = await rows('procurement_runs', '*', q => q.eq('job_id', job.id).eq('page_index', page));
        let run = attempts.find(r => r.detail?.state === 'content_saved') ??
          attempts.find(r => r.page_attempt === job.attempts) ??
          attempts.find(r => r.detail?.state === 'request_pending') ??
          attempts.find(r => r.detail?.upstream_status !== 429);
        if (!run) {
          const inserted = await db.from('procurement_runs').insert({
            source_id: source.id, job_id: job.id, coverage_task_id: task.id,
            page_index: page, page_attempt: job.attempts, started_at: new Date().toISOString(),
            status: 'partial', record_count: 0,
            detail: { collector: task.kind === 'source_entry' ? 'registry-entry' : 'public-fetch',
              scope: task.kind === 'source_entry' ? 'entry_only' : 'verified_method',
              state: 'request_pending', requested_url: url,
              parser_version: contract.parser_version, check_when: contract.check_when,
              query_window: task.query_window },
          }).select('*').single();
          if (inserted.error || !inserted.data)
            throw new Error(`Cannot audit public request; no fetch sent: ${inserted.error?.message ?? 'no row returned'}`);
          run = inserted.data;
          const capture = await fetchPublicCheck(contract, url);
          if (capture.state === 'captured') {
            const previous = await rows('procurement_public_captures', 'content_sha256', q =>
              q.eq('source_id', source.id).eq('final_url', capture.final_url)
            );
            const stored = await db.from('procurement_public_captures').insert({
              run_id: run.id, source_id: source.id, requested_url: url,
              final_url: capture.final_url, content_type: capture.content_type,
              content_sha256: capture.content_sha256, content_base64: capture.body.toString('base64'),
            });
            if (stored.error) throw new Error(`Public capture ${run.id} storage uncertain; inspect before retrying`);
            const detail = { collector: task.kind === 'source_entry' ? 'registry-entry' : 'public-fetch',
              scope: task.kind === 'source_entry' ? 'entry_only' : 'verified_method',
              state: 'content_saved', requested_url: url,
              final_url: capture.final_url, redirects: capture.redirects, upstream_status: 200,
              content_type: capture.content_type, content_sha256: capture.content_sha256,
              bytes: capture.bytes,
              change_type: contentChangeType(previous.map(p => p.content_sha256), capture.content_sha256),
              parser_version: contract.parser_version, check_when: contract.check_when,
              query_window: task.query_window, interpretation: 'pending' };
            const updated = await db.from('procurement_runs').update({ status: 'review_required',
              finished_at: new Date().toISOString(), detail }).eq('id', run.id);
            if (updated.error) throw new Error(`Public run ${run.id} update uncertain; inspect before retrying`);
            run.detail = detail;
          } else {
            const detail = { collector: task.kind === 'source_entry' ? 'registry-entry' : 'public-fetch',
              scope: task.kind === 'source_entry' ? 'entry_only' : 'verified_method',
              state: capture.state === 'outcome_unknown' ?
              'request_pending' : 'response_captured', requested_url: url, final_url: capture.final_url,
              redirects: capture.redirects, upstream_status: capture.upstream_status ?? null,
              reason: capture.reason, parser_version: contract.parser_version,
              check_when: contract.check_when, query_window: task.query_window };
            const updated = await db.from('procurement_runs').update({
              status: capture.state === 'blocked' ? 'blocked' : 'partial',
              finished_at: new Date().toISOString(), detail,
            }).eq('id', run.id);
            if (updated.error) throw new Error(`Public run ${run.id} update uncertain; inspect before retrying`);
            run.detail = detail;
          }
        }
        if (run.detail?.state !== 'content_saved') {
          const status = run.detail?.upstream_status;
          jobState = status === 429 ? 'partial' : run.detail?.state === 'request_pending' ?
            'outcome_unknown' : status === 401 || status === 403 ? 'blocked' : 'partial';
          taskState = jobState === 'blocked' ? 'blocked' : 'partial';
          reason = run.detail?.reason ?? `Public page ${page} has no confirmed content`;
          break;
        }
        runIds.push(run.id); pages++;
      }
      const checkpoint = { next_page: pages, run_ids: runIds };
      const evidence = { runner: task.kind === 'source_entry' ? 'registry-entry' : 'public-fetch',
        scope: task.kind === 'source_entry' ? 'entry_only' : 'verified_method',
        parser_version: contract.parser_version,
        requested_urls: contract.urls, run_ids: runIds, pages_confirmed: pages,
        terminal_confirmed: jobState === 'succeeded', interpretation: 'pending', reason };
      const finished = await rpc('finish_procurement_known_job', {
        p_job_id: job.id, p_lease_token: job.lease_token, p_job_state: jobState,
        p_task_state: taskState, p_checkpoint: checkpoint, p_evidence: evidence,
        p_pages: pages, p_results: 0, p_last_error: reason,
      });
      if (!finished) throw new Error(`Job ${job.id} lease expired; inspect stored public captures`);
      output.push({ task_id: task.id, kind: task.kind, route_geography_id: task.route_geography_id,
        state: taskState, pages, results: 0, run_ids: runIds, reason });
      continue;
    }
    const runIds = [];
    let pages = 0, results = 0, jobState = 'partial', taskState = 'partial';
    let reason = 'Page bound reached before terminal page';
    for (let page = 0; page < contract.max_pages; page++) {
      const filters = samFilters(capability, source, task.query_window, page);
      const attempts = await rows('procurement_runs', '*', q => q.eq('job_id', job.id).eq('page_index', page));
      const existing = attempts.find(r => r.detail?.state === 'response_captured' && r.detail?.upstream_status === 200) ??
        attempts.find(r => r.page_attempt === job.attempts) ??
        attempts.find(r => r.detail?.state !== 'response_captured') ??
        attempts.find(r => r.detail?.upstream_status !== 429);
      let capture;
      if (existing) {
        if (existing.detail?.state !== 'response_captured') {
          jobState = 'outcome_unknown'; reason = `Page ${page} was attempted without a confirmed response`; break;
        }
        capture = { run_id: existing.id, captured: true, ...existing.detail };
      } else {
        const key = serverKey();
        let response;
        try {
          response = await fetch(`https://${project}.supabase.co/functions/v1/sam-search`, {
            method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: capability.kind === 'award' ? 'awards' : 'opportunities', filters,
              execution: { job_id: job.id, task_id: task.id, page_index: page } }),
            signal: AbortSignal.timeout(90000),
          });
          capture = await response.json();
        } catch { capture = null; }
        if (!response?.ok || !capture?.captured) {
          jobState = 'outcome_unknown'; reason = `Page ${page} outcome uncertain; inspect procurement_runs before resuming`;
          break;
        }
      }
      const kind = capability.kind === 'award' ? 'awards' : 'opportunities';
      const assessment = inspectSamCapture(capture, kind, contract.page_size, page);
      if (assessment.state === 'blocked' || assessment.state === 'partial' || assessment.state === 'outcome_unknown') {
        jobState = assessment.state === 'blocked' ? (capture.upstream_status === 429 ? 'partial' : 'blocked') :
          assessment.state === 'outcome_unknown' ? 'outcome_unknown' : 'partial';
        taskState = assessment.state === 'blocked' ? 'blocked' : 'partial';
        reason = assessment.reason; break;
      }
      const dir = resolve('outputs', 'known-source', requestId);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${capture.run_id}.json`);
      if (!existsSync(file)) writeFileSync(file, JSON.stringify(capture, null, 2) + '\n', { flag: 'wx' });
      try {
        const observations = samObservations(capture);
        await rpc('record_procurement_observations', { p_run_id: capture.run_id, p_rows: observations });
      } catch (error) {
        jobState = 'partial'; taskState = 'partial';
        reason = `Page ${page} capture needs normalization review: ${error.message}`;
        break;
      }
      runIds.push(capture.run_id); pages++; results += assessment.count;
      if (assessment.state === 'complete') {
        jobState = 'succeeded'; taskState = results ? 'reviewed_with_results' : 'reviewed_no_results';
        reason = null; break;
      }
    }
    const checkpoint = { next_page: pages, run_ids: runIds };
    const evidence = { runner: 'sam-search', parser_version: capability.parser_version,
      run_ids: runIds, pages_confirmed: pages, terminal_confirmed: jobState === 'succeeded', reason };
    const finished = await rpc('finish_procurement_known_job', {
      p_job_id: job.id, p_lease_token: job.lease_token, p_job_state: jobState,
      p_task_state: taskState, p_checkpoint: checkpoint, p_evidence: evidence,
      p_pages: pages, p_results: results, p_last_error: reason,
    });
    if (!finished) throw new Error(`Job ${job.id} lease expired; inspect stored runs and retry`);
    output.push({ task_id: task.id, kind: task.kind, route_geography_id: task.route_geography_id,
      state: taskState, pages, results, run_ids: runIds, reason });
  }
  console.log(JSON.stringify({ request_id: requestId, routes: output,
    next: 'Review new/changed source observations, stage explicit captures, then use procurement-workflow review/test/apply/readback.' }, null, 2));
}
