import {duration,formatLocal,title,usageText} from './model';
import type {Run,Step} from './types';
import {useEffect,useRef} from 'react';
export function RunStepLog({steps,run,cursor,onMore,active=true}:{steps:Step[];run:Run|null;cursor:string|null;onMore:()=>void;active?:boolean}){
 const failed=steps.find(s=>['failed','blocked','outcome_unknown'].includes(s.state))?.id,row=useRef<HTMLTableRowElement>(null);
 useEffect(()=>{if(active&&failed){row.current?.focus();row.current?.scrollIntoView?.({block:'nearest'});}},[active,failed]);
 return <section aria-label="Run step logs"><h3>Steps · {steps.length}</h3>
  {!steps.length&&<small>No loaded step records.</small>}
  <div className="schedule-table-wrap"><table className="schedule-table run-step-table"><caption className="sr-only">Run step logs · times in America/Chicago</caption><thead><tr>{['Step / status','Geography / source','Started / duration','Result / next action','AI usage','References'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{steps.map(s=><tr key={s.id} ref={s.id===failed?row:undefined} tabIndex={s.id===failed?-1:undefined}>
   <td data-label="Step / status"><strong>{title(s.phase)}</strong><small>{title(s.state)}</small></td>
   <td data-label="Geography / source">{run?.config?.target_kind==='sam'?'Arkansas statewide':run?.config?.counties?.find(c=>c.id===s.county_id)?.name||s.county_id||'Shared scope'}<small>{s.source_name??s.source_id??'Shared step'}</small></td>
   <td data-label="Started / duration">{s.started_at?formatLocal(s.started_at):'Start unknown'}<small>{s.finished_at?duration(Number.isFinite(Date.parse(s.finished_at))&&Number.isFinite(Date.parse(s.started_at))&&Date.parse(s.finished_at)>=Date.parse(s.started_at)?Date.parse(s.finished_at)-Date.parse(s.started_at):null):['started','running'].includes(s.state)?'In progress':'Finish unknown'}</small></td>
   <td data-label="Result / next action">{s.reason?title(s.reason):'Result not recorded'}{Boolean(s.summary?.outcome)&&<small>Outcome: {title(String(s.summary.outcome))}</small>}</td>
   <td data-label="AI usage">{usageText(s.usage)}<small>AI credits: {s.usage?.ai==='not_used'?'Not used':s.usage?.credits!=null?`${s.usage.credits} ${s.usage.credit_unit}`:'Unknown'}</small>{!!s.usage?.held_usd&&<small>${s.usage.held_usd} reserved</small>}</td>
   <td data-label="References"><details><summary>Step references</summary><dl className="admin-facts"><dt>Sequence</dt><dd>{s.sequence}</dd><dt>Origin</dt><dd>{title(s.origin)}</dd><dt>Source ID</dt><dd>{s.source_id??'Shared step'}</dd>{s.diagnostic_id&&<><dt>Diagnostic reference</dt><dd>{s.diagnostic_id}</dd></>}</dl></details></td>
  </tr>)}</tbody></table></div>{cursor&&<button type="button" className="text-button" onClick={onMore}>More steps</button>}
 </section>;
}
