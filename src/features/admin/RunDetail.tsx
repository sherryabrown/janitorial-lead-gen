import { useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { RequestReview } from './RequestReview';
import {RunStepLog} from './RunStepLog';
import {duration} from './model';
import type { Run, Step } from './types';
import { activeRun, title, usageText, formatLocal, runLabel, hasSourceAttention } from './model';
function savedLogPage(owner:string,id:string){try{const n=Number(sessionStorage.getItem(`spin-admin-log-page:${owner}:${id}`));return Number.isInteger(n)&&n>0&&n<=5000?n:0;}catch{return 0;}}
export function RunDetail({
  id,
  owner,
  onClose,
  onViewLeads,
  onSource,
  changed,
  section:requestedSection,onSection,
}: {
  id: string;
  owner: string;
  onClose: () => void;
  onViewLeads: () => void;
  onSource: (id: string) => void;
  changed: () => void;
  section?:'overview'|'logs'|'sources';onSection?:(section:'overview'|'logs'|'sources')=>void;
}) {
  const [run, setRun] = useState<Run | null>(null),
    [steps, setSteps] = useState<Step[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [child, setChild] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [localSection,setLocalSection]=useState<'overview'|'logs'|'sources'>('overview');
  const section=requestedSection??localSection;
  const heading=useRef<HTMLHeadingElement>(null),lastId=useRef(''),loadedSteps=useRef(50);
  const changedRef = useRef(changed),
    pageGeneration = useRef(0),
    morePending = useRef(false);
  useEffect(() => {
    changedRef.current = changed;
  }, [changed]);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      delay = 2500,
      previous = '';
    const epoch = ++pageGeneration.current;
    if(lastId.current!==id){lastId.current=id;loadedSteps.current=savedLogPage(owner,id);setRun(null);setChild('');setSteps([]);}
    morePending.current = false;
    setError('');
    const load = async () => {
      try {
        const target=loadedSteps.current;
        const [status, logs] = await Promise.allSettled([
          workflowRequest<Run>(`/v1/triggers/${id}`, {
            signal: abort.signal,
          }),
          (async()=>{const result:{items:Step[];next_cursor:string|null}={items:[],next_cursor:null};do{const next=await workflowRequest<{items:Step[];next_cursor:string|null}>(`/v1/triggers/${id}/steps${result.next_cursor?`?cursor=${result.next_cursor}`:''}`,{signal:abort.signal});result.items.push(...next.items);result.next_cursor=next.next_cursor;}while(result.next_cursor&&result.items.length<target);return result;})(),
        ]);
        if (abort.signal.aborted) return;
        if(logs.status==='fulfilled'){
          const s=logs.value;
          setSteps((old) =>
            [
              ...new Map(
                [...old, ...s.items].map((step) => [step.id, step]),
              ).values(),
            ].sort((a, b) => a.sequence - b.sequence),
          );
          if(target===loadedSteps.current){setCursor(s.next_cursor);loadedSteps.current=s.items.length;}
        }
        if(status.status==='rejected'||logs.status==='rejected')setError('Some run data could not load. Loaded progress and logs remain available.');else setError('');
        if(status.status==='rejected')return;
        const r=status.value;setRun(r);
        setChild((c) => c || r.children?.[0]?.request_id || '');
        if (previous && previous !== r.state) changedRef.current();
        previous = r.state;
        if (activeRun(r.state)) {
          timer = setTimeout(load, delay);
          delay = Math.min(delay * 1.5, 15000);
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      pageGeneration.current = epoch + 1;
      abort.abort();
      clearTimeout(timer);
    };
  }, [id, refresh,owner]);
  const hasRun=!!run;
  useEffect(()=>{heading.current?.focus();},[id,section,hasRun]);
  const control = async (action: string) => {
    setBusy(true);
    try {
      await workflowRequest(`/v1/triggers/${id}/${action}`, { body: {} });
      setRefresh((n) => n + 1);
      changedRef.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const more = async () => {
    if (!cursor || morePending.current) return;
    const generation = pageGeneration.current;
    morePending.current = true;
    const start = cursor;
    try {
      const s = await workflowRequest<{
        items: Step[];
        next_cursor: string | null;
      }>(`/v1/triggers/${id}/steps?cursor=${start}`);
      if (generation !== pageGeneration.current) return;
      loadedSteps.current+=s.items.length;
      try{sessionStorage.setItem(`spin-admin-log-page:${owner}:${id}`,String(loadedSteps.current));}catch{/* Mounted logs remain. */}
      setSteps((x) => [
        ...x,
        ...s.items.filter((i) => !x.some((a) => a.id === i.id)),
      ]);
      setCursor(s.next_cursor);
    } catch (e) {
      if (generation === pageGeneration.current) setError((e as Error).message);
    } finally { if (generation === pageGeneration.current) morePending.current = false; }
  };
  return (
    <section
      className="admin-run-detail"
      aria-label="Run details"
      tabIndex={-1}
    >
      <div className={`admin-section-heading${run && hasSourceAttention(run) ? ' has-source-attention' : ''}`}>
        <h2 ref={heading} tabIndex={-1}>{run ? runLabel(run) : 'Loading run…'}</h2>
        <button type="button" className="text-button" onClick={onClose}>
          Close details
        </button>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!run && <button type="button" className="text-button" onClick={() => setRefresh(n => n + 1)}>Retry progress</button>}
          <nav className="admin-workspace-nav detail-sections" aria-label="Run sections">{(['overview','logs','sources'] as const).map(value=><button key={value} type="button" className="text-button" aria-current={section===value?'page':undefined} onClick={()=>{setLocalSection(value);onSection?.(value);}}>{title(value)}</button>)}</nav>
      {run && (
        <>
          <div hidden={section!=='overview'}><dl className="admin-facts"><dt>Next action</dt><dd>{run.next_action}</dd><dt>Origin</dt><dd>{title(run.origin)}</dd><dt>Created</dt><dd>{formatLocal(run.created_at)}</dd><dt>Finished</dt><dd>{run.finished_at?formatLocal(run.finished_at):'Unknown'}</dd><dt>Recorded activity</dt><dd>{duration(run.reporting?.timing?.recorded_activity_ms)}{run.reporting?.timing?.completeness==='partial'?' · partial intervals':''}{run.reporting?.timing?.reason&&<small>{run.reporting.timing.reason}</small>}</dd><dt>Created → finished</dt><dd>{duration(run.reporting?.timing?.created_to_finished_ms)}</dd><dt>AI usage</dt><dd>{usageText(run.usage)}</dd><dt>New / updated / unchanged</dt><dd>{run.reporting?.leads?.completeness==='known'?`${run.reporting.leads.added} / ${run.reporting.leads.updated} / ${run.reporting.leads.unchanged}`:run.reporting?.leads?.completeness==='not_applicable'?'Not applicable':'Unknown'}</dd><dt>Category breakdown</dt><dd>{run.reporting?.categories?.completeness==='known'?`${run.reporting.categories.forecast} forecasts · ${run.reporting.categories.opportunity} opportunities (${run.reporting.categories.historical_opportunity??'Unknown'} historical) · ${run.reporting.categories.award} awards`:run.reporting?.categories?.reason??'Historical category attribution unavailable'}</dd><dt>Candidates needing attention</dt><dd>{run.reporting?.candidates_attention?.value??'Unknown · review candidate validation'}</dd><dt>Source checks needing attention</dt><dd>{run.presentation?.outcome==='source_attention'?run.presentation.attention_count:'See saved source checks'}</dd></dl></div>

          <div className="admin-inline">
            {activeRun(run.state) && (
              <button
                type="button"
                className="secondary-button compact"
                disabled={busy}
                onClick={() => void control('cancel')}
              >
                Stop run
              </button>
            )}
            {['cancelled', 'partial'].includes(run.state) && (
              <button
                type="button"
                className="secondary-button compact"
                disabled={busy}
                onClick={() => void control('resume')}
              >
                Resume run
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Refresh progress
            </button>
            <button
              type="button"
              className="text-button"
              onClick={onViewLeads}
            >
              View leads
            </button>
          </div>
          <details>
            <summary>
              Saved scope ·{' '}
              {run.config?.target_kind === 'sam'
                ? 'SAM — Arkansas statewide'
                : `${run.config?.county_ids.length ?? 0} counties`}
            </summary>
            {run.config?.target_kind !== 'sam' &&
              run.config?.counties?.map((c) => (
                <p key={c.id}>
                  {c.name}:{' '}
                  {c.cities.map((x) => x.name).join(', ') || 'County sources'}
                </p>
              ))}
          </details>
          <details><summary>Run identity and timing basis</summary><dl className="admin-facts"><dt>Run ID</dt><dd>{run.id}</dd><dt>Schedule ID</dt><dd>{run.schedule_id??'Standalone run'}</dd><dt>Occurrence ID</dt><dd>{run.occurrence_id??'Not recorded'}</dd><dt>Execution start</dt><dd>Unknown · no dedicated historical start timestamp</dd><dt>Recorded activity</dt><dd>{run.reporting?.timing?.basis??'Completed step intervals; not end-to-end execution time'}</dd></dl></details>
          {!!run.related_state_sources?.length && (
            <details>
              <summary>Saved state-source results and freshness</summary>
              {run.related_state_sources.map((s) => (
                <p key={s.id}>
                  {s.name}:{' '}
                  {s.last_finished_at
                    ? formatLocal(s.last_finished_at)
                    : 'Not checked; coverage needs review'}{' '}
                  {s.latest_run && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onSource(s.latest_run!)}
                    >
                      View source trigger
                    </button>
                  )}
                </p>
              ))}
            </details>
          )}
          <div hidden={section==='logs'}><label className="input-field">
            <span>
              {run.target_kind === 'sam'
                ? 'SAM results'
                : 'County/source results'}
            </span>
            <select value={child} onChange={(e) => setChild(e.target.value)}>
              {run.children?.map((c) => (
                <option key={c.request_id} value={c.request_id}>
                  {run.config?.target_kind === 'sam'
                    ? 'Arkansas statewide'
                    : c.source_name??(run.config?.counties?.find((x) => x.id === c.county_id)
                        ?.name ?? c.county_id)}{' '}
                  · {title(c.category??c.role)}
                </option>
              ))}
            </select>
          </label>
          {child && (
            <RequestReview
              key={child}
              refreshSignal={run.state}
              id={child}
              owner={owner}
              sam={run.target_kind === 'sam'}
              onViewLeads={onViewLeads}
            />
          )}
          </div>
        </>
      )}
      <div hidden={section!=='logs'}><RunStepLog steps={steps} run={run} cursor={cursor} onMore={()=>void more()}/></div>
      {!run&&section==='sources'&&<p>Saved source scope is unavailable. Retry progress.</p>}
    </section>
  );
}
