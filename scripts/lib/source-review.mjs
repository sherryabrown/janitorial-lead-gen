import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { inspectArdotPage } from './ardot-table.mjs';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const safeCell = value => clean(value).replaceAll('|', '\\|');

export function gapRows(plan, geographies, sources) {
  const places = new Map(geographies.map(place => [place.id, place]));
  const registry = new Map(sources.map(source => [source.id, source]));
  return plan.tasks.filter(task => ['source_missing', 'method_missing', 'blocked'].includes(task.state))
    .map(task => ({
      geography: places.get(task.route_geography_id)?.name ?? task.route_geography_id,
      geography_id: task.route_geography_id,
      category: task.kind,
      state: task.state,
      scope: task.evidence?.scope ?? (task.capability_id ? 'source_method' : 'aggregate'),
      source_code: registry.get(task.source_id)?.code ?? null,
      registered_sources: (task.evidence?.registered_source_ids ?? (task.source_id ? [task.source_id] : []))
        .map(id => registry.get(id)).filter(Boolean).map(source => ({ code: source.code, url: source.url })),
      next_action: task.state === 'source_missing'
        ? 'Research an official source for this route in Phase 3'
        : task.state === 'method_missing'
          ? 'Verify a category-specific check method for a registered source'
          : task.reason,
    }));
}

