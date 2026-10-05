import { createHash } from 'node:crypto';
import { inspectArdotPage } from './ardot-table.mjs';

const keyword = /janitor|custod|cleaning|housekeep|floor care/i;
const clean = value => String(value ?? '').replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').replaceAll('|', '\\|').trim();

export function summarizeArdotPages(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 30)
    throw new Error('Bounded ARDOT page set required');
  const ordered = [...pages].sort((a, b) => a.run.page_index - b.run.page_index);
  let total = null, count = 0;
  const ids = new Set(), candidates = [];
  for (const [index, { run, capture }] of ordered.entries()) {
    if (run.page_index !== index || run.detail?.state !== 'content_saved' ||
        capture.run_id !== run.id || capture.source_id !== run.source_id ||
        capture.content_type !== 'application/json')
      throw new Error('ARDOT pages are incomplete or mismatched');
    const body = Buffer.from(capture.content_base64, 'base64');
    if (createHash('sha256').update(body).digest('hex') !== capture.content_sha256 ||
        run.detail.content_sha256 !== capture.content_sha256)
      throw new Error('ARDOT page hash mismatch');
    const page = inspectArdotPage(body, index);
    if (total !== null && total !== page.total ||
        run.detail.records_total !== page.total || run.detail.rows !== page.rows ||
        run.detail.terminal !== page.terminal)
      throw new Error('ARDOT page accounting mismatch');
    total = page.total;
    count += page.rows;
    for (const record of page.records) {
      if (ids.has(record.id)) throw new Error('ARDOT row identity repeated across pages');
      ids.add(record.id);
      if (keyword.test(record.description)) candidates.push({ ...record, run_id: run.id });
    }
    if (page.terminal !== (index === ordered.length - 1))
      throw new Error('ARDOT terminal page is not last');
  }
  if (count !== total) throw new Error('ARDOT reported total was not fully captured');
  const lines = ['# ARDOT fiscal-year table review', '',
    `${ordered.length} pages; ${count} distinct rows; ${candidates.length} janitorial-keyword candidates.`,
    'Keyword matches are leads for human review only. Opening dates, awarded dates and tab PDFs do not prove an open solicitation or executed contract.', '',
    '| Bid | Description | Opening | Awarded | Bid link | Tab link | Run |',
    '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of candidates) {
    const tab = /href=["'](https:\/\/[^"']+)/i.exec(row.tab_html)?.[1] ?? '';
    lines.push(`| ${[row.bid_number,row.description,row.opening_date,row.awarded,row.bid_url,tab,row.run_id].map(clean).join(' | ')} |`);
  }
  return { pages: ordered.length, total_rows: count, candidates, markdown: lines.join('\n') + '\n' };
}
