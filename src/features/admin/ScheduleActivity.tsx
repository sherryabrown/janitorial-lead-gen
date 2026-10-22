import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {formatLocal,readFailure,runLabel,title} from './model';
import type {Page,Run} from './types';
import {RunDetail} from './RunDetail';
import {useOwnedRead} from './read-owner';
function saved(owner:string,id:string){try{return sessionStorage.getItem(`spin-admin-schedule-run:${owner}:${id}`)||'';}catch{return '';}}
export function ScheduleActivity({id,owner,active,section,selectedRunId,onSelectedRun,onView,onViewLeads}:{id:string;owner:string;active:boolean;section?:'logs'|'sources';selectedRunId?:string;onSelectedRun?:(id:string)=>void;onView:(id:string,section?:'overview'|'logs'|'sources')=>void;onViewLeads?:()=>void}){
 const [selection,setSelection]=useState(()=>selectedRunId??saved(owner,id)),[page,setPage]=useState<Page<Run>>({items:[],next_offset:null}),[verified,setVerified]=useState<Run|null>(null),[error,setError]=useState(''),[invalid,setInvalid]=useState(false),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0);
 const callbacks=useRef(onSelectedRun),generation=useRef(0),pending=useRef(false),failedPage=useRef<number|null>(null),loaded=useRef(50),lastSection=useRef<'logs'|'sources'>('logs');callbacks.current=onSelectedRun;
 if(section)lastSection.current=section;
 const choose=(value:string)=>{setSelection(value);setInvalid(false);setVerified(null);try{sessionStorage.setItem(`spin-admin-schedule-run:${owner}:${id}`,value);}catch{/* Mounted selection remains. */}callbacks.current?.(value);};
 useEffect(()=>{if(selectedRunId!==undefined&&selectedRunId!==selection){setSelection(selectedRunId);setVerified(null);setInvalid(false);}},[selectedRunId,selection]);
 useEffect(()=>{
  if(!active){setBusy(false);return;}
  const a=new AbortController(),epoch=++generation.current;pending.current=true;setBusy(true);setError('');
  try{const n=Number(sessionStorage.getItem(`spin-admin-schedule-runs-page:${owner}:${id}`));if(Number.isInteger(n)&&n>=50&&n<=5000)loaded.current=n;}catch{/* Mounted page count remains. */}
  void (async()=>{
   const failed=failedPage.current,result:Page<Run>={items:[],next_offset:failed??0};
   do{const q=new URLSearchParams({schedule:id});if(result.next_offset)q.set('offset',String(result.next_offset));const p=await workflowRequest<Page<Run>>(`/v1/admin/history?${q}`,{signal:a.signal});result.items.push(...p.items.filter(r=>r.schedule_id===id&&!result.items.some(o=>o.id===r.id)));result.next_offset=p.next_offset;}while(failed===null&&result.next_offset!==null&&result.next_offset<loaded.current);
   if(a.signal.aborted)return;if(failed!==null){loaded.current=failed+50;try{sessionStorage.setItem(`spin-admin-schedule-runs-page:${owner}:${id}`,String(loaded.current));}catch{/* Mounted pages remain. */}}setPage(old=>({...result,items:failed===null?result.items:[...old.items,...result.items.filter(r=>!old.items.some(o=>o.id===r.id))]}));failedPage.current=null;
  })().catch(e=>{if(!a.signal.aborted)setError(readFailure(e,'Saved run choices'));}).finally(()=>{if(!a.signal.aborted){setBusy(false);pending.current=false;}});
  return()=>{a.abort();generation.current=epoch+1;pending.current=false;};
 },[id,owner,active,revision]);
 const found=page.items.find(r=>r.id===selection);
 useEffect(()=>{
  if(!active||busy||error)return;
  if(!selection){if(page.items[0])choose(page.items[0].id);return;}
  if(found){setVerified(found);setInvalid(false);return;}
  const a=new AbortController();setVerified(null);setBusy(true);
  void workflowRequest<Page<Run>>(`/v1/admin/history?${new URLSearchParams({schedule:id,run:selection})}`,{signal:a.signal}).then(p=>{if(!a.signal.aborted){const value=p.items.find(r=>r.id===selection&&r.schedule_id===id);setVerified(value??null);setInvalid(!value);}}).catch(e=>{if(!a.signal.aborted)setError(readFailure(e,'Selected run'));}).finally(()=>{if(!a.signal.aborted)setBusy(false);});
  return()=>a.abort();
  // Membership is validated only when the selected identity/available choices change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[active,selection,found,page.items,revision]);
 const more=async()=>{
  if(pending.current||page.next_offset===null)return;const epoch=generation.current,offset=page.next_offset;pending.current=true;setBusy(true);setError('');
  try{const p=await workflowRequest<Page<Run>>(`/v1/admin/history?${new URLSearchParams({schedule:id,offset:String(offset)})}`);if(epoch!==generation.current)return;setPage(old=>({...p,items:[...old.items,...p.items.filter(r=>r.schedule_id===id&&!old.items.some(o=>o.id===r.id))]}));loaded.current=offset+50;try{sessionStorage.setItem(`spin-admin-schedule-runs-page:${owner}:${id}`,String(loaded.current));}catch{/* Mounted pages remain. */}failedPage.current=null;}
  catch(e){if(epoch===generation.current){failedPage.current=offset;setError(readFailure(e,'More saved run choices'));}}
  finally{if(epoch===generation.current){pending.current=false;setBusy(false);}}
 };
 useOwnedRead('run-choices',{busy,error,loaded:!!page.items.length},()=>setRevision(n=>n+1),active);
 return <section aria-label="Schedule run activity">
  {error&&<p role="alert">{error}</p>}
  {!busy&&!error&&!page.items.length&&!selection&&<p>No runs yet.</p>}
  {(page.items.length>0||selection)&&<div className="schedule-run-picker"><label>Run<select aria-label="Run" value={selection} onChange={e=>choose(e.target.value)}><option value="">Choose a run</option>{selection&&!found&&<option value={selection}>{verified?`${formatLocal(verified.created_at)} · ${title(verified.origin)}`:'Selected run · '+selection}</option>}{page.items.map(r=><option key={r.id} value={r.id}>{formatLocal(r.created_at)} · {title(r.origin)} · {runLabel(r)}</option>)}</select></label>{page.next_offset!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void more()}>More run choices</button>}</div>}
  {invalid&&<p role="alert">Selected run is unavailable for this schedule. Choose a saved run above.</p>}
  {(selectedRunId===undefined||selectedRunId===selection)&&(found||verified)&&!invalid&&<RunDetail key={selection} id={selection} owner={owner} embedded active={active} expectedScheduleId={id} section={section??lastSection.current} onClose={()=>{}} onViewLeads={onViewLeads??(()=>onView(selection,'sources'))} onSource={onView} changed={()=>{}}/>}
 </section>;
}
