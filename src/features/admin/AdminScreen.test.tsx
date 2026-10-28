// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import AdminScreen from './AdminScreen';
import { CountySelector } from './CountySelector';
import { initialDraft, resolvedConfig, usageText } from './model';
import { RequestReview } from './RequestReview';
import map from './data/arkansas-counties.json';
import type { Draft, Preview, Schedule, Usage } from './types';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../lib/procurement-workflow', async (original) => ({
  ...(await original<typeof import('../../lib/procurement-workflow')>()),
  workflowRequest: (path:string,...args:unknown[])=>path==='/v1/capabilities'?Promise.resolve({role:'admin',manage_schedules:true,manage_sources:true,technical_details:true}):mocks.request(path,...args),
}));
const counties = map.counties.map((c) => ({
  id: c.id,
  name: c.name + ' County',
}));
const scope = (draft: Draft): Preview => ({
  preview_hash: 'a'.repeat(64),
  config: {
    ...resolvedConfig(draft),
    counties: draft.config.county_ids.map((id) => ({
      ...counties.find((c) => c.id === id)!,
      cities: [
        { id: 'city-1', name: 'Little Rock' },
        { id: 'city-2', name: 'Maumelle' },
      ],
      city_ids: ['city-1', 'city-2'],
      selection_token: 'revision-1',
    })),
  },
});
const schedule: Schedule = {
  ...initialDraft(),
  id: 'saved',
  version: 3,
  name: 'Morning check',
  enabled: true,
  next_due_at: '2026-10-20T14:00:00Z',
  config: { ...initialDraft().config, county_ids: ['05119'] },
};
let calls: { path: string; body?: unknown; key?: string }[];
beforeEach(() => {
  window.scrollTo = vi.fn();
  sessionStorage.clear();
  window.history.replaceState({},'','/');
  calls = [];
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async (path: string, options: { body?: unknown; key?: string } = {}) => {
      calls.push({ path, ...options });
      if(path.startsWith('/v1/admin/history'))return {items:[],next_offset:null,total:0};
      if (path === '/v1/counties') return { counties };
      if (path === '/v1/state-triggers') return { items: [] };
      if (
        path === '/v1/schedules?lifecycle=current' ||
        (path === '/v1/triggers' && !options.body)
      )
        return { items: [], next_offset: null };
      if (path === '/v1/scheduler/status')
        return {
          enabled: true,
          extensions_ready: true,
          backend_key_configured: true,
          ai_policy: { enabled: true, monthly_usd: 10 },
        };
      if (path === '/v1/triggers/preview') {
        const d = initialDraft();
        d.config = options.body as Draft['config'];
        return scope(d);
      }
      if (path === '/v1/schedules/preview')
        return {
          ...scope(options.body as Draft),
          next_due_at: '2026-10-20T14:00:00Z',
        };
      if (path === '/v1/schedules/saved') return schedule;
      if (path.startsWith('/v1/triggers/') && path.endsWith('/steps'))
        return { items: [], next_cursor: null };
      if (path.startsWith('/v1/triggers/'))
        return {
          id: 'run-1',
          state: 'completed',
          children: [],
          config: { county_ids: [] },
        };
      return {};
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function openManual(){
  window.history.replaceState({},'','/?adminView=schedules&adminSection=manual');
  fireEvent(window,new PopStateEvent('popstate'));
}
async function start() {
  render(<AdminScreen owner="owner" onViewLeads={() => {}} />);
  openManual();
  await screen.findByText(
    'No saved state sources yet. New findings will appear here.',
  );
  await waitFor(() =>
    expect(screen.queryByText(/Loading county registry/)).toBeNull(),
  );
}
function selectPulaski() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pulaski County' }));
}
it('ships exactly the official 75 unique county IDs with geometry and provenance', () => {
  expect(map.counties.map((c) => c.id).sort()).toEqual(
    Array.from(
      { length: 75 },
      (_, i) => `05${String(i * 2 + 1).padStart(3, '0')}`,
    ),
  );
  expect(map.counties.every((c) => c.path.startsWith('M'))).toBe(true);
  expect(map.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
});
it('keeps map, checklist and chips synchronized; keyboard and all/clear only change the draft', () => {
  function Picker() {
    const [ids, setIds] = useState<string[]>([]);
    return (
      <CountySelector counties={counties} selected={ids} onChange={setIds} />
    );
  }
  render(<Picker />);
  const polygon = screen.getByRole('button', { name: 'Pulaski County' });
  fireEvent.keyDown(polygon, { key: 'Enter' });
  expect(
    screen.getByRole('checkbox', { name: 'Pulaski County' }),
  ).toHaveProperty('checked', true);
  expect(polygon.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Pulaski County' }),
  );
  expect(polygon.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  expect(screen.getByText('75 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear counties' }));
  expect(screen.getByText('0 selected')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Arkansas County' }), {
    key: 'ArrowRight',
  });
  expect(document.activeElement?.getAttribute('aria-label')).toBe(
    'Ashley County',
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
it('makes unmatched IDs unavailable without guessing; selected obsolete IDs are removable', () => {
  render(
    <CountySelector
      counties={[{ id: '05999', name: 'Wrong' }]}
      selected={['05999']}
      onChange={() => {}}
    />,
  );
  expect(screen.getByRole('checkbox', { name: /Pulaski/ })).toHaveProperty(
    'disabled',
    true,
  );
  expect(
    screen.getByRole('button', { name: 'Remove 05999 County' }),
  ).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('unavailable');
});
it('requires scope, shows city names and confirms before any manual submission', async () => {
  await start();
  expect(screen.getByRole('button', { name: 'Run now' })).toHaveProperty(
    'disabled',
    true,
  );
  selectPulaski();
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
  await screen.findByText('Pulaski County · 2 cities');
  fireEvent.click(screen.getByText('Pulaski County · 2 cities'));
  expect(screen.getByText('Little Rock, Maumelle')).toBeTruthy();
  expect(calls.some((c) => c.path === '/v1/triggers' && c.body)).toBe(false);
  expect(
    (
      calls.find((c) => c.path === '/v1/triggers/preview')!
        .body as Draft['config']
    ).search_windows?.opportunity.date_basis,
  ).toBe('deadline');
});
it.each([
  [true, false],
  [false, true],
  [true, true],
])(
  'sends independent work flags maintain=%s updates=%s',
  async (maintain, updates) => {
    await start();
    selectPulaski();
    if (!maintain)
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Maintain sources/ }),
      );
    if (!updates)
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Check for lead updates/ }),
      );
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await screen.findByRole('button', { name: 'Confirm and run now' });
    expect(
      calls.find((c) => c.path === '/v1/triggers/preview')!.body,
    ).toMatchObject({ maintain_sources: maintain, check_updates: updates });
    expect(screen.queryByLabelText(/new or known/i)).toBeNull();
  },
);
it('retains the same mutation key after uncertain submit and preserves selection after acknowledgment', async () => {
  await start();
  selectPulaski();
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
  await screen.findByRole('button', { name: 'Confirm and run now' });
  const old = mocks.request.getMockImplementation()!;
  let submits = 0;
  mocks.request.mockImplementation(async (p, o) => {
    if (p === '/v1/triggers' && o?.body) {
      calls.push({ path: p, ...o });
      if (++submits === 1) throw Error('Connection interrupted');
      return { trigger_id: 'run-1' };
    }
    return old(p, o);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and run now' }));
  await screen.findByText('Connection interrupted');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and run now' }));
  await screen.findByText(/Run queued. Selection kept/);
  const sent = calls.filter((c) => c.path === '/v1/triggers' && c.body);
  expect(sent[0].key).toBe(sent[1].key);
  openManual();
  expect(
    screen.getByRole('checkbox', { name: 'Pulaski County' }),
  ).toHaveProperty('checked', true);
});
it('preserves the manual draft on expired sessions and ignores a stale preview', async () => {
  await start();
  selectPulaski();
  let resolve!: (p: Preview) => void;
  const old = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((p, o) =>
    p === '/v1/triggers/preview'
      ? new Promise((r) => {
          resolve = r;
        })
      : old(p, o),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
  await waitFor(() => expect(resolve).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Back to contracts' })).toBeNull();
  cleanup();
  resolve(
    scope({
      ...initialDraft(),
      config: { ...initialDraft().config, county_ids: ['05119'] },
    }),
  );
  mocks.request.mockImplementation(async (p, o) => {
    if (p === '/v1/triggers/preview')
      throw Error('Your session expired. Your draft is kept.');
    return old(p, o);
  });
  await start();
  expect(
    screen.getByRole('checkbox', { name: 'Pulaski County' }),
  ).toHaveProperty('checked', true);
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
  await screen.findByText(/Your session expired. Your draft is kept/);
  expect(
    screen.queryByRole('button', { name: 'Confirm and run now' }),
  ).toBeNull();
});
it('isolates schedule editing from manual selection and sends the saved version', async () => {
  const old = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((p, o) =>
    p === '/v1/schedules?lifecycle=current' && !o?.body
      ? Promise.resolve({ items: [schedule], next_offset: null })
      : old(p, o),
  );
  await start();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ashley County' }));
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Morning check' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  await screen.findByRole('heading',{name:'Edit schedule'});
  expect(screen.queryByRole('checkbox',{name:'Pulaski County'})).toBeNull();
  expect(screen.getByLabelText('About saved counties')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  openManual();
  expect(screen.getByRole('checkbox',{name:'Ashley County'})).toHaveProperty('checked',true);
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Morning check' }));
  fireEvent.click(screen.getByRole('menuitem',{name:'Disable'}));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Pause' }));
  await waitFor(() =>
    expect(
      calls.find((c) => c.path === '/v1/schedules/saved/pause')?.body,
    ).toEqual({ expected_version: 3 }),
  );
});
it('supports multiple daily times, weekly and monthly controls while new schedules start enabled', async () => {
  await start();
  selectPulaski();
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  expect(screen.getByRole('checkbox', { name: 'Enabled' })).toHaveProperty(
    'checked',
    true,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Schedule name' }), {
    target: { value: 'Morning checks' },
  });
  fireEvent.click(screen.getByRole('button', { name: '+ Another time' }));
  expect(
    screen.getByRole('button', { name: 'Save schedule' }),
  ).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Run at 2'), {
    target: { value: '14:00' },
  });
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save schedule'})).toHaveProperty('disabled',false));
  fireEvent.click(screen.getByRole('button', { name: 'Remove time 2' }));
  fireEvent.change(screen.getByLabelText('Frequency'), {
    target: { value: 'weekly' },
  });
  expect(screen.getByRole('checkbox', { name: 'Mon' })).toHaveProperty(
    'checked',
    true,
  );
  fireEvent.change(screen.getByLabelText('Frequency'), {
    target: { value: 'monthly' },
  });
  expect(
    screen.getByText('Dates 29–31 use the last day in shorter months.'),
  ).toBeTruthy();
});
it('shows independent state sources without enabling a recurrence and scopes their run separately', async () => {
  const old = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((p, o) =>
    p === '/v1/state-triggers'
      ? Promise.resolve({
          items: [
            {
              id: 'state-1',
              source_id: 'source',
              name: 'State procurement',
              category: 'opportunity',
              county_ids: ['05119'],
              schedule_id: null,
            },
          ],
        })
      : old(p, o),
  );
  render(<AdminScreen owner="owner" onViewLeads={() => {}} />);
  openManual();
  await screen.findByText('State procurement');
  expect(screen.getByText(/Not checked.*Not scheduled/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Run State procurement now' }),
  );
  await screen.findByText('Independent state-source draft');
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
  await screen.findByRole('button', { name: 'Confirm and run now' });
  expect(
    calls.find((c) => c.path === '/v1/triggers/preview')?.body,
  ).toMatchObject({
    target_kind: 'state_source',
    state_trigger_id: 'state-1',
    county_ids: ['05119'],
  });
});
it('distinguishes actual AI use, unknown costs and held reservations', () => {
  const u: Usage = {
    ai: 'used',
    input_tokens: 50,
    output_tokens: 20,
    actual_usd: 0.004,
    known_actual_usd: 0.004,
    held_usd: 0,
  };
  expect(usageText(u)).toContain('AI Yes · 50 in / 20 out · $0.004');
  expect(
    usageText({
      ...u,
      ai: 'unknown',
      actual_usd: null,
      input_tokens: null,
      held_usd: 1,
    }),
  ).toContain('cost unknown · $1 reserved');
  expect(
    usageText({
      ...u,
      ai: 'not_used',
      actual_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
    }),
  ).toContain('AI No');
  expect(usageText(u)).not.toContain('credits');
});
it('uses the confirmed next 12 month window independently of browser timezone', () => {
  const d = initialDraft();
  const w = resolvedConfig(d, new Date('2026-10-19T02:00:00Z')).search_windows!
    .opportunity;
  expect(w.from).toBe('2026-10-18');
  expect(w.to).toBe('2027-10-18');
});
it('never approves a stale tested import hash and exposes reconciliation only from saved state', async () => {
  let hash = 'tested-a';
  mocks.request.mockImplementation(async (p) => {
    if (p === '/v1/requests/request')
      return {
        request_id: 'request',
        tasks: [],
        jobs: [{ id: 'import', stage: 'import_awaiting_approval' }],
        candidates: [],
        total_candidates: 0,
        next_offset: null,
      };
    if (p === '/v1/imports/import')
      return {
        job_id: 'import',
        state: 'blocked',
        stage: 'import_awaiting_approval',
        approval_sha256: hash,
        summary: { process: 1 },
      };
    return {};
  });
  render(<RequestReview id="request" owner="owner" onViewLeads={() => {}} />);
  await screen.findByRole('button', { name: 'Approve this tested import' });
  hash = 'tested-b';
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve this tested import' }),
  );
  await screen.findByText(/tested package changed/);
  expect(mocks.request.mock.calls.some((c) => c[0].endsWith('/approve'))).toBe(
    false,
  );
  mocks.request.mockImplementation(async (p) =>
    p === '/v1/requests/request'
      ? {
          tasks: [],
          jobs: [{ id: 'import', stage: 'import_reconcile' }],
          candidates: [],
          total_candidates: 0,
          next_offset: null,
        }
      : {
          job_id: 'import',
          state: 'blocked',
          stage: 'import_reconcile',
          approval_sha256: null,
          summary: null,
        },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }));
  await screen.findByRole('button', { name: 'Reconcile saved import' });
  expect(
    within(screen.getByLabelText('Saved results')).queryByRole('button', {
      name: 'Approve this tested import',
    }),
  ).toBeNull();
});
it.each([
  [true, false],
  [false, true],
  [true, true],
])(
  'keeps schedule work flags independent (maintain=%s updates=%s)',
  async (maintain, updates) => {
    await start();
    selectPulaski();
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    fireEvent.click(screen.getByText('Work · Check for lead updates'));
    if(maintain)fireEvent.click(screen.getByRole('checkbox',{name:/Maintain sources/}));
    if(!updates)fireEvent.click(screen.getByRole('checkbox',{name:/Check for lead updates/}));
    fireEvent.change(screen.getByLabelText('Schedule name'), {
      target: { value: 'County check' },
    });
    await waitFor(()=>expect(calls.some(c=>c.path==='/v1/schedules/preview')).toBe(true));
    expect(
      calls.find((c) => c.path === '/v1/schedules/preview')?.body,
    ).toMatchObject({
      config: { maintain_sources: maintain, check_updates: updates },
    });
  },
);
it('restores an unsaved schedule editor after leaving Admin without overwriting its manual draft', async () => {
  await start();
  selectPulaski();
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  fireEvent.change(screen.getByLabelText('Schedule name'), {
    target: { value: 'Unsaved county checks' },
  });
  cleanup();
  await start();
  fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));
  expect(screen.getByLabelText('Schedule name')).toHaveProperty(
    'value',
    'Unsaved county checks',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  openManual();
  expect(
    screen.getByRole('checkbox', { name: 'Pulaski County' }),
  ).toHaveProperty('checked', true);
});
it('keeps a successful county registry usable when another Admin list fails', async () => {
  const old = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((p, o) =>
    p === '/v1/schedules?lifecycle=current'
      ? Promise.reject(Error('Schedules could not load'))
      : old(p, o),
  );
  await start();
  expect(
    screen.getByRole('checkbox', { name: 'Pulaski County' }),
  ).toHaveProperty('disabled', false);
  expect(screen.queryAllByText('Unavailable')).toHaveLength(0);
  expect(screen.getByText(/Schedules could not load/)).toBeTruthy();
  selectPulaski();
  expect(screen.getByRole('button', { name: 'Run now' })).toHaveProperty(
    'disabled',
    false,
  );
});
it('reports a failed registry connection once instead of marking every county unavailable', async () => {
  const old = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((p, o) =>
    p === '/v1/counties'
      ? Promise.reject(Error('Connection interrupted'))
      : old(p, o),
  );
  await start();
  expect(
    screen.getByText(
      'County registry could not load. Retry the Admin connection above.',
    ),
  ).toBeTruthy();
  expect(screen.queryAllByText('Unavailable')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Select all' })).toHaveProperty(
    'disabled',
    true,
  );
});
it('separates source-scope restrictions from registry availability and restores manual counties', async () => {
  const old = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation((p, o) =>
    p === '/v1/state-triggers'
      ? Promise.resolve({
          items: [
            {
              id: 'state-1',
              source_id: 'source',
              name: 'State procurement',
              category: 'opportunity',
              county_ids: ['05045', '05125'],
              schedule_id: null,
            },
          ],
        })
      : old(p, o),
  );
  render(<AdminScreen owner="owner" onViewLeads={() => {}} />);
  openManual();
  await screen.findByText('State procurement');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Faulkner County' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Saline County' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Run State procurement now' }),
  );
  expect(
    screen.getByText(
      'State source: State procurement. Only its associated counties can be selected.',
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('checkbox', { name: /Pulaski County/ }),
  ).toHaveProperty('disabled', true);
  expect(screen.queryAllByText('Unavailable')).toHaveLength(0);
  expect(screen.queryByText(/Some county IDs are unavailable/)).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to county checks' }),
  );
  expect(
    screen.getByRole('checkbox', { name: 'Faulkner County' }),
  ).toHaveProperty('checked', true);
  expect(
    screen.getByRole('checkbox', { name: 'Saline County' }),
  ).toHaveProperty('checked', true);
  expect(
    screen.getByRole('checkbox', { name: 'Pulaski County' }),
  ).toHaveProperty('disabled', false);
  expect(screen.queryByText(/Some county IDs are unavailable/)).toBeNull();
});


