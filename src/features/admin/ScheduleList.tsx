export { ScheduleList } from './ScheduledTable';
import type { StateSource, County } from './types';
import { formatLocal } from './model';
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
