import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

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
      registered_sources: (task.evidence?.registered_source_ids ?? [])
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
  if (!isHtml && !isText && !isPdf) throw new Error('Unsupported saved capture type');
  let title = '', visible = '', links = [], tables = [];
  if (isHtml) {
    const dom = new JSDOM(body.toString('utf8'), { url: capture.final_url });
    const document = dom.window.document;
    title = clean(document.title);
    for (const node of document.querySelectorAll('script,style,noscript,template,svg,nav,footer,aside')) node.remove();
    const main = document.querySelector('main');
    visible = clean(main?.textContent || document.body?.textContent);
    tables = [...document.querySelectorAll('table')].slice(0, 3).map(table => {
      const headers = [...table.querySelectorAll('thead th')].map(cell => clean(cell.textContent));
      const allRows = [...table.querySelectorAll('tbody tr')];
      const preferred = headers.map((name, index) => ({ name, index }))
        .filter(column => /^(status|rfp name|description|posting date|response deadline|department|details|commodity|contract tracking number|outline agreement number|expiration date|vendor)$/i.test(column.name));
      const columns = (preferred.length >= 2 ? preferred : headers.map((name, index) => ({ name, index })))
        .slice(0, 7);
      const rows = allRows.slice(0, 50).map(row => {
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
      });
      return { columns, rows, total_rows: allRows.length };
    }).filter(table => table.columns.length && table.rows.length);
    links = [...document.querySelectorAll('a[href]')].map(anchor => {
      try {
        const url = new URL(anchor.getAttribute('href'), capture.final_url);
        return url.protocol === 'https:' && !url.username && !url.password
          ? { label: clean(anchor.textContent) || url.hostname, url: url.href } : null;
      } catch { return null; }
    }).filter(Boolean);
  } else if (isText) visible = clean(body.toString('utf8'));
  links = [...new Map(links.map(link => [link.url, link])).values()].slice(0, 60);
  const preview = visible.slice(0, tables.length ? 1000 : 12000);
  const fence = '`'.repeat(Math.max(3, ...[...preview.matchAll(/`+/g)].map(match => match[0].length + 1)));
  const scope = task.kind === 'source_entry' ? 'Entry URL only; no forecast, opportunity, or award coverage verified'
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
  }
  if (links.length) lines.push('## Links in saved HTML', '',
    ...links.map(link => `- ${link.label.replaceAll('[', '').replaceAll(']', '')}: ${link.url}`), '');
  return { markdown: lines.join('\n') + '\n', body,
    extension: isPdf ? '.pdf' : isHtml ? '.html.txt' : '.txt',
    summary: { title, visible_characters: visible.length, links: links.length,
      tables: tables.map(table => ({ visible_rows: table.total_rows, shown_rows: table.rows.length })), scope } };
}

export function gapReport(requestId, plan, geographies, sources, publicChecks = []) {
  const gaps = gapRows(plan, geographies, sources);
  const lines = ['# Known-source coverage review', '', `Request: ${requestId}`, '',
    `Current plan: ${plan.known} verified category checks; ${plan.entry_checks} entry checks; ${gaps.length} gaps; ${plan.blocked} blocked routes.`,
    '', '| Geography | Category | State | Registered sources | Next action |',
    '| --- | --- | --- | ---: | --- |',
    ...gaps.map(g => `| ${safeCell(g.geography)} | ${g.category} | ${g.state} | ${g.registered_sources.length} | ${safeCell(g.next_action)} |`),
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
