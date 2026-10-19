import type { Schedule, StateSource, Run, County } from './types';
import { formatLocal, title, usageText } from './model';
export function ScheduleList({
  items,
  more,
  onMore,
  onEdit,
  onAction,
  busy,
}: {
  items: Schedule[];
  more: boolean;
  onMore: () => void;
  onEdit: (s: Schedule) => void;
  onAction: (s: Schedule, a: string) => void;
  busy: boolean;
}) {
  return (
    <section className="admin-section" aria-label="Saved schedules">
      <h2>Schedules</h2>
      {!items.filter((s) => !s.archived_at && !s.archived).length && (
        <p className="admin-hint">
          Save a schedule from your selected scope. New schedules start paused.
        </p>
      )}
      <div className="admin-rows">
        {items
          .filter((s) => !s.archived_at && !s.archived)
          .map((s) => (
            <div className="admin-row" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p>
                  {s.config.target_kind === 'state_source'
                    ? 'State source'
                    : `${s.config.county_ids.length} counties`}{' '}
                  · {title(s.recurrence.frequency)} ·{' '}
                  {s.enabled ? 'Enabled' : 'Paused'}
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
                  disabled={busy}
                  onClick={() => onEdit(s)}
                >
                  Edit {s.name}
                </button>
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={busy}
                  onClick={() => onAction(s, 'run-now')}
                >
                  Run now
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || (!!s.blocker && !s.enabled)}
                  onClick={() => onAction(s, s.enabled ? 'pause' : 'resume')}
                >
                  {s.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => onAction(s, 'archive')}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
      </div>
      {more && (
        <button type="button" className="text-button" onClick={onMore}>
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
        State sources are researched for new counties, then updated separately.
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
  onMore,
}: {
  items: Run[];
  onView: (id: string) => void;
  selected: string | null;
  more: boolean;
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
              {title(r.state)} ·{' '}
              {r.schedule_name ??
                (r.origin === 'scheduled' ? 'Scheduled' : 'Manual')}
            </strong>
            <p>
              {formatLocal(r.created_at)} ·{' '}
              {r.county_count == null
                ? 'Scope in details'
                : `${r.county_count} counties`}
            </p>
            <small>
              {r.candidate_count ?? 'Unknown'} candidates |{' '}
              {r.evidence_count ?? 'Unknown'} saved pages | {usageText(r.usage)}
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
              : ['needs_review', 'partial', 'outcome_unknown'].includes(r.state)
                ? 'Review results'
                : 'View progress'}
          </button>
        </div>
      ))}
      {more && (
        <button type="button" className="text-button" onClick={onMore}>
          More activity
        </button>
      )}
    </section>
  );
}
