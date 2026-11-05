// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SchedulingAccess} from './SchedulingRole';

const fetchMock=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})},rpc:(name:string)=>({abortSignal:(signal:AbortSignal)=>fetchMock(name,{signal}).then(async(response:Response)=>({data:await response.json(),error:null}))})}}));
const allowed={role:'user',manage_schedules:true,manage_sources:false,technical_details:false};
beforeEach(()=>{vi.useFakeTimers();fetchMock.mockReset();vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Render is unavailable');}));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
async function advance(ms:number){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});}
function deferredRead(){
 let resolve!:(response:Response)=>void;
 fetchMock.mockImplementationOnce((_url:string,{signal}:{signal:AbortSignal})=>new Promise<Response>((done,reject)=>{
  resolve=done;
  signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
 }));
 return (value=allowed)=>resolve(new Response(JSON.stringify(value)));
}

it('loads access through Supabase while Render is unavailable without overlapping focus checks',async()=>{
 const complete=deferredRead();
 render(<SchedulingAccess owner="owner"><p>Schedule workspace</p></SchedulingAccess>);
 await advance(0);expect(screen.getByRole('status').textContent).toBe('Checking scheduling access…');
 await advance(5000);expect(screen.getByRole('status').textContent).toContain('Loading saved scheduling access');
 fireEvent(window,new Event('focus'));await advance(15000);
 expect(fetchMock).toHaveBeenCalledTimes(1);expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.queryByRole('button',{name:'Retry access check'})).toBeNull();
 await act(async()=>complete());expect(screen.getByText('Schedule workspace')).toBeTruthy();expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('bounds startup waiting, reports connectivity, and recovers automatically',async()=>{
 deferredRead();fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(allowed)));
 render(<SchedulingAccess owner="owner"><p>Schedule workspace</p></SchedulingAccess>);
 await advance(29999);expect(screen.queryByRole('alert')).toBeNull();
 await advance(1);expect(screen.getByRole('alert').textContent).toContain('Unable to load scheduling access');
 expect(screen.getByRole('alert').textContent).not.toMatch(/permission/i);
 expect(screen.getByRole('button',{name:'Retry access check'})).toBeTruthy();
 await advance(30000);expect(screen.getByText('Schedule workspace')).toBeTruthy();
});

it('still denies access when the server confirms no scheduling permission',async()=>{
 fetchMock.mockResolvedValue(new Response(JSON.stringify({...allowed,manage_schedules:false})));
 render(<SchedulingAccess owner="owner"><p>Schedule workspace</p></SchedulingAccess>);
 await advance(0);expect(screen.getByRole('alert').textContent).toBe('Your account does not have scheduling access.');
 expect(screen.queryByText('Schedule workspace')).toBeNull();
});

it('cancels the startup request and timers when the workspace becomes inactive',async()=>{
 deferredRead();
 const view=render(<SchedulingAccess owner="owner"><p>Schedule workspace</p></SchedulingAccess>);
 await advance(0);
 const signal=fetchMock.mock.calls[0][1].signal as AbortSignal;
 view.rerender(<SchedulingAccess owner="owner" active={false}><p>Schedule workspace</p></SchedulingAccess>);
 await advance(120000);expect(signal.aborted).toBe(true);expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('alert')).toBeNull();
});
