import {useState} from 'react';
import {ActionMenu,type MenuAction} from '../shared/components/ActionMenu';
import type {AnySchedule} from './types';
// eslint-disable-next-line react-refresh/only-export-components
export function scheduleDisableActions(s:AnySchedule,busy:boolean,onAction:(s:AnySchedule,a:string)=>void):MenuAction[]{
 return [
  {label:'Pause',disabled:busy||!s.enabled,onSelect:()=>onAction(s,'pause')},
  {label:'Archive',disabled:busy,onSelect:()=>onAction(s,'archive')},
  {label:'Delete',disabled:busy||s.can_delete!==true,title:s.can_delete?'Delete this never-run schedule':'This schedule has run or eligibility is unavailable. Archive it to keep its history.',onSelect:()=>{if(window.confirm(`Delete ${s.name}? This never-run schedule will be removed; audit history is retained.`))onAction(s,'delete');}},
 ];
}
export function ScheduleDisable({schedule,busy,onAction}:{schedule:AnySchedule;busy:boolean;onAction:(s:AnySchedule,a:string)=>void}){
 const [open,setOpen]=useState(false);
 return <ActionMenu text="Disable" label={`Disable ${schedule.name}`} open={open} onOpenChange={setOpen} actions={scheduleDisableActions(schedule,busy,onAction)}/>;
}
