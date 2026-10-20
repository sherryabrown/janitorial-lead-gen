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
const documentColumns=[['Closing Date/Time','Information / Description','Award Letter','Award Status'],
  ['Date of Post','Bid Document','Bid Number','Due Date','Status']];
const columnNames=table=>[...table.querySelectorAll('thead th')].map(h=>clean(h.textContent));
function documentUrl(anchor,spec) {
  if(!anchor)throw Error('Published bid document missing');
  const url=new URL(anchor.href),entry=new URL(spec.urls[0]);
  if(url.protocol==='http:'&&url.hostname===entry.hostname&&!url.port)url.protocol='https:';
  if(!safePublicUrl(url.href,spec.allowed_hosts))throw Error('Published document leaves verified hosts');
  return url.href;
}
export function publishedDeadlineDate(value) {
  const date=clean(value).match(/\b(?:[A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/)?.[0];
  if(!date)return null;
  const parsed=new Date(date+' 12:00:00 UTC');
  if(!Number.isFinite(parsed.getTime()))return null;
  const day=Number(date.match(/\/(\d{1,2})\//)?.[1]??date.match(/ (\d{1,2}),/)?.[1]);
  return parsed.getUTCDate()===day?parsed.toISOString().slice(0,10):null;
}

// This is deliberately a recognizer for evidenced, terminal public listings, not
// an arbitrary selector/code generator. Unknown structures stay partial.
export function inspectAutomaticListing(body, spec) {
  if (spec.response_format !== 'county-listing-v1' || spec.max_records !== 100 ||
      !spec.urls?.length || !spec.expected_heading) throw Error('Invalid automatic listing contract');
  const dom = new JSDOM(body.toString('utf8'), { url: spec.urls[0], virtualConsole: new VirtualConsole() });
  try {
    const doc = dom.window.document;
    const remoteTable=[...doc.querySelectorAll('script[id*="datatables"][id$="after"]')].some(node=>/["']?(?:serverSide|ajax)["']?\s*:/i.test(node.textContent));
    for (const node of doc.querySelectorAll('script,style,noscript,template,nav,header,footer')) node.remove();
    const root = doc.querySelector('main, [role="main"]') ?? doc.body;
    if (root.querySelector('[rel="next"], [aria-label*="Next"], .pagination, .pager') ||
        /\b(load more|next page)\b/i.test(visibleText(root))) throw Error('Listing pagination needs verification');
    if(spec.expected_heading==='B2Gnow current solicitations') {
      const heading=clean(doc.querySelector('h2.interiorHeader')?.textContent);
      const scope=clean([...doc.querySelectorAll('p')].find(p=>/^Listed below are current and recent solicitations/.test(clean(p.textContent)))?.textContent);
      const counts=doc.querySelectorAll('input[name="TotalRecordCount"]');
      const count=counts.length===1?counts[0].value:'';
      const rows=[...doc.querySelectorAll('a.RecordTile')];
      const filter=doc.querySelector('select[name="Status"]');
      if(heading!=='Bid Opportunities'||!spec.expected_organization?.trim()||
          !scope.startsWith(`Listed below are current and recent solicitations that the ${spec.expected_organization} has issued.`)||
          !/^\d+$/.test(count)||Number(count)!==rows.length||rows.length>spec.max_records||
          !filter||filter.value!==''||doc.querySelector('[data-ajax],iframe[src]'))
        throw Error('Public solicitation identity, unfiltered count or traversal changed');
      const records=[];
      for(const row of rows) {
        const status=clean(row.querySelector('.Status')?.textContent);
        if(!['Open','Due Soon','Past'].includes(status))throw Error('Public solicitation status changed');
        const description=row.querySelector('.Description')?.cloneNode(true);
        if(!description)throw Error('Public solicitation description missing');
        for(const node of description.querySelectorAll('.DateBox,.Status'))node.remove();
        const text=clean(description.textContent),identity=text.match(/^([0-9]{4,10}(?:RFQ|RFP|IFB|Quote)?)\s+-\s+(.+)$/);
        const due=clean(row.querySelector('.DateDue')?.textContent).replace(/^Due\s*/,''),deadline=publishedDeadlineDate(due);
        if(!identity||!deadline)throw Error('Public solicitation reference or deadline missing');
        // Reissued/cancelled historical rows can share a reference. They are not
        // current opportunities. Never use the rotating ViewDetail PID as identity.
        if(status==='Past')continue;
        records.push({id:identity[1],title:identity[2],status,deadline,deadline_text:due,source_url:spec.urls[0]});
      }
      if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate current solicitation references');
      return {records,total:records.length,terminal:true,evidence:`${scope} ${rows.length} published records; ${records.length} current solicitations.`,heading:spec.expected_heading};
    }
    if(spec.expected_heading==='Published bid document table') {
      if(![...root.querySelectorAll('h1,h2,h3')].some(h=>/^Bid Opportunities(?: and Information)?$/i.test(clean(h.textContent)))||
          remoteTable)
        throw Error('Published bid table heading or traversal changed');
      const tables=[...root.querySelectorAll('table')].filter(t=>documentColumns.some(cols=>JSON.stringify(cols)===JSON.stringify(columnNames(t))));
      if(tables.length!==1)throw Error('Published bid document columns changed');
      const table=tables[0],housing=columnNames(table).length===5,rows=[...table.querySelectorAll('tbody tr')];
      if(!rows.length||rows.length>100)throw Error('Published bid table lacks bounded row evidence');
      const records=rows.map(row=>{
        const cells=[...row.querySelectorAll('td')],info=cells[1],anchor=info?.querySelector('a[href]');
        if(cells.length!==(housing?5:4))throw Error('Published bid document row changed');
        const source_url=documentUrl(anchor,spec),clone=info.cloneNode(true);
        for(const a of clone.querySelectorAll('a'))a.remove();
        const title=visibleText(clone)||clean(anchor.textContent);
        if(!title)throw Error('Published bid title missing');
        const raw=clean(cells[housing?3:0].textContent),deadline=publishedDeadlineDate(raw);
        return {id:source_url,title,source_url,status:clean(cells[housing?4:3].textContent),
          deadline_text:raw,...(deadline?{deadline}:{})};
      });
      if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate published bid documents');
      return {records,total:records.length,terminal:true,evidence:'Bid Opportunities',heading:spec.expected_heading};
    }
    if(spec.expected_heading==='Published procurement sections') {
      const heading=clean(doc.querySelector('h1')?.textContent);
      const matrix=doc.querySelector('#matrix');
      if(!/^(Invitation to Bid|Requests for (Proposals|Qualifications|Information))$/.test(heading)||!matrix||
          matrix.querySelector('iframe,[data-ajax],[rel="next"],.pagination,.pager'))throw Error('Published procurement sections changed');
      const blocks=[...matrix.querySelectorAll('section.xresources,section.xdropdowns li')];
      if(!blocks.length||blocks.length>100)throw Error('Published procurement sections lack bounded evidence');
      const records=blocks.map(block=>{
        const title=clean(block.querySelector('h2,.uk-accordion-title')?.textContent);
        const anchor=[...block.querySelectorAll('a[href]')].find(a=>/\.pdf(?:$|\?)/i.test(a.href)&&/\b(?:ITB|RFP|RFQ|RFI|ASQ|qualifications)\b/i.test(a.textContent));
        if(!title||!anchor)throw Error('Procurement section identity or primary document missing');
        const source_url=documentUrl(anchor,spec);
        return {id:source_url,title,source_url};
      });
      if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate procurement sections');
      return {records,total:records.length,terminal:true,evidence:heading,heading:spec.expected_heading};
    }
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
    if(!heading&&[...root.querySelectorAll('table')].some(t=>documentColumns.some(cols=>JSON.stringify(cols)===JSON.stringify(columnNames(t)))))heading='Published bid document table';
    if(!heading&&dom.window.document.querySelector('#matrix section.xresources')&&
        /^(Invitation to Bid|Requests for (Proposals|Qualifications|Information))$/.test(clean(dom.window.document.querySelector('h1')?.textContent)))heading='Published procurement sections';
    if(!heading&&root.querySelector('input[name="TotalRecordCount"]')&&root.querySelector('a.RecordTile')&&
        clean(root.querySelector('h2.interiorHeader')?.textContent)==='Bid Opportunities')heading='B2Gnow current solicitations';
  } finally { dom.window.close(); }
  if (!heading) throw Error('No supported opportunity listing heading');
  const spec = { version: 1, runner_id: 'public-fetch', check_when: 'each_request', urls: [url],
    allowed_hosts: [new URL(url).hostname], max_bytes: 2_000_000, response_format: 'county-listing-v1',
    max_records: 100, expected_heading: heading };
  if(heading==='B2Gnow current solicitations') {
    const d=new JSDOM(body.toString('utf8'),{virtualConsole:new VirtualConsole()});
    try {spec.expected_organization=clean(d.window.document.querySelector('p')?.textContent)
      .match(/^Listed below are current and recent solicitations that the (.+?) has issued\./)?.[1];}
    finally {d.window.close();}
  }
  return { spec, listing: inspectAutomaticListing(body, spec) };
}
