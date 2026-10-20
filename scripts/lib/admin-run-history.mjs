import {checked,rows} from './hosted-store.mjs';
import {reportSchedules} from './schedule-reporting.mjs';
import {latestOccurrence,nextOccurrence} from './schedule-recurrence.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const recurrence={frequency:'daily',timezone:'America/Chicago',local_times:['00:00']};
export function historyFilters(input={}){
 const f=Object.fromEntries(['schedule','run','target','geography','origin','outcome','from','through'].map(k=>[k,input[k]??'']));
 if(Object.values(f).some(v=>typeof v!=='string')||f.schedule&&f.schedule!=='none'&&!uuid.test(f.schedule)||f.run&&!uuid.test(f.run)||
 f.target&&!['county_scope','state_source','sam'].includes(f.target)||f.geography&&!/^(05|05\d{3})$/.test(f.geography)||
 f.origin&&!['manual','scheduled'].includes(f.origin)||f.outcome&&!['pending','running','completed','partial','needs_review','outcome_unknown','cancelled'].includes(f.outcome))throw Error('Invalid history filters');
 for(const key of ['from','through'])if(f[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(f[key])||!Number.isFinite(Date.parse(f[key]+'T12:00:00Z'))||new Date(f[key]+'T12:00:00Z').toISOString().slice(0,10)!==f[key]))throw Error('Invalid history dates');
 if(f.from&&f.through&&f.from>f.through)throw Error('Invalid history interval');
 return f;
}
export function activityTiming(run,steps){
 const intervals=steps.map(s=>[Date.parse(s.started_at),Date.parse(s.finished_at)]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a).sort((a,b)=>a[0]-b[0]);
 let milliseconds=0,end=-Infinity;
 for(const [a,b] of intervals){milliseconds+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
 const created=Date.parse(run.created_at),finished=Date.parse(run.finished_at);
 return {created_at:run.created_at,finished_at:run.finished_at??null,
   created_to_finished_ms:['completed','cancelled'].includes(run.state)&&Number.isFinite(finished)&&finished>=created?finished-created:null,
   recorded_activity_ms:intervals.length?milliseconds:null,
   completeness:intervals.length&&intervals.length===steps.length?'known':intervals.length?'partial':'unknown',
   basis:'Union of completed recorded step intervals; not end-to-end execution time'};
}
export async function reportRunHistory(db,runs){
 runs=runs.map(r=>({id:r.id,target_kind:r.target_kind,state:r.state,config:r.config,created_at:r.created_at,finished_at:r.finished_at??null,origin:r.origin,schedule_id:r.schedule_id??null,occurrence_id:r.occurrence_id??null}));
 const projected=await reportSchedules(db,runs.map(r=>({id:r.id,last_run:r})));
 const steps=[];
 for(let i=0;i<runs.length;i+=100)steps.push(...await rows(db,'procurement_workflow_steps',q=>q.in('trigger_id',runs.slice(i,i+100).map(r=>r.id)),'id,trigger_id,started_at,finished_at'));
 return runs.map((run,i)=>({...projected[i].reporting.last_run,timing:activityTiming(run,steps.filter(s=>s.trigger_id===run.id)),
  categories:{completeness:run.config?.check_updates===false?'not_applicable':'unknown',forecast:null,opportunity:null,award:null,reason:'Verified historical category attribution is unavailable'},
  candidates_attention:{value:null,completeness:run.config?.check_updates===false?'not_applicable':'unknown',reason:run.config?.check_updates===false?'Source maintenance only':'Review saved candidate validation; intake count is not a blocker count'}}));
}
export function adminRunHistory(db){
 return async({offset=0,limit=50,...input}={})=>{
  const f=historyFilters(input);
  let q=db.from('procurement_triggers').select('id,target_kind,state,created_at,finished_at,origin,schedule_id,occurrence_id,config',{count:'exact'});
  if(f.schedule==='none')q=q.is('schedule_id',null);else if(f.schedule)q=q.eq('schedule_id',f.schedule);
  if(f.run)q=q.eq('id',f.run);if(f.target)q=q.eq('target_kind',f.target);if(f.origin)q=q.eq('origin',f.origin);if(f.outcome)q=q.eq('state',f.outcome);
  if(f.geography==='05')q=q.in('target_kind',['state_source','sam']);else if(f.geography)q=q.contains('config',{county_ids:[f.geography]});
  if(f.from)q=q.gte('created_at',latestOccurrence(recurrence,f.from+'T18:00:00Z'));
  if(f.through)q=q.lt('created_at',nextOccurrence(recurrence,latestOccurrence(recurrence,f.through+'T18:00:00Z')));
  const response=await q.order('created_at',{ascending:false}).order('id').range(offset,offset+limit),values=checked(response),page=values.slice(0,limit);
  const scheduleIds=[...new Set(page.map(r=>r.schedule_id).filter(Boolean))];
  const schedules=scheduleIds.length?await rows(db,'procurement_schedules',q=>q.in('id',scheduleIds),'id,name'):[];
  return {items:(await reportRunHistory(db,page)).map(r=>({...r,schedule_name:schedules.find(s=>s.id===r.schedule_id)?.name??null})),total:response.count,next_offset:values.length>limit?offset+limit:null,as_of:new Date().toISOString(),basis:'Run creation date · America/Chicago'};
 };
}
