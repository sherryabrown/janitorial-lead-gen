import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {HistoryScheduleFilter} from './HistoryScheduleFilter';
import {InfoTooltip} from '../shared/components/InfoTooltip';
import {duration,formatLocal,title,runLabel} from './model';
import type {County,Usage,RunTiming} from './types';
export type Metric={value:number|null;known_subtotal:number;completeness:string;reason?:string};
type Outcomes=Record<'added'|'updated'|'unchanged',Metric>;
export type AnalyticsReport={unavailable?:string;as_of:string;snapshot:string;total:number;next_offset:number|null;
 filters:{from:string;through:string};coverage:{first_run:string|null;last_run:string|null;verified_identity_runs:number;total_runs:number};
 summary:{runs:number;unique_leads:Metric;outcomes:Outcomes;run_events:Outcomes;categories:Record<'forecast'|'opportunity'|'award',Metric>;historical_opportunities:Metric;unclassified_known_leads:number;candidates_attention:Metric;validation_failures:Metric;sources_attention:number;route_gaps:number;
 timing:{average_ms:number|null;median_ms:number|null;samples:number;excluded:number};usage:Usage};
 items:{id:string;schedule_id:string|null;target_kind:string;origin:string;state:string;created_at:string;leads:Outcomes;candidates_attention:Metric;sources_attention:number;route_gaps:number;timing:RunTiming;presentation?:{outcome:'source_attention';attention_count:number}}[]};
