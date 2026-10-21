// @vitest-environment jsdom
import {useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {RunHistory} from './RunHistory';
import {ScheduleDetail,type ScheduleSection} from './ScheduleDetail';
import {ScheduleHistory} from './ScheduleHistory';
import {RunDetail} from './RunDetail';
import {initialDraft} from './model';
import {readAdminLocation,pushAdminLocation} from './navigation';
const mocked=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mocked.request,mutationKey:()=> 'key',acknowledged:()=>{}}));
const run={id:'run',target_kind:'county_scope',origin:'manual',state:'completed',created_at:'2026-10-20T12:00:00Z',config:{...initialDraft().config,county_ids:['05125']},children:[],leads:{added:0,updated:1,unchanged:2,completeness:'known'},timing:{created_at:'2026-10-20T12:00:00Z',finished_at:null,created_to_finished_ms:null,recorded_activity_ms:1000,completeness:'partial',basis:'Recorded intervals'}};
const schedule={...initialDraft(),id:'schedule',version:2,next_due_at:null,name:'Renamed county checks',archived:true,config:{...initialDraft().config,county_ids:['05125'],counties:[{id:'05125',name:'Saline County',city_ids:['benton'],cities:[{id:'benton',name:'Benton'}],selection_token:'version'}]},reporting:{as_of:'now',last_run:{...run,leads:run.leads}}};
beforeEach(()=>{sessionStorage.clear();window.history.replaceState({},'','/');mocked.request.mockReset();mocked.request.mockImplementation(async(path:string)=>path==='/v1/schedules/schedule'?schedule:{items:[],next_offset:null,total:0});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('filters full server history, paginates and ignores late pages after a filter change',async()=>{
 let resolvePage!:(value:unknown)=>void;
 mocked.request.mockImplementation(async(path:string)=>{
  if(path.includes('offset=50'))return new Promise(resolve=>{resolvePage=resolve;});
  if(path.includes('target=sam'))return {items:[],next_offset:null,total:0};
  return {items:Array.from({length:50},(_,n)=>({...run,id:`r${n}`})),next_offset:50,total:150};
 });
 render(<RunHistory scheduleId="schedule" onView={()=>{}}/>);
 await screen.findByText(/150 matching runs/);fireEvent.click(screen.getByRole('button',{name:'More runs'}));
 fireEvent.change(screen.getByLabelText('Run target'),{target:{value:'sam'}});await screen.findByText('No matching runs.');
 await act(async()=>resolvePage({items:[{...run,id:'stale',schedule_name:'Stale page'}],next_offset:null,total:150}));
 expect(screen.queryByText('Stale page')).toBeNull();expect(mocked.request.mock.calls.some(([p])=>p.includes('schedule=schedule')&&p.includes('target=sam'))).toBe(true);
});
it('preserves independent history panels and immutable occurrence scope when an endpoint fails',async()=>{
 mocked.request.mockImplementation(async(path:string)=>{if(path.endsWith('/events'))throw Error('private exception');return {items:[{id:'occ',state:'skipped',reason:'previous_run_active',due_at:run.created_at,version:1,config:{target_kind:'county_scope',county_ids:['05125'],counties:[{name:'Original saved scope'}]}}],next_offset:null};});
 render(<ScheduleHistory id="schedule" onView={()=>{}}/>);
 await screen.findByText('Skipped');expect(screen.getByText(/Loaded records remain available/)).toBeTruthy();
 fireEvent.click(screen.getByText('Occurrence snapshot · version 1'));expect(screen.getByText('Original saved scope')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'View run'})).toBeNull();expect(screen.queryByText('private exception')).toBeNull();
});
it('provides all detail sections, saved geography, honest metrics and archived controls',async()=>{
 const view=vi.fn();mocked.request.mockImplementation(async(path:string)=>path==='/v1/schedules/schedule'?schedule:{items:[run],next_offset:null,total:1});
 function Fixture(){const [section,setSection]=useState<ScheduleSection>('overview');return <ScheduleDetail id="schedule" initial={schedule} section={section} onSection={setSection} onClose={()=>{}} onView={view} onEdit={()=>{}} onAction={()=>{}} busy={false}/>;}
 render(<Fixture/>);await screen.findByRole('heading',{name:'Renamed county checks'});
 expect(screen.getByRole('button',{name:'Run now'})).toHaveProperty('disabled',true);
 const nav=screen.getByRole('tablist',{name:'Schedule sections'});
 fireEvent.click(within(nav).getByRole('tab',{name:'Related geography'}));expect(screen.getByText('Benton')).toBeTruthy();
 fireEvent.click(within(nav).getByRole('tab',{name:'Sources'}));expect(screen.getByRole('heading',{name:'Saved run evidence'})).toBeTruthy();
 fireEvent.click(within(nav).getByRole('tab',{name:'Logs'}));expect(screen.getByRole('heading',{name:'Run logs'})).toBeTruthy();
 await within(screen.getByRole('region',{name:'Schedule runs'})).findByRole('button',{name:'Sources'});fireEvent.click(within(screen.getByRole('region',{name:'Schedule runs'})).getByRole('button',{name:'Sources'}));expect(view).toHaveBeenCalledWith('run','sources');
 fireEvent.click(within(nav).getByRole('tab',{name:'Overview'}));expect(screen.getByRole('heading',{name:'Schedule settings'})).toBeTruthy();expect(screen.queryByText('Latest run · validated outcomes')).toBeNull();
});
it('keeps run progress visible when logs fail, retries reads and renders diagnostic references safely',async()=>{
 let failed=true;
 mocked.request.mockImplementation(async(path:string)=>{
  if(path.endsWith('/steps')){if(failed)throw Error('server trace');return {items:[{id:'step',sequence:1,phase:'compare',state:'failed',started_at:null,finished_at:null,source_name:'<script>unsafe()</script>',diagnostic_id:'reference-id',usage:{ai:'unknown',actual_usd:null,input_tokens:null,output_tokens:null}}],next_cursor:null};}
  return run;
 });
 render(<RunDetail id="run" owner="owner" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/>);
 await screen.findByRole('heading',{name:'Completed'});expect(screen.getByText(/Some run data could not load/)).toBeTruthy();
 failed=false;fireEvent.click(screen.getByRole('button',{name:'Refresh progress'}));fireEvent.click(screen.getByRole('button',{name:'Logs'}));
 await screen.findByText(/Diagnostic reference: reference-id/);expect(screen.getByText(/<script>unsafe/)).toBeTruthy();expect(document.querySelector('script')).toBeNull();
 expect(screen.getByText(/Finish unknown/)).toBeTruthy();expect(mocked.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('validates deep-link context and returns to earlier schedule/run/section through browser history',async()=>{
 pushAdminLocation('owner',{view:'schedules',scheduleId:'schedule',section:'history',returnTo:'contracts'});
 pushAdminLocation('owner',{view:'schedules',scheduleId:'schedule',section:'history',runId:'run',runSection:'sources',returnTo:'contracts'});
 expect(readAdminLocation('owner').runSection).toBe('sources');
 const back=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));window.history.back();await back;
 expect(readAdminLocation('owner').scheduleId).toBe('schedule');expect(readAdminLocation('owner').runId).toBeUndefined();
 window.history.replaceState({},'','/?adminView=schedules&adminRun=%3Cscript%3E');expect(readAdminLocation('owner').runId).toBeUndefined();
 await waitFor(()=>expect(readAdminLocation('owner').view).toBe('schedules'));
});
it('retains loaded logs when run metadata is unavailable without issuing mutations',async()=>{
 mocked.request.mockImplementation(async(path:string)=>{if(!path.endsWith('/steps'))throw Error('private metadata failure');return {items:[{id:'s',sequence:1,phase:'compare',state:'completed',started_at:'2026-10-20T12:00:00Z',finished_at:'2026-10-20T12:00:01Z',usage:{ai:'not_used',input_tokens:0,output_tokens:0,actual_usd:0},summary:{}}],next_cursor:null};});
 render(<RunDetail id="run" owner="owner" section="logs" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/>);
 await screen.findByText('Compare · Completed');expect(screen.getByRole('button',{name:'Retry progress'})).toBeTruthy();expect(screen.queryByText('private metadata failure')).toBeNull();
});
it('links a filtered global run history directly to saved occurrences/changes',async()=>{
 sessionStorage.setItem('spin-admin-history-filter:owner:all',JSON.stringify({schedule:'schedule'}));const onSchedule=vi.fn();
 render(<RunHistory owner="owner" onView={()=>{}} onSchedule={onSchedule}/>);
 fireEvent.click(await screen.findByRole('button',{name:'View schedule occurrences and changes'}));expect(onSchedule).toHaveBeenCalledWith('schedule');expect(mocked.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
