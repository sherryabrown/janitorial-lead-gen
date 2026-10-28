import {renderAdmin as render} from '../../../tests/helpers/render-admin';
// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,renderHook,screen} from '@testing-library/react';
import {RunDetail} from './RunDetail';
import {RequestReview} from './RequestReview';
import {useRunLogs} from './use-run-logs';
import type {Run,Step} from './types';
const mock=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mock.request,mutationKey:()=> 'key',acknowledged:()=>{}}));
const run={id:'run',state:'running',children:[],config:{county_ids:[]},created_at:'2026-10-20T12:00:00Z'} as unknown as Run;
const step=(sequence:number,finished=true)=>({id:`step-${sequence}`,sequence,phase:'collect',state:finished?'completed':'running',started_at:'2026-10-20T12:00:00Z',finished_at:finished?'2026-10-20T12:00:01Z':null,summary:{},usage:{ai:'not_used',input_tokens:0,output_tokens:0,actual_usd:0}} as Step);
beforeEach(()=>{mock.request.mockReset();sessionStorage.clear();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

it('publishes logs before a slow standalone status report and does not load unvisited results',async()=>{
 let resolve!:(r:Run)=>void;
 mock.request.mockImplementation((p:string)=>p.includes('/steps')?Promise.resolve({items:[step(1)],next_cursor:null}):new Promise<Run>(r=>{resolve=r;}));
 render(<RunDetail id="run" owner="owner" section="logs" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/>);
 await screen.findByText('Collect');expect(mock.request.mock.calls.some(([p])=>p.startsWith('/v1/requests'))).toBe(false);
 await act(async()=>resolve({...run,state:'completed'}));
});
it('keeps loaded log pages and refreshes mutable steps without replaying the first page',async()=>{
 vi.useFakeTimers();let finished=false;
 mock.request.mockImplementation(async(p:string)=>{
  if(p.includes('sequences='))return {items:[step(1,finished)],next_cursor:null};
  if(p.includes('cursor=50'))return {items:[step(51)],next_cursor:null};
  if(p.includes('cursor=51'))return {items:[],next_cursor:null};
  return {items:Array.from({length:50},(_,n)=>step(n+1,n!==0)),next_cursor:'50'};
 });
 const {result,rerender}=renderHook(({active})=>useRunLogs('run','owner',active,'running'),{initialProps:{active:true}});
 await act(async()=>{});await act(async()=>result.current.more());expect(result.current.steps).toHaveLength(51);
 finished=true;await act(()=>vi.advanceTimersByTimeAsync(2500));expect(result.current.steps[0].state).toBe('completed');
 expect(mock.request.mock.calls.filter(([p])=>p==='/v1/triggers/run/steps')).toHaveLength(1);
 const depth=mock.request.mock.calls.filter(([p])=>p.includes('cursor=50')).length;
 rerender({active:false});const count=mock.request.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(60000));expect(mock.request).toHaveBeenCalledTimes(count);
 rerender({active:true});await act(async()=>{});expect(result.current.steps).toHaveLength(51);expect(mock.request.mock.calls.filter(([p])=>p.includes('cursor=50'))).toHaveLength(depth);
});
it('suspends standalone polling for inactive workspace and hidden browser document',async()=>{
 vi.useFakeTimers();const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false);
 mock.request.mockImplementation(async(p:string)=>p.includes('/steps')?{items:[],next_cursor:null}:run);
 const props={id:'run',owner:'owner',onClose:()=>{},onViewLeads:()=>{},onSource:()=>{},changed:()=>{}};
 const {rerender}=render(<RunDetail {...props} active/>);await act(async()=>{});
 rerender(<RunDetail {...props} active={false}/>);const count=mock.request.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(60000));expect(mock.request).toHaveBeenCalledTimes(count);
 rerender(<RunDetail {...props} active/>);await act(async()=>{});expect(mock.request).toHaveBeenCalledTimes(count+1);
 hidden.mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));const hiddenCount=mock.request.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(60000));expect(mock.request).toHaveBeenCalledTimes(hiddenCount);
 hidden.mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));await act(async()=>{});expect(mock.request).toHaveBeenCalledTimes(hiddenCount+1);
});
it('aborts in-flight logs and rejects late responses when the workspace becomes inactive',async()=>{
 let resolve!:(value:{items:Step[];next_cursor:null})=>void,signal!:AbortSignal;
 mock.request.mockImplementation((_p:string,o:{signal:AbortSignal})=>{signal=o.signal;return new Promise(r=>{resolve=r;});});
 const {result,rerender}=renderHook(({active})=>useRunLogs('run','owner',active),{initialProps:{active:true}});
 rerender({active:false});expect(signal.aborted).toBe(true);await act(async()=>resolve({items:[step(1)],next_cursor:null}));expect(result.current.steps).toHaveLength(0);
});
it('keeps review notes while stopping hidden import polling and resumes on return',async()=>{
 vi.useFakeTimers();mock.request.mockImplementation(async(p:string)=>p.startsWith('/v1/imports')?{job_id:'job',state:'running'}:{jobs:[{id:'job',stage:'import_apply'}],tasks:[],candidates:[{intake_id:'candidate',intake_hash:'hash',title:'Cleaning opportunity',state:'pending_review'}],next_offset:null});
 const props={id:'request',owner:'owner',onViewLeads:()=>{}};
 const {rerender}=render(<RequestReview {...props}/>);await act(async()=>{});
 fireEvent.click(screen.getByRole('checkbox',{name:/Cleaning opportunity/}));fireEvent.change(screen.getByLabelText('Reason for processing reviewed candidates'),{target:{value:'Keep my review'}});
 rerender(<RequestReview {...props} active={false}/>);const count=mock.request.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(60000));expect(mock.request).toHaveBeenCalledTimes(count);
 rerender(<RequestReview {...props} active/>);await act(async()=>{});expect(screen.getByLabelText('Reason for processing reviewed candidates')).toHaveProperty('value','Keep my review');
 expect(mock.request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('retries only the failed log page without reloading status or earlier pages',async()=>{
 let fail=true;
 mock.request.mockImplementation(async(p:string)=>p.includes('cursor=1')?fail?Promise.reject(Error('Unavailable')):{items:[step(2)],next_cursor:null}:{items:[step(1)],next_cursor:'1'});
 const {result}=renderHook(()=>useRunLogs('run','owner',true));await act(async()=>{});await act(async()=>result.current.more());expect(result.current.error).toBeTruthy();fail=false;
 await act(async()=>result.current.refresh());await act(async()=>{});expect(result.current.steps).toHaveLength(2);expect(mock.request.mock.calls.filter(([p])=>p.endsWith('/steps'))).toHaveLength(1);
});
it('keeps hidden log failures out of the Sources retry control',async()=>{
 mock.request.mockImplementation(async(p:string)=>{
  if(p.includes('/steps'))throw Error('Logs unavailable');
  if(p.startsWith('/v1/requests/'))return {jobs:[],tasks:[],candidates:[],next_offset:null};
  return {...run,state:'completed',children:[{request_id:'request'}]};
 });
 const props={id:'run',owner:'owner',onClose:()=>{},onViewLeads:()=>{},onSource:()=>{},changed:()=>{}};
 const {rerender}=render(<RunDetail {...props} section="logs"/>);await screen.findByRole('button',{name:'Retry run'});
 rerender(<RunDetail {...props} section="sources"/>);await screen.findByRole('button',{name:'Refresh run'});
 const count=mock.request.mock.calls.filter(([p])=>p.includes('/steps')).length;
 fireEvent.click(screen.getByRole('button',{name:'Refresh run'}));await screen.findByRole('button',{name:'Refresh run'});
 expect(mock.request.mock.calls.filter(([p])=>p.includes('/steps'))).toHaveLength(count);
});
it('replaces old terminal presentation after a progress poll settles',async()=>{
 vi.useFakeTimers();let poll=0;
 mock.request.mockImplementation(async(p:string)=>p.includes('projection=progress')?++poll===1?{...run,progress_only:true}:{...run,state:'completed'}:{...run,presentation:{outcome:'source_attention',attention_count:2}});
 render(<RunDetail id="run" owner="owner" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/>);await act(async()=>{});
 await act(()=>vi.advanceTimersByTimeAsync(2500));await act(()=>vi.advanceTimersByTimeAsync(3750));
 fireEvent.click(screen.getByText('Run attributes'));expect(screen.queryByText('2 · View saved source checks')).toBeNull();
});
it('restores the saved log depth after a later restoration page fails',async()=>{
 sessionStorage.setItem('spin-admin-log-page:owner:run','100');let fail=true;
 mock.request.mockImplementation(async(p:string)=>p.includes('cursor=50')?fail?Promise.reject(Error('Unavailable')):{items:Array.from({length:50},(_,n)=>step(n+51)),next_cursor:null}:{items:Array.from({length:50},(_,n)=>step(n+1)),next_cursor:'50'});
 const {result}=renderHook(()=>useRunLogs('run','owner',true));await act(async()=>{});expect(result.current.steps).toHaveLength(50);expect(result.current.error).toBeTruthy();
 fail=false;await act(async()=>result.current.refresh());await act(async()=>{});expect(result.current.steps).toHaveLength(100);expect(result.current.cursor).toBeNull();
});
