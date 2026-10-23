import {Breadcrumb} from './Breadcrumb';
import {useEffect,useRef,useState} from 'react';
import {workflowRequest,mutationKey,acknowledged} from '../../lib/procurement-workflow';
import {CountySelector} from './CountySelector';
import {LeadWindowFields,WorkFields} from './TriggerForm';
import {ScheduleFields} from './ScheduleFields';
import {InfoTooltip} from '../shared/components/InfoTooltip';
import {initialScheduleDraft,invalidDraft,invalidScheduleTiming,formatLocal} from './model';
import type {AnySchedule,County,Draft,StateSource,Preview,SamConfig} from './types';
type Resolved={config:Preview['config']|SamConfig;preview_hash:string;next_due_at?:string|null;conflicts?:{schedule_id:string;name:string;county_id:string;work:string}[]};
const identity=(p:Resolved)=>JSON.stringify(p.config.target_kind==='sam'?{target:'sam',categories:p.config.requested_categories}:{target:p.config.target_kind,sources:p.config.state_trigger_ids??[p.config.state_trigger_id],members:p.config.state_sources,counties:p.config.counties});
export function ScheduleEditor({owner,saved,target:initialTarget,counties,sources,registryState,initial,onClose,onSaved,onSchedules}:{owner:string;saved?:AnySchedule;target:string;counties:County[];sources:StateSource[];registryState:'loading'|'ready'|'error';initial?:Draft;onClose:()=>void;onSchedules?:()=>void;onSaved:(s:AnySchedule)=>void}){
 const storage=`spin-schedule-form:${owner}:${saved?.id??'new'}`;
 const restored=()=>{try{const old=JSON.parse(sessionStorage.getItem(storage)||'null');return old?.version===saved?.version?old:null;}catch{return null;}};
 const [target,setTarget]=useState(saved?.config.target_kind??restored()?.target??initialTarget);
 const [draft,setDraft]=useState<Draft>(()=>restored()?.draft??(saved?{...saved,config:saved.config.target_kind==='sam'?initialScheduleDraft().config:saved.config,window_policy:saved.config.target_kind==='sam'?initialScheduleDraft().window_policy:saved.window_policy as Draft['window_policy']}:{...initialScheduleDraft(),name:initial?.name??'',config:{...initialScheduleDraft().config,county_ids:initial?.config.county_ids??[],...(initialTarget==='state_source'?{target_kind:'state_source' as const,state_trigger_id:initial?.config.state_trigger_id,state_trigger_ids:initial?.config.state_trigger_ids,requested_categories:initial?.config.requested_categories??['opportunity'] as const}:{})}}));
 const [selections,setSelections]=useState<Record<string,Draft['config']>>(()=>restored()?.selections??{});
 const [geography,setGeography]=useState<County[]>(counties),[geoError,setGeoError]=useState(''),[geoRevision,setGeoRevision]=useState(0);
 useEffect(()=>{const a=new AbortController();setGeoError('');void workflowRequest<{counties:County[]}>('/v1/counties?include=scope',{signal:a.signal}).then(r=>{if(!a.signal.aborted&&Array.isArray(r.counties))setGeography(r.counties);}).catch(()=>{if(!a.signal.aborted)setGeoError('City lists could not load.');});return()=>a.abort();},[geoRevision]);
 const [category,setCategory]=useState<'opportunity'|'award'>(()=>{try{const old=restored();if(old?.category==='opportunity'||old?.category==='award')return old.category;}catch{/* use saved */}return saved?.config.target_kind==='sam'?saved.config.requested_categories[0]:'opportunity';});
 const [lookback,setLookback]=useState(()=>{try{const old=restored();if(Number.isInteger(old?.lookback))return old.lookback;}catch{/* use saved */}return saved?.config.target_kind==='sam'?Number((saved.window_policy[saved.config.requested_categories[0]] as {lookback_days:number}).lookback_days):120;});
 const [sourceQuery,setSourceQuery]=useState('');
 const [preview,setPreview]=useState<Resolved|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),heading=useRef<HTMLHeadingElement>(null),pending=useRef(false);
 const sourceGroups=[...new Set(sources.map(s=>s.source_id))].map(id=>({id,name:sources.find(s=>s.source_id===id)!.name,associations:sources.filter(s=>s.source_id===id)}));
 const selectedIds=draft.config.state_trigger_ids??(draft.config.state_trigger_id?[draft.config.state_trigger_id]:[]);
 const selectedSourceIds=[...new Set(selectedIds.map(id=>sources.find(s=>s.id===id)?.source_id).filter((id):id is string=>!!id))];
 const stateAssociations=sources.filter(s=>selectedSourceIds.includes(s.source_id)&&draft.config.requested_categories.includes(s.category)).filter((s,i,all)=>all.findIndex(a=>a.source_id===s.source_id&&a.category===s.category)===i);
 const stateCounties=[...new Set(stateAssociations.flatMap(s=>s.county_ids))].sort();
 const stateCoverageError=target==='state_source'?(selectedSourceIds.some(id=>!stateAssociations.some(s=>s.source_id===id))?'Each source needs a selected supported lead type.':draft.config.requested_categories.some(k=>!stateAssociations.some(s=>s.category===k))?'Each lead type needs a selected source.':''):'';
 const stateConfig={...draft.config,target_kind:'state_source',state_trigger_ids:stateAssociations.map(s=>s.id).sort(),state_trigger_id:stateAssociations.length===1?stateAssociations[0].id:null,county_ids:stateCounties};
 const input=target==='sam'?{name:draft.name,enabled:draft.enabled,recurrence:draft.recurrence,config:{target_kind:'sam',requested_categories:[category]},window_policy:{[category]:{lookback_days:lookback}}}:{...draft,config:target==='state_source'?stateConfig:{...draft.config,target_kind:target}};
 const serialized=JSON.stringify(input);
 const validationDraft=target==='state_source'?{...draft,config:{...stateConfig,target_kind:'state_source' as const}}:draft;
 const invalid=target==='sam'?(!draft.name.trim()?'Enter a schedule name.':!Number.isInteger(lookback)||lookback<1||lookback>366?'Choose a lookback from 1 to 366 days.':invalidScheduleTiming(draft)):stateCoverageError||invalidDraft(validationDraft,true);
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView?.({block:'start'});},[]);
 useEffect(()=>{try{sessionStorage.setItem(storage,JSON.stringify({draft,target,selections,category,lookback,version:saved?.version}));}catch{/* retain mounted draft */}},[draft,target,selections,category,lookback,storage,saved?.version]);
 useEffect(()=>{
  const version=++generation.current,a=new AbortController();setPreview(null);setError('');
  if(invalid)return;
  const timer=setTimeout(()=>{void workflowRequest<Resolved>('/v1/schedules/preview',{body:{...JSON.parse(serialized),schedule_id:saved?.id},signal:a.signal}).then(p=>{if(version===generation.current&&!a.signal.aborted)setPreview(p);}).catch(e=>{if(!a.signal.aborted&&version===generation.current)setError(e.message);});},350);
  return()=>{clearTimeout(timer);a.abort();};
 },[serialized,invalid,saved?.id]);
 const save=async()=>{
  if(pending.current||!preview||invalid||preview.conflicts?.length)return;
  pending.current=true;setBusy(true);setError('');const version=generation.current,captured=preview,bodyInput=JSON.parse(serialized);
  const action=`schedule-editor:${saved?.id??'new'}`;
  try{
   const p=await workflowRequest<Resolved>('/v1/schedules/preview',{body:{...bodyInput,schedule_id:saved?.id}});
   if(version!==generation.current)return;
   if(p.conflicts?.length){setPreview(p);throw Error('This work was reserved by another schedule. Review the conflict below.');}
   if(identity(p)!==identity(captured)){setPreview(p);throw Error('The resolved scope changed. Check the updated scope below, then save again.');}
   const body={...bodyInput,confirmed_scope:true,preview_hash:p.preview_hash,...(saved?{expected_version:saved.version}:{})};
   const result=await workflowRequest<AnySchedule>(saved?`/v1/schedules/${saved.id}/update`:'/v1/schedules',{body,key:mutationKey(owner,action,body)});
   acknowledged(owner,action);sessionStorage.removeItem(storage);onSaved(result);
  }catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}
 };
 const choose=(next:string)=>{if(next===target)return;generation.current++;setPreview(null);setSelections({...selections,[target]:draft.config});setTarget(next);setDraft({...draft,config:{...draft.config,...(selections[next]??{county_ids:[],state_trigger_ids:[],state_trigger_id:null}),target_kind:next==='state_source'?'state_source':'county_scope',requested_categories:draft.config.requested_categories,maintain_sources:draft.config.maintain_sources,check_updates:draft.config.check_updates}});};
 const toggleSource=(id:string,checked:boolean)=>{const selected=new Set(selectedSourceIds);if(checked)selected.add(id);else selected.delete(id);setDraft({...draft,config:{...draft.config,state_trigger_id:null,state_trigger_ids:sources.filter(s=>selected.has(s.source_id)).map(s=>s.id)}});};
 const included=target==='state_source'?stateCounties:draft.config.county_ids;
 const scopeCounties=saved&&target==='county_scope'?saved.config.target_kind!=='sam'?saved.config.counties:undefined:undefined;
 return <section className="admin-section schedule-editor" aria-label="Schedule editor">
  <Breadcrumb items={[{label:'Settings'},{label:'Schedules',ariaLabel:'Back to schedules',onClick:()=>{if(!busy)(onSchedules??onClose)();}},...(saved?[{label:saved.name,onClick:()=>{if(!busy)onClose();}}]:[]),{label:saved?'Edit schedule':'Add schedule'}]}/>
  <h2 ref={heading} tabIndex={-1}>{saved?'Edit schedule':'Add schedule'}</h2>
  <fieldset disabled={busy}><legend>Schedule type</legend>{saved?<span>{target==='sam'?'SAM.gov':target==='state_source'?'State':'Counties'}</span>:<div className="admin-inline">{[['county_scope','Counties'],['state_source','State'],['sam','SAM.gov']].map(([id,label])=><label key={id}><input type="radio" name="schedule-type" checked={target===id} onChange={()=>choose(id)}/>{label}</label>)}</div>}</fieldset>
  <label className="input-field">Schedule name<input maxLength={80} disabled={busy} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
  <ScheduleFields draft={draft} pending={busy} compact onChange={v=>setDraft({...draft,...v})}/>
  {target==='sam'?<><fieldset disabled={busy}><legend>Lead types</legend><label>Look for<select value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="opportunity">Opportunities</option><option value="award">Awards</option></select></label></fieldset><fieldset disabled={busy}><legend>Date window</legend><label>Posted within the last (days)<input type="number" min={1} max={366} value={lookback} onChange={e=>setLookback(Number(e.target.value))}/></label></fieldset></>:<LeadWindowFields draft={draft} pending={busy} onChange={setDraft} schedule/>}
  {target==='county_scope'&&!saved&&<CountySelector counties={counties} registryState={registryState} selected={draft.config.county_ids} disabled={busy} onChange={ids=>setDraft({...draft,config:{...draft.config,county_ids:ids}})}/>}
  {target==='state_source'&&<fieldset disabled={busy} className="state-source-choices"><legend>State sources · {selectedSourceIds.length} selected</legend><label>Find state sources<input type="search" value={sourceQuery} onChange={e=>setSourceQuery(e.target.value)}/></label>{sourceGroups.filter(s=>selectedSourceIds.includes(s.id)||s.name.toLowerCase().includes(sourceQuery.toLowerCase())).map(s=><label key={s.id} className="state-source-choice"><input type="checkbox" checked={selectedSourceIds.includes(s.id)} onChange={e=>toggleSource(s.id,e.target.checked)}/><span>{s.name}<small>{[...new Set(s.associations.map(a=>a.category))].join(' · ')}</small></span></label>)}{!sources.length&&<small>No saved state sources.</small>}</fieldset>}
  <section className="included-geography"><h3>Included geography {saved&&target==='county_scope'&&<InfoTooltip label="About saved counties">To change counties, archive this schedule and create a new one.</InfoTooltip>}</h3>
   {target==='sam'?<p>Arkansas statewide · NAICS 561720</p>:<>{target==='state_source'&&<small>Routing geography; work locations are verified per record.</small>}{!included.length&&<p>Select {target==='state_source'?'state sources':'counties'}.</p>}{included.map(id=>{const c=scopeCounties?.find(c=>c.id===id)??geography.find(c=>c.id===id)??counties.find(c=>c.id===id);return <details key={id}><summary>{c?.name??id} ({c?.cities?`${c.cities.length} cities`:'cities unavailable'})</summary>{c?.cities?<p>{c.cities.map(city=>city.name).join(', ')||'No incorporated cities'}</p>:<p role="status">{geoError||'Loading cities…'}</p>}</details>;})}{geoError&&<button type="button" className="text-button" onClick={()=>setGeoRevision(n=>n+1)}>Retry city lists</button>}</>}
  </section>
  {target!=='sam'&&<details className="schedule-work"><summary>Work · {[draft.config.maintain_sources?'Maintain sources':null,draft.config.check_updates?'Check for lead updates':null].filter(Boolean).join(' · ')||'Choose work'}</summary><WorkFields draft={draft} pending={busy} onChange={setDraft}/></details>}
  {preview?.conflicts?.map(c=><p role="alert" key={c.county_id+c.work}>{counties.find(x=>x.id===c.county_id)?.name??c.county_id} · {c.work==='state_source'?'State update':c.work==='maintain_sources'?'Maintain sources':'Check for lead updates'} is reserved by {c.name}. Archive that schedule or choose different work. <a href={`?adminView=schedules&adminSection=overview&adminSchedule=${encodeURIComponent(c.schedule_id)}`}>View {c.name}</a></p>)}
  {error&&<p role="alert">{error}</p>}{invalid&&<p role="status">{invalid}</p>}
  <div className="schedule-editor-footer"><label><input type="checkbox" disabled={busy} checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/> Enabled</label><button type="button" className="primary-button" disabled={busy||!preview||!!invalid||!!preview.conflicts?.length} onClick={()=>void save()}>{busy?'Saving…':saved?'Save changes':'Save schedule'}</button><button type="button" className="text-button" disabled={busy} onClick={onClose}>Cancel</button></div>
  <p className="admin-hint">Next run · {preview?preview.next_due_at?formatLocal(preview.next_due_at):'Paused':invalid||error||'Checking schedule…'}</p>
 </section>;
}
