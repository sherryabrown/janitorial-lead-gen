import {adminViewLabels,type AdminContext} from './navigation';
import type {Crumb} from './breadcrumb-context';
import type {Run} from './types';
export function runBreadcrumbs(origin:AdminContext,run:Run|null,navigate?: (context:AdminContext)=>void):Crumb[]{
 const root=(view:AdminContext['view'])=>()=>navigate?.({view,returnTo:'contracts'});
 const path:Crumb[]=[{label:'Settings',onClick:root('schedules')},{label:adminViewLabels[origin.view],onClick:root(origin.view)}];
 // URL/session scope alone cannot establish membership in a saved schedule.
 if(origin.view==='schedules'&&origin.scheduleId&&run?.schedule_id===origin.scheduleId){
  const back=()=>navigate?.({...origin,runId:undefined,runSection:undefined,issueRequestId:undefined,section:'overview'});
  path.push({label:run.schedule_name??origin.scheduleId,onClick:back},{label:'Runs',onClick:back});
 }else if(origin.view==='schedules'&&origin.section==='manual'){
  path.push({label:'Manual runs',onClick:()=>navigate?.({...origin,runId:undefined,runSection:undefined,issueRequestId:undefined})});
 }
 return path;
}
