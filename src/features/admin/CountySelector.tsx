import { useRef, useState } from 'react';
import map from './data/arkansas-counties.json';
import type { County } from './types';
export function CountySelector({
  counties,
  selected,
  onChange,
  disabled = false,
  registryState = 'ready',
  selectableIds,
  sourceScopeName,
}: {
  counties: County[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  registryState?: 'loading' | 'ready' | 'error';
  selectableIds?: string[];
  sourceScopeName?: string;
}) {
  const [query, setQuery] = useState(''),
    [focus, setFocus] = useState(0),
    [hover, setHover] = useState('');
  const refs = useRef<(SVGPathElement | null)[]>([]),
    registered = new Set(counties.map((c) => c.id)),
    available = new Set(
      counties
        .filter((c) => !selectableIds || selectableIds.includes(c.id))
        .map((c) => c.id),
    ),
    chosen = new Set(selected),
    valid = map.counties.filter((c) => available.has(c.id));
  const toggle = (id: string) => {
    if (disabled || registryState !== 'ready' || !available.has(id)) return;
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    onChange([...next].sort());
  };
  return (
    <section className="admin-selector" aria-label="County selection">
      <div className="admin-section-heading">
        <h2>Choose counties</h2>
        <span>{chosen.size} selected</span>
      </div>
      <p className="admin-hint">
        {sourceScopeName
          ? `State source: ${sourceScopeName}. Only its associated counties can be selected.`
          : 'County sources and all incorporated cities are included.'}
      </p>
      {registryState !== 'ready' && (
        <p className="admin-hint" role="status">
          {registryState === 'loading'
            ? 'Loading county registry...'
            : 'County registry could not load. Retry the Admin connection above.'}
        </p>
      )}
      {registryState === 'ready' &&
        selected.some((id) => registered.has(id) && !available.has(id)) && (
          <p className="admin-error" role="status">
            A selected county is outside this state source's saved scope. Return
            to county checks to use that selection.
          </p>
        )}
      <div className="admin-county-picker">
        <div className="admin-map-wrap">
          <svg
            viewBox={map.metadata.viewBox}
            className="admin-map"
            aria-label="Arkansas county map"
            onMouseLeave={() => setHover('')}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setHover('');
            }}
          >
            <title>Arkansas county map</title>
            {map.counties.map((c, i) => (
              <path
                key={c.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                d={c.path}
                fillRule="evenodd"
                role="button"
                aria-label={`${c.name} County`}
                aria-pressed={chosen.has(c.id)}
                aria-disabled={
                  disabled || registryState !== 'ready' || !available.has(c.id)
                }
                tabIndex={i === focus ? 0 : -1}
                className={`${chosen.has(c.id) ? 'selected' : ''} ${!available.has(c.id) ? 'unavailable' : ''}`}
                onClick={() => toggle(c.id)}
                onFocus={() => {
                  setFocus(i);
                  setHover(c.name);
                }}
                onMouseEnter={() => setHover(c.name)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle(c.id);
                  }
                  if (
                    [
                      'ArrowRight',
                      'ArrowDown',
                      'ArrowLeft',
                      'ArrowUp',
                      'Home',
                      'End',
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    const n =
                      e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? 74
                          : (i +
                              (['ArrowRight', 'ArrowDown'].includes(e.key)
                                ? 1
                                : 74)) %
                            75;
                    setFocus(n);
                    refs.current[n]?.focus();
                  }
                }}
              >
                <title>
                  {c.name} County
                  {registryState !== 'ready'
                    ? ' - awaiting county registry'
                    : !registered.has(c.id)
                      ? ' - unavailable'
                      : !available.has(c.id)
                        ? ' - outside this source scope'
                        : ''}
                </title>
              </path>
            ))}
          </svg>
          <p className="admin-map-caption" aria-live="polite">
            {hover
              ? `${hover} County`
              : 'Select a county on the map or in the list.'}
          </p>
          <p className="admin-hint">
            Map: arrow keys to move; Enter or Space to select.
          </p>
        </div>
        <div className="admin-county-list">
          <label className="input-field">
            <span>Find a county</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search counties"
            />
          </label>
          <div className="admin-inline">
            <button
              type="button"
              className="text-button"
              disabled={disabled || registryState !== 'ready'}
              onClick={() => onChange(valid.map((c) => c.id).sort())}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled || !selected.length}
              onClick={() => onChange([])}
            >
              Clear counties
            </button>
          </div>
          <div className="admin-checkbox-list" aria-label="County checklist">
            {map.counties
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={chosen.has(c.id)}
                    disabled={
                      disabled ||
                      registryState !== 'ready' ||
                      !available.has(c.id)
                    }
                    onChange={() => toggle(c.id)}
                  />
                  <span>{c.name} County</span>
                  {registryState === 'ready' && !registered.has(c.id) && (
                    <small>Unavailable</small>
                  )}
                  {registryState === 'ready' &&
                    registered.has(c.id) &&
                    !available.has(c.id) && <small>Not associated</small>}
                </label>
              ))}
          </div>
        </div>
      </div>
      <div className="admin-selected" aria-label="Selected counties">
        {selected.map((id) => (
          <button
            className="admin-chip"
            type="button"
            key={id}
            disabled={disabled}
            onClick={() => onChange(selected.filter((x) => x !== id))}
            aria-label={`Remove ${map.counties.find((c) => c.id === id)?.name ?? id} County`}
          >
            {map.counties.find((c) => c.id === id)?.name ?? id}{' '}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      {registryState === 'ready' &&
        ((counties.length > 0 &&
          map.counties.some((c) => !registered.has(c.id))) ||
          selected.some(
            (id) =>
              !registered.has(id) || !map.counties.some((c) => c.id === id),
          )) && (
          <p role="status" className="admin-error">
            Some county IDs are unavailable or differ from the registry. Remove
            unavailable selections before running.
          </p>
        )}
    </section>
  );
}
