import {closed,SchedulingRoleContext,type SchedulingCapabilities} from './scheduling-role';
import {useEffect,useState,type ReactNode} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {useActiveRead} from './use-active-read';

// The API resolves profiles.role on every request. This read only controls
// presentation; URL parameters, session drafts and local role switches cannot grant access.
export function SchedulingAccess({owner,active=true,children}:{owner:string;active?:boolean;children:ReactNode}){
 const visible=useActiveRead(active),[cap,setCap]=useState(closed),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!visible)return;
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const read=async()=>{
   try{const value=await workflowRequest<SchedulingCapabilities>('/v1/capabilities',{signal:abort.signal});
    if(abort.signal.aborted)return;
    const valid=['admin','user'].includes(value.role??'')&&value.manage_schedules;
    if(value.role!=='admin')try{for(const key of Object.keys(sessionStorage))if(key.startsWith(`spin-admin-source-note:${owner}:`)||key.startsWith(`spin-admin-source-selection:${owner}:`))sessionStorage.removeItem(key);}catch{/* Private panels still unmount. */}
    setCap(valid?{...value,manage_sources:value.role==='admin'&&value.manage_sources,technical_details:value.role==='admin'&&value.technical_details}:closed);setError(valid?'':'Your account does not have scheduling access.');
   }catch{if(!abort.signal.aborted){setCap(closed);setError('Account permissions could not be checked. Retry to continue.');}}
   if(!abort.signal.aborted)timer=setTimeout(()=>void read(),30000);
  };
  const focus=()=>{clearTimeout(timer);void read();};void read();window.addEventListener('focus',focus);
  return()=>{abort.abort();clearTimeout(timer);window.removeEventListener('focus',focus);};
 },[owner,visible,revision]);
 if(!cap.manage_schedules)return <section className="admin-section" aria-label="Scheduling access"><h1>Schedules</h1><p role={error?'alert':'status'}>{error||'Checking scheduling access…'}</p><button className="text-button" onClick={()=>setRevision(n=>n+1)}>Retry access check</button></section>;
 return <SchedulingRoleContext.Provider value={cap}><div key={`${owner}:${cap.role}`}>{children}</div></SchedulingRoleContext.Provider>;
}
