import {renderAdmin as render} from '../../../tests/helpers/render-admin';
// @vitest-environment jsdom
import {useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,screen,waitFor,within} from '@testing-library/react';
import {ScheduleDetail,type ScheduleSection} from './ScheduleDetail';
import {initialDraft} from './model';
import type {AnySchedule,Run,Schedule} from './types';
import type {AnalyticsReport} from './Analytics';
const mock=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mock.request,mutationKey:()=> 'key',acknowledged:()=>{}}));
const base={...initialDraft(),id:'schedule',name:'Saved schedule',version:2,next_due_at:null} as Schedule;
const run={id:'newest',schedule_id:'schedule',state:'completed',origin:'scheduled',created_at:'2026-10-22T14:00:00Z',target_kind:'county_scope',config:base.config,children:[{request_id:'request',county_id:'05119',role:'county'}]} as Run;
const step={id:'step',sequence:1,phase:'collect',state:'completed',started_at:null,finished_at:null,summary:{},usage:{ai:'unknown',input_tokens:null,output_tokens:null,actual_usd:null}};
const item={task_id:'task',id:'review',version:1,revision:'revision',scope:{geography_id:'05001',category:'opportunity',source_id:null,capability_id:null},name:'County bid website',location:'Arkansas County',category:'opportunity',title:'No verified website',impact:'This location has no verified website for this check.',check:{state:'source_missing',observed_at:null,last_success_at:null},decision:'unreviewed',previous_decision:null,checks_excluded:false,reviewed_at:null,responsibility:'Admin',allowed_actions:['provide_website','no_issue']};
const candidate={intake_id:'candidate',intake_hash:'hash',title:'Cleaning opportunity',state:'pending_review'};
const results={tasks:[],jobs:[],candidates:[candidate],total_candidates:1,next_offset:null};
const k={value:0,known_subtotal:0,completeness:'known'};
const report={as_of:'2026-10-22T14:00:00Z',coverage:{verified_identity_runs:1,total_runs:1,first_run:null,last_run:null},summary:{unique_leads:k,outcomes:{added:k,updated:k,unchanged:k},categories:{forecast:k,opportunity:k,award:k},candidates_attention:k}} as AnalyticsReport;
function fixture(section:ScheduleSection='overview',initial:AnySchedule=base,selected?:string){
 function Fixture(){const [tab,setTab]=useState<ScheduleSection>(section),[selection,setSelection]=useState(selected);return <ScheduleDetail id="schedule" initial={initial} owner="owner" section={tab} onSection={setTab} selectedRunId={selection} onSelectedRun={setSelection} onClose={()=>{}} onView={()=>{}} onViewLeads={()=>{}} onEdit={()=>{}} onAction={()=>{}} busy={false}/>;}
 return render(<Fixture/>);
}
function tab(name:string){
 if(name==='Logs'){const d=screen.getByText('Technical details for the selected run').closest('details')!;d.open=true;fireEvent(d,new Event('toggle'));return;}
 if(name==='Sources'||name==='Results'){const d=screen.getByText('Technical details for the selected run').closest('details')!;d.open=false;fireEvent(d,new Event('toggle'));}
 fireEvent.click(within(screen.getByRole('tablist',{name:'Schedule sections'})).getByRole('tab',{name:name==='Overview'?'Results':name==='History'?'Schedule changes':name}));
}
beforeEach(()=>{sessionStorage.clear();mock.request.mockReset();mock.request.mockImplementation(async(path:string)=>{
 if(path==='/v1/schedules/schedule')return base;
 if(path.includes('/source-status'))return {items:[item]};
 if(path.includes('/source-resolution/'))return {item,reason:'',website:'',verification:null,can_reenable:false,impact:{scope:'Arkansas County · opportunity',schedules:[],explanation:'Other source checks continue.'},preview_token:'preview',history:[],more_history:false};
 if(path.includes('/schedule/sources'))return {items:[],gaps:[],more_gaps:false,next_offset:null};
 if(path.startsWith('/v1/admin/analytics'))return report;
 if(path.includes('/activity'))return {items:[{id:'run:'+run.id,kind:'run',activity_at:run.created_at,run}],next_offset:null,total:1};
 if(path.startsWith('/v1/admin/history'))return {items:[run],next_offset:null,total:1};
 if(path.includes('/steps'))return {items:[step],next_cursor:null};
 if(path.startsWith('/v1/triggers/'))return {...run,id:path.split('/').at(-1)};
 if(path.startsWith('/v1/sam/'))return {category:'opportunity',run_ids:[],captures:[],candidates:[],records:0,partial:false,automatic:{verified:true,added:0,updated:0,unchanged:0,exclusions:[]}};
 if(path.startsWith('/v1/requests/'))return results;
 return {items:[],next_offset:null};
 });});
