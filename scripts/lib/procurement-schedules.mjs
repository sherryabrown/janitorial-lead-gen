import {scheduleActivity,publicOccurrence} from './schedule-activity.mjs';
import {scheduleEvent} from './schedule-change-audit.mjs';
import { timingSafeEqual } from 'node:crypto';
import { checked,one } from './hosted-store.mjs';
import { hash } from './reviewed-batch.mjs';
import { validateRecurrence,nextOccurrence,latestOccurrence,rollingWindows } from './schedule-recurrence.mjs';
import {samRollingWindow,samRequest} from './sam-request.mjs';
import {scheduleFilters,reportSchedules} from './schedule-reporting.mjs';
import {adminRunHistory,reportRunHistory} from './admin-run-history.mjs';
import {adminAnalytics} from './admin-analytics.mjs';

const scopeHash=config=>hash(config.target_kind==='sam'?{target_kind:'sam',requested_categories:config.requested_categories}:{target_kind:config.target_kind,state_trigger_id:config.state_trigger_id,...(config.state_trigger_ids?.length>1?{state_trigger_ids:config.state_trigger_ids,state_sources:config.state_sources}:{}),counties:config.counties});
const publicReason=value=>value==null?null:['scope_changed','scope_unavailable','owner_inactive','previous_run_active','trigger_enqueue_failed'].includes(value)?value:'saved_reason';
const publicId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value)?value:null;
export function procurementSchedules({db,triggers,now=()=>new Date()}) {
  const rpc=async(name,args)=>checked(await db.rpc(name,args));
  const rowsForReservations=async()=>checked(await db.from('procurement_schedule_work_reservations').select('schedule_id,name,county_id,work'));
  async function preview(input) {
    const recurrence=validateRecurrence(input?.recurrence);
    if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80||typeof input.enabled!=='boolean')throw Error('Schedule name and enabled state required');
    const config=input.config;
    if(!config?.requested_categories?.length)throw Error('Schedule trigger scope required');
    const sam=config.target_kind==='sam';
    const window_policy=Object.fromEntries(config.requested_categories.map(k=>[k,sam?{lookback_days:input.window_policy?.[k]?.lookback_days}:{from_offset_days:input.window_policy?.[k]?.from_offset_days,
      to_offset_days:input.window_policy?.[k]?.to_offset_days,date_basis:input.window_policy?.[k]?.date_basis}]));
    const resolved=await triggers.preview(sam?{...config,publication_window:samRollingWindow(window_policy,config.requested_categories[0],now())}:
      {...config,search_windows:rollingWindows(window_policy,config.requested_categories,now())});
    let conflicts=config.target_kind==='county_scope'?(await rowsForReservations()).filter(r=>r.schedule_id!==input.schedule_id&&config.county_ids.includes(r.county_id)&&config[r.work]):[];
    if(config.target_kind==='state_source'){
      const members=checked(await db.from('procurement_schedule_state_memberships').select('schedule_id,state_trigger_association_id').in('state_trigger_association_id',resolved.config.state_trigger_ids??[resolved.config.state_trigger_id]));
      const owners=[...new Set(members.filter(m=>m.schedule_id!==input.schedule_id).map(m=>m.schedule_id))];
      const schedules=owners.length?checked(await db.from('procurement_schedule_overview').select('id,name').in('id',owners)):[];
      conflicts=schedules.map(s=>({schedule_id:s.id,name:s.name,county_id:'State source',work:'state_source'}));
    }
    const canonical={name:input.name.trim(),enabled:input.enabled,recurrence,config:resolved.config,window_policy,scope_hash:scopeHash(resolved.config)};
    return {...canonical,conflicts,preview_hash:hash(canonical),next_due_at:input.enabled?nextOccurrence(recurrence,now()):null,
      cities:resolved.config.counties?.map(c=>({id:c.id,name:c.name,cities:c.cities}))??[],
      monthly_short_month:'Dates 29–31 use the last day in shorter months'};
  }
  async function save(id,input,actor,key) {
    if(input?.confirmed_scope!==true||!input.preview_hash)throw Error('Confirm the displayed schedule scope');
    if(!id&&!/^[A-Za-z0-9_-]{8,100}$/.test(key??''))throw Error('Valid Idempotency-Key required');
    if(id&&(!Number.isInteger(input.expected_version)||input.expected_version<1))throw Error('Expected schedule version required');
    if(id){const saved=await one(db,'procurement_schedules',id);if(!saved||saved.deleted_at)throw Error('Schedule not found');if(saved.config.target_kind==='county_scope'&&(input.config?.target_kind!=='county_scope'||JSON.stringify([...new Set(saved.config.county_ids)].sort())!==JSON.stringify([...new Set(input.config.county_ids)].sort())))throw Error('To change counties, archive this schedule and create a new one');}
    const submissionHash=hash(input);
    if(!id) {
      const existing=checked(await db.from('procurement_schedules').select('id,submission_hash').eq('created_by',actor).eq('client_key',key).maybeSingle());
      if(existing){if((await one(db,'procurement_schedules',existing.id))?.deleted_at)throw Error('Schedule deleted; create a new schedule');if(existing.submission_hash!==submissionHash)throw Error('Schedule key reused for different input');return get(existing.id);}
    }
    const current=await preview({...input,schedule_id:id??input.schedule_id});
    if(current.preview_hash!==input.preview_hash)throw Error('Schedule scope changed; preview again');
    const result=await rpc('save_procurement_schedule',{p_id:id??null,p_actor:actor,p_key:key??null,p_hash:submissionHash,
      p_expected_version:input.expected_version??null,p_input:current,p_now:now().toISOString()});
    return get(result);
  }
  async function get(id) {
    const value=await one(db,'procurement_schedule_overview',id);if(!value)throw Error('Schedule not found');
    const [result]=await reportSchedules(db,[{id:value.id,name:value.name,enabled:value.enabled,archived:value.archived_at!==null,version:value.version,
      owner_id:value.owner_id,config:value.config,recurrence:value.recurrence,window_policy:value.window_policy,
      next_due_at:value.next_due_at?new Date(value.next_due_at).toISOString():null,blocker:value.blocker,updated_at:value.updated_at,last_run:value.last_run,latest_occurrence:value.latest_occurrence}]);
    const flags=checked(await db.from('procurement_schedule_deletion').select('id,can_delete').eq('id',id).single());
    return {...result,can_delete:flags.can_delete};
  }
  async function list({offset=0,limit=50,...input}={}) {
    const f=scheduleFilters(input);
    let q=db.from('procurement_schedule_overview').select('id,name,enabled,archived_at,version,config,recurrence,window_policy,next_due_at,blocker,updated_at,last_run,latest_occurrence',{count:'exact'});
    if(f.q)q=q.ilike('name','%'+f.q.replace(/[\\%_]/g,'\\$&')+'%');
    if(f.target!=='all')q=q.eq('target_kind',f.target);
    if(f.lifecycle==='current')q=q.is('archived_at',null);else if(f.lifecycle!=='all')q=q.eq('lifecycle',f.lifecycle);
    if(f.blocker==='blocked')q=q.not('blocker','is',null);else if(f.blocker==='clear')q=q.is('blocker',null);
    if(f.geography==='05')q=q.in('target_kind',['state_source','sam']);
    else if(f.geography)q=q.contains('config',{county_ids:[f.geography]});
    const response=await q.order(f.sort,{ascending:f.direction==='asc',nullsFirst:false}).order('id').range(offset,offset+limit);
    const data=checked(response);
    const page=data.slice(0,limit);
    const flags=page.length?checked(await db.from('procurement_schedule_deletion').select('id,can_delete').in('id',page.map(s=>s.id))):[];
    return {items:(await reportSchedules(db,page)).map(s=>({...s,can_delete:flags.find(f=>f.id===s.id)?.can_delete??false})),next_offset:data.length>limit?offset+limit:null,total:response.count};
  }
  async function occurrences(id,{offset=0,limit=50}={}) {
    if(!await one(db,'procurement_schedules',id))throw Error('Schedule not found');
    const data=checked(await db.from('procurement_schedule_occurrences').select('id,version,due_at,effective_at,origin,state,reason,trigger_id,config,baseline,missed_from,missed_through,created_at')
      .eq('schedule_id',id).order('created_at',{ascending:false}).order('id').range(offset,offset+limit));
    const page=data.slice(0,limit),ids=page.map(o=>o.trigger_id).filter(Boolean);
    const runs=ids.length?await checked(await db.from('procurement_triggers').select('id,target_kind,state,config,created_at,finished_at,origin,schedule_id').in('id',ids)):[];
    const reports=await reportRunHistory(db,runs);
    return {items:page.map(o=>({...publicOccurrence(o),run:reports.find(r=>r.id===o.trigger_id)??null})),next_offset:data.length>limit?offset+limit:null};
  }
  async function control(id,action,input,actor) {
    if(!Number.isInteger(input?.expected_version)||input.expected_version<1)throw Error('Expected schedule version required');
    if(action==='delete'){const response=await db.rpc('delete_procurement_schedule',{p_id:id,p_actor:actor,p_version:input.expected_version,p_now:now().toISOString()});if(response.error?.message?.includes('Schedule has run'))throw Error('Schedule has run; archive instead');checked(response);return {id,deleted:true};}
    const saved=await get(id);
    const next=action==='resume'?nextOccurrence(saved.recurrence,now()):null;
    await rpc('control_procurement_schedule',{p_id:id,p_actor:actor,p_action:action,p_version:input.expected_version,
      p_next:next,p_now:now().toISOString()});return get(id);
  }
  async function enqueue(saved,{origin,actor,key,due,effective,next=null}) {
    if(saved.config.target_kind==='county_scope')await rpc('reconcile_procurement_county_reads',{p_schedule:saved.id});
    let config=saved.config,blocker=null;
    try {
      const preview=await triggers.preview(saved.config.target_kind==='sam'?{...saved.config,
        publication_window:samRollingWindow(saved.window_policy,saved.config.requested_categories[0],effective)}:
        {...saved.config,search_windows:rollingWindows(saved.window_policy,saved.config.requested_categories,effective)});
      if(scopeHash(preview.config)!==saved.scope_hash)blocker='scope_changed';
      config=preview.config;
      if(config.target_kind==='sam')config={...config,sam_filters:samRequest({category:config.requested_categories[0],publication_window:config.publication_window}).filters};
    }catch {blocker='scope_unavailable';}
    return rpc('enqueue_procurement_schedule',{p_id:saved.id,p_version:saved.version,p_origin:origin,p_actor:actor,p_key:key,
      p_due:due,p_effective:effective,p_next:next,p_now:now().toISOString(),p_config:config,p_hash:hash(config),p_blocker:blocker});
  }
  async function runNow(id,input,actor,key) {
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(key??'')||!Number.isInteger(input?.expected_version))throw Error('Version and Idempotency-Key required');
    // Acknowledgment loss replays the saved occurrence, not a fresh timestamp/window.
    const runKey=`manual-${hash([id,actor,key])}`;
    const saved=await one(db,'procurement_schedules',id);if(!saved||saved.deleted_at)throw Error('Schedule not found');
    const prior=checked(await db.from('procurement_schedule_occurrences').select('id,trigger_id,state,version').eq('schedule_id',id).eq('run_key',runKey).maybeSingle());
    if(prior){if(prior.version!==input.expected_version)throw Error('Run key reused for another version');return prior;}
    if(saved.version!==input.expected_version)throw Error('Schedule version changed; reload');
    return enqueue(saved,{origin:'manual',actor,key:runKey,due:now().toISOString(),effective:now().toISOString()});
  }
  async function tick() {
    const at=now().toISOString();
    await rpc('disable_inactive_procurement_schedules',{p_now:at});
    const due=checked(await db.from('procurement_schedules').select('*').eq('enabled',true).lte('next_due_at',at)
      .order('next_due_at').order('id').range(0,4));
    const results=[];
    for(const saved of due) {
      const effective=latestOccurrence(saved.recurrence,at);
      results.push(await enqueue(saved,{origin:'scheduled',actor:saved.owner_id,key:`due-${saved.next_due_at}`,
        due:saved.next_due_at,effective,next:nextOccurrence(saved.recurrence,at)}));
    }
    return {checked:due.length,queued:results.filter(r=>r.state==='queued'&&!r.replayed).length};
  }
  async function status() {return rpc('procurement_scheduler_status',{});}
  async function events(id,{offset=0,limit=50}={}) {
    if(!await one(db,'procurement_schedules',id))throw Error('Schedule not found');const data=checked(await db.from('procurement_schedule_events').select('id,actor_id,action,version,at,summary').eq('schedule_id',id).order('at',{ascending:false}).order('id').range(offset,offset+limit));
    return {items:data.slice(0,limit).map(e=>({...scheduleEvent(e),action:['created','edited','pause','resume','archive','delete','owner_inactive','queued','skipped','blocked'].includes(e.action)?e.action:'saved_event',summary:{occurrence_id:publicId(e.summary?.occurrence_id),reason:publicReason(e.summary?.reason)}})),next_offset:data.length>limit?offset+limit:null};
  }
  return {activity:scheduleActivity(db,{now}),preview,save,get,list,occurrences,events,control,runNow,tick,status,history:adminRunHistory(db),analytics:adminAnalytics(db,{now})};
}

export function schedulerAuthorization(expected,provided) {
  // Compare fixed-size hashes so length differences never leak the secret.
  if(typeof expected!=='string'||expected.length<32||typeof provided!=='string')return false;
  return timingSafeEqual(Buffer.from(hash(expected),'hex'),Buffer.from(hash(provided),'hex'));
}
