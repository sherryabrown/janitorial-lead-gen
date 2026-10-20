// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/research/mapping.json';
import { mapProcurementLead, type ProcurementLead } from '../lib/procurement';
import App from './AppShell';
import { StrictMode } from 'react';

const api = vi.hoisted(() => ({ load: vi.fn(), history: vi.fn(), detail: vi.fn(), write: vi.fn(), note: vi.fn(), edit: vi.fn(), authChanged: undefined as undefined | ((event: string, session: unknown) => void) }));
vi.mock('../lib/procurement', async (original) => ({
  ...await original<typeof import('../lib/procurement')>(),
  loadProcurementContracts: api.load, loadProcurementLeadHistory: api.history,
  loadProcurementLeadDetail: api.detail, updateProcurementLeadStage: api.write,
  bulkUpdateProcurementLeadStage: api.write, addProcurementLeadNote: api.note, editProcurementLeadNote: api.edit,
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
  vi.resetAllMocks();
  const mapped=mapProcurementLead(lead);
  api.load.mockResolvedValue({contracts:[mapped],sources:[],total:1,counts:{new:1}});
  api.history.mockResolvedValue([]);
  api.detail.mockResolvedValue(mapped);
  api.write.mockResolvedValue({...lead,stage:'interested'});
  api.note.mockResolvedValue({id:'saved-note'});
  api.edit.mockResolvedValue({id:'saved-note'});
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


it('retains a rejected note draft and does not repeat a committed write after refresh failure', async () => {
  render(<App />);
  await screen.findByRole('region', {name:'Research context'});
  await waitFor(() => expect(api.history).toHaveBeenCalled());
  const input = screen.getByPlaceholderText('Capture any applicable information, including where data may not be accurate.');
  fireEvent.change(input, {target:{value:'Keep this draft'}});
  api.note.mockRejectedValueOnce(new Error('write rejected'));
  fireEvent.click(screen.getByRole('button', {name:'Save note'}));
  await screen.findByText(/Unable to save note: write rejected/);
  expect((input as HTMLTextAreaElement).value).toBe('Keep this draft');
  api.history.mockRejectedValueOnce(new Error('read failed'));
  fireEvent.click(screen.getByRole('button', {name:'Save note'}));
  await screen.findByText('Note saved. History could not refresh; retry refresh.');
  expect((input as HTMLTextAreaElement).value).toBe('');
  expect(api.note).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', {name:'Refresh contracts from Supabase'}));
  await waitFor(() => expect(api.history).toHaveBeenCalledTimes(3));
  expect(api.note).toHaveBeenCalledTimes(2);
});

it('a pending note save does not clear a newer draft', async () => {
  let finish: (value: unknown) => void = () => undefined;
  api.note.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
  render(<App />);
  await screen.findByRole('region', {name:'Research context'});
  await waitFor(() => expect(api.history).toHaveBeenCalled());
  const input = screen.getByPlaceholderText('Capture any applicable information, including where data may not be accurate.');
  fireEvent.change(input, {target:{value:'Submitted draft'}});
  fireEvent.click(screen.getByRole('button', {name:'Save note'}));
  await waitFor(() => expect(api.note).toHaveBeenCalled());
  fireEvent.change(input, {target:{value:'New draft'}});
  await act(async () => finish({id:'saved-note'}));
  await waitFor(() => expect(screen.getByRole('button', {name:'Save note'})).toBeTruthy());
  expect((input as HTMLTextAreaElement).value).toBe('New draft');
});

it('retains a rejected edit and treats a committed edit with failed refresh as saved', async () => {
  api.history.mockResolvedValue([{id:'note-id',lead_id:lead.id,event_type:'note_added',note_text:'Original note',occurred_at:'2026-10-01T12:00:00Z',actor_id:'fixture-user',old_value:null,new_value:null,metadata:{}}]);
  render(<App />);
  await screen.findAllByText('Original note');
  fireEvent.click(screen.getByRole('button', {name:/Edit note from/}));
  const input = screen.getByRole('textbox', {name:/Edit note from/});
  fireEvent.change(input, {target:{value:'Edited draft'}});
  api.edit.mockRejectedValueOnce(new Error('edit rejected'));
  fireEvent.click(screen.getByRole('button', {name:'Save edit'}));
  await screen.findByText(/Unable to edit note: edit rejected/);
  expect((input as HTMLTextAreaElement).value).toBe('Edited draft');
  api.history.mockRejectedValueOnce(new Error('read failed'));
  fireEvent.click(screen.getByRole('button', {name:'Save edit'}));
  await screen.findByText('Note edited. History could not refresh; retry refresh.');
  expect(screen.queryByRole('button', {name:'Save edit'})).toBeNull();
  expect(api.edit).toHaveBeenCalledTimes(2);
});


it('an older save does not clear the shared draft after selecting another lead', async () => {
  let finish: (value: unknown) => void = () => undefined;
  const first=mapProcurementLead(lead), second={...first,id:'second-lead',projectName:'Second contract'};
  api.load.mockResolvedValue({contracts:[first,second],sources:[],total:2,counts:{new:2}});
  api.note.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(<App />);
  await screen.findByRole('region',{name:'Research context'});
  await waitFor(()=>expect(api.history).toHaveBeenCalled());
  const input=screen.getByPlaceholderText('Capture any applicable information, including where data may not be accurate.');
  fireEvent.change(input,{target:{value:'Shared draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save note'}));
  await waitFor(()=>expect(api.note).toHaveBeenCalled());
  fireEvent.click((await screen.findByRole('checkbox',{name:'Select Second contract'})).closest('article')!);
  await screen.findByRole('textbox',{name:'Note for Second contract'});
  await waitFor(()=>expect(api.history).toHaveBeenCalledWith(expect.anything(),second.id));
  const historyCalls=api.history.mock.calls.length;
  await act(async()=>finish({id:'saved-note'}));
  await waitFor(()=>expect((screen.getByRole('textbox',{name:'Note for Second contract'}) as HTMLTextAreaElement).value).toBe('Shared draft'));
  expect(api.note.mock.calls[0][1]).toBe(lead.id);
  expect(api.history).toHaveBeenCalledTimes(historyCalls);
  expect(screen.queryByText(/Note saved. History could not refresh/)).toBeNull();
});


it('ignores a rejected history request after selecting another lead', async () => {
  const first=mapProcurementLead(lead), second={...first,id:'second-lead',projectName:'Second contract'};
  api.load.mockResolvedValue({contracts:[first,second],sources:[],total:2,counts:{new:2}});
  let rejectOld: (reason: Error) => void = () => undefined;
  api.history.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject;}));
  render(<App />);
  await waitFor(()=>expect(api.history).toHaveBeenCalledWith(expect.anything(),first.id));
  fireEvent.click((await screen.findByRole('checkbox',{name:'Select Second contract'})).closest('article')!);
  await waitFor(()=>expect(api.history).toHaveBeenCalledWith(expect.anything(),second.id));
  await act(async()=>{rejectOld(new Error('old history failure'));});
  expect(screen.queryByText('History could not refresh. Retry refresh.')).toBeNull();
});

