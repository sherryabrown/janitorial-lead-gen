import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { checked,one,rows,artifactStore,encryptSession,decryptSession,sha } from './hosted-store.mjs';
import { safePublicUrl,adapterContract } from './known-source-execution.mjs';
import { accessHash,accessNext } from './source-access.mjs';
import { validateBrowserPages } from './authenticated-browser.mjs';
import { recordAccessEvent } from './source-access-store.mjs';
import {portalRecipe,sessionIdentity,validateSessionState,matchingSession,guardPortalContext,verifyPortalPage} from './portal-session.mjs';
import {readFile} from 'node:fs/promises';
import {fetchPublicCheck} from './public-source-check.mjs';

export function sanitizeBrowserDocument(html) {
  const dom=new JSDOM(html);
  try {
    for(const node of dom.window.document.querySelectorAll('script,style,input,form,iframe,noscript,template,header,nav,[hidden]'))node.remove();
    for(const element of dom.window.document.querySelectorAll('*'))for(const attribute of [...element.attributes])
      if(!['href','class','id','colspan','rowspan'].includes(attribute.name))element.removeAttribute(attribute.name);
    for(const link of dom.window.document.querySelectorAll('a[href]')) {
      try {if(!safePublicUrl(link.href,[new URL(link.href).hostname]))link.removeAttribute('href');}
      catch {link.removeAttribute('href');}
    }
    return Buffer.from(dom.serialize().replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email removed]'));
  }finally{dom.window.close();}
}
export function browserService({db,sessionKey,artifacts=artifactStore(db),secrets=name=>process.env[name],profile={},documentFetch=fetch,
  exclusive=operation=>operation(),launch=()=>chromium.launch({headless:true,timeout:30000}),
  memory=async name=>{try{return Number(await readFile(`/sys/fs/cgroup/memory.${name}`,'utf8'));}catch{return null;}}}) {
  async function saveDetails(h,details) {
    const saved=checked(await db.from('procurement_access_handoffs').update({details,updated_at:new Date().toISOString()})
      .eq('id',h.id).eq('updated_at',h.updated_at).select('id'));
    if(saved.length!==1)throw Error('Access changed concurrently; reread before continuing');
    return one(db,'procurement_access_handoffs',h.id);
  }
  async function event(h,actor,change) {
    return (await recordAccessEvent(db,h,{id:`hosted-access:${randomUUID()}`,at:new Date().toISOString(),
      provenance:'observed',actor:'researcher',evidence:[{reference:`actor:${actor}`,note:'Bounded hosted portal action; credentials and session excluded'}],...change})).record??h;
  }
  async function signup(h,recipe,actor) {
    const spec=recipe.signup;
    if(h.lifecycle?.account||!['not_started',undefined].includes(h.lifecycle?.stages.registration?.state))
      throw Error('Existing account/application must be resumed');
    if(!spec||spec.requires_terms!==false||spec.requires_new_password!==false||spec.fields.some(f=>!profile[f.profile_field]))
      return {handoff_id:h.id,state:'needs_attention',lead_coverage:false,
        next_action:'Complete the saved official signup password/terms or missing required business information directly; no form submitted'};
    let browser,context,attempt;
    try {
      browser=await launch();context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
      await guardPortalContext(context,recipe.allowed_hosts,{signIn:true});const page=await context.newPage();
      await page.goto(spec.url,{waitUntil:'domcontentloaded',timeout:30000});
      if(await page.locator('input[type="password"],iframe[src*="captcha"],input[name*="terms" i]').count())
        return {handoff_id:h.id,state:'needs_attention',lead_coverage:false,next_action:'Complete the official password, CAPTCHA or material terms directly; no signup submitted'};
      for(const field of spec.fields)await page.locator(field.selector).fill(profile[field.profile_field],{timeout:15000});
      attempt=`hosted-signup:${randomUUID()}`;
      h=await event(h,actor,{type:'submission_intent',attempt_id:attempt,authorization:'Current user-authorized routine free official portal signup',
        next_action:'Verify the saved signup submission outcome before any repeat'});
      await page.locator(spec.submit_selector).click({timeout:15000});
      await page.locator(spec.success_selector).waitFor({state:'visible',timeout:15000});
      h=await event(h,actor,{type:'stage',stage:'registration',state:'submitted',attempt_id:attempt,next_action:'Complete the official verification email; no password or code in chat'});
      h=await event(h,actor,{type:'stage',stage:'email_sent',state:'provider_reported',next_action:'Verify actual email receipt separately'});
      h=await event(h,actor,{type:'stage',stage:'email_verification',state:'awaiting_email',next_action:'Open the official verification email and complete its link directly, then resume this record'});
      await event(h,actor,{type:'reconcile_attempt',attempt_id:attempt,next_action:'Complete verification and sign in using this existing application'});
      return {handoff_id:h.id,state:'awaiting_email',lead_coverage:false,next_action:'Complete the official verification email and resume; no new signup needed'};
    } catch {
      if(attempt) {
        h=await one(db,'procurement_access_handoffs',h.id);
        await event(h,actor,{type:'stage',stage:'registration',state:'outcome_unknown',attempt_id:attempt,
          next_action:'Inspect the saved submission/account before any retry; do not create a duplicate'});
      }
      return {handoff_id:h.id,state:'blocked',lead_coverage:false,next_action:'Reconcile the saved signup attempt or inspect the official required action before resuming'};
    }finally{await context?.close();await browser?.close();}
  }
  async function establish(id,actor,input={}) {
    let h=await one(db,'procurement_access_handoffs',id),browser,context;
    if(!h||h.channel!=='portal')throw Error('Saved portal access record required');
    const resources={started_at:new Date().toISOString(),limit_bytes:await memory('max'),kernel_peak_before:await memory('peak')};
    const next=accessNext(h);
    if(h.lifecycle?.attempts.some(a=>!a.reconciled_at))return {handoff_id:id,state:'blocked',next,lead_coverage:false};
    try {
      const recipe=portalRecipe(h),saved=matchingSession(h,recipe);
      if(Buffer.from(sessionKey??'','base64').length!==32)throw Error('Private session encryption is not configured');
      if(Object.keys(input).some(k=>k!=='storage_state'))throw Error('Only bounded session state may be adopted');
      if(input.storage_state)validateSessionState(input.storage_state,recipe.allowed_hosts);
      const canLogin=recipe.login_steps?.length&&recipe.login_steps.filter(s=>s.action==='fill').every(s=>secrets(s.secret));
      if(!input.storage_state&&!saved&&!canLogin) {
        const existing=h.lifecycle?.account||h.lifecycle?.stages.registration?.state&&h.lifecycle.stages.registration.state!=='not_started';
        if(!existing&&recipe.signup)return signup(h,recipe,actor);
        const action=existing?'Provide the existing account through the private credential store or secure session handoff; do not create another account':
          'Complete the saved official free signup; enter the new password and required terms directly, then resume this same access record';
        h=await event(h,actor,{type:'blocker',actor:'user',blocker:'Private sign-in credentials or verified session required',next_action:action});
        return {handoff_id:id,state:'needs_attention',next_action:action,lead_coverage:false};
      }
      // No signup or resend occurs here. Intent survives interruption; sign-in is safely repeatable.
      h=await saveDetails(h,{...h.details,hosted_access_attempt:{id:randomUUID(),actor_id:actor,action:input.storage_state?'session_adoption':'sign_in',
        state:'started',at:new Date().toISOString(),recipe_hash:accessHash(recipe)}});
      browser=await launch();
      const state=input.storage_state??(saved?JSON.parse(decryptSession(await artifacts.get(saved.artifact),sessionKey,sessionIdentity(h)).toString()):undefined);
      if(state)validateSessionState(state,recipe.allowed_hosts);
      context=await browser.newContext({...(state?{storageState:state}:{}),acceptDownloads:false,serviceWorkers:'block'});
      await guardPortalContext(context,recipe.allowed_hosts,{signIn:!state});
      let page=await context.newPage();
      const signIn=async()=>{
        await page.goto(recipe.entry_url,{waitUntil:'domcontentloaded',timeout:30000});
        for(const step of recipe.login_steps) {
          if(await page.locator('iframe[src*="captcha"]').count())throw Error('Human authentication challenge remains');
          const locator=page.locator(step.selector);
          if(step.action==='fill')await locator.fill(secrets(step.secret),{timeout:15000});
          else await locator.click({timeout:15000});
        }
        if(recipe.sign_in_complete_url) {
          const destination=new URL(recipe.sign_in_complete_url);
          const intermediate=recipe.sign_in_intermediate_url&&new URL(recipe.sign_in_intermediate_url);
          const matches=(url,target)=>target&&url.origin===target.origin&&
            url.pathname.replace(/\/$/,'')===target.pathname.replace(/\/$/,'');
          // Do not interrupt an asynchronous provider login with tenant navigation.
          // Query strings may carry transient provider state; match only the reviewed route.
          await page.waitForURL(url=>!!(matches(url,destination)||matches(url,intermediate)),
          {waitUntil:'domcontentloaded',timeout:30000});
          // A reviewed post-login setup page is not access proof. Follow the saved
          // Portal destination without entering or submitting business registration.
          if(matches(new URL(page.url()),intermediate))
            await page.goto(recipe.verify_url,{waitUntil:'domcontentloaded',timeout:30000});
          await page.locator(recipe.authenticated_selector).waitFor({state:'visible',timeout:15000});
        }
      };
      if(!state)await signIn();
      try{await verifyPortalPage(page,recipe);}
      catch {
        if(!saved||input.storage_state||!canLogin||await page.locator('iframe[src*="captcha"]').count())throw Error('Human verification required');
        // One stale-session renewal. Never repeat signup or a challenge.
        await context.close();context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
        await guardPortalContext(context,recipe.allowed_hosts,{signIn:true});page=await context.newPage();
        await signIn();await verifyPortalPage(page,recipe);
      }
      const verified_until=new Date(Date.now()+Math.min(recipe.session_hours??8,24)*3600000).toISOString();
      const retained=validateSessionState(await context.storageState(),recipe.allowed_hosts);
      const artifact=await artifacts.put(encryptSession(Buffer.from(JSON.stringify(retained)),sessionKey,sessionIdentity(h)));
      h=await saveDetails(h,{...h.details,hosted_session:{artifact,identity:sessionIdentity(h),recipe_hash:accessHash(recipe),verified_until},
        hosted_access_attempt:{...h.details.hosted_access_attempt,state:'verified',finished_at:new Date().toISOString()}});
      h=await event(h,actor,{type:'account',account:{kind:'user_session',provider:h.tenant,reference:`hosted-session:${h.id}`},next_action:'Verify each requested category through the saved method'});
      h=await event(h,actor,{type:'stage',stage:'sign_in',state:'verified',verified_until,next_action:'Capture each requested category; successful sign-in is not lead coverage'});
      return {handoff_id:id,state:'signed_in',session_reused:!!saved,verified_until,lead_coverage:false,next_action:'Run the saved authenticated category capture',resources};
    } catch {
      h=await one(db,'procurement_access_handoffs',id);
      await event(h,actor,{type:'blocker',actor:'user',blocker:'Hosted portal authentication could not be verified',
        next_action:'Inspect the official portal for password, email verification, MFA/CAPTCHA or changed sign-in steps; resume the same record without duplicate signup'});
      return {handoff_id:id,state:'needs_attention',lead_coverage:false,next_action:'Complete the saved official authentication action; no successful login or lead coverage confirmed',resources};
    } finally {
      try{await context?.close();await browser?.close();resources.browser_closed=!!browser&&!browser.isConnected();}
      finally{resources.kernel_peak_after=await memory('peak');resources.finished_at=new Date().toISOString();
        resources.receipt_path=await artifacts.put({handoff_id:id,actor_id:actor,operation:'portal_access',lead_coverage:false,...resources});}
    }
  }
  async function continueAccess(id,actor) {
    const handoff=await one(db,'procurement_access_handoffs',id);
    if(!handoff || handoff.channel!=='portal')throw new Error('Saved portal access record required');
    if(handoff.details?.hosted_access_recipe)return exclusive(()=>establish(id,actor));
    // Do not infer or create duplicate accounts from a public shell. Existing lifecycle
    // intent/verification/human-action state remains authoritative until observed proof.
    const next=accessNext(handoff);
    await recordAccessEvent(db,handoff,{id:`hosted-handoff:${randomUUID()}`,type:'blocker',at:new Date().toISOString(),
      provenance:'observed',actor:'user',blocker:'Hosted signup/sign-in continuation needs a verified machine-readable access recipe or secure human session',
      next_action:next.action??'Complete the saved official sign-in/verification step; never send passwords or codes in chat',
      evidence:[{reference:`actor:${actor}`,note:'No signup submission or credential request was made'}]});
    return {handoff_id:id,state:'blocked',next};
  }
  async function capture(jobId,actor,expectedHandoff) {
    const resources={started_at:new Date().toISOString(),limit_bytes:await memory('max'),kernel_peak_before:await memory('peak')};
    const candidate=await one(db,'procurement_jobs',jobId),cap=candidate&&await one(db,'procurement_source_capabilities',candidate.capability_id);
    const source=cap&&await one(db,'procurement_sources',cap.source_id);
    const spec=cap&&adapterContract(cap,source),handoff=spec&&await one(db,'procurement_access_handoffs',spec.access_handoff_id);
    if(spec?.runner_id!=='authenticated-browser' || !handoff)throw new Error('Saved browser method required');
    if(expectedHandoff&&handoff.id!==expectedHandoff)throw Error('Browser job belongs to another access record');
    const session=handoff.details?.hosted_session;
    const recipe=portalRecipe(handoff);
    if(!matchingSession(handoff,recipe))throw new Error('Secure hosted session not available for this method; complete the saved sign-in handoff');
    if(candidate.checkpoint?.hosted_browser_attempt&&!['captured','not_saved'].includes(candidate.checkpoint.hosted_browser_attempt.state))
      throw new Error('Previous browser attempt requires capture/audit reconciliation before another request');
    const job=checked(await db.rpc('claim_procurement_known_job',{p_job_id:jobId}));
    if(!job)throw new Error('Browser job not claimable');
    const intent={...job.checkpoint,hosted_browser_attempt:{id:randomUUID(),actor_id:actor,at:new Date().toISOString(),
      method_hash:accessHash(cap.method_spec),requested_urls:spec.urls,state:'request_pending'}};
    intent.hosted_browser_attempt.run_ids=spec.urls.map(()=>randomUUID());
    const audited=checked(await db.from('procurement_jobs').update({checkpoint:intent}).eq('id',job.id).eq('lease_token',job.lease_token).select('id'));
    if(audited.length!==1)throw new Error('Browser request intent could not be saved; no navigation sent');
    const state=validateSessionState(JSON.parse(decryptSession(await artifacts.get(session.artifact),sessionKey,sessionIdentity(handoff)).toString()),recipe.allowed_hosts);
    const browser=await launch();
    try {
      const context=await browser.newContext({storageState:state,acceptDownloads:false,serviceWorkers:'block'});
      await guardPortalContext(context,[...new Set([...spec.allowed_hosts,...recipe.allowed_hosts])]);
      const page=await context.newPage();
      await verifyPortalPage(page,recipe);
      const bodies=[],pages=[];
      if(spec.urls.length>2)throw Error('Hosted browser page bound exceeded; narrow the saved method before collection');
      for(const url of spec.urls) {
        if(new URL(url).pathname.toLowerCase().endsWith('.pdf')) {
          const fetched=await fetchPublicCheck({...spec,runner_id:'public-fetch'},url,async(target,options)=>{
            const cookies=await context.cookies(target);
            return documentFetch(target,{...options,headers:{...options.headers,Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; ')}});
          });
          if(fetched.state!=='captured'||!/^application\/pdf/i.test(fetched.content_type??'')||fetched.final_url!==url)
            throw Error('Bounded authenticated PDF retrieval did not verify the reviewed document');
          const run_id=intent.hosted_browser_attempt.run_ids[pages.length];bodies.push(fetched.body);
          pages.push({run_id,url,content_type:'application/pdf',content_sha256:sha(fetched.body),retrieved_at:new Date().toISOString()});
          continue;
        }
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        if(response?.status()!==200 || !safePublicUrl(page.url(),spec.allowed_hosts) ||
          await page.locator('input[type="password"]').count() || /login|log in|sign in|captcha|access denied|forbidden/i.test(await page.title()))
          throw new Error('Sign-in/challenge/access page encountered; user action required');
        // Capture sanitized rendered evidence. Session material is retained only as encrypted private state.
        const raw=await page.content();if(Buffer.byteLength(raw)>spec.max_bytes)throw Error('Raw rendered capture exceeds saved byte bound');
        const bytes=sanitizeBrowserDocument(raw);
        if(bytes.length>spec.max_bytes)throw new Error('Rendered browser capture exceeds saved byte bound');
        const run_id=intent.hosted_browser_attempt.run_ids[pages.length];bodies.push(bytes);
        pages.push({run_id,url:page.url(),content_type:'text/html',content_sha256:sha(bytes),retrieved_at:new Date().toISOString()});
      }
      if(bodies.reduce((n,b)=>n+b.length,0)>2000000)throw Error('Hosted browser combined document bound exceeded; narrow the saved method');
      // Human-language pagination instructions are not deterministic terminal predicates.
      // Until a verified predicate exists, the capture is useful partial evidence only.
      const input={method_hash:accessHash(cap.method_spec),pages,terminal_confirmed:false,
        terminal_evidence:'Saved bounded rendered pages; terminal pagination has not been verified'};
      const savedPages=validateBrowserPages(input,cap.method_spec,bodies);
      const receipt=checked(await db.rpc('record_procurement_browser_capture',{p_handoff_id:handoff.id,p_job_id:job.id,
        p_lease_token:job.lease_token,p_method_spec:cap.method_spec,p_kind:cap.kind,p_pages:savedPages,
        p_terminal:false,p_terminal_evidence:input.terminal_evidence}));
      const current=await one(db,'procurement_jobs',job.id);
      const completed=checked(await db.from('procurement_jobs').update({checkpoint:{...current.checkpoint,
        hosted_browser_attempt:{...intent.hosted_browser_attempt,state:'captured',run_ids:pages.map(p=>p.run_id)}}})
        .eq('id',job.id).eq('updated_at',current.updated_at).select('id'));
      if(completed.length!==1)throw Error('Capture saved; reconcile checkpoint before another navigation');
      const encrypted=encryptSession(Buffer.from(JSON.stringify(validateSessionState(await context.storageState(),recipe.allowed_hosts))),sessionKey,sessionIdentity(handoff));
      const artifact=await artifacts.put(encrypted);
      const savedHandoff=await saveDetails(handoff,{...handoff.details,hosted_session:{...session,artifact}});
      await event(savedHandoff,actor,{type:'stage',stage:`${cap.kind}_access`,state:'accessible',run_id:pages[0].run_id,
        verified_until:session.verified_until,next_action:'Review bounded saved category evidence; access proof is not complete lead coverage'});
      return {receipt,actor_id:actor,state:'partial',resources,next_action:'Review captured evidence and verify the terminal method before claiming category coverage'};
    }finally{await browser.close();resources.browser_closed=!browser.isConnected();resources.kernel_peak_after=await memory('peak');resources.finished_at=new Date().toISOString();
      resources.receipt_path=await artifacts.put({job_id:jobId,actor_id:actor,operation:'portal_capture',...resources});}
  }
  async function reconcileCapture(handoffId,jobId) {
    const job=await one(db,'procurement_jobs',jobId),cap=job&&await one(db,'procurement_source_capabilities',job.capability_id);
    const attempt=job?.checkpoint?.hosted_browser_attempt;
    if(cap?.method_spec.access_handoff_id!==handoffId||!attempt?.run_ids?.length||attempt.method_hash!==accessHash(cap.method_spec))
      throw Error('Matching saved browser attempt required');
    if(job.state==='running'&&Date.parse(job.lease_until)>Date.now())throw Error('Browser attempt still leased; wait before reconciliation');
    const runs=await rows(db,'procurement_runs',q=>q.in('id',attempt.run_ids)),captures=await rows(db,'procurement_public_captures',q=>q.in('run_id',attempt.run_ids),'*',{order:'run_id'});
    if(runs.length&& (runs.length!==attempt.run_ids.length||captures.length!==runs.length||runs.some(r=>r.job_id!==job.id||
      r.detail?.state!=='content_saved'||r.source_id!==cap.source_id||accessHash(r.detail.method_spec)!==attempt.method_hash)||
      captures.some(c=>c.source_id!==cap.source_id||!runs.some(r=>r.id===c.run_id&&r.detail.content_sha256===c.content_sha256))))
      throw Error('Browser audit conflicts; operator reconciliation required');
    const state=runs.length?'captured':'not_saved';
    const changed=checked(await db.from('procurement_jobs').update({checkpoint:{...job.checkpoint,hosted_browser_attempt:{...attempt,state}},
      ...(state==='not_saved'?{state:'pending',lease_token:null,lease_until:null}:{})}).eq('id',job.id).eq('updated_at',job.updated_at).select('id'));
    if(changed.length!==1)throw Error('Browser audit changed concurrently; reread before retry');
    return {job_id:job.id,state,lead_coverage:false,next_action:state==='captured'?'Review saved category captures':'Resume the bounded read; no saved capture was found'};
  }
  return {continueAccess,capture:(id,actor,handoff)=>exclusive(()=>capture(id,actor,handoff)),
    reconcileCapture:(handoff,job)=>exclusive(()=>reconcileCapture(handoff,job)),
    captureWorker:async(id,actor)=>{
      const job=await one(db,'procurement_jobs',id),cap=job&&await one(db,'procurement_source_capabilities',job.capability_id);
      const handoff=cap&&await one(db,'procurement_access_handoffs',cap.method_spec.access_handoff_id);
      if(!handoff)throw Error('Saved browser access record required');
      if(!matchingSession(handoff,portalRecipe(handoff))) {
        const result=await establish(handoff.id,actor);
        if(result.state!=='signed_in')return result;
      }
      return capture(id,actor,handoff.id);
    },
    adoptSession:(id,input,actor)=>exclusive(()=>establish(id,actor,input))};
}
