import { useEffect, useState } from 'react';
import {
  workflowRequest,
  mutationKey,
  acknowledged,
} from '../../lib/procurement-workflow';
import { SourceReview } from './SourceReview';
import type { RequestStatus, Packet, Task, ImportStatus, Job } from './types';
import { title } from './model';
export function RequestReview({
  id,
  owner,
  onViewLeads,
}: {
  id: string;
  owner: string;
  onViewLeads: () => void;
}) {
  const [data, setData] = useState<RequestStatus | null>(null),
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
    [sourceOffset, setSourceOffset] = useState<number | null>(0);
  useEffect(() => {
    const a = new AbortController();
    void workflowRequest<RequestStatus>(`/v1/requests/${id}`, {
      signal: a.signal,
    })
      .then((r) => {
        if (!a.signal.aborted) {
          setData(r);
          setSelected([]);
          const pending = r.jobs.find((j) => j.stage?.startsWith('import_'));
          if (pending)
            void workflowRequest<ImportStatus>(`/v1/imports/${pending.id}`, {
              signal: a.signal,
            })
              .then(setJob)
              .catch(() => {});
        }
      })
      .catch((e) => {
        if (!a.signal.aborted) setError(e.message);
      });
    return () => a.abort();
  }, [id, version]);
  useEffect(() => {
    if (!job || !['pending', 'running'].includes(job.state)) return;
    const a = new AbortController(),
      timer = setTimeout(() => {
        void workflowRequest<ImportStatus>(`/v1/imports/${job.job_id}`, {
          signal: a.signal,
        })
          .then(setJob)
          .catch((e) => {
            if (!a.signal.aborted) setError(e.message);
          });
      }, 3000);
    return () => {
      a.abort();
      clearTimeout(timer);
    };
  }, [job]);
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
      const p = await workflowRequest<Packet>(path);
      setPacket({ task, data: p, discovery });
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
  return (
    <section className="admin-request-review" aria-label="Saved results">
      <div className="admin-section-heading">
        <h3>Saved results</h3>
        <button
          type="button"
          className="text-button"
          onClick={() => setVersion((x) => x + 1)}
        >
          Refresh results
        </button>
      </div>
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
          {data.jobs
            .filter((j) => !j.stage?.startsWith('import_'))
            .map((j) => (
              <div key={j.id}>
                <p className="admin-hint">
                  <strong>{title(j.stage ?? j.state)}</strong> | {j.next_action}
                </p>
                {j.access_handoff_id && <SavedAccess job={j} onChange={() => setVersion(x => x + 1)} />}
              </div>
            ))}
          {data.tasks.map((t) => (
            <div className="admin-task" key={t.id}>
              <div>
                <strong>
                  {title(t.category)} · {title(t.state)}
                </strong>
                <p>{t.reason}</p>
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
                ].includes(t.state) && (
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
            </div>
          ))}
          {!!data.tasks.some((t) =>
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
                onClick={() => setPacket(null)}
              >
                Close evidence
              </button>
              {packet.discovery ? (
                <SourceReview
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
          {data.candidates.map((c) => (
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
                  const p = await workflowRequest<RequestStatus>(
                    `/v1/requests/${id}?offset=${data.next_offset}`,
                  );
                  setData({
                    ...p,
                    candidates: [...data.candidates, ...p.candidates],
                  });
                }, false)
              }
            >
              More candidates
            </button>
          )}
          {selected.length > 0 && (
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
                disabled={busy || !reason.trim()}
                onClick={prepare}
              >
                Prepare tested import · {selected.length} selected
              </button>
            </div>
          )}
          {job && (
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
              {job.stage === 'import_verified' && (
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
type AccessStatus = { tenant: string; next: { action?: string }; hosted?: { recipe_current: boolean; session_current: boolean } };
function SavedAccess({job,onChange}:{job:Job;onChange:()=>void}) {
  const [access,setAccess]=useState<AccessStatus|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const path=`/v1/access/${job.access_handoff_id}`;
  const perform=async(action?:string)=>{
    setBusy(true);setMessage('');
    try {
      if(action) {
        const result=await workflowRequest<{next_action?:string;state:string}>(`${path}/${action}`,{body:{}});
        setMessage(result.next_action??title(result.state));onChange();
      }
      setAccess(await workflowRequest<AccessStatus>(path));
    }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  };
  return <div className="admin-review-form">
    <button type="button" className="text-button" disabled={busy} onClick={()=>void perform()}>Check saved portal access</button>
    {access && <>
      <p>{access.tenant} · {access.next.action}</p>
      <div className="admin-inline">
        <button type="button" className="text-button" disabled={busy||!access.hosted?.recipe_current} onClick={()=>void perform('continue')}>Resume saved sign-in</button>
        <button type="button" className="text-button" disabled={busy||!access.hosted?.session_current||job.capture_state==='captured'||!['pending','partial'].includes(job.state)} onClick={()=>void perform(`capture/${job.id}`)}>Capture saved method</button>
        {job.capture_state && job.capture_state!=='captured' && <button type="button" className="text-button" disabled={busy} onClick={()=>void perform(`capture/${job.id}/reconcile`)}>Reconcile saved capture</button>}
      </div>
      <p className="admin-hint">Manual browser verification does not verify the hosted session. These actions resume the existing record; they do not create an account or approve unattended collection.</p>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
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
    [basis, setBasis] = useState('');
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
      item = { reason, evidence };
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
                  source_url: p.url,
                  work_state: 'AR',
                  work_county: county,
                  work_city: city || undefined,
                  [field]: date,
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
            Listing captured. Project details and documents still need verification;
            a listing alone does not establish a qualified lead. Opening the Portal
            does not verify the server session.
          </p>
          <a href={packet.portal_url} target="_blank" rel="noreferrer">Open agency Portal</a>
          <ul>
            {packet.project_links.filter(link => link.run_id === p.run_id).map(link => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
                {' · Closes '}{link.closes}
              </li>
            ))}
          </ul>
          <p className="admin-hint">
            If a project asks for sign-in or security verification, complete the
            official access action and retain the saved evidence for review.
            No automatic challenge retries are performed.
          </p>
        </details>
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
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
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
          (decision === 'finding' &&
            (!record || !name || !county || !date || !basis))
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
