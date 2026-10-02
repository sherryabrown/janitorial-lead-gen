import { createClient } from 'npm:@supabase/supabase-js@2';

// Private server-to-server search/capture only. No frontend or lead mutations.
const endpoints = {
  opportunities: { url: 'https://api.sam.gov/opportunities/v2/search', source: 'sam',
    allowed: ['postedFrom', 'postedTo', 'state', 'ncode', 'title', 'ptype', 'solnum', 'noticeid', 'limit', 'offset'] },
  awards: { url: 'https://api.sam.gov/contract-awards/v1/search', source: 'sam-awards',
    allowed: ['dateSigned', 'lastModifiedDate', 'placeOfPerformStateCode', 'naicsCode', 'q', 'piid', 'limit', 'offset'] },
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function secretKeys(): string[] {
  try { return Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))
    .filter((v): v is string => typeof v === 'string' && v.startsWith('sb_secret_')); }
  catch { return []; }
}

function sanitize(value: unknown, key: string): unknown {
  if (typeof value === 'string') return value.split(key).join('[REDACTED]')
    .split(encodeURIComponent(key)).join('[REDACTED]')
    .replace(/([?&](?:api_key|token)=)[^&\s"<>]+/gi, '$1[REDACTED]');
  if (Array.isArray(value)) return value.map(v => sanitize(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([k, v]) => [k, /^(api_key|authorization|access_token)$/i.test(k) ? '[REDACTED]' : sanitize(v, key)]));
  return value;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
  const keys = secretKeys();
  if (!keys.length) return reply({ error: 'Server secret-key configuration unavailable' }, 503);
  const presented = req.headers.get('apikey');
  if (!presented || !keys.includes(presented)) return reply({ error: 'Server authorization required' }, 401);
  const samKey = Deno.env.get('SAM_GOV_API_KEY')?.trim();
  if (!samKey) return reply({ error: 'SAM_GOV_API_KEY is missing in Supabase' }, 503);
  let body;
  try { body = await req.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  const kind = body?.kind as keyof typeof endpoints;
  if (!Object.hasOwn(endpoints, kind)) return reply({ error: 'Unsupported search kind' }, 400);
  const config = endpoints[kind];
  if (!config) return reply({ error: 'kind must be opportunities or awards; forecasts use separate agency sources' }, 400);
  const filters = body.filters;
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return reply({ error: 'filters object required' }, 400);
  const url = new URL(config.url);
  for (const [key, val] of Object.entries(filters)) {
    if (!config.allowed.includes(key) || !['string', 'number'].includes(typeof val) || String(val).length > 300)
      return reply({ error: 'Unsupported filter' }, 400);
    url.searchParams.set(key, String(val));
  }
  const limit = Number(filters.limit ?? 100);
  const offset = Number(filters.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > (kind === 'awards' ? 100 : 1000) ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000)
    return reply({ error: 'Invalid pagination' }, 400);
  if (kind === 'opportunities' && (!filters.postedFrom || !filters.postedTo))
    return reply({ error: 'postedFrom and postedTo required' }, 400);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const safeUrl = url.toString();
  url.searchParams.set('api_key', samKey);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, keys[0]);
  const { data: source, error: sourceError } = await db.from('procurement_sources').select('id').eq('code', config.source).single();
  if (sourceError || !source) return reply({ error: 'Source registry lookup failed; no SAM request sent' }, 500);
  const execution = body.execution;
  let context: { job_id: string; coverage_task_id: string; page_index: number; page_attempt: number } | null = null;
  if (execution !== undefined) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!execution || !uuid.test(execution.job_id) || !uuid.test(execution.task_id) ||
        !Number.isInteger(execution.page_index) || execution.page_index !== offset)
      return reply({ error: 'Invalid route execution context' }, 400);
    const { data: job, error: jobError } = await db.from('procurement_jobs')
      .select('id,state,lease_until,task_id,capability_id,attempts').eq('id', execution.job_id).single();
    const { data: task, error: taskError } = await db.from('procurement_coverage_tasks')
      .select('id,capability_id,source_id,kind').eq('id', execution.task_id).single();
    if (jobError || taskError || !job || !task || job.state !== 'running' ||
        !job.lease_until || Date.parse(job.lease_until) <= Date.now() ||
        job.task_id !== task.id || task.capability_id !== job.capability_id ||
        task.source_id !== source.id || task.kind !== (kind === 'awards' ? 'award' : 'opportunity'))
      return reply({ error: 'Route job is not currently leased for this source' }, 409);
    const { data: existing, error: existingError } = await db.from('procurement_runs')
      .select('id,detail').eq('job_id', job.id).eq('page_index', offset).eq('page_attempt', job.attempts).maybeSingle();
    if (existingError) return reply({ error: 'Cannot check route page; no SAM request sent' }, 500);
    if (existing) return reply({ error: 'Route page already attempted; inspect its saved audit run before resuming', run_id: existing.id,
      state: existing.detail?.state }, 409);
    context = { job_id: job.id, coverage_task_id: task.id, page_index: offset, page_attempt: job.attempts };
  }
  const started = new Date().toISOString();
  // Write an audit record BEFORE sending the external request. A timeout remains visible.
  const { data: run, error: runError } = await db.from('procurement_runs').insert({
    source_id: source.id, started_at: started, status: 'partial', record_count: 0, ...context,
    detail: { collector: 'sam-search', kind, query_url: safeUrl, filters, state: 'request_pending' },
  }).select('id').single();
  if (runError || !run) return reply({ error: 'Run capture failed; no SAM request sent' }, 500);
  let upstreamStatus: number | null = null;
  let response: unknown;
  let status = 'error';
  let count = 0;
  let complete = false;
  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(65000) });
    upstreamStatus = upstream.status;
    const text = await upstream.text();
    try { response = sanitize(JSON.parse(text), samKey); }
    catch { response = { message: sanitize(text.slice(0, 8000), samKey), non_json: true }; }
    const data = response as Record<string, unknown>;
    const emptyAward = kind === 'awards' && data.message === 'No Data found for requested search criteria' &&
      Number((data.awardResponse as Record<string, unknown>)?.totalRecords) === 0;
    const rows = kind === 'opportunities' ? data.opportunitiesData : (emptyAward ? [] : data.awardSummary);
    const total = Number(data.totalRecords ?? (emptyAward ? 0 : NaN));
    count = Array.isArray(rows) ? rows.length : 0;
    complete = upstream.ok && Array.isArray(rows) && (Number.isFinite(total) ? offset * limit + count >= total : count < limit);
    status = upstream.ok ? (complete ? 'success' : 'partial') : ([401,403,429].includes(upstream.status) ? 'blocked' : 'error');
  } catch {
    response = { message: 'SAM request timed out or failed at the network layer; no automatic retry was sent' };
  }
  const detail = { collector: 'sam-search', kind, query_url: safeUrl, filters, upstream_status: upstreamStatus,
    complete_for_query: complete, state: 'response_captured', response };
  const { error: captureError } = await db.from('procurement_runs').update({
    finished_at: new Date().toISOString(), status, record_count: count, detail,
  }).eq('id', run.id);
  return reply({ run_id: run.id, captured: !captureError, status, record_count: count, ...detail }, captureError ? 500 : 200);
});