it('preserves loaded schedule pages after a control refresh without refetching the county registry', async () => {
  const original = mocks.request.getMockImplementation()!;
  const firstPage = Array.from({ length: 50 }, (_, i) => ({ ...schedule, id: `s${i}`, name: `Saved ${i}` }));
  mocks.request.mockImplementation(async (p, o) => {
    if (p === '/v1/schedules?lifecycle=current') return { items: firstPage, next_offset: 50 };
    if (p === '/v1/schedules?lifecycle=current&offset=50') return { items: [{ ...schedule, id: 'last', name: 'Later page' }], next_offset: null };
    if (p.endsWith('/pause')) return {};
    return original(p, o);
  });
  await start();
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button', { name: 'More schedules' }));
  await screen.findByText('Later page');
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Saved 0' }));
  fireEvent.click(screen.getByRole('menuitem',{name:'Disable'}));
  fireEvent.click(screen.getAllByRole('menuitem', { name: /^Pause$/ })[0]);
  await waitFor(() => expect(mocks.request.mock.calls.filter(([p]) => p === '/v1/schedules?lifecycle=current&offset=50')).toHaveLength(2));
  expect(screen.getByText('Later page')).toBeTruthy();
  expect(mocks.request.mock.calls.filter(([p]) => p === '/v1/counties')).toHaveLength(1);
},15000);

