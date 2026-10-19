import { JSDOM } from 'jsdom';
import {safePublicUrl} from './known-source-execution.mjs';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export function inspectPublicHtmlTable(body, spec) {
  if (spec?.response_format !== 'html-table-v1' ||
      !Number.isInteger(spec.max_records) || spec.max_records < 1 || spec.max_records > 100 ||
      !clean(spec.expected_organization) || !clean(spec.table_selector) ||
      !clean(spec.row_selector)) throw new Error('Unverified HTML table contract');
  const dom = new JSDOM(Buffer.isBuffer(body) ? body.toString('utf8') : body);
  try {
  const doc=dom.window.document;
  const table = doc.querySelector(spec.table_selector);
  if (!table || !/Bid Number/i.test(table.textContent) || !/Organization/i.test(table.textContent))
    throw new Error('Source bid table changed');
  const allRows = [...table.querySelectorAll(spec.row_selector)];
  if (allRows.length > spec.max_records) throw new Error('Source bid table exceeds row bound');
  const pager = /\b(\d+)\s+items?\s+in\s+(\d+)\s+pages?\b/i.exec(clean(doc.body?.textContent));
  if (!pager) throw new Error('Source bid pagination is unconfirmed');
  const total = Number(pager[1]), pages = Number(pager[2]);
  if (total < allRows.length || !Number.isInteger(pages) || pages < 1)
    throw new Error('Source bid pagination is inconsistent');
  let publicKeys;
  if(spec.public_details) {
    const element=doc.querySelector(spec.public_details.client_state_selector),client=element?.id.replace(/_ClientState$/,'');
    const scripts=[...doc.querySelectorAll('script')].filter(s=>client&&s.textContent.includes(`"ClientID":"${client}"`));
    const keys=scripts.flatMap(s=>[...s.textContent.replaceAll('\\"','"').matchAll(/"_clientKeyValues"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})/g)]);
    if(keys.length!==1)throw Error('Public row identities are missing or ambiguous');
    // Only parse the literal public ID map, never evaluate Telerik scripts,
    // submit view state, or copy browser/session state.
    publicKeys=JSON.parse(keys[0][1]);
  }
  const records = allRows.map((row, index) => {
    const cells = [...row.querySelectorAll('td')].map(cell => clean(cell.textContent));
    if (cells.length < 7 || !cells[1] || !cells[2] || !cells[4])
      throw new Error(`Source bid row ${index + 1} changed`);
    const record={ bid_number: cells[1], title: cells[2], bid_type: cells[3],
      organization: cells[4], issued: cells[5], closes: cells[6] };
    if(spec.public_details) {
      const detail=spec.public_details;
      if(detail.key!=='BidID'||!safePublicUrl(detail.endpoint,spec.allowed_hosts)||
          new URL(detail.endpoint).pathname!=='/PublicDetail.aspx')throw Error('Unverified public detail contract');
      const rowIndex=row.id.match(/__(\d+)$/)?.[1],bidId=publicKeys?.[rowIndex]?.BidID;
      if(!/^\d{1,12}$/.test(bidId??''))throw Error('Published row/detail identity missing');
      const link=new URL(detail.endpoint);link.searchParams.set('bidID',bidId);link.searchParams.set('SourceType','1');
      record.id=bidId;record.source_url=link.href;
    }
    return record;
  });
  if(spec.public_details&&new Set(records.map(record=>record.id)).size!==records.length)
    throw Error('Duplicate published public detail identity');
  const scoped = records.filter(row => row.organization === spec.expected_organization);
  return { total, pages, shown: records.length, records: scoped,
    terminal: pages === 1 && total === allRows.length,
    reason: pages === 1 && total === allRows.length ? null :
      'Public table has more pages or an incomplete first page' };
  } finally {dom.window.close();}
}
