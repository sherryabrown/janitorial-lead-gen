import { useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { RequestReview } from './RequestReview';
import type { Run, Step } from './types';
import { activeRun, title, usageText, formatLocal, runLabel, hasSourceAttention } from './model';
export function RunDetail({
  id,
  owner,
  onClose,
  onViewLeads,
  onSource,
  changed,
}: {
  id: string;
  owner: string;
  onClose: () => void;
  onViewLeads: () => void;
  onSource: (id: string) => void;
  changed: () => void;
}) {
  const [run, setRun] = useState<Run | null>(null),
    [steps, setSteps] = useState<Step[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [child, setChild] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const changedRef = useRef(changed),
    pageStart = useRef<string | null>(null),
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
    pageStart.current = null;
    morePending.current = false;
    setSteps([]);
    setError('');
    const load = async () => {
      try {
        const start = pageStart.current;
        const [r, s] = await Promise.all([
          workflowRequest<Run>(`/v1/triggers/${id}`, {
            signal: abort.signal,
          }),
          workflowRequest<{ items: Step[]; next_cursor: string | null }>(
            `/v1/triggers/${id}/steps${start ? `?cursor=${start}` : ''}`,
            { signal: abort.signal },
          ),
        ]);
        if (abort.signal.aborted) return;
        setRun(r);
        if (pageStart.current === start) {
          setSteps((old) =>
            [
              ...new Map(
                [...old, ...s.items].map((step) => [step.id, step]),
              ).values(),
            ].sort((a, b) => a.sequence - b.sequence),
          );
          setCursor(s.next_cursor);
        }
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
  }, [id, refresh]);
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
      pageStart.current = start;
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
        <h2>{run ? runLabel(run) : 'Loading run…'}</h2>
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
      {run && (
        <>
          <p>
            {run.next_action} · {usageText(run.usage)}
          </p>
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
          <details open>
            <summary>Steps · {steps.length}</summary>
            <div className="admin-step-list">
              {steps.map((s) => (
                <div key={s.id}>
                  <strong>
                    {title(s.phase)} · {title(s.state)}
                  </strong>
                  <p>
                    {s.county_id ?? 'Shared scope'} ·{' '}
                    {formatLocal(s.started_at)} ·{' '}
                    {s.finished_at
                      ? `${Math.max(0, new Date(s.finished_at).getTime() - new Date(s.started_at).getTime())} ms`
                      : 'In progress'}{' '}
                    · {title(s.reason)}
                  </p>
                  <small>{usageText(s.usage)}</small>
                  {Boolean(s.summary?.outcome) && (
                    <p>{title(String(s.summary.outcome))}</p>
                  )}
                </div>
              ))}
            </div>
            {cursor && (
              <button
                type="button"
                className="text-button"
                onClick={() => void more()}
              >
                More steps
              </button>
            )}
          </details>
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
          <label className="input-field">
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
                    : (run.config?.counties?.find((x) => x.id === c.county_id)
                        ?.name ?? c.county_id)}{' '}
                  · {title(c.role)}
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
        </>
      )}
    </section>
  );
}