it('ignores late paging results after a schedule refresh', async () => {
  const original = mocks.request.getMockImplementation()!;
  let resolvePage!: (value: unknown) => void;
  let refreshed = false;
  mocks.request.mockImplementation((p, o) => {
    if (p.endsWith('/pause')) return Promise.resolve({});
    if (p === '/v1/schedules?lifecycle=current') return Promise.resolve({ items: [schedule], next_offset: refreshed ? null : 50 });
    if (p === '/v1/schedules?lifecycle=current&offset=50') return new Promise(resolve => { resolvePage = resolve; });
    return original(p, o);
  });
  await start();
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button', { name: 'More schedules' }));
  expect(screen.getByRole('button', { name: 'More schedules' })).toHaveProperty('disabled', true);
  refreshed = true;
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Morning check' }));
  fireEvent.click(screen.getByRole('menuitem',{name:'Disable'}));
  fireEvent.click(screen.getByRole('menuitem', { name: /^Pause$/ }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'More schedules' })).toBeNull());
  resolvePage({ items: [{ ...schedule, id: 'stale', name: 'Stale schedule' }], next_offset: 100 });
  await waitFor(() => expect(screen.queryByText('Stale schedule')).toBeNull());
});

it('adds county and SAM schedules through the common editor without changing the manual draft',async()=>{
 await start();fireEvent.click(screen.getByRole('checkbox',{name:'Ashley County'}));
 fireEvent.click(screen.getByRole('button',{name:'Schedules'}));fireEvent.click(screen.getByRole('button',{name:'Add schedule'}));
 expect(screen.getByLabelText('Schedule name')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 fireEvent.click(screen.getByRole('button',{name:'Add schedule'}));window.confirm=vi.fn(()=>true);fireEvent.click(screen.getByRole('radio',{name:'SAM.gov'}));
 expect(screen.getByRole('region',{name:'Schedule editor'})).toBeTruthy();expect(screen.getByText('Arkansas statewide · NAICS 561720')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));openManual();
 expect(screen.getByRole('checkbox',{name:'Ashley County'})).toHaveProperty('checked',true);
});

