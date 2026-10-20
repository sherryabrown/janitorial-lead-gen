import {hash,planReviewedBatch,BatchValidationError} from './reviewed-batch.mjs';
import {checked,one,rows} from './hosted-store.mjs';
export const countyAutomaticPolicy='county-automatic-v1';
export async function countyAuthority(db,request,{runnable=true}={}) {
 if(request?.workflow_control?.admin_policy!=='county_scope'||request.workflow_control.check_updates===false||!request.cities_confirmed_at||runnable&&request.workflow_control.cancelled)return false;
 const links=await rows(db,'procurement_trigger_requests',q=>q.eq('request_id',request.id));
 const link=links.find(l=>l.role==='county'&&l.trigger_id===request.workflow_control.admin_trigger_id);
 const trigger=link&&await one(db,'procurement_triggers',link.trigger_id);
 if(!trigger||trigger.target_kind!=='county_scope'||trigger.config.check_updates===false||trigger.initiated_by!==request.initiated_by)return false;
 if(runnable&&(!checked(await db.rpc('procurement_schedule_owner_active',{p_actor:request.initiated_by,p_now:new Date().toISOString()}))||
   !checked(await db.rpc('procurement_scheduled_request_runnable',{p_request:request.id}))))return false;
 return true;
}
export function automaticCountyReview({request,candidates,proofs,exclusions=[],snapshot}) {
 const bindings=proofs.filter(p=>candidates.some(i=>i.id===p.intake_id)).sort((a,b)=>a.intake_id.localeCompare(b.intake_id));
 const key=hash({policy:countyAutomaticPolicy,validation_revision:2,request:request.id,bindings,candidates:candidates.map(i=>[i.id,hash(i.payload)]).sort()});
 const review={version:1,batch:`county-auto-${key.slice(0,48)}`,project_ref:snapshot.project_ref,request_id:request.id,work_state:'AR',
  scope:'Confirmed county and selected cities; current validated official evidence and requested dates',limitations:'Valid saved records only; unresolved sources are not complete coverage',
  reviewed_by:`system:${countyAutomaticPolicy}`,run_ids:[],authorization:{kind:'automatic_county_policy',version:countyAutomaticPolicy,bindings},decisions:[]};
 const rejected=[...exclusions],groups=new Map();
 for(const i of candidates){
  if(!bindings.some(p=>p.intake_id===i.id&&p.payload_hash===hash(i.payload))){rejected.push({intake_id:i.id,title:i.payload.title,reason:'Current validated evidence is required.'});continue;}
  const identity=i.payload.manual_capture?.record_external_id??i.external_id,k=`${i.source_id}/${identity}`;
  const group=groups.get(k)??[];group.push(i);groups.set(k,group);
 }
 for(const group of groups.values()){
  // Multiple current routes may observe one bid. Never choose between conflicting facts.
  const facts=i=>hash(Object.fromEntries(Object.entries(i.payload).filter(([k])=>!['manual_capture','known_source_interpretation'].includes(k))));
  if(new Set(group.map(facts)).size>1){rejected.push(...group.map(i=>({intake_id:i.id,title:i.payload.title,reason:'Conflicting current observations require correction.'})));continue;}
  const i=group.sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??'')||a.id.localeCompare(b.id))[0];
  const external=i.payload.manual_capture?.record_external_id??i.external_id;
  const parent=i.payload.manual_capture?.amends_intake_id&&snapshot.procurement_intake_items.find(p=>p.id===i.payload.manual_capture.amends_intake_id);
  const existing=snapshot.procurement_leads.filter(l=>l.source_id===i.source_id&&l.external_id===external);
  if(!existing.length&&snapshot.procurement_leads.some(l=>l.source_id!==i.source_id&&l.payload.source_url===i.payload.source_url&&
    (l.external_id===external||i.payload.solicitation_id&&l.payload.solicitation_id===i.payload.solicitation_id))){
    rejected.push({intake_id:i.id,title:i.payload.title,reason:'This exact record exists under another source; reconcile its identity mapping.'});continue;
  }
  if(existing.length===1&&existing[0].payload.bid_type!==i.payload.bid_type){
    rejected.push({intake_id:i.id,title:i.payload.title,reason:'Existing lead classification conflicts with this observation; verified transition evidence is required.'});continue;
  }
  const d={intake_id:i.id,intake_hash:hash(i.payload),action:'process',approve_new:true,automatic_county_update:true,
   reason:'Automatically validated against current official county evidence.',request_match_reason:'Literal work-site evidence matches the saved county or confirmed city and requested date window.',
   ...(parent?.status==='pending'?{supersedes_pending_intake_id:parent.id}:{})};
  try{planReviewedBatch(snapshot,{...review,decisions:[d]},[]);review.decisions.push(d);}
  catch(e){if(!(e instanceof BatchValidationError))throw e;rejected.push({intake_id:i.id,title:i.payload.title,reason:'Evidence, identity or canonical validation did not pass; inspect saved details.'});}
 }
 if(review.decisions.length)planReviewedBatch(snapshot,review,[]);
 return {key,review,exclusions:rejected};
}
export function countyImportStatus(jobs) {
 const automatic=jobs.filter(j=>j.checkpoint?.automatic?.policy===countyAutomaticPolicy);
 const verified=automatic.filter(j=>j.checkpoint.receipt?.verified),records=new Map();
 for(const j of verified)for(const r of j.checkpoint.county_records??[]){const old=records.get(r.id);records.set(r.id,{...r,added:old?.added||r.added,updated:old?.updated||r.updated});}
 const savedIntakes=new Set(verified.flatMap(j=>(j.checkpoint.county_records??[]).flatMap(r=>r.intake_ids??[])));
 const exceptions=[...new Map(automatic.flatMap(j=>j.checkpoint.automatic.exclusions??[]).filter(e=>!savedIntakes.has(e.intake_id)).map(e=>[e.intake_id,e])).values()];
 return {policy:countyAutomaticPolicy,verified:automatic.length>0&&automatic.every(j=>j.checkpoint.receipt?.verified),
  state:jobs.some(j=>j.dedupe_key?.startsWith('api-import:')&&(j.state==='outcome_unknown'||j.checkpoint?.stage==='import_reconcile'))||automatic.some(j=>j.state==='outcome_unknown'||j.checkpoint.stage==='import_reconcile')?'outcome_unknown':automatic.some(j=>['pending','running'].includes(j.state))?'saving':automatic.some(j=>j.state==='blocked')?'blocked':verified.length?'verified':'pending',
  added:[...records.values()].filter(r=>r.added).length,updated:[...records.values()].filter(r=>!r.added&&r.updated).length,unchanged:[...records.values()].filter(r=>!r.added&&!r.updated).length,
  exclusions:exceptions,job_ids:automatic.map(j=>j.id)};
}
