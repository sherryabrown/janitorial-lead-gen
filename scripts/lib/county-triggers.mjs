import { hash } from './reviewed-batch.mjs';
import { checked, rows, one } from './hosted-store.mjs';
import { resolveGeography, planSourceRoutes } from './geography-routing.mjs';
import { validateRequestScope } from './request-scope.mjs';
import { separateSamSource, buildKnownSourcePlan, adapterContract } from './known-source-execution.mjs';
import { usageSummary,auditPhase } from './workflow-audit.mjs';
import {samTrigger,samRequest} from './sam-request.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const next=state=>({pending:'Read saved progress',running:'Read saved progress',needs_review:'Review saved source evidence and candidates',
  partial:'Review unresolved coverage and resume',cancelled:'Resume when ready',completed:'Review results',outcome_unknown:'Reconcile saved operation before resuming'}[state]);
export function countyTriggers({db,discovery,workflow,audit,automaticCounty}) {
  const rpc=async(name,args)=>checked(await db.rpc(name,args));
  async function registry() {
    const [geographies,links,capabilities,sources]=await Promise.all([
      rows(db,'procurement_geographies'),rows(db,'procurement_place_counties',q=>q,'*',{order:'place_id'}),
      rows(db,'procurement_source_capabilities'),rows(db,'procurement_sources')]);
    return {geographies,links,capabilities,sources};
  }
  async function counties() {
    const all=await rows(db,'procurement_geographies',q=>q.eq('kind','county').eq('source_active',true),'id,name');
    return {counties:all.sort((a,b)=>a.name.localeCompare(b.name))};
  }
  async function stateSources() {return {items:await rpc('procurement_state_trigger_status',{})};}
  async function preview(input) {
    if(input?.target_kind==='sam') {
      const config=samTrigger(input);
      return {config,preview_hash:hash(config),budget:{usd:0,calls:0},next_action:'Run separate statewide SAM search'};
    }
    if(!input||!Array.isArray(input.county_ids)||!input.county_ids.length||input.county_ids.length>75||
      new Set(input.county_ids).size!==input.county_ids.length||input.county_ids.some(id=>typeof id!=='string'||!/^05\d{3}$/.test(id)))throw Error('Select unique Arkansas county IDs');
    if(typeof input.maintain_sources!=='boolean'||typeof input.check_updates!=='boolean'||!(input.maintain_sources||input.check_updates))throw Error('Choose trigger work');
    validateRequestScope({...input,service_scope:{service:'janitorial'}});
    const targetKind=input.target_kind??'county_scope';
    if(!['county_scope','state_source'].includes(targetKind))throw Error('Invalid trigger target');
    const data=await registry();
    let saved;
    if(targetKind==='state_source') {
      if(!uuid.test(input.state_trigger_id??''))throw Error('Saved state trigger required');
      saved=await one(db,'procurement_state_trigger_associations',input.state_trigger_id);
      if(!saved||input.requested_categories.length!==1||input.requested_categories[0]!==saved.category||
        input.county_ids.some(id=>!saved.county_ids.includes(id)))throw Error('State trigger scope does not match saved associations');
    }
    const counties=[...input.county_ids].sort().map(id=>{
      const county=data.geographies.find(g=>g.id===id&&g.kind==='county'&&g.source_active);
      if(!county)throw Error('Active county required');
      const scope=resolveGeography(data.geographies,data.links,{kind:'county',name:county.name});
      return {id,name:county.name,city_ids:scope.cities.map(c=>c.id).sort(),
        cities:scope.cities.map(c=>({id:c.id,name:c.name})),city_revisions:scope.cities.map(c=>({id:c.id,dataset_hash:c.dataset_hash})),selection_token:scope.selection_token};
    });
    const config={target_kind:targetKind,state_trigger_id:saved?.id??null,county_ids:counties.map(c=>c.id),counties,
      requested_categories:[...input.requested_categories].sort(),search_windows:Object.fromEntries([...input.requested_categories].sort().map(k=>[k,{from:input.search_windows[k].from,to:input.search_windows[k].to,date_basis:input.search_windows[k].date_basis}])),
      maintain_sources:input.maintain_sources,check_updates:input.check_updates};
    const sourceFilter=data.sources.filter(s=>!separateSamSource(s)&&(!saved||s.id===saved.source_id));
    const checkpoints=await rows(db,'procurement_county_state_research',q=>q.in('county_id',config.county_ids).in('category',config.requested_categories));
    const stateIds=new Set(data.capabilities.filter(c=>c.route_geography_id==='05').map(c=>c.source_id));
    const localSources=sourceFilter.filter(s=>s.contracting_entity_geo_level!=='state'&&!stateIds.has(s.id));
    return {config,preview_hash:hash(config),actions:counties.map(c=>({county_id:c.id,
      state_research:targetKind==='county_scope'&&input.maintain_sources?config.requested_categories.map(category=>{
        const prior=checkpoints.find(r=>r.county_id===c.id&&r.category===category&&r.scope_revision===c.selection_token);
        return {category,action:prior?(prior.state==='completed'?'reuse_saved':'review_or_resume_saved'):'research',request_id:prior?.request_id??null};
      }):[],
      routes:planSourceRoutes([data.geographies.find(g=>g.id===c.id),...c.city_ids.map(id=>data.geographies.find(g=>g.id===id))],data.capabilities,targetKind==='county_scope'?localSources:sourceFilter)
        .map(r=>({...r,categories:Object.fromEntries(Object.entries(r.categories).filter(([k])=>config.requested_categories.includes(k)))}))})),
      state_policy:targetKind==='county_scope'?'Research once for new county scopes; state updates run independently':'Independent saved state-source update',
      budget:{usd:1,calls:4,input_tokens:32000,output_tokens:8000},next_action:'Run this confirmed scope'};
  }
  async function submit(input,actor,key) {
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(key??''))throw Error('Valid Idempotency-Key required');
    if(input?.confirmed_scope!==true||!input.preview_hash)throw Error('Confirm displayed county and city scope');
    const existing=(await rows(db,'procurement_triggers',q=>q.eq('initiated_by',actor).eq('client_key',key),'id,submission_hash'))[0];
    const submissionHash=hash({...input,county_ids:[...(input.county_ids??[])].sort(),
      requested_categories:[...(input.requested_categories??[])].sort()});
    if(existing){if(existing.submission_hash!==submissionHash)throw Error('Idempotency key reused for different input');return {trigger_id:existing.id};}
    const current=await preview(input);
    if(current.preview_hash!==input.preview_hash)throw Error('Scope changed; preview and confirm again');
    const config=current.config.target_kind==='sam'?{...current.config,sam_filters:samRequest({category:current.config.requested_categories[0],publication_window:current.config.publication_window}).filters}:current.config;
    const id=await rpc('submit_procurement_trigger',{p_actor:actor,p_key:key,p_hash:submissionHash,p_config:config});
    return {trigger_id:id,next_action:'Read saved progress'};
  }
  async function status(id) {
    const t=await one(db,'procurement_triggers',id);if(!t)throw Error('Trigger not found');
    const [children,usage]=await Promise.all([rows(db,'procurement_trigger_requests',q=>q.eq('trigger_id',id),'trigger_id,request_id,county_id,role,scope'),
      rows(db,'procurement_usage_ledger',q=>q.eq('trigger_id',id),'id,state,input_tokens,output_tokens,actual_usd,reserved_usd,usage')]);
    const relatedState=t.target_kind==='sam'?[]:(await stateSources()).items.filter(s=>s.county_ids.some(c=>t.config.county_ids.includes(c)));
    return {id:t.id,target_kind:t.target_kind,config:t.config,state:t.state,created_at:t.created_at,
      children:children.map(c=>({request_id:c.request_id,county_id:c.county_id,role:c.role})),
      related_state_sources:relatedState.map(s=>({...s,evidence_policy:'Review saved source run; verify county work location and dates before import'})),
      usage:usageSummary(usage),next_action:next(t.state)};
  }
  async function list({offset=0,limit=50}={}) {
    const values=checked(await db.from('procurement_triggers').select('id,target_kind,state,created_at,origin,schedule_id,config').order('created_at',{ascending:false}).order('id').range(offset,offset+limit));
    const page=values.slice(0,limit),ids=page.map(t=>t.id),scheduleIds=[...new Set(page.map(t=>t.schedule_id).filter(Boolean))];
    // Batch page relationships, never one status call per row. Keep IN filters
    // below URL limits even when a page contains many all-county occurrences.
    const linked=async(table,column,keys,columns,filter=q=>q)=>{
      const unique=[...new Set(keys)],result=[];
      for(let i=0;i<unique.length;i+=100)result.push(...await rows(db,table,q=>filter(q.in(column,unique.slice(i,i+100))),columns));
      return result;
    };
    const [usage,saved,children]=await Promise.all([
      linked('procurement_usage_ledger','trigger_id',ids,'trigger_id,state,actual_usd,reserved_usd,usage'),
      linked('procurement_schedules','id',scheduleIds,'id,name'),
      linked('procurement_trigger_requests','trigger_id',ids,'trigger_id,request_id')]);
    const requestIds=children.map(c=>c.request_id),targets=await linked('procurement_request_targets','search_request_id',requestIds,'id,search_request_id');
    const [tasks,interpretations,samJobs]=await Promise.all([
      linked('procurement_coverage_tasks','target_id',targets.map(t=>t.id),'target_id,evidence'),
      linked('procurement_interpretations','request_id',requestIds,'request_id,staging_receipt',q=>q.eq('is_current',true)),
      linked('procurement_jobs','search_request_id',children.filter(c=>page.some(t=>t.id===c.trigger_id&&t.target_kind==='sam')).map(c=>c.request_id),'search_request_id,checkpoint')]);
    const summaries=new Map(ids.map(id=>[id,{usage:[],candidates:new Set(),evidence:new Set()}])),byRequest=new Map(children.map(c=>[c.request_id,c.trigger_id])),byTarget=new Map(targets.map(t=>[t.id,byRequest.get(t.search_request_id)])),names=new Map(saved.map(s=>[s.id,s.name]));
    for(const u of usage)summaries.get(u.trigger_id)?.usage.push(u);
    for(const i of interpretations)for(const id of i.staging_receipt?.intake_ids??[])summaries.get(byRequest.get(i.request_id))?.candidates.add(id);
    for(const t of tasks)for(const id of t.evidence?.run_ids??[])summaries.get(byTarget.get(t.target_id))?.evidence.add(id);
    for(const j of samJobs) {
      const summary=summaries.get(byRequest.get(j.search_request_id));
      for(const id of j.checkpoint?.intake_ids??[])summary?.candidates.add(id);
      for(const id of j.checkpoint?.run_ids??[])summary?.evidence.add(id);
    }
    return {items:page.map(t=>{const summary=summaries.get(t.id);return {
      id:t.id,target_kind:t.target_kind,state:t.state,created_at:t.created_at,origin:t.origin,
      county_count:t.config.county_ids?.length??0,category:t.target_kind==='sam'?t.config.requested_categories[0]:null,schedule_name:names.get(t.schedule_id)??null,
      candidate_count:summary.candidates.size,evidence_count:summary.evidence.size,usage:usageSummary(summary.usage)
    };}),next_offset:values.length>limit?offset+limit:null};
  }
  async function steps(id,{cursor=null,limit=50}={}) {
    if(!await one(db,'procurement_triggers',id))throw Error('Trigger not found');
    // Monotonic step sequence provides a durable cursor without loading history totals.
    let query=db.from('procurement_workflow_steps').select('id,sequence,request_id,job_id,task_id,source_id,county_id,phase,state,execution,origin,actor_id,reason,summary,started_at,finished_at,diagnostic_id').eq('trigger_id',id);
    if(cursor){if(!/^[0-9]{1,18}$/.test(cursor))throw Error('Invalid step cursor');query=query.gt('sequence',cursor);}
    const values=checked(await query.order('sequence').range(0,limit)),page=values.slice(0,limit);
    const usage=page.length?await rows(db,'procurement_usage_ledger',q=>q.in('step_id',page.map(s=>s.id)),'step_id,state,actual_usd,reserved_usd,usage'):[];
    return {items:page.map(s=>({...s,usage:usageSummary(usage.filter(u=>u.step_id===s.id))})),next_cursor:values.length>limit?String(page.at(-1).sequence):null};
  }
  async function control(id,action,actor) {
    if(action==='resume')await rpc('reconcile_procurement_county_reads',{p_trigger:id});
    const child=(await rows(db,'procurement_trigger_requests',q=>q.eq('trigger_id',id)))[0];
    const operation=()=>rpc('control_procurement_trigger',{p_id:id,p_actor:actor,p_action:action});
    return child?audit.run(child.request_id,action,operation,{actor_id:actor,reason:'manual'}):operation();
  }
  async function wake(requestId,{reconciled=false}={}) {
    const child=(await rows(db,'procurement_trigger_requests',q=>q.eq('request_id',requestId)))[0];
    if(child)checked(await db.from('procurement_triggers').update({state:'pending'}).eq('id',child.trigger_id).in('state',['needs_review','partial','completed']));
    if(child&&reconciled) {
      const parent=await one(db,'procurement_triggers',child.trigger_id);
      if(parent?.target_kind==='sam'&&parent.state==='outcome_unknown') {
        const [jobs,held]=await Promise.all([rows(db,'procurement_jobs',q=>q.eq('search_request_id',requestId).eq('state','outcome_unknown'),'id'),
          rows(db,'procurement_usage_ledger',q=>q.eq('trigger_id',parent.id).in('state',['reserved','outcome_unknown']),'id')]);
        if(!jobs.length&&!held.length)checked(await db.from('procurement_triggers').update({state:'pending'}).eq('id',parent.id).eq('state','outcome_unknown'));
      }
    }
  }
  async function step() {
    const t=await rpc('claim_procurement_trigger',{});if(!t)return false;
    const children=await rows(db,'procurement_trigger_requests',q=>q.eq('trigger_id',t.id));
    let state='completed';
    try {
      const data=t.target_kind==='sam'?null:await registry();
      for(const child of children) {
        const priorState=state;
        const operation=async()=>{
          if(child.role==='sam') {
            const savedJobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',child.request_id));
            const autoVerified=savedJobs.some(j=>j.checkpoint?.automatic&&j.checkpoint?.receipt?.verified);
            const jobs=savedJobs.filter(j=>!(autoVerified&&!j.checkpoint?.automatic&&j.state==='blocked'&&
              j.checkpoint?.stage==='import_prepare'&&j.checkpoint?.error_code==='workflow_stage_failed'));
            if(jobs.some(j=>j.state==='outcome_unknown'||j.checkpoint?.stage==='import_reconcile'))state='outcome_unknown';
            else if(jobs.some(j=>['pending','running'].includes(j.state)))state='pending';
            else if(jobs.every(j=>j.state==='succeeded'))state=jobs.some(j=>j.checkpoint?.automatic_exclusions?.length||j.checkpoint?.terminal_confirmed===false)?'partial':'completed';
            else state='needs_review';
            return;
          }
          if(child.role==='state_research') {
            const records=await rows(db,'procurement_county_state_research',q=>q.eq('request_id',child.request_id));
            for(const record of records) {
              const candidates=data.sources.filter(s=>!separateSamSource(s)&&data.capabilities.some(c=>{
                if(c.source_id!==s.id||c.route_geography_id!=='05'||c.kind!==record.category)return false;
                try{adapterContract(c,s);return true;}catch{return false;}
              }));
              for(const s of candidates) {
                await auditPhase('reuse_state_source',()=>rpc('associate_procurement_state_trigger',{p_source:s.id,p_category:record.category,p_scope:hash([s.id,record.category,'state']),p_county:child.county_id,
                  p_evidence:{basis:'registered_state_category',coverage:'work_location_review_required'}}),{source_id:s.id,reason:'registered_source'});
              }
              checked(await db.from('procurement_county_state_research').update({state:candidates.length?'completed':'partial',evidence:{source_ids:candidates.map(s=>s.id)}})
                .eq('county_id',record.county_id).eq('category',record.category).eq('scope_revision',record.scope_revision));
            }
          }
          const request=await one(db,'procurement_search_requests',child.request_id);
          const targets=await rows(db,'procurement_request_targets',q=>q.eq('search_request_id',child.request_id));
          const tasks=targets.length?await rows(db,'procurement_coverage_tasks',q=>q.in('target_id',targets.map(r=>r.id))):[];
          if(t.config.maintain_sources) {
            for(const task of tasks.filter(task=>['source_missing','method_missing'].includes(task.state)&&task.kind!=='source_entry')) {
              if(child.role==='state_research'&&(await rows(db,'procurement_county_state_research',q=>q.eq('request_id',child.request_id))).some(r=>r.category===task.kind&&r.state==='completed'))continue;
              const seed=task.evidence?.registered_source_ids?.find(id=>data.sources.some(s=>s.id===id&&!separateSamSource(s)));
              await auditPhase(task.evidence?.prior_capability_ids?.length?'revalidate':'research',
                ()=>discovery(child.request_id,{task_id:task.id,...(seed?{seed_source_id:seed}:{})},t.initiated_by),{task_id:task.id,source_id:task.source_id});
            }
          }
          const automatic=child.role==='county'?await automaticCounty?.(request.id):null;
          const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',child.request_id),'id,state,kind,checkpoint,dedupe_key');
          const legacyWait=job=>automatic&&job.state==='blocked'&&(
            job.dedupe_key===`api-workflow:${request.id}`&&job.checkpoint?.stage==='interpret'&&!job.checkpoint.error_code||
            automatic.verified&&job.dedupe_key?.startsWith('api-import:')&&!job.checkpoint.automatic&&job.checkpoint.stage==='import_awaiting_approval');
          if(jobs.some(j=>j.state==='outcome_unknown')||automatic?.state==='outcome_unknown')state='outcome_unknown';
          else if(state!=='outcome_unknown'&&jobs.some(j=>['pending','running'].includes(j.state)))state='pending';
          else if(!['pending','outcome_unknown'].includes(state)) {
            if(automatic?.state==='outcome_unknown')state='outcome_unknown';
            else if(automatic?.state==='saving')state='pending';
            else if(automatic)state=jobs.some(job=>job.state!=='succeeded'&&!legacyWait(job)&&job.kind!=='discover')||automatic.state==='blocked'?'needs_review':
              tasks.some(task=>task.kind!=='source_entry'&&!['reviewed_with_results','reviewed_no_results','superseded'].includes(task.state))||automatic.exclusions.length?'partial':state;
            else if(jobs.some(job=>job.state!=='succeeded')||tasks.some(task=>!['reviewed_with_results','reviewed_no_results','superseded'].includes(task.state))||(await workflow.status(request.id)).total_candidates>0)state='needs_review';
          }
        };
        await audit.run(child.request_id,'resolve_sources',operation);
        const rank={completed:0,partial:1,needs_review:2,pending:3,outcome_unknown:4};
        if(rank[priorState]>rank[state])state=priorState;
      }
      const usage=await rows(db,'procurement_usage_ledger',q=>q.eq('trigger_id',t.id),'id,state');
      if(usage.some(u=>['reserved','outcome_unknown'].includes(u.state)))state='outcome_unknown';
      if(!await rpc('checkpoint_procurement_trigger',{p_id:t.id,p_lease:t.lease_token,p_state:state,p_checkpoint:{stage:'review'}}))throw Error('Trigger lease lost');
    } catch(error) {
      await rpc('checkpoint_procurement_trigger',{p_id:t.id,p_lease:t.lease_token,p_state:error.code==='schedule_paused'?'pending':'partial',p_checkpoint:{stage:'review',...(error.code==='schedule_paused'?{}:{error_code:'trigger_stage_failed'})}});
    }
    return true;
  }
  return {counties,stateSources,preview,submit,status,list,steps,control,wake,step};
}

// Apply only Admin policy. Existing standalone requests keep their original routes.
export function adminSourcePlan(request,targets,geographies,capabilities,sources) {
  const policy=request.workflow_control?.admin_policy;
  if(policy==='county_scope') {
    const stateIds=new Set(capabilities.filter(c=>c.route_geography_id==='05').map(c=>c.source_id));
    sources=sources.filter(s=>s.contracting_entity_geo_level!=='state'&&!stateIds.has(s.id));
    const allowed=new Set(sources.map(s=>s.id));capabilities=capabilities.filter(c=>allowed.has(c.source_id));
  }
  if(policy==='state_source') {
    const id=request.workflow_control.source_id;
    capabilities=capabilities.filter(c=>c.source_id===id);sources=sources.filter(s=>s.id===id);
  }
  const plan=buildKnownSourcePlan(request,targets,geographies,capabilities,sources);
  if(policy&&request.workflow_control.check_updates===false) {
    plan.tasks=plan.tasks.filter(t=>!t.capability_id&&t.kind!=='source_entry');
  }
  return plan;
}
