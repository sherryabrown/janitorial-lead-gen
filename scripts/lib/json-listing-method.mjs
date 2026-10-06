import { stableId } from './research-persistence.mjs';
import { inspectPublicJsonListing } from './public-json-listing.mjs';

export function verifiedJsonListingMethod(config, source, geography, capture, now = new Date()) {
  const endpoint = new URL(config.url);
  const entry = new URL(config.entry_url);
  if (source?.code !== config.source_code || geography?.name !== config.geography_name ||
      geography.kind !== 'municipality' || geography.state_code !== 'AR' ||
      geography.source_active !== true || config.kind !== 'opportunity' ||
      !source.source_coverage_areas?.some(area => area.area_type === 'city' &&
        area.city_name === geography.name && area.state_code === 'AR') ||
      endpoint.protocol !== 'https:' || entry.protocol !== 'https:' ||
      endpoint.hostname !== entry.hostname || new URL(source.url).hostname !== entry.hostname ||
      capture?.state !== 'captured' || capture.requested_url !== config.url ||
      capture.final_url !== config.url || capture.bytes > 2_000_000 ||
      !config.coverage_limit?.trim() || !config.interpretation_guidance?.trim())
    throw new Error('Official, routed, bounded listing verification required');
  const methodSpec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
    urls: [config.url], allowed_hosts: [endpoint.hostname], max_bytes: 2_000_000,
    response_format: 'json-files-v1', expected_category: config.expected_category,
    max_records: 100, interpretation_guidance: config.interpretation_guidance };
  const listing = inspectPublicJsonListing(capture.body, methodSpec);
  if (!listing.terminal) throw new Error('Listing has more pages; verify pagination before registration');
  const checked = new Date(now);
  if (!Number.isFinite(checked.getTime())) throw new Error('Invalid verification time');
  const until = new Date(checked); until.setUTCDate(until.getUTCDate() + 30);
  return { id: stableId(['procurement-capability', source.id, config.kind, 'browser', config.url]),
    source_id: source.id, route_geography_id: geography.id, kind: config.kind,
    method: 'browser', endpoint_url: config.url, official_entry_url: config.entry_url,
    availability: 'active', verified_at: checked.toISOString(),
    verified_until: until.toISOString(), last_success_at: checked.toISOString(),
    verification_evidence: { final_url: capture.final_url,
      content_sha256: capture.content_sha256, bytes: capture.bytes,
      category: listing.category, record_count: listing.records.length,
      terminal: listing.terminal, coverage_limit: config.coverage_limit,
      official_entry_url: config.entry_url },
    parser_version: 'json-files-v1', method_spec: methodSpec,
    next_action: 'Review dated document rows and linked PDFs before staging leads' };
}