it('does not let a delayed schedule edit overwrite a newer county draft',async()=>{
  const original=mocks.request.getMockImplementation()!;let finish!:(value:Schedule)=>void;
  mocks.request.mockImplementation((p,o)=>p==='/v1/schedules?lifecycle=current'?Promise.resolve({items:[schedule],next_offset:null}):p==='/v1/schedules/saved'?new Promise(resolve=>{finish=resolve;}):original(p,o));
  await start();
  fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
  fireEvent.click(screen.getByRole('button',{name:'Actions for Morning check'}));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit'}));
  openManual();
  fireEvent.click(screen.getByRole('checkbox',{name:'Ashley County'}));
  finish(schedule);
  await waitFor(()=>expect(screen.getByRole('checkbox',{name:'Ashley County'})).toHaveProperty('checked',true));
  expect(screen.queryByText('Editing a saved schedule')).toBeNull();
});

it('returns from cancelled schedule editing to the same detail tab instead of manual controls',async()=>{
 const original=mocks.request.getMockImplementation()!;
 mocks.request.mockImplementation((p,o)=>p==='/v1/schedules?lifecycle=current'?Promise.resolve({items:[schedule],next_offset:null}):original(p,o));
 await start();fireEvent.click(screen.getByRole('button',{name:'Schedules'}));
 fireEvent.click(screen.getByRole('button',{name:'Morning check'}));
 await screen.findByText('Schedule scope and setup');
 fireEvent.click(within(screen.getByRole('region',{name:'Schedule details: Morning check'})).getByRole('button',{name:'Edit'}));
 await screen.findByRole('heading',{name:'Edit schedule'});fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(screen.getByRole('tab',{name:'Results'})).toBeTruthy();expect(screen.getByText('Schedule scope and setup')).toBeTruthy();
 expect(screen.queryByRole('checkbox',{name:'Pulaski County'})).toBeNull();
});

