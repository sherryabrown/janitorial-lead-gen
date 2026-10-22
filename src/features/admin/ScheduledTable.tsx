import {ReadAction} from './ReadAction';
import { useEffect, useState } from 'react';
import {scheduleDisableActions} from './ScheduleDisable';
import { ActionMenu } from '../shared/components/ActionMenu';
import { InfoTooltip } from '../shared/components/InfoTooltip';
import { ScheduleDetail, type ScheduleSection } from './ScheduleDetail';
import { formatLocal, runLabel, title, recurrenceLabel } from './model';
import type { AnySchedule, County } from './types';
const defaults={q:'',target:'all',geography:'',lifecycle:'all',blocker:'all',sort:'name',direction:'asc'};
type Section='details'|'stats'|'overview'|'history'|'logs'|'geography'|'sources';
export function ScheduleList({items,more,paging,onMore,onEdit,onAction,busy,onView,onAdd,onFilters,counties=[],query='',total,loading=false,error='',onRetry,focusSchedule,owner='',context,onContext,onViewLeads,active=true}: {
  active?:boolean;items: AnySchedule[]; more: boolean; paging?: boolean; onMore:()=>void; onEdit:(s:AnySchedule)=>void;
  onAction:(s:AnySchedule,a:string)=>void; busy:boolean; onView:(id:string,section?:'overview'|'logs'|'sources')=>void; onAdd?:(target:string)=>void;
  onFilters?:(query:string)=>void; counties?:County[]; query?:string; total?:number; loading?:boolean; error?:string; onRetry?:()=>void;
  focusSchedule?: AnySchedule|null; owner?:string; context?:{id:string;section:ScheduleSection;scheduleRunId?:string}|null; onContext?:(value:{id:string;section:ScheduleSection;scheduleRunId?:string}|null)=>void;onViewLeads?:()=>void;
}) {
  const [filters,setFilters]=useState(()=>({...defaults,...Object.fromEntries(new URLSearchParams(query))}));
  const [selected,setSelected]=useState<{id:string;section:Section}|null>(null),[returnedId,setReturnedId]=useState<string|null>(null);
  const [menuId,setMenuId]=useState<string|null>(null);
  useEffect(()=>{if(focusSchedule)setSelected({id:focusSchedule.id,section:'details'});},[focusSchedule]);
  const change=(key:keyof typeof defaults,value:string)=>{
    const f={...filters,[key]:value};setFilters(f);
    const p=new URLSearchParams();for(const [k,v] of Object.entries(f))if(v!==defaults[k as keyof typeof defaults])p.set(k,v);
    onFilters?.(p.toString());
  };
  const detail=context===undefined?(selected?{id:selected.id,section:(selected.section==='details'||selected.section==='stats'?'overview':selected.section) as ScheduleSection}:null):context;
  const current=items.find(s=>s.id===detail?.id)??(focusSchedule?.id===detail?.id?focusSchedule:undefined);
  const open=(s:AnySchedule,section:Section)=>{setSelected({id:s.id,section});onContext?.({id:s.id,section:section==='details'||section==='stats'?'overview':section});};
  return <section className="admin-section" aria-label="Saved schedules">
    <div hidden={!!detail}>
    <div className="admin-section-heading schedule-list-heading"><h2>Schedules</h2>{onAdd&&<button type="button" className="primary-button compact" disabled={busy} onClick={()=>onAdd('county_scope')}>Add schedule</button>}</div>
    <ReadAction scope="schedules" busy={loading} loaded={items.length>0} error={!!error} onRead={()=>onRetry?.()}/>
    <div className="schedule-filters" aria-label="Schedule filters">
      <label>Search schedules<input value={filters.q} maxLength={100} onChange={e=>change('q',e.target.value)} /></label>
      <label>Type<select value={filters.target} onChange={e=>change('target',e.target.value)}><option value="all">All types</option><option value="county_scope">Counties</option><option value="state_source">State sources</option><option value="sam">SAM</option></select></label>
      <label>Geography<select value={filters.geography} onChange={e=>change('geography',e.target.value)}><option value="">All geography</option><option value="05">Statewide</option>{counties.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Schedule status<select value={filters.lifecycle} onChange={e=>change('lifecycle',e.target.value)}><option value="all">All statuses</option><option value="current">Not archived</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
    </div>
    <details className="schedule-more-filters" open={filters.blocker!=='all'||filters.sort!=='name'||filters.direction!=='asc'||undefined}><summary>More filters{filters.blocker!=='all'||filters.sort!=='name'||filters.direction!=='asc'?' · applied':''}</summary><div className="schedule-filters">
      <label>Blocker<select value={filters.blocker} onChange={e=>change('blocker',e.target.value)}><option value="all">All</option><option value="blocked">Needs action</option><option value="clear">No blocker</option></select></label>
      <label>Sort schedules<select value={filters.sort} onChange={e=>change('sort',e.target.value)}>{Object.entries({name:'Name',target_kind:'Type',frequency:'Frequency',last_run_at:'Last run',next_due_at:'Next run',lifecycle:'Status'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Order<select value={filters.direction} onChange={e=>change('direction',e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    </div></details>
    <span className="admin-hint" role="status">{loading?'Loading schedules…':total!=null?`${total} ${total===1?'schedule':'schedules'}`:`${items.length} loaded schedules`}</span>
    {error&&<div role="alert">{error}</div>}
    {!error&&!loading&&!items.length&&<p>No schedules match. Add a schedule or change filters.</p>}
    <div className="schedule-table-wrap"><table className="schedule-table schedule-list-table"><caption className="sr-only">Schedules · times in America/Chicago · AI usage from last run</caption><thead><tr>{['Name','Geography','Frequency','Last run','Last run leads','Next run','AI credits','AI spent','Status','Quick actions'].map(h=><th key={h} scope="col">{h}{h==='Quick actions'&&<InfoTooltip label="About quick actions">Run now starts this saved schedule. Details opens settings and runs. Edit changes settings. Disable: Pause stops future runs; Archive keeps history; Delete is available only before any run. Current runs continue.</InfoTooltip>}{h==='AI credits'&&<InfoTooltip label="About schedule AI credits">Provider-reported credits only. Missing reports or mixed units show Unknown; tokens are not credits.</InfoTooltip>}</th>)}</tr></thead>
      <tbody>{items.map(s=>{const archived=!!s.archived_at||!!s.archived,r=s.reporting?.last_run,o=s.reporting?.latest_occurrence;
        return <tr className={returnedId===s.id?'schedule-returned-row':undefined} key={s.id} id={`schedule-row-${s.id}`}>
          <td data-label="Name"><button className="text-button schedule-name" type="button" onClick={()=>open(s,'details')}>{s.name}</button></td>
          <td data-label="Geography">{s.config.target_kind==='county_scope'?'County':'State'}<small>{s.config.target_kind==='sam'?'SAM · Arkansas statewide':s.config.target_kind==='state_source'?`${new Set(s.config.state_sources?.map(a=>a.source_id)??[s.config.state_trigger_id]).size} state sources`:(s.config.counties?.map(c=>c.name).join(', ')||s.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??id).join(', '))}</small></td>
          <td data-label="Frequency">{recurrenceLabel(s)}</td>
          <td data-label="Last run">{r?<><time>{formatLocal(r.created_at)}</time><small>{runLabel(r)}</small></>:s.reporting?'Never run':'Unknown'}{o&&!o.trigger_id&&<small>{title(o.state)} · {title(o.reason)}</small>}</td>
          <td data-label="Last run leads">{r?.leads?.completeness==='known'?<>{r.leads.added} new<small>{r.leads.updated} updated · {r.leads.unchanged} unchanged</small></>:r?.leads?.completeness==='not_applicable'?'Not applicable':r?'Unknown':s.reporting?'—':'Unknown'}{r?.leads?.reason&&<small>{r.leads.reason}</small>}</td>
          <td data-label="Next run">{archived?'Archived':s.next_due_at?formatLocal(s.next_due_at):s.enabled?'Unknown':'Paused'}</td>
          <td data-label="AI credits">{r?.usage?.ai==='not_used'?'Not used':r?.usage?.credits!=null?`${r.usage.credits} ${r.usage.credit_unit}`:r?'Unknown':s.reporting?'—':'Unknown'}</td>
          <td data-label="AI spent">{r?.usage?.actual_usd!=null?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(r.usage.actual_usd):r?'Unknown':s.reporting?'—':'Unknown'}{r?.usage?.actual_usd==null&&r?.usage?.known_actual_usd!=null&&<small>${r.usage.known_actual_usd} known</small>}{!!r?.usage?.held_usd&&<small>${r.usage.held_usd} reserved</small>}</td>
          <td data-label="Status">{archived?'Archived':s.enabled?'Active':'Paused'}{s.blocker&&<small>Needs action · {title(s.blocker)}</small>}</td>
          <td data-label="Quick actions"><div className="schedule-actions"><button type="button" className="secondary-button compact" aria-label={`Run ${s.name} now`} disabled={busy||archived} onClick={()=>onAction(s,'run-now')}>Run now</button>
            <ActionMenu label={`Actions for ${s.name}`} open={menuId===s.id} onOpenChange={value=>setMenuId(value?s.id:null)} actions={[
              {label:'Details',onSelect:()=>open(s,'details')},
              {label:'Edit',disabled:busy||archived,onSelect:()=>onEdit(s)},
              {label:'Disable',disabled:busy||archived,children:scheduleDisableActions(s,busy,onAction)},
            ]}/></div></td>
        </tr>;})}</tbody></table></div>
    {more&&<button type="button" className="text-button" disabled={paging} onClick={onMore}>More schedules</button>}
    </div>
    {detail&&<ScheduleDetail active={active} key={detail.id} id={detail.id} initial={current??undefined} owner={owner} section={detail.section} selectedRunId={"scheduleRunId" in detail?detail.scheduleRunId:undefined} onSelectedRun={runId=>onContext?.({...detail,scheduleRunId:runId})} onViewLeads={onViewLeads}
      onSection={section=>{setSelected({id:detail.id,section});onContext?.({...detail,section});}}
      onClose={()=>{setReturnedId(detail.id);setSelected(null);onContext?.(null);const row=document.getElementById(`schedule-row-${detail.id}`);row?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});requestAnimationFrame(()=>{row?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});row?.scrollIntoView?.({block:'nearest'});});}}
      onView={onView} onEdit={onEdit} onAction={onAction} busy={busy} counties={counties}/>}
  </section>;
}
