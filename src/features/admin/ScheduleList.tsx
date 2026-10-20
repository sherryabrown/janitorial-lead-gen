import { useState, Fragment } from 'react';
import { ScheduleHistory } from './ScheduleHistory';
import type { AnySchedule, StateSource, Run, County } from './types';
import { formatLocal, title, usageText, runLabel, hasSourceAttention } from './model';
export function ScheduleList({
  items,
  more,
  paging,
  onMore,
  onEdit,
  onAction,
  busy,
  onView,
}: {
  items: AnySchedule[];
  more: boolean;
  paging?: boolean;
  onMore: () => void;
  onEdit: (s: AnySchedule) => void;
  onAction: (s: AnySchedule, a: string) => void;
  busy: boolean;
  onView: (id: string) => void;
}) {
  const [archived, setArchived] = useState(false);
  const [history, setHistory] = useState<string | null>(null);
  const visible = items.filter(s => archived || (!s.archived_at && !s.archived));
  return (
    <section className="admin-section" aria-label="Saved schedules">
      <h2>Schedules</h2>
      <label><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived schedules</label>
      {!visible.length && (
        <p className="admin-hint">
          {more ? 'No matching schedules on loaded pages. Load more schedules below.' : 'Save a schedule from your selected scope. New schedules start paused.'}
        </p>
      )}
      <div className="admin-rows">
        {visible.map((s) => (
            <Fragment key={s.id}><div className="admin-row" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p>
                  {s.config.target_kind === 'sam'
                    ? `SAM · ${s.config.requested_categories[0] === 'award' ? 'Contract awards' : 'Opportunities'} · Arkansas statewide`
                    : s.config.target_kind === 'state_source'
                      ? 'State source'
                      : `${s.config.county_ids.length} counties`}{' '}
                  · {title(s.recurrence.frequency)} ·{' '}
                  {s.archived_at || s.archived ? 'Archived' : s.enabled ? 'Enabled' : 'Paused'}
                </p>
                <small>
                  {formatLocal(s.next_due_at)}
                  {s.blocker ? ` · Review ${title(s.blocker)}` : ''}
                </small>
              </div>
              <div className="admin-inline">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || !!s.archived_at || !!s.archived}
                  onClick={() => onEdit(s)}
                >
                  Edit {s.name}
                </button>
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={busy || !!s.archived_at || !!s.archived}
                  onClick={() => onAction(s, 'run-now')}
                >
                  Run now
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || !!s.archived_at || !!s.archived || (!!s.blocker && !s.enabled)}
                  onClick={() => onAction(s, s.enabled ? 'pause' : 'resume')}
                >
                  {s.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || !!s.archived_at || !!s.archived}
                  onClick={() => onAction(s, 'archive')}
                >
                  Archive
                </button>
                <button type="button" className="text-button" aria-expanded={history === s.id} onClick={() => setHistory(old => old === s.id ? null : s.id)}>History for {s.name}</button>
              </div>
            </div>
            {history === s.id && <ScheduleHistory key={`${s.id}:${s.version}`} id={s.id} onView={onView} />}
            </Fragment>
          ))}
      </div>
      {more && (
        <button type="button" className="text-button" disabled={paging} onClick={onMore}>
          More schedules
        </button>
      )}
    </section>
  );
}
export function StateSourceList({
  items,
  counties,
  onAction,
  onView,
}: {
  items: StateSource[];
  counties: County[];
  onAction: (s: StateSource, a: 'run' | 'schedule') => void;
  onView: (id: string) => void;
}) {
  return (
    <section className="admin-section" aria-label="Independent state sources">
      <h2>State sources</h2>
      <p className="admin-hint">
        State sources are researched for new counties, then updated
        separately.
      </p>
      {!items.length && (
        <p>No saved state sources yet. New findings will appear here.</p>
      )}
      {items.map((s) => (
        <div className="admin-row" key={s.id}>
          <div>
            <strong>{s.name}</strong>
            <p>
              {s.county_ids
                .map((id) => counties.find((c) => c.id === id)?.name ?? id)
                .join(', ')}{' '}
              · {s.category}
            </p>
            <small>
              Last finished:{' '}
              {s.last_finished_at
                ? formatLocal(s.last_finished_at)
                : 'Not checked'}{' '}
              ·{' '}
              {s.schedule_enabled
                ? formatLocal(s.next_due_at)
                : 'Not scheduled'}
            </small>
          </div>
          <div className="admin-inline">
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => onAction(s, 'run')}
            >
              Run {s.name} now
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onAction(s, 'schedule')}
            >
              {s.schedule_id ? 'Edit schedule' : 'Set schedule'}
            </button>
            {s.latest_run && (
              <button
                type="button"
                className="text-button"
                onClick={() => onView(s.latest_run!)}
              >
                View source trigger
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
export function ActivityList({
  items,
  onView,
  selected,
  more,
  paging,
  onMore,
}: {
  items: Run[];
  onView: (id: string) => void;
  selected: string | null;
  more: boolean;
  paging?: boolean;
  onMore: () => void;
}) {
  return (
    <section className="admin-section" aria-label="Run activity">
      <h2>Activity</h2>
      {!items.length && (
        <p className="admin-hint">
          Your runs and their next actions will appear here.
        </p>
      )}
      {items.map((r) => (
        <div
          className={`admin-row ${selected === r.id ? 'is-current' : ''}`}
          key={r.id}
        >
          <div>
            <strong>
              {runLabel(r)} ·{' '}
              {r.schedule_name ??
                (r.origin === 'scheduled' ? 'Scheduled' : 'Manual')}
            </strong>
            <p>
              {formatLocal(r.created_at)} ·{' '}
              {r.target_kind === 'sam'
                ? `SAM · ${r.category === 'award' ? 'Contract awards' : 'Opportunities'} · Arkansas statewide`
                : r.county_count == null
                  ? 'Scope in details'
                  : `${r.county_count} counties`}
            </p>
            <small>
              {r.candidate_count ?? 'Unknown'} candidates |{' '}
              {r.evidence_count ?? 'Unknown'} saved pages |{' '}
              {usageText(r.usage)}
            </small>
          </div>
          <button
            type="button"
            className="secondary-button compact"
            aria-expanded={selected === r.id}
            onClick={() => onView(r.id)}
          >
            {selected === r.id
              ? 'Hide details'
              : hasSourceAttention(r)
                ? 'View results'
              : ['needs_review', 'partial', 'outcome_unknown'].includes(
                    r.state,
                  )
                ? 'Review results'
                : 'View progress'}
          </button>
        </div>
      ))}
      {more && (
        <button type="button" className="text-button" disabled={paging} onClick={onMore}>
          More activity
        </button>
      )}
    </section>
  );
}
