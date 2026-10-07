import { JSDOM } from 'jsdom';
import { hash } from './reviewed-batch.mjs';
import { inspectPublicBonfireProjects,inspectPublicBonfireContracts } from './public-bonfire-projects.mjs';
import { inspectPublicHtmlTable } from './public-html-table.mjs';
import { inspectPublicJsonListing } from './public-json-listing.mjs';
import { inspectArdotPage } from './ardot-table.mjs';
import { apiField } from '../../supabase/functions/_shared/source-api.mjs';
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const janitorial=/\b(janitorial|janitor|custodial|custodian|housekeeping|floor care|cleaning services)\b/i;
const ambiguous=/\b(clean|maintenance|facilities|services)\b/i;
function citedDate(quoted,value) {
  const wanted=new Date(value).toISOString().slice(0,10);
  const dates=quoted.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b/gi)??[];
  return dates.some(date=>{const parsed=new Date(date.replace(/(\d)(st|nd|rd|th)/,'$1'));return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===wanted;});
}

export async function evidenceText(page) {
  if(/^application\/pdf/i.test(page.content_type)) {
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:new Uint8Array(page.body),isEvalSupported:false,disableFontFace:true,useSystemFonts:true});
    const doc=await task.promise;
    try {
      if(doc.numPages>30)throw new Error('PDF page bound exceeded');
      const pages=[];
      for(let index=1;index<=doc.numPages;index++) {
        const data=await (await doc.getPage(index)).getTextContent();
        pages.push({locator:`PDF page ${index}`,text:clean(data.items.map(item=>item.str??'').join(' '))});
      }
      return pages;
    } finally {await task.destroy();}
  }
  if(/^text\/html|^application\/xhtml/i.test(page.content_type)) {
    const dom=new JSDOM(page.body.toString('utf8'));
    try {
      for(const el of dom.window.document.querySelectorAll('script,style,noscript,template'))el.remove();
      return [{locator:'saved document',text:clean(dom.window.document.body?.textContent)}];
    } finally {dom.window.close();}
  }
  return [{locator:'saved document',text:clean(page.body.toString('utf8'))}];
}
export async function verifyEvidenceSpans(packet,result,{loadSupporting}={}) {
  if([...result.findings,...result.exclusions,...result.unresolved].reduce((n,item)=>n+(item.supporting_evidence?.length??0),0)>5)
    throw new Error('Supporting document bound exceeded');
  const texts=new Map(await Promise.all(packet.pages.map(async p=>[p.run_id,await evidenceText(p)])));
  for(const item of [...result.findings,...result.exclusions,...result.unresolved]) {
    for(const evidence of item.supporting_evidence??[]) {
      if(!loadSupporting)throw new Error('Supporting documents require a separately captured and verified packet');
      const body=await loadSupporting(evidence);
      const pages=await evidenceText({...evidence,body});
      if(!pages.some(p=>p.text.includes(clean(evidence.excerpt))&&
        (!evidence.locator?.startsWith('PDF page ')||evidence.locator===p.locator)))
        throw new Error('Supporting excerpt does not occur in the saved document');
    }
    for(const evidence of item.evidence??[]) {
      const page=packet.pages.find(p=>p.run_id===evidence.run_id);
      const excerpt=clean(evidence.excerpt);
      const raw=texts.get(evidence.run_id)??[];
      // Structured parser summaries are derived from hash-verified source bytes.
      if(!excerpt || !(raw.some(p=>p.text.includes(excerpt)&&
        (!evidence.locator.startsWith('PDF page ')||evidence.locator===p.locator)) ||
        !/^application\/pdf/i.test(page?.content_type??'') && clean(page?.review).includes(excerpt)))
        throw new Error('Evidence excerpt does not occur in the saved capture');
    }
  }
  for(const finding of result.findings) {
    const quoted=clean([...finding.evidence,...(finding.supporting_evidence??[])].map(e=>e.excerpt).join(' '));
    if(!quoted.includes(clean(finding.title)))throw new Error('Finding title lacks quoted source evidence');
    for(const field of ['work_city','work_county','deadline','expected_solicitation_date','contract_end_date','renewal_date','published_date','posted_date','award_date']) {
      if(finding.payload[field] && !(quoted.includes(clean(finding.payload[field])) ||
          !field.startsWith('work_') && citedDate(quoted,finding.payload[field])))
        throw new Error(`Finding ${field} lacks exact quoted evidence; leave it unresolved`);
    }
    if(finding.payload.work_performance_locations)for(const location of finding.payload.work_performance_locations) {
      for(const value of [location.city_name,location.county_name].filter(Boolean))
        if(!quoted.toLowerCase().includes(clean(value).toLowerCase()))throw new Error('Work location lacks quoted source evidence');
    }
  }
}
export const extractionKey=(packet,spec)=>hash({source:packet.source_id,method:packet.method_id,
  method_version:packet.method_version,spec,parser:'hosted-facts-v1',policy:'routine-janitorial-v1',
  pages:packet.pages.map(p=>({url:p.url,hash:p.content_sha256}))});

