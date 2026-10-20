import { adminSourcePlan } from './county-triggers.mjs';
import { inspectAutomaticListing } from './automatic-public-method.mjs';
import { auditPhase } from './workflow-audit.mjs';
import { rows as scopedRows } from './hosted-store.mjs';
import { savedContentChange } from './source-change.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { adapterContract, registeredEntryContract, samFilters, inspectSamCapture, samObservations, geographyJobs } from './known-source-execution.mjs';
import { inspectPublicJsonListing } from './public-json-listing.mjs';
import { inspectPublicHtmlTable } from './public-html-table.mjs';
import { inspectPublicBonfireProjects, inspectPublicBonfireContracts } from './public-bonfire-projects.mjs';
import { fetchPublicCheck, semanticPublicHash, semanticSources } from './public-source-check.mjs';
import { inspectArdotEntry, fetchArdotPage } from './ardot-table.mjs';
import { collectKnownApi } from './known-access-run.mjs';
import {requestPublicCapture} from './public-capture-reuse.mjs';
import {fetchLinkedDocument} from './public-linked-document.mjs';
import {artifactStore} from './hosted-store.mjs';


// Shared adapter orchestration. CLI credentials and output are injected, never read here.
export async function executeKnownSources({db, project, serverKey, command, requestId, selectedSourceCode, maxJobs=Infinity, cancelled=async()=>false, retryPartial=true, fetcher=fetch,artifacts}) {
if (!['plan','run'].includes(command)) throw new Error('Invalid collection command');
if (['sam','sam-awards'].includes(selectedSourceCode)) throw new Error('Use separate statewide SAM');
function rows(table, columns = '*', filter = null) {
  return scopedRows(db, table, filter ?? (query => query), columns,
    { order: table === 'procurement_public_captures' ? 'run_id' : 'id' });
}
async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}
const request = (await rows('procurement_search_requests', '*', q => q.eq('id', requestId)))[0];
if (!request) throw new Error('Search request does not exist');
const automaticCounty=['county_scope','state_research'].includes(request.workflow_control?.admin_policy);
const targets = await rows('procurement_request_targets', '*', q => q.eq('search_request_id', requestId));
if (!targets.length || targets.some(t => !t.geography_id || t.state === 'needs_review'))
  throw new Error('Request needs confirmed, resolved geography targets');
