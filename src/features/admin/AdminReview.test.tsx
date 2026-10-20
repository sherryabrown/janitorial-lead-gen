// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SourceReview } from './SourceReview';
import { RequestReview } from './RequestReview';
import { RunDetail } from './RunDetail';
import type { Packet, Task } from './types';
const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../lib/procurement-workflow', () => ({
  workflowRequest: mocked.request,
  mutationKey: () => 'stable-key',
  acknowledged: () => {},
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocked.request.mockReset();
});
const task: Task = {
  id: 'task',
  source_id: 'seed',
  category: 'opportunity',
  state: 'method_missing',
  reason: 'Needs verification',
  pages: 1,
};
const packet: Packet = {
  version: 2,
  packet_hash: 'a'.repeat(64),
  task_id: 'task',
  request_id: 'request',
  category: 'opportunity',
  complete: false,
  seed_source_id: 'seed',
  route_geography_id: '05119',
  source: {
    id: 'seed',
    code: 'official',
    name: 'Official agency',
    url: 'https://agency.gov/bids',
    contracting_entity_geo_level: 'county',
    business_category: 'other_public',
  },
  pages: [
    {
      run_id: 'run',
      url: 'https://agency.gov/bids',
      review: 'Official janitorial bid opportunities in Pulaski County.',
    },
  ],
};
it('keeps missing evidence as a gap; only persisted readback can show a verified method', () => {
  const { rerender } = render(
    <SourceReview
      packet={{ ...packet, pages: [] }}
      task={task}
      busy={false}
      onSave={() => {}}
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Save reviewed source method' }),
  ).toBeNull();
  expect(screen.getByText(/Saved official evidence is required/)).toBeTruthy();
  rerender(
    <SourceReview
      packet={{ ...packet, registration_verified: true }}
      task={task}
      busy={false}
      onSave={() => {}}
    />,
  );
  expect(screen.getByText('Source method saved and verified')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
it.each([false, true])(
  'uses the guarded review contract for existing/new source choice (new=%s)',
  (newSource) => {
    const save = vi.fn();
    render(
      <SourceReview
        packet={packet}
        task={{ ...task, source_id: newSource ? null : 'seed' }}
        busy={false}
        onSave={save}
      />,
    );
    if (newSource) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: /different source/ }),
      );
      fireEvent.change(screen.getByLabelText('Source name'), {
        target: { value: 'Discovered official source' },
      });
      fireEvent.change(screen.getByLabelText('Source code'), {
        target: { value: 'discovered-official' },
      });
    }
    fireEvent.change(
      screen.getByLabelText('Exact category/identity quotation'),
      { target: { value: 'Official janitorial bid opportunities' } },
    );
    fireEvent.change(screen.getByLabelText('How to check this source'), {
      target: { value: 'Read the official listing and documents' },
    });
    fireEvent.change(
      screen.getByLabelText('How to confirm the listing is complete'),
      { target: { value: 'Confirm the saved listing has no next page' } },
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the official identity/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed source method' }),
    );
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({
      task_id: 'task',
      packet_hash: packet.packet_hash,
      sourceSpec: {
        code: newSource ? 'discovered-official' : 'official',
        existing_id: newSource ? undefined : 'seed',
      },
      capability: {
        kind: 'opportunity',
        route_geography_id: '05119',
        method_spec: {
          runner_id: 'public-fetch',
          urls: ['https://agency.gov/bids'],
        },
      },
    });
    expect(save.mock.calls[0][0].handoffs).toHaveLength(2);
    expect(screen.queryByText('Source method saved and verified')).toBeNull();
  },
);
it('sends an explicit append against the current review rather than replacing prior outcomes', async () => {
  mocked.request.mockImplementation(async (path) =>
    path === '/v1/requests/request'
      ? {
          tasks: [task],
          jobs: [],
          candidates: [],
          total_candidates: 0,
          next_offset: null,
        }
      : path.endsWith('/packet')
        ? {
            ...packet,
            current_interpretation: {
              id: 'current',
              packet_hash: packet.packet_hash,
              counts: { findings: 1, exclusions: 0, unresolved: 0 },
            },
          }
        : {},
  );
  render(
    <RequestReview id="request" owner="reviewer" onViewLeads={() => {}} />,
  );
  await screen.findByRole('button', { name: 'Review captured evidence' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review captured evidence' }),
  );
  await screen.findByLabelText('Exact quotation');
  fireEvent.change(screen.getByLabelText('Exact quotation'), {
    target: { value: 'Official janitorial bid opportunities' },
  });
  fireEvent.change(
    screen.getByLabelText('Evidence location (page/row/section)'),
    { target: { value: 'Listing row 1' } },
  );
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Needs a qualifying date' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save evidence-backed decision' }),
  );
  await act(async () => {});
  const call = mocked.request.mock.calls.find((c) =>
    c[0].endsWith('/interpret'),
  );
  expect(call?.[1].body).toMatchObject({
    supersedes_id: 'current',
    append_to_current: true,
    packet_hash: packet.packet_hash,
    coverage: 'partial',
    findings: [],
    exclusions: [],
    unresolved: [{ reason: 'Needs a qualifying date' }],
  });
  expect(
    mocked.request.mock.calls.some((c) => c[0].includes('/imports/')),
  ).toBe(false);
});
it('shows current Bonfire project actions without treating browser navigation as verified collection', async () => {
  const evidence={url:'https://town.bonfirehub.com/docs/scope.pdf',capture_receipt:'artifacts/'+'c'.repeat(64),content_sha256:'d'.repeat(64),content_type:'application/pdf',retrieved_at:'2026-10-19T14:00:00Z',local_path:'artifacts/'+'d'.repeat(64)};
  mocked.request.mockImplementation(async path => path.endsWith('/supporting-evidence') ? {review:'PDF page 1: Janitorial work in Little Rock.'} : path.endsWith('/packet') ? {
    ...packet,portal_url:'https://town.bonfirehub.com/portal/?tab=openOpportunities',
    project_links:[{id:'249097',title:'Park Management',closes:'2026-11-13 10:30:00',url:'https://town.bonfirehub.com/opportunities/249097',run_id:packet.pages[0].run_id,content_sha256:'a'.repeat(64)}],
    detail_collection:{complete:true,reason:'One document still needs official access',projects:[{id:'249097',state:'captured',evidence:[evidence]}]},
  } : {tasks:[task],jobs:[],candidates:[],total_candidates:0,next_offset:null});
  render(<RequestReview id="request" owner="reviewer" onViewLeads={()=>{}} />);
  fireEvent.click(await screen.findByRole('button',{name:'Review captured evidence'}));
  await screen.findByText('Current projects from this saved listing');
  fireEvent.click(screen.getByText('Current projects from this saved listing'));
  expect(screen.getByRole('link',{name:'Park Management'}).getAttribute('href')).toBe('https://town.bonfirehub.com/opportunities/249097');
  expect(screen.getByRole('link',{name:'Open agency Portal'}).getAttribute('target')).toBe('_blank');
  expect(screen.getByText(/Opening the Portal does not verify the server session/)).toBeTruthy();
  expect(mocked.request.mock.calls.some(c=>/session|capture|imports/.test(c[0]))).toBe(false);
  expect(screen.getByText(/Details saved/)).toBeTruthy();
  expect(screen.getByText('One document still needs official access')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Saved project or document evidence'),{target:{value:'0'}});
  await screen.findByText('PDF page 1: Janitorial work in Little Rock.');
  expect(mocked.request.mock.calls.find(c=>c[0].endsWith('/supporting-evidence'))?.[1]).toEqual({body:evidence});
  expect(mocked.request.mock.calls.some(c=>/supporting-captures|imports|\/access\//.test(c[0]))).toBe(false);
});
it('checks saved access without signing in automatically and disables expired hosted actions',async()=>{
  mocked.request.mockImplementation(async path=>path.startsWith('/v1/access/')?{
    tenant:'littlerock.bonfirehub.com',next:{action:'Revalidate the reviewed portal recipe'},hosted:{recipe_current:false,session_current:false},
  }:{tasks:[],jobs:[{id:'saved-job',state:'blocked',next_action:'Official project verification required',access_handoff_id:'saved-access',capture_state:'not_saved'}],candidates:[],total_candidates:0,next_offset:null});
  render(<RequestReview id="request" owner="reviewer" onViewLeads={()=>{}} />);
  expect(mocked.request.mock.calls.some(c=>c[0].startsWith('/v1/access/'))).toBe(false);
  fireEvent.click(await screen.findByRole('button',{name:'Check saved portal access'}));
  const resume=await screen.findByRole('button',{name:'Resume saved sign-in'});
  expect((resume as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Capture saved method'}) as HTMLButtonElement).disabled).toBe(true);
  expect(mocked.request.mock.calls.some(c=>/continue|capture\//.test(c[0]))).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Reconcile saved capture'}));
  await act(async()=>{});
  expect(mocked.request.mock.calls.some(c=>c[0]==='/v1/access/saved-access/capture/saved-job/reconcile')).toBe(true);
});
it('paginates steps and stops polling on terminal state or unmount', async () => {
  vi.useFakeTimers();
  let statuses = 0;
  const usage = {
    ai: 'not_used',
    input_tokens: 0,
    output_tokens: 0,
    actual_usd: 0,
    held_usd: 0,
  };
  const step = {
    id: 'one',
    sequence: 1,
    phase: 'compare',
    state: 'completed',
    started_at: '2026-10-18T12:00:00Z',
    finished_at: '2026-10-18T12:00:01Z',
    reason: null,
    usage,
  };
  mocked.request.mockImplementation(async (p) =>
    p === '/v1/triggers/run'
      ? {
          id: 'run',
          state: ++statuses === 1 ? 'running' : 'completed',
          children: [],
          usage,
        }
      : p.includes('cursor=')
        ? { items: [{ ...step, id: 'two', sequence: 2 }], next_cursor: null }
        : { items: [step], next_cursor: '1' },
  );
  render(
    <RunDetail
      id="run"
      owner="owner"
      onClose={() => {}}
      onViewLeads={() => {}}
      onSource={() => {}}
      changed={() => {}}
    />,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
  fireEvent.click(screen.getByRole('button', { name: 'More steps' }));
  await act(async () => {});
  expect(screen.getByText('Steps · 2')).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(2500));
  expect(statuses).toBe(2);
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(statuses).toBe(2);
  cleanup();
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(statuses).toBe(2);
});
