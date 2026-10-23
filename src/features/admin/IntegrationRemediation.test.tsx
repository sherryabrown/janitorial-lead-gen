// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RequestReview } from './RequestReview';
import { RunDetail } from './RunDetail';
import { ScheduleList, ActivityList } from './ScheduleList';
import { initialDraft, runLabel } from './model';
const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../lib/procurement-workflow', () => ({ workflowRequest: mocked.request, mutationKey: () => 'stable-key', acknowledged: () => {} }));
afterEach(() => { cleanup(); vi.useRealTimers(); mocked.request.mockReset(); });
const candidate = { intake_id: 'candidate', intake_hash: 'hash', title: 'Cleaning', state: 'pending_review' };
const results = { tasks: [], jobs: [], candidates: [candidate], total_candidates: 1, next_offset: null };
const review = (signal: string) => <RequestReview id="request" owner="owner" onViewLeads={() => {}} refreshSignal={signal} />;

it('labels settled county source gaps consistently in Activity and details without altering other states',async()=>{
 const run={id:'run',state:'needs_review',target_kind:'county_scope',created_at:'2026-10-19T01:00:00Z',presentation:{outcome:'source_attention' as const,attention_count:1},children:[]};
 expect(runLabel({...run,state:'running'})).toBe('Running');expect(runLabel({...run,target_kind:'sam'})).toBe('Needs review');
 mocked.request.mockImplementation(async(path:string)=>path.endsWith('/steps')?{items:[],next_cursor:null}:run);
 render(<><ActivityList items={[run]} onView={()=>{}} selected={null} more={false} onMore={()=>{}}/><RunDetail id="run" owner="owner" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/></>);
 await screen.findByRole('heading',{name:/Run run/});expect(screen.getAllByText(/Finished — some sources need attention/)).toHaveLength(3);
 expect(screen.getByRole('button',{name:'View results'})).toBeTruthy();
});

it('shows source-specific blockers/actions and does not offer an ineffective retry',async()=>{
 mocked.request.mockResolvedValue({...results,automatic_county:true,candidates:[],total_candidates:0,tasks:[{id:'task',category:'opportunity',state:'method_missing',source_name:'County procurement',location_name:'Saline County',discovery_state:'blocked',attention:{kind:'automation',blocker:'This content format is not supported by the collector.',next_action:'A developer needs to add collection support.',action_kind:'evidence'}}]});
 render(review('needs_review'));await screen.findByText('Automation support needed');expect(screen.getByText('This content format is not supported by the collector.')).toBeTruthy();
 expect(screen.getByText('A developer needs to add collection support.')).toBeTruthy();expect(screen.queryByRole('button',{name:'Retry source'})).toBeNull();expect(screen.getByRole('button',{name:'View source evidence'})).toBeTruthy();
});

it('keeps independent state research workflow details visible in their existing position',async()=>{
 mocked.request.mockResolvedValue({...results,automatic_county:true,tasks:[],jobs:[{id:'state-job',state:'blocked',stage:'interpret',next_action:'Review state research evidence'}]});
 render(review('needs_review'));const message=await screen.findByText(/Review state research evidence/);expect(message.closest('details')).toBeNull();expect(screen.queryByText('Workflow details')).toBeNull();
});

it('shows verified automatic county saves without candidate approval controls', async () => {
  const viewLeads=vi.fn();
  mocked.request.mockResolvedValue({...results,automatic_county:true,automatic_import:{policy:'county-automatic-v1',state:'verified',verified:true,added:1,updated:0,unchanged:0,exclusions:[],job_ids:['job']}});
  render(<RequestReview id="request" owner="owner" onViewLeads={viewLeads} />);
  await screen.findByText('County results save automatically');
  expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByLabelText('Reason for processing reviewed candidates')).toBeNull();
  expect(screen.queryByText(/Prepare tested import/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'View leads'}));expect(viewLeads).toHaveBeenCalledOnce();
});