const [geographies, capabilities, sources] = await Promise.all([
  rows('procurement_geographies'), rows('procurement_source_capabilities'), rows('procurement_sources'),
]);
const plan = adminSourcePlan(request, targets, geographies, capabilities, sources);
if (command === 'plan') {
  if(request.workflow_control?.admin_policy&&!plan.tasks.length) {
    return {known:0,entry_checks:0,gaps:0,blocked:0,reused_methods:plan.known,
      next:'Registered methods reused; no collection requested'};
  }
  const persisted = await rpc('create_procurement_known_plan', { p_request_id: requestId, p_tasks: plan.tasks });
  const reconciled = await rpc('reconcile_procurement_known_gaps', { p_request_id: requestId, p_tasks: plan.tasks });
  const sourceReconciled = await rpc('reconcile_procurement_source_gaps', { p_request_id: requestId, p_tasks: plan.tasks });
  return { ...persisted, ...reconciled, known: plan.known, entry_checks: plan.entry_checks,
    gaps: plan.gaps, source_gaps: plan.source_gaps, source_gap_reconciliation: sourceReconciled, blocked: plan.blocked,
    next: plan.known || plan.entry_checks ? `node scripts/known-source-run.mjs run ${requestId}` :
      'Verify missing source methods before collection' };
} else {
  const jobs = await rows('procurement_jobs', '*', q => q.eq('search_request_id', requestId).eq('kind', 'collect').not('task_id', 'is', null));
  const tasks = await rows('procurement_coverage_tasks', '*', q => q.in('target_id', targets.map(t => t.id)));
  if (selectedSourceCode && !sources.some(s => s.code === selectedSourceCode))
    throw new Error(`Source code ${selectedSourceCode} is not registered`);
  const output = []; let processed = 0;
  for (const candidate of geographyJobs(jobs, tasks, sources, capabilities, selectedSourceCode)) {
    if (processed >= maxJobs || await cancelled()) break;
    if(!retryPartial && candidate.state==='partial')continue;
    const pendingCapability=capabilities.find(c=>c.id===candidate.capability_id);
    if(pendingCapability?.method_spec?.runner_id==='authenticated-browser') {
      // Browser work is an explicit handoff; do not consume retry leases by polling.
      output.push({job_id:candidate.id,task_id:candidate.task_id,state:'awaiting_browser_capture',
        next:'Use source-access next, then source-access capture with audited signed-in pages. Entry checks are not lead coverage.'});
      continue;
    }
    const job = await rpc('claim_procurement_known_job', { p_job_id: candidate.id });
    if (!job) continue;
    processed++;
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
      if (!contract || task.kind === 'source_entry' && task.evidence?.entry_url && task.evidence.entry_url !== source.url)
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
    if (contract.runner_id === 'api-bounded') {
      const result=await collectKnownApi(db,{job,task,capability,source,project,serverAuthorization:serverKey});
      const finished=await rpc('finish_procurement_known_job',{
        p_job_id:job.id,p_lease_token:job.lease_token,p_job_state:result.job_state,p_task_state:result.task_state,
        p_checkpoint:{next_page:result.pages,run_ids:result.run_ids},p_evidence:{runner:'api-bounded',
          parser_version:capability.parser_version,run_ids:result.run_ids,pages_confirmed:result.pages,
          terminal_confirmed:result.job_state==='succeeded',interpretation:'pending',reason:result.reason},
        p_pages:result.pages,p_results:0,p_last_error:result.reason});
      if(!finished)throw new Error('API job lease expired; inspect stored capture before retry');
      output.push({task_id:task.id,kind:task.kind,state:result.task_state,pages:result.pages,run_ids:result.run_ids,reason:result.reason});
      continue;
    }
    if (contract.runner_id === 'public-fetch') {
      const runIds = []; let pages = 0, jobState = 'succeeded', taskState = 'needs_interpretation';
      let reason = null;
      for (const [page, url] of contract.urls.entries()) {
        const attempts = await rows('procurement_runs', '*', q => q.eq('job_id', job.id).eq('page_index', page));
        let run = attempts.find(r => r.detail?.state === 'content_saved') ??
          attempts.find(r => r.page_attempt === job.attempts) ??
          attempts.find(r => r.detail?.state === 'request_pending');
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
          // Reuse only hash-verified bytes from this request and exact source/URL.
          // Each route still receives its own audited run and interpretation.
          const reusable=automaticCounty&&!contract.linked_document?await requestPublicCapture(db,{requestId,sourceId:source.id,url,maxBytes:contract.max_bytes,allowedHosts:contract.allowed_hosts,
            allowJson:['bonfire-projects-v1','bonfire-contracts-v1','supporting-document-v1'].includes(contract.response_format)}):null;
          const capture = await auditPhase(reusable?'compare':'fetch_page',()=>reusable??(contract.linked_document
            ?fetchLinkedDocument(contract,url,{fetcher,artifacts:artifacts??artifactStore(db)})
            :fetchPublicCheck(contract, url,fetcher,{researchEntry:automaticCounty&&task.kind==='source_entry'?source.url:undefined})),
            {source_id:source.id,task_id:task.id,reason:reusable?'request_capture_reuse':'deterministic'});
          if (capture.state === 'captured') {
            let listing = null, listingError = null;
            if (contract.response_format) {
              try { listing = contract.response_format === 'county-listing-v1' ? inspectAutomaticListing(capture.body, contract) : contract.response_format === 'json-files-v1'
                ? inspectPublicJsonListing(capture.body, contract)
                : contract.response_format === 'html-table-v1'
                  ? inspectPublicHtmlTable(capture.body, contract)
                  : contract.response_format === 'bonfire-projects-v1'
                    ? inspectPublicBonfireProjects(capture.body, contract)
                    : inspectPublicBonfireContracts(capture.body, contract); }
              catch (error) { listingError = error.message; }
            }
            const semanticHash = await auditPhase('compare',async()=>semanticPublicHash(source.code, capture.body),{source_id:source.id,task_id:task.id});
            const changeType = semanticSources.has(source.code)
              ? await savedContentChange(db, 'procurement_runs', q => q.eq('source_id', source.id)
                .eq('status', 'review_required').eq('detail->>final_url', capture.final_url)
                .not('detail->>semantic_sha256', 'is', null).neq('detail->>semantic_sha256', ''), 'detail->>semantic_sha256', semanticHash)
              : await savedContentChange(db, 'procurement_public_captures', q => q.eq('source_id', source.id)
                .eq('final_url', capture.final_url), 'content_sha256', semanticHash, 'run_id');
            const stored = await db.from('procurement_public_captures').insert({
              run_id: run.id, source_id: source.id, requested_url: url,
              final_url: capture.final_url, content_type: capture.content_type,
              content_sha256: capture.content_sha256, content_base64: capture.body.toString('base64'),
              ...(capture.reused_run_id?{retrieved_at:capture.retrieved_at}:{}),
            });
            if (stored.error) throw new Error(`Public capture ${run.id} storage uncertain; inspect before retrying`);
            const detail = { collector: task.kind === 'source_entry' ? 'registry-entry' : 'public-fetch',
              scope: task.kind === 'source_entry' ? 'entry_only' : 'verified_method',
              state: 'content_saved', requested_url: url,
              final_url: capture.final_url, redirects: capture.redirects, upstream_status: 200,
              content_type: capture.content_type, content_sha256: capture.content_sha256,
              semantic_sha256: semanticHash,
              bytes: capture.bytes,
              ...(capture.linked_index?{linked_index:capture.linked_index}:{}),
              ...(capture.reused_run_id?{reused_run_id:capture.reused_run_id}:{}),
              ...(contract.response_format ? { response_format: contract.response_format,
                listing_count: listing?.records.length ?? null,
                listing_terminal: listing?.terminal === true,
                listing_reason: listingError ?? listing?.reason ?? null } : {}),
              change_type: changeType,
              parser_version: contract.parser_version, check_when: contract.check_when,
              query_window: task.query_window, interpretation: 'pending' };
            const updated = await db.from('procurement_runs').update({ status: 'review_required',
              record_count: listing?.records.length ?? 0,
              finished_at: new Date().toISOString(), detail }).eq('id', run.id);
            if (updated.error) throw new Error(`Public run ${run.id} update uncertain; inspect before retrying`);
            run.detail = detail;
          } else {
            const detail = { collector: task.kind === 'source_entry' ? 'registry-entry' : 'public-fetch',
              scope: task.kind === 'source_entry' ? 'entry_only' : 'verified_method',
              state: automaticCounty && capture.state === 'outcome_unknown' ? 'read_failed' : capture.state === 'outcome_unknown' ?
              'request_pending' : 'response_captured', requested_url: url, final_url: capture.final_url,
              ...(automaticCounty && capture.state === 'outcome_unknown' ? {read_only:true,outcome:'no_confirmed_content'} : {}),
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
        if (contract.response_format && run.detail?.listing_terminal !== true) {
          jobState = 'partial'; taskState = 'partial';
          reason = run.detail?.listing_reason ?? 'Saved listing has no confirmed terminal page';
          break;
        }
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
    if (contract.runner_id === 'ardot-table') {
      const runIds = [];
      let pages = 0, reportedTotal = null, jobState = 'partial', taskState = 'partial';
      let reason = 'ARDOT page bound reached before reported total';
      let entry = null;
      for (let page = 0; page < contract.max_pages; page++) {
        const attempts = await rows('procurement_runs', '*', q => q.eq('job_id', job.id).eq('page_index', page));
        let run = attempts.find(r => r.detail?.state === 'content_saved') ??
          attempts.find(r => r.page_attempt === job.attempts) ??
          attempts.find(r => r.detail?.state === 'request_pending');
        if (!run) {
          const inserted = await db.from('procurement_runs').insert({
            source_id: source.id, job_id: job.id, coverage_task_id: task.id,
            page_index: page, page_attempt: job.attempts, started_at: new Date().toISOString(),
            status: 'partial', record_count: 0,
            detail: { collector: 'ardot-table', state: 'request_pending',
              entry_url: contract.entry_url, ajax_url: contract.ajax_url,
              page_index: page, page_size: contract.page_size,
              parser_version: contract.parser_version, query_window: task.query_window },
          }).select('*').single();
          if (inserted.error || !inserted.data)
            throw new Error(`Cannot audit ARDOT page ${page}; no request sent: ${inserted.error?.message ?? 'no row'}`);
          run = inserted.data;
          let capture;
          try {
            if (!entry) {
              const entryCapture = await fetchPublicCheck({ runner_id: 'public-fetch',
                allowed_hosts: contract.allowed_hosts, max_bytes: contract.max_bytes }, contract.entry_url);
              entry = inspectArdotEntry(entryCapture);
            }
            capture = await auditPhase('fetch_page',()=>fetchArdotPage(entry, page, contract.page_size),{source_id:source.id,task_id:task.id});
          } catch (error) {
            capture = { state: 'outcome_unknown', reason: error.message };
          }
          if (capture.state === 'captured') {
            const changeType = await savedContentChange(db, 'procurement_runs', q =>
              q.eq('source_id', source.id).eq('status', 'review_required').eq('page_index', page)
                .not('detail->>content_sha256', 'is', null).neq('detail->>content_sha256', ''),
              'detail->>content_sha256', capture.content_sha256);
            const stored = await db.from('procurement_public_captures').insert({
              run_id: run.id, source_id: source.id, requested_url: contract.ajax_url,
              final_url: contract.ajax_url, content_type: 'application/json',
              content_sha256: capture.content_sha256, content_base64: capture.body.toString('base64'),
            });
            if (stored.error) throw new Error(`ARDOT page ${page} storage uncertain; inspect before retrying`);
            const detail = { collector: 'ardot-table', state: 'content_saved',
              entry_url: contract.entry_url, entry_sha256: entry.entry_sha256,
              ajax_url: contract.ajax_url, page_index: page, page_size: contract.page_size,
              upstream_status: 200, content_sha256: capture.content_sha256,
              change_type: changeType,
              records_total: capture.total, rows: capture.rows, terminal: capture.terminal,
              parser_version: contract.parser_version, query_window: task.query_window,
              interpretation: 'pending' };
            const updated = await db.from('procurement_runs').update({ status: 'review_required',
              finished_at: new Date().toISOString(), record_count: capture.rows, detail }).eq('id', run.id);
            if (updated.error) throw new Error(`ARDOT page ${page} run update uncertain; inspect before retrying`);
            run.detail = detail;
          } else {
            const detail = { collector: 'ardot-table', state: capture.state === 'outcome_unknown'
              ? 'request_pending' : 'response_captured', reason: capture.reason,
              entry_url: contract.entry_url, ajax_url: contract.ajax_url,
              page_index: page, parser_version: contract.parser_version };
            const updated = await db.from('procurement_runs').update({
              status: capture.state === 'blocked' ? 'blocked' : 'partial',
              finished_at: new Date().toISOString(), detail }).eq('id', run.id);
            if (updated.error) throw new Error(`ARDOT page ${page} failed-run update uncertain`);
            run.detail = detail;
          }
        }
        if (run.detail?.state !== 'content_saved') {
          jobState = run.detail?.state === 'request_pending' ? 'outcome_unknown' :
            run.status === 'blocked' ? 'blocked' : 'partial';
          taskState = jobState === 'blocked' ? 'blocked' : 'partial';
          reason = run.detail?.reason ?? `ARDOT page ${page} outcome uncertain`;
          break;
        }
        if (reportedTotal !== null && reportedTotal !== run.detail.records_total) {
          reason = 'ARDOT reported total changed during pagination'; break;
        }
        reportedTotal = run.detail.records_total;
        if (reportedTotal > contract.max_records) {
          reason = 'ARDOT reported total exceeds verified row bound'; break;
        }
        runIds.push(run.id); pages++;
        if (run.detail.terminal) {
          jobState = 'succeeded'; taskState = 'needs_interpretation'; reason = null; break;
        }
      }
      const finished = await rpc('finish_procurement_known_job', {
        p_job_id: job.id, p_lease_token: job.lease_token, p_job_state: jobState,
        p_task_state: taskState, p_checkpoint: { next_page: pages, run_ids: runIds },
        p_evidence: { runner: 'ardot-table', parser_version: contract.parser_version,
          entry_url: contract.entry_url, ajax_url: contract.ajax_url,
          pages_confirmed: pages, reported_total: reportedTotal, run_ids: runIds,
          terminal_confirmed: jobState === 'succeeded', interpretation: 'pending', reason },
        p_pages: pages, p_results: 0, p_last_error: reason,
      });
      if (!finished) throw new Error(`ARDOT job ${job.id} lease expired; inspect saved pages`);
      output.push({ task_id: task.id, kind: task.kind, route_geography_id: task.route_geography_id,
        state: taskState, pages, reported_total: reportedTotal, results: 0, run_ids: runIds, reason });
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
  return { request_id: requestId, routes: output,
    next: 'Review new/changed source observations, stage explicit captures, then use procurement-workflow review/test/apply/readback.' };
}

}
