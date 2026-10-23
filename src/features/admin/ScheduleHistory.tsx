import {ReadAction} from './ReadAction';
import {useOwnedRead} from './read-owner';
import { useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { formatLocal, title,runLabel,readFailure } from './model';
import type { Page,Run,Config,SamConfig } from './types';

type Occurrence = {
  id: string; due_at: string; effective_at: string; state: string;
  reason?: string; trigger_id?: string; missed_from?: string; missed_through?: string;
  version?:number;origin?:string;config?:Config|SamConfig;run?:Run|null;
};
type Event = { id: string; action: string; at: string; version: number; actor_id?: string;changes?:{field:string;before:unknown;after:unknown}[]|null };

function auditValue(value:unknown):string{
 if(value==null)return 'Not set';
 if(typeof value==='boolean')return value?'On':'Off';
 if(Array.isArray(value))return value.length?value.map(auditValue).join(', '):'None';
 if(typeof value==='object')return Object.entries(value).map(([k,v])=>`${title(k)}: ${auditValue(v)}`).join(' · ');
 return String(value);
}

export function ScheduleHistory({ id, onView,owner='',active=true,mode='changes' }: { id: string; onView: (id: string) => void;owner?:string;active?:boolean;mode?:'changes'|'occurrences' }) {
  const [occurrences, setOccurrences] = useState<Page<Occurrence>>({ items: [], next_offset: null });
  const [events, setEvents] = useState<Page<Event>>({ items: [], next_offset: null });
  const [errors,setErrors]=useState({occurrences:'',events:''}),[busy,setBusy]=useState(true),[retry,setRetry]=useState(0);
  const generation=useRef(0),pending=useRef(false),priorId=useRef(id),limits=useRef({occurrences:0,events:0});
  const failedPages=useRef<{occurrences:number|null;events:number|null}>({occurrences:null,events:null}),requested=useRef<('occurrences'|'events')[]>(['occurrences','events']);
  useEffect(()=>{
    if(!active){setBusy(false);return;}
    const a=new AbortController(),epoch=++generation.current;pending.current=true;setBusy(true);
    if(priorId.current!==id){priorId.current=id;setOccurrences({items:[],next_offset:null});setEvents({items:[],next_offset:null});limits.current={occurrences:0,events:0};failedPages.current={occurrences:null,events:null};}
    const kinds=requested.current.filter(k=>mode==='changes'?k==='events':k==='occurrences');requested.current=['occurrences','events'];
    const load=async(kind:'occurrences'|'events')=>{
      setErrors(old=>({...old,[kind]:''}));
      if(owner)try{const n=Number(sessionStorage.getItem(`spin-admin-history-page:${owner}:${id}:${kind}`));if(Number.isInteger(n)&&n>0&&n<=5000)limits.current[kind]=n;}catch{/* Mounted pages remain. */}
      const failed=failedPages.current[kind],result:Page<Occurrence|Event>={items:[],next_offset:failed??0};
      do{const page=await workflowRequest<Page<Occurrence|Event>>(`/v1/schedules/${id}/${kind}${result.next_offset?`?offset=${result.next_offset}`:''}`,{signal:a.signal});result.items.push(...page.items.filter(item=>!result.items.some(old=>old.id===item.id)));result.next_offset=page.next_offset;}while(failed===null&&result.next_offset!==null&&result.next_offset<limits.current[kind]);
      if(a.signal.aborted)return;
      if(kind==='occurrences')setOccurrences(old=>({...result,items:failed===null?result.items as Occurrence[]:[...old.items,...(result.items as Occurrence[]).filter(i=>!old.items.some(o=>o.id===i.id))]}));
      else setEvents(old=>({...result,items:failed===null?result.items as Event[]:[...old.items,...(result.items as Event[]).filter(i=>!old.items.some(o=>o.id===i.id))]}));
      if(failed!==null){limits.current[kind]=failed+50;if(owner)try{sessionStorage.setItem(`spin-admin-history-page:${owner}:${id}:${kind}`,String(limits.current[kind]));}catch{/* Mounted pages remain. */}}
      failedPages.current[kind]=null;
    };
    void Promise.all(kinds.map(kind=>load(kind).catch(e=>{if(!a.signal.aborted)setErrors(old=>({...old,[kind]:readFailure(e,kind==='events'?'Schedule changes':'Occurrences')}));}))).finally(()=>{if(!a.signal.aborted){setBusy(false);pending.current=false;}});
    return()=>{a.abort();generation.current=epoch+1;pending.current=false;};
  },[id,retry,owner,active,mode]);
  const read=()=>{requested.current=(['occurrences','events'] as const).filter(k=>errors[k]);if(!requested.current.length)requested.current=['occurrences','events'];setRetry(n=>n+1);};
  const error=Object.values(errors).filter(Boolean).join(' '),owned=useOwnedRead('schedule-history',{busy,error,loaded:!!(occurrences.items.length||events.items.length)},read,active);
  const more=async(kind:'occurrences'|'events')=>{
    if(pending.current)return;const offset=kind==='occurrences'?occurrences.next_offset:events.next_offset;if(offset===null)return;
    const epoch=generation.current;pending.current=true;setBusy(true);setErrors(old=>({...old,[kind]:''}));
    try{
      const page=await workflowRequest<Page<Occurrence|Event>>(`/v1/schedules/${id}/${kind}?offset=${offset}`);if(epoch!==generation.current)return;
      if(kind==='occurrences')setOccurrences(old=>({...page,items:[...old.items,...(page.items as Occurrence[]).filter(i=>!old.items.some(o=>o.id===i.id))]}));
      else setEvents(old=>({...page,items:[...old.items,...(page.items as Event[]).filter(i=>!old.items.some(o=>o.id===i.id))]}));
      failedPages.current[kind]=null;limits.current[kind]=offset+50;if(owner)try{sessionStorage.setItem(`spin-admin-history-page:${owner}:${id}:${kind}`,String(limits.current[kind]));}catch{/* Mounted pages remain. */}
    }catch(e){if(epoch===generation.current){failedPages.current[kind]=offset;setErrors(old=>({...old,[kind]:readFailure(e,kind==='events'?'More schedule changes':'More occurrences')}));}}
    finally{if(epoch===generation.current){pending.current=false;setBusy(false);}}
  };
  const changes=events.items.filter(e=>!['queued','skipped','blocked'].includes(e.action));
  return <section aria-label={mode==='changes'?'Schedule history':'Execution attempts'} className="admin-section">
    <small>America/Chicago · {mode==='changes'?'configuration and lifecycle changes':'execution attempts; not schedule edits'}</small>
    {!owned&&<ReadAction scope="schedule history" busy={busy} error={!!error} loaded={!!(occurrences.items.length||events.items.length)} onRead={read}/>}
    {busy&&<p role="status">Loading history…</p>}
    {error&&<p role="status">Some history could not load. Loaded records remain available.</p>}
    {mode==='occurrences'&&<section className="schedule-history-panel"><h3>Execution attempts</h3>{errors.occurrences&&<p role="alert">{errors.occurrences}</p>}
    {!busy&&!errors.occurrences&&!occurrences.items.length&&<p>No saved occurrences.</p>}
    {!!occurrences.items.length&&<div className="schedule-table-wrap"><table className="schedule-table"><caption className="sr-only">Schedule occurrences</caption><thead><tr>{['Due / effective','Outcome','Run','Snapshot'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{occurrences.items.map(o=><tr key={o.id}>
     <td data-label="Due / effective">{formatLocal(o.due_at)}<small>Effective: {o.effective_at?formatLocal(o.effective_at):'Unknown'}</small></td>
     <td data-label="Outcome"><strong>{title(o.state)}</strong>{o.reason&&<small>{title(o.reason)}</small>}{!o.trigger_id&&<small>No run was created. Review the reason and edit the schedule if needed.</small>}{o.missed_from&&<small>Missed interval: {formatLocal(o.missed_from)} – {formatLocal(o.missed_through??o.effective_at)}</small>}</td>
     <td data-label="Run">{o.trigger_id?<button type="button" className="text-button" onClick={()=>onView(o.trigger_id!)}>Run {o.trigger_id}</button>:'No run'}{o.run&&<small>{runLabel(o.run)}</small>}</td>
     <td data-label="Snapshot"><details><summary>Occurrence snapshot · version {o.version??'Unknown'}</summary><dl className="admin-facts"><dt>Scope</dt><dd>{o.config?.target_kind==='sam'?'Arkansas statewide · SAM':o.config?.counties?.map(c=>c.name).join(', ')||o.config?.county_ids.join(', ')||'Historical scope unavailable'}</dd><dt>Categories</dt><dd>{o.config?.requested_categories?.map(title).join(', ')||'Unknown'}</dd><dt>Origin</dt><dd>{title(o.origin)}</dd><dt>Run created</dt><dd>{o.run?formatLocal(o.run.created_at):'No run'}</dd><dt>Run finished</dt><dd>{o.run?.finished_at?formatLocal(o.run.finished_at):'Unknown'}</dd></dl></details></td>
    </tr>)}</tbody></table></div>}
    {occurrences.next_offset!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void more('occurrences')}>More occurrences</button>}
    </section>}{mode==='changes'&&<section className="schedule-history-panel"><h3>Schedule changes</h3>{errors.events&&<p role="alert">{errors.events}</p>}
    {!busy&&!errors.events&&!changes.length&&<p>No saved configuration changes on this page.</p>}
    {!!changes.length&&<div className="schedule-table-wrap"><table className="schedule-table"><caption className="sr-only">Schedule changes</caption><thead><tr>{['When','Actor','Change','Before → After','Version'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{changes.map(e=><tr key={e.id}><td data-label="When">{formatLocal(e.at)}</td><td data-label="Actor">{e.action==='owner_inactive'?'System':e.actor_id??'Actor not recorded · system or historical'}</td><td data-label="Change">{title(e.action)}</td><td data-label="Before → After">{e.changes?.length?<details open={e.changes.length<=3}><summary>{e.changes.length} changed fields</summary><dl>{e.changes.map(c=><div key={c.field}><dt>{title(c.field)}</dt><dd>{auditValue(c.before)} → {auditValue(c.after)}</dd></div>)}</dl></details>:<span>Historical details not recorded</span>}</td><td data-label="Version">{e.version??'Unknown'}</td></tr>)}</tbody></table></div>}
    {events.next_offset!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void more('events')}>More changes</button>}
    </section>}
  </section>;
}
