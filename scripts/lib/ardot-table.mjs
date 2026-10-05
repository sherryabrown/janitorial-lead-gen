import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { stableId } from './research-persistence.mjs';

export const ardotUrl = 'https://ardot.gov/divisions/equipment-procurement/commodities-and-services/bids-by-fiscal-year/';
export const ardotAjaxUrl = 'https://ardot.gov/wp-admin/admin-ajax.php?action=get_wdtable&table_id=53';

export function inspectArdotEntry(capture) {
  if (capture?.state !== 'captured' || capture.requested_url !== ardotUrl ||
      capture.final_url !== ardotUrl || !capture.content_type?.toLowerCase().startsWith('text/html') ||
      capture.body?.length !== capture.bytes || capture.bytes > 2_000_000 ||
      createHash('sha256').update(capture.body).digest('hex') !== capture.content_sha256)
    throw new Error('Official ARDOT entry capture required');
  const document = new JSDOM(capture.body.toString('utf8'), { url: ardotUrl }).window.document;
  let config;
  try { config = JSON.parse(document.querySelector('#table_1_desc')?.value ?? ''); }
  catch { throw new Error('ARDOT table configuration missing'); }
  const nonce = document.querySelector('#wdtNonceFrontendServerSide_53')?.value;
  if (!document.title.includes('Bid Openings by Fiscal Year') || config.tableWpId !== 53 ||
      config.serverSide !== true || config.dataTableParams?.ajax?.url !== ardotAjaxUrl ||
      config.dataTableParams?.ajax?.type !== 'POST' ||
      !Array.isArray(config.dataTableParams?.columnDefs) ||
      config.dataTableParams.columnDefs.length < 13 || !/^[a-f0-9]{8,64}$/i.test(nonce ?? ''))
    throw new Error('ARDOT official table settings changed');
  return { nonce, columns: config.dataTableParams.columnDefs,
    entry_sha256: capture.content_sha256 };
}

export function ardotPostBody(entry, pageIndex, pageSize = 100) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= 30 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error('ARDOT page bound exceeded');
  const body = new URLSearchParams({ draw: String(pageIndex + 1),
    start: String(pageIndex * pageSize), length: String(pageSize),
    'search[value]': '', 'search[regex]': 'false', wdtNonce: entry.nonce });
  for (let index = 0; index < entry.columns.length; index++) {
    const column = entry.columns[index];
    body.set(`columns[${index}][data]`, String(index));
    body.set(`columns[${index}][name]`, column.name);
    body.set(`columns[${index}][searchable]`, String(column.searchable));
    body.set(`columns[${index}][orderable]`, String(column.orderable));
    body.set(`columns[${index}][search][value]`, '');
    body.set(`columns[${index}][search][regex]`, 'false');
  }
  return body;
}

export function inspectArdotPage(body, pageIndex, pageSize = 100) {
  let response;
  try { response = JSON.parse(body.toString('utf8')); }
  catch { throw new Error('ARDOT table returned invalid JSON'); }
  const total = Number(response.recordsTotal);
  const filtered = Number(response.recordsFiltered);
  if (response.draw !== pageIndex + 1 || !Number.isInteger(total) || total < 0 || total > 3000 ||
      filtered !== total || !Array.isArray(response.data) || response.data.length > pageSize ||
      response.data.some(row => !Array.isArray(row) || row.length < 13 ||
        !/^\d+$/.test(String(row[0])) || !String(row[6]).trim()))
    throw new Error('ARDOT table page or total is incomplete');
  const start = pageIndex * pageSize;
  if (start > total || start + response.data.length > total ||
      (start + response.data.length < total && response.data.length !== pageSize))
    throw new Error('ARDOT table page length does not match total');
  return { total, rows: response.data.length, terminal: start + response.data.length === total,
    records: response.data.map(row => ({ id: String(row[0]), bid_number: String(row[6]).trim(),
      bid_url: String(row[7] ?? ''), tab_html: String(row[8] ?? ''),
      opening_date: String(row[9] ?? ''), description: String(row[11] ?? ''),
      awarded: String(row[13] ?? '') })) };
}

export function verifiedArdotMethod(source, geography, capture, firstPage, now = new Date()) {
  if (source?.code !== 'ardot' || source.url !== ardotUrl || geography?.id !== '05' ||
      geography.kind !== 'state' || geography.state_code !== 'AR' || geography.source_active !== true ||
      !source.source_coverage_areas?.some(area => area.area_type === 'state' && area.state_code === 'AR'))
    throw new Error('Mapped official ARDOT source required');
  const entry = inspectArdotEntry(capture);
  const page = inspectArdotPage(firstPage.body, 0);
  if (page.total < 1 || page.rows < 1 || firstPage.status !== 200)
    throw new Error('Current ARDOT first page required');
  const verifiedAt = new Date(now);
  if (!Number.isFinite(verifiedAt.getTime())) throw new Error('Valid verification time required');
  const until = new Date(verifiedAt); until.setUTCDate(until.getUTCDate() + 30);
  return {
    id: stableId(['procurement-capability', source.id, 'opportunity', 'browser', ardotUrl]),
    source_id: source.id, route_geography_id: '05', kind: 'opportunity', method: 'browser',
    endpoint_url: ardotAjaxUrl, official_entry_url: ardotUrl,
    availability: 'active', verified_at: verifiedAt.toISOString(),
    verified_until: until.toISOString(), last_success_at: verifiedAt.toISOString(),
    verification_evidence: { entry_sha256: entry.entry_sha256,
      first_page_sha256: createHash('sha256').update(firstPage.body).digest('hex'),
      first_page_rows: page.rows, reported_total: page.total,
      coverage_limit: 'ARDOT commodities/services fiscal-year table, all returned pages up to 3,000 rows. Bid, addendum and tab PDFs need separate review; a tab or awarded date alone is not executed-contract proof. Bid Express participation is separate.',
      interpretation: 'pending' },
    parser_version: 'ardot-table-v1',
    method_spec: { version: 1, runner_id: 'ardot-table', check_when: 'each_request',
      entry_url: ardotUrl, ajax_url: ardotAjaxUrl, page_size: 100, max_pages: 30,
      max_records: 3000, max_bytes: 2_000_000, allowed_hosts: ['ardot.gov'] },
    next_action: 'Review janitorial candidate rows and their official bid/tab/addendum PDFs before staging',
  };
}

export async function fetchArdotPage(entry, pageIndex, pageSize = 100, fetcher = fetch) {
  const response = await fetcher(ardotAjaxUrl, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: ardotUrl, 'x-requested-with': 'XMLHttpRequest' },
    body: ardotPostBody(entry, pageIndex, pageSize), signal: AbortSignal.timeout(30000) });
  if (response.status !== 200) return { status: response.status, state: 'blocked', reason: `HTTP ${response.status}` };
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 2_000_000) return { status: 200, state: 'partial', reason: 'ARDOT table page exceeds byte bound' };
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  if (!body.length) return { status: 200, state: 'partial', reason: 'ARDOT table returned empty body' };
  return { status: 200, state: 'captured', body,
    content_sha256: createHash('sha256').update(body).digest('hex'),
    ...inspectArdotPage(body, pageIndex, pageSize) };
}