it('shows a current history read failure and ignores a failure after unmount', async () => {
  api.history.mockRejectedValueOnce(new Error('current read failure'));
  const view=render(<App />);
  await screen.findByText('History could not refresh. Retry refresh.');
  view.unmount();
  let rejectOld: (reason: Error) => void = () => undefined;
  api.history.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject;}));
  const next=render(<App />);
  await waitFor(()=>expect(api.history).toHaveBeenCalledTimes(2));
  next.unmount();
  await act(async()=>{rejectOld(new Error('after unmount'));});
  expect(screen.queryByText('History could not refresh. Retry refresh.')).toBeNull();
});

vi.mock('../features/admin/AdminScreen',()=>({default:({onViewLeads}:{onViewLeads:()=>void})=><section aria-label="Admin county checks"><button onClick={onViewLeads}>Back to contracts</button></section>}));
it('opens Admin only through Settings and restores checked queue records and filters',async()=>{
  render(<App/>);
  await screen.findByRole('article');
  expect(screen.queryByRole('button',{name:'Generate contracts'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/Select all 1 visible contracts/}));
  expect(screen.queryByRole('button',{name:'Admin'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  await screen.findByRole('region',{name:'Admin county checks'});
  expect(screen.queryByRole('region',{name:'Research context'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Back to contracts'}));
  await screen.findByRole('article');
  expect(screen.getByText(/1 selected across pages/)).toBeTruthy();
});

it('keeps mounted Admin work across navigation and clears only the signed-out owner state',async()=>{
  render(<App/>);
  await screen.findByRole('article');
  fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  const admin=await screen.findByRole('region',{name:'Admin county checks'});
  sessionStorage.setItem('spin-admin-draft:fixture-user','private draft');
  sessionStorage.setItem('spin-admin-draft:another-user','other draft');
  fireEvent.click(screen.getByRole('button',{name:'Back to contracts'}));
  fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  expect(screen.getByRole('region',{name:'Admin county checks'})).toBe(admin);
  fireEvent.click(screen.getByRole('button',{name:'Profile'}));
  fireEvent.click(screen.getByRole('button',{name:'Sign out'}));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Admin county checks'})).toBeNull());
  expect(sessionStorage.getItem('spin-admin-draft:fixture-user')).toBeNull();
  expect(sessionStorage.getItem('spin-admin-draft:another-user')).toBe('other draft');
});

it('preserves restored drafts through StrictMode and clears the old owner on account change',async()=>{
  sessionStorage.setItem('spin-admin-draft:fixture-user','restored draft');
  render(<StrictMode><App/></StrictMode>);
  await screen.findByRole('article');
  expect(sessionStorage.getItem('spin-admin-draft:fixture-user')).toBe('restored draft');
  fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  await screen.findByRole('region',{name:'Admin county checks'});
  act(()=>api.authChanged?.('SIGNED_IN',{user:{id:'replacement-user',email:'replacement@example.invalid'}}));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Admin county checks'})).toBeNull());
  expect(sessionStorage.getItem('spin-admin-draft:fixture-user')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Profile'}));
  expect(screen.getByRole('dialog').textContent).toContain('replacement@example.invalid');
});
