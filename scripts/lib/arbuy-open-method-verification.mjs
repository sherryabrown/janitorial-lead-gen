import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { stableId } from './research-persistence.mjs';

export const arbuyOpenBidsUrl = 'https://arbuy.arkansas.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true';

export function verifiedArbuyOpenMethod(source, geography, capture, now = new Date()) {
  if (source?.code !== 'arbuy' || geography?.id !== '05' || geography.kind !== 'state' ||
      geography.state_code !== 'AR' || geography.source_active !== true ||
      !source.source_coverage_areas?.some(area => area.area_type === 'state' && area.state_code === 'AR') ||
      capture?.state !== 'captured' || capture.requested_url !== arbuyOpenBidsUrl ||
      capture.final_url !== arbuyOpenBidsUrl || !capture.content_type?.toLowerCase().startsWith('text/html') ||
      capture.body?.length !== capture.bytes || capture.bytes > 2_000_000 ||
      createHash('sha256').update(capture.body).digest('hex') !== capture.content_sha256)
    throw new Error('Official ARBuy public open-bids capture required');
  const document = new JSDOM(capture.body.toString('utf8'), { url: arbuyOpenBidsUrl }).window.document;
  const headers = [...document.querySelectorAll('table thead th')].map(cell => cell.textContent.trim());
  const resultText = document.querySelector('table')?.textContent ?? '';
  if (!document.title.includes('advancedSearchBid.xhtml - openBids=true') ||
      !document.querySelector('#bidSearchResultsForm') ||
      !headers.some(header => /Bid Solicitation #/.test(header)) ||
      !headers.some(header => /Bid Opening Date/.test(header)) ||
      !(/No records found/.test(resultText) || document.querySelectorAll('table tbody tr').length > 0))
    throw new Error('Public open-bid result table was not found');
  const verifiedAt = new Date(now);
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('Valid verification time required');
  const until = new Date(verifiedAt); until.setUTCDate(until.getUTCDate() + 30);
  return {
    id: stableId(['procurement-capability', source.id, 'opportunity', 'browser', arbuyOpenBidsUrl]),
    source_id: source.id, route_geography_id: '05', kind: 'opportunity', method: 'browser',
    endpoint_url: arbuyOpenBidsUrl, official_entry_url: source.url,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { content_sha256: capture.content_sha256,
      coverage_limit: 'ARBuy public Open Bids view only for pre-transition solicitations still active there; historical search, other agencies, detail documents and login-only participation are not covered. Empty default results are not a verified zero for the archive.',
      interpretation: 'pending' },
    parser_version: 'public-capture-v1',
    method_spec: { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
      urls: [arbuyOpenBidsUrl], allowed_hosts: ['arbuy.arkansas.gov'], max_bytes: 2_000_000 },
    next_action: 'Review any public open rows and exact details; verify historical archive query separately',
  };
}