afterEach(cleanup);
it.each(['county_scope','state_source','sam'])('shows actual selected logs and evidence for %s without repeated run tables',async(kind)=>{
 const original=mock.request.getMockImplementation()!;
 const current={...base,config:{...base.config,target_kind:kind}} as AnySchedule;
 mock.request.mockImplementation((p,o)=>p==='/v1/schedules/schedule'?Promise.resolve(current):p.startsWith('/v1/triggers/')&&!p.includes('/steps')?Promise.resolve({...run,target_kind:kind,config:current.config}):original(p,o));
 fixture('overview',current);await screen.findByRole('region',{name:'Run results'});expect(screen.queryByRole('table',{name:'Saved execution history'})).toBeNull();
 tab('Logs');await screen.findByRole('table',{name:/Run step logs/});expect(screen.queryByRole('table',{name:'Saved execution history'})).toBeNull();expect(screen.queryByRole('navigation',{name:'Run sections'})).toBeNull();expect(screen.getAllByRole('columnheader')).toHaveLength(6);await screen.findByRole('button',{name:'Refresh schedule'});
 tab('Sources');await screen.findByText('County bid website');expect(screen.queryByRole('button',{name:'Refresh results'})).toBeNull();expect(screen.queryByRole('table',{name:'Saved execution history'})).toBeNull();await screen.findByRole('button',{name:'Refresh schedule'});expect(screen.getAllByRole('button',{name:'Refresh schedule'})).toHaveLength(1);expect(mock.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('keeps the chosen run and written review across tabs and a newer run arriving',async()=>{
 fixture('sources');fireEvent.click(await screen.findByRole('button',{name:/Review \/ repair/}));await screen.findByRole('heading',{name:'County bid website'});fireEvent.click(screen.getByLabelText('No issue'));fireEvent.change(screen.getByLabelText('Short reason'),{target:{value:'Keep my review'}});
 tab('Logs');await screen.findByText('Collect');tab('History');await screen.findByRole('heading',{name:'Schedule changes'});tab('Sources');expect(screen.getByLabelText('Short reason')).toHaveProperty('value','Keep my review');
 const original=mock.request.getMockImplementation()!;mock.request.mockImplementation((p,o)=>p.startsWith('/v1/admin/history')?Promise.resolve({items:[{...run,id:'newer',created_at:'2026-10-23T14:00:00Z'},run],next_offset:null}):original(p,o));
 fireEvent.click(await screen.findByRole('button',{name:'Refresh schedule'}));await screen.findByRole('option',{name:/Oct 23/});expect(screen.getByLabelText('Run')).toHaveProperty('value','newest');expect(screen.getByLabelText('Short reason')).toHaveProperty('value','Keep my review');
});
it('does not render foreign or missing run data and requires an explicit safe selection',async()=>{
 const original=mock.request.getMockImplementation()!;mock.request.mockImplementation((p,o)=>p.includes('run=foreign')?Promise.resolve({items:[],next_offset:null}):original(p,o));fixture('logs',base,'foreign');
 await screen.findByText(/Selected run is unavailable for this schedule/);expect(screen.queryByRole('table',{name:/Run step logs/})).toBeNull();expect(mock.request.mock.calls.some(([p])=>p.includes('/v1/triggers/foreign'))).toBe(false);
 fireEvent.change(screen.getByLabelText('Run'),{target:{value:'newest'}});await screen.findByText('Collect');
});
it('offers no fabricated selector for a never-run schedule',async()=>{
 const original=mock.request.getMockImplementation()!;mock.request.mockImplementation((p,o)=>p.startsWith('/v1/admin/history')?Promise.resolve({items:[],next_offset:null}):original(p,o));fixture('logs');await screen.findByText('No runs yet.');expect(screen.queryByLabelText('Run')).toBeNull();expect(screen.queryByRole('table',{name:/Run step logs/})).toBeNull();
});
it('keeps configuration history separate from execution attempts and retries only failed audit reads',async()=>{
 const original=mock.request.getMockImplementation()!;let fail=true;
 mock.request.mockImplementation((p,o)=>p.includes('/events')?fail?Promise.reject(Error('private error')):Promise.resolve({items:[{id:'e',action:'pause',version:3,at:run.created_at}],next_offset:null}):original(p,o));
 fixture('history');await screen.findByRole('button',{name:'Retry schedule'});expect(mock.request.mock.calls.some(([p])=>p.includes('/occurrences'))).toBe(false);
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry schedule'}));await screen.findByText('Pause');expect(screen.queryByText('private error')).toBeNull();
 tab('Overview');fireEvent.click(await screen.findByText('Recent run attempts'));await screen.findByRole('table',{name:'Saved execution history'});expect(screen.queryByText('Execution attempts and skipped runs')).toBeNull();
});
it('selects older paged runs and restores the owner-scoped selected identity after remount',async()=>{
 const original=mock.request.getMockImplementation()!;
 mock.request.mockImplementation((p,o)=>p.startsWith('/v1/admin/history')?Promise.resolve({items:p.includes('offset=50')?[{...run,id:'older',created_at:'2026-10-20T14:00:00Z'}]:[run],next_offset:p.includes('offset=50')?null:50}):original(p,o));
 const mounted=fixture('logs');await screen.findByText('Collect');fireEvent.click(screen.getByRole('button',{name:'More run choices'}));await screen.findByRole('option',{name:/Oct 20/});fireEvent.change(screen.getByLabelText('Run'),{target:{value:'older'}});await waitFor(()=>expect(sessionStorage.getItem('spin-admin-schedule-run:owner:schedule')).toBe('older'));
 mounted.unmount();fixture('sources');await screen.findByLabelText('Run');await waitFor(()=>expect(screen.getByLabelText('Run')).toHaveProperty('value','older'));expect(screen.queryByText(/Selected run is unavailable/)).toBeNull();
});
it('aborts a late selected run response instead of showing evidence for an earlier choice',async()=>{
 const original=mock.request.getMockImplementation()!;let resolve!:(r:Run)=>void;
 mock.request.mockImplementation((p,o)=>p.startsWith('/v1/admin/history')?Promise.resolve({items:[run,{...run,id:'older'}],next_offset:null}):p==='/v1/triggers/newest'?new Promise(r=>{resolve=r;}):original(p,o));
 fixture('logs');await screen.findByLabelText('Run');await waitFor(()=>expect(resolve).toBeTypeOf('function'));fireEvent.change(screen.getByLabelText('Run'),{target:{value:'older'}});await waitFor(()=>expect(mock.request.mock.calls.some(([p])=>p==='/v1/triggers/older')).toBe(true));await screen.findByText('Collect');await act(async()=>resolve(run));expect(screen.getByLabelText('Run')).toHaveProperty('value','older');
});

it('uses selected results without loading all-time totals or hidden technical reports',async()=>{
 fixture();await screen.findByRole('region',{name:'Run results'});expect(mock.request.mock.calls.some(([p])=>p.startsWith('/v1/admin/analytics')||p.includes('/steps')||p.startsWith('/v1/requests/'))).toBe(false);
});
it('retries a failed run-choice page while keeping the selected run logs',async()=>{
 const original=mock.request.getMockImplementation()!;let fail=true;mock.request.mockImplementation((p,o)=>p.startsWith('/v1/admin/history')?p.includes('offset=50')?fail?Promise.reject(Error('Page unavailable')):Promise.resolve({items:[{...run,id:'older'}],next_offset:null}):Promise.resolve({items:[run],next_offset:50}):original(p,o));
 fixture('logs');await screen.findByText('Collect');fireEvent.click(screen.getByRole('button',{name:'More run choices'}));await screen.findByRole('button',{name:'Retry schedule'});const reads=mock.request.mock.calls.filter(([p])=>p.includes('/steps')).length;
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry schedule'}));await waitFor(()=>expect(screen.getByLabelText('Run').querySelectorAll('option')).toHaveLength(3));await screen.findByRole('button',{name:'Refresh schedule'});expect(screen.getByLabelText('Run')).toHaveProperty('value','newest');expect(mock.request.mock.calls.filter(([p])=>p.includes('/steps'))).toHaveLength(reads);expect(sessionStorage.getItem('spin-admin-schedule-runs-page:owner:schedule')).toBe('100');
});
it('keeps saved evidence on a result refresh failure and retries results without reloading logs',async()=>{
 const original=mock.request.getMockImplementation()!;let fail=false;mock.request.mockImplementation((p,o)=>fail&&p.startsWith('/v1/requests/')?Promise.reject(Error('Unavailable')):original(p,o));
 fixture('sources');await screen.findByText('County bid website');fail=true;fireEvent.click(screen.getByRole('button',{name:'Refresh source status'}));await screen.findByRole('button',{name:'Retry source status'});expect(screen.getByText('County bid website')).toBeTruthy();const reads=mock.request.mock.calls.filter(([p])=>p.startsWith('/v1/triggers/')).length;
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry source status'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Retry source status'})).toBeNull());expect(mock.request.mock.calls.filter(([p])=>p.startsWith('/v1/triggers/'))).toHaveLength(reads);
});
it('does not display a status response that belongs to a different schedule',async()=>{
 const original=mock.request.getMockImplementation()!;mock.request.mockImplementation((p,o)=>p==='/v1/triggers/newest'?Promise.resolve({...run,schedule_id:'foreign'}):original(p,o));fixture('sources');await screen.findByText(/Selected run does not belong/);expect(screen.queryByRole('region',{name:'Saved results'})).toBeNull();expect(screen.queryByRole('table',{name:/Run step logs/})).toBeNull();expect(mock.request.mock.calls.some(([p])=>p.startsWith('/v1/requests/'))).toBe(false);
});
it('loads source evidence only when Sources is opened and retains it when returning from Logs',async()=>{
 fixture('logs');await screen.findByText('Collect');expect(mock.request.mock.calls.some(([p])=>p.startsWith('/v1/requests/'))).toBe(false);tab('Sources');await screen.findByText('County bid website');tab('Logs');tab('Sources');expect(screen.getByText('County bid website')).toBeTruthy();
});
it('keeps grouped state-source children independent within one selected schedule run',async()=>{
 const original=mock.request.getMockImplementation()!;const config={...initialDraft().config,target_kind:'state_source' as const,state_sources:[{id:'a',source_id:'a',name:'State source A',category:'opportunity' as const,county_ids:['05119']},{id:'b',source_id:'b',name:'State source B',category:'opportunity' as const,county_ids:['05119']}]};
 const grouped={...base,config};mock.request.mockImplementation((p,o)=>p==='/v1/schedules/schedule'?Promise.resolve(grouped):p==='/v1/triggers/newest'?Promise.resolve({...run,target_kind:'state_source',config,children:[{request_id:'a',county_id:'05119',role:'state',source_name:'State source A'},{request_id:'b',county_id:'05119',role:'state',source_name:'State source B'}]}):original(p,o));
 fixture('sources',grouped);await screen.findByLabelText('County/source results');fireEvent.change(screen.getByLabelText('County/source results'),{target:{value:'b'}});await waitFor(()=>expect(mock.request.mock.calls.some(([p])=>p==='/v1/requests/b/source-status')).toBe(true));tab('Logs');tab('Sources');expect(screen.getByLabelText('County/source results')).toHaveProperty('value','b');expect(screen.getByLabelText('Run')).toHaveProperty('value','newest');expect(mock.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});

it('keeps one working lead navigation action when embedded automatic results also offer it',async()=>{
 const original=mock.request.getMockImplementation()!;mock.request.mockImplementation((p,o)=>p.endsWith('/source-status')?Promise.resolve({items:[item]}):p.startsWith('/v1/requests/')?Promise.resolve({...results,automatic_county:true,automatic_import:{state:'verified',verified:true,added:1,updated:0,unchanged:0,exclusions:[]}}):original(p,o));fixture('sources');await screen.findByRole('button',{name:'View leads'});expect(screen.getAllByRole('button',{name:'View leads'})).toHaveLength(1);expect(screen.queryByRole('checkbox')).toBeNull();
});
