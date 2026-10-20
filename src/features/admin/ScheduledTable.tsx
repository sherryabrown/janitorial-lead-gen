import { useEffect, useRef, useState } from 'react';
import { ActionMenu } from '../shared/components/ActionMenu';
import { InfoTooltip } from '../shared/components/InfoTooltip';
import { ScheduleHistory } from './ScheduleHistory';
import { formatLocal, runLabel, title, recurrenceLabel } from './model';
import type { AnySchedule, County } from './types';
const defaults={q:'',target:'all',geography:'',lifecycle:'all',blocker:'all',sort:'name',direction:'asc'};
type Section='details'|'stats'|'history'|'logs'|'geography'|'sources';
export function ScheduleList({items,more,paging,onMore,onEdit,onAction,busy,onView,onAdd,onFilters,counties=[],query='',total,loading=false,error='',onRetry,focusSchedule}: {
  items: AnySchedule[]; more: boolean; paging?: boolean; onMore:()=>void; onEdit:(s:AnySchedule)=>void;
  onAction:(s:AnySchedule,a:string)=>void; busy:boolean; onView:(id:string)=>void; onAdd?:(target:string)=>void;
  onFilters?:(query:string)=>void; counties?:County[]; query?:string; total?:number; loading?:boolean; error?:string; onRetry?:()=>void;
  focusSchedule?: AnySchedule|null;
}) {
  const [filters,setFilters]=useState(()=>({...defaults,...Object.fromEntries(new URLSearchParams(query))}));
  const [selected,setSelected]=useState<{id:string;section:Section}|null>(null),[target,setTarget]=useState('county_scope');
  const [menuId,setMenuId]=useState<string|null>(null);
  const detailRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(focusSchedule)setSelected({id:focusSchedule.id,section:'details'});},[focusSchedule]);
  useEffect(()=>{if(selected){detailRef.current?.focus();detailRef.current?.scrollIntoView?.({block:'nearest'});}},[selected]);
  const change=(key:keyof typeof defaults,value:string)=>{
    const f={...filters,[key]:value};setFilters(f);
    const p=new URLSearchParams();for(const [k,v] of Object.entries(f))if(v!==defaults[k as keyof typeof defaults])p.set(k,v);
    onFilters?.(p.toString());
  };
  const current=items.find(s=>s.id===selected?.id)??(focusSchedule?.id===selected?.id?focusSchedule:undefined);
  const open=(s:AnySchedule,section:Section)=>setSelected({id:s.id,section});
  return <section className="admin-section" aria-label="Saved schedules">
    <div className="admin-section-heading"><h2>Schedules</h2>{onAdd&&<div className="admin-inline">
      <label>Schedule target<select aria-label="New schedule target" value={target} onChange={e=>setTarget(e.target.value)}><option value="county_scope">Counties</option><option value="state_source">State source</option><option value="sam">SAM statewide</option></select></label>
      <button type="button" className="primary-button compact" disabled={busy} onClick={()=>onAdd(target)}>Add schedule</button>
    </div>}</div>
    <div className="schedule-filters" aria-label="Schedule filters">
      <label>Search schedules<input value={filters.q} maxLength={100} onChange={e=>change('q',e.target.value)} /></label>
      <label>Target<select value={filters.target} onChange={e=>change('target',e.target.value)}><option value="all">All targets</option><option value="county_scope">Counties</option><option value="state_source">State sources</option><option value="sam">SAM</option></select></label>
      <label>Geography<select value={filters.geography} onChange={e=>change('geography',e.target.value)}><option value="">All geography</option><option value="05">Statewide</option>{counties.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Schedule status<select value={filters.lifecycle} onChange={e=>change('lifecycle',e.target.value)}><option value="all">All statuses</option><option value="current">Not archived</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
      <label>Blocker<select value={filters.blocker} onChange={e=>change('blocker',e.target.value)}><option value="all">All</option><option value="blocked">Needs action</option><option value="clear">No blocker</option></select></label>
      <label>Sort schedules<select value={filters.sort} onChange={e=>change('sort',e.target.value)}>{Object.entries({name:'Name',target_kind:'Target',frequency:'Frequency',last_run_at:'Last run',next_due_at:'Next run',lifecycle:'Status'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Order<select value={filters.direction} onChange={e=>change('direction',e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    </div>
    <span className="admin-hint" role="status">{loading?'Loading schedules…':total!=null?`${total} schedules`:`${items.length} loaded schedules`}</span>
    {error&&<div role="alert">{error} <button type="button" className="text-button" onClick={onRetry}>Retry schedules</button></div>}
    {!error&&!loading&&!items.length&&<p>No schedules match. Add a schedule or change filters.</p>}
    <div className="schedule-table-wrap"><table className="schedule-table"><caption className="sr-only">Schedules · times in America/Chicago · AI usage from last run</caption><thead><tr>{['Name','Geography','Frequency','Last run','Last run leads','Next run','AI credits','AI spent','Status','Quick actions'].map(h=><th key={h} scope="col">{h}{h==='AI credits'&&<InfoTooltip label="About schedule AI credits">Provider-reported credits only. Missing reports or mixed units show Unknown; tokens are not credits.</InfoTooltip>}</th>)}</tr></thead>
      <tbody>{items.map(s=>{const archived=!!s.archived_at||!!s.archived,r=s.reporting?.last_run,o=s.reporting?.latest_occurrence;
        return <tr key={s.id} id={`schedule-row-${s.id}`}>
          <td data-label="Name"><button className="text-button schedule-name" type="button" onClick={()=>open(s,'details')}>{s.name}</button></td>
          <td data-label="Geography">{s.config.target_kind==='county_scope'?'County':'State'}<small>{s.config.target_kind==='sam'?'SAM · Arkansas statewide':s.config.target_kind==='state_source'?'Independent state source':(s.config.counties?.map(c=>c.name).join(', ')||s.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??id).join(', '))}</small></td>
          <td data-label="Frequency">{recurrenceLabel(s)}</td>
          <td data-label="Last run">{r?<><time>{formatLocal(r.created_at)}</time><small>{runLabel(r)}</small></>:s.reporting?'Never run':'Unknown'}{o&&!o.trigger_id&&<small>{title(o.state)} · {title(o.reason)}</small>}</td>
          <td data-label="Last run leads">{r?.leads?.completeness==='known'?<>{r.leads.added} new<small>{r.leads.updated} updated · {r.leads.unchanged} unchanged</small></>:r?.leads?.completeness==='not_applicable'?'Not applicable':r?'Unknown':s.reporting?'—':'Unknown'}{r?.leads?.reason&&<small>{r.leads.reason}</small>}</td>
          <td data-label="Next run">{archived?'Archived':s.next_due_at?formatLocal(s.next_due_at):s.enabled?'Unknown':'Paused'}</td>
          <td data-label="AI credits">{r?.usage?.ai==='not_used'?'Not used':r?.usage?.credits!=null?`${r.usage.credits} ${r.usage.credit_unit}`:r?'Unknown':s.reporting?'—':'Unknown'}</td>
          <td data-label="AI spent">{r?.usage?.actual_usd!=null?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(r.usage.actual_usd):r?'Unknown':s.reporting?'—':'Unknown'}{r?.usage?.actual_usd==null&&r?.usage?.known_actual_usd!=null&&<small>${r.usage.known_actual_usd} known</small>}{!!r?.usage?.held_usd&&<small>${r.usage.held_usd} reserved</small>}</td>
          <td data-label="Status">{archived?'Archived':s.enabled?'Active':'Paused'}{s.blocker&&<small>Needs action · {title(s.blocker)}</small>}</td>
          <td data-label="Quick actions"><div className="schedule-actions"><button type="button" className="secondary-button compact" aria-label={`Run ${s.name} now`} disabled={busy||archived} onClick={()=>onAction(s,'run-now')}>Run now</button>
            <ActionMenu label={`Actions for ${s.name}`} open={menuId===s.id} onOpenChange={value=>setMenuId(value?s.id:null)} actions={[
              {label:`Edit ${s.name}`,disabled:busy||archived,onSelect:()=>onEdit(s)},
              {label:s.enabled?'Pause':'Resume',title:'Pause stops scheduled work; manual runs continue.',disabled:busy||archived||!!s.blocker&&!s.enabled,onSelect:()=>onAction(s,s.enabled?'pause':'resume')},
              {label:'Archive schedule',disabled:busy||archived,onSelect:()=>{if(window.confirm('Archive this schedule? Future scheduled work stops. Saved history remains; manual runs already started are not cancelled.'))onAction(s,'archive');}},
              ...(['stats','history','logs','geography','details','sources'] as Section[]).map(section=>({label:({stats:'Go to Stats',history:`History for ${s.name}`,logs:'Go to History/Logs',geography:'Show related geography',details:'View details',sources:'Go to Sources'})[section],onSelect:()=>open(s,section)})),
            ]}/></div></td>
        </tr>;})}</tbody></table></div>
    {more&&<button type="button" className="text-button" disabled={paging} onClick={onMore}>More schedules</button>}
    {current&&selected&&<section ref={detailRef} tabIndex={-1} className="admin-section schedule-detail" aria-label={`Schedule details: ${current.name}`}>
      <div className="admin-section-heading"><h3>{current.name} · {title(selected.section)}</h3><button type="button" className="text-button" onClick={()=>{setSelected(null);document.getElementById(`schedule-row-${current.id}`)?.querySelector<HTMLButtonElement>('button')?.focus();}}>Close schedule details</button></div>
      <div className="admin-inline"><button type="button" className="secondary-button compact" disabled={busy||!!current.archived_at||!!current.archived} onClick={()=>onAction(current,'run-now')}>Run saved schedule now</button><button type="button" className="text-button" disabled={busy||!!current.archived_at||!!current.archived} onClick={()=>onEdit(current)}>Edit schedule details</button><button type="button" className="text-button" disabled={busy||!!current.archived_at||!!current.archived||!!current.blocker&&!current.enabled} onClick={()=>onAction(current,current.enabled?'pause':'resume')}>{current.enabled?'Pause schedule':'Resume schedule'}</button></div>
      <dl><dt>Frequency</dt><dd>{recurrenceLabel(current)}</dd><dt>Saved scope</dt><dd>{current.config.target_kind==='sam'?'SAM · Arkansas':current.config.counties?.map(c=>c.name).join(', ')||current.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??id).join(', ')}</dd><dt>Version</dt><dd>{current.version}</dd></dl>
      {selected.section==='history'?<ScheduleHistory id={current.id} onView={onView}/>:selected.section==='geography'?<ul>{current.config.target_kind==='sam'?<li>Arkansas statewide · SAM performance locations verified per record</li>:current.config.counties?.map(c=><li key={c.id}>{c.name}<ul>{c.cities?.map(city=><li key={city.id}>{city.name}</li>)}</ul></li>)??current.config.county_ids.map(id=><li key={id}>{counties.find(c=>c.id===id)?.name??id}</li>)}</ul>:<>
        {current.reporting?.last_run?<><strong>{runLabel(current.reporting.last_run)}</strong><dl><dt>New leads</dt><dd>{current.reporting.last_run.leads?.added??'Unknown'}</dd><dt>Updated leads</dt><dd>{current.reporting.last_run.leads?.updated??'Unknown'}</dd></dl><button type="button" className="text-button" onClick={()=>onView(current.reporting!.last_run!.id)}>{selected.section==='sources'?'View saved source evidence':selected.section==='logs'?'View run logs':'View last run'}</button></>:<p>{current.reporting?'No saved run yet.':'Run reporting unavailable; refresh after the matching backend is available.'}</p>}
      </>}
    </section>}
  </section>;
}
