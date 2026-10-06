import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { safePublicUrl } from './known-source-execution.mjs';
import { accessHash, cleanAccessMetadata } from './source-access.mjs';
import { safeMetadata } from './research-persistence.mjs';

export function validateBrowserPages(input,spec,bodies) {
  const need=(ok,message)=>{if(!ok)throw new Error(message);};
  need(spec.runner_id==='authenticated-browser' && input.method_hash===accessHash(spec), 'Browser capture must bind the exact saved method');
  need(Array.isArray(input.pages) && input.pages.length>0 && input.pages.length<=spec.urls.length && bodies.length===input.pages.length,
    'Bounded browser pages required');
  need(typeof input.terminal_confirmed==='boolean' && typeof input.terminal_evidence==='string' && input.terminal_evidence.trim(), 'Explicit browser pagination evidence required');
  cleanAccessMetadata({terminal_evidence:input.terminal_evidence});
  const ids=new Set();
  return input.pages.map((page,index)=>{
    need(Object.keys(page).every(k=>['run_id','url','content_type','content_sha256','file','retrieved_at'].includes(k)) &&
      /^[a-f0-9-]{36}$/i.test(page.run_id ?? '') && !ids.has(page.run_id),'Unique audited browser run identity required');ids.add(page.run_id);
    need(safePublicUrl(page.url,spec.allowed_hosts) && spec.urls.includes(page.url),'Browser capture destination is not reviewed');
    const body=bodies[index];
    need(body.length>0 && body.length<=spec.max_bytes && createHash('sha256').update(body).digest('hex')===page.content_sha256,'Browser capture bytes/hash mismatch');
    need(/^(text\/html|text\/plain|application\/pdf)(;|$)/i.test(page.content_type),'Supported browser document required');
    need(Number.isFinite(Date.parse(page.retrieved_at)) && Date.parse(page.retrieved_at)<=Date.now(),'Browser capture retrieval timestamp required');
    if(/^text\//i.test(page.content_type)) {
      const raw=body.toString('utf8');safeMetadata({captured_text:raw});
      if(/^text\/html/i.test(page.content_type)) {
        const document=new JSDOM(raw).window.document;
        need(!document.querySelector('input[type="password"],input[type="hidden"],script') &&
          !/sign in|log in|login|access denied|forbidden|not found/i.test(document.title),'Save a sanitized listing/document, not a login page or session-bearing HTML');
      } else need(!/^\s*(sign in|log in|access denied|forbidden)\b/i.test(raw),'Login/error shell cannot become lead coverage');
    } else need(body.subarray(0,5).toString()==='%PDF-','Invalid PDF body');
    return {run_id:page.run_id,url:page.url,content_type:page.content_type,content_sha256:page.content_sha256,
      content_base64:body.toString('base64'),retrieved_at:page.retrieved_at};
  });
}
