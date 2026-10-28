import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {SourceResolution} from './SourceResolution';
import {sourceDecisionLabels,type SourceReviewItem} from './source-resolution';
import {useSchedulingRole} from './scheduling-role';
import {useActiveRead} from './use-active-read';
import {formatLocal,readFailure} from './model';

type Item=SourceReviewItem&{request_id?:string;run_id?:string|null};
type Page={items:Item[];next_offset?:number|null;total?:number};
const needsReview=(item:Item)=>['source_missing','method_missing','blocked','partial','admin_excluded'].includes(item.current?.state??item.check.state);
export function SourceStatus({requestId,owner,active=true,attention=false,onTechnicalDetails,onChanged}:{requestId?:string;owner:string;active?:boolean;attention?:boolean;onTechnicalDetails?:(runId?:string,requestId?:string)=>void;onChanged?:()=>void}){
 const role=useSchedulingRole(),visible=useActiveRead(active&&(!attention||role.manage_sources));
 const [data,setData]=useState<Page>({items:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[reviewed,setReviewed]=useState(false),[offset,setOffset]=useState(0);
 const storageKey=`spin-admin-source-selection:${owner}:${requestId??'attention'}`;
 const [selected,setSelected]=useState<{task:string;request:string;run?:string}|null>(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)??'null');}catch{return null;}});
 const returnButton=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{try{if(selected)sessionStorage.setItem(storageKey,JSON.stringify(selected));else sessionStorage.removeItem(storageKey);}catch{/* Mounted selection remains. */}},[selected,storageKey]);
 useEffect(()=>{
  if(!visible)return;
  const abort=new AbortController();setBusy(true);setError('');
  const path=attention?`/v1/source-reviews?reviewed=${reviewed}&offset=${offset}`:`/v1/requests/${requestId}/source-status`;
  void workflowRequest<Page>(path,{signal:abort.signal}).then(p=>{if(!Array.isArray(p.items))throw Error('Saved source status is unavailable.');if(!abort.signal.aborted)setData(p);})
   .catch(e=>{if(!abort.signal.aborted)setError(readFailure(e,'Source status'));}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});
  return()=>abort.abort();
 },[visible,attention,requestId,reviewed,offset,revision]);
 const items=[...new Map(data.items.map(i=>[JSON.stringify(i.scope),i])).values()];
 function back(){setSelected(null);requestAnimationFrame(()=>returnButton.current?.isConnected&&returnButton.current.focus());}
 if(attention&&!role.manage_sources)return <section><h2>Admin review required</h2><p>Users can view source status from their schedules.</p></section>;
 return <section className="source-status" aria-label={attention?'Source issues & repairs':'Source status'}>
  <div hidden={!!selected&&role.manage_sources}>
   <div className="admin-section-heading"><h3>{attention?'Source issues & repairs':'What was checked in this run'}</h3><button className="text-button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Refresh source status</button></div>
   <p>{attention?'Repair websites and listing checks, record a decision, or re-enable disabled checks. Decisions apply across schedules.':'Check outcomes belong to the selected run. Admin decisions below describe the current source review.'}</p>
   {attention&&<label>Show<select value={reviewed?'reviewed':'unresolved'} onChange={e=>{setReviewed(e.target.value==='reviewed');setOffset(0);}}><option value="unresolved">Unresolved</option><option value="reviewed">Reviewed decisions</option></select></label>}
   {busy&&<p role="status">Loading source status…</p>}{error&&<p role="alert">{error} <button className="text-button" onClick={()=>setRevision(n=>n+1)}>Retry source status</button></p>}
   {!busy&&!error&&!items.length&&<p>{attention?(reviewed?'No reviewed source decisions yet.':'No unresolved source issues. Previously reviewed or disabled checks are still available below.'):'No saved source checks are available for this run. This does not confirm complete coverage.'}</p>}
   {attention&&!reviewed&&!busy&&!error&&<button type="button" className="secondary-button compact" onClick={()=>{setReviewed(true);setOffset(0);}}>Review decisions and disabled checks</button>}
   {items.map(item=><article className="source-status-row" key={JSON.stringify(item.scope)}>
    <div><h4>{item.name}</h4><small>{item.location} · {item.category==='source_entry'?'Website entry':item.category}</small>
     <p><strong>{item.title}</strong> · {item.impact}</p>
     {item.check.observed_at&&<small>Selected run check: {formatLocal(item.check.observed_at)}</small>}
     {(item.id||needsReview(item))?<p>Current decision: <strong>{sourceDecisionLabels[item.decision]??'Review status unavailable'}</strong>{item.reviewed_at?` · ${formatLocal(item.reviewed_at)}`:''}</p>:<small>No review decision recorded for this check.</small>}
     {item.reviewed_at&&<small>Reviewed by {item.reviewed_by_label??'Admin · name unavailable'}</small>}
     {item.checks_excluded&&<p className="source-exclusion">Checks disabled by admin decision. Other source checks continue.</p>}
     {(item.id||needsReview(item))&&(item.decision==='unreviewed'||item.decision==='repair_in_progress'||item.decision==='needs_developer')&&<small>Responsibility: {item.responsibility}</small>}
    </div>
    {role.manage_sources&&(item.id||needsReview(item))&&<button type="button" className="secondary-button compact" onClick={e=>{returnButton.current=e.currentTarget;setSelected({task:item.task_id,request:item.request_id??requestId!,run:item.run_id??undefined});}}>Review / repair<span className="sr-only"> · {item.name} · {item.location} · {item.category}</span></button>}
   </article>)}
   {attention&&<div className="admin-inline">{offset>0&&<button className="text-button" disabled={busy} onClick={()=>setOffset(Math.max(0,offset-25))}>Previous sources</button>}{data.next_offset!=null&&<button className="text-button" disabled={busy} onClick={()=>setOffset(data.next_offset!)}>More sources</button>}</div>}
  </div>
  {selected&&role.manage_sources&&<SourceResolution requestId={selected.request} taskId={selected.task} owner={owner} canManage={role.manage_sources} active={active} onBack={back} onDone={()=>{setRevision(n=>n+1);onChanged?.();}} onTechnicalDetails={onTechnicalDetails&&(requestId||selected.run)?()=>onTechnicalDetails(selected.run,selected.request):undefined}
   onNext={()=>{const unresolved=items.filter(i=>['unreviewed','repair_in_progress','needs_developer'].includes(i.decision)&&i.task_id!==selected.task);if(unresolved[0])setSelected({task:unresolved[0].task_id,request:unresolved[0].request_id??requestId!,run:unresolved[0].run_id??undefined});else back();}}/>}
 </section>;
}

