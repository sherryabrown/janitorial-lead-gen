// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {RunHistory} from './RunHistory';
import {AnalyticsSummary,type AnalyticsReport} from './Analytics';
import {MetricNavigation} from './MetricLink';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:request}));
beforeEach(()=>{sessionStorage.clear();request.mockReset();});afterEach(cleanup);
const run={id:'00000000-0000-4000-8000-000000000123',state:'completed',origin:'manual',created_at:'2026-10-22T22:42:00Z',target_kind:'county_scope',leads:{added:1,updated:0,unchanged:0,completeness:'known'}};
const occurrence={id:'occurrence',state:'queued',version:2,due_at:run.created_at,effective_at:run.created_at,config:{county_ids:['05119'],requested_categories:['opportunity']},baseline:[{source_id:'source',content_sha256:'a'.repeat(64)}]};
const activity={id:'run:'+run.id,kind:'run',activity_at:run.created_at,run,occurrence};
it('puts the schedule name before the Run ID in global history and opens that exact run',async()=>{
 request.mockImplementation(async(path:string)=>path.startsWith('/v1/schedules')?{items:[],next_offset:null}:{items:[{...run,schedule_id:'schedule',schedule_name:'County updates'}],total:1,next_offset:null});
 const view=vi.fn();render(<RunHistory onView={view}/>);fireEvent.click(screen.getByRole('button',{name:'Submit history'}));
 const link=await screen.findByRole('button',{name:`County updates — Run ${run.id}`});expect(link.textContent).toBe('County updates');expect(link.parentElement!.textContent!.indexOf('County updates')).toBeLessThan(link.parentElement!.textContent!.indexOf(run.id));fireEvent.click(link);expect(view).toHaveBeenCalledWith(run.id,'overview');
});
it('shows one authoritative run with date first, full ID secondary, dispatch snapshot and no dead attempt link',async()=>{
 request.mockResolvedValue({items:[activity,{id:'attempt:x',kind:'attempt',activity_at:run.created_at,run:null,occurrence:{...occurrence,state:'skipped',reason:'previous_run_active'}}],total:2,next_offset:null,as_of:run.created_at});
 const view=vi.fn();render(<RunHistory scheduleId="schedule" onView={view}/>);
 const table=await screen.findByRole('table',{name:'Saved execution history'});await screen.findByRole('cell',{name:'Completed'});
 const rows=within(table).getAllByRole('row');expect(rows).toHaveLength(3);
 const date=within(rows[1]).getByRole('button',{name:new RegExp('Run '+run.id)});expect(date.textContent).not.toContain('Run');expect(rows[1].textContent!.indexOf(date.textContent!)).toBeLessThan(rows[1].textContent!.indexOf(run.id));
 fireEvent.click(date);expect(view).toHaveBeenCalledWith(run.id,'overview');expect(within(rows[2]).queryByRole('button')).toBeNull();
 fireEvent.click(within(rows[1]).getByText('Dispatch snapshot · version 2'));expect(within(rows[1]).getByText('Queued')).toBeTruthy();expect(within(rows[1]).getByText('source / —')).toBeTruthy();
 expect(request.mock.calls[0][0]).toContain('/schedules/schedule/activity');expect(request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('retries the same failed page with its boundary and retains loaded activity',async()=>{
 let fail=true;request.mockImplementation(async(path:string)=>{if(path.includes('offset=50')){if(fail)throw Error('Temporary activity error');return {items:[{...activity,id:'attempt:x',kind:'attempt',run:null}],total:2,next_offset:null,as_of:run.created_at};}return {items:[activity],total:2,next_offset:50,as_of:run.created_at};});
 render(<RunHistory scheduleId="schedule" onView={()=>{}}/>);await screen.findByRole('cell',{name:'Completed'});fireEvent.click(screen.getByRole('button',{name:'More runs'}));await screen.findByRole('button',{name:'Retry history'});expect(screen.getByRole('cell',{name:'Completed'})).toBeTruthy();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry history'}));await screen.findByText('No run created');const calls=request.mock.calls.filter(([p])=>p.includes('offset=50'));expect(calls).toHaveLength(2);expect(calls[0][0]).toBe(calls[1][0]);expect(calls[1][0]).toContain('as_of=');
});
const known={value:2,known_subtotal:2,completeness:'known'},partial={value:null,known_subtotal:2,completeness:'partial'},absent={value:null,completeness:'unknown'};
const report={as_of:run.created_at,snapshot:'snapshot',total:3,filters:{from:'2026-10-16',through:'2026-10-22'},coverage:{first_run:null,last_run:null,total_runs:3,verified_identity_runs:1},summary:{outcomes:{added:partial,updated:{...partial,known_subtotal:0},unchanged:absent},categories:{forecast:known,opportunity:partial,award:{...absent,completeness:'not_applicable'}},unique_leads:known,historical_opportunities:absent,unclassified_known_leads:0,candidates_attention:partial,validation_failures:absent,sources_attention:0,route_gaps:0}} as unknown as AnalyticsReport;
it('uses label and measured number, exact positive subset links and accessible coverage help',()=>{
 render(<MetricNavigation onLeads={()=>{}} onRun={()=>{}}><AnalyticsSummary report={report} compact/></MetricNavigation>);
 const metric=(label:string)=>screen.getByText(label).closest('div')!;
 expect(within(metric('Verified new leads')).getByRole('link').textContent).toBe('2');expect(within(metric('Verified updated leads')).getByText('0')).toBeTruthy();expect(within(metric('Verified updated leads')).queryByRole('link')).toBeNull();expect(within(metric('Verified unchanged matches')).getByText('—')).toBeTruthy();
 expect(screen.queryByText(/Unknown.*known|Total unavailable|2 verified/)).toBeNull();
 const help=within(metric('Verified new leads')).getByRole('button');fireEvent.focus(help);expect(screen.getByRole('tooltip').textContent).toContain('Only verified saved records');fireEvent.keyDown(help,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull();fireEvent.click(help);expect(screen.getByRole('tooltip')).toBeTruthy();
 const link=within(metric('Verified new leads')).getByRole('link');expect(link.getAttribute('href')).toContain('expected');
});
