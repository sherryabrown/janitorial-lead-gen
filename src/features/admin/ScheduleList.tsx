export { ScheduleList } from './ScheduledTable';
import type { StateSource, Run, County } from './types';
import { formatLocal, usageText, runLabel, hasSourceAttention } from './model';
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
