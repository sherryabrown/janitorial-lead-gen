import {rows} from './hosted-store.mjs';
import {historyFilters,activityTiming} from './admin-run-history.mjs';
import {latestOccurrence,nextOccurrence} from './schedule-recurrence.mjs';
import {usageSummary} from './workflow-audit.mjs';
import {sourceAttention,countyPresentations} from './county-source-attention.mjs';
import {hash} from './reviewed-batch.mjs';

const recurrence={frequency:'daily',timezone:'America/Chicago',local_times:['00:00']};
const categories=['forecast','opportunity','award'];
const ctDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const category=c=>c==='historical_opportunity'?'opportunity':categories.includes(c)?c:null;
const rank={unchanged:0,updated:1,added:2};
const metric=(value,complete,reason)=>({value:complete?value:null,known_subtotal:value,completeness:complete?'known':value?'partial':'unknown',...(complete?{}:{reason})});
const incomplete='Historical identities or unsettled results are missing; known subtotal only.';
export function analyticsFilters(input={},now=new Date()){
 const asOf=input.as_of??now.toISOString();
 if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||Date.parse(asOf)>now.getTime()+1000)throw Error('Invalid reporting timestamp');
 const today=ctDate(new Date(asOf)),start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-6);
 const f=historyFilters({...input,from:input.from??start.toISOString().slice(0,10),through:input.through??today});
 const all=input.period==='all';
 if(input.period&&!['all','custom'].includes(input.period)||all&&(!f.schedule||f.schedule==='none')||!all&&(!f.from||!f.through)||
  !all&&(Date.parse(f.through)-Date.parse(f.from)>366*86400000)||
  input.category&&!categories.includes(input.category)||input.sort&&!['created_at','added','updated','unchanged','activity'].includes(input.sort)||input.direction&&!['asc','desc'].includes(input.direction))throw Error('Invalid analytics filters');
 return {...f,category:input.category??'',period:all?'all':'custom',as_of:asOf,sort:input.sort??'created_at',direction:input.direction??'desc',
  start:all?null:latestOccurrence(recurrence,f.from+'T18:00:00Z'),end:all?asOf:nextOccurrence(recurrence,latestOccurrence(recurrence,f.through+'T18:00:00Z'))};
}

