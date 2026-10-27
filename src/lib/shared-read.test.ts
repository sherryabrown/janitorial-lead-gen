import {expect,it,vi} from 'vitest';
import {sharedRead} from './shared-read';
it('shares only concurrent reads and isolates mutable consumer results',async()=>{
 let resolve!:(value:{items:number[]})=>void;
 const load=vi.fn(()=>new Promise<{items:number[]}>(r=>{resolve=r;}));
 const a=sharedRead('same',undefined,load),b=sharedRead('same',undefined,load);
 await Promise.resolve();expect(load).toHaveBeenCalledOnce();resolve({items:[1]});
 const [first,second]=await Promise.all([a,b]);first.items.push(2);expect(second.items).toEqual([1]);
 const next=sharedRead('same',undefined,load);await Promise.resolve();expect(load).toHaveBeenCalledTimes(2);resolve({items:[]});await next;
});
it('one subscriber abort does not cancel other subscribers, but the last abort cancels transport',async()=>{
 let resolve!:(v:string)=>void,signal!:AbortSignal;
 const load=(s:AbortSignal)=>{signal=s;return new Promise<string>(r=>{resolve=r;});};
 const one=new AbortController(),two=new AbortController();
 const a=sharedRead('cancel',one.signal,load),b=sharedRead('cancel',two.signal,load);
 await Promise.resolve();one.abort();await expect(a).rejects.toMatchObject({name:'AbortError'});expect(signal.aborted).toBe(false);resolve('saved');expect(await b).toBe('saved');
 const last=new AbortController(),c=sharedRead('last',last.signal,load);await Promise.resolve();last.abort();await expect(c).rejects.toMatchObject({name:'AbortError'});expect(signal.aborted).toBe(true);
});
it('never shares reads across session keys and clears failures for retry',async()=>{
 const load=vi.fn().mockRejectedValue(Error('Unavailable'));
 await Promise.allSettled([sharedRead('owner-a/path',undefined,load),sharedRead('owner-b/path',undefined,load)]);expect(load).toHaveBeenCalledTimes(2);
 load.mockResolvedValue('recovered');expect(await sharedRead('owner-a/path',undefined,load)).toBe('recovered');
});
