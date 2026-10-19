import { JSDOM, VirtualConsole } from 'jsdom';
import { safePublicUrl } from './known-source-execution.mjs';

export const automaticCountyPolicy = 'county-public-v1';
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const visibleText = root => {
  const walker=root.ownerDocument.createTreeWalker(root,4),parts=[];
  while(walker.nextNode())parts.push(walker.currentNode.textContent);
  return clean(parts.join(' '));
};
const headers = {
  id: /^(bid|solicitation|rfp|rfq)\s*(number|no\.?|#|id)$/i,
  title: /^(title|bid title|project title|description|solicitation title)$/i,
  deadline: /^(deadline|closing date|due date|bid closing date)$/i,
  work_city: /^(work city|project city|place of performance city)$/i,
  work_county: /^(work county|project county|place of performance county)$/i,
  work_state: /^(work state|project state|place of performance state)$/i,
};
const category = /\b(current|open|active)\s+(bids|bid opportunities|solicitations|procurement opportunities)\b/i;
const empty = /\b(no (?:current |open |active )?(?:bids|solicitations|bid opportunities)(?: are)? (?:available|posted|open)|there are no open bids|there are currently no bids listed)\b/i;

// This is deliberately a recognizer for evidenced, terminal public listings, not
// an arbitrary selector/code generator. Unknown structures stay partial.
export function inspectAutomaticListing(body, spec) {
  if (spec.response_format !== 'county-listing-v1' || spec.max_records !== 100 ||
      !spec.urls?.length || !spec.expected_heading) throw Error('Invalid automatic listing contract');
  const dom = new JSDOM(body.toString('utf8'), { url: spec.urls[0], virtualConsole: new VirtualConsole() });
  try {
    const doc = dom.window.document;
    for (const node of doc.querySelectorAll('script,style,noscript,template,nav,header,footer')) node.remove();
    const root = doc.querySelector('main, [role="main"]') ?? doc.body;
    if (root.querySelector('[rel="next"], [aria-label*="Next"], .pagination, .pager') ||
        /\b(load more|next page)\b/i.test(visibleText(root))) throw Error('Listing pagination needs verification');
    if(spec.expected_heading==='EvoGov bid listing') {
      const evidence=clean(root.querySelector('.evo_bids_empty')?.textContent).match(/There are currently no bids listed\./i)?.[0];
      if(!evidence||root.querySelector('.evo_bids_empty table, iframe'))throw Error('Public bid listing changed; revalidation required');
      return {records:[],terminal:true,total:0,evidence,heading:spec.expected_heading};
    }
    if(spec.expected_heading==='Revize public bids') {
      const table=root.querySelector('table#rpfbids');
      const evidence='All current and active bid opportunities are listed below.';
      if(!table||root.querySelectorAll('table#rpfbids').length!==1||!visibleText(root).includes(evidence)||
          !/Description.*Opening Date\/Time.*Closing Date\/Time/i.test(visibleText(table.querySelector('thead')??table)))
        throw Error('Published bid table contract changed');
      const rows=[...table.querySelectorAll('tbody tr')];
      if(!rows.length||rows.length>100||rows.some(r=>!r.hasAttribute('data-exp')))throw Error('Published bid table is incomplete');
      const records=rows.map(row=>{
        const cells=[...row.querySelectorAll('td')],link=cells[0]?.querySelector('a[href]');
        if(cells.length!==3||!link||!safePublicUrl(link.href,spec.allowed_hosts)||!clean(link.textContent))throw Error('Published bid identity changed');
        const id=new URL(link.href).pathname.match(/\/bid_detail_(T\d+_R\d+)\.php$/)?.[1];
        if(!id)throw Error('Published bid detail identity missing');
        const record={id,title:clean(cells[0].textContent),source_url:link.href};
        // Keep date text and metadata consistent; never derive a work location
        // from the county that owns the website.
        const date=clean(cells[2].textContent).match(/[A-Za-z]+ \d{1,2}, \d{4}/)?.[0];
        const parsed=date&&new Date(date+' 12:00:00 UTC');
        const iso=parsed&&Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):null;
        if(iso&&iso.replaceAll('-','')===row.getAttribute('data-exp'))record.deadline=iso;
        return record;
      });
      if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate published bid identities');
      return {records,total:records.length,terminal:true,evidence,heading:spec.expected_heading};
    }
    if(spec.expected_heading==='City bid listing') {
      const evidence=visibleText(root).match(/View current bid opportunities for the (?:City|Town) of [^.]+\./)?.[0];
      const tables=[...root.querySelectorAll('table')].filter(t=>clean([...t.querySelectorAll('th')].map(h=>h.textContent).join(' '))==='Bid Name Contact PDF Details');
      if(!evidence||tables.length!==1||root.querySelector('iframe,[data-ajax]'))throw Error('City bid listing contract changed');
      const rows=[...tables[0].querySelectorAll('tr')].filter(r=>r.querySelector('td'));
      if(!rows.length||rows.length>100)throw Error('City bid listing is empty or exceeds bounds without terminal evidence');
      const records=rows.map(row=>{
        const cells=[...row.querySelectorAll('td')],link=cells[3]?.querySelector('a[href]');
        if(cells.length!==4||!link||!safePublicUrl(link.href,spec.allowed_hosts))throw Error('City bid detail link missing');
        const detail=new URL(link.href),id=detail.searchParams.get('id');
        const raw=visibleText(cells[0]),title=clean(raw.split(/\bCloses:/)[0]);
        if(!/^\d+$/.test(id??'')||!detail.pathname.endsWith('/info.php')||!title)throw Error('City bid identity missing');
        const deadline=raw.match(/Closes:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
        return {id,title,source_url:detail.href,...(deadline?{deadline}:{})};
      });
      if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate city bid identities');
      return {records,total:records.length,terminal:true,evidence,heading:spec.expected_heading};
    }
    const heading = [...root.querySelectorAll('h1,h2,h3')].find(h => clean(h.textContent) === spec.expected_heading);
    if (!heading || !category.test(clean(heading.textContent))) throw Error('Opportunity listing heading changed');
    if (root.querySelector('[rel="next"], [aria-label*="Next"], .pagination, .pager') ||
        /\b(load more|next page)\b/i.test(visibleText(root))) throw Error('Listing pagination needs verification');
    const tables = [...root.querySelectorAll('table')].filter(t =>
      [...t.querySelectorAll('th')].some(h => headers.id.test(clean(h.textContent))));
    if (!tables.length) {
      const evidence = visibleText(root).match(empty)?.[0];
      if (!evidence || root.querySelector('iframe, [data-ajax], [data-src]')) throw Error('No verified records or explicit empty listing');
      return { records: [], terminal: true, total: 0, evidence, heading: spec.expected_heading };
    }
    if (tables.length !== 1) throw Error('Multiple opportunity tables need verification');
    const table = tables[0], rowHeaders = [...table.querySelectorAll('tr')].find(r => r.querySelector('th'));
    const labels = [...rowHeaders.querySelectorAll('th')].map(h => clean(h.textContent));
    const columns = Object.fromEntries(Object.entries(headers).map(([key, pattern]) => [key, labels.findIndex(h => pattern.test(h))]));
    if (columns.id < 0 || columns.title < 0) throw Error('Opportunity identity/title columns missing');
    const rows = [...table.querySelectorAll('tr')].filter(r => r !== rowHeaders && r.querySelector('td'));
    if (rows.length > spec.max_records) throw Error('Opportunity record bound exceeded');
    const records = rows.map(row => {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length !== labels.length) throw Error('Opportunity table structure changed');
      const record = Object.fromEntries(Object.entries(columns).filter(([, index]) => index >= 0)
        .map(([key, index]) => [key, clean(cells[index].textContent)]));
      const link = cells[columns.title].querySelector('a[href]') ?? cells[columns.id].querySelector('a[href]');
      if (!record.id || !record.title || !link || !safePublicUrl(link.href, spec.allowed_hosts))
        throw Error('Opportunity identity or official detail link missing');
      record.source_url = link.href;
      if (record.deadline && !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(record.deadline)) delete record.deadline;
      return record;
    });
    if (new Set(records.map(r => r.id)).size !== records.length) throw Error('Duplicate listing record identities');
    // Count text must be explicit. A first page without a next link is not proof
    // of complete traversal, and an empty table alone is not an empty listing.
    const text = visibleText(root), count = /\b(\d+)\s+(?:open |active |current )?(?:bids|solicitations)\b/i.exec(text);
    const emptyEvidence = text.match(empty)?.[0];
    if (records.length ? !count || Number(count[1]) !== records.length : !emptyEvidence)
      throw Error('Listing terminal count is unconfirmed');
    return { records, terminal: true, total: records.length, evidence: count?.[0] ?? emptyEvidence, heading: spec.expected_heading };
  } finally { dom.window.close(); }
}

export function proposeAutomaticListing(body, url) {
  const dom = new JSDOM(body.toString('utf8'), { virtualConsole: new VirtualConsole() });
  let heading;
  try {
    const root = dom.window.document.querySelector('main, [role="main"]') ?? dom.window.document.body;
    heading = [...root.querySelectorAll('h1,h2,h3')].map(h => clean(h.textContent)).find(h => category.test(h));
    if(!heading&&/There are currently no bids listed\./i.test(root.querySelector('.evo_bids_empty')?.textContent??''))heading='EvoGov bid listing';
    if(!heading&&root.querySelector('table#rpfbids')&&visibleText(root).includes('All current and active bid opportunities are listed below.'))heading='Revize public bids';
    if(!heading&&/View current bid opportunities for the (?:City|Town) of [^.]+\./.test(visibleText(root)))heading='City bid listing';
  } finally { dom.window.close(); }
  if (!heading) throw Error('No supported opportunity listing heading');
  const spec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request', urls: [url],
    allowed_hosts: [new URL(url).hostname], max_bytes: 2_000_000, response_format: 'county-listing-v1',
    max_records: 100, expected_heading: heading };
  return { spec, listing: inspectAutomaticListing(body, spec) };
}
