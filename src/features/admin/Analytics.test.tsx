// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {Analytics,ScheduleAnalyticsSummary,type AnalyticsReport} from './Analytics';
import {clearAdminSession} from './navigation';
const mocked=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mocked.request}));
const known={value:1,known_subtotal:1,completeness:'known'},unknown={value:null,known_subtotal:1,completeness:'partial'};
const report={as_of:'2026-10-20T19:00:00Z',snapshot:'a'.repeat(64),total:26,next_offset:25,filters:{from:'2026-10-14',through:'2026-10-20'},coverage:{first_run:null,last_run:null,verified_identity_runs:1,total_runs:26},summary:{runs:26,unique_leads:unknown,outcomes:{added:unknown,updated:known,unchanged:known},run_events:{added:unknown,updated:known,unchanged:known},categories:{forecast:known,opportunity:unknown,award:known},historical_opportunities:known,unclassified_known_leads:1,candidates_attention:unknown,validation_failures:unknown,sources_attention:2,route_gaps:1,timing:{average_ms:null,median_ms:null,samples:0,excluded:26},usage:{ai:'unknown',input_tokens:null,output_tokens:null,actual_usd:null,known_actual_usd:0.02,held_usd:0.1,credits:null}},items:[]} as AnalyticsReport;
beforeEach(()=>{sessionStorage.clear();mocked.request.mockReset();mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:report);});
afterEach(cleanup);
it('shows honest partial totals, separate reservations and owner-scoped last-seven-day filters',async()=>{
 render(<Analytics owner="a" counties={[]} onView={()=>{}}/>);await screen.findByRole('heading',{name:'Validated results'});
 expect(screen.getAllByText('Unknown · 1 known').length).toBeGreaterThan(1);expect(screen.getByText('Unknown / not comparable')).toBeTruthy();expect(screen.getByText('$0.02')).toBeTruthy();expect(screen.getByText('$0.10')).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:/^Type/}),{target:{value:'sam'}});await waitFor(()=>expect(mocked.request.mock.calls.some(([p])=>p.includes('target=sam'))).toBe(true));expect(sessionStorage.getItem('spin-admin-stats-filter:a')).toContain('sam');
 clearAdminSession('a');expect(sessionStorage.getItem('spin-admin-stats-filter:a')).toBeNull();expect(mocked.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('anchors subsequent pages and refreshes safely when a report changes',async()=>{
 let changed=false;mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:changed?{unavailable:'Results changed while paging. Refresh stats to load a consistent report.'}:report);
 render(<Analytics owner="a" counties={[]} onView={()=>{}}/>);await screen.findByRole('heading',{name:'Validated results'});changed=true;fireEvent.click(screen.getByRole('button',{name:'Next runs'}));await screen.findByRole('alert');
 expect(mocked.request.mock.calls.some(([p])=>p.includes('offset=25')&&p.includes('snapshot=')&&p.includes('as_of='))).toBe(true);expect(screen.queryByRole('heading',{name:'Validated results'})).toBeNull();changed=false;fireEvent.click(screen.getByRole('button',{name:'Retry stats'}));await screen.findByRole('heading',{name:'Validated results'});
 expect(mocked.request.mock.calls.at(-1)?.[0]).not.toContain('snapshot=');
});
it('aborts stale filters and never replaces the new report with an earlier response',async()=>{
 let resolveOld!:(r:AnalyticsReport)=>void;mocked.request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:path.includes('target=sam')?{...report,total:0}:new Promise(resolve=>{resolveOld=resolve;}));
 render(<Analytics owner="a" counties={[]} onView={()=>{}}/>);fireEvent.change(screen.getByRole('combobox',{name:/^Type/}),{target:{value:'sam'}});await screen.findByText('Page 1 · 0 runs');await act(async()=>resolveOld(report));expect(screen.queryByText('Page 1 · 26 runs')).toBeNull();
});
it('schedule totals use the existing schedule identity and all-time reporting scope',async()=>{
 render(<ScheduleAnalyticsSummary id="schedule"/>);await screen.findByRole('heading',{name:'All-time available results'});expect(mocked.request.mock.calls[0][0]).toContain('schedule=schedule&period=all');
});
