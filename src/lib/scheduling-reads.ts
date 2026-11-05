import {supabase} from './supabase';
import {sharedRead} from './shared-read';
import {WorkflowError} from './procurement-workflow';

export type SchedulingRead='capabilities'|'schedules'|'schedule'|'history'|'run'|'steps'|'events'|'occurrences'|'activity'|'counties'|'state_sources'|'scheduler_status'|'analytics'|'metric_members'|'source_status'|'source_setup';
type ReadOptions={id?:string;filters?:Record<string,string|number|boolean>;signal?:AbortSignal};
const reads=new Set<SchedulingRead>(['capabilities','schedules','schedule','history','run','steps','events','occurrences','activity','counties','state_sources','scheduler_status','analytics','metric_members','source_status','source_setup']);

// Explicit saved-read contracts only. Commands and independent workflow consoles
// continue to use procurement-workflow; there is no Render fallback here.
export async function schedulingRead<T>(operation:SchedulingRead,{id,filters={},signal}:ReadOptions={}):Promise<T>{
 if(!reads.has(operation))throw new WorkflowError('Saved read is unavailable.','READ');
 const client=supabase;
 if(!client)throw new WorkflowError('Sign in to view saved schedules.','SESSION');
 const {data,error}=await client.auth.getSession();
 const token=data.session?.access_token;
 if(error||!token)throw new WorkflowError('Your session expired. Sign in again; your draft is kept.','SESSION');
 const normalized=Object.fromEntries(Object.entries(filters).sort(([a],[b])=>a.localeCompare(b)));
 return sharedRead<T>(JSON.stringify(['scheduling',token,operation,id??null,normalized]),signal,async sharedSignal=>{
  const controller=new AbortController(),abort=()=>controller.abort();
  sharedSignal.addEventListener('abort',abort,{once:true});if(sharedSignal.aborted)abort();
  const timer=setTimeout(abort,30000);
  try{
   const response=operation==='capabilities'
    ?await client.rpc('procurement_capabilities').abortSignal(controller.signal)
    :await client.rpc('procurement_scheduling_read',{p_read:operation,p_id:id??null,p_filters:normalized}).abortSignal(controller.signal);
   if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
   if(response.error)throw new WorkflowError(response.error.code==='42501'?'Your session expired or this action is unavailable. Your draft is kept.':'Saved scheduling data could not load. Retry to continue.',response.error.code==='42501'?'SESSION':'READ');
   return response.data as T;
  }catch(error){
   if(error instanceof WorkflowError||error instanceof DOMException&&error.name==='AbortError')throw error;
   throw new WorkflowError('Saved scheduling data could not load. Retry to continue.','READ');
  }finally{clearTimeout(timer);sharedSignal.removeEventListener('abort',abort);}
 });
}
