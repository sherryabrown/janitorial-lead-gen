import {JSDOM,VirtualConsole} from 'jsdom';
import {fetchPublicCheck} from './public-source-check.mjs';
import {safePublicUrl} from './known-source-execution.mjs';
import {auditPhase} from './workflow-audit.mjs';

// Follow one explicitly reviewed public PDF link on each run. The index remains
// immutable provenance, so revisions do not require a hardcoded filename.
export async function fetchLinkedDocument(contract,url,{fetcher=fetch,artifacts}={}) {
  const index=await fetchPublicCheck({...contract,response_format:undefined},url,fetcher);
  if(index.state!=='captured')return index;
  if(!/^text\/html/i.test(index.content_type??''))return {...index,body:undefined,state:'partial',reason:'Reviewed document index is not readable HTML'};
  const target=reviewedPdfLink(index.body,index.final_url,contract);
  if(!target)return {state:'partial',reason:'Reviewed public PDF link is missing, ambiguous or outside its verified origin',requested_url:url,final_url:index.final_url};
  if(!artifacts)throw Error('Immutable document-index evidence store required');
  const linked_index={url:index.final_url,content_sha256:index.content_sha256,artifact:await artifacts.put(index.body),retrieved_at:new Date().toISOString()};
  const document=await auditPhase('fetch_document',()=>fetchPublicCheck({...contract,response_format:undefined},target,fetcher));
  if(document.state==='captured'&&(!/^application\/pdf/i.test(document.content_type??'')||!document.body.subarray(0,5).equals(Buffer.from('%PDF-'))))
    return {state:'partial',reason:'Published document did not return a PDF; access or document validation required',requested_url:target,final_url:document.final_url,linked_index};
  return {...document,linked_index};
}
export function reviewedPdfLink(body,url,contract) {
  const dom=new JSDOM(body.toString('utf8'),{url,virtualConsole:new VirtualConsole()});
  let links;
  try {links=[...new Set([...dom.window.document.querySelectorAll('a[href]')]
    .filter(a=>a.textContent.replace(/\s+/g,' ').trim()===contract.linked_document.anchor_text).map(a=>a.href))];}
  finally{dom.window.close();}
  if(links.length!==1||!safePublicUrl(links[0],contract.allowed_hosts)||new URL(links[0]).origin!==new URL(url).origin||
      !/\.pdf$/i.test(new URL(links[0]).pathname))
    return null;
  return links[0];
}
