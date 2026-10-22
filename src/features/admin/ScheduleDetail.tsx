import {ReadWorkspace,WorkspaceReadAction} from './ReadWorkspace';
import {useOwnedRead} from './read-owner';
import {ScheduleActivity} from './ScheduleActivity';
import {Catalog} from './Catalog';
import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {ScheduleHistory} from './ScheduleHistory';
import {RunHistory} from './RunHistory';
import {ScheduleDisable} from './ScheduleDisable';
import {InfoTooltip} from '../shared/components/InfoTooltip';
import {formatLocal,recurrenceLabel,title,readFailure} from './model';
import type {AnySchedule,County} from './types';
import {ScheduleAnalyticsSummary} from './Analytics';
export type ScheduleSection='overview'|'history'|'logs'|'geography'|'sources';
const sections:Record<ScheduleSection,string>={overview:'Overview',history:'History',logs:'Logs',geography:'Related geography',sources:'Sources'};
function ScheduleDetailContent({id,initial,owner='',section,onSection,onClose,onView,onEdit,onAction,busy,counties=[],selectedRunId,onSelectedRun,onViewLeads,catalogSourceId,catalogGeographyId,onCatalogSource,onCatalogGeography,active=true}:{
 catalogSourceId?:string;catalogGeographyId?:string;onCatalogSource?:(id?:string)=>void;onCatalogGeography?:(id?:string)=>void;
 active?:boolean;selectedRunId?:string;onSelectedRun?:(id:string)=>void;onViewLeads?:()=>void;
 id:string;initial?:AnySchedule;owner?:string;section:ScheduleSection;onSection:(s:ScheduleSection)=>void;onClose:()=>void;
 onView:(id:string,section?:'overview'|'logs'|'sources')=>void;onEdit:(s:AnySchedule)=>void;onAction:(s:AnySchedule,a:string)=>void;busy:boolean;counties?:County[];
}){
 const [schedule,setSchedule]=useState(initial),[error,setError]=useState(''),[revision,setRevision]=useState(0),[readBusy,setReadBusy]=useState(true);
 const [catalogOpen,setCatalogOpen]=useState(!!catalogSourceId);
 useEffect(()=>{if(catalogSourceId)setCatalogOpen(true);},[catalogSourceId]);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(initial)setSchedule(initial);},[initial]);
 useEffect(()=>{const a=new AbortController();setReadBusy(true);setError('');void workflowRequest<AnySchedule>(`/v1/schedules/${id}`,{signal:a.signal}).then(value=>{if(!value?.id||!value.config)throw Error('Saved schedule details are unavailable.');if(!a.signal.aborted)setSchedule(value);}).catch(e=>{if(!a.signal.aborted)setError(readFailure(e,'Schedule details'));}).finally(()=>{if(!a.signal.aborted)setReadBusy(false);});return()=>a.abort();},[id,revision]);
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView?.({block:'nearest'});},[id]);
 const current=schedule??initial,archived=!!current?.archived||!!current?.archived_at;
 const scope=current?.config.target_kind==='sam'?'SAM.gov · Arkansas statewide':current?.config.target_kind==='state_source'?`${current.config.state_sources?.length??1} state source associations`:current?.config.counties?.map(c=>c.name).join(', ')||current?.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??id).join(', ');
 useOwnedRead('details',{busy:readBusy,error,loaded:!!schedule},()=>setRevision(n=>n+1),active);
 return <section className="admin-section schedule-detail" aria-label={`Schedule details: ${current?.name??id}`}>
  <nav className="schedule-breadcrumb" aria-label="Breadcrumb"><button type="button" className="text-button" aria-label="Back to schedules" onClick={onClose}>Schedules</button><span aria-hidden="true">/</span><span>{current?.name??"Schedule"}</span></nav>
  <div className="admin-section-heading schedule-detail-heading"><div><h2 ref={heading} tabIndex={-1}>{current?.name??'Loading schedule…'}</h2><p className="schedule-scope">{scope} <span className="schedule-status">{archived?'Archived':current?.enabled?'Active':'Paused'}</span></p></div>{current&&<div className="admin-inline"><button type="button" className="primary-button compact" disabled={busy||archived} onClick={()=>onAction(current,'run-now')}>Run now</button><button type="button" className="text-button" disabled={busy||archived} onClick={()=>onEdit(current)}>Edit</button>{!archived&&<ScheduleDisable schedule={current} busy={busy} onAction={onAction}/>}</div>}</div>
  <WorkspaceReadAction/>{error&&<p role="alert">{error}</p>}
  {current&&<>
   {current.blocker&&<p role="status">Needs action · {title(current.blocker)}</p>}
   <dl className="schedule-facts"><div><dt>Frequency</dt><dd>{recurrenceLabel(current)}</dd></div><div><dt>Timezone</dt><dd>America/Chicago</dd></div><div><dt>Next run</dt><dd>{archived?'Archived':current.next_due_at?formatLocal(current.next_due_at):current.enabled?'Unknown':'Paused'}</dd></div></dl>
   <nav role="tablist" className="admin-workspace-nav detail-sections" aria-label="Schedule sections" onKeyDown={e=>{const tabs=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));const i=tabs.indexOf(document.activeElement as HTMLButtonElement);const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i-1+tabs.length)%tabs.length:null;if(n!==null){e.preventDefault();tabs[n].focus();tabs[n].click();}}}>
    {Object.entries(sections).map(([value,label])=><button key={value} type="button" role="tab" id={`schedule-tab-${value}`} aria-controls="schedule-tabpanel" aria-selected={section===value} tabIndex={section===value?0:-1} className="text-button" onClick={()=>onSection(value as ScheduleSection)}>{label}</button>)}
   </nav>
   <div role="tabpanel" id="schedule-tabpanel" aria-labelledby={`schedule-tab-${section}`}>
    <div hidden={section!=='overview'}><ScheduleAnalyticsSummary id={id} active={active&&section==='overview'}/><section className="schedule-settings"><h3>Schedule settings</h3><dl className="admin-facts"><dt>Scope</dt><dd>{scope}{current.config.target_kind==='county_scope'&&<InfoTooltip label="About saved counties">To change counties, archive this schedule and create a new one.</InfoTooltip>}</dd>{current.config.target_kind==='state_source'&&<><dt>State sources</dt><dd>{[...new Set(current.config.state_sources?.map(s=>s.name)??[current.config.state_trigger_id??'Saved source'])].map(name=><div className="state-source-name" key={name}>{name}</div>)}</dd></>}<dt>Categories</dt><dd>{current.config.requested_categories.map(title).join(', ')}</dd><dt>Search window</dt><dd>{Object.entries(current.window_policy).map(([k,v])=><div key={k}>{title(k)} · {'lookback_days' in v?`Last ${v.lookback_days} days`:v.from_offset_days===0?`Next ${v.to_offset_days+1} days`:`Day ${v.from_offset_days} through day ${v.to_offset_days}`}</div>)}</dd>{current.config.target_kind!=='sam'&&<><dt>Work</dt><dd>{[current.config.maintain_sources?'Maintain sources':null,current.config.check_updates?'Check updates':null].filter(Boolean).join(' · ')}</dd></>}</dl><details><summary>Schedule identity</summary><p>{current.id} · Version {current.version} · {current.updated_at?formatLocal(current.updated_at):'Updated time unknown'}</p></details></section><section className="schedule-runs"><RunHistory scheduleId={id} owner={owner} counties={counties} onView={onView} active={active&&section==='overview'}/></section></div>
    <div hidden={section!=='history'}><ScheduleHistory key={id} id={id} owner={owner} onView={onView} active={active&&section==='history'}/></div>
    {section==='sources'&&<details open={catalogOpen} className="catalog-disclosure" onToggle={e=>setCatalogOpen(e.currentTarget.open)}><summary>Registered sources · current registry</summary>{catalogOpen&&<Catalog mode="sources" owner={owner} counties={counties} scheduleId={id} sourceId={catalogSourceId} onSource={onCatalogSource} onGeography={onCatalogGeography} active={active}/>}</details>}
    <div hidden={section!=='logs'&&section!=='sources'}><h3>{section==='sources'?'Saved run evidence':'Run logs'}</h3><ScheduleActivity id={id} owner={owner} active={active&&(section==='logs'||section==='sources')} section={section==='logs'||section==='sources'?section:undefined} selectedRunId={selectedRunId} onSelectedRun={onSelectedRun} onView={onView} onViewLeads={onViewLeads}/></div>
    {section==='geography'&&<><section className="catalog-basis"><h3>Saved schedule geography</h3>{current.config.target_kind==='sam'?<span>Arkansas statewide · work locations are verified per record.</span>:current.config.counties?.map(c=><details key={c.id}><summary>{c.name} · {c.cities?.length??0} saved cities</summary>{c.cities?.map(city=><div key={city.id}>{city.name}</div>)}</details>)??current.config.county_ids.map(id=><span key={id}>{counties.find(c=>c.id===id)?.name??id} · saved city details unavailable</span>)}<small>Saved routing relationships; not verified service coverage.</small></section><Catalog mode="geography" owner={owner} counties={counties} scheduleId={id} geographyId={catalogGeographyId} onGeography={onCatalogGeography} onSource={onCatalogSource} active={active}/></>}

   </div>
  </>}
 </section>;
}

export function ScheduleDetail(props:Parameters<typeof ScheduleDetailContent>[0]){return <ReadWorkspace><ScheduleDetailContent {...props}/></ReadWorkspace>;}