it('checks an uncertain county database outcome without granting approval or resending an import', async () => {
  mocked.request.mockResolvedValue({...results,jobs:[{id:'unknown-import',stage:'import_reconcile',state:'outcome_unknown'}],automatic_import:{policy:'county-automatic-v1',state:'outcome_unknown',verified:false,added:0,updated:0,unchanged:0,exclusions:[],job_ids:['unknown-import']}});
  render(review('outcome_unknown'));
  fireEvent.click(await screen.findByRole('button',{name:'Check database outcome'}));
  await waitFor(()=>expect(mocked.request).toHaveBeenCalledWith('/v1/imports/unknown-import/reconcile',{body:{}}));
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('distinguishes captured county websites from completed opportunity checks', async () => {
  mocked.request.mockResolvedValue({ ...results, automatic_county: true, tasks: [{ id: 'entry', category: 'source_entry',
    state: 'needs_interpretation', location_name: 'Saline County', source_name: 'County website' }] });
  render(review('needs_review'));
  await screen.findByText(/Website · Website captured; opportunity checks shown separately/);
  expect(screen.queryByText(/Checked—no matching opportunities/)).toBeNull();
});

it('explains source-only county results with location names and no technical source setup', async () => {
  mocked.request.mockImplementation(async (path: string) => path.endsWith('/packet') ? {
    pages: [{ run_id: 'capture', url: 'https://agency.example/bids', review: 'Saved source page' }], source: { name: 'County bids' },
  } : { ...results, automatic_county: true, check_updates: false, tasks: [{ id: 'gap', category: 'opportunity', state: 'method_missing',
    location_name: 'Saline County', source_name: 'County bids', discovery_state: 'blocked', discovery_action: 'Source could not be verified automatically.' }] });
  render(review('needs_review'));
  await screen.findByText(/Source-only run/);
  expect(screen.getByText(/Saline County · County bids/)).toBeTruthy();
  expect(screen.queryByText('Load official source options')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View source evidence' }));
  await screen.findByText('Saved source evidence');
  expect(screen.queryByText('Review source and method')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry source' }));
  await waitFor(() => expect(mocked.request).toHaveBeenCalledWith('/v1/requests/request/discover/resume', { body: { task_id: 'gap' } }));
});

it('retains written review and selection on a parent refresh, invalidating changed candidate hashes', async () => {
  let changed = false;
  mocked.request.mockImplementation(async () => ({ ...results, candidates: [{ ...candidate, intake_hash: changed ? 'new' : 'hash' }] }));
  const view = render(review('running'));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Cleaning/ }));
  fireEvent.change(screen.getByLabelText('Reason for processing reviewed candidates'), { target: { value: 'Verified work site' } });
  view.rerender(review('needs_review'));
  await waitFor(() => expect(mocked.request).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Reason for processing reviewed candidates')).toHaveProperty('value', 'Verified work site');
  expect(screen.getByRole('checkbox', { name: /Cleaning/ })).toHaveProperty('checked', true);
  changed = true;
  view.rerender(review('partial'));
  await screen.findByText(/Some selected candidates changed/);
  expect(screen.getByRole('checkbox', { name: /Cleaning/ })).toHaveProperty('checked', false);
  fireEvent.click(screen.getByRole('checkbox', { name: /Cleaning/ }));
  expect(screen.getByLabelText('Reason for processing reviewed candidates')).toHaveProperty('value', 'Verified work site');
});

it('keeps the review mounted through a real run transition and isolates another child', async () => {
  vi.useFakeTimers();
  let state = 'running';
  mocked.request.mockImplementation(async (path: string) => path.endsWith('/steps') ? { items: [], next_cursor: null } : path.startsWith('/v1/triggers/') ? {
    id: 'run', state, target_kind: 'county_scope', children: [{ request_id: 'request', county_id: '05119', role: 'county' }, { request_id: 'other', county_id: '05001', role: 'county' }],
  } : results);
  render(<RunDetail id="run" owner="owner" onClose={() => {}} onViewLeads={() => {}} onSource={() => {}} changed={() => {}} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('checkbox', { name: /Cleaning/ }));
  fireEvent.change(screen.getByLabelText('Reason for processing reviewed candidates'), { target: { value: 'Keep my review' } });
  state = 'needs_review';
  await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
  expect(screen.getByLabelText('Reason for processing reviewed candidates')).toHaveProperty('value', 'Keep my review');
  fireEvent.change(screen.getByLabelText('County/source results'), { target: { value: 'other' } });
  await act(async () => {});
  expect(screen.queryByLabelText('Reason for processing reviewed candidates')).toBeNull();
});

it('offers an initial run read retry without issuing a mutation', async () => {
  mocked.request.mockRejectedValueOnce(Error('Connection failed')).mockResolvedValue({ items: [], next_cursor: null });
  render(<RunDetail id="run" owner="owner" onClose={() => {}} onViewLeads={() => {}} onSource={() => {}} changed={() => {}} />);
  await screen.findByText(/Run progress could not load/);
  expect(screen.getByRole('button', { name: 'Retry run' })).toBeTruthy();
  expect(mocked.request.mock.calls.every(([, options]) => options?.body === undefined)).toBe(true);
});

it('shows failed SAM packet reads and retries saved data only', async () => {
  mocked.request.mockImplementation(async (path: string) => {
    if (path.endsWith('/packet')) throw Error('Saved SAM evidence could not load');
    return results;
  });
  render(<RequestReview id="request" owner="owner" sam onViewLeads={() => {}} />);
  await screen.findByText(/Saved results could not load/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry results' }));
  await waitFor(() => expect(mocked.request.mock.calls.filter(([p]) => p.endsWith('/packet'))).toHaveLength(2));
  expect(mocked.request.mock.calls.every(([, options]) => options?.body === undefined)).toBe(true);
});

it('polls automatic status without refetching unchanged SAM evidence', async () => {
  vi.useFakeTimers();
  const automatic = { state: 'running', verified: false, added: 0, updated: 0, unchanged: 0, exclusions: [] };
  mocked.request.mockImplementation(async (path: string) => path.endsWith('/packet') ? {
    request_id: 'request', evidence_key: 'same', automatic, run_ids: [], candidates: [], captures: [], next_action: 'Saving',
  } : path.endsWith('/status') ? { evidence_key: 'same', automatic, next_action: 'Saving' } : results);
  render(<RequestReview id="request" owner="owner" sam onViewLeads={() => {}} />);
  await act(async () => {});
  for (let i = 0; i < 3; i++) await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(mocked.request.mock.calls.filter(([p]) => p.endsWith('/packet'))).toHaveLength(1);
  expect(mocked.request.mock.calls.filter(([p]) => p.endsWith('/status'))).toHaveLength(3);
});

it('loads archived schedule history, paginates and opens only occurrences with a run', async () => {
  const onView = vi.fn();
  mocked.request.mockImplementation(async (path: string) => path.endsWith('/events') ? {
    items: [{ id: 'event', action: 'archive', at: '2026-10-19T12:00:00Z', version: 2 }], next_offset: null,
  } : path.includes('offset=1') ? {
    items: [{ id: 'second', state: 'queued', trigger_id: 'run', due_at: '2026-10-19T12:00:00Z' }], next_offset: null,
  } : { items: [{ id: 'first', state: 'blocked', reason: 'scope_changed', due_at: '2026-10-19T12:00:00Z' }], next_offset: 1 });
  render(<ScheduleList items={[{ ...initialDraft(), id: 'schedule', name: 'Archived morning', archived: true, version: 2, next_due_at: null }]} more={false} onMore={() => {}} onEdit={() => {}} onAction={() => {}} onView={onView} busy={false} />);
  expect(mocked.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Archived morning' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Details' }));
  fireEvent.click(screen.getByText('Execution attempts and skipped runs'));
  await screen.findByText(/No run was created/);
  expect(screen.queryByRole('button', { name: 'View run' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'More occurrences' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Run run' }));
  expect(onView).toHaveBeenCalledWith('run');
  fireEvent.click(screen.getByRole('button',{name:'Back to schedules'}));
  const actions=screen.getByRole('button', { name: 'Actions for Archived morning' });
  if(actions.getAttribute('aria-expanded')!=='true')fireEvent.click(actions);
  expect(screen.getByRole('menuitem', { name: 'Edit' }).getAttribute('aria-disabled')).toBe('true');
});
