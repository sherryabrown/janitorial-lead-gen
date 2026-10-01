// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/research/mapping.json';
import { mapProcurementLead, type ProcurementLead } from '../lib/procurement';
import App from './AppShell';

const api = vi.hoisted(() => ({ load: vi.fn(), history: vi.fn(), detail: vi.fn(), write: vi.fn(), authChanged: undefined as undefined | ((event: string, session: unknown) => void) }));
vi.mock('../lib/procurement', async (original) => ({
  ...await original<typeof import('../lib/procurement')>(),
  loadProcurementContracts: api.load, loadProcurementLeadHistory: api.history,
  loadProcurementLeadDetail: api.detail, updateProcurementLeadStage: api.write,
  bulkUpdateProcurementLeadStage: api.write,
}));
vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'fixture-user', email: 'fixture@example.invalid' } } }, error: null }),
      onAuthStateChange: (callback: typeof api.authChanged) => { api.authChanged=callback; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => api.authChanged?.('SIGNED_OUT',null),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => undefined,
  },
}));

const lead=fixtures.procurement_leads[1] as unknown as ProcurementLead;
beforeEach(() => {
  vi.clearAllMocks();
  const mapped=mapProcurementLead(lead);
  api.load.mockResolvedValue({contracts:[mapped],sources:[],total:1,counts:{new:1}});
  api.history.mockResolvedValue([]);
  api.detail.mockResolvedValue(mapped);
  api.write.mockResolvedValue({...lead,stage:'interested'});
  window.confirm=()=>true;
});
afterEach(cleanup);

it('retains research context after selection/history and refreshes qualifications from canonical data', async () => {
  render(<App />);
  const context=await screen.findByRole('region',{name:'Research context'});
  await waitFor(()=>expect(api.history).toHaveBeenCalled());
  expect(context.textContent).toContain('Signed execution');
  expect(within(context).queryByRole('button',{name:/edit/i})).toBeNull();
  api.history.mockResolvedValue([{id:'real-note-id',lead_id:lead.id,event_type:'note_added',note_text:'Owner follow-up remains editable',occurred_at:'2026-10-01T12:00:00Z',actor_id:'fixture-user',old_value:null,new_value:null,metadata:{}}]);
  const updated={...mapProcurementLead(lead),researchNotes:['New verification: signed execution remains unverified.']};
  api.load.mockResolvedValue({contracts:[updated],sources:[],total:1,counts:{new:1}});
  api.detail.mockResolvedValue(updated);
  fireEvent.click(screen.getByRole('button',{name:'Refresh contracts from Supabase'}));
  await screen.findByText(updated.researchNotes[0]);
  expect((await screen.findAllByText('Owner follow-up remains editable')).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Unable to save/)).toBeNull();
});

it('uses server totals and retains checked records across pages', async () => {
  api.load.mockImplementation(async (_client, _filters, page) => ({contracts:[{...mapProcurementLead(lead),id:`fixture-page-${page}`}],sources:[],total:1005,counts:{new:1005}}));
  render(<App />);
  await screen.findByText('1005 results');
  await waitFor(()=>expect(api.history).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:/Select all 1 visible contracts/}));
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  await waitFor(()=>expect(api.load.mock.calls.some(call=>call[2]===1)).toBe(true));
  await screen.findByText(/Page 2 of 21.*1 selected across pages/);
});

it('removes protected data when the Auth session ends', async () => {
  render(<App />);
  await screen.findByRole('region',{name:'Research context'});
  act(()=>api.authChanged?.('SIGNED_OUT',null));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Research context'})).toBeNull());
  expect(screen.queryByText(lead.title ?? '')).toBeNull();
});

it('shows a saved stage and retry message when its history refresh fails', async () => {
  render(<App />);
  await screen.findByRole('region',{name:'Research context'});
  await waitFor(()=>expect(api.history).toHaveBeenCalled());
  api.history.mockRejectedValueOnce(new Error('read failed'));
  const card=screen.getByRole('article');
  fireEvent.click(within(card).getByRole('button',{name:'Interested'}));
  await screen.findByText('Stage saved. History could not refresh; retry refresh.');
  expect(screen.queryByText(/Unable to save stage/)).toBeNull();
  expect(within(card).queryByRole('button',{name:'Interested'})).toBeNull();
  expect(within(card).getByRole('button',{name:'Hold'})).toBeTruthy();
});

it('commits a bulk change before a failed history refresh and clears the selection', async () => {
  render(<App />);
  await screen.findByRole('region',{name:'Research context'});
  await waitFor(()=>expect(api.history).toHaveBeenCalled());
  api.write.mockResolvedValue([{...lead,stage:'interested'}]);
  api.history.mockRejectedValueOnce(new Error('read failed'));
  fireEvent.click(screen.getByRole('button',{name:'Select all 1 visible contracts'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Change selected contracts to stage'}),{target:{value:'interested'}});
  fireEvent.click(screen.getByRole('button',{name:'Apply stage'}));
  await screen.findByText('Stages saved. History could not refresh; retry refresh.');
  expect(screen.queryByRole('button',{name:'Clear selection'})).toBeNull();
  expect(within(screen.getByRole('article')).getByRole('button',{name:'Hold'})).toBeTruthy();
});

it('ignores an older queue response after the user changes search', async () => {
  let release: (value: unknown) => void = () => undefined;
  api.load.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  render(<App />);
  await waitFor(()=>expect(api.load).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('textbox',{name:'Search project, location, contracting agency'}),{target:{value:'SSC'}});
  await screen.findByRole('region',{name:'Research context'});
  await act(async()=>release({contracts:[],sources:[],total:0,counts:{}}));
  expect(screen.getByText('1 results')).toBeTruthy();
  expect(screen.getByRole('region',{name:'Research context'}).textContent).toContain('Signed execution');
});