it('focuses one run workspace and restores the hidden history row without parent polling reads',async()=>{
 const original=mocks.request.getMockImplementation()!;
 mocks.request.mockImplementation((p,o)=>p.startsWith('/v1/schedules?')?Promise.resolve({items:[],next_offset:null,total:0}):p.startsWith('/v1/admin/history')?Promise.resolve({items:[{id:'run-1',state:'completed',created_at:'2026-10-20T12:00:00Z',children:[]}],next_offset:null,total:1}):original(p,o));
 await start();fireEvent.click(screen.getByRole('button',{name:'Run history'}));expect(calls.some(c=>c.path.startsWith('/v1/admin/history'))).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Submit history'}));const row=await screen.findByRole('button',{name:'Run run-1'});row.focus();fireEvent.click(row);
 await screen.findByRole('region',{name:'Run details'});expect(screen.queryByRole('region',{name:'Run history'})).toBeNull();expect(screen.queryByRole('button',{name:'Refresh history'})).toBeNull();
 const before=calls.filter(c=>c.path==='/v1/schedules?lifecycle=current').length;fireEvent.click(await screen.findByRole('button',{name:'Refresh run'}));await screen.findByRole('button',{name:'Refresh run'});expect(calls.filter(c=>c.path==='/v1/schedules?lifecycle=current')).toHaveLength(before);
 fireEvent.click(screen.getByRole('button',{name:'Back to previous view'}));await waitFor(()=>expect(screen.getByRole('region',{name:'Run history'})).toBeTruthy());expect(document.activeElement).toBe(row);
});

