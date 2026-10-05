import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { stableId } from './research-persistence.mjs';

export const uahtProcurementUrl = 'https://www.uaht.edu/about/procurement.php';

export function verifiedUahtOpportunityMethod(source, geography, capture, now = new Date()) {
  if (source?.code !== 'ua-hope-texarkana' || geography?.kind !== 'municipality' ||
      geography.name !== 'Texarkana' || geography.state_code !== 'AR' ||
      geography.source_active !== true ||
      !source.source_coverage_areas?.some(area => area.area_type === 'city' &&
        area.city_name === 'Texarkana' && area.state_code === 'AR') ||
      capture?.state !== 'captured' || capture.final_url !== uahtProcurementUrl ||
      capture.requested_url !== uahtProcurementUrl || capture.bytes > 2_000_000 ||
      !capture.content_type?.toLowerCase().startsWith('text/html') ||
      capture.body?.length !== capture.bytes ||
      createHash('sha256').update(capture.body).digest('hex') !== capture.content_sha256)
    throw new Error('Current official UAHT Texarkana procurement capture required');
  const document = new JSDOM(capture.body.toString('utf8')).window.document;
  const text = document.body?.textContent ?? '';
  if (!/Procurement/i.test(document.title) || !/Current Solicitations/i.test(text) ||
      !/Intent to Award/i.test(text))
    throw new Error('UAHT procurement category sections missing');
  const verifiedAt = new Date(now);
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('Valid verification time required');
  const until = new Date(verifiedAt); until.setUTCDate(until.getUTCDate() + 30);
  return {
    id: stableId(['procurement-capability', source.id, 'opportunity', 'browser', uahtProcurementUrl]),
    source_id: source.id, route_geography_id: geography.id, kind: 'opportunity', method: 'browser',
    endpoint_url: uahtProcurementUrl, official_entry_url: source.url,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { url: uahtProcurementUrl, content_sha256: capture.content_sha256,
      bytes: capture.bytes, sections: ['Current Solicitations', 'Intent to Award'],
      coverage_limit: 'UAHT public procurement page only; campus/work site and linked notices need review',
      interpretation: 'pending' },
    parser_version: 'public-capture-v1',
    method_spec: { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
      urls: [uahtProcurementUrl], allowed_hosts: ['www.uaht.edu'], max_bytes: 2_000_000 },
    next_action: 'Review saved solicitation section and linked notices before staging candidates',
  };
}
