import {useEffect,useRef,useState} from 'react';
import {workflowRequest} from '../../lib/procurement-workflow';
import {activeRun,readFailure} from './model';
import type {Step} from './types';
type Logs={items:Step[];next_cursor:string|null};
function savedDepth(owner:string,id:string){
 try{const n=Number(sessionStorage.getItem(`spin-admin-log-page:${owner}:${id}`));return Number.isInteger(n)&&n>0&&n<=5000?n:0;}catch{return 0;}
}
export function useRunLogs(id:string,owner:string,active:boolean,state?:string){
 const [steps,setSteps]=useState<Step[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const saved=useRef<Logs|null>(null),identity=useRef(''),depth=useRef(0),generation=useRef(0),controller=useRef<AbortController|null>(null),pending=useRef(false),failedPage=useRef(false),fullRead=useRef(false);
 const merge=(next:Step[])=>{
  const items=[...new Map([...(saved.current?.items??[]),...next].map(s=>[s.id,s])).values()].sort((a,b)=>a.sequence-b.sequence);
  saved.current={items,next_cursor:saved.current?.next_cursor??null};setSteps(items);
 };
 useEffect(()=>{
  if(identity.current!==`${owner}:${id}`){identity.current=`${owner}:${id}`;depth.current=savedDepth(owner,id);saved.current=null;setSteps([]);setCursor(null);setError('');failedPage.current=false;fullRead.current=false;}
  if(!active){setBusy(false);return;}
  const abort=new AbortController(),epoch=++generation.current;controller.current=abort;
  let timer:ReturnType<typeof setTimeout>,delay=2500;
  const read=(query='')=>workflowRequest<Logs>(`/v1/triggers/${id}/steps${query}`,{signal:abort.signal});
  const load=async()=>{
   if(pending.current){timer=setTimeout(()=>void load(),delay);return;}
   pending.current=true;setBusy(true);
   try{
    if(!saved.current||fullRead.current){
     const target=Math.max(saved.current?.items.length??0,depth.current);
     const page:Logs={items:[],next_cursor:null};
     do{const next=await read(page.next_cursor?`?cursor=${page.next_cursor}`:'');if(abort.signal.aborted)return;page.items.push(...next.items);page.next_cursor=next.next_cursor;
      // First-page logs should be visible even while restoring later pages.
      merge(next.items);saved.current!.next_cursor=next.next_cursor;setCursor(next.next_cursor);
     }while(page.next_cursor&&page.items.length<target);
     fullRead.current=false;
    }else{
     // Existing steps are mutable until finished. Refresh only those identities,
     // then append new records without replaying immutable pages.
     const mutable=saved.current.items.filter(s=>!s.finished_at&&['started','running'].includes(s.state)||s.usage?.ai==='unknown');
     for(let i=0;i<mutable.length;i+=50){const page=await read(`?sequences=${mutable.slice(i,i+50).map(s=>s.sequence).join(',')}`);if(abort.signal.aborted)return;merge(page.items);}
     if(saved.current.next_cursor===null){const last=saved.current.items.at(-1)?.sequence;const page=await read(last?`?cursor=${last}`:'');if(abort.signal.aborted)return;merge(page.items);saved.current.next_cursor=page.next_cursor;setCursor(page.next_cursor);}
    }
    if(!failedPage.current)setError('');
   }catch(e){if(!abort.signal.aborted){setError(readFailure(e,'Step logs'));if((e as {code?:string}).code==='SESSION')return;}}
   finally{if(!abort.signal.aborted){pending.current=false;setBusy(false);}}
   if(!abort.signal.aborted&&state&&activeRun(state)){timer=setTimeout(()=>void load(),delay);delay=Math.min(delay*1.5,15000);}
  };
  void load();
  return()=>{generation.current=epoch+1;abort.abort();clearTimeout(timer);pending.current=false;};
 },[id,owner,active,state,revision]);
 const more=async()=>{
  if(!saved.current?.next_cursor||pending.current||!active)return;
  const epoch=generation.current;pending.current=true;setBusy(true);
  try{
   const page=await workflowRequest<Logs>(`/v1/triggers/${id}/steps?cursor=${saved.current.next_cursor}`,{signal:controller.current?.signal});
   if(epoch!==generation.current)return;
   merge(page.items);saved.current!.next_cursor=page.next_cursor;setCursor(page.next_cursor);failedPage.current=false;setError('');
   try{sessionStorage.setItem(`spin-admin-log-page:${owner}:${id}`,String(saved.current!.items.length));}catch{/* Mounted pages remain. */}
  }catch(e){if(epoch===generation.current){failedPage.current=true;setError(readFailure(e,'More step logs'));}}
  finally{if(epoch===generation.current){pending.current=false;setBusy(false);}}
 };
 const refresh=()=>{if(failedPage.current)void more();else{fullRead.current=true;setRevision(n=>n+1);}};
 return {steps,cursor,busy,error,more,refresh};
}
