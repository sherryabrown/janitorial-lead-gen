import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { stableId } from './research-persistence.mjs';

const methods = {
  'ariba': { kind: 'opportunity', title: 'Bid Opportunities', heading: 'Current Solicitations',
    scope: 'Office of State Procurement current solicitations on this page only; other units and linked Ariba details are not covered' },
  'state-contracts': { kind: 'award', title: 'State Contracts', heading: 'State Contracts',
    scope: 'Published state contract reference list only; contract execution and award-action details need separate review' },
};

export function verifiedPublicMethod(source, geography, run, task, capture) {
  const method = methods[source?.code];
  if (!method || geography?.id !== '05' || geography.kind !== 'state' ||
      geography.state_code !== 'AR' || geography.source_active !== true ||
      !source.source_coverage_areas?.some(area => area.area_type === 'state' && area.state_code === 'AR') ||
      task?.kind !== 'source_entry' || task.source_id !== source.id ||
      run?.coverage_task_id !== task.id || run.source_id !== source.id ||
      run.status !== 'review_required' || run.detail?.state !== 'content_saved' ||
      run.detail.scope !== 'entry_only' || capture?.run_id !== run.id || capture.source_id !== source.id ||
      capture.requested_url !== source.url || capture.final_url !== source.url ||
      !capture.content_type?.toLowerCase().startsWith('text/html'))
    throw new Error('Matching audited Arkansas public entry capture is required');
  const body = Buffer.from(capture.content_base64, 'base64');
  if (!body.length || body.length > 2_000_000 ||
      createHash('sha256').update(body).digest('hex') !== capture.content_sha256 ||
      run.detail.content_sha256 !== capture.content_sha256)
    throw new Error('Public page bytes do not match the saved audit');
  const document = new JSDOM(body.toString('utf8'), { url: source.url }).window.document;
  const heading = document.querySelector('main')?.textContent ?? document.body?.textContent ?? '';
  const rowCount = document.querySelectorAll('table tbody tr').length;
  if (!document.title.includes(method.title) || !heading.includes(method.heading) || rowCount < 1)
    throw new Error('Current category listing was not found in the captured page');
  const verifiedAt = new Date(capture.retrieved_at);
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('Capture retrieval time is missing');
  const until = new Date(verifiedAt);
  until.setUTCDate(until.getUTCDate() + 30);
  if (until.getTime() <= Date.now()) throw new Error('Public method verification is stale');
  const hostname = new URL(source.url).hostname.toLowerCase();
  return {
    id: stableId(['procurement-capability', source.id, method.kind, 'browser', source.url]),
    source_id: source.id, route_geography_id: '05', kind: method.kind, method: 'browser',
    endpoint_url: source.url, official_entry_url: source.url,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { run_id: run.id, content_sha256: capture.content_sha256,
      table_rows_visible: rowCount, page_title: document.title,
      coverage_limit: method.scope, interpretation: 'pending' },
    parser_version: 'public-capture-v1',
    method_spec: { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
      urls: [source.url], allowed_hosts: [hostname], max_bytes: 2_000_000 },
    next_action: 'Interpret the saved listing and linked details before staging candidates',
  };
}
