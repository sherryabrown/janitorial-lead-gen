import { useEffect, useRef, useState } from 'react';
import { workflowRequest } from '../../lib/procurement-workflow';
import { formatLocal, title } from './model';
import type { Page } from './types';

type Occurrence = {
  id: string; due_at: string; effective_at: string; state: string;
  reason?: string; trigger_id?: string; missed_from?: string; missed_through?: string;
};
type Event = { id: string; action: string; at: string; version: number; actor_id?: string };

export function ScheduleHistory({ id, onView }: { id: string; onView: (id: string) => void }) {
  const [occurrences, setOccurrences] = useState<Page<Occurrence>>({ items: [], next_offset: null });
  const [events, setEvents] = useState<Page<Event>>({ items: [], next_offset: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    const epoch = ++generation.current;
    pending.current = true;
    setBusy(true); setError('');
    void Promise.all([
      workflowRequest<Page<Occurrence>>(`/v1/schedules/${id}/occurrences`, { signal: abort.signal }),
      workflowRequest<Page<Event>>(`/v1/schedules/${id}/events`, { signal: abort.signal }),
    ]).then(([o, e]) => { if (!abort.signal.aborted) { setOccurrences(o); setEvents(e); } })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) { pending.current = false; setBusy(false); } });
    return () => { abort.abort(); generation.current = epoch + 1; };
  }, [id, retry]);
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
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
    finally { if (version === generation.current) { pending.current = false; setBusy(false); } }
  };
  return <section aria-label="Schedule history" className="admin-section">
    <p className="admin-hint">All times shown in America/Chicago.</p>
    {busy && <p role="status">Loading history…</p>}
    {error && <p role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry(n => n + 1)}>Retry history</button></p>}
    <h3>Occurrences</h3>
    {!busy && !error && !occurrences.items.length && <p>No saved occurrences.</p>}
    {occurrences.items.map(o => <div key={o.id} className="admin-row"><div>
      <strong>{title(o.state)}</strong><p>{formatLocal(o.due_at)}{o.reason ? ` · ${title(o.reason)}` : ''}</p>
      {o.missed_from && <p>Missed interval: {formatLocal(o.missed_from)} – {formatLocal(o.missed_through ?? o.effective_at)}</p>}
      {!o.trigger_id && <small>No run was created. Review the reason and edit the schedule if needed.</small>}
    </div>{o.trigger_id && <button type="button" className="text-button" onClick={() => onView(o.trigger_id!)}>View run</button>}</div>)}
    {occurrences.next_offset !== null && <button type="button" className="text-button" disabled={busy} onClick={() => void more('occurrences')}>More occurrences</button>}
    <h3>Changes</h3>
    {!busy && !error && !events.items.length && <p>No saved changes.</p>}
    {events.items.map(e => <p key={e.id}>{title(e.action)} · {formatLocal(e.at)} · Version {e.version}</p>)}
    {events.next_offset !== null && <button type="button" className="text-button" disabled={busy} onClick={() => void more('events')}>More changes</button>}
  </section>;
}
