import { useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { formatLocal, title,runLabel } from './model';
import type { Page,Run,Config,SamConfig } from './types';

type Occurrence = {
  id: string; due_at: string; effective_at: string; state: string;
  reason?: string; trigger_id?: string; missed_from?: string; missed_through?: string;
  version?:number;origin?:string;config?:Config|SamConfig;run?:Run|null;
};
type Event = { id: string; action: string; at: string; version: number; actor_id?: string };

export function ScheduleHistory({ id, onView,owner='' }: { id: string; onView: (id: string) => void;owner?:string }) {
  const [occurrences, setOccurrences] = useState<Page<Occurrence>>({ items: [], next_offset: null });
  const [events, setEvents] = useState<Page<Event>>({ items: [], next_offset: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const priorId=useRef(id),limits=useRef({occurrences:0,events:0});
  useEffect(() => {
    const abort = new AbortController();
    const epoch = ++generation.current;
    pending.current = true;
    setBusy(true); setError('');
    if(priorId.current!==id){priorId.current=id;setOccurrences({items:[],next_offset:null});setEvents({items:[],next_offset:null});limits.current={occurrences:0,events:0};}
    const load=async<T extends {id:string}>(kind:'occurrences'|'events')=>{
      if(owner)try{const n=Number(sessionStorage.getItem(`spin-admin-history-page:${owner}:${id}:${kind}`));if(Number.isInteger(n)&&n>0&&n<=5000)limits.current[kind]=n;}catch{/* Mounted history remains. */}
      const result:Page<T>={items:[],next_offset:0};do{const page=await workflowRequest<Page<T>>(`/v1/schedules/${id}/${kind}${result.next_offset?`?offset=${result.next_offset}`:''}`,{signal:abort.signal});result.items.push(...page.items.filter(item=>!result.items.some(old=>old.id===item.id)));result.next_offset=page.next_offset;}while(result.next_offset!==null&&result.next_offset<limits.current[kind]);return result;
    };
    void Promise.allSettled([
      load<Occurrence>('occurrences'),load<Event>('events'),
    ]).then(([o, e]) => { if (!abort.signal.aborted) {
      if(o.status==='fulfilled')setOccurrences(o.value);if(e.status==='fulfilled')setEvents(e.value);
      const failures=[o,e].filter(r=>r.status==='rejected');if(failures.length)setError('Some history could not load. Loaded records remain available.');
    } })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) { pending.current = false; setBusy(false); } });
    return () => { abort.abort(); generation.current = epoch + 1; };
  }, [id, retry,owner]);
  const more = async (kind: 'occurrences' | 'events') => {
    if (pending.current) return;
    const offset = kind === 'occurrences' ? occurrences.next_offset : events.next_offset;
    if (offset === null) return;
    const version = generation.current;
    pending.current = true; setBusy(true); setError('');
    try {
      if (kind === 'occurrences') {
        const page = await workflowRequest<Page<Occurrence>>(`/v1/schedules/${id}/${kind}?offset=${offset}`);
        if (version === generation.current) setOccurrences(old => ({ ...page, items: [...old.items, ...page.items.filter(i => !old.items.some(o => o.id === i.id))] }));
      } else {
        const page = await workflowRequest<Page<Event>>(`/v1/schedules/${id}/${kind}?offset=${offset}`);
        if (version === generation.current) setEvents(old => ({ ...page, items: [...old.items, ...page.items.filter(i => !old.items.some(o => o.id === i.id))] }));
      }
      if(version===generation.current){limits.current[kind]=offset+50;if(owner)try{sessionStorage.setItem(`spin-admin-history-page:${owner}:${id}:${kind}`,String(limits.current[kind]));}catch{/* Mounted pages remain. */}}
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
    finally { if (version === generation.current) { pending.current = false; setBusy(false); } }
  };
  return <section aria-label="Schedule history" className="admin-section">
    <div className="admin-section-heading"><small>America/Chicago · schedule occurrences and changes</small><button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>Refresh occurrences</button></div>
    {busy && <p role="status">Loading history…</p>}
    {error && <p role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>Retry history</button></p>}
    <h3>Occurrences</h3>
    {!busy && !error && !occurrences.items.length && <p>No saved occurrences.</p>}
    {occurrences.items.map(o => <div key={o.id} className="admin-row"><div>
      <strong>{title(o.state)}{o.run?` · ${runLabel(o.run)}`:''}</strong>
      <dl className="admin-facts"><dt>Due</dt><dd>{formatLocal(o.due_at)}</dd><dt>Effective</dt><dd>{o.effective_at?formatLocal(o.effective_at):'Unknown'}</dd><dt>Origin</dt><dd>{title(o.origin)}</dd><dt>Run created</dt><dd>{o.run?formatLocal(o.run.created_at):'No run'}</dd><dt>Run finished</dt><dd>{o.run?.finished_at?formatLocal(o.run.finished_at):'Unknown'}</dd></dl>
      {o.reason&&<small>{title(o.reason)}</small>}
      <details><summary>Occurrence snapshot · version {o.version??'Unknown'}</summary><dl className="admin-facts"><dt>Scope</dt><dd>{o.config?.target_kind==='sam'?'Arkansas statewide · SAM':o.config?.counties?.map(c=>c.name).join(', ')||o.config?.county_ids.join(', ')||'Historical scope unavailable'}</dd><dt>Categories</dt><dd>{o.config?.requested_categories?.map(title).join(', ')||'Unknown'}</dd></dl></details>
      {o.missed_from && <p>Missed interval: {formatLocal(o.missed_from)} – {formatLocal(o.missed_through ?? o.effective_at)}</p>}
      {!o.trigger_id && <small>No run was created. Review the reason and edit the schedule if needed.</small>}
    </div>{o.trigger_id && <button type="button" className="text-button" onClick={() => onView(o.trigger_id!)}>View run</button>}</div>)}
    {occurrences.next_offset !== null && <button type="button" className="text-button" disabled={busy} onClick={() => void more('occurrences')}>More occurrences</button>}
    <h3>Changes</h3>
    {!busy && !error && !events.items.length && <p>No saved changes.</p>}
    {events.items.map(e => <div className="admin-row" key={e.id}><strong>{title(e.action)}</strong><span>{formatLocal(e.at)} · Version {e.version}</span><details><summary>Actor</summary>{e.actor_id??'Actor unavailable · system or historical event'}</details></div>)}
    {events.next_offset !== null && <button type="button" className="text-button" disabled={busy} onClick={() => void more('events')}>More changes</button>}
  </section>;
}