// Only recognized validation/evidence/identity failures are actionable. Irrelevant,
// expired and out-of-scope exclusions are not counts of leads needing attention.
const actionable=/evidence.*(?:required|unproven|did not pass)|no supported.*evidence|no valid response deadline|conflicting|conflicts|identity|canonical.*validation|validation.*did not pass|overlap needs manual review|cannot be silently revived|older .*replace|provenance needs/i;
function outcomes(run,jobs,selectedCategory){
 const imports=jobs.filter(j=>j.checkpoint?.automatic||j.checkpoint?.stage?.startsWith('import_'));
 const verified=imports.filter(j=>j.checkpoint?.receipt?.verified);
 let complete=imports.length>0&&!imports.some(j=>!j.checkpoint?.receipt?.verified)&&!jobs.some(j=>['pending','running','outcome_unknown'].includes(j.state))&&!['pending','running','outcome_unknown'].includes(run.state),categoryComplete=true;
 if(!imports.length&&jobs.some(j=>j.checkpoint?.stage==='sam_review'&&j.checkpoint.sam_completed===true)&&!jobs.some(j=>['pending','running','outcome_unknown'].includes(j.state))&&!['pending','running','outcome_unknown'].includes(run.state))complete=true;
 const records=new Map(),resolved=new Set();
 for(const j of verified){
  const c=j.checkpoint,versioned=c.reporting_records?.version===1?c.reporting_records.records:null;
  const saved=versioned??c.county_records;
  if(!Array.isArray(saved)){complete=false;categoryComplete=false;continue;}
  for(const r of saved){
   const outcome=versioned?r.outcome:r.added?'added':r.updated?'updated':'unchanged';
   if(typeof r.id!=='string'||!r.id||!(outcome in rank)||!versioned&&(typeof r.added!=='boolean'||typeof r.updated!=='boolean')){complete=false;continue;}
   for(const id of r.intake_ids??[])resolved.add(id);
   const prior=records.get(r.id);
   // Preserve all as-imported classifications for a category transition; a lead
   // is still counted only once in total and in its highest-precedence outcome.
   const cats=new Set([...(prior?.categories??[]),...(category(r.category)?[category(r.category)]:[])]);
   if(!category(r.category))categoryComplete=false;
   records.set(r.id,{id:r.id,outcome:prior&&rank[prior.outcome]>rank[outcome]?prior.outcome:outcome,categories:cats,
    historical:prior?.historical||r.category==='historical_opportunity'});
  }
 }
 if(run.config?.check_updates===false){complete=true;categoryComplete=true;}
 const filtered=[...records.values()].filter(r=>!selectedCategory||r.categories.has(selectedCategory));
 if(selectedCategory&&!categoryComplete)complete=false;
 return {records:filtered,complete,categoryComplete,resolved};
}
export function aggregateAnalytics({runs,jobs=[],children=[],usage=[],steps=[],tasks=[],targets=[],intakes=[]},f){
 const uniqueUsage=[...new Map(usage.map(u=>[u.id,u])).values()];
 const inPeriod=value=>Date.parse(value)<=Date.parse(f.as_of)&&(!f.start||Date.parse(value)>=Date.parse(f.start))&&Date.parse(value)<Date.parse(f.end);
 const periodRuns=runs.filter(r=>inPeriod(r.created_at));
 const globalRecords=new Map(),rowsOut=[],sourceIds=new Set(),routeGaps=new Set(),attention=new Set(),validation=new Set();
 let complete=true,categoryComplete=true,attentionComplete=true;
 const durationSamples=[];
 for(const run of periodRuns){
  const requestIds=new Set(children.filter(c=>c.trigger_id===run.id).map(c=>c.request_id));
  const runJobs=jobs.filter(j=>requestIds.has(j.search_request_id)),result=outcomes(run,runJobs,f.category);
  const counts={added:0,updated:0,unchanged:0};
  for(const r of result.records){counts[r.outcome]++;const old=globalRecords.get(r.id);globalRecords.set(r.id,{...r,outcome:old&&rank[old.outcome]>rank[r.outcome]?old.outcome:r.outcome,categories:new Set([...(old?.categories??[]),...r.categories]),historical:r.historical||old?.historical});}
  complete&&=result.complete;categoryComplete&&=result.categoryComplete;
  const runAttention=new Set(),runValidation=new Set();let runAttentionComplete=true;
  const latestExclusions=new Map();
  for(const j of [...runJobs].sort((a,b)=>(a.updated_at??'').localeCompare(b.updated_at??'')||a.id.localeCompare(b.id)))for(const e of j.checkpoint?.automatic?.exclusions??j.checkpoint?.sam_exclusions??[])latestExclusions.set(e.intake_id,e);
  for(const e of latestExclusions.values()){
   const intake=intakes.find(i=>i.id===e.intake_id);
   if(result.resolved.has(e.intake_id)||intake&&['processed','ignored'].includes(intake.status))continue;
   if(f.category&&category(intake?.category)!==f.category){if(!category(intake?.category))runAttentionComplete=false;continue;}
   if(actionable.test(e.reason??'')){runAttention.add(e.intake_id);runValidation.add(e.intake_id);}
   else if(!/NAICS does not|does not establish Arkansas|not supported for automatic opportunity classification|outside|expired|irrelevant/i.test(e.reason??''))runAttentionComplete=false;
  }
  // Checkpoints are not a complete historical validation audit. Do not invent
  // zero for older/unfinished imports with no persisted disposition evidence.
  if(!result.complete||runJobs.some(j=>j.checkpoint?.receipt?.verified&&!j.checkpoint.automatic))runAttentionComplete=false;
  attentionComplete&&=runAttentionComplete;
  for(const id of runAttention)attention.add(id);for(const id of runValidation)validation.add(id);
  const targetIds=new Set(targets.filter(t=>requestIds.has(t.search_request_id)).map(t=>t.id)),runSources=new Set(),runGaps=new Set();
  for(const task of tasks.filter(t=>targetIds.has(t.target_id)&&(!f.category||t.kind===f.category))){
   if(!sourceAttention(task,runJobs))continue;
   if(task.source_id){sourceIds.add(task.source_id);runSources.add(task.source_id);}else{const target=targets.find(t=>t.id===task.target_id),key=`${target?.geography_id??target?.target_key??task.target_id}:${task.kind}`;routeGaps.add(key);runGaps.add(key);}
  }
  const timing=activityTiming(run,steps.filter(s=>s.trigger_id===run.id));
  if(timing.created_to_finished_ms!==null)durationSamples.push(timing.created_to_finished_ms);
  rowsOut.push({id:run.id,schedule_id:run.schedule_id??null,target_kind:run.target_kind,origin:run.origin,state:run.state,created_at:run.created_at,
   leads:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,run.config?.check_updates===false?{value:null,known_subtotal:0,completeness:'not_applicable',reason:'Source maintenance only'}:metric(v,result.complete,incomplete)])),
   candidates_attention:metric(runAttention.size,runAttentionComplete,'Some candidate dispositions are unavailable.'),sources_attention:runSources.size,route_gaps:runGaps.size,timing});
 }
 const records=[...globalRecords.values()],catCounts={};
 for(const c of categories)catCounts[c]=metric(records.filter(r=>r.categories.has(c)).length,complete&&categoryComplete,'Some as-imported categories are unavailable.');
 durationSamples.sort((a,b)=>a-b);const n=durationSamples.length;
 const runIds=new Set(runs.map(r=>r.id)),ledger=uniqueUsage.filter(u=>runIds.has(u.trigger_id)&&inPeriod(u.created_at));
 const summary=usageSummary(ledger),costMissing=ledger.some(u=>u.state!=='not_sent'&&!u.usage?.quota_rejection&&(u.state!=='completed'||u.actual_usd==null));
 if(costMissing)summary.actual_usd=null;
 return {runs:rowsOut,summary:{runs:rowsOut.length,unique_leads:metric(records.length,complete,incomplete),
  outcomes:Object.fromEntries(Object.keys(rank).map(k=>[k,metric(records.filter(r=>r.outcome===k).length,complete,incomplete)])),
  categories:catCounts,historical_opportunities:metric(records.filter(r=>r.historical).length,complete&&categoryComplete,'Historical subtype attribution is incomplete.'),
  unclassified_known_leads:records.filter(r=>!r.categories.size).length,
  run_events:Object.fromEntries(Object.keys(rank).map(k=>[k,metric(rowsOut.reduce((sum,r)=>sum+r.leads[k].known_subtotal,0),complete,incomplete)])),
  candidates_attention:metric(attention.size,attentionComplete,'Some candidate dispositions are unavailable.'),validation_failures:metric(validation.size,attentionComplete,'Some candidate dispositions are unavailable.'),
  sources_attention:sourceIds.size,route_gaps:routeGaps.size,
  timing:{average_ms:n?durationSamples.reduce((a,b)=>a+b,0)/n:null,median_ms:n?(durationSamples[Math.floor((n-1)/2)]+durationSamples[Math.floor(n/2)])/2:null,samples:n,excluded:rowsOut.length-n},usage:summary},
  coverage:{first_run:periodRuns.map(r=>r.created_at).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null,last_run:periodRuns.map(r=>r.created_at).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null,
   verified_identity_runs:rowsOut.filter(r=>r.leads.added.completeness==='known').length,total_runs:rowsOut.length}};
}

