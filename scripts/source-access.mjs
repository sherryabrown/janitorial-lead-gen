import { readFileSync, existsSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { adminClient, project, serverKey } from './lib/supabase-admin.mjs';
import { validateApiContract, inspectApiPage } from '../supabase/functions/_shared/source-api.mjs';
import { validateBrowserPages } from './lib/authenticated-browser.mjs';
import { adapterContract } from './lib/known-source-execution.mjs';
import { accessNext, accessHash, legacyAccessEvents, matchLegacySource } from './lib/source-access.mjs';
import { recordAccessEvent } from './lib/source-access-store.mjs';

const [command, arg] = process.argv.slice(2);
const usage = 'Usage: node scripts/source-access.mjs list | status SOURCE_CODE | next HANDOFF_UUID | record EVENT.json | reconcile SOURCE_CODE | verify METHOD.json | capture BROWSER.json | activate METHOD.json';
if(!command || ['help','--help','-h'].includes(command)){console.log(usage);process.exit(0);}
if (!['list','status','next','record','reconcile','verify','capture','activate'].includes(command) ||
  (command === 'list' ? process.argv.length !== 3 : !arg || process.argv.length !== 4)) throw new Error(usage);
const db = adminClient();
async function rows(table, filter = q => q) {
  const result = [];
  for (let offset=0; ;offset+=1000) {
    const {data,error} = await filter(db.from(table).select('*')).range(offset,offset+999);
    if (error) throw new Error(`${table}: access lookup failed`);
    result.push(...data); if (data.length<1000) return result;
  }
}
const sources = await rows('procurement_sources');
const handoffs = await rows('procurement_access_handoffs');
function view(h) { return {id:h.id,source:sources.find(s=>s.id===h.source_id)?.code,channel:h.channel,
  tenant:h.tenant,revision:h.lifecycle_revision,stages:h.lifecycle?.stages,attempts:h.lifecycle?.attempts,
  next:accessNext(h)}; }
const record=(handoff,event)=>recordAccessEvent(db,handoff,event);
if (command==='capture') {
  const input=JSON.parse(readFileSync(arg,'utf8'));
  if(Object.keys(input).some(k=>!['handoff_id','job_id','verification','kind','method_spec','method_hash','pages','terminal_confirmed','terminal_evidence','verified_until'].includes(k)))
    throw new Error('Invalid browser capture envelope');
  const h=handoffs.find(h=>h.id===input.handoff_id);
  if(!h || h.channel!=='portal')throw new Error('Existing portal handoff required');
  let job=null,spec=input.method_spec;
  if(input.verification!==true) {
    job=(await rows('procurement_jobs',q=>q.eq('id',input.job_id)))[0];
    const cap=job ? (await rows('procurement_source_capabilities',q=>q.eq('id',job.capability_id)))[0] : null;
    if(!cap || cap.source_id!==h.source_id || cap.kind!==input.kind)throw new Error('Matching browser job/capability required');
    spec=cap.method_spec;
    adapterContract(cap,sources.find(s=>s.id===h.source_id));
  } else adapterContract({method:'browser',kind:input.kind,availability:'active',parser_version:'verification-v1',
    verified_at:new Date(Date.now()-1000).toISOString(),verified_until:input.verified_until,
    verification_evidence:{handoff_id:h.id},method_spec:spec},sources.find(s=>s.id===h.source_id));
  if(spec.access_handoff_id!==h.id)throw new Error('Browser method handoff mismatch');
  const root=realpathSync(resolve('outputs'))+sep;
  const bodies=input.pages.map(page=>{
    const file=realpathSync(resolve(page.file));
    if(!file.toLowerCase().startsWith(root.toLowerCase()) || statSync(file).size>spec.max_bytes)throw new Error('Browser capture file must be bounded and inside private outputs');
    return readFileSync(file);
  });
  const pages=validateBrowserPages(input,spec,bodies);
  const saved=await rows('procurement_public_captures',q=>q.in('run_id',pages.map(p=>p.run_id)));
  let receipt;
  if(saved.length) {
    if(saved.length!==pages.length || pages.some(p=>!saved.some(s=>s.run_id===p.run_id && s.source_id===h.source_id && s.content_sha256===p.content_sha256)))
      throw new Error('Browser capture outcome conflicts; reconcile saved audit');
    const audits=await rows('procurement_runs',q=>q.in('id',pages.map(p=>p.run_id)));
    if(audits.some(r=>r.job_id!==(job?.id ?? null) || accessHash(r.detail.method_spec)!==accessHash(spec)))throw new Error('Saved capture belongs to another method or job');
    receipt={status:'unchanged',run_ids:pages.map(p=>p.run_id)};
  } else {
    if(job) {
      const claimed=await db.rpc('claim_procurement_known_job',{p_job_id:job.id});
      if(claimed.error || !claimed.data)throw new Error('Browser job not claimable; inspect current lease');job=claimed.data;
    }
    const {data,error}=await db.rpc('record_procurement_browser_capture',{p_handoff_id:h.id,p_job_id:job?.id ?? null,
      p_lease_token:job?.lease_token ?? null,p_method_spec:spec,p_kind:input.kind,p_pages:pages,
      p_terminal:input.terminal_confirmed,p_terminal_evidence:input.terminal_evidence});
    if(error || !data)throw new Error('Browser capture transaction failed; inspect lease/audit before retry');receipt=data;
  }
  const captures=await rows('procurement_public_captures',q=>q.in('run_id',pages.map(p=>p.run_id)));
  if(captures.length!==pages.length)throw new Error('Browser capture readback incomplete');
  if(input.verification===true) {
    const run=(await rows('procurement_runs',q=>q.eq('id',pages[0].run_id)))[0];
    await record(h,{id:`verify:${run.id}:${input.kind}`,type:'stage',stage:`${input.kind}_access`,state:'accessible',
      at:run.finished_at,provenance:'observed',actor:'researcher',next_action:'Prepare verified method through reviewed registration',
      run_id:run.id,verified_until:input.verified_until,evidence:[{url:pages[0].url,note:'Saved signed-in category document; access proof is separate from lead coverage'}]});
  }
  console.log(JSON.stringify({receipt,next:'Create an interpretation packet for the saved task; review and persist findings through the existing workflow.'},null,2));
} else if (command==='verify') {
  const input=JSON.parse(readFileSync(arg,'utf8'));
  if(Object.keys(input).some(k=>!['run_id','spec','window','kind','verified_until'].includes(k)) || !['forecast','opportunity','award'].includes(input.kind)) throw new Error('Bounded method verification input required');
  validateApiContract(input.spec);
  const h=handoffs.find(h=>h.id===input.spec.access_handoff_id);
  if(!h || h.channel!=='api') throw new Error('Existing API handoff required');
  // Save attempt identity before calling the trusted server; reuse this file after uncertainty.
  if(!input.run_id) {input.run_id=randomUUID();writeFileSync(arg,JSON.stringify(input,null,2)+'\n');}
  const key=serverKey();let response;
  try {response=await fetch(`https://${project}.supabase.co/functions/v1/source-api`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
    body:JSON.stringify({verification:true,run_id:input.run_id,page_index:0,spec:input.spec,window:input.window,kind:input.kind}),signal:AbortSignal.timeout(60000)});} catch {throw new Error('API verification outcome unknown; inspect saved run ID before retry');}
  const receipt=await response.json();
  const run=(await rows('procurement_runs',q=>q.eq('id',input.run_id)))[0];
  if(!run || run.source_id!==h.source_id || run.detail?.state!=='content_saved')
    throw new Error(`API access not verified; inspect run ${input.run_id}. ${receipt.reason ?? receipt.error ?? 'Unknown outcome'}`);
  // An existing saved run is reusable after an uncertain function response.
  const capture=(await rows('procurement_public_captures',q=>q.eq('run_id',run.id)))[0];
  if(!capture)throw new Error('API verification capture readback failed');
  inspectApiPage(JSON.parse(Buffer.from(capture.content_base64,'base64').toString('utf8')),input.spec,0);
  if(accessHash(run.detail.method_spec)!==accessHash(input.spec) || accessHash(run.detail.query_window)!==accessHash(input.window))
    throw new Error('Verification run belongs to different method/query; reconcile attempt identity');
  if(run.detail.kind!==input.kind)throw new Error('Verification category does not match audited request');
  let current=h;
  for(const stage of ['request_verification',`${input.kind}_access`]) {
    const event={id:`verify:${run.id}:${stage}`,type:'stage',stage,state:stage==='request_verification'?'verified':'accessible',
      at:run.finished_at,provenance:'observed',actor:'researcher',next_action:'Prepare the verified capability through reviewed registration',
      run_id:run.id,verified_until:input.verified_until,evidence:[{url:input.spec.endpoint_url,note:'Minimal successful API request; this proves access, not complete lead coverage'}]};
    const saved=await record(current,event);if(saved.record)current=saved.record;
  }
  console.log(JSON.stringify({run_id:run.id,status:'access_verified',terminal:run.detail.terminal,next:accessNext(current)},null,2));
} else if (command==='activate') {
  const input=JSON.parse(readFileSync(arg,'utf8'));
  const h=handoffs.find(h=>h.id===input.handoff_id);
  const {usableAccess}=await import('./lib/source-access.mjs');
  if(!h || !usableAccess(h,input.kind))throw new Error('Current category-specific access proof required');
  const stage=h.lifecycle.stages[`${input.kind}_access`];
  const run=(await rows('procurement_runs',q=>q.eq('id',stage.run_id)))[0];
  if(!run || run.source_id!==h.source_id || accessHash(run.detail.method_spec)!==accessHash(input.method_spec))
    throw new Error('Activation method must match audited retrieval');
  const source=sources.find(s=>s.id===h.source_id);
  console.log(JSON.stringify({status:'prepared_not_registered',capability:{source_code:source.code,kind:input.kind,
    method:h.channel==='api'?'api':'browser',route_geography_id:input.route_geography_id,
    endpoint_url:input.method_spec.endpoint_url ?? input.method_spec.urls[0],official_entry_url:source.url,
    method_spec:input.method_spec,parser_version:input.parser_version,verified_at:stage.at,verified_until:stage.verified_until,
    verification_evidence:{run_id:stage.run_id,access_handoff_id:h.id}},
    next:'Include this capability in the existing reviewed register package; test/apply/read back before planning collection.'},null,2));
} else if (command==='list') console.log(JSON.stringify(handoffs.map(view),null,2));
else if (command==='record') {
  const input = JSON.parse(readFileSync(arg,'utf8'));
  if (Object.keys(input).some(k=>!['handoff_id','event'].includes(k))) throw new Error('Invalid event envelope');
  const handoff = handoffs.find(h=>h.id===input.handoff_id);
  if (!handoff) throw new Error('Existing handoff required');
  const saved = await record(handoff,input.event);
  console.log(JSON.stringify(saved.record ? {receipt:saved.receipt,next:accessNext(saved.record)} : saved,null,2));
} else if (command==='next') {
  const h = handoffs.find(h=>h.id===arg); if(!h) throw new Error('Existing handoff required');
  console.log(JSON.stringify(view(h),null,2));
} else {
  const source = sources.find(s=>s.code===arg); if(!source) throw new Error('Registered source code required');
  const selected = handoffs.filter(h=>h.source_id===source.id);
  if(command==='status') console.log(JSON.stringify(selected.map(view),null,2));
  else {
    const path='outputs/procurement-access/sources.json';
    const ledger=existsSync(path) ? JSON.parse(readFileSync(path,'utf8')).sources ?? [] : [];
    const legacy=ledger.filter(l=>matchLegacySource(l,sources)?.id===source.id);
    if(legacy.length>1) throw new Error('Ambiguous private ledger; reconcile source identity first');
    const registration=(await rows('procurement_registrations',q=>q.eq('source_id',source.id)))[0];
    const output=[];
    for(let h of selected) for(const event of legacyAccessEvents(h,legacy[0],registration)) {
      // Never use older local summaries to replace current operational proof.
      if(h.lifecycle?.stages?.[event.stage]?.provenance==='observed') continue;
      if(h.lifecycle?.stages?.[event.stage] && ['not_started','not_tested','unknown','not_issued'].includes(event.state)) continue;
      const saved=await record(h,event); if(saved.record) h=saved.record;
      output.push(saved.receipt ?? saved);
    }
    console.log(JSON.stringify({receipts:output,next:'Use source-access status to inspect current access; reconcile does not perform signup.'},null,2));
  }
}
