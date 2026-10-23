import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {leadScopeLocation,metricPath,metricLabels,type MetricScope,type MetricMembers} from './metric-scope';
const Context=createContext<{leads:(scope:MetricScope)=>void;issues:(scope:MetricScope)=>void}|null>(null);
export function RunLeadCount({id,metric,value,identity=true,children,filters={},snapshot}:{id:string;metric:string;value:number|null|undefined;identity?:boolean;children?:ReactNode;filters?:Record<string,string>;snapshot?:string}){
 return identity?<MetricLink scope={{metric,label:`Run ${id} · ${metricLabels[metric]??metric}`,filters:{run:id,period:'all',...filters,...(snapshot?{identity_snapshot:snapshot}:{})}}} value={value}>{children??value??'Unknown'}</MetricLink>:<span title="Historical lead identities were not recorded">{children??value} · identities unavailable</span>;
}
export function MetricLink({scope,value,children}:{scope:MetricScope;value:number|null|undefined;children?:ReactNode}){
 const navigation=useContext(Context);
 if(value==null||!navigation)return <>{children??value??'Unknown'}</>;
 const issue=['candidates_attention','validation_failures','sources_attention','route_gaps'].includes(scope.metric);
 return <a className="text-button metric-link" href={issue?'#metric-issues':leadScopeLocation({...scope,expected:value}).toString()} aria-label={`${scope.label}: ${value}`} onClick={e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigation[issue?'issues':'leads']({...scope,expected:value});}}>{children??value}</a>;
}
export function MetricNavigation({onLeads,onRun,children,active=true}:{onLeads:(scope:MetricScope)=>void;onRun:(id:string,requestId?:string)=>void;children:ReactNode;active?:boolean}){
 const [scope,setScope]=useState<MetricScope|null>(null),[data,setData]=useState<MetricMembers|null>(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const anchor=useRef<{as_of:string;snapshot:string}|null>(null),origin=useRef<HTMLElement|null>(null),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(!scope||!active)return;const a=new AbortController();setError('');setData(null);void workflowRequest<MetricMembers>(metricPath({...scope,filters:{...scope.filters,...anchor.current}},offset),{signal:a.signal}).then(r=>{if(r.unavailable)throw Error(r.unavailable);if(r.kind!=='issues')throw Error('Issue details unavailable.');if(!a.signal.aborted){anchor.current={as_of:r.as_of,snapshot:r.snapshot};setData(r);}}).catch(e=>{if(!a.signal.aborted)setError((e as Error).message);});return()=>a.abort();},[scope,offset,revision,active]);
 useEffect(()=>{if(scope)heading.current?.focus();},[scope]);
 const close=()=>{setScope(null);requestAnimationFrame(()=>origin.current?.focus());};
 return <Context.Provider value={{leads:onLeads,issues:value=>{origin.current=document.activeElement as HTMLElement;anchor.current=null;setOffset(0);setScope(value);}}}>
 {scope&&<section className="admin-screen admin-section metric-issues" aria-label="Collection and validation issue details"><button type="button" className="text-button" onClick={close}>Back to results</button><h2 ref={heading} tabIndex={-1}>{scope.label}</h2>{error?<p role="alert">{error} <button type="button" onClick={()=>setRevision(n=>n+1)}>Retry issue details</button></p>:!data?<p role="status">Loading issue details…</p>:<><div className="schedule-table-wrap"><table className="schedule-table"><caption>{data.total} matching issues</caption><thead><tr><th>Issue</th><th>Blocker</th><th>Next action</th></tr></thead><tbody>{data.items.map(i=><tr key={i.kind+':'+i.id}><td data-label="Issue">{i.kind}<small>{i.id}</small></td><td data-label="Blocker">{i.blocker}</td><td data-label="Next action"><div>{i.next_action}{i.run_id&&<button type="button" className="text-button" onClick={()=>{setScope(null);onRun(i.run_id!,i.request_id);}}>Open saved run results</button>}</div></td></tr>)}</tbody></table></div>{!data.total&&<p>No matching issues.</p>}<button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous issues</button><button type="button" disabled={data.next_offset===null} onClick={()=>setOffset(data.next_offset!)}>Next issues</button></>}</section>}
 <div hidden={!!scope}>{children}</div></Context.Provider>;
}
