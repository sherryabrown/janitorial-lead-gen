// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {schedulingRead,type SchedulingRead} from './scheduling-reads';
const mocks=vi.hoisted(()=>({getSession:vi.fn(),rpc:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{auth:{getSession:mocks.getSession},rpc:mocks.rpc}}));
beforeEach(()=>{
 mocks.getSession.mockReset().mockResolvedValue({data:{session:{access_token:'test-session'}}});mocks.rpc.mockReset().mockReturnValue({abortSignal:async()=>({data:{items:[]},error:null})});
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Render is unavailable');}));
});
afterEach(()=>vi.unstubAllGlobals());
it('uses only explicit Supabase RPCs for every saved contract with Render unavailable',async()=>{
 const operations:SchedulingRead[]=['capabilities','schedules','schedule','history','run','steps','events','occurrences','activity','counties','state_sources','scheduler_status','analytics','metric_members','source_status','source_setup'];
 for(const operation of operations)await schedulingRead(operation,{id:'saved-id',filters:{offset:0}});
 expect(mocks.rpc).toHaveBeenCalledTimes(operations.length);expect(mocks.rpc.mock.calls[0]).toEqual(['procurement_capabilities']);
 for(let i=1;i<operations.length;i++)expect(mocks.rpc.mock.calls[i]).toEqual(['procurement_scheduling_read',{p_read:operations[i],p_id:'saved-id',p_filters:{offset:0}}]);
 expect(globalThis.fetch).not.toHaveBeenCalled();
 await expect(schedulingRead('private_table' as SchedulingRead)).rejects.toMatchObject({code:'READ'});
});
it('shares in-flight reads, isolates results, and does not cancel another subscriber',async()=>{
 let complete!:(value:unknown)=>void;let signal!:AbortSignal;
 mocks.rpc.mockReturnValue({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise(resolve=>{complete=resolve;});}});
 const abort=new AbortController();
 const one=schedulingRead<{items:number[]}>('schedules',{signal:abort.signal}),two=schedulingRead<{items:number[]}>('schedules');
 await vi.waitFor(()=>expect(mocks.rpc).toHaveBeenCalledOnce());const cancelled=expect(one).rejects.toMatchObject({name:'AbortError'});abort.abort();await cancelled;expect(signal.aborted).toBe(false);
 complete({data:{items:[1]},error:null});expect(await two).toEqual({items:[1]});
 const third=schedulingRead('schedules');await vi.waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(2));complete({data:{items:[]},error:null});await third;
});
it('fails closed, sanitizes database errors and isolates changed sessions',async()=>{
 mocks.getSession.mockResolvedValueOnce({data:{session:null}});await expect(schedulingRead('schedules')).rejects.toMatchObject({code:'SESSION'});expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockReturnValue({abortSignal:async()=>({error:{code:'42501',message:'private diagnostic'}})});await expect(schedulingRead('steps')).rejects.toMatchObject({code:'SESSION'});
 mocks.rpc.mockReturnValue({abortSignal:async()=>({error:{code:'XX000',message:'private diagnostic'}})});await expect(schedulingRead('schedules')).rejects.toThrow('Saved scheduling data could not load');
 let complete!:(value:unknown)=>void;
 mocks.rpc.mockReturnValue({abortSignal:()=>new Promise(resolve=>{complete=resolve;})});
 const first=schedulingRead('schedules');await vi.waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(3));const finishFirst=complete;
 mocks.getSession.mockResolvedValue({data:{session:{access_token:'other-session'}}});const second=schedulingRead('schedules');await vi.waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(4));
 finishFirst({data:{items:[]},error:null});complete({data:{items:[]},error:null});await Promise.all([first,second]);
});
