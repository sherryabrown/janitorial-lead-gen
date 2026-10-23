import {chicagoDate} from './history-search';
import {metricLabels} from './metric-scope';
import {MetricLink} from './MetricLink';
import {useOwnedRead} from './read-owner';
import {ReadAction} from './ReadAction';
import {useEffect,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {HistoryScheduleFilter} from './HistoryScheduleFilter';
import {InfoTooltip} from '../shared/components/InfoTooltip';
import {duration,formatLocal,title,readFailure} from './model';
import type {County,Usage} from './types';
export type Metric={value:number|null;known_subtotal:number;completeness:string;reason?:string};
type Outcomes=Record<'added'|'updated'|'unchanged',Metric>;
export type AnalyticsReport={unavailable?:string;as_of:string;snapshot:string;total:number;
 filters:{from:string;through:string;[key:string]:string};coverage:{first_run:string|null;last_run:string|null;verified_identity_runs:number;total_runs:number};
 summary:{runs:number;unique_leads:Metric;outcomes:Outcomes;run_events:Outcomes;categories:Record<'forecast'|'opportunity'|'award',Metric>;historical_opportunities:Metric;unclassified_known_leads:number;candidates_attention:Metric;validation_failures:Metric;sources_attention:number;route_gaps:number;
 timing:{average_ms:number|null;median_ms:number|null;samples:number;excluded:number;recorded_activity_unavailable?:boolean};usage:Usage};
};
const amount=(m:Metric)=>m.completeness==='not_applicable'?'Not applicable':m.value!==null?String(m.value):`Unknown · ${m.known_subtotal} known`;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(n);
export function AnalyticsSummary({report,compact=false}:{report:AnalyticsReport;compact?:boolean}){
 const s=report.summary;
 const linked=(metric:string,m:Metric|number|undefined)=>{if(m==null)return <>Unknown</>;const n=typeof m==='number'?m:m.completeness==='not_applicable'?null:m.value??(m.known_subtotal>0?m.known_subtotal:null);return <MetricLink scope={{metric,label:`${compact?'Schedule totals':'Report'} · ${metricLabels[metric]} · ${compact?'All-time':report.filters.from+' to '+report.filters.through}`,filters:{...report.filters,as_of:report.as_of,snapshot:report.snapshot}}} value={n}>{typeof m==='number'?m:amount(m)}</MetricLink>;};
 return <section className="analytics-summary" aria-label="Validated result metrics">
  <h3>{compact?'All-time available results':'Validated results'} <InfoTooltip label="About lead metrics">Distinct verified lead IDs. New takes precedence over updated, then unchanged. Category totals can overlap when a lead changes category. Unknown values show only the known subtotal.</InfoTooltip></h3>
  <>
   <dl className="schedule-facts analytics-facts compact-result-metrics">{(['added','updated','unchanged'] as const).map(k=><div key={k}><dt>{k==='added'?'New leads':k==='updated'?'Updated leads':'Unchanged matches'}</dt><dd>{linked(k,s.outcomes[k])}</dd></div>)}<div><dt>Validation issues</dt><dd>{linked('candidates_attention',s.candidates_attention)}</dd></div></dl>
   <div className="result-category-links">{(['forecast','opportunity','award'] as const).map(k=><span key={k}>{title(k)} {linked(k,s.categories[k])}</span>)}<InfoTooltip label="About category totals">Categories may overlap across runs. Distinct lead IDs; not additional leads.</InfoTooltip></div>
   {compact&&<div className="result-issue-metrics"><span>Source collection issues {linked('sources_attention',s.sources_attention)}</span><span>Unmapped routes {linked('route_gaps',s.route_gaps)}</span><span>Validation failures {linked('validation_failures',s.validation_failures)} <InfoTooltip label="About validation issues">Failures are a subset of validation issues. Source issues and route gaps are separate; do not add these counts together.</InfoTooltip></span></div>}
   <details><summary>Distinct totals and coverage</summary><div>Distinct leads {linked('unique_leads',s.unique_leads)}</div><div>Historical opportunities {linked('historical_opportunities',s.historical_opportunities)}</div><div>Unclassified known leads {linked('unclassified_known_leads',s.unclassified_known_leads)}</div></details>
  </>
  <small>Identity coverage · {report.coverage.verified_identity_runs} / {report.coverage.total_runs} runs · {report.coverage.first_run?formatLocal(report.coverage.first_run):'No saved runs'} – {report.coverage.last_run?formatLocal(report.coverage.last_run):'—'}</small>
  {!compact&&<>
   <section className="analytics-block"><h3>Processing & attention <InfoTooltip label="About processing and attention">Run events count a lead again when a later run processes it. They are separate from distinct lead totals. Validation failures are a subset of actionable candidates. Source attention counts distinct registered sources; unmapped routes are separate gaps.</InfoTooltip></h3>
   <dl className="schedule-facts analytics-facts">{(['added','updated','unchanged'] as const).map(k=><div key={k}><dt>{title(k)} run events</dt><dd>{amount(s.run_events[k])}</dd></div>)}<div><dt>Validation failures</dt><dd>{linked('validation_failures',s.validation_failures)}</dd></div><div><dt>Source collection issues</dt><dd>{linked('sources_attention',s.sources_attention)}</dd></div><div><dt>Unmapped route gaps</dt><dd>{linked('route_gaps',s.route_gaps)}</dd></div></dl></section>
   <section className="analytics-block"><h3>AI usage <InfoTooltip label="About analytics AI usage">Ledger event dates, for matching runs. A category filter selects whole runs requesting that category; costs are not allocated to categories. Unknown credits are not zero. Held amounts are reservations, not actual spending.</InfoTooltip></h3><small>Ledger event date · America/Chicago</small><dl className="schedule-facts analytics-facts"><div><dt>AI</dt><dd>{s.usage.ai==='not_used'?'Not used':title(s.usage.ai)}</dd></div><div><dt>Credits</dt><dd>{s.usage.ai==='not_used'?'Not used':s.usage.credits!=null?`${s.usage.credits} ${s.usage.credit_unit}`:'Unknown / not comparable'}</dd></div><div><dt>Input / output tokens</dt><dd>{s.usage.input_tokens??'Unknown'} / {s.usage.output_tokens??'Unknown'}</dd></div><div><dt>Actual spend</dt><dd>{s.usage.actual_usd===null?'Unknown':money(s.usage.actual_usd)}</dd></div><div><dt>Known spend subtotal</dt><dd>{money(s.usage.known_actual_usd)}</dd></div><div><dt>Held reservation</dt><dd>{money(s.usage.held_usd)}</dd></div></dl></section>
   <section className="analytics-block"><h3>Run timing <InfoTooltip label="About analytics timing">Average and median use reliable created-to-finished boundaries for completed or cancelled runs only. Recorded activity is the union of completed step intervals; it is not end-to-end execution time.</InfoTooltip></h3><dl className="schedule-facts analytics-facts"><div><dt>Average created to finished</dt><dd>{duration(s.timing.average_ms)}</dd></div><div><dt>Median created to finished</dt><dd>{duration(s.timing.median_ms)}</dd></div><div><dt>Reliable samples / excluded</dt><dd>{s.timing.samples} / {s.timing.excluded}</dd></div></dl>{s.timing.recorded_activity_unavailable&&<small>Recorded activity unavailable for this selection; view run logs.</small>}</section>
  </>}
 </section>;
}
export function ScheduleAnalyticsSummary({id,active=true}:{id:string;active?:boolean}){
 const [report,setReport]=useState<AnalyticsReport|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(true);
 useEffect(()=>{if(!active){setBusy(false);return;}const a=new AbortController();setBusy(true);setError('');void workflowRequest<AnalyticsReport>(`/v1/admin/analytics?${new URLSearchParams({schedule:id,period:'all',limit:'1'})}`,{signal:a.signal}).then(r=>{if(r.unavailable)throw Error(r.unavailable);if(!r.summary||!r.coverage)throw Error('Reporting data is unavailable.');if(!a.signal.aborted)setReport(r);}).catch(e=>{if(!a.signal.aborted)setError(readFailure(e,'Schedule totals'));}).finally(()=>{if(!a.signal.aborted)setBusy(false);});return()=>a.abort();},[id,revision,active]);
 const read=()=>setRevision(n=>n+1),owned=useOwnedRead('totals',{busy,error,loaded:!!report},read,active);
 return <section className="schedule-results">{!owned&&<ReadAction scope="totals" busy={busy} error={!!error} loaded={!!report} onRead={read}/>} {error&&<p role="alert">{error}</p>}{report?<AnalyticsSummary report={report} compact/>:busy?<p role="status">Loading available totals…</p>:null}</section>;

}
const defaults={schedule:'',target:'',geography:'',origin:'',category:'',from:'',through:''};
function restored(key:string){try{const saved=JSON.parse(sessionStorage.getItem(key)??'{}');return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,typeof saved[k]==='string'&&saved[k].length<=100?saved[k]:v])) as typeof defaults;}catch{return defaults;}}
export function Analytics({owner,counties}:{owner:string;counties:County[]}){
 const key=`spin-admin-stats-filter:${owner}`;
 const [filters,setFilters]=useState(()=>restored(key)),[report,setReport]=useState<AnalyticsReport|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[choicesError,setChoicesError]=useState(''),[choicesBusy,setChoicesBusy]=useState(false),[choiceRevision,setChoiceRevision]=useState(0);
 const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v)).toString();
 useEffect(()=>{const a=new AbortController();setBusy(true);setError('');const q=new URLSearchParams(query);q.set('limit','1');
  void workflowRequest<AnalyticsReport>(`/v1/admin/analytics?${q}`,{signal:a.signal}).then(r=>{if(r.unavailable)throw Error(r.unavailable);if(!r.summary||!r.coverage)throw Error('Reporting data is unavailable.');if(!a.signal.aborted){setReport(r);}}).catch(e=>{if(!a.signal.aborted){if(/snapshot|consistent report|results changed/i.test(e.message)){setReport(null);setError(e.message);}else setError(readFailure(e,'Stats'));}}).finally(()=>{if(!a.signal.aborted)setBusy(false);});return()=>a.abort();
 },[query,revision]);
 const change=(k:keyof typeof defaults,v:string)=>{setReport(null);const next={...filters,[k]:v};setFilters(next);try{sessionStorage.setItem(key,JSON.stringify(next));}catch{/* Mounted state remains available. */}};
 const refresh=()=>{if(choicesError)setChoiceRevision(n=>n+1);if(error||!choicesError){setRevision(n=>n+1);}};
 return <section className="admin-section analytics" aria-label="Stats and analytics" aria-busy={busy}>
  <div className="admin-section-heading"><h2>Stats / analytics</h2></div>
  <ReadAction scope="stats" busy={busy||choicesBusy} loaded={!!report} error={!!error||!!choicesError} onRead={refresh}/>
  <div className="schedule-filters analytics-filters"><label>Reporting period<select value={filters.from||filters.through?'custom':'7'} onChange={e=>{if(e.target.value==='7'){setReport(null);setFilters(f=>({...f,from:'',through:''}));try{sessionStorage.setItem(key,JSON.stringify({...filters,from:'',through:''}));}catch{/* Mounted period remains. */}}else{const today=chicagoDate();change('from',today);}}}><option value="7">Last 7 days</option><option value="custom">Custom dates</option></select></label>
   {(filters.from||filters.through)&&<><label>From · CT<input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/></label><label>Through · CT<input type="date" value={filters.through} onChange={e=>change('through',e.target.value)}/></label></>}
   <HistoryScheduleFilter value={filters.schedule} onChange={v=>change('schedule',v)} refreshSignal={choiceRevision} onReadError={setChoicesError} onReadBusy={setChoicesBusy}/>
   <label>Type<select value={filters.target} onChange={e=>change('target',e.target.value)}><option value="">All types</option><option value="county_scope">Counties</option><option value="state_source">State sources</option><option value="sam">SAM.gov</option></select></label>
  </div><details className="settings-more-filters"><summary>More filters{[filters.geography,filters.category,filters.origin].filter(Boolean).length?` · ${[filters.geography,filters.category,filters.origin].filter(Boolean).length} applied`:""}</summary><div className="schedule-filters">
   <label>Geography<select value={filters.geography} onChange={e=>change('geography',e.target.value)}><option value="">All geography</option><option value="05">Statewide</option>{counties.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Lead category<select value={filters.category} onChange={e=>change('category',e.target.value)}><option value="">All categories</option>{['forecast','opportunity','award'].map(c=><option key={c} value={c}>{title(c)}</option>)}</select></label>
   <label>Origin<select value={filters.origin} onChange={e=>change('origin',e.target.value)}><option value="">All origins</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option></select></label>
  </div></details>
  {busy&&<p role="status">Loading stats…</p>}{error&&<p role="alert">{error}</p>}
  {report&&<><small className="run-history-caption">{report.filters.from} – {report.filters.through} · America/Chicago · As of {formatLocal(report.as_of)} · Run creation dates · {report.total} runs</small>
   <AnalyticsSummary report={report}/>
  </>}
 </section>;
}
