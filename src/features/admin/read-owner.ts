import {createContext,useContext,useEffect,useRef} from 'react';
export type OwnedRead={busy:boolean;error:string;loaded:boolean;read:()=>void};
export const ReadOwnerContext=createContext<{records:Record<string,OwnedRead>;register:(key:string,value:OwnedRead|null)=>void}|null>(null);
// Scoped to the current schedule, not a data cache or application event bus.
export function useOwnedRead(key:string,state:Omit<OwnedRead,'read'>,read:()=>void,enabled=true){
 const owner=useContext(ReadOwnerContext),register=owner?.register,latest=useRef(read);latest.current=read;
 const {busy,error,loaded}=state;
 useEffect(()=>{if(!register||!enabled)return;register(key,{busy,error,loaded,read:()=>latest.current()});return()=>register(key,null);},[register,key,busy,error,loaded,enabled]);
 return !!owner;
}
