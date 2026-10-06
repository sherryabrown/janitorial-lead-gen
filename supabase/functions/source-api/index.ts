import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateApiContract, fetchApiPage } from '../_shared/source-api.mjs';

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=/^[a-f0-9-]{36}$/i;
function serverKeys():string[] {
  try {return Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')).filter((v):v is string=>typeof v==='string' && v.startsWith('sb_secret_'));}
  catch {return [];}
}
const sha=async(body:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(b=>b.toString(16).padStart(2,'0')).join('');
const b64=(body:Uint8Array)=>{let text='';for(const byte of body)text+=String.fromCharCode(byte);return btoa(text);};

Deno.serve(async req=>{
  const keys=serverKeys();
  if(req.method!=='POST')return reply({error:'POST required'},405);
  if(!keys.length || !keys.includes(req.headers.get('apikey') ?? ''))return reply({error:'Server authorization required'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,keys[0]);
  let input;
  try { input=await req.json(); } catch {return reply({error:'Invalid JSON'},400);}
  if(!input || Object.keys(input).some(k=>!['run_id','capability_id','job_id','lease_token','page_index','verification','spec','window','kind'].includes(k)) ||
    !uuid.test(input.run_id ?? '') || !Number.isInteger(input.page_index))return reply({error:'Bounded execution identity required'},400);
  let spec,window,sourceId,kind,taskId=null,pageAttempt=0;
  if(input.verification===true) {
    spec=input.spec;window=input.window;kind=input.kind;
    if(!['forecast','opportunity','award'].includes(kind))return reply({error:'Verification category required'},400);
    try {validateApiContract(spec);}catch {return reply({error:'Invalid reviewed verification method'},400);}
  } else {
    if(!uuid.test(input.job_id ?? '') || !uuid.test(input.lease_token ?? '') || !uuid.test(input.capability_id ?? ''))return reply({error:'Leased job required'},400);
    const [{data:job,error:je},{data:cap,error:ce}]=await Promise.all([
      db.from('procurement_jobs').select('*').eq('id',input.job_id).single(),
      db.from('procurement_source_capabilities').select('*').eq('id',input.capability_id).single()]);
    if(je || ce || !job || !cap || job.state!=='running' || job.lease_token!==input.lease_token || Date.parse(job.lease_until)<=Date.now() ||
      job.capability_id!==cap.id || cap.availability!=='active' || Date.parse(cap.verified_until)<=Date.now())return reply({error:'Current leased API method required'},409);
    const {data:task,error:te}=await db.from('procurement_coverage_tasks').select('*').eq('id',job.task_id).single();
    if(te || !task || task.capability_id!==cap.id || task.source_id!==cap.source_id || task.kind!==cap.kind)return reply({error:'Routed task mismatch'},409);
    spec=cap.method_spec;window=task.query_window;sourceId=cap.source_id;kind=cap.kind;taskId=task.id;pageAttempt=job.attempts;
  }
  try {validateApiContract(spec);}catch {return reply({error:'Unsupported API method'},400);}
  const {data:handoff,error:he}=await db.from('procurement_access_handoffs').select('*').eq('id',spec.access_handoff_id).single();
  if(he || !handoff || handoff.channel!=='api' || sourceId && handoff.source_id!==sourceId)return reply({error:'Private API access handoff required'},409);
  sourceId=handoff.source_id;
  const {data:source}=await db.from('procurement_sources').select('code').eq('id',sourceId).single();
  if(!source || ['sam','sam-awards'].includes(source.code))return reply({error:'SAM remains on its separate statewide path'},400);
  const access=handoff.lifecycle,account=access?.account;
  const host=new URL(spec.endpoint_url).hostname;
  if(!account || ![handoff.tenant,handoff.details?.provider_host].includes(account.provider) ||
    !spec.allowed_hosts.includes(account.provider) || !spec.allowed_hosts.includes(host))return reply({error:'Reviewed provider account reference required'},409);
  if(input.verification!==true) {
    const valid=(stage:string,state:string)=>access.stages?.[stage]?.state===state && access.stages[stage].provenance==='observed' &&
      Date.parse(access.stages[stage].verified_until)>Date.now();
    const {data:cap}=await db.from('procurement_source_capabilities').select('kind').eq('id',input.capability_id).single();
    if(!valid('request_verification','verified') || !valid(`${cap?.kind}_access`,'accessible'))return reply({error:'API access proof is missing or expired'},409);
  }
  let secret='';
  if(spec.auth.mode==='none') {
    if(account.kind!=='public')return reply({error:'Public access reference required'},409);
  } else {
    if(account.kind!=='supabase_secret' || !/^PROCUREMENT_[A-Z0-9_]+$/.test(account.reference) || access.stages?.credential_issuance?.state!=='issued')
      return reply({error:'Secure issued credential reference required'},409);
    secret=Deno.env.get(account.reference) ?? '';
    if(!secret)return reply({error:'Referenced secure credential is unavailable'},503);
  }
  const {data:previous,error:pe}=await db.from('procurement_runs').select('id,detail').eq('id',input.run_id).maybeSingle();
  if(pe)return reply({error:'Cannot reconcile audit before request'},500);
  if(previous)return reply({error:'Run already attempted; inspect saved audit before retry',run_id:previous.id,state:previous.detail?.state},409);
  const detail={collector:'api-bounded',state:'request_pending',requested_url:spec.endpoint_url,
    method_spec:spec,query_window:window,kind,page_index:input.page_index,verification:input.verification===true,access_handoff_id:handoff.id};
  const {error:ie}=await db.from('procurement_runs').insert({id:input.run_id,source_id:sourceId,job_id:input.job_id ?? null,
    coverage_task_id:taskId,page_index:input.verification===true ? null : input.page_index,page_attempt:pageAttempt,started_at:new Date().toISOString(),status:'partial',detail});
  if(ie)return reply({error:'Cannot save audit; no upstream request sent'},409);
  let result;
  try {result=await fetchApiPage(spec,window,input.page_index,{secret,
    allowedHosts:(Deno.env.get('SOURCE_API_ALLOWED_HOSTS') ?? '').split(',').map(v=>v.trim()).filter(Boolean),
    allowedEndpoints:(Deno.env.get('SOURCE_API_ALLOWED_ENDPOINTS') ?? '').split(',').map(v=>v.trim()).filter(Boolean)});}
  catch {result={state:'blocked',reason:'Configured API request or server host policy could not be verified'};}
  let outcome={...detail,...result};
  if(result.state==='captured') {
    const body=new TextEncoder().encode(JSON.stringify(result.data));
    if(body.length>spec.max_bytes) result={state:'partial',reason:'Sanitized response exceeds capture bound'};
    else {
      const hash=await sha(body);
      const {error:se}=await db.from('procurement_public_captures').insert({run_id:input.run_id,source_id:sourceId,
        requested_url:spec.endpoint_url,final_url:spec.endpoint_url,content_type:'application/json',content_sha256:hash,content_base64:b64(body)});
      if(se)return reply({error:'Capture persistence uncertain; inspect audit before any retry',run_id:input.run_id},500);
      outcome={...detail,state:'content_saved',upstream_status:200,final_url:spec.endpoint_url,query:result.query,
        content_sha256:hash,content_type:'application/json',bytes:body.length,count:result.count,terminal:result.terminal};
    }
  }
  if(result.state!=='captured') outcome={...detail,state:result.state,reason:result.reason,upstream_status:result.upstream_status};
  const {error:ue}=await db.from('procurement_runs').update({detail:outcome,status:outcome.state==='content_saved' ? 'review_required' : result.state==='blocked' ? 'blocked' : 'partial',
    record_count:outcome.state==='content_saved' ? result.count : 0,finished_at:new Date().toISOString()}).eq('id',input.run_id);
  if(ue)return reply({error:'Audit update uncertain; reconcile before retry',run_id:input.run_id},500);
  return reply({captured:outcome.state==='content_saved',run_id:input.run_id,state:outcome.state,count:result.count ?? 0,
    terminal:result.terminal===true,reason:result.reason ?? null,upstream_status:result.upstream_status ?? null});
});
