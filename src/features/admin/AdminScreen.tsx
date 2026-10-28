import {Breadcrumb} from './Breadcrumb';
import {SettingsNavigation} from './breadcrumb-context';
import {adminViewLabels} from './navigation';
import {MetricNavigation} from './MetricLink';
import {useActiveRead} from './use-active-read';
import type {MetricScope} from './metric-scope';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  workflowRequest,
  mutationKey,
  acknowledged,
} from '../../lib/procurement-workflow';
import {ScheduleEditor} from './ScheduleEditor';
import { CountySelector } from './CountySelector';
import { SamSection } from './SamSection';
import { TriggerForm } from './TriggerForm';
import { ScheduleList, StateSourceList } from './ScheduleList';
import {RunHistory} from './RunHistory';
import {Analytics} from './Analytics';
import {Catalog} from './Catalog';
import {SchedulingAccess} from './SchedulingRole';
import {useSchedulingRole} from './scheduling-role';
import {SourceStatus} from './SourceStatus';
import { RunDetail } from './RunDetail';
import { initialDraft, invalidDraft, resolvedConfig, readFailure } from './model';
import type {
  Draft,
  AnySchedule,
  SamSchedule,
  County,
  Preview,
  Schedule,
  Page,
  StateSource,
  SchedulerStatus,
} from './types';
import './admin.css';
import {readAdminLocation,pushAdminLocation,replaceAdminLocation,saveAdminContext, type AdminContext } from './navigation';
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
function historyEntry(context:AdminContext):AdminContext{return context.view==='history'&&!context.runId&&!context.historySearchId?{...context,historySearchId:crypto.randomUUID()}:context;}
function SchedulingWorkspace({
  owner,
  onViewLeads,
  active: workspaceActive = true,
}: {
  owner: string;
  onViewLeads: (scope?:MetricScope) => void;
  active?: boolean;
}) {
  const active=useActiveRead(workspaceActive);
  const role=useSchedulingRole();
  const [scheduleEditor,setScheduleEditor]=useState<{saved?:AnySchedule;target:string}|null>(null);
  const [scheduleQuery,setScheduleQuery]=useState(()=>{try{return sessionStorage.getItem(`spin-admin-schedule-filter:${owner}`)??'lifecycle=current';}catch{return 'lifecycle=current';}});
  const [scheduleTotal,setScheduleTotal]=useState<number|undefined>();
  const [reloadedSchedule,setReloadedSchedule]=useState<Schedule|null>(null);
  const [scheduleReadError,setScheduleReadError]=useState('');
  const [savedScheduleFocus,setSavedScheduleFocus]=useState<AnySchedule|null>(null);

  const stateSourcesRef=useRef<HTMLDivElement>(null),samRef=useRef<HTMLDivElement>(null);
  const [navigation, setNavigation] = useState<AdminContext>(() => {
    const saved = readAdminLocation(owner);
    return historyEntry(saved);
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus=useRef<HTMLElement|null>(null),previousRun=useRef<string|null>(null),restoreFocus=useRef(false);
  const schedulesRef = useRef<HTMLDivElement>(null), manualRef = useRef<HTMLDivElement>(null), historyRef = useRef<HTMLDivElement>(null),statsRef=useRef<HTMLDivElement>(null);
  const manualView=navigation.section==='manual'&&role.manage_sources;
  useEffect(() => {
    if(!active)return;
    const target=navigation.runId?detailRef.current?.querySelector<HTMLElement>('h2'):navigation.view==='stats'?statsRef.current:navigation.scheduleId?schedulesRef.current?.querySelector<HTMLElement>('.schedule-detail h2'):navigation.view==='history'?historyRef.current:manualView?manualRef.current:headingRef.current;
    target?.focus();if(navigation.runId||navigation.scheduleId||navigation.view==='history'||manualView)target?.scrollIntoView?.({block:'nearest'});
  }, [active,navigation.view,navigation.scheduleId,navigation.runId,manualView]);
  useEffect(() => { saveAdminContext(owner, navigation);if(navigation.historySearchId&&!new URLSearchParams(window.location.search).has('adminHistorySearch'))replaceAdminLocation(owner,navigation); }, [owner, navigation]);
  useEffect(()=>{const back=()=>{const context=historyEntry(readAdminLocation(owner));if(previousRun.current&&!context.runId)restoreFocus.current=true;setNavigation(context);};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[owner]);
  const commitNavigation=(value:AdminContext)=>{const context=historyEntry(value);pushAdminLocation(owner,context);setNavigation(context);};
  const selected=navigation.runId??null;
  const setSelected=(value:string|null|((old:string|null)=>string|null))=>{const id=typeof value==='function'?value(selected):value;commitNavigation({...navigation,runId:id??undefined,runSection:'overview'});};
  const viewRun=(id:string,section:'overview'|'logs'|'sources'='overview')=>{returnFocus.current=document.activeElement as HTMLElement;commitNavigation({...navigation,runId:id,runSection:section});};
  useEffect(()=>{if(previousRun.current&&!selected&&restoreFocus.current&&returnFocus.current?.isConnected){returnFocus.current.focus({preventScroll:true});returnFocus.current.scrollIntoView?.({block:'nearest'});}restoreFocus.current=false;previousRun.current=selected;},[selected]);
  const navigate = (view: AdminContext['view'], manual = false) => {
    commitNavigation({ view, returnTo: 'contracts', ...(view==='history'?{historySearchId:crypto.randomUUID()}:{}), ...(manual ? { section: 'manual' } : {}) });
    const target = manual ? manualRef.current : view === 'history' ? historyRef.current : view==='stats'?statsRef.current:schedulesRef.current;
    target?.focus(); target?.scrollIntoView?.({ block: 'start' });
  };
  const [manual, setManual] = useState(() => readDraft(owner)),
    [editor, setEditor] = useState<Editor | null>(() => readEditor(owner)),
    [counties, setCounties] = useState<County[]>([]),
    [sources, setSources] = useState<StateSource[]>([]),
    [schedules, setSchedules] = useState<AnySchedule[]>([]),
    [status, setStatus] = useState<SchedulerStatus | null>(null),
    [scheduleOffset, setScheduleOffset] = useState<number | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewMode, setPreviewMode] = useState<'run' | 'schedule'>('run'),
    [error, setError] = useState(''),
    [connectionError,setConnectionError]=useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
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
    [revision, setRevision] = useState(0),
    [connectionRevision, setConnectionRevision] = useState(0),
    [paging, setPaging] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null),
    scopeRevision = useRef(0),
    collectionGeneration = useRef(0),
    failedSchedulePage=useRef(false),
    pagingRef = useRef(false),
    loaded = useRef({schedules:(()=>{try{const n=Number(sessionStorage.getItem(`spin-admin-schedule-page:${owner}`));return Number.isInteger(n)&&n>=50&&n<=5000?n:50;}catch{return 50;}})(),triggers:50});
  const filterSchedules=useCallback((query:string)=>{
    if(query===scheduleQuery)return;
    collectionGeneration.current++;
    failedSchedulePage.current=false;loaded.current.schedules=50;setSchedules([]);setScheduleTotal(undefined);setScheduleQuery(query);
    try{sessionStorage.setItem(`spin-admin-schedule-filter:${owner}`,query);sessionStorage.removeItem(`spin-admin-schedule-page:${owner}`);}catch{/* Mounted filters remain. */}
  },[owner,scheduleQuery]);
  useEffect(()=>{if(editor?.id)manualRef.current?.focus();},[editor?.id]);
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
    void workflowRequest<{counties:County[]}>('/v1/counties',{signal:a.signal}).then(value=>{
      if(!a.signal.aborted){setCounties(value.counties);setRegistryState('ready');}
    }).catch(e=>{if(!a.signal.aborted){setRegistryState('error');setConnectionError(e.message);}});
    if(role.technical_details)void workflowRequest<SchedulerStatus>('/v1/scheduler/status',{signal:a.signal}).then(value=>{
      if(!a.signal.aborted)setStatus(value);
    }).catch(e=>{if(!a.signal.aborted)setConnectionError(e.message);});
    return () => a.abort();
  }, [connectionRevision,role.technical_details]);
  useEffect(()=>{
    const a=new AbortController();
    void workflowRequest<{items:StateSource[]}>('/v1/state-triggers',{signal:a.signal}).then(value=>{
      if(!a.signal.aborted)setSources(value.items);
    }).catch(e=>{if(!a.signal.aborted)setConnectionError(e.message);});
    return()=>a.abort();
  },[revision,connectionRevision]);
  useEffect(() => {
    const a = new AbortController();
    const epoch = ++collectionGeneration.current;
    pagingRef.current = true; setPaging(true);
    const range = async <T,>(kind: 'schedules' | 'triggers'): Promise<Page<T>> => {
      let offset: number | null = 0;
      const items: T[] = [];
      do {
        const params=new URLSearchParams(kind==='schedules'?scheduleQuery:'');if(offset)params.set('offset',String(offset));
        const page: Page<T> = await workflowRequest(`/v1/${kind}${params.size?'?'+params:''}`, { signal: a.signal });
        if(kind==='schedules'&&!a.signal.aborted)setScheduleTotal(page.total);
        items.push(...page.items); offset = page.next_offset;
      } while (offset !== null && offset < loaded.current[kind]);
      return { items, next_offset: offset };
    };
    void range<AnySchedule>('schedules').then(page=>{
      if(a.signal.aborted)return;
      failedSchedulePage.current=false;setSchedules(page.items);setScheduleOffset(page.next_offset);setScheduleReadError('');
    }).catch(e=>{if(!a.signal.aborted)setScheduleReadError(readFailure(e,'Schedules'));})
      .finally(()=>{if(!a.signal.aborted){setLoading(false);setPaging(false);pagingRef.current=false;}});
    return () => { a.abort(); collectionGeneration.current = epoch + 1; };
  }, [revision, connectionRevision, scheduleQuery]);
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
        setSavedScheduleFocus(s);
        commitNavigation({view:'schedules',returnTo:'contracts',scheduleId:s.id,section:'overview'});
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
        reason?: string;
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
            : `Run ${r.state ?? 'not queued'}${r.reason ? ' · '+r.reason.replaceAll('_',' ') : ''}; review schedule history.`,
        );
      } else if(action==='delete'){setSavedScheduleFocus(null);commitNavigation({view:'schedules',returnTo:'contracts'});setNotice(`${s.name}: deleted; audit history retained.`);
      } else {
        setSavedScheduleFocus({...s,...r} as AnySchedule);
        setNotice(
          `${s.name}: ${action === 'archive' ? 'archived; saved evidence retained' : action === 'pause' ? 'paused' : 'resumed'}.`,
        );
      }
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = async (s:AnySchedule) => {
    const version=scopeRevision.current;
    try{const full=await workflowRequest<AnySchedule>(`/v1/schedules/${s.id}`);if(version===scopeRevision.current)setScheduleEditor({saved:full,target:full.config.target_kind});}catch(e){setError((e as Error).message);}
  };
  const sourceAction = async (s: StateSource, intent: 'run' | 'schedule') => {
    if(intent==='schedule'&&!s.schedule_id){setScheduleEditor({target:'state_source'});return;}
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
  const loadMore = async () => {
    if (pagingRef.current||scheduleOffset===null) return;
    const generation=collectionGeneration.current;
    pagingRef.current=true;setPaging(true);setScheduleReadError('');
    try{
      const params=new URLSearchParams(scheduleQuery);params.set('offset',String(scheduleOffset));
      const p=await workflowRequest<Page<AnySchedule>>(`/v1/schedules?${params}`);
      if(generation!==collectionGeneration.current)return;
      loaded.current.schedules=scheduleOffset+Math.max(p.items.length,1);try{sessionStorage.setItem(`spin-admin-schedule-page:${owner}`,String(loaded.current.schedules));}catch{/* Mounted pages remain. */}failedSchedulePage.current=false;setSchedules(x=>merge(x,p.items));setScheduleOffset(p.next_offset);
    }catch(e){if(generation===collectionGeneration.current){failedSchedulePage.current=true;setScheduleReadError(readFailure(e,'More schedules'));}}
    finally{if(generation===collectionGeneration.current){pagingRef.current=false;setPaging(false);}}
  };
  const sourceScope =
    draft.config.target_kind === 'state_source'
      ? sources.find((s) => s.id === draft.config.state_trigger_id)
      : undefined;
  return (
    <SettingsNavigation.Provider value={()=>navigate('schedules')}><MetricNavigation active={active} onLeads={onViewLeads} onRun={(id,requestId)=>{returnFocus.current=document.activeElement as HTMLElement;commitNavigation({...navigation,runId:id,runSection:'overview',issueRequestId:requestId});}}><section className="admin-screen" aria-label="Scheduling">
      <h1 className="settings-context" ref={headingRef} tabIndex={-1}>Settings</h1>
      <div className="admin-workspace-bar">
      <nav className="admin-workspace-nav" aria-label="Scheduling views">
        <button type="button" className="secondary-button compact" aria-current={navigation.view === 'schedules' && navigation.section !== 'manual' ? 'page' : undefined} onClick={() => navigate('schedules')}>Schedules</button>
        <button type="button" className="text-button" aria-current={navigation.view === 'history' ? 'page' : undefined} onClick={() => navigate('history')}>Run history</button>
        <button type="button" className="text-button" aria-current={navigation.view === 'stats' ? 'page' : undefined} onClick={() => navigate('stats')}>Results analytics</button>
        {role.manage_sources&&<button type="button" className="text-button" aria-current={navigation.view === 'attention' ? 'page' : undefined} onClick={() => navigate('attention')}>Needs attention</button>}
        {role.technical_details&&<details className="admin-technical-nav"><summary>Technical tools</summary><button type="button" className="text-button" onClick={() => navigate('sources')}>Source registry</button><button type="button" className="text-button" onClick={() => navigate('geography')}>Geography registry</button><button type="button" className="text-button" onClick={() => navigate('schedules',true)}>Manual runs</button></details>}
      </nav></div>
      {!selected&&!scheduleEditor&&!navigation.scheduleId&&!navigation.sourceId&&!navigation.geographyId&&<Breadcrumb items={[{label:'Settings'},{label:adminViewLabels[navigation.view]},...(manualView?[{label:'Manual runs'}]:[])]}/>}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {(error||connectionError&&navigation.section==='manual') && !preview && navigation.view==='schedules' && !selected && (
        <p role="alert" className="admin-error">
          {error||connectionError}{' '}
          {connectionError&&<button
            type="button"
            className="text-button"
            onClick={() => { setConnectionError(''); setConnectionRevision(x => x + 1); }}
          >
            Retry Admin connection
          </button>}
        </p>
      )}
      {loading && navigation.view==='schedules' && !selected && (
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
      {scheduleEditor&&<ScheduleEditor key={scheduleEditor.saved?.id??'new'} owner={owner} initial={manual} saved={scheduleEditor.saved} target={scheduleEditor.target} counties={counties} sources={sources} registryState={registryState} onClose={()=>setScheduleEditor(null)} onSchedules={()=>{setScheduleEditor(null);navigate('schedules');}} onSaved={s=>{setScheduleEditor(null);setSavedScheduleFocus(s);setRevision(n=>n+1);commitNavigation({view:'schedules',scheduleId:s.id,section:'overview',returnTo:'contracts'});}}/>}
      <div hidden={!!scheduleEditor||navigation.view!=='schedules'||navigation.section==='manual'||!!selected} ref={schedulesRef} tabIndex={-1} className="admin-navigation-section" aria-label="Schedules">
        <ScheduleList active={active&&!selected&&!scheduleEditor&&navigation.view==='schedules'&&navigation.section!=='manual'} owner={owner} context={navigation.scheduleId?{id:navigation.scheduleId,section:navigation.section==='manual'? 'overview':navigation.section??'overview',scheduleRunId:navigation.scheduleRunId,sourceId:navigation.sourceId,geographyId:navigation.geographyId}:null} onContext={value=>commitNavigation({...navigation,view:'schedules',scheduleId:value?.id,section:value?.section,scheduleRunId:value?.scheduleRunId,sourceId:value?.sourceId,geographyId:value?.geographyId,runId:undefined})} onView={viewRun} onViewLeads={onViewLeads} items={schedules} paging={paging} more={scheduleOffset !== null}
          query={scheduleQuery} onFilters={filterSchedules} counties={counties} total={scheduleTotal} loading={loading||paging}
          error={scheduleReadError} onRetry={()=>{if(failedSchedulePage.current)void loadMore();else setRevision(n=>n+1);}}
          focusSchedule={savedScheduleFocus}
          onAdd={target=>setScheduleEditor({target})}
          onMore={() => void loadMore()} onEdit={(s) => { void edit(s); }}
          onAction={(s, a) => void scheduleAction(s, a)} busy={busy} />
      </div>
      {role.manage_sources&&<div hidden={!!scheduleEditor||!manualView||!!selected} ref={manualRef} tabIndex={-1} className="admin-navigation-section" aria-label="Manual runs">
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
          {editor.id&&<button type="button" className="text-button" disabled={busy} onClick={()=>void workflowRequest<Schedule>(`/v1/schedules/${editor.id}`).then(setReloadedSchedule).catch(e=>setError(e.message))}>Reload saved schedule</button>}
          {reloadedSchedule&&editor.id===reloadedSchedule.id&&<div><strong>Saved version {reloadedSchedule.version} · {reloadedSchedule.name}</strong><span> Your draft is unchanged.</span>
            <button type="button" className="text-button" onClick={()=>{setEditor({...editor,id:undefined,version:undefined});setReloadedSchedule(null);setPreview(null);scopeRevision.current++;}}>Keep draft as new schedule</button>
          </div>}
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
          onPreview={(mode) => mode==='schedule'?setScheduleEditor({target:draft.config.target_kind}):void review(mode)}
          onSubmit={() => void submit()}
          onCancel={cancel}
          error={preview ? error : ''}
          monthlyCap={status?.ai_policy?.monthly_usd}
        />
      </div>
      <div ref={samRef} tabIndex={-1}>
      <SamSection
        active={active&&manualView&&!selected&&!scheduleEditor}
        owner={owner}
        editing={samEditor}
        newScheduleToken={0}
        onSchedule={()=>setScheduleEditor({target:'sam'})}
        onSaved={s=>{setSavedScheduleFocus(s);commitNavigation({view:'schedules',returnTo:'contracts',scheduleId:s.id,section:'overview'});}}
        onKeepDraft={()=>setSamEditor(null)}
        onEdited={() => setSamEditor(null)}
        onRun={setSelected}
        onChanged={() => setRevision((x) => x + 1)}
        onViewLeads={onViewLeads}
      />
      </div>
      <div ref={stateSourcesRef} tabIndex={-1}>
      <StateSourceList
        items={sources}
        counties={counties}
        onAction={(s, a) => void sourceAction(s, a)}
        onView={setSelected}
      />
      </div>
      </div>
      }
      {navigation.view==='stats'&&<div hidden={!!selected||!!scheduleEditor} ref={statsRef} tabIndex={-1} className="admin-navigation-section"><Analytics owner={owner} counties={counties}/></div>}
      {navigation.view==='attention'&&<div hidden={!!selected}><SourceStatus attention owner={owner} active={active&&!selected&&!scheduleEditor} onTechnicalDetails={(runId,requestId)=>{if(runId){returnFocus.current=document.activeElement as HTMLElement;commitNavigation({...navigation,runId,runSection:'logs',issueRequestId:requestId});}}}/></div>}
      {(navigation.view==='sources'||navigation.view==='geography')&&(role.technical_details?<div hidden={!!selected||!!scheduleEditor} className="admin-navigation-section"><Catalog active={active&&!selected&&!scheduleEditor} key={navigation.view} mode={navigation.view} owner={owner} counties={counties} sourceId={navigation.sourceId} geographyId={navigation.geographyId} onSource={id=>commitNavigation({view:'sources',sourceId:id,returnTo:'contracts'})} onGeography={id=>commitNavigation({view:'geography',geographyId:id,returnTo:'contracts'})} onState={()=>{navigate('schedules',true);requestAnimationFrame(()=>stateSourcesRef.current?.scrollIntoView?.({block:'start'}));}}/></div>:<section><h2>Admin review required</h2><p>Technical source and geography details are managed by an Admin.</p><button className="text-button" onClick={()=>navigate('schedules')}>Back to schedules</button></section>)}
      <div hidden={!!scheduleEditor||navigation.view!=='history'&&!selected} ref={historyRef} tabIndex={-1} className="admin-navigation-section" aria-label="History and logs">
      <div hidden={!!selected}>{navigation.view==='history'&&<RunHistory entryId={navigation.historySearchId} active={active&&!selected&&!scheduleEditor} owner={owner} counties={counties} refreshSignal={revision} onView={viewRun} onSchedule={id=>commitNavigation({view:'schedules',scheduleId:id,section:'history',returnTo:'contracts'})}/>}</div>
      {selected && (
        <div ref={detailRef}>
          <RunDetail
            active={active&&!scheduleEditor}
            key={selected}
            id={selected}
            origin={navigation}
            onNavigate={context=>{restoreFocus.current=true;commitNavigation(context);}}
            issueRequestId={navigation.issueRequestId}
            owner={owner}
            section={navigation.runSection}
            onSection={section=>{const context={...navigation,runSection:section};replaceAdminLocation(owner,context);setNavigation(context);}}
            onClose={() => {restoreFocus.current=true;if(window.history.state?.adminOwner===owner&&window.history.state?.adminReturn&&window.history.state.adminReturn.runId!==selected)window.history.back();else setSelected(null);}}
            onViewLeads={onViewLeads}
            onSource={setSelected}
            changed={() => { /* Refresh the originating view explicitly after returning; active-run polling owns this workspace. */ }}
          />
        </div>
      )}
      </div>
    </section></MetricNavigation></SettingsNavigation.Provider>
  );
}

export default function AdminScreen(props:Parameters<typeof SchedulingWorkspace>[0]){
 return <SchedulingAccess key={props.owner} owner={props.owner} active={props.active}><SchedulingWorkspace {...props}/></SchedulingAccess>;
}