// Hard read bounds are explicit failures, never silent truncated aggregates.
// Each request computes the full filtered selection before paging public rows.
export function adminAnalytics(db,{now=()=>new Date()}={}){
 return async({limit=25,offset=0,snapshot,...input}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||snapshot&&!/^[a-f0-9]{64}$/.test(snapshot))throw Error('Invalid analytics pagination');
  const f=analyticsFilters(input,now());
  const scope=q=>{
   q=q.lte('created_at',f.as_of);if(f.schedule==='none')q=q.is('schedule_id',null);else if(f.schedule)q=q.eq('schedule_id',f.schedule);
   if(f.target)q=q.eq('target_kind',f.target);if(f.origin)q=q.eq('origin',f.origin);if(f.run)q=q.eq('id',f.run);if(f.outcome)q=q.eq('state',f.outcome);
   if(f.geography==='05')q=q.in('target_kind',['state_source','sam']);else if(f.geography)q=q.contains('config',{county_ids:[f.geography]});
   if(f.category)q=q.contains('config',{requested_categories:[f.category]});return q;
  };
  const runColumns='id,target_kind,state,created_at,finished_at,origin,schedule_id,config';
  const runs=await rows(db,'procurement_triggers',q=>{q=scope(q);if(f.start)q=q.gte('created_at',f.start);return q.lt('created_at',f.end);},runColumns,{limit:2000});
  const batch=async(table,column,ids,columns)=>{const result=[],keys=[...new Set(ids)];for(let i=0;i<keys.length;i+=50){result.push(...await rows(db,table,q=>q.in(column,keys.slice(i,i+50)),columns));if(result.length>=10000)throw Error('Scoped read exceeded bound; narrow the query before proceeding');}return result;};
  const periodIds=new Set(runs.map(r=>r.id)),usageColumns='id,trigger_id,created_at,state,actual_usd,reserved_usd,usage';
  // Spend is attributed by ledger event date, including events from older runs.
  // Global reports read the requested period, not the entire trigger history.
  const usage=f.period==='all'?await batch('procurement_usage_ledger','trigger_id',[...periodIds],usageColumns):await rows(db,'procurement_usage_ledger',q=>q.gte('created_at',f.start).lt('created_at',f.end).lte('created_at',f.as_of),usageColumns);
  const olderIds=[...new Set(usage.map(u=>u.trigger_id).filter(id=>id&&!periodIds.has(id)))];
  for(let i=0;i<olderIds.length;i+=50)runs.push(...await rows(db,'procurement_triggers',q=>scope(q).in('id',olderIds.slice(i,i+50)),runColumns));
  const [children,steps]=await Promise.all([batch('procurement_trigger_requests','trigger_id',[...periodIds],'trigger_id,request_id,role'),
   batch('procurement_workflow_steps','trigger_id',[...periodIds],'id,trigger_id,started_at,finished_at')]);
  const requests=children.map(c=>c.request_id);
  const [projected,targets]=await Promise.all([batch('procurement_jobs','search_request_id',requests,'id,search_request_id,task_id,kind,state,updated_at,a:checkpoint->automatic,r:checkpoint->receipt,c:checkpoint->county_records,v:checkpoint->reporting_records,s:checkpoint->>stage,b:checkpoint->>blocker,e:checkpoint->>error_code,h:checkpoint->hosted_browser_attempt,t:checkpoint->>task_id,sx:checkpoint->automatic_exclusions,sc:checkpoint->automatic_completed'),batch('procurement_request_targets','search_request_id',requests,'id,search_request_id,geography_id,target_key')]);
  const jobs=projected.map(j=>({...j,checkpoint:{automatic:j.a,receipt:j.r,county_records:j.c,reporting_records:j.v,stage:j.s,blocker:j.b,error_code:j.e,hosted_browser_attempt:j.h,task_id:j.t,sam_exclusions:j.sx,sam_completed:j.sc}}));
  const exclusionIds=jobs.flatMap(j=>(j.checkpoint.automatic?.exclusions??j.checkpoint.sam_exclusions??[]).map(e=>e.intake_id)).filter(Boolean);
  const [tasks,intakes]=await Promise.all([batch('procurement_coverage_tasks','target_id',targets.map(t=>t.id),'id,target_id,source_id,kind,state,reason'),batch('procurement_intake_items','id',exclusionIds,'id,status,category:payload->>bid_type')]);
  const result=aggregateAnalytics({runs,jobs,children,usage,steps,tasks,targets,intakes},f);
  const fingerprint=hash(result);if(snapshot&&snapshot!==fingerprint)throw Error('Analytics changed; refresh this report before paging.');
  const factor=f.direction==='asc'?1:-1;
  result.runs.sort((a,b)=>{const av=f.sort==='activity'?a.timing.recorded_activity_ms:f.sort==='created_at'?a.created_at:a.leads[f.sort].value,bv=f.sort==='activity'?b.timing.recorded_activity_ms:f.sort==='created_at'?b.created_at:b.leads[f.sort].value;return av===null?(bv===null?a.id.localeCompare(b.id):1):bv===null?-1:factor*(av<bv?-1:av>bv?1:a.id.localeCompare(b.id));});
  const items=result.runs.slice(offset,offset+limit),pageIds=new Set(items.map(r=>r.id));
  const presentations=await countyPresentations(db,runs.filter(r=>pageIds.has(r.id)),{children});
  for(const item of items)if(presentations.get(item.id))item.presentation=presentations.get(item.id);
  delete result.runs;
  return {...result,items,total:periodIds.size,next_offset:offset+limit<periodIds.size?offset+limit:null,snapshot:fingerprint,as_of:f.as_of,filters:f,
   basis:{leads:'Run creation date · distinct lead IDs; category as imported',usage:'Ledger event date · full usage of matching runs, not allocated by category',timezone:'America/Chicago',bound:'Fewer than 2,000 period runs and 10,000 rows per relation; narrow period/scope if exceeded'}};
 };
}
