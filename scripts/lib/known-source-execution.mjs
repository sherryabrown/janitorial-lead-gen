import { createHash } from 'node:crypto';
import { awardIdentity, actionIdentity, responseSummary, stable } from './sam-normalize.mjs';

export const categories = ['forecast', 'opportunity', 'award'];
const samCodes = { opportunity: 'sam', award: 'sam-awards' };
const fail = message => { throw new Error(message); };
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const samDate = value => `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
const normalize = value => String(value ?? '').toLowerCase().replace(/\b(county|city|town)\b/g, '').replace(/[^a-z0-9]/g, '');
export const covers = (source, geography) => source.source_coverage_areas?.some(area =>
  area.state_code === 'AR' && (geography.kind === 'municipality' && area.area_type === 'city' &&
    normalize(area.city_name) === normalize(geography.name) ||
  geography.kind === 'county' && area.area_type === 'county' &&
    normalize(area.county_name) === normalize(geography.name) ||
  geography.kind === 'state' && area.area_type === 'state')) ||
  geography.kind === 'state' && source.source_coverage_areas?.some(area =>
    area.area_type === 'country' && area.country_code === 'US');

export function adapterContract(capability, source, now = new Date()) {
  const spec = capability.method_spec;
  if (capability.availability !== 'active' || !capability.parser_version ||
      !capability.verification_evidence || !Object.keys(capability.verification_evidence).length ||
      !capability.verified_at || !capability.verified_until ||
      !Number.isFinite(Date.parse(capability.verified_at)) || !Number.isFinite(Date.parse(capability.verified_until)) ||
      Date.parse(capability.verified_at) > now.getTime() || Date.parse(capability.verified_until) <= now.getTime())
    fail('Source method verification is missing or expired');
  if (spec?.version !== 1) fail('Verified source needs a versioned adapter');
  if (capability.method === 'browser' && spec.runner_id === 'ardot-table') {
    if (source?.code !== 'ardot' || capability.kind !== 'opportunity' ||
        spec.check_when !== 'each_request' ||
        spec.entry_url !== 'https://ardot.gov/divisions/equipment-procurement/commodities-and-services/bids-by-fiscal-year/' ||
        spec.ajax_url !== 'https://ardot.gov/wp-admin/admin-ajax.php?action=get_wdtable&table_id=53' ||
        spec.page_size !== 100 || spec.max_pages !== 30 || spec.max_records !== 3000 ||
        spec.max_bytes !== 2_000_000 ||
        !Array.isArray(spec.allowed_hosts) || spec.allowed_hosts.join(',') !== 'ardot.gov')
      fail('ARDOT table needs reviewed pagination and URL bounds');
    return { version: 1, runner_id: 'ardot-table', kind: 'opportunity',
      parser_version: capability.parser_version, check_when: 'each_request',
      entry_url: spec.entry_url, ajax_url: spec.ajax_url, page_size: 100,
      max_pages: 30, max_records: 3000, max_bytes: 2_000_000,
      allowed_hosts: spec.allowed_hosts };
  }
  if (['browser', 'document'].includes(capability.method) && spec.runner_id === 'public-fetch') {
    if (spec.check_when !== 'each_request' || !Array.isArray(spec.urls) ||
        !spec.urls.length || spec.urls.length > 20 || !Array.isArray(spec.allowed_hosts) ||
        !spec.allowed_hosts.length || spec.allowed_hosts.length > 20 ||
        !Number.isInteger(spec.max_bytes) || spec.max_bytes < 1 || spec.max_bytes > 2_000_000 ||
        spec.urls.some(url => !safePublicUrl(url, spec.allowed_hosts)) ||
        spec.allowed_hosts.some(host => !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')))
      fail('Public check needs reviewed URLs, hosts, schedule and byte bound');
    return { version: 1, runner_id: 'public-fetch', kind: capability.kind,
      method: capability.method, parser_version: capability.parser_version,
      check_when: 'each_request', urls: spec.urls, allowed_hosts: spec.allowed_hosts,
      max_bytes: spec.max_bytes };
  }
  if (capability.method !== 'api' || spec.runner_id !== 'sam-search' ||
      source?.code !== samCodes[capability.kind])
    fail('Verified source needs a supported adapter');
  const pageSize = spec.page_size ?? 100;
  const maxPages = spec.max_pages ?? 10;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10)
    fail('SAM method has invalid pagination bounds');
  const defaults = spec.query_defaults;
  if (!defaults || Array.isArray(defaults) || typeof defaults !== 'object')
    fail('SAM method needs verified query defaults');
  const serviceKeys = capability.kind === 'opportunity' ? ['ncode', 'title'] : ['naicsCode', 'q'];
  if (!serviceKeys.some(key => typeof defaults[key] === 'string' && defaults[key].trim()))
    fail('SAM method needs a reviewed service filter');
  const allowed = capability.kind === 'opportunity' ? ['ncode', 'title', 'ptype'] : ['naicsCode', 'q'];
  if (Object.entries(defaults).some(([key, value]) =>
    !allowed.includes(key) || typeof value !== 'string' || !value.trim() || value.length > 300))
    fail('SAM method has unsupported query defaults');
  return { version: 1, runner_id: 'sam-search', kind: capability.kind, parser_version: capability.parser_version,
    page_size: pageSize, max_pages: maxPages, query_defaults: defaults };
}

export function safePublicUrl(value, allowedHosts) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!url.port || url.port === '443') && allowedHosts.includes(url.hostname.toLowerCase()) &&
      !/(?:^|[?&])(token|api_key|key|password|session|code)=/i.test(url.search) &&
      !url.hash && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
  } catch { return false; }
}

export function registeredEntryContract(source) {
  try {
    if (!source?.url || ['sam','sam-awards','usaspending','arbuy-janitorial','dhs'].includes(source.code) ||
        /\/api\//i.test(new URL(source.url).pathname) ||
        /\.pdf$/i.test(new URL(source.url).pathname) ||
        new URL(source.url).searchParams.has('docId')) return null;
    const host = new URL(source.url).hostname.toLowerCase();
    if (!safePublicUrl(source.url, [host])) return null;
    const allowedHosts = ['state-intents','state-other'].includes(source.code) &&
      host === 'www.arkansas.gov' && /^\/tss\/procurement\//.test(new URL(source.url).pathname)
      ? [host,'www.ark.org'] : [host];
    return { version: 1, runner_id: 'public-fetch', method: 'registry-entry',
      parser_version: 'registry-entry-v1', check_when: 'each_request',
      urls: [source.url], allowed_hosts: allowedHosts, max_bytes: 2_000_000 };
  } catch { return null; }
}

export function samFilters(capability, source, window, pageIndex, now = new Date()) {
  const contract = adapterContract(capability, source, now);
  if (!window || !validDate(window.from) || !validDate(window.to) ||
      window.from > window.to || !Number.isInteger(pageIndex) ||
      pageIndex < 0 || pageIndex >= contract.max_pages)
    fail('SAM request needs a valid bounded date window and page');
  const filters = { ...contract.query_defaults };
  if (capability.kind === 'opportunity') Object.assign(filters, {
    postedFrom: samDate(window.from), postedTo: samDate(window.to), state: 'AR',
  });
  else Object.assign(filters, {
    lastModifiedDate: `[${samDate(window.from)},${samDate(window.to)}]`,
    placeOfPerformStateCode: 'AR',
  });
  return { ...filters, limit: contract.page_size, offset: pageIndex };
}

export function buildKnownSourcePlan(request, targets, geographies, capabilities, sources, now = new Date()) {
  const geographyById = new Map(geographies.map(g => [g.id, g]));
  const sourceById = new Map(sources.map(s => [s.id, s]));
  const tasks = [];
  const entrySources = new Set();
  for (const target of [...targets].sort((a, b) =>
    Number(a.checkpoint?.route_order ?? 0) - Number(b.checkpoint?.route_order ?? 0))) {
    const geography = geographyById.get(target.geography_id);
    if (!geography || !geography.source_active) fail(`Inactive route geography: ${target.geography_id}`);
    for (const [categoryIndex, kind] of categories.entries()) {
      const attached = capabilities.filter(c => c.route_geography_id === geography.id && c.kind === kind);
      const verified = attached.filter(c => c.availability === 'active' &&
        c.verified_at && c.verified_until &&
        Date.parse(c.verified_at) <= now.getTime() && Date.parse(c.verified_until) > now.getTime() &&
        c.verification_evidence && Object.keys(c.verification_evidence).length &&
        c.parser_version && sourceById.has(c.source_id));
      const priority = Number(target.checkpoint?.route_order ?? 0) * 10 + categoryIndex;
      const window = request.search_windows?.[kind] ?? {};
      const common = { target_id: target.id, route_geography_id: geography.id,
        agency_scope: geography.kind, kind, priority, query_window: window };
      let runnable = 0;
      for (const capability of verified) {
        const source = sourceById.get(capability.source_id);
        let reason = null;
        try {
          const contract = adapterContract(capability, source, now);
          if (contract.runner_id === 'sam-search') samFilters(capability, source, window, 0, now);
        } catch (error) { reason = error.message; }
        tasks.push({ ...common, task_key: `${kind}:${capability.id}`,
          source_id: source.id, capability_id: capability.id,
          state: reason ? 'blocked' : 'unchecked',
          reason: reason ?? `Verified ${source.name} method ready for deterministic collection` });
        if (!reason) runnable++;
      }
      // Keep each registered source visible even when a different source covers this category.
      for (const source of sources.filter(s => covers(s, geography) || attached.some(c => c.source_id === s.id))) {
        if (verified.some(c => c.source_id === source.id) || unsupportedCategory(source, kind, geography.id, now)) continue;
        const previous = attached.filter(c => c.source_id === source.id);
        tasks.push({ ...common, task_key: `${kind}:source:${source.id}:missing`, source_id: source.id,
          capability_id: null, state: 'method_missing',
          evidence: { scope: 'source_category', registered_source_ids: [source.id],
            prior_capability_ids: previous.map(c => c.id),
            method_status: previous.length ? 'unverified_or_expired' : 'not_verified' },
          reason: previous.length ? `Reverify expired or unavailable ${source.name} ${kind} method`
            : `Verify whether ${source.name} supports ${kind}, then save its check method` });
      }
      if (!runnable) {
        const registered = sources.filter(s => covers(s, geography)).map(s => s.id).sort();
        tasks.push({ ...common, task_key: `${kind}:missing`,
          source_id: null, capability_id: null,
          state: registered.length || attached.length ? 'method_missing' : 'source_missing',
          evidence: { registered_source_ids: registered },
          reason: registered.length || attached.length ? 'Registered source needs a verified category check method'
            : 'No source registered for this route and category' });
      }
    }
    for (const source of sources.filter(s => covers(s, geography))) {
      if (entrySources.has(source.id) || !registeredEntryContract(source) ||
          capabilities.some(c => c.source_id === source.id && c.route_geography_id === geography.id &&
            c.availability === 'active' && ['public-fetch','ardot-table'].includes(c.method_spec?.runner_id) &&
            c.verified_until && Date.parse(c.verified_until) > now.getTime())) continue;
      entrySources.add(source.id);
      tasks.push({ target_id: target.id, route_geography_id: geography.id,
        agency_scope: geography.kind, kind: 'source_entry',
        priority: Number(target.checkpoint?.route_order ?? 0) * 10 + 9,
        task_key: `entry:${source.id}`, source_id: source.id, capability_id: null,
        state: 'unchecked', query_window: request.search_windows ?? {},
        evidence: { entry_url: source.url, scope: 'entry_only' },
        reason: 'Registered source entry point; category method needs separate verification' });
    }
  }
  return { request_id: request.id, tasks,
    known: tasks.filter(t => t.state === 'unchecked' && t.kind !== 'source_entry').length,
    entry_checks: tasks.filter(t => t.kind === 'source_entry').length,
    gaps: tasks.filter(t => ['source_missing', 'method_missing'].includes(t.state) && t.evidence?.scope !== 'source_category').length,
    source_gaps: tasks.filter(t => t.evidence?.scope === 'source_category').length,
    blocked: tasks.filter(t => t.state === 'blocked').length };
}

// Unsupported categories require an explicit, dated, route-specific evidence record.
// Old unchecked/partial research notes never establish non-applicability.
export function unsupportedCategory(source, kind, geographyId, now = new Date()) {
  return (source.config?.known_source_review?.category_assessments ?? []).find(a =>
    a.kind === kind && a.route_geography_id === geographyId && a.status === 'unsupported' &&
    typeof a.reason === 'string' && a.reason.trim() && a.evidence && Object.keys(a.evidence).length &&
    Number.isFinite(Date.parse(a.checked_at)) && Date.parse(a.checked_at) <= now.getTime() &&
    Number.isFinite(Date.parse(a.valid_until)) && Date.parse(a.valid_until) > now.getTime());
}

export function inspectSamCapture(capture, kind, limit, pageIndex) {
  if (!capture?.run_id || capture.captured !== true)
    return { state: 'outcome_unknown', reason: 'SAM capture was not confirmed', count: 0 };
  if (capture.upstream_status === 401 || capture.upstream_status === 403 ||
      capture.upstream_status === 429)
    return { state: 'blocked', reason: `SAM returned ${capture.upstream_status}`, count: 0 };
  if (capture.upstream_status !== 200)
    return { state: 'partial', reason: `SAM returned ${capture.upstream_status ?? 'no response'}`, count: 0 };
  const summary = responseSummary(kind, capture.response, limit, pageIndex);
  if (!summary.recognized)
    return { state: 'partial', reason: 'Unrecognized SAM response envelope', count: 0 };
  return { state: summary.complete ? 'complete' : 'next_page', reason: null,
    count: summary.count, complete: summary.complete };
}

export function samObservations(capture) {
  const emptyAwards = capture.kind === 'awards' &&
    capture.response?.message === 'No Data found for requested search criteria' &&
    Number(capture.response?.awardResponse?.totalRecords) === 0;
  const rows = emptyAwards ? [] : capture.kind === 'awards' ? capture.response?.awardSummary :
    capture.response?.opportunitiesData;
  if (!Array.isArray(rows)) fail('Cannot normalize unrecognized SAM response');
  return rows.map(row => ({
    external_id: capture.kind === 'awards' ? actionIdentity(row) : row.noticeId,
    record_group: capture.kind === 'awards' ? awardIdentity(row) : row.noticeId,
    payload_hash: digest(row),
  })).map(item => {
    if (!item.external_id || !item.record_group) fail('SAM record identity missing');
    return item;
  });
}

export function routedCapture(identity, observations, currentRow, priorHashes = new Set()) {
  if (!observations?.length || priorHashes.has(digest(currentRow))) return null;
  const hashes = observations.map(o => o.payload_hash).sort();
  return { external_id: `${identity}@${digest(hashes).slice(0, 24)}`,
    metadata: { routed_capture: { record_identity: identity, observation_hashes: hashes,
      change_types: [...new Set(observations.map(o => o.change_type))].sort(),
      first_run_ids: [...new Set(observations.map(o => o.first_run_id))].sort() } } };
}
