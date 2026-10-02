import { stableId } from './research-persistence.mjs';

const methods = {
  opportunity: { code: 'sam', runKind: 'opportunities',
    endpoint: 'https://api.sam.gov/opportunities/v2/search',
    entry: 'https://open.gsa.gov/api/get-opportunities-public-api/',
    serviceKey: 'ncode', stateKey: 'state', dateKeys: ['postedFrom', 'postedTo'] },
  award: { code: 'sam-awards', runKind: 'awards',
    endpoint: 'https://api.sam.gov/contract-awards/v1/search',
    entry: 'https://open.gsa.gov/api/contract-awards/',
    serviceKey: 'naicsCode', stateKey: 'placeOfPerformStateCode',
    dateKeys: ['lastModifiedDate'] },
};

export function verifiedSamMethod(kind, run, source, geography) {
  const method = methods[kind];
  if (!method || source?.code !== method.code || run?.source_id !== source.id ||
      geography?.id !== '05' || geography.kind !== 'state' || geography.state_code !== 'AR' ||
      geography.source_active !== true)
    throw new Error('SAM method requires its registered source and active Arkansas state route');
  const detail = run.detail;
  const filters = detail?.filters;
  if (run.status !== 'success' || detail?.kind !== method.runKind ||
      detail.state !== 'response_captured' || detail.upstream_status !== 200 ||
      detail.complete_for_query !== true || !filters ||
      filters[method.stateKey] !== 'AR' || filters[method.serviceKey] !== '561720' ||
      !method.dateKeys.every(key => typeof filters[key] === 'string' && filters[key]) ||
      filters.offset !== 0 || !Number.isInteger(filters.limit) ||
      filters.limit < 1 || filters.limit > 100 ||
      !run.started_at || !Number.isFinite(Date.parse(run.started_at)))
    throw new Error('Current successful bounded Arkansas SAM run is required');
  const verifiedAt = new Date(run.started_at);
  const until = new Date(verifiedAt);
  until.setUTCDate(until.getUTCDate() + 30);
  if (until.getTime() <= Date.now()) throw new Error('SAM verification run is stale');
  return {
    id: stableId(['procurement-capability', source.id, kind, 'api', method.endpoint]),
    source_id: source.id, route_geography_id: geography.id, kind, method: 'api',
    endpoint_url: method.endpoint, official_entry_url: method.entry,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { run_id: run.id, upstream_status: 200,
      complete_for_query: true, checked_filters: filters, official_docs: method.entry,
      work_location_limit: 'Arkansas state only; city/county match requires separate evidence' },
    parser_version: 'sam-routed-v1',
    method_spec: { version: 1, runner_id: 'sam-search', page_size: filters.limit,
      max_pages: 3, query_defaults: { [method.serviceKey]: '561720' } },
    next_action: 'Review returned work locations; reverify the method after expiry',
  };
}
