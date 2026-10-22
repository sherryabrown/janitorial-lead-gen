import { useEffect, useRef, useState } from 'react';
import {
  workflowRequest,
  mutationKey,
  acknowledged,
} from '../../lib/procurement-workflow';
import { SourceReview } from './SourceReview';
import type {
  RequestStatus,
  Packet,
  Task,
  ImportStatus,
  Job,
  SamPacket,
} from './types';
import { title,readFailure } from './model';
export function RequestReview({
  id,
  owner,
  onViewLeads,
  sam = false,
  refreshSignal,
  embedded = false, onReadState, leadNavigationOwned=false,
}: {
  id: string;
  owner: string;
  onViewLeads: () => void;
  sam?: boolean;
  refreshSignal?: string;
  leadNavigationOwned?:boolean;embedded?: boolean; onReadState?:(state:{busy:boolean;error:string})=>void;
}) {
  const [readBusy,setReadBusy]=useState(false),[readError,setReadError]=useState('');
  useEffect(()=>{onReadState?.({busy:readBusy,error:readError});},[readBusy,readError,onReadState]);
  const [data, setData] = useState<RequestStatus | null>(null),
    [samPacket, setSamPacket] = useState<SamPacket | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [packet, setPacket] = useState<{
      data: Packet;
      task: Task;
      discovery: boolean;
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(''),
    [approveNew, setApproveNew] = useState(false),
    [job, setJob] = useState<ImportStatus | null>(null),
    [seed, setSeed] = useState(''),
    [sources, setSources] = useState<{ id: string; name: string }[]>([]),
    [sourceOffset, setSourceOffset] = useState<number | null>(0),
    [notice, setNotice] = useState('');
  const dataRef = useRef<RequestStatus | null>(null), selectedRef = useRef(selected),
    previousRequest=useRef(id), generation = useRef(0), packetRead = useRef(0), candidatePaging = useRef(false);
  selectedRef.current = selected;

  useEffect(() => {
    const a = new AbortController();
    const epoch = ++generation.current;
    candidatePaging.current = false;
    if(previousRequest.current!==id){previousRequest.current=id;dataRef.current=null;setData(null);setSamPacket(null);setPacket(null);setSelected([]);setJob(null);}
    setError('');
    setReadBusy(true);setReadError('');
    const read = async () => {
      const needed = Math.max(50, dataRef.current?.candidates.length ?? 0);
      let result = await workflowRequest<RequestStatus>(`/v1/requests/${id}`, { signal: a.signal });
      while (result.next_offset !== null && result.candidates.length < needed) {
        const page = await workflowRequest<RequestStatus>(`/v1/requests/${id}?offset=${result.next_offset}`, { signal: a.signal });
        result = { ...page, candidates: [...result.candidates, ...page.candidates] };
      }
      if(a.signal.aborted)return;
      const previous = dataRef.current;
      const valid = selectedRef.current.filter(id => result.candidates.some(c => c.intake_id === id && c.state === 'pending_review' && c.intake_hash === previous?.candidates.find(old => old.intake_id === id)?.intake_hash));
      if (valid.length !== selectedRef.current.length) setNotice('Some selected candidates changed. Review and select their current evidence; your written notes are kept.');
      dataRef.current = result; setData(result); setSelected(valid);
      const pending = !sam ? result.jobs.find((j) => j.stage?.startsWith('import_')) : undefined;
      if(pending){const value=await workflowRequest<ImportStatus>(`/v1/imports/${pending.id}`,{signal:a.signal});if(!a.signal.aborted)setJob(value);}
    };
    void Promise.allSettled([read(),...(sam?[workflowRequest<SamPacket>(`/v1/sam/requests/${id}/packet`,{signal:a.signal}).then(p=>{if(!a.signal.aborted)setSamPacket(p);})]:[])]).then(results=>{
      if(!a.signal.aborted){setReadBusy(false);const failed=results.find(r=>r.status==='rejected'&&r.reason?.code==='SESSION')??results.find(r=>r.status==='rejected');if(failed?.status==='rejected')setReadError(readFailure(failed.reason,'Saved results'));}
    });
    return () => { a.abort(); generation.current = epoch + 1; };
  }, [id, version, sam, refreshSignal]);
  useEffect(() => {
    if (!job || !['pending', 'running'].includes(job.state)) return;
    const a = new AbortController(),
      timer = setTimeout(() => {
        void workflowRequest<ImportStatus>(`/v1/imports/${job.job_id}`, {
          signal: a.signal,
        })
          .then(value => { if (!a.signal.aborted) setJob(value); })
          .catch((e) => {
            if (!a.signal.aborted) setError(e.message);
          });
      }, 3000);
    return () => {
      a.abort();
      clearTimeout(timer);
    };
  }, [job]);
  useEffect(() => {
    if (!sam || !samPacket || !['pending', 'running'].includes(samPacket.automatic?.state ?? '')) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (document.hidden) { setSamPacket(p => p ? { ...p } : p); return; }
      void workflowRequest<Pick<SamPacket, 'automatic' | 'next_action' | 'evidence_key' | 'collection_pending'>>(`/v1/sam/requests/${id}/status`, { signal: abort.signal })
        .then(async status => {
          if (abort.signal.aborted) return;
          if (status.evidence_key && status.evidence_key !== samPacket.evidence_key) {
            const fresh = await workflowRequest<SamPacket>(`/v1/sam/requests/${id}/packet`, { signal: abort.signal });
            if (!abort.signal.aborted) setSamPacket(fresh);
          } else setSamPacket(p => p ? { ...p, ...status } : p);
        }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    }, 3000);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [id, sam, samPacket]);
  const perform = async (action: () => Promise<unknown>, reload = true) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (reload) setVersion((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openPacket = (task: Task, discovery: boolean) =>
    void perform(async () => {
      const path = discovery
        ? `/v1/requests/${id}/discovery/tasks/${task.id}/packet`
        : `/v1/requests/${id}/tasks/${task.id}/packet`;
      const read = ++packetRead.current;
      const revision = generation.current;
      const p = await workflowRequest<Packet>(path);
      if (read === packetRead.current && revision === generation.current) setPacket({ task, data: p, discovery });
    }, false);
  const prepare = () =>
    void perform(async () => {
      if (!data) return;
      const body = {
        version: 1,
        batch: `admin-${crypto.randomUUID()}`,
        project_ref: 'zreplhkoxswtzxlchtjf',
        request_id: id,
        work_state: 'AR',
        scope:
          'Reviewed candidates for the saved county/city/category/date request',
        limitations:
          'Saved source evidence only; incomplete routes are not complete coverage',
        reviewed_by: owner,
        run_ids: [],
        decisions: data.candidates
          .filter((c) => selected.includes(c.intake_id))
          .map((c) => ({
            intake_id: c.intake_id,
            intake_hash: c.intake_hash,
            action: 'process',
            reason,
            approve_new: approveNew,
          })),
      };
      const action = `prepare:${id}`;
      const savedKey = mutationKey(owner, action, {
        selected,
        reason,
        approveNew,
      });
      body.batch = `admin-${savedKey}`;
      const r = await workflowRequest<{ job_id: string }>(
        `/v1/requests/${id}/imports/prepare`,
        { body },
      );
      setJob(await workflowRequest<ImportStatus>(`/v1/imports/${r.job_id}`));
      acknowledged(owner, action);
    }, false);
  const approve = () =>
    void perform(async () => {
      if (!job) return;
      const current = await workflowRequest<ImportStatus>(
        `/v1/imports/${job.job_id}`,
      );
      if (
        current.approval_sha256 !== job.approval_sha256 ||
        current.stage !== 'import_awaiting_approval'
      ) {
        setJob(current);
        throw Error(
          'The tested package changed. Review its current summary before approving.',
        );
      }
      setJob(
        await workflowRequest<ImportStatus>(
          `/v1/imports/${job.job_id}/approve`,
          { body: { approval_sha256: current.approval_sha256 } },
        ),
      );
    }, false);
  const jobRows = data?.jobs.filter(j => !j.stage?.startsWith('import_')).map(j => (
    <div key={j.id}>
      <p className="admin-hint"><strong>{title(j.stage ?? j.state)}</strong> | {j.next_action}</p>
      {j.access_handoff_id && <SavedAccess job={j} onChange={() => setVersion(x => x + 1)} />}
    </div>
  ));
  const sourceAttentionLayout = Boolean(data?.automatic_import || data?.tasks.some(t => 'attention' in t));
  return (
    <section className="admin-request-review" aria-label="Saved results">
      <div className="admin-section-heading">
        <h3>Saved results</h3>
        {!embedded&&<button
          type="button"
          className="text-button"
          disabled={readBusy}
          onClick={() => setVersion((x) => x + 1)}
        >
          {readBusy?'Loading results…':readError?'Retry results':'Refresh results'}
        </button>}
      </div>
      {readError&&<p role="alert">{readError}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {!data ? (
        <p>Loading saved results…</p>
      ) : (
        <>
          <p className="admin-hint">
            {data.total_candidates} candidates ·{' '}
            {data.tasks.reduce((n, t) => n + (t.pages || 0), 0)} saved pages.
            Source evidence is not proof of complete lead coverage.
          </p>
          {data.automatic_county && data.check_updates === false && <p className="admin-notice">
            Source-only run. Opportunity collection was not requested. Enable Check for lead updates for your next run.
          </p>}
          {data.automatic_county && <p className="admin-hint">
            {new Set(data.tasks.filter(t => ['reviewed_with_results','reviewed_no_results'].includes(t.state)).map(t => t.source_id).filter(Boolean)).size} sources checked ·{' '}
            {new Set(data.tasks.filter(t => ['source_missing','method_missing','blocked','partial'].includes(t.state)).map(t => t.source_id ?? t.location_name ?? t.id)).size} sources or locations incomplete.
            {' '}{data.automatic_import ? 'Valid results save automatically; incomplete sources remain visible.' : 'Candidates require review before adding them to leads.'}
          </p>}
          {!sam && data.automatic_import && (
            <div role="status" className="admin-confirm">
              <h3>County results save automatically</h3>
              <p>{data.automatic_import.state === 'saving' ? 'Validating and saving results…' :
                data.automatic_import.state === 'outcome_unknown' ? 'Database outcome needs reconciliation before retrying.' :
                data.automatic_import.state === 'blocked' ? 'Automatic saving needs attention. Inspect the saved diagnostics below.' :
                data.jobs.some(j => ['pending', 'running'].includes(j.state)) ? 'Checking sources. Valid results save as they are verified.' :
                data.automatic_import.verified ? 'Database results verified. Source coverage is shown separately.' : 'Valid results will save after validation.'}</p>
              <p>Added {data.automatic_import.added} · Updated {data.automatic_import.updated} · Unchanged {data.automatic_import.unchanged} · Not saved {data.automatic_import.exclusions.length}</p>
              {!leadNavigationOwned&&(data.automatic_import.added + data.automatic_import.updated + data.automatic_import.unchanged > 0) &&
                <button type="button" className="primary-button" onClick={onViewLeads}>View leads</button>}
              {data.automatic_import.exclusions.map(e => <p key={e.intake_id}><strong>{e.title || 'Result'}</strong> — {e.reason}</p>)}
              {data.automatic_import.state === 'outcome_unknown' && data.jobs.filter(j => j.stage === 'import_reconcile').map(j =>
                <button type="button" className="secondary-button" key={j.id} disabled={busy} onClick={() => void perform(() => workflowRequest(`/v1/imports/${j.id}/reconcile`, {body: {}}))}>Check database outcome</button>)}
              {data.automatic_import.state === 'pending' && !data.jobs.some(j => ['pending', 'running'].includes(j.state)) &&
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void perform(() => workflowRequest(`/v1/requests/${id}/imports/continue`, {body: {}}))}>Continue automatic saving</button>}
            </div>
          )}
          {sam && (
            <>
              <h3>SAM — Arkansas statewide</h3>
              {samPacket?.automatic && (
                <div className="admin-notice" aria-label="Automatic SAM saving">
                  <p>
                    {samPacket.automatic.verified
                      ? 'Database results verified.'
                      : samPacket.next_action}
                  </p>
                  <p>
                    {samPacket.automatic.added} added �{' '}
                    {samPacket.automatic.updated} updated �{' '}
                    {samPacket.automatic.unchanged} unchanged �{' '}
                    {samPacket.automatic.exclusions.length} excluded
                  </p>
                  {samPacket.automatic.collection_blocker && <p>{samPacket.automatic.collection_blocker}</p>}
                  {samPacket.automatic.exclusions.map((x) => (
                    <p key={x.intake_id}>
                      <strong>{x.title}</strong>: {x.reason}
                    </p>
                  ))}
                  {!leadNavigationOwned&&<button
                    type="button"
                    className="text-button"
                    onClick={onViewLeads}
                  >
                    View saved leads
                  </button>}
                  {samPacket.automatic.can_continue && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          workflowRequest(`/v1/sam/requests/${id}/process`, {
                            body: {},
                          }),
                        )
                      }
                    >
                      Continue automatic saving
                    </button>
                  )}
                  {samPacket.automatic.stage === 'import_reconcile' && samPacket.automatic.job_id && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          workflowRequest(
                            `/v1/imports/${samPacket.automatic?.job_id}/reconcile`,
                            { body: {} },
                          ),
                        )
                      }
                    >
                      Reconcile saved database result
                    </button>
                  )}
                </div>
              )}
              {samPacket?.collection_pending ? <p role="status">{samPacket.next_action}</p> : samPacket ? (
                <details>
                  <summary>
                    Saved SAM evidence · {samPacket.run_ids.length} pages ·{' '}
                    {samPacket.partial
                      ? 'Partial capture'
                      : 'Terminal confirmed'}
                  </summary>
                  <p>
                    {samPacket.category === 'award'
                      ? 'Last modified dates'
                      : 'Posted dates'}
                    : {samPacket.publication_window?.from} through{' '}
                    {samPacket.publication_window?.to} ·{' '}
                    {samPacket.records ?? 'Unconfirmed'} captured records
                  </p>
                  <p>{samPacket.next_action}</p>
                  {samPacket.captures.map((c) => (
                    <p key={c.run_id}>
                      {title(c.kind)} ·{' '}
                      <a href={c.query_url} target="_blank" rel="noreferrer">
                        Official query
                      </a>
                      <br />
                      {JSON.stringify(c.filters)}
                    </p>
                  ))}
                  {samPacket.candidates
                    .filter((c) =>
                      data.candidates.some((i) => i.intake_id === c.intake_id),
                    )
                    .map((c) => (
                      <details key={c.intake_id}>
                        <summary>{c.title}</summary>
                        <p>
                          {c.agency} · {title(c.bid_type)}
                        </p>
                        <p>
                          {JSON.stringify(c.work_performance_locations ?? [])} ·{' '}
                          {c.deadline ??
                            c.contract_end ??
                            'Verify qualifying date'}
                        </p>
                        {c.source_url && (
                          <a
                            href={c.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Official record
                          </a>
                        )}
                      </details>
                    ))}
                </details>
              ) : (
                <p className="admin-hint">
                  SAM evidence is not ready. Read saved progress; a missing
                  packet is not a zero-result search.
                </p>
              )}
              {data.jobs.some(
                (j) =>
                  j.state === 'outcome_unknown' && j.stage === 'sam_reconcile',
              ) && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      workflowRequest(`/v1/sam/requests/${id}/reconcile`, {
                        body: {},
                      }),
                    )
                  }
                >
                  Reconcile saved SAM response
                </button>
              )}
            </>
          )}
          {!sourceAttentionLayout && jobRows}
          {data.tasks.map((t) => (
            <div className="admin-task" key={t.id}>
              <div>
                <strong>
                  {t.location_name && `${t.location_name} · `}{t.source_name && `${t.source_name} · `}
                  {data.automatic_county && t.category === 'source_entry' ? 'Website' : title(t.category)} · {data.automatic_county ?
                    ({source_missing: 'Official website not yet verified', method_missing: 'Source not yet verified',
                      reviewed_no_results: 'Checked—no matching opportunities', reviewed_with_results: 'Opportunities found',
                      needs_interpretation: t.category === 'source_entry' ? 'Website captured; opportunity checks shown separately' : 'Reviewing collected evidence',
                      unchecked: 'Waiting to check', partial: t.category === 'source_entry' ? 'Website unavailable or incomplete' : 'Incomplete coverage',
                      blocked: 'Access or verification required'} as Record<string,string>)[t.state] ?? title(t.state) : title(t.state)}
                </strong>
                {t.attention ? <>
                  <p><strong>{({manual_action:'Manual action needed',automation:'Automation support needed',limit:'Collection incomplete',unavailable:'Website unavailable',access:'Access needs attention',details:'Project details unavailable',source_missing:'Source not verified',unverified:'Source not verified',diagnostic:'Check needs attention'} as Record<string,string>)[t.attention.kind] ?? 'Source needs attention'}</strong></p>
                  <p><strong>Blocker:</strong> {t.attention.blocker}</p>
                  <p><strong>Next action:</strong> {t.attention.next_action}</p>
                </> : <p>{data.automatic_county && t.discovery_action ? t.discovery_action : t.reason}</p>}
              </div>
              <div className="admin-inline">
                {t.pages > 0 && !['source_entry'].includes(t.category) && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => openPacket(t, false)}
                  >
                    Review captured evidence
                  </button>
                )}
                {[
                  'source_missing',
                  'method_missing',
                  'blocked',
                  'partial',
                ].includes(t.state) && !data.automatic_county && (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => openPacket(t, true)}
                    >
                      Review source research
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          workflowRequest(
                            `/v1/requests/${id}/discover/resume`,
                            { body: { task_id: t.id } },
                          ),
                        )
                      }
                    >
                      Resume saved research
                    </button>
                  </>
                )}
              </div>
              {data.automatic_county && t.discovery_state && ['source_missing','method_missing','blocked','partial'].includes(t.state) &&
                <div className="admin-inline">
                  {(t.attention === undefined || t.attention?.action_kind === 'retry') && <button type="button" className="text-button" disabled={busy || t.discovery_state !== 'blocked'} onClick={() => void perform(() =>
                    workflowRequest(`/v1/requests/${id}/discover/resume`, { body: { task_id: t.id } }))}>Retry source</button>}
                  <button type="button" className="text-button" disabled={busy} onClick={() => openPacket(t, true)}>View source evidence</button>
                </div>}
            </div>
          ))}
          {sourceAttentionLayout && <details><summary>Workflow details</summary>{jobRows}</details>}
          {!data.automatic_county && !!data.tasks.some((t) =>
            ['source_missing', 'method_missing'].includes(t.state),
          ) && (
            <details>
              <summary>Research a saved gap from an official source</summary>
              <p className="admin-hint">
                Choose a registered official seed. Missing seeds remain a gap;
                this does not start an unrestricted web search.
              </p>
              <button
                type="button"
                className="text-button"
                disabled={sourceOffset === null || busy}
                onClick={() =>
                  void perform(async () => {
                    const p = await workflowRequest<{
                      items: { id: string; name: string }[];
                      next_offset: number | null;
                    }>(
                      `/v1/requests/${id}/sources?offset=${sourceOffset ?? 0}`,
                    );
                    setSources((s) => [
                      ...s,
                      ...p.items.filter((x) => !s.some((y) => y.id === x.id)),
                    ]);
                    setSourceOffset(p.next_offset);
                  }, false)
                }
              >
                Load official source options
              </button>
              <label>
                Official seed
                <select value={seed} onChange={(e) => setSeed(e.target.value)}>
                  <option value="">Choose a registered source</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {data.tasks
                .filter((t) =>
                  ['source_missing', 'method_missing'].includes(t.state),
                )
                .map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className="text-button"
                    disabled={!seed || busy}
                    onClick={() =>
                      void perform(() =>
                        workflowRequest(`/v1/requests/${id}/discover`, {
                          body: { task_id: t.id, seed_source_id: seed },
                        }),
                      )
                    }
                  >
                    Research {title(t.category)} gap
                  </button>
                ))}
            </details>
          )}
          {packet && (
            <div className="admin-review-form">
              <button
                type="button"
                className="text-button"
                onClick={() => { packetRead.current++; setPacket(null); }}
              >
                Close evidence
              </button>
              {packet.discovery ? (
                <SourceReview
                  readOnly={data.automatic_county}
                  key={packet.data.packet_hash ?? packet.task.id}
                  packet={packet.data}
                  task={packet.task}
                  busy={busy}
                  onSave={(body) =>
                    void perform(async () => {
                      await workflowRequest(
                        `/v1/requests/${id}/discover/review`,
                        { body },
                      );
                      setPacket(null);
                    })
                  }
                />
              ) : (
                <InterpretationReview
                  owner={owner}
                  key={packet.data.packet_hash}
                  packet={packet.data}
                  busy={busy}
                  onSave={(body) =>
                    void perform(async () => {
                      await workflowRequest(
                        `/v1/requests/${id}/tasks/${packet.task.id}/interpret`,
                        { body },
                      );
                      setPacket(null);
                    })
                  }
                />
              )}
            </div>
          )}
          {!sam && !data.automatic_import &&
            data.candidates.map((c) => (
              <label className="admin-candidate" key={c.intake_id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.intake_id)}
                  disabled={c.state !== 'pending_review'}
                  onChange={(e) =>
                    setSelected((x) =>
                      e.target.checked
                        ? [...x, c.intake_id]
                        : x.filter((id) => id !== c.intake_id),
                    )
                  }
                />
                <span>
                  <strong>{c.title}</strong>
                  <small>{title(c.state)}</small>
                </span>
              </label>
            ))}
          {data.next_offset !== null && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void perform(async () => {
                  if (candidatePaging.current) return;
                  candidatePaging.current = true;
                  const revision = generation.current;
                  try {
                    const p = await workflowRequest<RequestStatus>(`/v1/requests/${id}?offset=${data.next_offset}`);
                    if (revision !== generation.current) return;
                    const fresh = { ...p, candidates: [...data.candidates, ...p.candidates.filter(c => !data.candidates.some(old => old.intake_id === c.intake_id))] };
                    dataRef.current = fresh; setData(fresh);
                  } finally { if (revision === generation.current) candidatePaging.current = false; }
                }, false)
              }
            >
              More candidates
            </button>
          )}
          {!sam && !data.automatic_import && selected.length > 0 && (
            <div className="admin-review-form">
              <label>
                Reason for processing reviewed candidates
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={approveNew}
                  onChange={(e) => setApproveNew(e.target.checked)}
                />{' '}
                Allow a new lead only if no exact existing identity matches.
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  busy || !reason.trim()
                }
                onClick={prepare}
              >
                Prepare tested import · {selected.length} selected
              </button>
            </div>
          )}
          {!sam && !data.automatic_import && job && (
            <div className="admin-confirm">
              <h3>{title(job.stage)}</h3>
              <p>{job.next_action}</p>
              {job.summary && (
                <dl>
                  {Object.entries(job.summary)
                    .filter(([, v]) =>
                      ['number', 'string', 'boolean'].includes(typeof v),
                    )
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{title(k)}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              )}
              {job.approval_sha256 && (
                <p className="admin-hash">
                  Tested package: {job.approval_sha256}
                </p>
              )}
              {job.stage === 'import_awaiting_approval' && (
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || !job.approval_sha256}
                  onClick={approve}
                >
                  Approve this tested import
                </button>
              )}
              {job.stage === 'import_reconcile' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      async () =>
                        setJob(
                          await workflowRequest(
                            `/v1/imports/${job.job_id}/reconcile`,
                            { body: {} },
                          ),
                        ),
                      false,
                    )
                  }
                >
                  Reconcile saved import
                </button>
              )}
              {!leadNavigationOwned&&job.stage === 'import_verified' && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onViewLeads}
                >
                  View imported leads
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
type AccessStatus = {
  tenant: string;
  next: { action?: string };
  hosted?: { recipe_current: boolean; session_current: boolean };
};
function SavedAccess({ job, onChange }: { job: Job; onChange: () => void }) {
  const [access, setAccess] = useState<AccessStatus | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const path = `/v1/access/${job.access_handoff_id}`;
  const perform = async (action?: string) => {
    setBusy(true);
    setMessage('');
    try {
      if (action) {
        const result = await workflowRequest<{
          next_action?: string;
          state: string;
        }>(`${path}/${action}`, { body: {} });
        setMessage(result.next_action ?? title(result.state));
        onChange();
      }
      setAccess(await workflowRequest<AccessStatus>(path));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-review-form">
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => void perform()}
      >
        Check saved portal access
      </button>
      {access && (
        <>
          <p>
            {access.tenant} · {access.next.action}
          </p>
          <div className="admin-inline">
            <button
              type="button"
              className="text-button"
              disabled={busy || !access.hosted?.recipe_current}
              onClick={() => void perform('continue')}
            >
              Resume saved sign-in
            </button>
            <button
              type="button"
              className="text-button"
              disabled={
                busy ||
                !access.hosted?.session_current ||
                job.capture_state === 'captured' ||
                !['pending', 'partial'].includes(job.state)
              }
              onClick={() => void perform(`capture/${job.id}`)}
            >
              Capture saved method
            </button>
            {job.capture_state && job.capture_state !== 'captured' && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void perform(`capture/${job.id}/reconcile`)}
              >
                Reconcile saved capture
              </button>
            )}
          </div>
          <p className="admin-hint">
            Manual browser verification does not verify the hosted session.
            These actions resume the existing record; they do not create an
            account or approve unattended collection.
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function InterpretationReview({
  packet,
  busy,
  onSave,
  owner,
}: {
  owner: string;
  packet: Packet;
  busy: boolean;
  onSave: (body: unknown) => void;
}) {
  const [page, setPage] = useState(0),
    [decision, setDecision] = useState('unresolved'),
    [quote, setQuote] = useState(''),
    [reason, setReason] = useState(''),
    [locator, setLocator] = useState(''),
    [record, setRecord] = useState(''),
    [name, setName] = useState(''),
    [county, setCounty] = useState(''),
    [city, setCity] = useState(''),
    [date, setDate] = useState(''),
    [quarter, setQuarter] = useState(''),
    [basis, setBasis] = useState(''),
    [supportingIndex, setSupportingIndex] = useState(''),
    [supportingQuote, setSupportingQuote] = useState(''),
    [supportingPreview, setSupportingPreview] = useState(''),
    [supportingLocator, setSupportingLocator] = useState('saved document');
  const supportingRead = useRef(0);
  const savedSupporting = packet.detail_collection?.projects.flatMap(project => project.evidence) ?? [];
  const selectedSupporting = supportingIndex === '' ? undefined : savedSupporting[Number(supportingIndex)];
  const selectedProject = packet.detail_collection?.projects.find(project => project.evidence.some(evidence => evidence.capture_receipt === selectedSupporting?.capture_receipt));
  const supportingProjectUrl = packet.project_links?.find(project => project.id === selectedProject?.id)?.url;
  const p = packet.pages[page];
  if (
    packet.current_interpretation &&
    packet.current_interpretation.packet_hash !== packet.packet_hash
  )
    return (
      <p>
        The saved review belongs to earlier captures. Refresh or reconcile that
        review before adding decisions.
      </p>
    );
  if (!p)
    return (
      <p>
        No confirmed category packet is available. Review the saved coverage
        gap.
      </p>
    );
  const submit = () => {
    const evidence = [{ run_id: p.run_id, locator, excerpt: quote }],
      item = { reason, evidence, ...(selectedSupporting ? {
        supporting_evidence: [{ ...selectedSupporting, excerpt: supportingQuote, locator: supportingLocator }],
      } : {}) };
    const field = (
      {
        published: 'published_date',
        publication: 'published_date',
        award_date: 'award_date',
        deadline: 'deadline',
        expected_solicitation: 'expected_solicitation_date',
        expected_solicitation_date: 'expected_solicitation_date',
        end_renewal: 'contract_end_date',
        contract_end_date: 'contract_end_date',
      } as Record<string, string>
    )[packet.query_window?.date_basis ?? 'deadline'];
    const current = packet.current_interpretation;
    onSave({
      version: 1,
      packet_hash: packet.packet_hash,
      reviewed_by: owner,
      supersedes_id: current?.id,
      append_to_current: !!current,
      reviewed_scope:
        'Selected saved packet evidence; other records remain unresolved',
      coverage: 'partial',
      findings: [
        ...(decision === 'finding'
          ? [
              {
                ...item,
                record_id: record,
                title: name,
                classification: packet.category,
                work_location_basis: basis,
                payload: {
                  title: name,
                  bid_type: packet.category,
                  source_url: supportingProjectUrl ?? p.url,
                  work_state: 'AR',
                  work_county: county,
                  work_city: city || undefined,
                  ...(field === 'expected_solicitation_date' && quarter
                    ? { planned_advertisement_period: quarter }
                    : { [field]: date }),
                },
              },
            ]
          : []),
      ],
      exclusions: [...(decision === 'exclude' ? [item] : [])],
      unresolved: [...(decision === 'unresolved' ? [item] : [])],
    });
  };
  return (
    <div className="admin-review-form">
      <h3>Review captured evidence</h3>
      <p className="admin-hint">
        Adds a decision while preserving existing reviewed outcomes. Refresh
        after a concurrent review.
      </p>
      <label>
        Saved page
        <select
          value={page}
          onChange={(e) => {
            setPage(Number(e.target.value));
            setQuote('');
          }}
        >
          {packet.pages.map((p, i) => (
            <option value={i} key={p.run_id}>
              {p.url}
            </option>
          ))}
        </select>
      </label>
      <pre className="admin-evidence">{p.review}</pre>
      {packet.project_links && (
        <details>
          <summary>Current projects from this saved listing</summary>
          <p className="admin-hint">
            Listing captured. Project details and documents still need
            verification; a listing alone does not establish a qualified lead.
            Opening the Portal does not verify the server session.
          </p>
          <a href={packet.portal_url} target="_blank" rel="noreferrer">
            Open agency Portal
          </a>
          <ul>
            {packet.project_links
              .filter((link) => link.run_id === p.run_id)
              .map((link) => (
                <li key={link.id}>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.title}
                  </a>
                  {' · Closes '}
                  {link.closes}
                  {packet.detail_collection?.projects.find(project => project.id === link.id) && (
                    <span> · {({ captured: 'Details saved', pending: 'Not checked', blocked: 'Access required', outcome_unknown: 'Capture needs reconciliation', attempt_pending: 'Capture needs reconciliation', partial: 'Incomplete capture' } as Record<string,string>)[packet.detail_collection.projects.find(project => project.id === link.id)!.state] ?? 'Not checked'}</span>
                  )}
                </li>
              ))}
          </ul>
          {packet.detail_collection?.reason && <p role="status">{packet.detail_collection.reason}</p>}
          {packet.detail_collection?.projects.some(project => project.document_overflow) && <p className="admin-hint">More documents are linked than this bounded capture includes. Document coverage is partial.</p>}
          <p className="admin-hint">
            If a project asks for sign-in or security verification, complete the
            official access action and retain the saved evidence for review. No
            automatic challenge retries are performed.
          </p>
        </details>
      )}
      {savedSupporting.length > 0 && (
        <>
          <label>Saved project or document evidence
            <select value={supportingIndex} onChange={e => {
              const index=e.target.value,read=++supportingRead.current;
              setSupportingIndex(index);setSupportingQuote('');setSupportingPreview(index===''?'':'Loading saved evidence…');
              if(index!=='')void workflowRequest<{review:string}>(`/v1/requests/${packet.request_id}/tasks/${packet.task_id}/supporting-evidence`,
                {body:savedSupporting[Number(index)]}).then(result=>{
                  if(read===supportingRead.current)setSupportingPreview(result.review);
                }).catch(()=>{if(read===supportingRead.current)setSupportingPreview('Saved evidence could not load. Select it again to retry.');});
            }}>
              <option value="">Use listing evidence only</option>
              {savedSupporting.map((document, index) => <option key={document.capture_receipt} value={index}>{document.url}</option>)}
            </select>
          </label>
          {selectedSupporting && <>
            <pre className="admin-evidence">{supportingPreview}</pre>
            <label>Exact project/document quotation<textarea value={supportingQuote} onChange={e => setSupportingQuote(e.target.value)} /></label>
            <label>Project/document evidence location<input value={supportingLocator} onChange={e => setSupportingLocator(e.target.value)} /></label>
          </>}
        </>
      )}
      <label>
        Decision
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="unresolved">Needs more evidence</option>
          <option value="exclude">Exclude this quoted record</option>
          <option value="finding">Stage a candidate from this evidence</option>
        </select>
      </label>
      <label>
        Exact quotation
        <textarea value={quote} onChange={(e) => setQuote(e.target.value)} />
      </label>
      <label>
        Evidence location (page/row/section)
        <input value={locator} onChange={(e) => setLocator(e.target.value)} />
      </label>
      <label>
        Reason
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {decision === 'finding' && (
        <>
          <label>
            Official record identifier
            <input value={record} onChange={(e) => setRecord(e.target.value)} />
          </label>
          <label>
            Title
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Work county
            <input value={county} onChange={(e) => setCounty(e.target.value)} />
          </label>
          <label>
            Work city (when stated)
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>
            Qualifying date
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setQuarter(''); }}
            />
          </label>
          {packet.category === 'forecast' && ['expected_solicitation', 'expected_solicitation_date'].includes(packet.query_window?.date_basis ?? '') && (
            <label>Estimated release quarter (if no exact date is published)
              <input placeholder="Q4 2026" value={quarter} onChange={e => { setQuarter(e.target.value); setDate(''); }} />
            </label>
          )}
          <label>
            Quotation establishing actual work location
            <textarea
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            />
          </label>
        </>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={
          busy ||
          !quote.trim() ||
          quote.length > 2000 ||
          !p.review.includes(quote) ||
          !locator.trim() ||
          !reason.trim() ||
          (selectedSupporting && (!supportingQuote.trim() || supportingQuote.length > 2000 || !supportingLocator.trim())) ||
          (decision === 'finding' &&
            (!record || !name || !county || !(quarter ? packet.category === 'forecast' && ['expected_solicitation', 'expected_solicitation_date'].includes(packet.query_window?.date_basis ?? '') && /^Q[1-4] (?:19|[2-9]\d)\d{2}$/.test(quarter) : date) || !basis))
        }
        onClick={submit}
      >
        Save evidence-backed decision
      </button>
      <p className="admin-hint">
        Server validates the current packet, quoted evidence, work location and
        dates. Staging a candidate does not import it.
      </p>
    </div>
  );
}
