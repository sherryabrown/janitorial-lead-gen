import type {AdminContext} from './navigation';
import {runBreadcrumbs} from './run-breadcrumbs';
import {Breadcrumb} from './Breadcrumb';
import {RunLeadCount} from './MetricLink';
import {useOwnedRead} from './read-owner';
import {ReadAction} from './ReadAction';
import { useCallback, useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { RequestReview } from './RequestReview';
import {RunStepLog} from './RunStepLog';
import {duration,readFailure} from './model';
import type { Run, Step } from './types';
import { activeRun, title, usageText, formatLocal, runLabel } from './model';
function savedLogPage(owner:string,id:string){try{const n=Number(sessionStorage.getItem(`spin-admin-log-page:${owner}:${id}`));return Number.isInteger(n)&&n>0&&n<=5000?n:0;}catch{return 0;}}
export function RunDetail({
  id,
  issueRequestId,
  origin,onNavigate,
  owner,
  onClose,
  onViewLeads,
  onSource,
  changed,
  section:requestedSection,onSection,embedded=false,active=true,expectedScheduleId,
}: {
  id: string;
  issueRequestId?:string;
  origin?:AdminContext;onNavigate?:(context:AdminContext)=>void;
  owner: string;
  onClose: () => void;
  onViewLeads: () => void;
  onSource: (id: string) => void;
  changed: () => void;
  embedded?:boolean;active?:boolean;expectedScheduleId?:string;
  section?:'overview'|'logs'|'sources';onSection?:(section:'overview'|'logs'|'sources')=>void;
}) {
  const [run, setRun] = useState<Run | null>(null),
    [steps, setSteps] = useState<Step[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [child, setChild] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [readBusy,setReadBusy]=useState(true),[statusError,setStatusError]=useState(''),[logsError,setLogsError]=useState(''),[resultsRead,setResultsRead]=useState({busy:false,error:''}),[resultRevision,setResultRevision]=useState(0);
  const resultsState=useCallback((value:{busy:boolean;error:string})=>setResultsRead(value),[]);
  const retryResources=useRef({status:true,logs:true}),failedPage=useRef(false),runRef=useRef<Run|null>(null);
  const [localSection,setLocalSection]=useState<'overview'|'logs'|'sources'>('overview');
  const section=requestedSection??localSection;
  const [resultsVisited,setResultsVisited]=useState(!embedded||section!=='logs');
  useEffect(()=>{if(!embedded||section!=='logs')setResultsVisited(true);},[embedded,section]);
  const attributes=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(attributes.current)attributes.current.open=false;},[id]);
  const heading=useRef<HTMLHeadingElement>(null),lastId=useRef(''),loadedSteps=useRef(50);
  const changedRef = useRef(changed),
    pageGeneration = useRef(0),
    morePending = useRef(false);
  useEffect(() => {
    changedRef.current = changed;
  }, [changed]);
  useEffect(() => {
    if(!active){setReadBusy(false);return;}
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      delay = 2500,
      previous = '';
    const epoch = ++pageGeneration.current;
    if(lastId.current!==id){lastId.current=id;loadedSteps.current=savedLogPage(owner,id);setRun(null);runRef.current=null;setChild('');setSteps([]);setResultsRead({busy:false,error:''});}
    morePending.current = false;
    const resources={...retryResources.current};retryResources.current={status:true,logs:true};
    if(resources.status)setStatusError('');if(resources.logs&&!failedPage.current)setLogsError('');
    const load = async () => {
      setReadBusy(true);
      try {
        const target=loadedSteps.current;
        const [status, logs] = await Promise.allSettled([
          resources.status?workflowRequest<Run>(`/v1/triggers/${id}`, {signal: abort.signal}):Promise.resolve(runRef.current),
          resources.logs?(async()=>{const result:{items:Step[];next_cursor:string|null}={items:[],next_cursor:null};do{const next=await workflowRequest<{items:Step[];next_cursor:string|null}>(`/v1/triggers/${id}/steps${result.next_cursor?`?cursor=${result.next_cursor}`:''}`,{signal:abort.signal});result.items.push(...next.items);result.next_cursor=next.next_cursor;}while(result.next_cursor&&result.items.length<target);return result;})():Promise.resolve(null),
        ]);
        if (abort.signal.aborted) return;
        if(expectedScheduleId&&status.status==='fulfilled'&&status.value?.schedule_id!==expectedScheduleId){setStatusError('Selected run does not belong to this schedule. Choose another saved run.');runRef.current=null;setRun(null);setSteps([]);setChild('');return;}
        if(logs.status==='fulfilled'&&logs.value){
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
        if(resources.status)setStatusError(status.status==='rejected'?readFailure(status.reason,'Run progress'):'');
        if(resources.logs&&(logs.status==='rejected'||!failedPage.current))setLogsError(logs.status==='rejected'?readFailure(logs.reason,'Step logs'):'');
        const r=status.status==='fulfilled'?status.value:runRef.current;
        if(!r)return;runRef.current=r;setRun(r);
        setChild((c) => c || r.children?.find(child=>child.request_id===issueRequestId)?.request_id || r.children?.[0]?.request_id || '');
        if (previous && previous !== r.state) changedRef.current();
        previous = r.state;
        resources.status=true;resources.logs=true;
        if (activeRun(r.state)&&!(status.status==='rejected'&&status.reason?.code==='SESSION')) {
          timer = setTimeout(load, delay);
          delay = Math.min(delay * 1.5, 15000);
        }
      } catch (e) {
        if (!abort.signal.aborted) setStatusError(readFailure(e,'Run progress'));
      } finally {if(!abort.signal.aborted)setReadBusy(false);}
    };
    void load();
    return () => {
      pageGeneration.current = epoch + 1;
      abort.abort();
      clearTimeout(timer);
    };
  }, [id, refresh,owner,active,expectedScheduleId,issueRequestId]);
  const hasRun=!!run;
  useEffect(()=>{if(!embedded)heading.current?.focus();},[id,section,hasRun,embedded]);
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
      failedPage.current=false;setLogsError('');loadedSteps.current+=s.items.length;
      try{sessionStorage.setItem(`spin-admin-log-page:${owner}:${id}`,String(loadedSteps.current));}catch{/* Mounted logs remain. */}
      setSteps((x) => [
        ...x,
        ...s.items.filter((i) => !x.some((a) => a.id === i.id)),
      ]);
      setCursor(s.next_cursor);
    } catch (e) {
      if (generation === pageGeneration.current){failedPage.current=true;setLogsError(readFailure(e,'More step logs'));}
    } finally { if (generation === pageGeneration.current) morePending.current = false; }
  };
  const read=()=>{
        const failed=!!statusError||!!logsError||(section!=='logs'&&!!resultsRead.error);
        if(failedPage.current&&logsError)void more();
        if(!failed||statusError||logsError&&!failedPage.current){retryResources.current={status:!failed||!!statusError,logs:!failed||!!logsError&&!failedPage.current};setRefresh(n=>n+1);}
        if(section!=='logs'&&(!failed||resultsRead.error))setResultRevision(n=>n+1);
      };
  const owned=useOwnedRead('selected-run',{busy:readBusy||(section!=='logs'&&resultsRead.busy),error:statusError||logsError||(section!=='logs'?resultsRead.error:''),loaded:!!run||steps.length>0},read,active&&embedded);
  return (
    <section
      className={embedded?"admin-run-panel":"admin-run-detail"}
      aria-label="Run details"
      tabIndex={-1}
    >
      <Breadcrumb items={[...(origin?runBreadcrumbs(origin,run,onNavigate):(embedded?[]:[{label:'Settings'},{label:'Runs'}])),{label:`Run ${id}`},{label:section==='overview'?'Issues':title(section)}]}/>
      <div className="admin-section-heading run-detail-heading">
        {embedded?<h4>{run?formatLocal(run.created_at):'Created time unavailable'}<small className="run-heading-identity">Run {id}</small></h4>:<h2 ref={heading} tabIndex={-1}>{run?formatLocal(run.created_at):'Created time unavailable'}<small className="run-heading-identity">Run {id}</small></h2>}
        {!embedded&&<button type="button" className="text-button" onClick={onClose}>Back to previous view</button>}
      </div>
      <small className="run-history-caption">Created time · America/Chicago</small>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!owned&&<ReadAction scope="run" busy={readBusy||(section!=='logs'&&resultsRead.busy)} loaded={!!run||steps.length>0} error={!!statusError||!!logsError||(section!=='logs'&&!!resultsRead.error)} onRead={read}/>}
      {statusError&&<p role="alert">{statusError}</p>}{logsError&&<p role="alert">{logsError}</p>}
      {run&&<>          <details ref={attributes} className="run-attributes"><summary>Run attributes</summary><dl className="admin-facts"><dt>Status</dt><dd>{runLabel(run)}</dd><dt>Next action</dt><dd>{run.next_action}</dd><dt>Origin</dt><dd>{title(run.origin)}</dd><dt>Created</dt><dd>{formatLocal(run.created_at)}</dd><dt>Finished</dt><dd>{run.finished_at?formatLocal(run.finished_at):'Unknown'}</dd><dt>Recorded activity</dt><dd>{duration(run.reporting?.timing?.recorded_activity_ms)}{run.reporting?.timing?.completeness==='partial'?' · partial intervals':''}{run.reporting?.timing?.reason&&<small>{run.reporting.timing.reason}</small>}</dd><dt>Created → finished</dt><dd>{duration(run.reporting?.timing?.created_to_finished_ms)}</dd><dt>AI usage</dt><dd>{usageText(run.usage)}</dd><dt>New / updated / unchanged</dt><dd>{run.reporting?.leads?.completeness==='known'?<>{(['added','updated','unchanged'] as const).map(k=><span key={k}><RunLeadCount id={run.id} snapshot={run.reporting?.identity_snapshot} metric={k} value={run.reporting?.leads?.[k]} identity={run.reporting?.leads?.identities!==false}>{run.reporting?.leads?.[k]} {k==='added'?'new':k}</RunLeadCount>{' '}</span>)}</>:run.reporting?.leads?.completeness==='not_applicable'?'Not applicable':'Unknown'}</dd><dt>Category breakdown</dt><dd>{run.reporting?.categories?.completeness==='known'?<>{(['forecast','opportunity','award'] as const).map(k=><span key={k}><RunLeadCount id={run.id} snapshot={run.reporting?.identity_snapshot} metric={k} value={run.reporting?.categories?.[k]}>{run.reporting?.categories?.[k]} {k}</RunLeadCount>{' '}</span>)}(<RunLeadCount id={run.id} snapshot={run.reporting?.identity_snapshot} metric="historical_opportunities" value={run.reporting.categories.historical_opportunity}>{run.reporting.categories.historical_opportunity??'Unknown'} historical</RunLeadCount>)</>:run.reporting?.categories?.reason??'Historical category attribution unavailable'}</dd><dt>Validation issues</dt><dd>{run.reporting?.candidates_attention?.value!=null?<RunLeadCount id={run.id} snapshot={run.reporting.identity_snapshot} metric="candidates_attention" value={run.reporting.candidates_attention.value}/>: 'Unknown · inspect saved validation issues'}</dd><dt>Source checks needing attention</dt><dd>{run.presentation?.outcome==='source_attention'?<button type="button" className="text-button" onClick={()=>{setLocalSection('sources');onSection?.('sources');}}>{run.presentation.attention_count} · View saved source checks</button>:'See saved source checks'}</dd></dl>          <details>
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
          </details></>}
          {!embedded&&<nav className="admin-workspace-nav detail-sections" aria-label="Run sections">{(['overview','logs','sources'] as const).map(value=><button key={value} type="button" className="text-button" aria-current={section===value?'page':undefined} onClick={()=>{setLocalSection(value);onSection?.(value);}}>{value==='overview'?'Issues':title(value)}</button>)}</nav>}
      {run && (
        <>


          {section==='overview'&&<section className="run-issue-status" aria-label="Execution status"><h3>Execution</h3><strong>{runLabel(run)}</strong><span>{run.next_action??(activeRun(run.state)?'Work is still in progress.':'Inspect saved source and validation results below; absence of issues does not confirm complete coverage.')}</span></section>}
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
              onClick={onViewLeads}
            >
              View leads
            </button>
          </div>
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
          {child && (!embedded||resultsVisited) && (
            <RequestReview
              key={child}
              embedded
              presentation={section==='sources'?'sources':'issues'}
              leadNavigationOwned={embedded}
              onReadState={resultsState}
              refreshSignal={`${run.state}:${resultRevision}`}
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
      {!run&&section==='sources'&&<p>Saved source scope is unavailable. Use the run read control above.</p>}
    </section>
  );
}
