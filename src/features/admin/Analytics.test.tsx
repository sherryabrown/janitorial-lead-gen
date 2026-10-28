// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,screen,waitFor} from '@testing-library/react';
import {renderAdmin as render,userCapabilities} from '../../../tests/helpers/render-admin';
import {SchedulingRoleContext} from './scheduling-role';
import {Analytics,ScheduleAnalyticsSummary,type AnalyticsReport} from './Analytics';
import {clearAdminSession} from './navigation';
const mocked=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mocked.request}));
const known={value:1,known_subtotal:1,completeness:'known'},unknown={value:null,known_subtotal:1,completeness:'partial'};
const report={as_of:'2026-10-20T19:00:00Z',snapshot:'a'.repeat(64),total:26,next_offset:25,filters:{from:'2026-10-14',through:'2026-10-20'},coverage:{first_run:null,last_run:null,verified_identity_runs:1,total_runs:26},summary:{runs:26,unique_leads:unknown,outcomes:{added:unknown,updated:known,unchanged:known},run_events:{added:unknown,updated:known,unchanged:known},categories:{forecast:known,opportunity:unknown,award:known},historical_opportunities:known,unclassified_known_leads:1,candidates_attention:unknown,validation_failures:unknown,sources_attention:2,route_gaps:1,timing:{average_ms:null,median_ms:null,samples:0,excluded:26},usage:{ai:'unknown',input_tokens:null,output_tokens:null,actual_usd:null,known_actual_usd:0.02,held_usd:0.1,credits:null}},items:[]} as AnalyticsReport;
beforeEach(()=>{sessionStorage.clear();mocked.request.mockReset();mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:report);});
afterEach(cleanup);
it('shows honest partial totals, separate reservations and owner-scoped last-seven-day filters',async()=>{
 render(<Analytics owner="a" counties={[]}/>);await screen.findByRole('heading',{name:'Validated results'});
 expect(screen.queryByText(/Unknown \u00b7 \d+ known/)).toBeNull();expect(screen.getByText('Verified new leads')).toBeTruthy();expect(screen.getByText('Unknown / not comparable')).toBeTruthy();expect(screen.getByText('$0.02')).toBeTruthy();expect(screen.getByText('$0.10')).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:/^Type/}),{target:{value:'sam'}});await waitFor(()=>expect(mocked.request.mock.calls.some(([p])=>p.includes('target=sam'))).toBe(true));expect(sessionStorage.getItem('spin-admin-stats-filter:a')).toContain('sam');
 clearAdminSession('a');expect(sessionStorage.getItem('spin-admin-stats-filter:a')).toBeNull();expect(mocked.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('requests the smallest existing report page while retaining full summary and coverage without a Runs list',async()=>{
 sessionStorage.setItem('spin-admin-stats-filter:a',JSON.stringify({sort:'added',direction:'asc'}));
 render(<Analytics owner="a" counties={[]}/>);await screen.findByRole('heading',{name:'Validated results'});
 const path=mocked.request.mock.calls.find(([p])=>p.startsWith('/v1/admin/analytics'))?.[0];expect(path).toContain('limit=1');expect(path).not.toContain('sort=');expect(path).not.toContain('direction=');expect(path).not.toContain('offset=');expect(screen.getByText(/Run creation dates · 26 runs/)).toBeTruthy();
 expect(screen.queryByRole('table',{name:'Analytics runs'})).toBeNull();expect(screen.queryByLabelText('Sort runs')).toBeNull();expect(screen.queryByRole('button',{name:'Next runs'})).toBeNull();expect(screen.queryByRole('button',{name:'Previous runs'})).toBeNull();
});
it('aborts stale filters and never replaces the new report with an earlier response',async()=>{
 let resolveOld!:(r:AnalyticsReport)=>void;mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:path.includes('target=sam')?{...report,total:0}:new Promise(resolve=>{resolveOld=resolve;}));
 render(<Analytics owner="a" counties={[]}/>);fireEvent.change(screen.getByRole('combobox',{name:/^Type/}),{target:{value:'sam'}});await screen.findByText(/Run creation dates · 0 runs/);await act(async()=>resolveOld(report));expect(screen.queryByText(/Run creation dates · 26 runs/)).toBeNull();
});
it('schedule totals use the existing schedule identity and all-time reporting scope',async()=>{
 render(<ScheduleAnalyticsSummary id="schedule"/>);await screen.findByRole('heading',{name:'All-time available results'});expect(mocked.request.mock.calls[0][0]).toContain('schedule=schedule&period=all');
});
it('keeps metrics and trustworthy completion samples visible when detailed step history is too large',async()=>{
 mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:{...report,summary:{...report.summary,timing:{average_ms:60000,median_ms:60000,samples:2,excluded:24,recorded_activity_unavailable:true}}});
 render(<Analytics owner="a" counties={[]}/>);await screen.findByText('Recorded activity unavailable for this selection; view run logs.');expect(screen.getByRole('heading',{name:'Validated results'})).toBeTruthy();expect(screen.getByText('2 / 24')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();
});

