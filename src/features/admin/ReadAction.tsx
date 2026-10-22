import {useEffect,useRef,useState} from 'react';
export function ReadAction({busy=false,error=false,loaded=false,onRead,scope}:{busy?:boolean;error?:boolean;loaded?:boolean;onRead:()=>void;scope:string}){
 const previousBusy=useRef(busy),[loadedAt,setLoadedAt]=useState('');
 useEffect(()=>{if(previousBusy.current&&!busy&&!error)setLoadedAt(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date()));previousBusy.current=busy;},[busy,error]);
 const label=busy?(loaded?'Refreshing…':'Loading…'):error?'Retry':'Refresh';
 return <div className="admin-read-toolbar"><small role="status">{busy?(loaded?'Updating saved view…':'Loading saved data…'):error?(loaded?'Saved view · update failed':'Saved data unavailable'):loaded&&loadedAt?`Last loaded ${loadedAt}`:'Saved data'}</small><button type="button" className="text-button" disabled={busy} aria-label={`${label} ${scope}`} onClick={onRead}>{label}</button></div>;
}
