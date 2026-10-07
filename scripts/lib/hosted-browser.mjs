import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { checked,one,artifactStore,encryptSession,decryptSession,sha } from './hosted-store.mjs';
import { safePublicUrl,adapterContract } from './known-source-execution.mjs';
import { accessHash,accessNext } from './source-access.mjs';
import { validateBrowserPages } from './authenticated-browser.mjs';
import { recordAccessEvent } from './source-access-store.mjs';

export function sanitizeBrowserDocument(html) {
  const dom=new JSDOM(html);
  try {
    for(const node of dom.window.document.querySelectorAll('script,style,input,form,iframe,noscript,template'))node.remove();
    for(const element of dom.window.document.querySelectorAll('*'))for(const attribute of [...element.attributes])
      if(/^on|^data-/i.test(attribute.name))element.removeAttribute(attribute.name);
    for(const link of dom.window.document.querySelectorAll('a[href]')) {
      try {if(!safePublicUrl(link.href,[new URL(link.href).hostname]))link.removeAttribute('href');}
      catch {link.removeAttribute('href');}
    }
    return Buffer.from(dom.serialize());
  }finally{dom.window.close();}
}
export function browserService({db,sessionKey,artifacts=artifactStore(db),launch=()=>chromium.launch({headless:true})}) {
  async function continueAccess(id,actor) {
    const handoff=await one(db,'procurement_access_handoffs',id);
    if(!handoff || handoff.channel!=='portal')throw new Error('Saved portal access record required');
    // Do not infer or create duplicate accounts from a public shell. Existing lifecycle
    // intent/verification/human-action state remains authoritative until observed proof.
    const next=accessNext(handoff);
    await recordAccessEvent(db,handoff,{id:`hosted-handoff:${randomUUID()}`,type:'blocker',at:new Date().toISOString(),
      provenance:'observed',actor:'user',blocker:'Hosted signup/sign-in continuation needs a verified machine-readable access recipe or secure human session',
      next_action:next.action??'Complete the saved official sign-in/verification step; never send passwords or codes in chat',
      evidence:[{reference:`actor:${actor}`,note:'No signup submission or credential request was made'}]});
    return {handoff_id:id,state:'blocked',next};
  }
  async function capture(jobId,actor) {
    const candidate=await one(db,'procurement_jobs',jobId),cap=candidate&&await one(db,'procurement_source_capabilities',candidate.capability_id);
    const source=cap&&await one(db,'procurement_sources',cap.source_id);
    const spec=cap&&adapterContract(cap,source),handoff=spec&&await one(db,'procurement_access_handoffs',spec.access_handoff_id);
    if(spec?.runner_id!=='authenticated-browser' || !handoff)throw new Error('Saved browser method required');
    const session=handoff.details?.hosted_session;
    if(!session?.artifact || session.method_hash!==accessHash(cap.method_spec))throw new Error('Secure hosted session not available for this method; complete the saved sign-in handoff');
    if(candidate.checkpoint?.hosted_browser_attempt)throw new Error('Previous browser attempt requires capture/audit reconciliation before another request');
    const job=checked(await db.rpc('claim_procurement_known_job',{p_job_id:jobId}));
    if(!job)throw new Error('Browser job not claimable');
    const intent={...job.checkpoint,hosted_browser_attempt:{id:randomUUID(),actor_id:actor,at:new Date().toISOString(),
      method_hash:accessHash(cap.method_spec),requested_urls:spec.urls,state:'request_pending'}};
    const audited=checked(await db.from('procurement_jobs').update({checkpoint:intent}).eq('id',job.id).eq('lease_token',job.lease_token).select('id'));
    if(audited.length!==1)throw new Error('Browser request intent could not be saved; no navigation sent');
    const state=JSON.parse(decryptSession(await artifacts.get(session.artifact),sessionKey,handoff.tenant).toString());
    const browser=await launch();
    try {
      const context=await browser.newContext({storageState:state,acceptDownloads:false});
      await context.route('**/*',route=>{
        const url=route.request().url();
        if(!safePublicUrl(url,spec.allowed_hosts))return route.abort();return route.continue();
      });
      const page=await context.newPage();
      const bodies=[],pages=[];
      for(const url of spec.urls) {
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        if(response?.status()!==200 || !safePublicUrl(page.url(),spec.allowed_hosts) ||
          await page.locator('input[type="password"]').count() || /login|log in|sign in|captcha|access denied|forbidden/i.test(await page.title()))
          throw new Error('Sign-in/challenge/access page encountered; user action required');
        // Capture sanitized rendered evidence. Session material is retained only as encrypted private state.
        const bytes=sanitizeBrowserDocument(await page.content());
        if(bytes.length>spec.max_bytes)throw new Error('Rendered browser capture exceeds saved byte bound');
        const run_id=randomUUID();bodies.push(bytes);
        pages.push({run_id,url:page.url(),content_type:'text/html',content_sha256:sha(bytes),retrieved_at:new Date().toISOString()});
      }
      // Human-language pagination instructions are not deterministic terminal predicates.
      // Until a verified predicate exists, the capture is useful partial evidence only.
      const input={method_hash:accessHash(cap.method_spec),pages,terminal_confirmed:false,
        terminal_evidence:'Saved bounded rendered pages; terminal pagination has not been verified'};
      const savedPages=validateBrowserPages(input,cap.method_spec,bodies);
      const receipt=checked(await db.rpc('record_procurement_browser_capture',{p_handoff_id:handoff.id,p_job_id:job.id,
        p_lease_token:job.lease_token,p_method_spec:cap.method_spec,p_kind:cap.kind,p_pages:savedPages,
        p_terminal:false,p_terminal_evidence:input.terminal_evidence}));
      const encrypted=encryptSession(Buffer.from(JSON.stringify(await context.storageState())),sessionKey,handoff.tenant);
      const artifact=await artifacts.put(encrypted);
      checked(await db.from('procurement_access_handoffs').update({details:{...handoff.details,hosted_session:{...session,artifact}},
        updated_at:new Date().toISOString()}).eq('id',handoff.id).eq('updated_at',handoff.updated_at));
      return {receipt,actor_id:actor,state:'partial',next_action:'Review captured evidence and verify the terminal method before claiming category coverage'};
    }finally{await browser.close();}
  }
  return {continueAccess,capture};
}
