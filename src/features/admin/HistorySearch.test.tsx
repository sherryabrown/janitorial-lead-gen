// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {RunHistory} from './RunHistory';
import {chicagoDate,historyDateError,initialHistoryFilters,readHistorySearch} from './history-search';
import {clearAdminSession,parseAdminContext,pushAdminLocation,readAdminLocation} from './navigation';
import {runBreadcrumbs} from './run-breadcrumbs';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:request}));
const run={id:'saved-run',state:'completed',target_kind:'county_scope',created_at:'2026-10-23T12:00:00Z'};
const reads=()=>request.mock.calls.filter(([p])=>p.startsWith('/v1/admin/history'));
const submit=()=>fireEvent.submit(screen.getByRole('form',{name:'History filters'}));
const dates=(from:string,through=from)=>{fireEvent.change(screen.getByLabelText('From · CT'),{target:{value:from}});fireEvent.change(screen.getByLabelText('Through · CT'),{target:{value:through}});};
beforeEach(()=>{sessionStorage.clear();window.history.replaceState({},'','/');request.mockReset();request.mockImplementation(async(p:string)=>p.startsWith('/v1/schedules')?{items:[],next_offset:null}:{items:[run],next_offset:null,total:1});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('uses CT calendar dates through midnight/DST and validates actual ordered dates',()=>{
 expect(chicagoDate(new Date('2026-10-23T04:30:00Z'))).toBe('2026-10-22');
 expect(chicagoDate(new Date('2026-03-09T04:30:00Z'))).toBe('2026-03-08');
 expect(historyDateError({...initialHistoryFilters(),from:'2026-02-30'})).toMatch(/valid/);
 expect(historyDateError({...initialHistoryFilters(),from:'2026-10-24',through:'2026-10-23'})).toMatch(/on or before/);
 expect(historyDateError({...initialHistoryFilters(),from:'2026-03-08',through:'2026-03-08'})).toBe('');
});
it('starts empty/today, ignores old blank-date filters and queries only on valid Submit/Enter',async()=>{
 sessionStorage.setItem('spin-admin-history-filter:owner:all',JSON.stringify({schedule:'old',from:'',through:''}));
 render(<RunHistory owner="owner" onView={()=>{}}/>);expect(screen.getByLabelText('From · CT')).toHaveProperty('value',chicagoDate());expect(screen.getByLabelText('Through · CT')).toHaveProperty('value',chicagoDate());expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByText('No matching runs.')).toBeNull();expect(screen.queryByRole('button',{name:'Refresh history'})).toBeNull();
 dates('2026-10-24','2026-10-23');submit();expect(screen.getByRole('alert').textContent).toMatch(/on or before/);expect(reads()).toHaveLength(0);
 dates('2026-10-22','2026-10-23');expect(reads()).toHaveLength(0);submit();await screen.findByRole('button',{name:'Run saved-run'});expect(reads()).toHaveLength(1);expect(reads()[0][0]).toContain('from=2026-10-22&through=2026-10-23');expect(request.mock.calls.some(([p])=>p.includes('/steps'))).toBe(false);
});
it('guards duplicate submissions, keeps draft changes separate and retries the failed applied scope',async()=>{
 let reject!:(e:Error)=>void;request.mockImplementation((p:string)=>p.startsWith('/v1/schedules')?Promise.resolve({items:[],next_offset:null}):new Promise((_,r)=>{reject=r;}));
 render(<RunHistory owner="owner" entryId="visit" onView={()=>{}}/>);dates('2026-10-20');submit();submit();expect(reads()).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('Run outcome'),{target:{value:'partial'}});expect(reads()).toHaveLength(1);await act(async()=>reject(Error('Server private trace')));expect(screen.queryByText('Server private trace')).toBeNull();
 request.mockImplementation(async()=>({items:[run],next_offset:null,total:1}));fireEvent.click(await screen.findByRole('button',{name:'Retry history'}));await waitFor(()=>expect(reads()).toHaveLength(2));expect(reads()[1][0]).not.toContain('outcome=');expect(screen.queryByRole('table')).toBeNull();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Submit history'})).toHaveProperty('disabled',false));submit();await screen.findByRole('button',{name:'Run saved-run'});expect(reads().at(-1)?.[0]).toContain('outcome=partial');
});
it('retries the failed More page using applied filters and preserves the newest draft in storage',async()=>{
 let fail=true;request.mockImplementation(async(p:string)=>p.startsWith('/v1/schedules')?{items:[],next_offset:null}:p.includes('offset=50')?fail?Promise.reject(Error('Private page error')):{items:[run,{...run,id:'older'}],next_offset:null,total:2}:{items:[run],next_offset:50,total:2});
 render(<RunHistory owner="owner" entryId="visit" onView={()=>{}}/>);dates('2026-10-20');submit();await screen.findByRole('button',{name:'Run saved-run'});fireEvent.click(screen.getByRole('button',{name:'More runs'}));await screen.findByRole('button',{name:'Retry history'});
 fireEvent.change(screen.getByLabelText('Run outcome'),{target:{value:'partial'}});fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry history'}));await waitFor(()=>expect(reads()).toHaveLength(3));expect(reads().at(-1)?.[0]).toContain('offset=50');expect(reads().at(-1)?.[0]).not.toContain('outcome=');await waitFor(()=>expect(screen.queryByRole('button',{name:'Retry history'})).toBeNull());
 expect(readHistorySearch('spin-admin-history-search:owner:visit').draft.outcome).toBe('partial');fireEvent.change(screen.getByLabelText('Run outcome'),{target:{value:''}});await screen.findByRole('button',{name:'Run older'});expect(screen.getAllByRole('row')).toHaveLength(3);
});
it('restores the same visit but starts fresh for another visit/owner, ignoring late responses',async()=>{
 let late!:(value:unknown)=>void;let signal:AbortSignal|undefined;
 request.mockImplementation((p:string,o?:{signal?:AbortSignal})=>p.startsWith('/v1/schedules')?Promise.resolve({items:[],next_offset:null}):new Promise(resolve=>{late=resolve;signal=o?.signal;}));
 const mounted=render(<RunHistory owner="owner" entryId="one" onView={()=>{}}/>);dates('2026-10-20');submit();await waitFor(()=>expect(late).toBeTypeOf('function'));
 mounted.rerender(<RunHistory owner="other" entryId="one" onView={()=>{}}/>);expect(signal?.aborted).toBe(true);await act(async()=>late({items:[run],next_offset:null,total:1}));expect(screen.queryByRole('table')).toBeNull();expect(screen.getByLabelText('From · CT')).toHaveProperty('value',chicagoDate());
 request.mockImplementation(async()=>({items:[run],next_offset:null,total:1}));mounted.rerender(<RunHistory owner="owner" entryId="one" onView={()=>{}}/>);await screen.findByRole('button',{name:'Run saved-run'});expect(screen.getByLabelText('From · CT')).toHaveProperty('value','2026-10-20');const before=reads().length;
 mounted.rerender(<RunHistory owner="owner" entryId="two" onView={()=>{}}/>);expect(screen.queryByRole('table')).toBeNull();expect(reads()).toHaveLength(before);expect(screen.getByLabelText('From · CT')).toHaveProperty('value',chicagoDate());clearAdminSession('owner');expect(sessionStorage.getItem('spin-admin-history-search:owner:one')).toBeNull();
});
it('keeps a submitted search when hidden behind a run without broad background reads',async()=>{
 const mounted=render(<RunHistory owner="owner" entryId="visit" onView={()=>{}}/>);dates('2026-10-20');submit();await screen.findByRole('button',{name:'Run saved-run'});const count=reads().length;mounted.rerender(<RunHistory owner="owner" entryId="visit" active={false} onView={()=>{}}/>);expect(reads()).toHaveLength(count);mounted.rerender(<RunHistory owner="owner" entryId="visit" onView={()=>{}}/>);await waitFor(()=>expect(reads()).toHaveLength(count+1));expect(reads().at(-1)?.[0]).toContain('from=2026-10-20');
});
it('preserves the search token through run navigation/breadcrumbs and clears it on sign-out',()=>{
 const context={view:'history' as const,historySearchId:'visit',returnTo:'contracts' as const};pushAdminLocation('owner',context);pushAdminLocation('owner',{...context,runId:'run'});expect(readAdminLocation('owner').historySearchId).toBe('visit');const navigate=vi.fn();runBreadcrumbs({...context,runId:'run'},null,navigate)[1].onClick?.();expect(navigate).toHaveBeenCalledWith(context);expect(parseAdminContext({...context,historySearchId:'<script>'}).historySearchId).toBeUndefined();clearAdminSession('owner');expect(window.location.search).not.toContain('adminHistorySearch');
});
it('still loads schedule runs automatically with their saved filters and no Submit',async()=>{
 request.mockResolvedValue({items:[{id:'run:'+run.id,kind:'run',activity_at:run.created_at,run}],next_offset:null,total:1});
 render(<RunHistory owner="owner" scheduleId="schedule" onView={()=>{}}/>);await screen.findByRole('button',{name:/Run saved-run$/});expect(request.mock.calls[0][0]).toBe('/v1/schedules/schedule/activity?');expect(screen.queryByRole('button',{name:'Submit history'})).toBeNull();
});
