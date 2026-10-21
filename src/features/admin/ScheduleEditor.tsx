import {useEffect,useRef,useState} from 'react';
import {workflowRequest,mutationKey,acknowledged} from '../../lib/procurement-workflow';
import {CountySelector} from './CountySelector';
import {TriggerForm} from './TriggerForm';
import {ScheduleFields} from './ScheduleFields';
import {InfoTooltip} from '../shared/components/InfoTooltip';
import {initialDraft,invalidDraft,formatLocal} from './model';
import type {AnySchedule,County,Draft,StateSource,Preview,SamConfig} from './types';
type Resolved={config:Preview['config']|SamConfig;preview_hash:string;next_due_at?:string|null};
const identity=(p:Resolved)=>JSON.stringify(p.config.target_kind==='sam'?{target:'sam',categories:p.config.requested_categories}:{target:p.config.target_kind,source:p.config.state_trigger_id,counties:p.config.counties});
export function ScheduleEditor({owner,saved,target:initialTarget,counties,sources,registryState,initial,onClose,onSaved}:{owner:string;saved?:AnySchedule;target:string;counties:County[];sources:StateSource[];registryState:'loading'|'ready'|'error';initial?:Draft;onClose:()=>void;onSaved:(s:AnySchedule)=>void}){
 const storage=`spin-schedule-form:${owner}:${saved?.id??'new'}`;
 const [target,setTarget]=useState(saved?.config.target_kind??initialTarget);
 const [draft,setDraft]=useState<Draft>(()=>{
  try{const old=JSON.parse(sessionStorage.getItem(storage)||'null');if(old?.draft&&old?.version===saved?.version)return old.draft;}catch{/* use saved data */}
  return saved?{...saved,config:saved.config.target_kind==='sam'?initialDraft().config:saved.config,window_policy:saved.config.target_kind==='sam'?initialDraft().window_policy:saved.window_policy as Draft['window_policy']}:structuredClone(initial??initialDraft());
 });
 const [category,setCategory]=useState<'opportunity'|'award'>(()=>{try{const old=JSON.parse(sessionStorage.getItem(storage)||'null');if(old?.category==='opportunity'||old?.category==='award')return old.category;}catch{/* use saved */}return saved?.config.target_kind==='sam'?saved.config.requested_categories[0]:'opportunity';});
 const [lookback,setLookback]=useState(()=>{try{const old=JSON.parse(sessionStorage.getItem(storage)||'null');if(Number.isInteger(old?.lookback))return old.lookback;}catch{/* use saved */}return saved?.config.target_kind==='sam'?Number((saved.window_policy[saved.config.requested_categories[0]] as {lookback_days:number}).lookback_days):30;});
 const [sourceQuery,setSourceQuery]=useState('');
 const [preview,setPreview]=useState<Resolved|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),heading=useRef<HTMLHeadingElement>(null),pending=useRef(false);
 const input=target==='sam'?{name:draft.name,enabled:draft.enabled,recurrence:draft.recurrence,config:{target_kind:'sam',requested_categories:[category]},window_policy:{[category]:{lookback_days:lookback}}}:{...draft,config:{...draft.config,target_kind:target}};
 const serialized=JSON.stringify(input);
 const invalid=target==='sam'?(!draft.name.trim()?'Enter a schedule name.':!Number.isInteger(lookback)||lookback<1||lookback>366?'Choose a lookback from 1 to 366 days.':''):target==='state_source'&&!draft.config.state_trigger_id?'Choose a saved state source.':invalidDraft(draft,true);
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView?.({block:'start'});},[]);
 useEffect(()=>{try{sessionStorage.setItem(storage,JSON.stringify({draft,target,category,lookback,version:saved?.version}));}catch{/* retain mounted draft */}},[draft,target,category,lookback,storage,saved?.version]);
 useEffect(()=>{
  const version=++generation.current,a=new AbortController();setPreview(null);setError('');
  if(invalid)return;
  const timer=setTimeout(()=>{void workflowRequest<Resolved>('/v1/schedules/preview',{body:JSON.parse(serialized),signal:a.signal}).then(p=>{if(version===generation.current&&!a.signal.aborted)setPreview(p);}).catch(e=>{if(!a.signal.aborted&&version===generation.current)setError(e.message);});},350);
  return()=>{clearTimeout(timer);a.abort();};
 },[serialized,invalid]);
 const save=async()=>{
  if(pending.current||!preview||invalid)return;
  pending.current=true;setBusy(true);setError('');const version=generation.current,captured=preview,bodyInput=JSON.parse(serialized);
  const action=`schedule-editor:${saved?.id??'new'}`;
  try{
   const p=await workflowRequest<Resolved>('/v1/schedules/preview',{body:bodyInput});
   if(version!==generation.current)return;
   if(identity(p)!==identity(captured)){setPreview(p);throw Error('The resolved scope changed. Check the updated scope below, then save again.');}
   const body={...bodyInput,confirmed_scope:true,preview_hash:p.preview_hash,...(saved?{expected_version:saved.version}:{})};
   const result=await workflowRequest<AnySchedule>(saved?`/v1/schedules/${saved.id}/update`:'/v1/schedules',{body,key:mutationKey(owner,action,body)});
   acknowledged(owner,action);sessionStorage.removeItem(storage);onSaved(result);
  }catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}
 };
 const choose=(next:string)=>{if(next===target)return;if(!window.confirm('Change schedule target? Settings for this unsaved target will be discarded.'))return;setTarget(next);setDraft({...initialDraft(),name:draft.name});};
 return <section className="admin-section schedule-editor" aria-label="Schedule editor"><button className="text-button" type="button" disabled={busy} onClick={onClose}>Back to schedules</button><h2 ref={heading} tabIndex={-1}>{saved?`Edit ${saved.name}`:'Add schedule'}</h2>
  <fieldset disabled={busy}><legend>Schedule target</legend>{saved?<p>{target==='sam'?'SAM.gov · Arkansas statewide':target==='state_source'?'State source':'Counties'}</p>:<div className="admin-inline">{[['county_scope','Counties'],['state_source','State source'],['sam','SAM.gov']].map(([id,label])=><label key={id}><input type="radio" name="schedule-target" checked={target===id} onChange={()=>choose(id)}/>{label}</label>)}</div>}</fieldset>
  {target==='sam'?<><p>Arkansas statewide · NAICS 561720</p><fieldset disabled={busy}><legend>SAM search</legend><label>Look for<select value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="opportunity">Opportunities</option><option value="award">Awards</option></select></label><label>Posted within the last (days)<input type="number" min={1} max={366} value={lookback} onChange={e=>setLookback(Number(e.target.value))}/></label></fieldset><ScheduleFields draft={draft} pending={busy} onChange={v=>setDraft({...draft,...v})}/></>:<>
   {target==='state_source'&&<label>Saved state source<input aria-label="Find state source" type="search" value={sourceQuery} onChange={e=>setSourceQuery(e.target.value)}/><select aria-label="Saved state source" value={draft.config.state_trigger_id??''} disabled={busy||!!saved} onChange={e=>{const source=sources.find(s=>s.id===e.target.value);if(source)setDraft({...draft,name:draft.name||source.name,config:{...draft.config,target_kind:'state_source',state_trigger_id:source.id,county_ids:source.county_ids,requested_categories:[source.category]}});}}><option value="">Choose a saved state source</option>{sources.filter(s=>s.id===draft.config.state_trigger_id||s.name.toLowerCase().includes(sourceQuery.toLowerCase())).map(s=><option key={s.id} value={s.id} data-name={s.name.toLowerCase()}>{s.name} · {s.category}</option>)}</select>{!sources.length&&<small>No saved state sources. Use county source research to discover them.</small>}</label>}
   {saved||target==='state_source'?<section><h3>Included geography</h3><p>{draft.config.counties?.map(c=>c.name).join(', ')||draft.config.county_ids.map(id=>counties.find(c=>c.id===id)?.name??id).join(', ')||'Choose a source'}</p>{target==='county_scope'&&<InfoTooltip label="About saved counties">To change counties, archive this schedule and create a new one.</InfoTooltip>}</section>:<CountySelector counties={counties} registryState={registryState} selected={draft.config.county_ids} disabled={busy} onChange={ids=>setDraft({...draft,config:{...draft.config,county_ids:ids}})}/>}
   <TriggerForm draft={draft} onChange={setDraft} editing={!!saved} saving preview={null} pending={busy} onPreview={()=>{}} onSubmit={()=>{}} onCancel={onClose} error="" monthlyCap={undefined} externalSave/>
  </>}
  <section className="schedule-settings" aria-label="Schedule scope summary"><h3>Schedule summary</h3>{preview?<><p>{target==='sam'?'SAM.gov · Arkansas statewide':preview.config.target_kind!=='sam'?preview.config.counties?.map(c=>`${c.name} · ${c.cities.length} cities`).join('; '):''}</p>{preview.config.target_kind!=='sam'&&preview.config.counties?.map(c=><details key={c.id}><summary>{c.name} · included cities</summary>{c.cities.map(city=>city.name).join(', ')||'No incorporated cities'}</details>)}<p>Next run · {preview.next_due_at?formatLocal(preview.next_due_at):'Paused'}</p></>:<p role="status">{invalid||'Checking schedule…'}</p>}</section>
  {error&&<p role="alert">{error}</p>}<div className="admin-inline"><button type="button" className="primary-button" disabled={busy||!preview||!!invalid} onClick={()=>void save()}>{busy?'Saving…':saved?'Save changes':'Save schedule'}</button><button type="button" className="text-button" disabled={busy} onClick={onClose}>Cancel</button></div>
 </section>;
}