export async function extractFacts(packet,spec) {
  const facts=[];
  for(const [pageIndex,page] of packet.pages.entries()) {
    let records;
    if(spec.response_format==='bonfire-projects-v1')records=inspectPublicBonfireProjects(page.body,spec).records;
    else if(spec.response_format==='bonfire-contracts-v1')records=inspectPublicBonfireContracts(page.body,spec).records;
    else if(spec.response_format==='html-table-v1')records=inspectPublicHtmlTable(page.body,spec).records;
    else if(spec.response_format==='json-files-v1')records=inspectPublicJsonListing(page.body,spec).records;
    else if(spec.runner_id==='ardot-table')records=inspectArdotPage(page.body,page.page_index,spec.page_size??100).records;
    else if(spec.runner_id==='api-bounded')records=apiField(JSON.parse(page.body.toString()),spec.pagination.records_path);
    if(records) {
      for(const [index,record] of records.entries()) facts.push({page_index:pageIndex,locator:`row ${index+1}`,
        record,excerpt:clean(JSON.stringify(record)),title:clean(record.title??record.description??record.ProjectName)});
    } else {
      const texts=await evidenceText(page);
      for(const value of texts)facts.push({page_index:pageIndex,locator:value.locator,record:null,
        title:'',excerpt:value.text.slice(0,2000),unstructured:true});
    }
  }
  return {version:1,facts};
}

// Location/date interpretation remains explicit. Agency jurisdiction is never a work-site assertion.
export function evaluateFacts(packet,extraction) {
  const result={version:1,packet_hash:packet.packet_hash,reviewed_by:'deterministic-hosted-v1',
    reviewed_scope:'Saved listing rows only; ambiguous services, locations and dates require evidence review',
    coverage:'partial',findings:[],exclusions:[],unresolved:[]};
  for(const fact of extraction.facts.slice(0,99)) {
    const page=packet.pages[fact.page_index];
    // Quote parser-derived review text, not a newly fabricated JSON rendering.
    const excerpt=fact.verified_finding?.evidence?.[0]?.excerpt ?? (fact.title && clean(page.review).includes(fact.title)?fact.title:fact.excerpt);
    const evidence=[{run_id:page.run_id,locator:fact.locator,excerpt:excerpt.slice(0,2000)}];
    if(!excerpt)continue;
    if(fact.verified_finding) {
      const saved=fact.verified_finding;
      result.findings.push({...saved,evidence:saved.evidence.map(e=>({...e,run_id:packet.pages[e.page_index].run_id}))});
      continue;
    }
    const record=fact.record;
    if(record && janitorial.test(fact.title) && (record.id||record.record_id) &&
        (record.source_url||record.url) && (record.work_city||record.work_county||record.work_performance_locations)) {
      const rawEvidence=[{run_id:page.run_id,locator:fact.locator,excerpt:fact.excerpt.slice(0,2000)}];
      result.findings.push({record_id:String(record.id??record.record_id),title:fact.title,
        classification:packet.category,reason:'Structured official source identifies routine janitorial service',
        work_location_basis:'Explicit work-location fields in the saved official record',
        payload:{title:fact.title,source_url:record.source_url??record.url,bid_type:packet.category,business_category:'other_public',
          ...Object.fromEntries(['deadline','expected_solicitation_date','contract_end_date','renewal_date','published_date',
            'work_city','work_county','work_state','work_performance_locations'].filter(k=>record[k]!=null).map(k=>[k,record[k]]))},evidence:rawEvidence});
      continue;
    }
    if(fact.unstructured || !fact.title || janitorial.test(fact.title) || ambiguous.test(fact.title))
      result.unresolved.push({reason:'Verify routine janitorial scope, actual work location and requested date basis against source evidence',evidence});
    else result.exclusions.push({reason:'Listing title does not identify routine janitorial service',evidence});
  }
  if(extraction.facts.length>99)result.unresolved.push({reason:'Saved listing exceeds one interpretation batch; review remaining rows before coverage',
    evidence:[{run_id:packet.pages[0].run_id,locator:'saved listing',excerpt:clean(packet.pages[0].review).slice(0,500)}]});
  if(packet.complete && !result.unresolved.length) {
    result.zero_basis=packet.pages.map(page=>({run_id:page.run_id,locator:'saved listing',
      kind:page.zero_evidence.listing?'reviewed_listing':'empty_listing',
      excerpt:clean(page.zero_evidence.text).slice(0,2000)}));
    if(packet.pages.every(p=>p.zero_evidence.eligible))result.coverage='complete';
  }
  return result;
}

export function cacheReviewedFacts(extraction,packet,result,{portableSupporting=new Map()}={}) {
  // Save only verified positive source facts; never cache a request's zero, exclusion,
  // scope conclusion or unresolved outcome as reusable coverage.
  const facts=[...extraction.facts];
  for(const finding of result.findings) {
    // Unsigned/client-provided supporting evidence never becomes portable.
    const supporting=portableSupporting.get(finding.record_id);
    if(finding.supporting_evidence?.length && !supporting)continue;
    const index=packet.pages.findIndex(p=>p.run_id===finding.evidence[0].run_id);
    const evidence=finding.evidence.map(({run_id,...e})=>({...e,page_index:packet.pages.findIndex(p=>p.run_id===run_id)}));
    const saved={...finding,evidence};delete saved.supporting_evidence;
    if(supporting)saved.supporting_evidence=supporting;
    const identity=finding.record_id;
    const matching=facts.findIndex(f=>f.verified_finding?.record_id===identity ||
      f.page_index===index && (f.record?.id===identity || f.title===finding.title ||
        f.record && finding.evidence.some(e=>clean(e.excerpt)===f.excerpt)));
    const fact={page_index:index,locator:evidence[0].locator,title:finding.title,record:null,excerpt:evidence[0].excerpt,verified_finding:saved};
    if(matching>=0)facts[matching]=fact;else facts.push(fact);
  }
  return {...extraction,facts};
}
