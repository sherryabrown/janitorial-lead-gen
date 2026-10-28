import {ReadAction} from './ReadAction';
import {useOwnedRead} from './read-owner';
import { useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { formatLocal, title,readFailure } from './model';
import type { Page } from './types';

type Event = { id: string; action: string; at: string; version: number; actor_id?: string;actor_label?:string;changes?:{field:string;before:unknown;after:unknown}[]|null };

function auditValue(value:unknown):string{
 if(value==null)return 'Not set';
 if(typeof value==='boolean')return value?'On':'Off';
 if(Array.isArray(value))return value.length?value.map(auditValue).join(', '):'None';
 if(typeof value==='object')return Object.entries(value).map(([k,v])=>`${title(k)}: ${auditValue(v)}`).join(' · ');
 return String(value);
}

export function ScheduleHistory({id,owner='',active=true}:{id:string;owner?:string;active?:boolean}) {
 const [events,setEvents]=useState<Page<Event>>({items:[],next_offset:null}),[error,setError]=useState(''),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0);
 const generation=useRef(0),pending=useRef(false),failedOffset=useRef<number|null>(null),loaded=useRef(50);
 const key=`spin-admin-history-page:${owner}:${id}:events`;
 useEffect(()=>{
  if(!active){setBusy(false);return;}
  const abort=new AbortController(),epoch=++generation.current;pending.current=true;setBusy(true);setError('');
  try{const n=Number(sessionStorage.getItem(key));if(Number.isInteger(n)&&n>=50&&n<=5000)loaded.current=n;}catch{/* Mounted pages remain. */}
  void (async()=>{
   const offset=failedOffset.current,result:Page<Event>={items:[],next_offset:offset??0};
   do{const page=await workflowRequest<Page<Event>>(`/v1/schedules/${id}/events${result.next_offset?`?offset=${result.next_offset}`: ''}`,{signal:abort.signal});result.items.push(...page.items);result.next_offset=page.next_offset;}while(offset===null&&result.next_offset!==null&&result.next_offset<loaded.current);
   if(abort.signal.aborted)return;
   setEvents(old=>({...result,items:offset===null?result.items:[...old.items,...result.items.filter(e=>!old.items.some(o=>o.id===e.id))]}));
   if(offset!==null){loaded.current=offset+50;try{sessionStorage.setItem(key,String(loaded.current));}catch{/* Mounted pages remain. */}}failedOffset.current=null;
  })().catch(e=>{if(!abort.signal.aborted)setError(readFailure(e,'Schedule changes'));}).finally(()=>{if(!abort.signal.aborted){setBusy(false);pending.current=false;}});
  return()=>{abort.abort();generation.current=epoch+1;pending.current=false;};
 },[id,key,active,revision]);
 const read=()=>setRevision(n=>n+1);
 const owned=useOwnedRead('schedule-history',{busy,error,loaded:!!events.items.length},read,active);
 const more=async()=>{
  const offset=events.next_offset;if(pending.current||offset===null)return;
  const epoch=generation.current;pending.current=true;setBusy(true);setError('');
  try{const page=await workflowRequest<Page<Event>>(`/v1/schedules/${id}/events?offset=${offset}`);if(epoch!==generation.current)return;setEvents(old=>({...page,items:[...old.items,...page.items.filter(e=>!old.items.some(o=>o.id===e.id))]}));loaded.current=offset+50;failedOffset.current=null;try{sessionStorage.setItem(key,String(loaded.current));}catch{/* Mounted pages remain. */}}
  catch(e){if(epoch===generation.current){failedOffset.current=offset;setError(readFailure(e,'More schedule changes'));}}
  finally{if(epoch===generation.current){setBusy(false);pending.current=false;}}
 };
 const changes=events.items.filter(e=>!['queued','skipped','blocked'].includes(e.action));
 return <section aria-label="Schedule history" className="admin-section">
  <small>America/Chicago · configuration and lifecycle changes</small>
  {!owned&&<ReadAction scope="schedule history" busy={busy} error={!!error} loaded={!!events.items.length} onRead={read}/>}
  {busy&&<p role="status">Loading history...</p>}{error&&<p role="alert">{error}</p>}
  <section className="schedule-history-panel"><h3>Schedule changes</h3>
  {!busy&&!error&&!changes.length&&<p>No saved configuration changes on this page.</p>}
  {!!changes.length&&<div className="schedule-table-wrap"><table className="schedule-table"><caption className="sr-only">Schedule changes</caption><thead><tr>{['When','Actor','Change','Before → After','Version'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{changes.map(e=><tr key={e.id}><td data-label="When">{formatLocal(e.at)}</td><td data-label="Actor">{e.action==='owner_inactive'?'System':e.actor_label??'Actor not recorded'}</td><td data-label="Change">{title(e.action)}</td><td data-label="Before → After">{e.changes?.length?<details open={e.changes.length<=3}><summary>{e.changes.length} changed fields</summary><dl>{e.changes.map(c=><div key={c.field}><dt>{title(c.field)}</dt><dd>{auditValue(c.before)} → {auditValue(c.after)}</dd></div>)}</dl></details>:<span>Historical details not recorded</span>}</td><td data-label="Version">{e.version??'Unknown'}</td></tr>)}</tbody></table></div>}
  {events.next_offset!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void more()}>More changes</button>}
  </section></section>;
}
