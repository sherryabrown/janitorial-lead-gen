import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { stableId } from './research-persistence.mjs';

export const dhsAnnouncementsUrl = 'https://humanservices.arkansas.gov/divisions-shared-services/shared-services/office-of-procurement/procurement-announcements/';

export function verifiedDhsOpportunityMethod(source, geography, capture, now = new Date()) {
  if (source?.code !== 'dhs' || geography?.id !== '05' || geography.kind !== 'state' ||
      geography.state_code !== 'AR' || geography.source_active !== true ||
      !source.source_coverage_areas?.some(area => area.area_type === 'state' && area.state_code === 'AR') ||
      capture?.state !== 'captured' || capture.requested_url !== dhsAnnouncementsUrl ||
      capture.final_url !== dhsAnnouncementsUrl || !capture.content_type?.toLowerCase().startsWith('text/html') ||
      capture.body?.length !== capture.bytes || capture.bytes > 2_000_000 ||
      createHash('sha256').update(capture.body).digest('hex') !== capture.content_sha256)
    throw new Error('Current official DHS announcements capture required');
  const document = new JSDOM(capture.body.toString('utf8'), { url: dhsAnnouncementsUrl }).window.document;
  const table = document.querySelector('#table_1');
  const headers = [...(table?.querySelectorAll('thead th') ?? [])].map(cell => cell.textContent.trim());
  const rows = [...(table?.querySelectorAll('tbody tr') ?? [])];
  let settings;
  try { settings = JSON.parse(document.querySelector('#table_1_desc')?.value ?? ''); } catch { /* invalid page */ }
  if (!document.title.includes('Procurement Announcements') ||
      headers.join('|') !== 'Title|Closing Date|Type' || rows.length < 1 ||
      settings?.serverSide !== false || settings?.tableWpId !== 149)
    throw new Error('Complete DHS announcement table was not found');
  const verifiedAt = new Date(now);
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('Valid verification time required');
  const until = new Date(verifiedAt); until.setUTCDate(until.getUTCDate() + 30);
  return {
    id: stableId(['procurement-capability', source.id, 'opportunity', 'browser', dhsAnnouncementsUrl]),
    source_id: source.id, route_geography_id: '05', kind: 'opportunity', method: 'browser',
    endpoint_url: dhsAnnouncementsUrl, official_entry_url: source.url,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { content_sha256: capture.content_sha256, table_rows_visible: rows.length,
      historical_source_url: source.url, current_listing_url: dhsAnnouncementsUrl,
      coverage_limit: 'DHS public announcements index, including closed historical notices; check closing date, notice type, detail and amendments before calling a row open. Intent notices are not executed awards.',
      interpretation: 'pending' },
    parser_version: 'public-capture-v1',
    method_spec: { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
      urls: [dhsAnnouncementsUrl], allowed_hosts: ['humanservices.arkansas.gov'], max_bytes: 2_000_000 },
    next_action: 'Review date/type and exact linked solicitation; verify executed award and amendments separately',
  };
}
