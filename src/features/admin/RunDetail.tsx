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
import {useRunLogs} from './use-run-logs';
import {useActiveRead} from './use-active-read';
import {duration,readFailure} from './model';
import type { Run } from './types';
import { activeRun, title, usageText, formatLocal, runLabel } from './model';
export function RunDetail({
  id,
  issueRequestId,
  origin,onNavigate,
  owner,
  onClose,
  onViewLeads,
  onSource,
  changed,
  section:requestedSection,onSection,embedded=false,active:workspaceActive=true,expectedScheduleId,
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
  const active=useActiveRead(workspaceActive);
  const [sessionBlocked,setSessionBlocked]=useState(false);
  const [run, setRun] = useState<Run | null>(null),
    [child, setChild] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [readBusy,setReadBusy]=useState(true),[statusError,setStatusError]=useState(''),[resultsRead,setResultsRead]=useState({busy:false,error:''}),[resultRevision,setResultRevision]=useState(0);
  const resultsState=useCallback((value:{busy:boolean;error:string})=>setResultsRead(value),[]);
  const runRef=useRef<Run|null>(null);
  const [localSection,setLocalSection]=useState<'overview'|'logs'|'sources'>('overview');
  const section=requestedSection??localSection;
  const logs=useRunLogs(id,owner,active&&!sessionBlocked&&section==='logs'&&(!expectedScheduleId||run?.schedule_id===expectedScheduleId),run?.state);
  const {steps,cursor}=logs;
  const logsError=section==='logs'?logs.error:'';
  const [resultsVisited,setResultsVisited]=useState(!embedded||section!=='logs');
  useEffect(()=>{if(!embedded||section!=='logs')setResultsVisited(true);},[embedded,section]);
  const attributes=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(attributes.current)attributes.current.open=false;},[id]);
  const heading=useRef<HTMLHeadingElement>(null),lastId=useRef('');
  const changedRef = useRef(changed);
  useEffect(() => {
    changedRef.current = changed;
  }, [changed]);
  useEffect(() => {
    if(!active){setReadBusy(false);return;}
    const abort=new AbortController();
    let timer:ReturnType<typeof setTimeout>,delay=2500,previous=runRef.current?.state??'',poll=false;
    if(lastId.current!==`${owner}:${id}`){lastId.current=`${owner}:${id}`;setRun(null);runRef.current=null;setChild('');setResultsRead({busy:false,error:''});}
    setSessionBlocked(false);
    const load=async()=>{
      setReadBusy(true);
      try{
        const value=await workflowRequest<Run&{progress_only?:boolean}>(`/v1/triggers/${id}${poll?'?projection=progress':''}`,{signal:abort.signal});
        const r=value.progress_only?{...runRef.current,...value}:value;
        if(abort.signal.aborted)return;
        if(expectedScheduleId&&r.schedule_id!==expectedScheduleId){setStatusError('Selected run does not belong to this schedule. Choose another saved run.');runRef.current=null;setRun(null);setChild('');return;}
        runRef.current=r;setRun(r);setStatusError('');
        setChild(c=>c||r.children?.find(child=>child.request_id===issueRequestId)?.request_id||r.children?.[0]?.request_id||'');
        if(previous&&previous!==r.state)changedRef.current();previous=r.state;
      }catch(e){
        if(abort.signal.aborted)return;
        setStatusError(readFailure(e,'Run progress'));
        if((e as {code?:string}).code==='SESSION'){setSessionBlocked(true);return;}
      }finally{if(!abort.signal.aborted)setReadBusy(false);}
      if(!abort.signal.aborted&&runRef.current&&activeRun(runRef.current.state)){poll=true;timer=setTimeout(()=>void load(),delay);delay=Math.min(delay*1.5,15000);}
    };
    void load();
    return()=>{abort.abort();clearTimeout(timer);};
  },[id,refresh,owner,active,expectedScheduleId,issueRequestId]);
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
  const more=logs.more;
  const read=()=>{
    const failed=!!statusError||!!logsError||(section!=='logs'&&!!resultsRead.error);
    if(!failed||statusError)setRefresh(n=>n+1);
    if(section==='logs'&&(!failed||logsError))logs.refresh();
    if(section!=='logs'&&(!failed||resultsRead.error))setResultRevision(n=>n+1);
  };
  const owned=useOwnedRead('selected-run',{busy:readBusy||(section==='logs'?logs.busy:resultsRead.busy),error:statusError||logsError||(section!=='logs'?resultsRead.error:''),loaded:!!run||steps.length>0},read,active&&embedded);
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
      {!owned&&<ReadAction scope="run" busy={readBusy||(section==='logs'?logs.busy:resultsRead.busy)} loaded={!!run||steps.length>0} error={!!statusError||!!logsError||(section!=='logs'&&!!resultsRead.error)} onRead={read}/>}
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
              active={active&&section!=='logs'}
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
