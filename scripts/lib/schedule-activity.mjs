import {checked,one} from './hosted-store.mjs';
import {historyFilters,reportRunHistory} from './admin-run-history.mjs';
import {latestOccurrence,nextOccurrence} from './schedule-recurrence.mjs';
const recurrence={frequency:'daily',timezone:'America/Chicago',local_times:['00:00']};
const reasons=['scope_changed','scope_unavailable','owner_inactive','previous_run_active','trigger_enqueue_failed'];
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value)?value:null;
export function publicOccurrence(o){
 if(!o)return null;
 return {id:o.id,version:o.version,due_at:o.due_at,effective_at:o.effective_at,created_at:o.created_at,
  origin:o.origin,state:o.state,trigger_id:uuid(o.trigger_id),config:o.config,
  reason:o.reason==null?null:reasons.includes(o.reason)?o.reason:'saved_reason',missed_from:o.missed_from,missed_through:o.missed_through,
  baseline:(Array.isArray(o.baseline)?o.baseline:[]).map(b=>({source_id:uuid(b.source_id),capability_id:uuid(b.capability_id),run_id:uuid(b.run_id),category:['forecast','opportunity','award'].includes(b.category)?b.category:null,finished_at:typeof b.finished_at==='string'&&Number.isFinite(Date.parse(b.finished_at))?b.finished_at:null,content_sha256:/^[a-f0-9]{64}$/.test(b.content_sha256??'')?b.content_sha256:null}))};
}
export function scheduleActivity(db,{now=()=>new Date()}={}){
 return async(id,{offset=0,limit=50,kind='',attempt_state='',as_of,...input}={})=>{
  const f=historyFilters(input),rawBoundary=as_of??now().toISOString();
  if(typeof rawBoundary!=='string'||!Number.isFinite(Date.parse(rawBoundary)))throw Error('Invalid activity boundary');
  const boundary=new Date(rawBoundary).toISOString();
  if(!['','run','attempt'].includes(kind)||attempt_state&&!['queued','skipped','blocked'].includes(attempt_state)||!Number.isFinite(Date.parse(boundary))||Date.parse(boundary)>now().getTime()||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid activity filters');
  if(!await one(db,'procurement_schedules',id))throw Error('Schedule not found');
  let q=db.from('procurement_schedule_activity').select('id,activity_at,kind,trigger_id,saved_run,occurrence',{count:'exact'}).eq('schedule_id',id)
   .or(`run_created_at.is.null,run_created_at.lte.${boundary}`).or(`occurrence_created_at.is.null,occurrence_created_at.lte.${boundary}`);
  if(kind==='run')q=q.eq('kind','run');else if(kind==='attempt')q=q.neq('kind','run');
  if(f.run||f.target||f.origin||f.geography||f.outcome)q=q.eq('kind','run');
  if(f.run)q=q.eq('trigger_id',f.run);if(f.target)q=q.eq('target_kind',f.target);if(f.origin)q=q.eq('origin',f.origin);if(f.outcome)q=q.eq('outcome',f.outcome);
  if(f.geography==='05')q=q.in('target_kind',['state_source','sam']);else if(f.geography)q=q.contains('config',{county_ids:[f.geography]});
  if(attempt_state)q=q.neq('kind','run').eq('outcome',attempt_state);
  if(f.from)q=q.gte('activity_at',latestOccurrence(recurrence,f.from+'T18:00:00Z'));
  if(f.through)q=q.lt('activity_at',nextOccurrence(recurrence,latestOccurrence(recurrence,f.through+'T18:00:00Z')));
  const response=await q.order('activity_at',{ascending:false}).order('id').range(offset,offset+limit),data=checked(response),page=data.slice(0,limit);
  const reports=await reportRunHistory(db,page.filter(r=>r.kind==='run').map(r=>r.saved_run));
  return {items:page.map(r=>({id:r.id,activity_at:r.activity_at,kind:r.kind,run:reports.find(t=>t.id===r.trigger_id)??null,occurrence:publicOccurrence(r.occurrence),clock_basis:r.kind==='run'?'Run creation date':r.occurrence?.effective_at?'Effective date':r.occurrence?.due_at?'Due date':'Attempt creation date'})),total:response.count,next_offset:data.length>limit?offset+limit:null,as_of:boundary};
 };
}
