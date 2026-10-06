import { stableId } from './research-persistence.mjs';
import { inspectPublicHtmlTable } from './public-html-table.mjs';
const countyName = value => String(value ?? '').replace(/\s+County$/i, '').trim().toLowerCase();

export function verifiedHtmlTableMethod(config, source, geography, capture, now = new Date()) {
  const url = new URL(config.url), entry = new URL(config.entry_url);
  if (source?.code !== config.source_code || geography?.name !== config.geography_name ||
      geography.kind !== 'county' || geography.state_code !== 'AR' || !geography.source_active ||
      config.kind !== 'opportunity' ||
      !source.source_coverage_areas?.some(area => area.area_type === 'county' &&
        countyName(area.county_name) === countyName(geography.name) && area.state_code === 'AR') ||
      url.protocol !== 'https:' || entry.protocol !== 'https:' ||
      new URL(source.url).hostname !== entry.hostname ||
      capture?.state !== 'captured' || capture.requested_url !== config.url ||
      capture.final_url !== config.url || capture.bytes > 2_000_000 ||
      !config.coverage_limit?.trim() || !config.interpretation_guidance?.trim())
    throw new Error('Official, routed, bounded county table verification required');
  const methodSpec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
    urls: [config.url], allowed_hosts: [url.hostname], max_bytes: 2_000_000,
    response_format: 'html-table-v1', max_records: 100,
    table_selector: 'table.rgMasterTable', row_selector: 'tr.rgRow, tr.rgAltRow',
    expected_organization: config.expected_organization,
    interpretation_guidance: config.interpretation_guidance };
  const listing = inspectPublicHtmlTable(capture.body, methodSpec);
  if (!listing.terminal) throw new Error('County portal has more pages; verify pagination before registration');
  const checked = new Date(now);
  if (!Number.isFinite(checked.getTime())) throw new Error('Invalid verification time');
  const until = new Date(checked); until.setUTCDate(until.getUTCDate() + 30);
  return { id: stableId(['procurement-capability', source.id, config.kind, 'browser', config.url,
    config.expected_organization]), source_id: source.id, route_geography_id: geography.id,
    kind: config.kind, method: 'browser', endpoint_url: config.url,
    official_entry_url: config.entry_url, availability: 'active',
    verified_at: checked.toISOString(), verified_until: until.toISOString(),
    last_success_at: checked.toISOString(),
    verification_evidence: { official_entry_url: config.entry_url,
      content_sha256: capture.content_sha256, bytes: capture.bytes,
      total_rows: listing.total, scoped_rows: listing.records.length,
      pages: listing.pages, terminal: listing.terminal,
      coverage_limit: config.coverage_limit },
    parser_version: 'html-table-v1', method_spec: methodSpec,
    next_action: 'Review county rows and linked bid details before staging leads' };
}