type Setup={basis:string;as_of:string;items:{id:string;name:string;url:string|null;kind:string;locations:string[];last_check:{finished_at:string|null;status:string}|null;routes:{location:string;category:string;status:string;checks_excluded:boolean}[]}[];gaps:{location:string;category:string;checks_excluded:boolean}[];more_gaps:boolean;next_offset:number|null};
const setupLabels:Record<string,string>={verified_method:'Verified check method',method_blocked:'Check method needs review',unsupported:'Automatic checking is not supported',category_unresolved:'Listing checks need setup'};
export function CurrentSourceSetup({id,active=true,refreshSignal=0}:{id:string;active?:boolean;refreshSignal?:number}){
 const visible=useActiveRead(active),[data,setData]=useState<Setup|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[offset,setOffset]=useState(0);
 useEffect(()=>{if(!visible)return;const abort=new AbortController();setError('');void workflowRequest<Setup>(`/v1/schedules/${id}/sources?offset=${offset}`,{signal:abort.signal})
  .then(p=>{if(!Array.isArray(p.items)||!Array.isArray(p.gaps))throw Error('Source setup is unavailable.');if(!abort.signal.aborted)setData(p);}).catch(e=>{if(!abort.signal.aborted)setError(readFailure(e,'Current source setup'));});return()=>abort.abort();},[id,visible,revision,offset,refreshSignal]);
 return <section aria-label="Current source setup"><h3>Current source setup</h3><p>Registered websites support future checks. A working website or verified method does not establish complete coverage.</p>
  {error&&<p role="alert">{error} <button className="text-button" onClick={()=>setRevision(n=>n+1)}>Retry source setup</button></p>}
  {!data&&!error&&<p role="status">Loading source setup…</p>}
  {data&&<><small>Registry as of {formatLocal(data.as_of)}. Selected run outcomes are shown separately below.</small>{data.items.map(s=><article className="source-status-row" key={s.id}><div><h4>{s.name}</h4><p>{s.locations.join(', ')||'Saved schedule location'}</p>{s.url&&<a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
   {s.routes.map((r,i)=><p key={i}>{r.location} · {r.category} · {r.checks_excluded?'Checks disabled by admin decision':setupLabels[r.status]??'Setup needs review'}</p>)}
   {s.last_check?.finished_at&&<small>Last recorded source capture: {formatLocal(s.last_check.finished_at)}. See selected run checks for scope and outcome.</small>}</div></article>)}
   {data.gaps.length>0&&<details><summary>{data.gaps.length}{data.more_gaps?'+':''} location/category checks have no registered website on this page</summary>{data.gaps.map((g,i)=><p key={i}>{g.location} · {g.category}{g.checks_excluded?' · Checks disabled by admin decision':''}</p>)}</details>}
   {!data.items.length&&<p>No registered websites are available in this view. Saved run checks may explain source gaps.</p>}
   <div className="admin-inline">{offset>0&&<button className="text-button" onClick={()=>setOffset(Math.max(0,offset-25))}>Previous websites</button>}{data.next_offset!==null&&<button className="text-button" onClick={()=>setOffset(data.next_offset!)}>More websites</button>}</div>
  </>}
 </section>;
}
