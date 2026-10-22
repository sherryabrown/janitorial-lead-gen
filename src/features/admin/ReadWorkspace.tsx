import {useCallback,useContext,useMemo,useState,type ReactNode} from 'react';
import {ReadOwnerContext,type OwnedRead} from './read-owner';
import {ReadAction} from './ReadAction';
export function ReadWorkspace({children}:{children:ReactNode}){
 const [records,setRecords]=useState<Record<string,OwnedRead>>({});
 const register=useCallback((key:string,value:OwnedRead|null)=>setRecords(old=>{if(!value){if(!(key in old))return old;const next={...old};delete next[key];return next;}return {...old,[key]:value};}),[]);
 const value=useMemo(()=>({records,register}),[records,register]);
 return <ReadOwnerContext.Provider value={value}>{children}</ReadOwnerContext.Provider>;
}
export function WorkspaceReadAction(){
 const owner=useContext(ReadOwnerContext),records=Object.values(owner?.records??{}),failed=records.filter(r=>r.error);
 return <ReadAction scope="schedule" busy={!records.length||records.some(r=>r.busy)} loaded={records.some(r=>r.loaded)} error={!!failed.length} onRead={()=>{for(const r of failed.length?failed:records)r.read();}}/>;
}
