import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {ActionMenu} from '../shared/components/ActionMenu';
import {ScheduleHistory} from './ScheduleHistory';
import {RunHistory} from './RunHistory';
import {formatLocal,recurrenceLabel,runLabel,title} from './model';
import type {AnySchedule,County} from './types';
export type ScheduleSection='overview'|'history'|'logs'|'geography'|'sources';
export function ScheduleDetail({id,initial,owner='',section,onSection,onClose,onView,onEdit,onAction,busy,counties=[]}:{
 id:string;initial?:AnySchedule;owner?:string;section:ScheduleSection;onSection:(s:ScheduleSection)=>void;onClose:()=>void;
 onView:(id:string,section?:'overview'|'logs'|'sources')=>void;onEdit:(s:AnySchedule)=>void;onAction:(s:AnySchedule,a:string)=>void;busy:boolean;counties?:County[];
}){
 const [schedule,setSchedule]=useState(initial),[error,setError]=useState(''),[revision,setRevision]=useState(0),[menu,setMenu]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null),body=useRef<HTMLElement>(null);
 useEffect(()=>{if(initial)setSchedule(initial);},[initial]);
 useEffect(()=>{const a=new AbortController();setError('');void workflowRequest<AnySchedule>(`/v1/schedules/${id}`,{signal:a.signal}).then(value=>{if(!value?.id||!value.config)throw Error('Saved schedule details are unavailable.');if(!a.signal.aborted)setSchedule(value);}).catch(e=>{if(!a.signal.aborted)setError(e.message);});return()=>a.abort();},[id,revision]);
 useEffect(()=>{heading.current?.focus();body.current?.scrollIntoView?.({block:'nearest'});},[id]);
 const current=schedule??initial,archived=!!current?.archived||!!current?.archived_at,r=current?.reporting?.last_run;
 return <section ref={body} className="admin-section schedule-detail" aria-label={`Schedule details: ${current?.name??id}`}>
  <div className="admin-section-heading"><h2 ref={heading} tabIndex={-1}>{current?.name??'Loading schedule…'}</h2><button type="button" className="text-button" onClick={onClose}>Close schedule details</button></div>
  {error&&<p role="alert">{error} <button type="button" className="text-button" onClick={()=>setRevision(n=>n+1)}>Retry schedule details</button></p>}
  {current&&<>
   <dl className="admin-facts"><dt>Scope</dt><dd>{current.config.target_kind==='sam'?'SAM · Arkansas statewide':`${current.config.target_kind==='state_source'?'Independent state source':'County'} · ${current.config.counties?.map(c=>c.name).join(', ')||current.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??id).join(', ')}`}</dd><dt>Status</dt><dd>{archived?'Archived':current.enabled?'Active':'Paused'}{current.blocker&&` · Needs action: ${title(current.blocker)}`}</dd><dt>Frequency</dt><dd>{recurrenceLabel(current)}</dd><dt>Next run</dt><dd>{archived?'Archived':current.next_due_at?formatLocal(current.next_due_at):current.enabled?'Unknown':'Paused'}</dd><dt>Last run</dt><dd>{r?`${formatLocal(r.created_at)} · ${runLabel(r)}`:current.reporting?'Never run':'Reporting unavailable'}</dd></dl>
   <div className="admin-inline"><button type="button" className="secondary-button compact" disabled={busy||archived} onClick={()=>onAction(current,'run-now')}>Run saved schedule now</button><button type="button" className="text-button" disabled={busy||archived} onClick={()=>onEdit(current)}>Edit schedule details</button><ActionMenu label={`Schedule controls for ${current.name}`} open={menu} onOpenChange={setMenu} actions={[
    {label:current.enabled?'Pause schedule':'Resume schedule',disabled:busy||archived||!!current.blocker&&!current.enabled,onSelect:()=>onAction(current,current.enabled?'pause':'resume')},
    {label:'Archive schedule',disabled:busy||archived,onSelect:()=>{if(window.confirm('Archive this schedule? Future scheduled work stops. Saved history remains; manual runs already started are not cancelled.'))onAction(current,'archive');}},
   ]}/><button type="button" className="text-button" onClick={()=>setRevision(n=>n+1)}>Refresh schedule details</button></div>
   <details><summary>Schedule identity</summary><dl className="admin-facts"><dt>ID</dt><dd>{current.id}</dd><dt>Version</dt><dd>{current.version}</dd><dt>Updated</dt><dd>{current.updated_at?formatLocal(current.updated_at):'Unknown'}</dd></dl></details>
   <nav className="admin-workspace-nav detail-sections" aria-label="Schedule sections">{Object.entries({overview:'Overview / Stats',history:'History',logs:'Logs',geography:'Related geography',sources:'Sources'}).map(([value,label])=><button key={value} type="button" className="text-button" aria-current={section===value?'page':undefined} onClick={()=>onSection(value as ScheduleSection)}>{label}</button>)}</nav>
   {section==='overview'&&<><h3>Latest run · validated outcomes</h3><dl className="admin-facts"><dt>New leads</dt><dd>{r?.leads?.added??'Unknown'}</dd><dt>Updated leads</dt><dd>{r?.leads?.updated??'Unknown'}</dd><dt>Existing unchanged</dt><dd>{r?.leads?.unchanged??'Unknown'}</dd><dt>Source checks needing attention</dt><dd>{r?.presentation?.outcome==='source_attention'?r.presentation.attention_count:'See saved source checks'}</dd><dt>Category breakdown</dt><dd>Unknown · historical verified category attribution unavailable</dd><dt>Candidates needing attention</dt><dd>Review saved candidate validation separately from sources</dd></dl>{r&&<button type="button" className="text-button" onClick={()=>onView(r.id,'overview')}>View last run</button>}<small>Per-run counts below · period and all-time totals are unavailable in this view. Recorded activity is the union of completed step intervals.</small><RunHistory key={id} scheduleId={id} owner={owner} counties={counties} onView={onView}/></>}
   {section==='history'&&<ScheduleHistory key={id} id={id} owner={owner} onView={onView}/>}
   {section==='logs'&&<><h3>Run logs</h3><small>Choose a run to view its recorded steps and diagnostic references.</small><RunHistory key={id} scheduleId={id} owner={owner} counties={counties} onView={onView}/></>}
   {section==='sources'&&<><h3>Saved source evidence</h3>{r?<button type="button" className="text-button" onClick={()=>onView(r.id,'sources')}>View saved source evidence</button>:<p>{current.reporting?'No saved run yet.':'Source evidence requires saved run reporting.'}</p>}<small>Evidence is scoped to each run. Shared coverage is separate from verified work locations.</small><RunHistory key={id} scheduleId={id} owner={owner} counties={counties} onView={onView}/></>}
   {section==='geography'&&<><h3>Saved schedule geography</h3><small>Saved configuration · historical runs retain their own scope snapshots.</small>{current.config.target_kind==='sam'?<p>Arkansas statewide · work locations are verified per record.</p>:<ul>{current.config.counties?.map(c=><li key={c.id}><strong>{c.name}</strong><ul>{c.cities?.map(city=><li key={city.id}>{city.name}</li>)}</ul></li>)??current.config.county_ids.map(id=><li key={id}>{counties.find(c=>c.id===id)?.name??id} · saved city details unavailable</li>)}</ul>}{current.config.target_kind==='state_source'&&<small>County/city associations are saved routing relationships, not verified service coverage.</small>}</>}
  </>}
 </section>;
}
