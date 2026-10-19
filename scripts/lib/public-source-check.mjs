import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { safePublicUrl } from './known-source-execution.mjs';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const acceptable = /^(text\/(html|plain|xml)|application\/(pdf|xml|xhtml\+xml))(;|$)/i;

export const semanticSources = new Set([
  'arbuy-janitorial', 'arbuy', 'ariba', 'state-contracts', 'state-intents', 'state-other', 'dhs',
]);

export function semanticPublicHash(sourceCode, body) {
  if (!semanticSources.has(sourceCode)) return createHash('sha256').update(body).digest('hex');
  const document = new JSDOM(body.toString('utf8')).window.document;
  for (const element of document.querySelectorAll('script,style,noscript,template')) element.remove();
  const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();
  if (sourceCode === 'arbuy-janitorial') {
    const visible = clean(document.body?.textContent);
    const documents = [...document.querySelectorAll('a[href]')]
      .filter(anchor => /^javascript:downloadFile\('\d+'\);?$/i.test(anchor.getAttribute('href') ?? ''))
      .map(anchor => [clean(anchor.textContent), anchor.getAttribute('href')]);
    return createHash('sha256').update(JSON.stringify({ visible, documents })).digest('hex');
  }
  const rows = sourceCode === 'state-intents'
    ? [...document.querySelectorAll('tr.rowitem1_bold, tr.rowitem2_bold')]
    : [...document.querySelectorAll(sourceCode === 'dhs' ? '#table_1 tbody tr' : 'table tbody tr')];
  const values = rows.map(row => ({ text: clean(row.textContent),
    links: [...row.querySelectorAll('a[href]')].map(anchor => [clean(anchor.textContent), anchor.getAttribute('href')]) }));
  if (!values.length) return createHash('sha256').update(body).digest('hex');
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
export async function researchDestination(value,resolveHost=lookup) {
  try {
    const url=new URL(value),host=url.hostname;
    if(!safePublicUrl(value,[host])||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/(?:^|\.)(localhost|local|internal|lan|home)$/i.test(host))return false;
    const addresses=await resolveHost(host,{all:true,verbatim:true});
    return addresses.length>0&&addresses.every(({address})=>{
      if(isIP(address)===6)return /^[23][0-9a-f]{3}:/i.test(address);
      if(isIP(address)!==4)return false;
      const [a,b,c]=address.split('.').map(Number);
      return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&[0,2].includes(c))||a===100&&b>=64&&b<=127||a>=224||a===198&&[18,19].includes(b));
    });
  }catch{return false;}
}
export async function fetchPublicCheck(contract, requestedUrl, fetcher = fetch,{resolveHost=lookup,researchEntry}={}) {
  if (contract.runner_id !== 'public-fetch' || !safePublicUrl(requestedUrl, contract.allowed_hosts))
    throw new Error('Unreviewed public check URL');
  let url = requestedUrl;
  const redirects = [];
  const research=researchEntry&&safePublicUrl(researchEntry,[new URL(researchEntry).hostname]);
  if(research&&new URL(url).hostname.replace(/^www\./,'')!==new URL(researchEntry).hostname.replace(/^www\./,'')&&
      !await researchDestination(url,resolveHost))return {state:'blocked',reason:'Public research destination could not be validated',requested_url:requestedUrl,final_url:url,redirects};
  for (let hop = 0; hop <= 2; hop++) {
    let response;
    try {
      response = await fetcher(url, { redirect: 'manual', headers: { Accept:
        contract.response_format==='supporting-document-v1' ? 'application/json,text/html,application/pdf,text/plain,application/xml' :
          'text/html,application/pdf,text/plain,application/xml' },
        signal: AbortSignal.timeout(30000) });
    } catch {
      return { state: 'outcome_unknown', reason: 'Network request failed or timed out', requested_url: requestedUrl,
        final_url: url, redirects };
    }
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || hop === 2) return { state: 'partial', reason: 'Redirect limit or missing location',
        requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
      const next = new URL(location, url).toString();
      if (!safePublicUrl(next, contract.allowed_hosts)&&!(research&&await researchDestination(next,resolveHost)))
        return { state: 'blocked', reason: 'Redirect leaves reviewed public hosts',
          requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
      redirects.push(next); url = next; continue;
    }
    if ([401,403,429].includes(response.status)) return { state: 'blocked', reason: `HTTP ${response.status}`,
      requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
    if (response.status !== 200) return { state: 'partial', reason: `HTTP ${response.status}`,
      requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
    const contentType = response.headers.get('content-type') || '';
    if (!acceptable.test(contentType) &&
        !(['bonfire-projects-v1', 'bonfire-contracts-v1', 'supporting-document-v1'].includes(contract.response_format) &&
          /^application\/json(;|$)/i.test(contentType)))
      return { state: 'partial', reason: `Unsupported content type: ${contentType || 'missing'}`,
      requested_url: requestedUrl, final_url: url, redirects, upstream_status: 200 };
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > contract.max_bytes) return { state: 'partial',
      reason: 'Document exceeds verified byte bound', requested_url: requestedUrl, final_url: url,
      redirects, upstream_status: 200 };
    const reader = response.body?.getReader();
    if (!reader) return { state: 'partial', reason: 'Empty response body', requested_url: requestedUrl,
      final_url: url, redirects, upstream_status: 200 };
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > contract.max_bytes) {
          await reader.cancel();
          return { state: 'partial', reason: 'Document exceeds verified byte bound',
            requested_url: requestedUrl, final_url: url, redirects, upstream_status: 200 };
        }
        chunks.push(Buffer.from(value));
      }
    } catch {
      return { state: 'outcome_unknown', reason: 'Document stream failed',
        requested_url: requestedUrl, final_url: url, redirects, upstream_status: 200 };
    }
    if (!size) return { state: 'partial', reason: 'Empty response body', requested_url: requestedUrl,
      final_url: url, redirects, upstream_status: 200 };
    const body = Buffer.concat(chunks);
    return { state: 'captured', requested_url: requestedUrl, final_url: url, redirects,
      upstream_status: 200, content_type: contentType,
      content_sha256: createHash('sha256').update(body).digest('hex'), bytes: size, body };
  }
  throw new Error('Unreachable redirect loop');
}
