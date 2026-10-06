import { JSDOM } from 'jsdom';
import { inspectArdotPage } from './ardot-table.mjs';
import { inspectPublicJsonListing } from './public-json-listing.mjs';
import { inspectPublicHtmlTable } from './public-html-table.mjs';
import { inspectPublicBonfireProjects, inspectPublicBonfireContracts } from './public-bonfire-projects.mjs';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const emptyListing = /\bno\s+(?:(?:current|open|active|available)\s+)?(?:bids?|solicitations?|opportunities|records|results|contracts)\b|\b(?:0|zero)\s+(?:results|records|bids|opportunities)\b/i;

// Retrieval success is not evidence that the intended listing was rendered.
export function zeroEvidence(body, contentType, sourceCode, pageIndex=0, review='', methodSpec={}, reviewSummary=null) {
  if (methodSpec.response_format === 'json-files-v1') {
    const page = inspectPublicJsonListing(body, methodSpec);
    return { eligible: page.terminal,
      reason: page.reason,
      text: page.records.length ? review : `0 results in ${page.category}`,
      listing: page.records.length > 0, listing_rows: page.records.length };
  }
  if (methodSpec.response_format === 'html-table-v1') {
    const page = inspectPublicHtmlTable(body, methodSpec);
    return { eligible: page.terminal, reason: page.reason,
      text: page.records.length ? review : `0 results for ${methodSpec.expected_organization}`,
      listing: page.records.length > 0, listing_rows: page.records.length };
  }
  if (['bonfire-projects-v1','bonfire-contracts-v1'].includes(methodSpec.response_format)) {
    const contracts = methodSpec.response_format === 'bonfire-contracts-v1';
    const page = contracts ? inspectPublicBonfireContracts(body, methodSpec)
      : inspectPublicBonfireProjects(body, methodSpec);
    return { eligible: true, reason: null,
      text: page.records.length ? review :
        `0 results in public Bonfire ${contracts ? 'contracts' : 'open opportunities'}`,
      listing: page.records.length > 0, listing_rows: page.records.length };
  }
  if (/^application\/json/i.test(contentType) && sourceCode==='ardot') {
    const page=inspectArdotPage(body,pageIndex,100);
    return {eligible:page.terminal&&page.total===0 || page.records.length>0,
      reason:page.total===0&&!page.terminal?'ARDOT pagination incomplete':null,
      text:page.total===0?'0 results on the ARDOT table':review,
      listing:page.records.length>0,listing_rows:page.records.length};
  }
  if (!/^(text\/html|application\/xhtml\+xml)/i.test(contentType))
    return { eligible:false, reason:'Zero requires a readable listing; review this document explicitly', text:'' };
  const document = new JSDOM(body.toString('utf8')).window.document;
  const accessPage = !!document.querySelector('input[type="password"]') ||
    /\b(sign in|log in|login|access denied|forbidden|service unavailable|not found|error)\b/i.test(document.title);
  for (const node of document.querySelectorAll('script,style,noscript,template,svg,nav,footer,aside')) node.remove();
  const text = clean((document.querySelector('main') ?? document.body)?.textContent);
  const listing = !!document.querySelector('table, [role="table"], [role="grid"]');
  const rawListingRows=[...document.querySelectorAll('table')].reduce((n,table)=>
    n+(table.querySelectorAll('tbody tr').length||[...table.querySelectorAll('tr')].filter(row=>row.querySelector('td')).length),0);
  const listingRows = reviewSummary?.tables?.length
    ? reviewSummary.tables.reduce((n, table) => n + table.visible_rows, 0) : rawListingRows;
  return { eligible:!accessPage && !!text && (listing || emptyListing.test(text)),
    reason:accessPage ? 'Access/error page' : !text ? 'Empty application shell' :
      !listing && !emptyListing.test(text) ? 'No verifiable listing or empty-state marker' : null,
    text, listing, listing_rows:listingRows };
}

export function validateZeroBasis(packet, result) {
  if (!Array.isArray(result.zero_basis) || result.zero_basis.length !== packet.pages.length)
    throw new Error('Zero requires evidence for every captured page');
  const seen = new Set();
  for (const basis of result.zero_basis) {
    const page = packet.pages.find(p=>p.run_id===basis.run_id);
    if (!page?.zero_evidence?.eligible || seen.has(basis.run_id) ||
        !clean(basis.locator) || !clean(basis.excerpt) ||
        !page.zero_evidence.text.includes(clean(basis.excerpt)))
      throw new Error('Zero basis must cite a readable saved listing, not a shell or access page');
    if (basis.kind === 'empty_listing') {
      if (!emptyListing.test(basis.excerpt)) throw new Error('Zero basis lacks an explicit empty-listing marker');
    } else if (basis.kind === 'reviewed_listing') {
      const excluded=result.exclusions.filter(x=>x.evidence?.some(e=>
        e.run_id===basis.run_id && page.zero_evidence.text.includes(clean(e.excerpt))));
      if (!page.zero_evidence.listing || !page.zero_evidence.listing_rows ||
          excluded.length < page.zero_evidence.listing_rows ||
          new Set(excluded.map(x=>x.evidence.find(e=>e.run_id===basis.run_id)?.locator)).size < page.zero_evidence.listing_rows)
        throw new Error('Reviewed listing zero needs saved exclusion evidence');
    } else throw new Error('Zero basis kind must be empty_listing or reviewed_listing');
    seen.add(basis.run_id);
  }
}
