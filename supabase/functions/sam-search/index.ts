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
  const started = new Date().toISOString();
  // Write an audit record BEFORE sending the external request. A timeout remains visible.
  const { data: run, error: runError } = await db.from('procurement_runs').insert({
    source_id: source.id, started_at: started, status: 'partial', record_count: 0,
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
