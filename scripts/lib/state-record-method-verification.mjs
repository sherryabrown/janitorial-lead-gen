import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { stableId } from './research-persistence.mjs';

export function verifiedStateRecordMethod(source, geography, lead, capture, now = new Date()) {
  if (source?.code !== 'arbuy-janitorial' || geography?.id !== '05' ||
      geography.kind !== 'state' || geography.state_code !== 'AR' || geography.source_active !== true ||
      !source.source_coverage_areas?.some(area => area.area_type === 'state' && area.state_code === 'AR') ||
      lead?.source_id !== source.id || lead.external_id !== 'S000000473' ||
      lead.bid_type !== 'award' || lead.payload?.executed_contract_verified !== true ||
      capture?.state !== 'captured' || capture.requested_url !== source.url ||
      capture.final_url !== source.url || !capture.content_type?.toLowerCase().startsWith('text/html') ||
      capture.body?.length !== capture.bytes || capture.bytes > 2_000_000 ||
      createHash('sha256').update(capture.body).digest('hex') !== capture.content_sha256)
    throw new Error('Matching official ARBuy record and reviewed award required');
  const document = new JSDOM(capture.body.toString('utf8'), { url: source.url }).window.document;
  for (const element of document.querySelectorAll('script,style,noscript')) element.remove();
  const text = document.body?.textContent.replace(/\s+/g, ' ') ?? '';
  if (!document.title.includes('Bid Solicitation - S000000473') ||
      !/Bid Number:\s*S000000473/.test(text) ||
      !/Statewide Janitorial Services/.test(text) ||
      !/Intent to Award has been issued/.test(text))
    throw new Error('ARBuy public record identity or intent status changed; review before renewal');
  const verifiedAt = new Date(now);
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('Valid verification time required');
  const until = new Date(verifiedAt); until.setUTCDate(until.getUTCDate() + 30);
  const host = new URL(source.url).hostname.toLowerCase();
  return {
    id: stableId(['procurement-capability', source.id, 'award', 'browser', source.url]),
    source_id: source.id, route_geography_id: '05', kind: 'award', method: 'browser',
    endpoint_url: source.url, official_entry_url: source.url,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { lead_id: lead.id, solicitation_id: 'S000000473',
      content_sha256: capture.content_sha256, status_on_page: 'intent_to_award',
      executed_contract_intake_id: '915f9867-8344-576b-a7aa-656809b7ed27',
      coverage_limit: 'Only solicitation S000000473 public detail/status; ARBuy intent is not executed-award proof. Signed contract evidence is linked to the existing canonical lead; attachments and local work sites need review.',
      interpretation: 'pending' },
    parser_version: 'public-capture-v1',
    method_spec: { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
      urls: [source.url], allowed_hosts: [host], max_bytes: 2_000_000 },
    next_action: 'Compare changed ARBuy status/document manifest to saved run; review attachments and signed-contract amendments without duplicating lead',
  };
}
