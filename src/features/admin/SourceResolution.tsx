import {useEffect,useRef,useState} from 'react';
import {workflowRequest,mutationKey,acknowledged} from '../../lib/procurement-workflow';
import {useActiveRead} from './use-active-read';
import {formatLocal,readFailure} from './model';
import {sourceDecisionLabels,type SourceDecision,type SourceResolutionDetail,type RepairStatus} from './source-resolution';

type Choice='provide_website'|'no_website'|'no_issue'|'wont_address'|'needs_developer'|'unreviewed'|'reenable';
const choices:{value:Choice;label:string}[]=[{value:'provide_website',label:'Provide website'},{value:'no_website',label:'No website'},
 {value:'no_issue',label:'No issue'},{value:'wont_address',label:"Won’t address"},{value:'needs_developer',label:'Needs developer'}];
function savedNote(key:string){try{return sessionStorage.getItem(key)??'';}catch{return '';}}

function SourceResolutionContent({requestId,taskId,owner,canManage,active:workspaceActive=true,onBack,onDone,onNext,onTechnicalDetails}:{
 requestId:string;taskId:string;owner:string;canManage:boolean;active?:boolean;onBack:()=>void;onDone?:()=>void;onNext?:()=>void;onTechnicalDetails?:()=>void;
}){
 const active=useActiveRead(workspaceActive&&canManage),noteKey=`spin-admin-source-note:${owner}:${taskId}`;
 const [detail,setDetail]=useState<SourceResolutionDetail|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [choice,setChoice]=useState<Choice>('provide_website'),[note,setNote]=useState(()=>savedNote(noteKey)),[website,setWebsite]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),mutation=useRef<AbortController|null>(null);
 const done=useRef(onDone);done.current=onDone;
 const path=`/v1/requests/${requestId}/source-resolution/${taskId}`;
 useEffect(()=>{heading.current?.focus();},[taskId]);
 useEffect(()=>{try{if(canManage)sessionStorage.setItem(noteKey,note);else sessionStorage.removeItem(noteKey);}catch{/* Mounted draft still works. */}},[canManage,note,noteKey]);
 useEffect(()=>{
  if(!canManage){setDetail(null);setNote('');setWebsite('');setError('');setBusy(false);mutation.current?.abort();
   for(const operation of ['verify','decision','apply','reconcile'])acknowledged(owner,`source-resolution:${taskId}:${operation}`);
  }
 },[canManage,owner,taskId]);
 useEffect(()=>()=>mutation.current?.abort(),[]);
 useEffect(()=>{
  if(!active)return;
  const abort=new AbortController();setLoading(true);
  void workflowRequest<SourceResolutionDetail>(path,{signal:abort.signal}).then(data=>{
   if(abort.signal.aborted)return;setDetail(data);setWebsite(current=>current||data.website);setConfirmed(false);
   if(data.verification?.state==='blocked'&&!data.verification.can_apply_website&&!data.verification.can_apply_method&&!data.verification.needs_reconciliation&&!data.verification.fixed&&/developer/i.test(data.verification.title)){
    setChoice(current=>current==='provide_website'?'needs_developer':current);
    setNote(current=>current||'Automatic website or listing verification could not complete; developer review is needed.');
   }
  }).catch(e=>{if(!abort.signal.aborted)setError(readFailure(e,'Source review'));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[path,active,revision]);
 const jobId=detail?.verification?.job_id,polling=!!detail?.verification&&['pending','running'].includes(detail.verification.state);
 useEffect(()=>{
  if(!active||!jobId||!polling)return;
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   try{
    const value=await workflowRequest<RepairStatus>(`${path}/status?job=${jobId}`,{signal:abort.signal});
    if(abort.signal.aborted)return;
    setDetail(previous=>previous?.verification?.job_id===jobId?{...previous,verification:value}:previous);
    if(['pending','running'].includes(value.state))timer=setTimeout(()=>void load(),2500);else{setRevision(n=>n+1);done.current?.();}
   }catch(e){if(!abort.signal.aborted)setError(readFailure(e,'Website verification'));}
  };
  timer=setTimeout(()=>void load(),2500);
  return()=>{abort.abort();clearTimeout(timer);};
 },[active,jobId,polling,path]);
 async function send(operation:'verify'|'decision'|'apply'|'reconcile',body:Record<string,unknown>){
  if(!detail||busy||!canManage)return;
  setBusy(true);setError('');setNotice('');mutation.current?.abort();
  const abort=new AbortController();mutation.current=abort;
  const action=`source-resolution:${taskId}:${operation}`;
  try{
   await workflowRequest(operation==='decision'?`/v1/requests/${requestId}/source-reviews/${taskId}`:`${path}/${operation}`,
    {body,key:mutationKey(owner,action,body),signal:abort.signal});
   if(abort.signal.aborted)return;
   acknowledged(owner,action);setNotice(operation==='verify'?'Website verification started.':operation==='decision'?'Decision saved.':'Repair confirmation saved.');
   setRevision(n=>n+1);onDone?.();
  }catch(e){if(!abort.signal.aborted)setError(readFailure(e,'Source action'));}
  finally{if(!abort.signal.aborted)setBusy(false);}
 }
 function decision(){
  if(!detail)return;
  void send('decision',{version:detail.item.version,revision:detail.item.revision,decision:choice==='reenable'?'unreviewed':choice,
   reason:note.trim(),reenable:choice==='reenable',confirmed_scope:confirmed,preview_token:detail.preview_token});
 }
 if(!canManage)return <section aria-label="Source review"><h2>Admin review required</h2><p>Users can view source status. An Admin manages repairs and check exclusions.</p><button className="text-button" type="button" onClick={onBack}>Back to source status</button></section>;
 const item=detail?.item,verification=detail?.verification,exclusion=['no_website','wont_address','reenable'].includes(choice);
 const apply=(operation:'apply'|'reconcile')=>detail&&verification&&void send(operation,{job_id:verification.job_id,confirmed_scope:confirmed,preview_token:detail.preview_token});
 return <section className="source-resolution" aria-label="Source review">
  <button className="text-button" type="button" onClick={onBack}>Back to source status</button>
  <h2 ref={heading} tabIndex={-1}>{item?.name??'Review source'}</h2>
  {loading&&!detail&&<p role="status">Loading source review…</p>}
  {error&&<p role="alert">{error} <button type="button" className="text-button" onClick={()=>{setError('');setRevision(n=>n+1);}}>Reload review</button></p>}
  {notice&&<p role="status">{notice} {onNext&&<button type="button" className="text-button" onClick={onNext}>Next source</button>}</p>}
  {detail&&item&&<>
   <p className="source-resolution-location">{item.location} · {item.category==='source_entry'?'Website entry':item.category}</p>
   <h3>{item.decision==='fixed_verified'?'Source setup verified':item.current?.title??item.title}</h3>
   <p>{item.decision==='fixed_verified'?'The verified setup was saved. Earlier run results remain unchanged.':item.current?.impact??item.impact}</p>
   <p><strong>{sourceDecisionLabels[item.decision]}</strong>{item.reviewed_at?` · Last admin decision: ${formatLocal(item.reviewed_at)}`:''}</p>
   {item.reviewed_at&&<small>Reviewed by {item.reviewed_by_label??'Admin · name unavailable'}</small>}
   {item.checks_excluded&&<p role="status">Checks disabled by admin decision. Other source checks continue. {detail.can_reenable?
    <button type="button" className="text-button" onClick={()=>{setChoice('reenable');setConfirmed(false);if(!note)setNote('Resume this verified source check');}}>Re-enable checks</button>:
    <span>Verify a usable website and method before re-enabling.</span>}</p>}
   {item.check.last_success_at&&<p>Last successful check: {formatLocal(item.check.last_success_at)}</p>}
   {verification&&<section className="source-verification" aria-label="Website verification"><h3>{verification.title}</h3><p>{verification.explanation}</p>
    {(verification.can_apply_website||verification.can_apply_method||verification.needs_reconciliation)&&<>
     <Impact detail={detail}/><label className="source-confirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the affected scope and schedules.</label>
     <button type="button" className="primary-button compact" disabled={!confirmed||busy||loading} onClick={()=>apply(verification.needs_reconciliation?'reconcile':'apply')}>
      {verification.needs_reconciliation?'Reconcile saved repair':verification.can_apply_website?'Use this website':'Apply verified method'}</button>
    </>}
   </section>}
   <fieldset className="source-decision-choices" disabled={busy}><legend>Choose the next action</legend>
    {choices.map(c=><label key={c.value}><input type="radio" name={`source-decision-${taskId}`} value={c.value} checked={choice===c.value} onChange={()=>{setChoice(c.value);setConfirmed(false);setNotice('');}}/>{c.label}</label>)}
   </fieldset>
   {choice==='provide_website'?<div className="source-website-form"><label className="input-field"><span>Official website</span><input type="url" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://"/></label>
    <p>We verify the location and public website first, then check whether its listings can be supported. A working homepage alone does not fix a listing problem.</p>
    <button type="button" className={`${verification?'secondary':'primary'}-button compact`} disabled={!website.trim()||busy||polling||loading} onClick={()=>void send('verify',{url:website.trim(),version:item.version,revision:item.revision})}>Verify website</button>
   </div>:<div className="source-decision-form">
    {choice==='no_website'&&<p>Record that no usable public website was found for this check. This is an admin assessment.</p>}
    {choice==='no_issue'&&<p>Record your review conclusion. The original check result and future check eligibility remain unchanged.</p>}
    {choice==='wont_address'&&<p>Accept this source gap. It will remain visible as a coverage limitation.</p>}
    {choice==='needs_developer'&&<p>A developer needs to review source access or collection support. This records an internal handoff; it sends no message or ticket.</p>}
    {choice==='reenable'&&<p>Restore this source check for future runs. This does not change earlier results or rerun the schedule.</p>}
    {choice==='unreviewed'&&<p>Reopen this review. Any existing check exclusion stays in place until an admin explicitly re-enables it.</p>}
    <label className="input-field"><span>Short reason</span><textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
    {exclusion&&<><Impact detail={detail}/><label className="source-confirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{choice==='reenable'?'Restore only the affected check.':'Skip this check until an admin re-enables it.'}</label></>}
    <button type="button" className="primary-button compact" disabled={!note.trim()||busy||loading||exclusion&&!confirmed} onClick={decision}>{choice==='reenable'?'Re-enable checks':'Save decision'}</button>
   </div>}
   <details><summary>Review details</summary><p>{detail.reason||'No earlier review reason recorded.'}</p><p>What was checked in the selected run: {item.title}. {item.impact}</p><p>Saved check updated: {item.check.observed_at?formatLocal(item.check.observed_at):'Time unavailable'}</p>
    {detail.history.length>0&&<ol>{detail.history.map(e=><li key={e.id}><strong>{sourceDecisionLabels[e.decision as SourceDecision]??'Review recorded'}</strong> · {formatLocal(e.at)}<p>{e.reason}</p></li>)}</ol>}
    {detail.more_history&&<p>Showing the latest 20 review events. Earlier audit events are retained.</p>}
    <button className="text-button" type="button" onClick={()=>{
     const reference=verification?.diagnostic_reference??item.id??taskId;
     if(!navigator.clipboard){setError(`Copy is unavailable. Developer reference: ${reference}`);return;}
     void navigator.clipboard.writeText(`${item.name} · ${item.location} · ${item.category}\n${item.title}\n${item.impact}\n${note||detail.reason}\nReference: ${reference}`)
      .then(()=>setNotice('Developer summary copied.')).catch(()=>setError(`Could not copy the summary. Developer reference: ${reference}`));
    }}>Copy developer summary</button>
   </details>
   {onTechnicalDetails&&<details><summary>Technical details</summary><button className="text-button" type="button" onClick={onTechnicalDetails}>Open related technical evidence</button></details>}
   {item.decision!=='unreviewed'&&<button type="button" className="text-button" onClick={()=>{setChoice('unreviewed');setConfirmed(false);}}>Reopen review</button>}
  </>}
 </section>;
}
function Impact({detail}:{detail:SourceResolutionDetail}){return <div className="source-shared-impact"><strong>{detail.impact.scope}</strong><p>{detail.impact.explanation}</p>
 {detail.impact.schedules.length?<details><summary>{detail.impact.schedules.length} related {detail.impact.schedules.length===1?'schedule':'schedules'}</summary><ul>{detail.impact.schedules.map(s=><li key={s.id}>{s.name}</li>)}</ul></details>:<p>No active related schedule is recorded for this scope.</p>}</div>;}

export function SourceResolution(props:Parameters<typeof SourceResolutionContent>[0]){
 return <SourceResolutionContent key={`${props.owner}:${props.requestId}:${props.taskId}`} {...props}/>;
}
