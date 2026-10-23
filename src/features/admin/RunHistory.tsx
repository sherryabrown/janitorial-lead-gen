import {RunLeadCount} from './MetricLink';
import {useOwnedRead} from './read-owner';
import {ReadAction} from './ReadAction';
import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {duration,formatLocal,runLabel,title,readFailure} from './model';
import type {County,Page,Run} from './types';
import {HistoryScheduleFilter} from './HistoryScheduleFilter';
const defaults={schedule:'',run:'',target:'',geography:'',origin:'',outcome:'',from:'',through:''};
function restored(key:string){try{const data=JSON.parse(sessionStorage.getItem(key)??'{}');return Object.fromEntries(Object.keys(defaults).map(k=>[k,typeof data[k]==='string'&&data[k].length<=100?data[k]:''])) as typeof defaults;}catch{return defaults;}}
export function RunHistory({owner='',scheduleId,counties=[],onView,onSchedule,refreshSignal=0,active=true}:{active?:boolean;owner?:string;scheduleId?:string;counties?:County[];onView:(id:string,section?:'overview'|'logs'|'sources')=>void;onSchedule?:(id:string)=>void;refreshSignal?:number}){
 const key=`spin-admin-history-filter:${owner}:${scheduleId??'all'}`;
 const [filters,setFilters]=useState(()=>restored(key)),[page,setPage]=useState<Page<Run>>({items:[],next_offset:null}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[choiceRevision,setChoiceRevision]=useState(0),[choicesError,setChoicesError]=useState(''),[choicesBusy,setChoicesBusy]=useState(false);
 const failedPage=useRef(false),generation=useRef(0),pending=useRef(false),loaded=useRef((()=>{try{const n=Number(sessionStorage.getItem(key.replace('history-filter','history-page')));return Number.isInteger(n)&&n>=50&&n<=5000?n:50;}catch{return 50;}})());
 const params=()=>{const q=new URLSearchParams();for(const [k,v] of Object.entries({...filters,...(scheduleId?{schedule:scheduleId}:{})}))if(v)q.set(k,v);return q;};
 const query=params().toString();
 useEffect(()=>{
  if(!active){setBusy(false);return;}
  const abort=new AbortController(),epoch=++generation.current;pending.current=true;setBusy(true);setError('');
  void (async()=>{
   const result:Page<Run>={items:[],next_offset:0};
   do{const p=new URLSearchParams(query);if(result.next_offset)p.set('offset',String(result.next_offset));const next=await workflowRequest<Page<Run>>(`/v1/admin/history${p.size?'?'+p:''}`,{signal:abort.signal});result.items.push(...next.items);result.next_offset=next.next_offset;result.total=next.total;}while(result.next_offset!==null&&result.next_offset<loaded.current);
   if(!abort.signal.aborted)setPage(result);
  })().catch(e=>{if(!abort.signal.aborted)setError(readFailure(e,'Run history'));}).finally(()=>{if(!abort.signal.aborted){setBusy(false);pending.current=false;}});
  return()=>{abort.abort();generation.current=epoch+1;};
 },[query,revision,refreshSignal,active]);
 const change=(k:keyof typeof defaults,v:string)=>{if(filters[k]===v)return;generation.current++;failedPage.current=false;loaded.current=50;setPage({items:[],next_offset:null});const next={...filters,[k]:v};setFilters(next);try{sessionStorage.setItem(key,JSON.stringify(next));sessionStorage.removeItem(key.replace('history-filter','history-page'));}catch{/* Mounted filters remain. */}};
 const more=async()=>{
  if(pending.current||page.next_offset===null)return;pending.current=true;setBusy(true);setError('');const epoch=generation.current,p=params();p.set('offset',String(page.next_offset));
  try{const next=await workflowRequest<Page<Run>>(`/v1/admin/history?${p}`);if(epoch===generation.current){failedPage.current=false;loaded.current=page.items.length+next.items.length;try{sessionStorage.setItem(key.replace('history-filter','history-page'),String(loaded.current));}catch{/* Mounted pages remain. */}setPage(old=>({...next,items:[...old.items,...next.items.filter(r=>!old.items.some(o=>o.id===r.id))]}));}}
  catch(e){if(epoch===generation.current){failedPage.current=true;setError(readFailure(e,'More runs'));}}finally{if(epoch===generation.current){setBusy(false);pending.current=false;}}
 };
 const read=()=>{if(choicesError)setChoiceRevision(n=>n+1);if(error&&failedPage.current){void more();}else if(error||!choicesError)setRevision(n=>n+1);};
 const owned=useOwnedRead('runs',{busy:busy||choicesBusy,error:error||choicesError,loaded:page.items.length>0},read,active);
 return <section className="admin-section" aria-label={scheduleId?'Schedule runs':'Run history'}>
  <div className="admin-section-heading"><h3>{scheduleId?'Runs':'Run history'}</h3></div>
  {!owned&&<ReadAction scope="history" busy={busy||choicesBusy} loaded={page.items.length>0} error={!!error||!!choicesError} onRead={read}/>}
  <div className="schedule-filters">
   {!scheduleId&&<HistoryScheduleFilter value={filters.schedule} onChange={value=>change('schedule',value)} refreshSignal={choiceRevision} onReadError={setChoicesError} onReadBusy={setChoicesBusy}/>}
   <label>Run outcome<select value={filters.outcome} onChange={e=>change('outcome',e.target.value)}><option value="">All outcomes</option>{['pending','running','completed','partial','needs_review','outcome_unknown','cancelled'].map(s=><option value={s} key={s}>{title(s)}</option>)}</select></label>
   <label>From · CT<input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/></label><label>Through · CT<input type="date" value={filters.through} onChange={e=>change('through',e.target.value)}/></label>
  </div><details className="settings-more-filters"><summary>More filters{[filters.run,filters.target,filters.geography,filters.origin].filter(Boolean).length?` · ${[filters.run,filters.target,filters.geography,filters.origin].filter(Boolean).length} applied`:""}</summary><div className="schedule-filters">
   <label>Run ID<input value={filters.run} onChange={e=>change('run',e.target.value)}/></label>
   <label>Run type<select value={filters.target} onChange={e=>change('target',e.target.value)}><option value="">All types</option><option value="county_scope">Counties</option><option value="state_source">State source</option><option value="sam">SAM</option></select></label>
   <label>Run geography<select value={filters.geography} onChange={e=>change('geography',e.target.value)}><option value="">All geography</option><option value="05">Statewide</option>{counties.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
   <label>Origin<select value={filters.origin} onChange={e=>change('origin',e.target.value)}><option value="">All origins</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option></select></label>
  </div></details>
  <small className="run-history-caption">Newest first · Run creation date · America/Chicago · {page.total??'Unknown'} matching runs</small>
  {!scheduleId&&filters.schedule&&filters.schedule!=='none'&&onSchedule&&<button type="button" className="text-button" onClick={()=>onSchedule(filters.schedule)}>View schedule occurrences and changes</button>}
  {busy&&<p role="status">Loading runs…</p>}{error&&<p role="alert">{error}</p>}
  {!busy&&!error&&!page.items.length&&<p>No matching runs.</p>}
  <div className="schedule-table-wrap"><table className="schedule-table history-table"><caption className="sr-only">Saved execution history</caption><thead><tr>{(scheduleId?['Run ID / created / origin','Outcome','Validated leads','Recorded activity','AI usage']:['Run / schedule','Scope / origin','Created / finished','Outcome','Validated leads','Recorded activity']).map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{page.items.map(r=><tr key={r.id}>
   {scheduleId?<td data-label="Run ID / created / origin"><button type="button" className="text-button" onClick={()=>onView(r.id,'overview')}>Run {r.id}</button><small>{formatLocal(r.created_at)}</small><small>{title(r.origin)}</small></td>:<>
   <td data-label="Run / schedule"><button type="button" className="text-button" onClick={()=>onView(r.id,'overview')}>Run {r.id}</button><small>{r.schedule_name??(r.schedule_id?'Schedule name unavailable':'Standalone')}</small></td>
   <td data-label="Scope / origin">{title(r.target_kind)}<small>{r.config?.target_kind==='sam'?'Arkansas statewide':r.config?.counties?.map(c=>c.name).join(', ')||'Saved scope in details'}</small><small>{title(r.origin)}</small></td>
   <td data-label="Created / finished">{formatLocal(r.created_at)}<small>{r.finished_at?formatLocal(r.finished_at):'Finish unknown'}</small></td>
   </>}
   <td data-label="Outcome">{runLabel(r)}</td><td data-label="Validated leads">{r.leads?.completeness==='known'?<>{(['added','updated','unchanged'] as const).map(k=><span key={k}><RunLeadCount id={r.id} snapshot={r.identity_snapshot} metric={k} value={r.leads?.[k]} identity={r.leads?.identities!==false}>{r.leads?.[k]} {k==='added'?'new':k}</RunLeadCount>{' '}</span>)}</>:r.leads?.completeness==='not_applicable'?'Not applicable':'Unknown'}</td>
   <td data-label="Recorded activity">{duration(r.timing?.recorded_activity_ms)}<small>{r.timing?.reason??(r.timing?.completeness==='partial'?'Partial recorded intervals':'Completed step intervals')}</small></td>
   {scheduleId&&<td data-label="AI usage">{r.usage?.ai==='not_used'?'Not used':r.usage?.ai==='used'?'Used':'Unknown'}<small>{r.usage?.actual_usd!=null?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(r.usage.actual_usd):'Cost unknown'}</small><details><summary>Usage details</summary><dl className="admin-facts"><dt>Input tokens</dt><dd>{r.usage?.input_tokens??'Unknown'}</dd><dt>Output tokens</dt><dd>{r.usage?.output_tokens??'Unknown'}</dd><dt>Credits</dt><dd>{r.usage?.credits!=null?`${r.usage.credits} ${r.usage.credit_unit??''}`:'Unknown'}</dd><dt>Known cost</dt><dd>{r.usage?.known_actual_usd??'Unknown'}</dd><dt>Reserved</dt><dd>{r.usage?.held_usd??'Unknown'}</dd></dl></details></td>}

  </tr>)}</tbody></table></div>
  {page.next_offset!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void more()}>More runs</button>}
 </section>;
}
