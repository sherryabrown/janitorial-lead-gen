import {duration,formatLocal,title,usageText} from './model';
import type {Run,Step} from './types';
export function RunStepLog({steps,run,cursor,onMore}:{steps:Step[];run:Run|null;cursor:string|null;onMore:()=>void}){
 return <section aria-label="Run step logs"><details open><summary>Steps · {steps.length}</summary>
  {!steps.length&&<small>No loaded step records. Refresh progress if a check is still running.</small>}
  <div className="admin-step-list">{steps.map(s=><div key={s.id}>
   <strong>{title(s.phase)} · {title(s.state)}</strong>
   <p>{run?.config?.target_kind!=='sam'&&run?.config?.counties?.find(c=>c.id===s.county_id)?.name||s.county_id||'Shared scope'} · {s.source_name??s.source_id??'Shared step'} · {s.started_at?formatLocal(s.started_at):'Start unknown'} · {s.finished_at?duration(Number.isFinite(Date.parse(s.finished_at))&&Number.isFinite(Date.parse(s.started_at))&&Date.parse(s.finished_at)>=Date.parse(s.started_at)?Date.parse(s.finished_at)-Date.parse(s.started_at):null):['started','running'].includes(s.state)?'In progress':'Finish unknown'} · {title(s.reason)}</p>
   <small>{usageText(s.usage)}</small><small>AI credits: {s.usage?.ai==='not_used'?'Not used':s.usage?.credits!=null?`${s.usage.credits} ${s.usage.credit_unit}`:'Unknown'}{s.usage?.held_usd?` · $${s.usage.held_usd} reserved`:''}</small>
   {s.diagnostic_id&&<small>Diagnostic reference: {s.diagnostic_id}</small>}
   {Boolean(s.summary?.outcome)&&<p>{title(String(s.summary.outcome))}</p>}
   <details><summary>Step references</summary><dl className="admin-facts"><dt>Sequence</dt><dd>{s.sequence}</dd><dt>Origin</dt><dd>{title(s.origin)}</dd><dt>Source ID</dt><dd>{s.source_id??'Shared step'}</dd></dl></details>
  </div>)}</div>{cursor&&<button type="button" className="text-button" onClick={onMore}>More steps</button>}
 </details></section>;
}
