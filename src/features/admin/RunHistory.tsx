import {useSchedulingRole} from './scheduling-role';
import {InfoTooltip} from '../shared/components/InfoTooltip';
import {OccurrenceSnapshot,type ActivityOccurrence} from './OccurrenceSnapshot';
import {historyDefaults,historyDateError,readHistorySearch,saveHistorySearch,type HistoryFilters} from './history-search';
import {RunLeadCount} from './MetricLink';
import {useOwnedRead} from './read-owner';
import {ReadAction} from './ReadAction';
import {useCallback,useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {attemptNextAction,duration,formatLocal,runLabel,title,readFailure} from './model';
import type {County,Page,Run} from './types';
import {HistoryScheduleFilter} from './HistoryScheduleFilter';
type ActivityRun=Run&{activity_kind?:string;activity_at?:string;clock_basis?:string;occurrence?:ActivityOccurrence|null};
type ActivityPage=Page<ActivityRun>&{as_of?:string};
type SavedActivity={id:string;kind:string;activity_at:string;clock_basis:string;run:Run|null;occurrence:ActivityOccurrence|null};
const defaults=historyDefaults;
function storedChoice(key:string,choices:string[]){try{const value=sessionStorage.getItem(key)??'';return choices.includes(value)?value:'';}catch{return '';}}
function restored(key:string){try{const data=JSON.parse(sessionStorage.getItem(key)??'{}');return Object.fromEntries(Object.keys(defaults).map(k=>[k,typeof data[k]==='string'&&data[k].length<=100?data[k]:''])) as typeof defaults;}catch{return defaults;}}
function RunHistoryContent({entryId,submittedSearch,owner='',scheduleId,counties=[],onView,onSchedule,refreshSignal=0,active=true}:{entryId?:string;submittedSearch:boolean;active?:boolean;owner?:string;scheduleId?:string;counties?:County[];onView:(id:string,section?:'overview'|'logs'|'sources')=>void;onSchedule?:(id:string)=>void;refreshSignal?:number}){
 const role=useSchedulingRole();
 const key=`spin-admin-history-filter:${owner}:${scheduleId??'all'}`;
 const searchKey=entryId?`spin-admin-history-search:${owner}:${entryId}`:undefined;
 const [initial]=useState(()=>submittedSearch?readHistorySearch(searchKey):{draft:restored(key),applied:null,loaded:0});
 const [filters,setFilters]=useState<HistoryFilters>(initial.draft),[applied,setApplied]=useState<HistoryFilters|null>(initial.applied),[validation,setValidation]=useState(''),[page,setPage]=useState<ActivityPage>({items:[],next_offset:null}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[choiceRevision,setChoiceRevision]=useState(0),[choicesError,setChoicesError]=useState(''),[choicesBusy,setChoicesBusy]=useState(false);
 const [kind,setKind]=useState(()=>storedChoice(key+':kind',['','run','attempt'])),[attemptState,setAttemptState]=useState(()=>storedChoice(key+':attempt',['','queued','skipped','blocked']));
 const boundary=useRef('');
 const endpoint=scheduleId?`/v1/schedules/${scheduleId}/activity`:'/v1/admin/history';
 const requestPage=useCallback(async(p:URLSearchParams,signal:AbortSignal):Promise<ActivityPage>=>{
  if(!scheduleId)return workflowRequest<ActivityPage>(`${endpoint}?${p}`,{signal});
  p.delete('schedule');if(kind)p.set('kind',kind);if(attemptState)p.set('attempt_state',attemptState);if(boundary.current)p.set('as_of',boundary.current);
  const result=await workflowRequest<Page<SavedActivity>&{as_of:string}>(`${endpoint}?${p}`,{signal});if(signal.aborted)throw new DOMException('Aborted','AbortError');boundary.current=result.as_of;
  return {...result,items:result.items.map(a=>({...a.run,id:a.run?.id??a.id,state:a.run?.state??a.occurrence?.state??'unavailable',created_at:a.activity_at,target_kind:a.run?.target_kind??'',activity_kind:a.kind,activity_at:a.activity_at,clock_basis:a.clock_basis,occurrence:a.occurrence}))};
 },[scheduleId,endpoint,kind,attemptState]);
 const failedPage=useRef(false),generation=useRef(0),pending=useRef(false),pagingController=useRef<AbortController|null>(null),loaded=useRef(initial.loaded||(()=>{try{const n=Number(sessionStorage.getItem(key.replace('history-filter','history-page')));return Number.isInteger(n)&&n>=50&&n<=5000?n:50;}catch{return 50;}})());
 const draftRef=useRef(filters);draftRef.current=filters;
 const selected=submittedSearch?applied:filters;
 const dirty=submittedSearch&&JSON.stringify(filters)!==JSON.stringify(applied);
 const params=()=>{const q=new URLSearchParams();for(const [k,v] of Object.entries({...selected,...(scheduleId?{schedule:scheduleId}:{})}))if(v)q.set(k,v);return q;};
 const query=selected?params().toString():null,automaticRefresh=submittedSearch?0:refreshSignal;
 useEffect(()=>{if(submittedSearch)saveHistorySearch(searchKey,filters,applied,loaded.current);},[submittedSearch,searchKey,filters,applied]);
 useEffect(()=>{
  if(!active||query===null){setBusy(false);pending.current=false;return;}
  boundary.current='';const abort=new AbortController(),epoch=++generation.current;pending.current=true;setBusy(true);setError('');
  void (async()=>{
   const result:ActivityPage={items:[],next_offset:0};
   do{const p=new URLSearchParams(query);if(result.next_offset)p.set('offset',String(result.next_offset));const next=await requestPage(p,abort.signal);result.items.push(...next.items.filter(r=>!result.items.some(old=>old.id===r.id)));result.next_offset=next.next_offset;result.total=next.total;}while(result.next_offset!==null&&result.next_offset<loaded.current);
   if(!abort.signal.aborted){failedPage.current=false;setPage(result);}
  })().catch(e=>{if(!abort.signal.aborted)setError(readFailure(e,'Run history'));}).finally(()=>{if(!abort.signal.aborted){setBusy(false);pending.current=false;}});
  return()=>{abort.abort();pagingController.current?.abort();generation.current=epoch+1;pending.current=false;};
 },[query,revision,automaticRefresh,active,requestPage]);
 const change=(k:keyof HistoryFilters,v:string)=>{
  if(filters[k]===v)return;setValidation('');const next={...filters,[k]:v};setFilters(next);
  if(submittedSearch)return;
  generation.current++;failedPage.current=false;loaded.current=50;setPage({items:[],next_offset:null});
  try{sessionStorage.setItem(key,JSON.stringify(next));sessionStorage.removeItem(key.replace('history-filter','history-page'));}catch{/* Mounted filters remain. */}
 };
 const changeActivity=(field:'kind'|'attempt',value:string)=>{generation.current++;failedPage.current=false;loaded.current=50;setPage({items:[],next_offset:null});if(field==='kind')setKind(value);else setAttemptState(value);try{sessionStorage.setItem(key+':'+field,value);sessionStorage.removeItem(key.replace('history-filter','history-page'));}catch{/* Mounted filters remain. */}};
 const submit=()=>{
  if(pending.current)return;const invalid=historyDateError(filters);setValidation(invalid);if(invalid)return;
  pending.current=true;failedPage.current=false;loaded.current=50;setPage({items:[],next_offset:null});setError('');setApplied({...filters});setRevision(n=>n+1);
 };
 const more=async()=>{
  if(pending.current||page.next_offset===null)return;pending.current=true;setBusy(true);setError('');const epoch=generation.current,offset=page.next_offset,p=params(),abort=new AbortController();pagingController.current=abort;p.set('offset',String(offset));
  try{const next=await requestPage(p,abort.signal);if(epoch===generation.current){failedPage.current=false;loaded.current=submittedSearch?Math.max(loaded.current,offset+50):page.items.length+next.items.length;if(submittedSearch)saveHistorySearch(searchKey,draftRef.current,applied,loaded.current);else try{sessionStorage.setItem(key.replace('history-filter','history-page'),String(loaded.current));}catch{/* Mounted pages remain. */}setPage(old=>({...next,items:[...old.items,...next.items.filter(r=>!old.items.some(o=>o.id===r.id))]}));}}
  catch(e){if(!abort.signal.aborted&&epoch===generation.current){failedPage.current=true;setError(readFailure(e,'More runs'));}}finally{if(epoch===generation.current){setBusy(false);pending.current=false;}}
 };
 const read=()=>{if(choicesError)setChoiceRevision(n=>n+1);if(error&&failedPage.current){void more();}else if(error||!choicesError)setRevision(n=>n+1);};
 const owned=useOwnedRead('runs',{busy:busy||choicesBusy,error:error||choicesError,loaded:page.items.length>0},read,active&&!submittedSearch);
 return <section className="admin-section" aria-label={scheduleId?'Schedule runs':'Run history'}>
  <div className="admin-section-heading"><h3>{scheduleId?'Runs / execution attempts':'Run history'}</h3></div>
  {!submittedSearch&&!owned&&<ReadAction scope="history" busy={busy||choicesBusy} loaded={page.items.length>0} error={!!error||!!choicesError} onRead={read}/>}
  <form onSubmit={e=>{e.preventDefault();if(submittedSearch)submit();}} aria-label="History filters" noValidate>
  <div className="schedule-filters">
   {!scheduleId&&<HistoryScheduleFilter value={filters.schedule} onChange={value=>change('schedule',value)} refreshSignal={choiceRevision} onReadError={setChoicesError} onReadBusy={setChoicesBusy}/>}
   <label>Run outcome<select value={filters.outcome} onChange={e=>change('outcome',e.target.value)}><option value="">All outcomes</option>{['pending','running','completed','partial','needs_review','outcome_unknown','cancelled'].map(s=><option value={s} key={s}>{title(s)}</option>)}</select></label>
   <label>From · CT<input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/></label><label>Through · CT<input type="date" value={filters.through} onChange={e=>change('through',e.target.value)}/></label>
  </div><details className="settings-more-filters"><summary>More filters{[filters.run,filters.target,filters.geography,filters.origin].filter(Boolean).length?` · ${[filters.run,filters.target,filters.geography,filters.origin].filter(Boolean).length} applied`:""}</summary><div className="schedule-filters">
   {scheduleId&&<><label>Activity<select value={kind} onChange={e=>changeActivity('kind',e.target.value)}><option value="">All activity</option><option value="run">Runs</option><option value="attempt">Attempts without a run</option></select></label><label>Attempt state<select value={attemptState} onChange={e=>changeActivity('attempt',e.target.value)}><option value="">All attempt states</option><option value="queued">Queued</option><option value="skipped">Skipped</option><option value="blocked">Blocked</option></select></label><InfoTooltip label="About activity filters">Run outcome, ID, type, geography and origin filters select real runs only. Attempt state selects attempts without a readable run. Dates use the displayed row time, in America/Chicago.</InfoTooltip></>}
   <label>Run ID<input value={filters.run} onChange={e=>change('run',e.target.value)}/></label>
   <label>Run type<select value={filters.target} onChange={e=>change('target',e.target.value)}><option value="">All types</option><option value="county_scope">Counties</option><option value="state_source">State source</option><option value="sam">SAM</option></select></label>
   <label>Run geography<select value={filters.geography} onChange={e=>change('geography',e.target.value)}><option value="">All geography</option><option value="05">Statewide</option>{counties.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
   <label>Origin<select value={filters.origin} onChange={e=>change('origin',e.target.value)}><option value="">All origins</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option></select></label>
  </div></details>
  {submittedSearch&&<div className="history-search-actions"><button type="submit" className="primary-button compact" disabled={busy} aria-label="Submit history">{busy?'Loading…':'Submit'}</button>{(error||choicesError)&&<button type="button" className="text-button" disabled={busy||choicesBusy} aria-label="Retry history" onClick={read}>Retry {applied?'submitted search':'schedule choices'}</button>}</div>}
  </form>
  {validation&&<p role="alert">{validation}</p>}
  {submittedSearch&&(!applied||dirty)&&<p role="status">{applied?'Filters changed. Submit to view these results.':'Set filters, then Submit to view results.'}</p>}
  {selected&&<small className="run-history-caption">Newest first · {scheduleId?'Displayed activity date':'Run creation date'} · America/Chicago · {page.total??'Unknown'} matching {scheduleId?'activity rows':'runs'}{submittedSearch?` · Submitted ${applied?.from} – ${applied?.through}`:''}</small>}
  {!scheduleId&&selected?.schedule&&selected.schedule!=='none'&&onSchedule&&<button type="button" className="text-button" onClick={()=>onSchedule(selected!.schedule)}>View schedule occurrences and changes</button>}
  {busy&&<p role="status">Loading runs…</p>}{error&&<p role="alert">{error}</p>}
  {!!selected&&!dirty&&!busy&&!error&&!page.items.length&&<p>No matching runs.</p>}
  {selected&&!dirty&&<><div className="schedule-table-wrap"><table className="schedule-table history-table"><caption className="sr-only">Saved execution history</caption><thead><tr>{(scheduleId?['Run date / origin','Outcome','Validated leads','Recorded activity',...(role.technical_details?['AI usage']:[]),'Details']:['Schedule','Scope / origin','Created / finished','Outcome','Validated leads','Recorded activity']).map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{page.items.map(r=><tr key={r.id}>
   {scheduleId?<td data-label="Run date / ID / origin">{r.activity_kind==='run'?<><button type="button" className="text-button" aria-label={`${formatLocal(r.created_at)} — Run ${r.id}`} onClick={()=>onView(r.id,'overview')}>{formatLocal(r.created_at)}</button><small>{title(r.origin)}</small></>:<>{formatLocal(r.created_at)}<small>{r.activity_kind==='unavailable_run'?'Saved run unavailable':'No run created'}</small><small>{r.clock_basis}</small></>}</td>:<>
   <td data-label="Schedule / Run ID"><button type="button" className="text-button" aria-label={r.schedule_name||r.schedule_id?`${r.schedule_name??'Schedule name unavailable'} — Run ${r.id}`:undefined} onClick={()=>onView(r.id,'overview')}>{r.schedule_name??(r.schedule_id?'Schedule name unavailable':`Run ${r.id}`)}</button><small>{r.schedule_name||r.schedule_id?`Run ${r.id}`:'Standalone'}</small></td>
   <td data-label="Scope / origin">{title(r.target_kind)}<small>{r.config?.target_kind==='sam'?'Arkansas statewide':r.config?.counties?.map(c=>c.name).join(', ')||'Saved scope in details'}</small><small>{title(r.origin)}</small></td>
   <td data-label="Created / finished">{formatLocal(r.created_at)}<small>{r.finished_at?formatLocal(r.finished_at):'Finish unknown'}</small></td>
   </>}
   <td data-label="Outcome">{!scheduleId||r.activity_kind==='run'?runLabel(r):<>{title(r.state)}{r.occurrence?.reason&&<small>{title(r.occurrence.reason)}</small>}<small>{r.activity_kind==='unavailable_run'?'Refresh saved activity; the linked run could not be read.':attemptNextAction(r.occurrence?.reason)}</small></>}</td><td data-label="Validated leads">{r.leads?.completeness==='known'?<>{(['added','updated','unchanged'] as const).map(k=><span key={k}><RunLeadCount id={r.id} snapshot={r.identity_snapshot} metric={k} value={r.leads?.[k]} identity={r.leads?.identities!==false}>{r.leads?.[k]} {k==='added'?'new':k}</RunLeadCount>{' '}</span>)}</>:scheduleId&&r.activity_kind!=='run'?'—':r.leads?.completeness==='not_applicable'?'Not applicable':'Unknown'}</td>
   <td data-label="Recorded activity">{scheduleId&&r.activity_kind!=='run'?'\u2014':duration(r.timing?.recorded_activity_ms)}{(!scheduleId||r.activity_kind==='run')&&<small>{r.timing?.reason??(r.timing?.completeness==='partial'?'Partial recorded intervals':'Completed step intervals')}</small>}</td>
   {scheduleId&&role.technical_details&&<td data-label="AI usage">{r.activity_kind!=='run'?'—':<>{r.usage?.ai==='not_used'?'Not used':r.usage?.ai==='used'?'Used':'Unknown'}<small>{r.usage?.actual_usd!=null?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(r.usage.actual_usd):'Cost unknown'}</small><details><summary>Usage details</summary><dl className="admin-facts"><dt>Input tokens</dt><dd>{r.usage?.input_tokens??'Unknown'}</dd><dt>Output tokens</dt><dd>{r.usage?.output_tokens??'Unknown'}</dd><dt>Credits</dt><dd>{r.usage?.credits!=null?`${r.usage.credits} ${r.usage.credit_unit??''}`:'Unknown'}</dd><dt>Known cost</dt><dd>{r.usage?.known_actual_usd??'Unknown'}</dd><dt>Reserved</dt><dd>{r.usage?.held_usd??'Unknown'}</dd></dl></details></>}</td>}
   {scheduleId&&<td data-label="Details">{r.occurrence?<OccurrenceSnapshot occurrence={r.occurrence}/>:<span>No dispatch snapshot</span>}</td>}

  </tr>)}</tbody></table></div>
  {page.next_offset!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void more()}>More runs</button>}</>}
 </section>;
}

// Scope changes reset mounted state; browser Back keeps the same owner/entry key.
export function RunHistory(props:Omit<Parameters<typeof RunHistoryContent>[0],'submittedSearch'>&{submittedSearch?:boolean}){
 return <RunHistoryContent key={`${props.owner??''}:${props.scheduleId??'all'}:${props.entryId??'fresh'}`} {...props} submittedSearch={props.submittedSearch??!props.scheduleId}/>;
}
