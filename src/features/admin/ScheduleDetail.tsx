import {Breadcrumb} from './Breadcrumb';
import {BreadcrumbParents} from './breadcrumb-context';
import {ReadWorkspace,WorkspaceReadAction} from './ReadWorkspace';
import {useOwnedRead} from './read-owner';
import {ScheduleActivity} from './ScheduleActivity';
import {Catalog} from './Catalog';
import {CurrentSourceSetup} from './SourceStatus';
import {useSchedulingRole} from './scheduling-role';
import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {ScheduleHistory} from './ScheduleHistory';
import {RunHistory} from './RunHistory';
import {ScheduleDisable} from './ScheduleDisable';
import {formatLocal,recurrenceLabel,title,readFailure} from './model';
import type {AnySchedule,County} from './types';
export type ScheduleSection='overview'|'history'|'logs'|'geography'|'sources';
const sections={overview:'Results',sources:'Sources',history:'Schedule changes'};
function ScheduleDetailContent({id,initial,owner='',section,onSection,onClose,onView,onEdit,onAction,busy,counties=[],selectedRunId,onSelectedRun,onViewLeads,catalogSourceId,catalogGeographyId,onCatalogSource,onCatalogGeography,onReviewSources,active=true}:{
 onReviewSources?:()=>void;catalogSourceId?:string;catalogGeographyId?:string;onCatalogSource?:(id?:string)=>void;onCatalogGeography?:(id?:string)=>void;
 active?:boolean;selectedRunId?:string;onSelectedRun?:(id:string)=>void;onViewLeads?:()=>void;
 id:string;initial?:AnySchedule;owner?:string;section:ScheduleSection;onSection:(s:ScheduleSection)=>void;onClose:()=>void;
 onView:(id:string,section?:'overview'|'logs'|'sources')=>void;onEdit:(s:AnySchedule)=>void;onAction:(s:AnySchedule,a:string)=>void;busy:boolean;counties?:County[];
}){
 const role=useSchedulingRole(),primary=section==='logs'||section==='geography'?'overview':section;
 const [sourceRevision,setSourceRevision]=useState(0);
 const [schedule,setSchedule]=useState(initial),[error,setError]=useState(''),[revision,setRevision]=useState(0),[readBusy,setReadBusy]=useState(true);
 const hasCurrent=!!(schedule??initial);
 const [technical,setTechnical]=useState(section==='logs'&&role.technical_details),[catalogOpen,setCatalogOpen]=useState(!!catalogSourceId),[runSelection,setRunSelection]=useState(selectedRunId),[attemptsOpen,setAttemptsOpen]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null),setup=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(selectedRunId!==undefined)setRunSelection(selectedRunId);},[selectedRunId]);
 useEffect(()=>{setTechnical(section==='logs'&&role.technical_details);if(section==='geography'&&setup.current)setup.current.open=true;},[section,role.technical_details,hasCurrent]);
 useEffect(()=>{if(catalogSourceId)setCatalogOpen(true);},[catalogSourceId]);
 useEffect(()=>{if(initial)setSchedule(initial);},[initial]);
 useEffect(()=>{if(!active)return;const a=new AbortController();setReadBusy(true);setError('');void workflowRequest<AnySchedule>('/v1/schedules/'+id,{signal:a.signal}).then(value=>{if(!value?.id||!value.config)throw Error('Saved schedule details are unavailable.');if(!a.signal.aborted)setSchedule(value);}).catch(e=>{if(!a.signal.aborted)setError(readFailure(e,'Schedule details'));}).finally(()=>{if(!a.signal.aborted)setReadBusy(false);});return()=>a.abort();},[id,revision,active]);
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView?.({block:'nearest'});},[id]);
 const chooseRun=(value:string)=>{setRunSelection(value);onSelectedRun?.(value);};
 const current=schedule??initial,archived=!!current?.archived||!!current?.archived_at;
 const scope=current?.config.target_kind==='sam'?'SAM.gov · Arkansas statewide':current?.config.target_kind==='state_source'?(current.config.state_sources?.map(s=>s.name).join(', ')||'Saved state sources'):current?.config.counties?.map(c=>c.name).join(', ')||current?.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??'Saved county').join(', ');
 useOwnedRead('details',{busy:readBusy,error,loaded:!!schedule},()=>setRevision(n=>n+1),active);
 const parents=[{label:'Settings'},{label:'Schedules',ariaLabel:'Back to schedules',onClick:onClose},{label:current?.name??'Schedule',onClick:()=>onSection('overview')}];
 return <section className="admin-section schedule-detail" aria-label={'Schedule details: '+(current?.name??'Saved schedule')}>
  <Breadcrumb items={[...parents,{label:sections[primary]}]}/>
  <div className="admin-section-heading schedule-detail-heading"><div><h2 ref={heading} tabIndex={-1}>{current?.name??'Loading schedule…'}</h2><p className="schedule-scope">{scope} <span className="schedule-status">{archived?'Archived':current?.enabled?'Active':'Paused'}</span></p></div>{current&&<div className="admin-inline"><button type="button" className="primary-button compact" disabled={busy||archived} onClick={()=>onAction(current,'run-now')}>Run now</button><button type="button" className="text-button" disabled={busy||archived} onClick={()=>onEdit(current)}>Edit</button>{!archived&&<ScheduleDisable schedule={current} busy={busy} onAction={onAction}/>}</div>}</div>
  <WorkspaceReadAction/>{error&&<p role="alert">{error}</p>}
  {current&&<>
   <p className="admin-hint">Run now respects checks disabled by an Admin. Other source checks continue; view Sources for the affected checks.</p>
   {current.blocker&&<p role="status">Saved scope needs review. Check the schedule scope before running.</p>}
   <details ref={setup} className="schedule-settings"><summary>Schedule scope and setup</summary>
    <dl className="schedule-facts"><div><dt>Frequency</dt><dd>{recurrenceLabel(current)}</dd></div><div><dt>Timezone</dt><dd>America/Chicago</dd></div><div><dt>Next run</dt><dd>{archived?'Archived':current.next_due_at?formatLocal(current.next_due_at):current.enabled?'Time unavailable':'Paused'}</dd></div></dl>
    <dl className="admin-facts"><dt>Scope</dt><dd>{scope}</dd><dt>Categories</dt><dd>{current.config.requested_categories.map(title).join(', ')}</dd><dt>Search window</dt><dd>{Object.entries(current.window_policy).map(([k,v])=><div key={k}>{title(k)} · {'lookback_days' in v?'Last '+v.lookback_days+' days':'Day '+v.from_offset_days+' through day '+v.to_offset_days}</div>)}</dd></dl>
    {current.config.target_kind==='county_scope'&&<><p>To change counties, archive this schedule and create a new one.</p>{current.config.counties?.map(c=><details key={c.id}><summary>{c.name} · {c.cities?.length??0} saved cities</summary>{c.cities?.map(city=><p key={city.id}>{city.name}</p>)}</details>)}</>}
    <p>Saved routing relationships do not establish verified service coverage.</p>
    {role.technical_details&&<details><summary>Schedule reference</summary><p>{current.id} · Version {current.version}</p></details>}
   </details>
   <nav role="tablist" className="admin-workspace-nav detail-sections" aria-label="Schedule sections" onKeyDown={e=>{const tabs=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));const i=tabs.indexOf(document.activeElement as HTMLButtonElement);const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i-1+tabs.length)%tabs.length:null;if(n!==null){e.preventDefault();tabs[n].focus();tabs[n].click();}}}>
    {Object.entries(sections).map(([value,label])=><button key={value} type="button" role="tab" id={'schedule-tab-'+value} aria-controls="schedule-tabpanel" aria-selected={primary===value} tabIndex={primary===value?0:-1} className="text-button" onClick={()=>onSection(value as ScheduleSection)}>{label}</button>)}
   </nav>
   <div role="tabpanel" id="schedule-tabpanel" aria-labelledby={'schedule-tab-'+primary}>
    {primary==='sources'&&<>{role.manage_sources&&onReviewSources&&<section className="source-repair-actions" aria-label="Source repair actions"><h3>Source issues &amp; repairs</h3><p>Review websites, repair listing checks, or re-enable checks across schedules.</p><button type="button" className="primary-button compact" onClick={onReviewSources}>Open source issues &amp; repairs</button></section>}<CurrentSourceSetup id={id} active={active} refreshSignal={sourceRevision}/></>}
    <div hidden={primary==='history'}>
     <BreadcrumbParents.Provider value={parents}><ScheduleActivity id={id} owner={owner} onSourceChanged={()=>setSourceRevision(n=>n+1)} active={active&&primary!=='history'} section={technical&&role.technical_details?'logs':primary==='sources'?'sources':'overview'} onSection={value=>{setTechnical(value==='logs');if(value!=='logs')onSection(value);}} selectedRunId={runSelection} onSelectedRun={chooseRun} onView={onView} onViewLeads={onViewLeads}/></BreadcrumbParents.Provider>
     {role.technical_details&&<details className="schedule-technical" open={technical} onToggle={e=>setTechnical(e.currentTarget.open)}><summary>Technical details for the selected run</summary><p>Detailed step logs are shown above while this disclosure is open.</p></details>}
     {primary==='overview'&&<details className="schedule-attempts" open={attemptsOpen} onToggle={e=>setAttemptsOpen(e.currentTarget.open)}><summary>Recent run attempts</summary>{attemptsOpen&&<RunHistory scheduleId={id} owner={owner} counties={counties} onView={run=>chooseRun(run)} active={active}/>}</details>}
    </div>
    <div hidden={primary!=='history'}><ScheduleHistory key={id} id={id} owner={owner} active={active&&primary==='history'}/></div>
    {role.technical_details&&primary==='sources'&&<details open={catalogOpen} className="catalog-disclosure" onToggle={e=>setCatalogOpen(e.currentTarget.open)}><summary>Technical registry and geography</summary>{catalogOpen&&<><Catalog mode="sources" owner={owner} counties={counties} scheduleId={id} sourceId={catalogSourceId} onSource={onCatalogSource} onGeography={onCatalogGeography} active={active}/>{catalogGeographyId&&<Catalog mode="geography" owner={owner} counties={counties} scheduleId={id} geographyId={catalogGeographyId} onGeography={onCatalogGeography} onSource={onCatalogSource} active={active}/>}</>}</details>}
   </div>
  </>}
 </section>;
}
export function ScheduleDetail(props:Parameters<typeof ScheduleDetailContent>[0]){return <ReadWorkspace><ScheduleDetailContent {...props}/></ReadWorkspace>;}