it('retains same-scope stats on a failed refresh with one retry and clears them on filter change',async()=>{
 let fail=false;mocked.request.mockImplementation(async(path:string)=>{if(path.startsWith('/v1/schedules'))return {items:[],next_offset:null};if(fail)throw Error('Saved report unavailable');return report;});
 render(<Analytics owner="a" counties={[]}/>);await screen.findByRole('heading',{name:'Validated results'});
 fail=true;fireEvent.click(await screen.findByRole('button',{name:'Refresh stats'}));await screen.findByRole('button',{name:'Retry stats'});
 expect(screen.getByRole('heading',{name:'Validated results'})).toBeTruthy();expect(screen.getByText('Saved view · update failed')).toBeTruthy();expect(screen.queryByRole('button',{name:'Refresh stats'})).toBeNull();
 fireEvent.change(screen.getByRole('combobox',{name:/^Type/}),{target:{value:'sam'}});expect(screen.queryByRole('heading',{name:'Validated results'})).toBeNull();
});
it('retries only failed schedule choices without discarding a healthy report',async()=>{
 let fail=true;mocked.request.mockImplementation(async(path:string)=>{if(path.startsWith('/v1/schedules')){if(fail)throw Error('Choices unavailable');return {items:[],next_offset:null};}return report;});
 render(<Analytics owner="a" counties={[]}/>);await screen.findByRole('button',{name:'Retry stats'});await screen.findByRole('heading',{name:'Validated results'});
 const count=mocked.request.mock.calls.filter(([p])=>p.startsWith('/v1/admin/analytics')).length;fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry stats'}));await screen.findByRole('button',{name:'Refresh stats'});
 expect(mocked.request.mock.calls.filter(([p])=>p.startsWith('/v1/admin/analytics'))).toHaveLength(count);expect(mocked.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});

it('renders User statistics from the safe report without Admin usage fields and keeps filters working',async()=>{
 const {usage,...summary}=report.summary;void usage;
 mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:{...report,summary});
 render(<SchedulingRoleContext.Provider value={userCapabilities}><Analytics owner="user" counties={[]}/></SchedulingRoleContext.Provider>);
 await screen.findByRole('heading',{name:'Validated results'});
 expect(screen.getByText('Verified updated leads')).toBeTruthy();
 expect(screen.queryByRole('heading',{name:/AI usage/})).toBeNull();
 fireEvent.change(screen.getByRole('combobox',{name:/^Type/}),{target:{value:'sam'}});
 await waitFor(()=>expect(mocked.request.mock.calls.some(([p])=>p.includes('target=sam'))).toBe(true));
 await screen.findByRole('heading',{name:'Validated results'});
 expect(screen.queryByRole('alert')).toBeNull();
});
it('does not display Admin usage even if an older response includes it for a User',async()=>{
 render(<SchedulingRoleContext.Provider value={userCapabilities}><Analytics owner="user" counties={[]}/></SchedulingRoleContext.Provider>);
 await screen.findByRole('heading',{name:'Validated results'});
 expect(screen.queryByRole('heading',{name:/AI usage/})).toBeNull();expect(screen.queryByText('$0.02')).toBeNull();
});