const amount=(m:Metric)=>m.completeness==='not_applicable'?'Not applicable':m.value!==null?String(m.value):`Unknown · ${m.known_subtotal} known`;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(n);
export function AnalyticsSummary({report,compact=false}:{report:AnalyticsReport;compact?:boolean}){
 const s=report.summary;
 return <section className="analytics-summary" aria-label="Validated result metrics">
  <h3>{compact?'All-time available results':'Validated results'} <InfoTooltip label="About lead metrics">Distinct verified lead IDs. New takes precedence over updated, then unchanged. Category totals can overlap when a lead changes category. Unknown values show only the known subtotal.</InfoTooltip></h3>
  <dl className="schedule-facts analytics-facts">
   <div><dt>Distinct leads</dt><dd>{amount(s.unique_leads)}</dd></div>
   {(['added','updated','unchanged'] as const).map(k=><div key={k}><dt>{k==='added'?'New leads':k==='updated'?'Updated leads':'Unchanged matches'}</dt><dd>{amount(s.outcomes[k])}</dd></div>)}
   {(['forecast','opportunity','award'] as const).map(k=><div key={k}><dt>{title(k)}</dt><dd>{amount(s.categories[k])}</dd></div>)}
   <div><dt>Candidates needing attention</dt><dd>{amount(s.candidates_attention)}</dd></div>
  </dl>
  <small>Identity coverage · {report.coverage.verified_identity_runs} / {report.coverage.total_runs} runs · {report.coverage.first_run?formatLocal(report.coverage.first_run):'No saved runs'} – {report.coverage.last_run?formatLocal(report.coverage.last_run):'—'}</small>
  {!compact&&<>
   <section className="analytics-block"><h3>Processing & attention <InfoTooltip label="About processing and attention">Run events count a lead again when a later run processes it. They are separate from distinct lead totals. Validation failures are a subset of actionable candidates. Source attention counts distinct registered sources; unmapped routes are separate gaps.</InfoTooltip></h3>
   <dl className="schedule-facts analytics-facts">{(['added','updated','unchanged'] as const).map(k=><div key={k}><dt>{title(k)} run events</dt><dd>{amount(s.run_events[k])}</dd></div>)}<div><dt>Historical opportunities</dt><dd>{amount(s.historical_opportunities)}</dd></div><div><dt>Unclassified known leads</dt><dd>{s.unclassified_known_leads}</dd></div><div><dt>Validation failures</dt><dd>{amount(s.validation_failures)}</dd></div><div><dt>Sources needing attention</dt><dd>{s.sources_attention}</dd></div><div><dt>Unmapped route gaps</dt><dd>{s.route_gaps}</dd></div></dl></section>
   <section className="analytics-block"><h3>AI usage <InfoTooltip label="About analytics AI usage">Ledger event dates, for matching runs. A category filter selects whole runs requesting that category; costs are not allocated to categories. Unknown credits are not zero. Held amounts are reservations, not actual spending.</InfoTooltip></h3><small>Ledger event date · America/Chicago</small><dl className="schedule-facts analytics-facts"><div><dt>AI</dt><dd>{s.usage.ai==='not_used'?'Not used':title(s.usage.ai)}</dd></div><div><dt>Credits</dt><dd>{s.usage.ai==='not_used'?'Not used':s.usage.credits!=null?`${s.usage.credits} ${s.usage.credit_unit}`:'Unknown / not comparable'}</dd></div><div><dt>Input / output tokens</dt><dd>{s.usage.input_tokens??'Unknown'} / {s.usage.output_tokens??'Unknown'}</dd></div><div><dt>Actual spend</dt><dd>{s.usage.actual_usd===null?'Unknown':money(s.usage.actual_usd)}</dd></div><div><dt>Known spend subtotal</dt><dd>{money(s.usage.known_actual_usd)}</dd></div><div><dt>Held reservation</dt><dd>{money(s.usage.held_usd)}</dd></div></dl></section>
   <section className="analytics-block"><h3>Run timing <InfoTooltip label="About analytics timing">Average and median use reliable created-to-finished boundaries for completed or cancelled runs only. Recorded activity is the union of completed step intervals; it is not end-to-end execution time.</InfoTooltip></h3><dl className="schedule-facts analytics-facts"><div><dt>Average created to finished</dt><dd>{duration(s.timing.average_ms)}</dd></div><div><dt>Median created to finished</dt><dd>{duration(s.timing.median_ms)}</dd></div><div><dt>Reliable samples / excluded</dt><dd>{s.timing.samples} / {s.timing.excluded}</dd></div></dl></section>
  </>}
 </section>;
}
export function ScheduleAnalyticsSummary({id}:{id:string}){
 const [report,setReport]=useState<AnalyticsReport|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const a=new AbortController();setError('');setReport(null);void workflowRequest<AnalyticsReport>(`/v1/admin/analytics?${new URLSearchParams({schedule:id,period:'all',limit:'1'})}`,{signal:a.signal}).then(r=>{if(r.unavailable)throw Error(r.unavailable);if(!r.summary||!r.coverage)throw Error('Reporting data is unavailable.');if(!a.signal.aborted)setReport(r);}).catch(e=>{if(!a.signal.aborted)setError(e.message);});return()=>a.abort();},[id,revision]);
 return <section className="schedule-results">{report?<AnalyticsSummary report={report} compact/>:error?<p role="status">Results unavailable. {error} <button type="button" className="text-button" onClick={()=>setRevision(n=>n+1)}>Retry totals</button></p>:<p role="status">Loading available totals…</p>}</section>;
}
const defaults={schedule:'',target:'',geography:'',origin:'',category:'',from:'',through:'',sort:'created_at',direction:'desc'};
function restored(key:string){try{const saved=JSON.parse(sessionStorage.getItem(key)??'{}');return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,typeof saved[k]==='string'&&saved[k].length<=100?saved[k]:v])) as typeof defaults;}catch{return defaults;}}
export function Analytics({owner,counties,onView}:{owner:string;counties:County[];onView:(id:string)=>void}){
 const key=`spin-admin-stats-filter:${owner}`;
 const [filters,setFilters]=useState(()=>restored(key)),[report,setReport]=useState<AnalyticsReport|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[offset,setOffset]=useState(0);
 const anchor=useRef<{as_of:string;snapshot:string}|null>(null),shownOffset=useRef(0);
 const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v)).toString();
 useEffect(()=>{const a=new AbortController();setBusy(true);setError('');const q=new URLSearchParams(query);q.set('offset',String(offset));if(anchor.current){q.set('as_of',anchor.current.as_of);q.set('snapshot',anchor.current.snapshot);}
  void workflowRequest<AnalyticsReport>(`/v1/admin/analytics?${q}`,{signal:a.signal}).then(r=>{if(r.unavailable)throw Error(r.unavailable);if(!r.summary||!r.coverage)throw Error('Reporting data is unavailable.');if(!a.signal.aborted){anchor.current={as_of:r.as_of,snapshot:r.snapshot};shownOffset.current=offset;setReport(r);}}).catch(e=>{if(!a.signal.aborted){setReport(null);setError(e.message);}}).finally(()=>{if(!a.signal.aborted)setBusy(false);});return()=>a.abort();
 },[query,offset,revision]);
 const change=(k:keyof typeof defaults,v:string)=>{anchor.current=null;setOffset(0);setReport(null);const next={...filters,[k]:v};setFilters(next);try{sessionStorage.setItem(key,JSON.stringify(next));}catch{/* Mounted state remains available. */}};
 const refresh=()=>{anchor.current=null;setOffset(0);setReport(null);setRevision(n=>n+1);};
 return <section className="admin-section analytics" aria-label="Stats and analytics" aria-busy={busy}>
  <div className="admin-section-heading"><h2>Stats / analytics</h2><button type="button" className="text-button" onClick={refresh}>Refresh stats</button></div>
  <div className="schedule-filters analytics-filters"><label>Reporting period<select value={filters.from||filters.through?'custom':'7'} onChange={e=>{if(e.target.value==='7'){anchor.current=null;setOffset(0);setReport(null);setFilters(f=>({...f,from:'',through:''}));try{sessionStorage.setItem(key,JSON.stringify({...filters,from:'',through:''}));}catch{/* Mounted period remains. */}}else{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());change('from',today);}}}><option value="7">Last 7 days</option><option value="custom">Custom dates</option></select></label>
   <label>From · CT<input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/></label><label>Through · CT<input type="date" value={filters.through} onChange={e=>change('through',e.target.value)}/></label>
   <HistoryScheduleFilter value={filters.schedule} onChange={v=>change('schedule',v)}/>
   <label>Type<select value={filters.target} onChange={e=>change('target',e.target.value)}><option value="">All types</option><option value="county_scope">Counties</option><option value="state_source">State sources</option><option value="sam">SAM.gov</option></select></label>
   <label>Geography<select value={filters.geography} onChange={e=>change('geography',e.target.value)}><option value="">All geography</option><option value="05">Statewide</option>{counties.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Lead category<select value={filters.category} onChange={e=>change('category',e.target.value)}><option value="">All categories</option>{['forecast','opportunity','award'].map(c=><option key={c} value={c}>{title(c)}</option>)}</select></label>
   <label>Origin<select value={filters.origin} onChange={e=>change('origin',e.target.value)}><option value="">All origins</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option></select></label>
  </div>
  {busy&&<p role="status">Loading stats…</p>}{error&&<p role="alert">{error} <button type="button" className="text-button" onClick={refresh}>Retry stats</button></p>}
  {report&&<><small className="run-history-caption">{report.filters.from} – {report.filters.through} · America/Chicago · As of {formatLocal(report.as_of)} · Run creation dates · {report.total} runs</small>
   <AnalyticsSummary report={report}/>
   <section className="analytics-block"><div className="admin-section-heading"><h3>Runs</h3><div className="admin-inline"><label>Sort runs<select value={filters.sort} onChange={e=>change('sort',e.target.value)}>{[['created_at','Created'],['added','New leads'],['updated','Updated leads'],['unchanged','Unchanged matches'],['activity','Recorded activity']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Run order<select value={filters.direction} onChange={e=>change('direction',e.target.value)}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label></div></div>
   {!report.items.length&&<p>No matching runs.</p>}
   <div className="schedule-table-wrap"><table className="schedule-table history-table"><caption className="sr-only">Analytics runs</caption><thead><tr>{['Created / origin','Type / outcome','New','Updated','Unchanged','Attention','Recorded activity','Action'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{report.items.map(r=><tr key={r.id}><td data-label="Created / origin">{formatLocal(r.created_at)}<small>{title(r.origin)}</small></td><td data-label="Type / outcome">{title(r.target_kind)}<small>{runLabel({id:r.id,created_at:r.created_at,state:r.state,target_kind:r.target_kind,presentation:r.presentation})}</small></td>{(['added','updated','unchanged'] as const).map(k=><td key={k} data-label={title(k)}>{amount(r.leads[k])}</td>)}<td data-label="Attention">{r.sources_attention} sources · {r.route_gaps} gaps<small>{amount(r.candidates_attention)} candidates</small></td><td data-label="Recorded activity">{duration(r.timing.recorded_activity_ms)}<small>{title(r.timing.completeness)}</small></td><td data-label="Action"><button type="button" className="text-button" onClick={()=>onView(r.id)}>View run</button></td></tr>)}</tbody></table></div>
   <div className="admin-inline"><button type="button" className="text-button" disabled={busy||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous runs</button><span>Page {Math.floor(shownOffset.current/25)+1} · {report.total} runs</span><button type="button" className="text-button" disabled={busy||report.next_offset===null} onClick={()=>setOffset(report.next_offset??0)}>Next runs</button></div>
   </section></>}
 </section>;
}
