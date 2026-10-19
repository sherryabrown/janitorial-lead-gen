import { useEffect, useRef, useState } from 'react';
import {
  workflowRequest,
  mutationKey,
  acknowledged,
} from '../../lib/procurement-workflow';
import { ScheduleFields } from './ScheduleFields';
import { RequestReview } from './RequestReview';
import { initialDraft, formatLocal } from './model';
import type { SamConfig, SamSchedule, Recurrence, Page } from './types';

type Form = {
  category: 'opportunity' | 'award';
  from: string;
  to: string;
  lookback: number;
  name: string;
  enabled: boolean;
  recurrence: Recurrence;
};
function initial(): Form {
  const to = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return {
    category: 'opportunity',
    to,
    from: new Date(Date.parse(to + 'T00:00:00Z') - 29 * 86400000)
      .toISOString()
      .slice(0, 10),
    lookback: 30,
    name: '',
    enabled: false,
    recurrence: initialDraft().recurrence,
  };
}
type Preview = {
  config: SamConfig;
  preview_hash: string;
  next_due_at?: string | null;
};
type History = {
  request_id: string;
  category: string;
  state: string;
  stage: string;
  created_at: string;
  parent_trigger_id: string | null;
};
function savedDraft(owner: string): {
  manual: Form;
  editor: Form | null;
  editingId: string | null;
  mode: 'run' | 'schedule' | null;
} {
  const fallback = {
    manual: initial(),
    editor: null,
    editingId: null,
    mode: null,
  };
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`spin-sam-draft:${owner}`) ?? 'null',
    );
    const valid = (f: Form) =>
      f &&
      ['opportunity', 'award'].includes(f.category) &&
      typeof f.from === 'string' &&
      typeof f.to === 'string' &&
      typeof f.name === 'string' &&
      typeof f.enabled === 'boolean' &&
      Number.isInteger(f.lookback) &&
      Array.isArray(f.recurrence?.local_times);
    return valid(saved?.manual)
      ? {
          manual: saved.manual,
          editor: valid(saved.editor) ? saved.editor : null,
          editingId:
            typeof saved.editingId === 'string' ? saved.editingId : null,
          mode: saved.mode === 'schedule' ? 'schedule' : null,
        }
      : fallback;
  } catch {
    return fallback;
  }
}
export function SamSection({
  owner,
  editing,
  onEdited,
  onRun,
  onChanged,
  onViewLeads,
}: {
  owner: string;
  editing: SamSchedule | null;
  onEdited: () => void;
  onRun: (id: string) => void;
  onChanged: () => void;
  onViewLeads: () => void;
}) {
  const restored = useRef(savedDraft(owner));
  const [manual, setManual] = useState(() => restored.current.manual),
    [editor, setEditor] = useState<Form | null>(() =>
      editing && restored.current.editingId === editing.id
        ? restored.current.editor
        : null,
    ),
    [mode, setMode] = useState<'run' | 'schedule' | null>(
      () => restored.current.mode,
    ),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [history, setHistory] = useState<History[]>([]),
    [historyOffset, setHistoryOffset] = useState<number | null>(0),
    [legacy, setLegacy] = useState<string | null>(null);
  const revision = useRef(0),
    formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `spin-sam-draft:${owner}`,
        JSON.stringify({
          manual,
          editor,
          mode,
          editingId: editing?.id ?? null,
        }),
      );
    } catch {
      /* Keep mounted draft. */
    }
  }, [owner, manual, editor, mode, editing]);
  useEffect(() => {
    if (!editing) return;
    setEditor(
      restored.current.editingId === editing.id && restored.current.editor
        ? restored.current.editor
        : {
            category: editing.config.requested_categories[0],
            ...editing.config.publication_window,
            lookback:
              editing.window_policy[editing.config.requested_categories[0]]
                .lookback_days,
            name: editing.name,
            enabled: editing.enabled,
            recurrence: editing.recurrence,
          },
    );
    restored.current.editingId = null;
    restored.current.editor = null;
    setMode('schedule');
    setPreview(null);
    setError('');
    revision.current++;
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [editing]);
  const draft = editor ?? manual;
  const update = (value: Partial<Form>) => {
    revision.current++;
    setPreview(null);
    setError('');
    if (editor) setEditor({ ...editor, ...value });
    else setManual({ ...manual, ...value });
  };
  const config: SamConfig = {
    target_kind: 'sam',
    requested_categories: [draft.category],
    publication_window: { from: draft.from, to: draft.to },
  };
  const scheduleInput = {
    name: draft.name,
    enabled: draft.enabled,
    config,
    window_policy: { [draft.category]: { lookback_days: draft.lookback } },
    recurrence: draft.recurrence,
  };
  const review = async (intent: 'run' | 'schedule') => {
    setMode(intent);
    setBusy(true);
    setError('');
    const current = revision.current;
    try {
      const p = await workflowRequest<Preview>(
        intent === 'run' ? '/v1/triggers/preview' : '/v1/schedules/preview',
        { body: intent === 'run' ? config : scheduleInput },
      );
      if (current === revision.current) setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    const action = `sam:${mode}:${editing?.id ?? 'new'}`;
    const body =
      mode === 'schedule'
        ? {
            ...scheduleInput,
            config: preview.config,
            confirmed_scope: true,
            preview_hash: preview.preview_hash,
            ...(editing ? { expected_version: editing.version } : {}),
          }
        : {
            ...preview.config,
            confirmed_scope: true,
            preview_hash: preview.preview_hash,
          };
    try {
      if (mode === 'schedule') {
        const saved = await workflowRequest<SamSchedule>(
          editing ? `/v1/schedules/${editing.id}/update` : '/v1/schedules',
          { body, key: mutationKey(owner, action, body) },
        );
        setNotice(
          `Saved ${saved.name}${saved.enabled ? ' — scheduled' : ' — paused'}.`,
        );
        setEditor(null);
        onEdited();
      } else {
        const saved = await workflowRequest<{ trigger_id: string }>(
          '/v1/triggers',
          { body, key: mutationKey(owner, action, body) },
        );
        setNotice('SAM run queued. County selection is unchanged.');
        onRun(saved.trigger_id);
      }
      acknowledged(owner, action);
      setPreview(null);
      setMode(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const invalid = !draft.from || !draft.to || draft.from > draft.to;
  return (
    <section className="admin-section" aria-label="SAM statewide checks">
      <div ref={formRef} className="admin-form">
        <h2>SAM.gov — Arkansas statewide</h2>
        <p className="admin-hint">
          Janitorial work in Arkansas · NAICS 561720. Runs independently of
          county searches. Valid results save automatically.
        </p>
        {notice && (
          <p role="status" className="admin-notice">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <legend>{editing ? 'Edit SAM schedule' : 'SAM search'}</legend>
          <label>
            Look for
            <select
              value={draft.category}
              onChange={(e) =>
                update({ category: e.target.value as Form['category'] })
              }
            >
              <option value="opportunity">Opportunities</option>
              <option value="award">Contract awards</option>
            </select>
          </label>
          <p className="admin-hint">
            {draft.category === 'opportunity'
              ? 'Posted dates'
              : 'Last modified dates'}{' '}
            · last 30 days by default.
          </p>
          {mode === 'schedule' ? (
            <label>
              Lookback days
              <input
                type="number"
                min={1}
                max={366}
                value={draft.lookback}
                onChange={(e) => update({ lookback: Number(e.target.value) })}
              />
            </label>
          ) : (
            <div className="admin-inline">
              <label>
                From
                <input
                  type="date"
                  value={draft.from}
                  onChange={(e) => update({ from: e.target.value })}
                />
              </label>
              <label>
                Through
                <input
                  type="date"
                  value={draft.to}
                  onChange={(e) => update({ to: e.target.value })}
                />
              </label>
            </div>
          )}
        </fieldset>
        {mode === 'schedule' && (
          <ScheduleFields draft={draft} onChange={update} pending={busy} />
        )}
        {preview ? (
          <div className="admin-confirm" aria-label="Confirm SAM scope">
            <strong>
              Confirm statewide SAM{' '}
              {draft.category === 'award'
                ? 'contract awards'
                : 'opportunities'}
            </strong>
            <p>
              {preview.config.publication_window.from} through{' '}
              {preview.config.publication_window.to} · Arkansas · NAICS 561720
            </p>
            {mode === 'schedule' && (
              <p>
                Rolling last {draft.lookback} days · Next run:{' '}
                {formatLocal(preview.next_due_at)}
              </p>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void submit()}
            >
              {mode === 'schedule'
                ? 'Confirm SAM schedule'
                : 'Confirm SAM run'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Back to SAM editing
            </button>
          </div>
        ) : (
          <div className="admin-form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={
                busy || (mode === 'schedule' ? !draft.name.trim() : invalid)
              }
              onClick={() =>
                void review(mode === 'schedule' ? 'schedule' : 'run')
              }
            >
              {mode === 'schedule' ? 'Review SAM schedule' : 'Run SAM now'}
            </button>
            {mode !== 'schedule' && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setMode('schedule');
                  setPreview(null);
                }}
              >
                Save SAM schedule
              </button>
            )}
          </div>
        )}
        {mode === 'schedule' && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setMode(null);
              setEditor(null);
              setPreview(null);
              onEdited();
            }}
          >
            Cancel SAM schedule
          </button>
        )}
        <p className="admin-hint">
          No AI call is needed for SAM collection. Actual usage and partial
          results appear in run details.
        </p>
        <details>
          <summary>SAM history</summary>
          {history.map((h) => (
            <div className="admin-row" key={h.request_id}>
              <div>
                <strong>
                  {h.category === 'award'
                    ? 'Contract awards'
                    : 'Opportunities'}
                </strong>
                <p>
                  {formatLocal(h.created_at)} ·{' '}
                  {h.stage === 'sam_review' ? (h.state === 'succeeded' ? 'Collected' : 'Awaiting automatic saving') : h.state}
                </p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  h.parent_trigger_id
                    ? onRun(h.parent_trigger_id)
                    : setLegacy(h.request_id)
                }
              >
                View SAM results
              </button>
            </div>
          ))}
          {historyOffset !== null && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError('');
                void workflowRequest<Page<History>>(
                  `/v1/sam/requests?offset=${historyOffset}`,
                )
                  .then((p) => {
                    setHistory((old) => [
                      ...old,
                      ...p.items.filter(
                        (i) =>
                          !old.some((h) => h.request_id === i.request_id),
                      ),
                    ]);
                    setHistoryOffset(p.next_offset);
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {history.length ? 'More SAM requests' : 'Load SAM requests'}
            </button>
          )}
          {legacy && (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => setLegacy(null)}
              >
                Close SAM results
              </button>
              <RequestReview
                key={legacy}
                id={legacy}
                owner={owner}
                sam
                onViewLeads={onViewLeads}
              />
            </>
          )}
        </details>
      </div>
    </section>
  );
}