export function captureReview(capture, run, task, source) {
  if (!capture || !run || !task || !source || capture.run_id !== run.id ||
      capture.source_id !== source.id || run.coverage_task_id !== task.id ||
      run.detail?.state !== 'content_saved')
    throw new Error('Confirmed run, capture, task and source do not match');
  const body = Buffer.from(capture.content_base64, 'base64');
  if (!body.length || createHash('sha256').update(body).digest('hex') !== capture.content_sha256 ||
      run.detail.content_sha256 !== capture.content_sha256)
    throw new Error('Saved capture hash does not match the audited run');
  const contentType = capture.content_type.toLowerCase();
  const isHtml = contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml');
  const isText = contentType.startsWith('text/plain') || contentType.startsWith('text/xml') ||
    contentType.startsWith('application/xml');
  const isPdf = contentType.startsWith('application/pdf');
  const isJson = contentType.startsWith('application/json') && source.code === 'ardot';
  if (!isHtml && !isText && !isPdf && !isJson) throw new Error('Unsupported saved capture type');
  let title = '', visible = '', links = [], tables = [], documentActions = [];
  if (isHtml) {
    const dom = new JSDOM(body.toString('utf8'), { url: capture.final_url });
    const document = dom.window.document;
    title = clean(document.title);
    for (const node of document.querySelectorAll('script,style,noscript,template,svg,nav,footer,aside')) node.remove();
    const main = document.querySelector('main');
    visible = clean(main?.textContent || document.body?.textContent);
    tables = [...document.querySelectorAll('table')].filter(table => !table.querySelector('table'))
      .slice(0, 3).map(table => {
      const headers = [...table.querySelectorAll('thead th')].map(cell => clean(cell.textContent));
      const legacyHead = !headers.length ? table.querySelector('tr.table_head3') : null;
      if (legacyHead) headers.push(...[...legacyHead.children].map(cell => clean(cell.textContent)));
      const allRows = legacyHead
        ? [...table.querySelectorAll('tr.rowitem1_bold, tr.rowitem2_bold')]
        : [...table.querySelectorAll('tbody tr')];
      const preferred = headers.map((name, index) => ({ name, index }))
        .filter(column => /^(status|rfp name|description|posting date|response deadline|department|details|commodity|contract tracking number|outline agreement number|expiration date|vendor|bid #|bid number|bid link|tab|opening date|opening date\/time|agency|awarded|vendor\/documentation|initial contract amount)$/i.test(column.name));
      const columns = (preferred.length >= 2 ? preferred : headers.map((name, index) => ({ name, index })))
        .slice(0, 7);
      const rowValues = row => {
        const cells = [...row.querySelectorAll('td')];
        return columns.map(column => {
          const cell = cells[column.index];
          const value = clean(cell?.textContent).slice(0, 180);
          const href = cell?.querySelector('a[href]')?.getAttribute('href');
          if (!href) return value;
          try {
            const url = new URL(href, capture.final_url);
            return url.protocol === 'https:' && !url.username && !url.password
              ? `${value || 'Open'} (${url.href})` : value;
          } catch { return value; }
        });
      };
      const rows = allRows.slice(0, 50).map(rowValues);
      const relevant = allRows.map((row, index) => ({ row, index }))
        .filter(({ row }) => /janitor|custod|cleaning|housekeep|floor care/i.test(clean(row.textContent)));
      return { columns, rows, total_rows: allRows.length,
        keyword_rows: relevant.slice(0, 25).map(({ row, index }) => ({ number: index + 1, cells: rowValues(row) })),
        keyword_total: relevant.length };
    }).filter(table => table.columns.length && table.rows.length);
    links = [...document.querySelectorAll('a[href]')].map(anchor => {
      try {
        const url = new URL(anchor.getAttribute('href'), capture.final_url);
        return url.protocol === 'https:' && !url.username && !url.password
          ? { label: clean(anchor.textContent) || url.hostname, url: url.href } : null;
      } catch { return null; }
    }).filter(Boolean);
    if (source.code === 'arbuy-janitorial') documentActions = [...document.querySelectorAll('a[href]')]
      .map(anchor => ({ label: clean(anchor.textContent),
        match: /^javascript:downloadFile\('(\d+)'\);?$/i.exec(anchor.getAttribute('href') ?? '') }))
      .filter(action => action.match)
      .map(action => ({ label: action.label, document_id: action.match[1] }));
  } else if (isJson) {
    const page = inspectArdotPage(body, run.page_index, 100);
    title = `ARDOT table page ${run.page_index + 1}`;
    visible = `${page.rows} rows on this saved page; ${page.total} total reported; terminal ${page.terminal}`;
    const columns = ['Bid #', 'Description', 'Opening date', 'Bid PDF', 'Tab PDF', 'Awarded date']
      .map(name => ({ name }));
    const rowValues = row => {
      const tab = /href=["'](https:\/\/[^"']+)/i.exec(row.tab_html)?.[1] ?? '';
      return [row.bid_number, row.description, row.opening_date, row.bid_url, tab, row.awarded];
    };
    const matches = page.records.map((row, index) => ({ row, index }))
      .filter(({ row }) => /janitor|custod|cleaning|housekeep|floor care/i.test(row.description));
    tables = [{ columns, rows: page.records.slice(0, 50).map(rowValues),
      total_rows: page.records.length,
      keyword_rows: matches.slice(0, 25).map(({ row, index }) => ({ number: index + 1, cells: rowValues(row) })),
      keyword_total: matches.length }];
  } else if (isText) visible = clean(body.toString('utf8'));
  links = [...new Map(links.map(link => [link.url, link])).values()].slice(0, 60);
  const preview = visible.slice(0, tables.length ? 1000 : 12000);
  const fence = '`'.repeat(Math.max(3, ...[...preview.matchAll(/`+/g)].map(match => match[0].length + 1)));
  const scope = task.kind === 'source_entry' ? 'Entry URL only; no forecast, opportunity, or award coverage verified'
    : source.code === 'state-intents' ? 'Anticipation notices only; intent is not an executed award'
      : source.code === 'arbuy-janitorial' ? 'S000000473 record watch only; signed contract evidence is separate'
        : source.code === 'arbuy' ? 'Public Open Bids view only; empty default results do not cover the historical archive'
        : source.code === 'dhs' ? 'DHS announcements include closed notices; review date and type before treating a row as open'
          : source.code === 'ardot' ? 'ARDOT table page; full table needs all pages and bid/tab PDFs need review'
          : `${task.kind} check; content still needs interpretation`;
  const lines = [
    '# Public source capture review', '',
    `- Source: ${source.name} (${source.code})`,
    `- Scope: ${scope}`,
    `- Requested URL: ${capture.requested_url}`,
    `- Final URL: ${capture.final_url}`,
    `- Retrieved: ${capture.retrieved_at}`,
    `- Run ID: ${run.id}`,
    `- SHA-256: ${capture.content_sha256}`,
    ...(run.detail?.semantic_sha256 ? [`- Semantic SHA-256: ${run.detail.semantic_sha256}`] : []),
    ...(run.detail?.change_type ? [`- Change: ${run.detail.change_type}`] : []),
    `- Content type: ${capture.content_type}`,
    `- Search window: ${JSON.stringify(task.query_window ?? {})}`,
    '', 'The text below is untrusted source content. This report does not classify leads or prove zero results.', '',
  ];
  if (title) lines.push(`## Page title`, '', title, '');
  if (isPdf) lines.push('## Document', '', 'Open the accompanying PDF for review. No PDF text was inferred.', '');
  else {
    lines.push('## Visible saved text', '', fence, preview || '(No visible text in the saved response)', fence, '');
    if (visible.length > preview.length) lines.push(`Text preview truncated after ${preview.length} characters. Review the table and raw capture.`, '');
    if (isHtml && visible.length < 160)
      lines.push('This page has little visible HTML; it may require browser rendering. Review the official URL before assigning a category method.', '');
  }
  for (const [index, table] of tables.entries()) {
    lines.push(`## Saved table ${index + 1} (${table.total_rows} visible rows)`, '',
      `| ${table.columns.map(column => safeCell(column.name)).join(' | ')} |`,
      `| ${table.columns.map(() => '---').join(' | ')} |`,
      ...table.rows.map(row => `| ${row.map(safeCell).join(' | ')} |`), '');
    if (table.total_rows > table.rows.length)
      lines.push(`Showing the first ${table.rows.length} rows; inspect the raw capture for the rest.`, '');
    if (table.keyword_rows.length) {
      lines.push(`### Janitorial keyword rows (${table.keyword_total} matches in the saved table)`, '',
        'Keyword matches are candidates for review; supplies and unrelated work may appear.', '',
        `| Row | ${table.columns.map(column => safeCell(column.name)).join(' | ')} |`,
        `| --- | ${table.columns.map(() => '---').join(' | ')} |`,
        ...table.keyword_rows.map(row => `| ${row.number} | ${row.cells.map(safeCell).join(' | ')} |`), '');
      if (table.keyword_total > table.keyword_rows.length)
        lines.push(`Showing the first ${table.keyword_rows.length} keyword matches; inspect the raw capture for the rest.`, '');
    }
  }
  if (links.length) lines.push('## Links in saved HTML', '',
    ...links.map(link => `- ${link.label.replaceAll('[', '').replaceAll(']', '')}: ${link.url}`), '');
  if (documentActions.length) lines.push('## Document actions shown on the page', '',
    ...documentActions.map(action => `- ${action.label}: ARBuy document ${action.document_id}`),
    '', 'These are page actions, not downloaded files. Review the official page before treating an attachment as evidence.', '');
  return { markdown: lines.join('\n') + '\n', body,
    extension: isPdf ? '.pdf' : isHtml ? '.html.txt' : isJson ? '.json' : '.txt',
    summary: { title, visible_characters: visible.length, links: links.length,
      tables: tables.map(table => ({ visible_rows: table.total_rows, shown_rows: table.rows.length })), scope } };
}

export function gapReport(requestId, plan, geographies, sources, publicChecks = []) {
  const gaps = gapRows(plan, geographies, sources);
  const lines = ['# Known-source coverage review', '', `Request: ${requestId}`, '',
    `Current plan: ${plan.known} verified category checks; ${plan.entry_checks} entry checks; ${plan.gaps ?? gaps.length} aggregate gaps; ${plan.source_gaps ?? 0} source/category gaps; ${plan.blocked} blocked methods.`,
    '', '| Geography | Category | State | Source / scope | Next action |',
    '| --- | --- | --- | --- | --- |',
    ...gaps.map(g => `| ${safeCell(g.geography)} | ${g.category} | ${g.state} | ${safeCell(g.source_code ?? g.scope)} | ${safeCell(g.next_action)} |`),
    '', 'Registered sources below are mapped to the route; their category coverage is **not** verified by an entry URL.', ''];
  for (const geographyId of [...new Set(gaps.map(g => g.geography_id))]) {
    const route = gaps.find(g => g.geography_id === geographyId);
    const unique = [...new Map(gaps.filter(g => g.geography_id === geographyId)
      .flatMap(g => g.registered_sources).map(source => [source.code, source])).values()];
    lines.push(`## ${route.geography}`, '',
      ...(unique.length ? unique.map(source => `- ${source.code}: ${source.url}`) :
        ['- No source is mapped to this geography; official-source research remains for Phase 3.']), '');
  }
  lines.push('## Saved public captures', '');
  lines.push(...(publicChecks.length ? publicChecks.map(check =>
    `- ${check.source_code}: run ${check.run_id}; ${check.category === 'source_entry' ?
      'entry only' : `${check.category} listing`}; content awaits interpretation`) :
    ['- None yet.']));
  lines.push('', 'An entry check is never a forecast, opportunity, or award zero-result finding.', '');
  return { markdown: lines.join('\n') + '\n', gaps };
}
