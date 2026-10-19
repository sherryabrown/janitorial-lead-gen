import type { Recurrence } from './types';
type Fields = { name: string; enabled: boolean; recurrence: Recurrence };
export function ScheduleFields({
  draft,
  onChange,
  pending,
}: {
  draft: Fields;
  onChange: (value: Partial<Fields>) => void;
  pending: boolean;
}) {
  const update = onChange,
    r = draft.recurrence;
  return (
    <fieldset disabled={pending} className="admin-schedule-fields">
      <legend>Schedule · America/Chicago</legend>
      <label className="input-field">
        <span>Schedule name</span>
        <input
          value={draft.name}
          maxLength={80}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label className="input-field">
        <span>Frequency</span>
        <select
          value={r.frequency}
          onChange={(e) =>
            update({
              recurrence: {
                ...r,
                frequency: e.target.value as typeof r.frequency,
                local_times: [r.local_times[0] || '09:00'],
                weekdays: e.target.value === 'weekly' ? [1] : [],
                month_day: e.target.value === 'monthly' ? 1 : null,
              },
            })
          }
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {r.local_times.map((t, i) => (
        <div key={i} className="admin-inline">
          <label className="input-field">
            <span>Local time {i + 1}</span>
            <input
              aria-label={`Local time ${i + 1}`}
              type="time"
              value={t}
              onChange={(e) =>
                update({
                  recurrence: {
                    ...r,
                    local_times: r.local_times.map((x, n) =>
                      n === i ? e.target.value : x,
                    ),
                  },
                })
              }
            />
          </label>
          {r.frequency === 'daily' && r.local_times.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                update({
                  recurrence: {
                    ...r,
                    local_times: r.local_times.filter((_, n) => n !== i),
                  },
                })
              }
              aria-label={`Remove time ${i + 1}`}
            >
              Remove time
            </button>
          )}
        </div>
      ))}
      {r.frequency === 'daily' && (
        <button
          type="button"
          className="text-button"
          disabled={r.local_times.length >= 24}
          onClick={() =>
            update({
              recurrence: { ...r, local_times: [...r.local_times, ''] },
            })
          }
        >
          Add time
        </button>
      )}
      {r.frequency === 'weekly' && (
        <div className="admin-weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={r.weekdays?.includes(i) ?? false}
                onChange={(e) =>
                  update({
                    recurrence: {
                      ...r,
                      weekdays: e.target.checked
                        ? [...(r.weekdays ?? []), i]
                        : (r.weekdays ?? []).filter((x) => x !== i),
                    },
                  })
                }
              />
              {d}
            </label>
          ))}
        </div>
      )}
      {r.frequency === 'monthly' && (
        <label className="input-field">
          <span>Day of month</span>
          <input
            type="number"
            min={1}
            max={31}
            value={r.month_day ?? 1}
            onChange={(e) =>
              update({
                recurrence: { ...r, month_day: Number(e.target.value) },
              })
            }
          />
          <small>Dates 29–31 use the last day in shorter months.</small>
        </label>
      )}
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />{' '}
        Enabled
      </label>
      <p className="admin-hint">
        Changes affect future runs. Active runs keep their saved scope.
      </p>
    </fieldset>
  );
}
