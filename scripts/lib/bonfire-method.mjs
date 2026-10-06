import { stableId } from './research-persistence.mjs';
import { inspectPublicBonfireProjects, inspectPublicBonfireContracts } from './public-bonfire-projects.mjs';

export function verifiedBonfireMethod(config, source, geography, entry, capture, now = new Date()) {
  const origin = new URL(config.entry_url), endpoint = new URL(config.url);
  if (source?.code !== config.source_code || geography?.kind !== 'municipality' ||
      geography.name !== config.geography_name || geography.state_code !== 'AR' ||
      !geography.source_active || !['opportunity','award'].includes(config.kind) ||
      !source.source_coverage_areas?.some(area => area.area_type === 'city' &&
        area.city_name === geography.name && area.state_code === 'AR') ||
      origin.protocol !== 'https:' || endpoint.origin !== origin.origin ||
      new URL(source.url).protocol !== 'https:' ||
      entry?.state !== 'captured' || entry.final_url !== config.entry_url ||
      capture?.state !== 'captured' || capture.final_url !== config.url ||
      !config.coverage_limit?.trim() || !config.interpretation_guidance?.trim())
    throw new Error('Official Bonfire source, route and captures required');
  const html = entry.body.toString('utf8');
  if (!html.includes(`var organizationId = "${config.organization_id}"`) ||
      !html.includes(config.organization_name) ||
      !html.includes(config.kind === 'award'
        ? '/PublicPortal/getPublicContractsSectionData'
        : '/PublicPortal/getOpenPublicOpportunitiesSectionData'))
    throw new Error('Bonfire portal organization or public endpoint changed');
  const methodSpec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
    urls: [config.url], allowed_hosts: [endpoint.hostname], max_bytes: 2_000_000,
    response_format: config.kind === 'award' ? 'bonfire-contracts-v1' : 'bonfire-projects-v1',
    max_records: 100,
    interpretation_guidance: config.interpretation_guidance };
  const listing = config.kind === 'award'
    ? inspectPublicBonfireContracts(capture.body, methodSpec)
    : inspectPublicBonfireProjects(capture.body, methodSpec);
  const checked = new Date(now); if (!Number.isFinite(checked.getTime())) throw new Error('Invalid time');
  const until = new Date(checked); until.setUTCDate(until.getUTCDate() + 30);
  return { id: stableId(['procurement-capability', source.id, config.kind, 'browser', config.url]),
    source_id: source.id, route_geography_id: geography.id, kind: config.kind,
    method: 'browser', endpoint_url: config.url, official_entry_url: config.entry_url,
    availability: 'active', verified_at: checked.toISOString(),
    verified_until: until.toISOString(), last_success_at: checked.toISOString(),
    verification_evidence: { official_entry_url: config.entry_url,
      organization_id: config.organization_id, entry_sha256: entry.content_sha256,
      content_sha256: capture.content_sha256, record_count: listing.records.length,
      coverage_limit: config.coverage_limit },
    parser_version: methodSpec.response_format, method_spec: methodSpec,
    next_action: 'Review public records and their details before staging candidates' };
}