it('retries a failed schedule page without replacing loaded rows',async()=>{
 const original=mocks.request.getMockImplementation()!;let fail=true;
 mocks.request.mockImplementation((p,o)=>{if(p.startsWith('/v1/schedules?')){if(p.includes('offset=50')){if(fail)return Promise.reject(Error('Page unavailable'));return Promise.resolve({items:[{...schedule,id:'second',name:'Second check'}],next_offset:null,total:2});}return Promise.resolve({items:[schedule],next_offset:50,total:2});}return original(p,o);});
 await start();fireEvent.click(screen.getByRole('button',{name:'Schedules'}));fireEvent.click(await screen.findByRole('button',{name:'More schedules'}));await screen.findByRole('button',{name:'Retry schedules'});expect(screen.getByRole('button',{name:'Morning check'})).toBeTruthy();
 const count=mocks.request.mock.calls.filter(([p])=>p==='/v1/schedules?lifecycle=current').length;fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry schedules'}));await screen.findByRole('button',{name:'Second check'});expect(screen.getByRole('button',{name:'Morning check'})).toBeTruthy();expect(mocks.request.mock.calls.filter(([p])=>p==='/v1/schedules?lifecycle=current')).toHaveLength(count);
});

it('retains keyboard focus on schedule tabs instead of refocusing the schedule heading',async()=>{
 const original=mocks.request.getMockImplementation()!;
 mocks.request.mockImplementation((p,o)=>p==='/v1/schedules?lifecycle=current'?Promise.resolve({items:[schedule],next_offset:null}):p.includes('/occurrences')||p.includes('/events')?Promise.resolve({items:[],next_offset:null}):original(p,o));
 await start();fireEvent.click(screen.getByRole('button',{name:'Schedules'}));fireEvent.click(await screen.findByRole('button',{name:'Morning check'}));await screen.findByText('Schedule scope and setup');
 const tabs=screen.getByRole('tablist',{name:'Schedule sections'}),overview=within(tabs).getByRole('tab',{name:'Results'});overview.focus();fireEvent.keyDown(tabs,{key:'ArrowRight'});fireEvent.keyDown(tabs,{key:'ArrowRight'});await screen.findByRole('heading',{name:'Schedule changes'});expect(document.activeElement).toBe(within(tabs).getByRole('tab',{name:'Schedule changes'}));fireEvent.keyDown(tabs,{key:'ArrowLeft'});fireEvent.keyDown(tabs,{key:'ArrowLeft'});expect(document.activeElement).toBe(overview);
});
it('does not reload state-source registry while filtering schedules or withhold schedules behind that registry',async()=>{
 const original=mocks.request.getMockImplementation()!;
 let resolve!:(r:unknown)=>void;
 mocks.request.mockImplementation((p,o)=>p==='/v1/state-triggers'?new Promise(r=>{resolve=r;}):p.startsWith('/v1/schedules?')?Promise.resolve({items:[schedule],next_offset:null,total:1}):original(p,o));
 render(<AdminScreen owner="owner" onViewLeads={()=>{}}/>);
 await screen.findByRole('button',{name:'Morning check'});
 const count=mocks.request.mock.calls.filter(([p])=>p==='/v1/state-triggers').length;
 fireEvent.change(screen.getByLabelText('Search schedules'),{target:{value:'Morning'}});await screen.findByRole('button',{name:'Morning check'});
 expect(mocks.request.mock.calls.filter(([p])=>p==='/v1/state-triggers')).toHaveLength(count);
 resolve({items:[]});
});
