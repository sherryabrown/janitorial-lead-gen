import type { Draft, Preview, Category } from './types';
import { ScheduleFields } from './ScheduleFields';
import { categoryLabels, invalidDraft, formatLocal } from './model';
export function TriggerForm({
  draft,
  onChange,
  editing,
  saving,
  preview,
  pending,
  onPreview,
  onSubmit,
  onCancel,
  error,
  monthlyCap,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  editing: boolean;
  saving: boolean;
  preview: Preview | null;
  pending: boolean;
  onPreview: (mode: 'run' | 'schedule') => void;
  onSubmit: () => void;
  onCancel: () => void;
  error: string;
  monthlyCap: number | null | undefined;
}) {
  const update = (v: Partial<Draft>) => onChange({ ...draft, ...v });
  return (
    <section className="admin-form" aria-label="Trigger settings">
      <div className="admin-section-heading">
        <h2>{editing ? 'Edit schedule' : 'What should run?'}</h2>
        {editing && <span>Unsaved changes</span>}
      </div>
      <fieldset disabled={pending}>
        <legend>Work</legend>
        <label className="admin-work-option">
          <input
            type="checkbox"
            checked={draft.config.maintain_sources}
            onChange={(e) =>
              update({
                config: {
                  ...draft.config,
                  maintain_sources: e.target.checked,
                },
              })
            }
          />
          <span>
            <strong>Maintain sources</strong>
            <small>Find missing sources and verify known methods.</small>
          </span>
        </label>
        <label className="admin-work-option">
          <input
            type="checkbox"
            checked={draft.config.check_updates}
            onChange={(e) =>
              update({
                config: { ...draft.config, check_updates: e.target.checked },
              })
            }
          />
          <span>
            <strong>Check for lead updates</strong>
            <small>
              Capture verified sources and compare saved evidence.
            </small>
          </span>
        </label>
      </fieldset>
      {!draft.config.check_updates && <p className="admin-notice">Source-only run. Enable Check for lead updates to collect opportunities.</p>}
      <fieldset disabled={pending}>
        <legend>Look for</legend>
        <div className="admin-inline">
          {(Object.keys(categoryLabels) as Category[]).map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={draft.config.requested_categories.includes(k)}
                onChange={(e) =>
                  update({
                    config: {
                      ...draft.config,
                      requested_categories: e.target.checked
                        ? [...draft.config.requested_categories, k]
                        : draft.config.requested_categories.filter(
                            (x) => x !== k,
                          ),
                    },
                  })
                }
              />
              {categoryLabels[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={pending}>
        <details className="admin-dates">
          <summary>Date window · next 12 months by default</summary>
          <p className="admin-hint">
            Rolling from each run's Central Time date. Evidence updates remain
            separate from date-qualified candidates.
          </p>
          {draft.config.requested_categories.map((k) => (
            <div className="admin-window" key={k}>
              <strong>{categoryLabels[k]}</strong>
              <label>
                From day
                <input
                  aria-label={`${categoryLabels[k]} from day`}
                  type="number"
                  min={-366}
                  max={1096}
                  value={draft.window_policy[k].from_offset_days}
                  onChange={(e) =>
                    update({
                      window_policy: {
                        ...draft.window_policy,
                        [k]: {
                          ...draft.window_policy[k],
                          from_offset_days: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
              <label>
                To day
                <input
                  aria-label={`${categoryLabels[k]} to day`}
                  type="number"
                  min={-366}
                  max={1096}
                  value={draft.window_policy[k].to_offset_days}
                  onChange={(e) =>
                    update({
                      window_policy: {
                        ...draft.window_policy,
                        [k]: {
                          ...draft.window_policy[k],
                          to_offset_days: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
              <label>
                Date basis
                <select
                  value={draft.window_policy[k].date_basis}
                  onChange={(e) =>
                    update({
                      window_policy: {
                        ...draft.window_policy,
                        [k]: {
                          ...draft.window_policy[k],
                          date_basis: e.target.value,
                        },
                      },
                    })
                  }
                >
                  {(k === 'forecast'
                    ? ['expected_solicitation', 'published']
                    : k === 'opportunity'
                      ? ['deadline', 'published']
                      : ['end_renewal', 'award_date', 'published']
                  ).map((x) => (
                    <option key={x} value={x}>
                      {x.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </details>
      </fieldset>
      {saving && (
        <ScheduleFields draft={draft} onChange={update} pending={pending} />
      )}
      {preview && (
        <div className="admin-confirm" aria-label="Confirmed run scope">
          <strong>Confirm scope</strong>
          <p>
            {preview.config.counties.length} counties ·{' '}
            {preview.config.counties.reduce((n, c) => n + c.cities.length, 0)}{' '}
            city associations ·{' '}
            {draft.config.target_kind === 'state_source'
              ? 'Independent state source'
              : 'County sources included'}
          </p>
          {preview.config.counties.map((c) => (
            <details key={c.id}>
              <summary>
                {c.name} · {c.cities.length} cities
              </summary>
              <p>
                {c.cities.map((x) => x.name).join(', ') ||
                  'No incorporated cities in the current registry.'}
              </p>
            </details>
          ))}
          {saving && <p>Next run: {formatLocal(preview.next_due_at)}</p>}
          <button
            type="button"
            className="primary-button"
            disabled={pending}
            onClick={onSubmit}
          >
            {pending
              ? 'Saving…'
              : saving
                ? 'Confirm and save schedule'
                : 'Confirm and run now'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={pending}
            onClick={onCancel}
          >
            Back to editing
          </button>
        </div>
      )}
      {!preview && (
        <div className="admin-form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={pending || !!invalidDraft(draft, saving)}
            onClick={() => onPreview(saving ? 'schedule' : 'run')}
          >
            {saving ? 'Review schedule' : 'Run now'}
          </button>
          {!saving && !editing && (
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => onPreview('schedule')}
            >
              Save schedule
            </button>
          )}
          {saving && (
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={onCancel}
            >
              Cancel schedule
            </button>
          )}
        </div>
      )}
      {invalidDraft(draft, saving) && (
        <p className="admin-hint">{invalidDraft(draft, saving)}</p>
      )}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <p className="admin-hint">
        Per run: up to $1 and 4 AI calls, within the current monthly cap
        {monthlyCap == null
          ? ' (unavailable until service status loads)'
          : ` of $${monthlyCap}`}
        . Actual use is logged for each step.
      </p>
    </section>
  );
}
