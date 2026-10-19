import { useEffect, useRef, useState } from 'react';
import {
  workflowRequest,
  mutationKey,
  acknowledged,
} from '../../lib/procurement-workflow';
import { CountySelector } from './CountySelector';
import { SamSection } from './SamSection';
import { TriggerForm } from './TriggerForm';
import { ScheduleList, StateSourceList, ActivityList } from './ScheduleList';
import { RunDetail } from './RunDetail';
import { initialDraft, invalidDraft, resolvedConfig } from './model';
import type {
  Draft,
  AnySchedule,
  SamSchedule,
  County,
  Preview,
  Schedule,
  Run,
  Page,
  StateSource,
  SchedulerStatus,
} from './types';
import './admin.css';
type Editor = {
  draft: Draft;
  id?: string;
  version?: number;
  intent: 'run' | 'schedule';
};
function restoredDraft(d: Draft | null): Draft | null {
  if (
    d?.config &&
    Array.isArray(d.config.county_ids) &&
    Array.isArray(d.config.requested_categories) &&
    d.config.requested_categories.every((k) =>
      ['forecast', 'opportunity', 'award'].includes(k),
    ) &&
    d.window_policy &&
    d.recurrence &&
    Array.isArray(d.recurrence.local_times) &&
    typeof d.name === 'string'
  )
    return {
      ...initialDraft(),
      ...d,
      window_policy: { ...initialDraft().window_policy, ...d.window_policy },
    };
  return null;
}
function readDraft(owner: string): Draft {
  try {
    return (
      restoredDraft(
        JSON.parse(
          sessionStorage.getItem(`spin-admin-draft:${owner}`) || 'null',
        ),
      ) ?? initialDraft()
    );
  } catch {
    return initialDraft();
  }
}
function readEditor(owner: string): Editor | null {
  try {
    const saved = JSON.parse(
        sessionStorage.getItem(`spin-admin-editor:${owner}`) || 'null',
      ),
      draft = restoredDraft(saved?.draft);
    return draft && ['run', 'schedule'].includes(saved.intent)
      ? { ...saved, draft }
      : null;
  } catch {
    return null;
  }
}
const merge = <T extends { id: string }>(old: T[], next: T[]) => [
  ...new Map([...old, ...next].map((i) => [i.id, i])).values(),
];
export default function AdminScreen({
  owner,
  onViewLeads,
}: {
  owner: string;
  onViewLeads: () => void;
}) {
  const [manual, setManual] = useState(() => readDraft(owner)),
    [editor, setEditor] = useState<Editor | null>(() => readEditor(owner)),
    [counties, setCounties] = useState<County[]>([]),
    [sources, setSources] = useState<StateSource[]>([]),
    [schedules, setSchedules] = useState<AnySchedule[]>([]),
    [runs, setRuns] = useState<Run[]>([]),
    [status, setStatus] = useState<SchedulerStatus | null>(null),
    [scheduleOffset, setScheduleOffset] = useState<number | null>(null),
    [runOffset, setRunOffset] = useState<number | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewMode, setPreviewMode] = useState<'run' | 'schedule'>('run'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [samEditor, setSamEditor] = useState<SamSchedule | null>(() => {
      try {
        const s = JSON.parse(
          sessionStorage.getItem(`spin-admin-sam-editor:${owner}`) ?? 'null',
        );
        return s?.config?.target_kind === 'sam' &&
          typeof s.id === 'string' &&
          Number.isInteger(s.version)
          ? s
          : null;
      } catch {
        return null;
      }
    }),
    [loading, setLoading] = useState(true),
    [registryState, setRegistryState] = useState<
      'loading' | 'ready' | 'error'
    >('loading'),
    [revision, setRevision] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null),
    scopeRevision = useRef(0);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `spin-admin-sam-editor:${owner}`,
        JSON.stringify(samEditor),
      );
    } catch {
      /* Keep mounted editor. */
    }
  }, [owner, samEditor]);
  const draft = editor?.draft ?? manual,
    saving = editor?.intent === 'schedule';
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `spin-admin-draft:${owner}`,
        JSON.stringify(manual),
      );
    } catch {
      /* Draft remains available in this mounted screen. */
    }
  }, [manual, owner]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `spin-admin-editor:${owner}`,
        JSON.stringify(editor),
      );
    } catch {
      /* The editor remains available while mounted. */
    }
  }, [editor, owner]);
  useEffect(() => {
    const a = new AbortController();
    setError('');
    void Promise.allSettled([
      workflowRequest<{ counties: County[] }>('/v1/counties', {
        signal: a.signal,
      }),
      workflowRequest<{ items: StateSource[] }>('/v1/state-triggers', {
        signal: a.signal,
      }),
      workflowRequest<Page<AnySchedule>>('/v1/schedules', {
        signal: a.signal,
      }),
      workflowRequest<Page<Run>>('/v1/triggers', { signal: a.signal }),
      workflowRequest<SchedulerStatus>('/v1/scheduler/status', {
        signal: a.signal,
      }),
    ])
      .then(([c, s, sch, r, st]) => {
        if (a.signal.aborted) return;
        if (c.status === 'fulfilled') {
          setCounties(c.value.counties);
          setRegistryState('ready');
        } else setRegistryState('error');
        if (s.status === 'fulfilled') setSources(s.value.items);
        if (sch.status === 'fulfilled') {
          setSchedules(sch.value.items);
          setScheduleOffset(sch.value.next_offset);
        }
        if (r.status === 'fulfilled') {
          setRuns(r.value.items);
          setRunOffset(r.value.next_offset);
        }
        if (st.status === 'fulfilled') setStatus(st.value);
        const failed = [c, s, sch, r, st].find(
          (x) => x.status === 'rejected',
        );
        if (failed?.status === 'rejected')
          setError(
            failed.reason instanceof Error
              ? failed.reason.message
              : 'Some Admin data could not load. Retry the connection.',
          );
      })
      .finally(() => {
        if (!a.signal.aborted) setLoading(false);
      });
    return () => a.abort();
  }, [revision]);
  useEffect(() => {
    if (selected)
      detailRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'nearest',
      });
  }, [selected]);
  const update = (d: Draft) => {
    scopeRevision.current++;
    setPreview(null);
    setError('');
    if (editor) setEditor({ ...editor, draft: d });
    else setManual(d);
  };
  const cancel = () => {
    scopeRevision.current++;
    setPreview(null);
    setError('');
    if (!preview) setEditor(null);
  };
  const review = async (mode: 'run' | 'schedule') => {
    if (mode === 'schedule' && !saving) {
      setEditor({ draft: structuredClone(draft), intent: 'schedule' });
      setPreview(null);
      return;
    }
    const invalid = invalidDraft(draft, mode === 'schedule');
    if (invalid) {
      setError(invalid);
      return;
    }
    if (
      draft.config.county_ids.some((id) => !counties.some((c) => c.id === id))
    ) {
      setError('Remove unavailable county selections before running.');
      return;
    }
    const version = scopeRevision.current;
    setBusy(true);
    setError('');
    try {
      const p = await workflowRequest<Preview>(
        mode === 'schedule'
          ? '/v1/schedules/preview'
          : '/v1/triggers/preview',
        { body: mode === 'schedule' ? draft : resolvedConfig(draft) },
      );
      if (version !== scopeRevision.current) return;
      setPreview(p);
      setPreviewMode(mode);
    } catch (e) {
      if (version === scopeRevision.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    const captured = preview,
      config = {
        ...draft.config,
        search_windows: preview.config.search_windows,
      };
    const body =
      previewMode === 'schedule'
        ? {
            ...draft,
            confirmed_scope: true,
            preview_hash: preview.preview_hash,
            ...(editor?.id ? { expected_version: editor.version } : {}),
          }
        : {
            ...config,
            confirmed_scope: true,
            preview_hash: preview.preview_hash,
          };
    const action =
      previewMode === 'schedule' ? `save:${editor?.id ?? 'new'}` : 'submit';
    try {
      if (previewMode === 'schedule') {
        const s = await workflowRequest<Schedule>(
          editor?.id ? `/v1/schedules/${editor.id}/update` : '/v1/schedules',
          { body, key: mutationKey(owner, action, body) },
        );
        setNotice(
          `Saved ${s.name}${s.enabled ? ' — scheduled' : ' — paused'}.`,
        );
        setEditor(null);
      } else {
        const r = await workflowRequest<{ trigger_id: string }>(
          '/v1/triggers',
          { body, key: mutationKey(owner, action, body) },
        );
        setSelected(r.trigger_id);
        setNotice('Run queued. Selection kept; progress appears below.');
        if (editor) setEditor(null);
      }
      acknowledged(owner, action);
      if (preview === captured) setPreview(null);
      setRevision((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const scheduleAction = async (s: AnySchedule, action: string) => {
    setBusy(true);
    setError('');
    try {
      const body = { expected_version: s.version },
        id = `schedule:${s.id}:${action}`;
      const r = await workflowRequest<{
        trigger_id?: string;
        state?: string;
      }>(`/v1/schedules/${s.id}/${action}`, {
        body,
        ...(action === 'run-now'
          ? { key: mutationKey(owner, id, body) }
          : {}),
      });
      if (action === 'run-now') {
        acknowledged(owner, id);
        if (r.trigger_id) setSelected(r.trigger_id);
        setNotice(
          r.trigger_id
            ? 'Run queued from the saved schedule.'
            : `Run ${r.state ?? 'not queued'}; review schedule history.`,
        );
      } else
        setNotice(
          `${s.name}: ${action === 'archive' ? 'archived; saved evidence retained' : action === 'pause' ? 'paused' : 'resumed'}.`,
        );
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = async (s: AnySchedule) => {
    if (s.config?.target_kind === 'sam') {
      try {
        setSamEditor(
          await workflowRequest<SamSchedule>(`/v1/schedules/${s.id}`),
        );
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    setError('');
    try {
      const full = await workflowRequest<Schedule>(`/v1/schedules/${s.id}`);
      setEditor({
        id: full.id,
        version: full.version,
        intent: 'schedule',
        draft: {
          config: full.config,
          window_policy: {
            ...initialDraft().window_policy,
            ...full.window_policy,
          },
          recurrence: full.recurrence,
          name: full.name,
          enabled: full.enabled,
        },
      });
      setPreview(null);
      scopeRevision.current++;
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const sourceAction = async (s: StateSource, intent: 'run' | 'schedule') => {
    if (intent === 'schedule' && s.schedule_id) {
      void edit({ id: s.schedule_id } as Schedule);
      return;
    }
    const d = initialDraft();
    d.name = s.name;
    d.config = {
      ...d.config,
      target_kind: 'state_source',
      state_trigger_id: s.id,
      county_ids: [...s.county_ids],
      requested_categories: [s.category],
    };
    setEditor({ intent, draft: d });
    setPreview(null);
    scopeRevision.current++;
  };
  const loadMore = async (kind: 'schedules' | 'triggers') => {
    setError('');
    try {
      if (kind === 'schedules') {
        const p = await workflowRequest<Page<AnySchedule>>(
          `/v1/schedules?offset=${scheduleOffset}`,
        );
        setSchedules((x) => merge(x, p.items));
        setScheduleOffset(p.next_offset);
      } else {
        const p = await workflowRequest<Page<Run>>(
          `/v1/triggers?offset=${runOffset}`,
        );
        setRuns((x) => merge(x, p.items));
        setRunOffset(p.next_offset);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const sourceScope =
    draft.config.target_kind === 'state_source'
      ? sources.find((s) => s.id === draft.config.state_trigger_id)
      : undefined;
  return (
    <section className="admin-screen" aria-label="Admin county checks">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>County checks</h1>
          <p>
            Keep procurement sources current and check for new or changed
            leads.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onViewLeads}>
          Back to contracts
        </button>
      </header>
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {error && !preview && (
        <p role="alert" className="admin-error">
          {error}{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => setRevision((x) => x + 1)}
          >
            Retry Admin connection
          </button>
        </p>
      )}
      {loading && (
        <p role="status">Loading county registry and saved activity…</p>
      )}
      {status &&
        (!status.enabled ||
          !status.extensions_ready ||
          status.backend_key_configured === false) && (
          <p className="admin-error" role="status">
            Scheduled execution is not ready. Saved schedules will require
            service activation before they run.
          </p>
        )}
      {editor && (
        <div className="admin-editor-banner">
          <strong>
            {editor.id
              ? 'Editing a saved schedule'
              : draft.config.target_kind === 'state_source'
                ? 'Independent state-source draft'
                : 'New schedule draft'}
          </strong>
          <span>Manual selection is kept separately.</span>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setEditor(null);
              setPreview(null);
              scopeRevision.current++;
            }}
          >
            {draft.config.target_kind === 'state_source'
              ? 'Back to county checks'
              : 'Cancel editing'}
          </button>
        </div>
      )}
      <div className="admin-layout">
        <CountySelector
          counties={counties}
          selectableIds={
            draft.config.target_kind === 'state_source'
              ? (sourceScope?.county_ids ?? [])
              : undefined
          }
          sourceScopeName={
            draft.config.target_kind === 'state_source'
              ? (sourceScope?.name ?? 'Saved state source')
              : undefined
          }
          registryState={registryState}
          selected={draft.config.county_ids}
          disabled={busy}
          onChange={(ids) =>
            update({ ...draft, config: { ...draft.config, county_ids: ids } })
          }
        />
        <TriggerForm
          draft={draft}
          onChange={update}
          editing={!!editor?.id}
          saving={!!saving}
          preview={preview}
          pending={busy}
          onPreview={(mode) => void review(mode)}
          onSubmit={() => void submit()}
          onCancel={cancel}
          error={preview ? error : ''}
          monthlyCap={status?.ai_policy?.monthly_usd}
        />
      </div>
      <SamSection
        owner={owner}
        editing={samEditor}
        onEdited={() => setSamEditor(null)}
        onRun={setSelected}
        onChanged={() => setRevision((x) => x + 1)}
        onViewLeads={onViewLeads}
      />
      <StateSourceList
        items={sources}
        counties={counties}
        onAction={(s, a) => void sourceAction(s, a)}
        onView={setSelected}
      />
      <ScheduleList
        items={schedules}
        more={scheduleOffset !== null}
        onMore={() => void loadMore('schedules')}
        onEdit={(s) => void edit(s)}
        onAction={(s, a) => void scheduleAction(s, a)}
        busy={busy}
      />
      <ActivityList
        items={runs}
        onView={(id) => setSelected((x) => (x === id ? null : id))}
        selected={selected}
        more={runOffset !== null}
        onMore={() => void loadMore('triggers')}
      />
      {selected && (
        <div ref={detailRef}>
          <RunDetail
            key={selected}
            id={selected}
            owner={owner}
            onClose={() => setSelected(null)}
            onViewLeads={onViewLeads}
            onSource={setSelected}
            changed={() => setRevision((x) => x + 1)}
          />
        </div>
      )}
    </section>
  );
}
