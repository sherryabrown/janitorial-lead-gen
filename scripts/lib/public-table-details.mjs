import {JSDOM,VirtualConsole} from 'jsdom';
import {inspectPublicHtmlTable} from './public-html-table.mjs';
import {publishedDeadlineDate} from './automatic-public-method.mjs';
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const relevant=/\b(janitor(?:ial)?|custodi(?:al|an)|housekeeping|cleaning services|floor care)\b/i;

export function publicTableFinding(body,record,evidence,page) {
  const dom=new JSDOM(body.toString('utf8'),{virtualConsole:new VirtualConsole()});
  try {
    const doc=dom.window.document,number=clean(doc.querySelector('#ctl00_mainContent_lblNumber')?.textContent);
    const notes=clean(doc.querySelector('#ctl00_mainContent_lblNotes')?.textContent);
    const status=clean(doc.querySelector('#ctl00_mainContent_lblStatus')?.textContent);
    if(!number.includes(record.bid_number)||!number.includes(record.title)||!/^Issued$/i.test(status)||!relevant.test(notes))return null;
    const rows=[...doc.querySelectorAll('#ctl00_mainContent_rgNonParticipationActivities_ctl00 tr.rgRow,#ctl00_mainContent_rgNonParticipationActivities_ctl00 tr.rgAltRow')];
    const sites=rows.map(row=>row.querySelectorAll('td')[2]).filter(Boolean).map(node=>({text:clean(node.textContent),
      cityLines:[...node.querySelectorAll('p,div')].map(p=>clean(p.textContent))})).filter(s=>/Starting Location\s*:/i.test(s.text));
    const site=sites.map(s=>({...s,location:s.text.match(/Starting Location\s*:\s*(.*?)General Information/i)?.[1]}))
      .find(s=>s.location&&s.cityLines.some(line=>/^([A-Z][a-z]+(?: [A-Z][a-z]+){0,3}),\s*AR\s+\d{5}$/.test(line)&&s.location.includes(line)));
    const city=site?.cityLines.find(line=>/^([A-Z][a-z]+(?: [A-Z][a-z]+){0,3}),\s*AR\s+\d{5}$/.test(line)&&site.location.includes(line))?.split(',')[0];
    const deadline=publishedDeadlineDate(record.closes),published=publishedDeadlineDate(record.issued);
    if(deadline!==publishedDeadlineDate(doc.querySelector('#ctl00_mainContent_lblClose')?.textContent)||
        published!==publishedDeadlineDate(doc.querySelector('#ctl00_mainContent_lblIssue')?.textContent))return null;
    // A buyer/contact address cannot satisfy this check. Only a named on-site
    // visit associated with the advertised work establishes a performance city.
    const facilityWords=record.title.toLowerCase().split(/\W+/).filter(w=>w.length>3&&
      !['janitorial','services','cleaning','administrative','building','maintenance','complex','custodial','housekeeping'].includes(w));
    if(!city||!deadline||!facilityWords.some(w=>site.location.toLowerCase().includes(w)))return null;
    return {record_id:record.id,title:record.title,classification:'opportunity',
      reason:'Official public bid details identify routine janitorial work and a named on-site visit',
      work_location_basis:'Published on-site visit starting location; not the buyer contact address. Other facilities remain unconfirmed.',
      payload:{title:record.title,source_url:record.source_url,bid_type:'opportunity',business_category:'other_public',deadline,
        ...(published?{published_date:published}:{}),work_city:city,work_state:'AR'},
      evidence:[{run_id:page.run_id,locator:'published bid row',excerpt:clean(JSON.stringify(record))}],
      supporting_evidence:[{...evidence,locator:'public on-site visit starting location',excerpt:site.text}]};
  } finally {dom.window.close();}
}

// One audited public GET per existing workflow lease, with a saved intent before
// sending. Failures retain the listing and never retry in a challenge loop.
export async function continuePublicTableDetails({context,packet,supporting,checkpoint,save,actor}) {
  const spec=context.capability.method_spec;
  if(!packet.automatic_county||spec.response_format!=='html-table-v1'||!spec.public_details)return true;
  checkpoint.public_table_details??={};
  const records=packet.pages.flatMap(page=>inspectPublicHtmlTable(page.body,spec).records.filter(r=>relevant.test(r.title)).map(record=>({record,page})));
  const state=checkpoint.public_table_details[packet.task_id]??={packet_hash:packet.packet_hash,entries:[]};
  if(state.packet_hash!==packet.packet_hash)throw Error('Saved public detail packet changed; reconcile before retry');
  for(const {record,page} of records.slice(0,5)) {
    let entry=state.entries.find(e=>e.id===record.id);
    if(!entry) {
      entry={id:record.id,record,url:record.source_url,state:'attempt_pending'};state.entries.push(entry);await save('running');
      try {const outcome=await supporting.capture(context,packet,{packet_hash:packet.packet_hash,url:record.source_url},actor);Object.assign(entry,outcome);}
      catch(error){if(['schedule_paused','request_cancelled'].includes(error.code)){state.entries.pop();await save('running');}throw error;}
      await save('pending');return false;
    }
    if(entry.state==='captured') {
      const body=await supporting.load(context,packet,entry);
      entry.finding=publicTableFinding(body,record,entry,page);
      if(entry.finding)entry.finding.supporting_evidence=await Promise.all(entry.finding.supporting_evidence.map(e=>supporting.portable(context,packet,e)));
    }
  }
  return true;
}

export function applyPublicTableDetails(extraction,packet,checkpoint) {
  const entries=checkpoint.public_table_details?.[packet.task_id]?.entries??[];
  return {...extraction,facts:extraction.facts.map(fact=>{
    const entry=entries.find(e=>e.id===(fact.record?.id??fact.verified_finding?.record_id)),finding=entry?.finding;
    if(finding)return {...fact,verified_finding:{...finding,evidence:finding.evidence.map(({run_id,...e})=>({...e,page_index:packet.pages.findIndex(p=>p.run_id===run_id)}))}};
    if(entry?.record&&fact.verified_finding) {
      const {verified_finding,...original}=fact;void verified_finding;
      return {...original,record:entry.record,title:entry.record.title,excerpt:clean(JSON.stringify(entry.record))};
    }
    return fact;
  })};
}
