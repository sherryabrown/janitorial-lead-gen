import { createHash } from 'node:crypto';
import { safePublicUrl } from './known-source-execution.mjs';

const acceptable = /^(text\/(html|plain|xml)|application\/(pdf|xml|xhtml\+xml))(;|$)/i;
export function contentChangeType(previousHashes, hash) {
  return previousHashes.includes(hash) ? 'unchanged' : previousHashes.length ? 'changed' : 'new';
}
export async function fetchPublicCheck(contract, requestedUrl, fetcher = fetch) {
  if (contract.runner_id !== 'public-fetch' || !safePublicUrl(requestedUrl, contract.allowed_hosts))
    throw new Error('Unreviewed public check URL');
  let url = requestedUrl;
  const redirects = [];
  for (let hop = 0; hop <= 2; hop++) {
    let response;
    try {
      response = await fetcher(url, { redirect: 'manual', headers: { Accept: 'text/html,application/pdf,text/plain,application/xml' },
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
      if (!safePublicUrl(next, contract.allowed_hosts))
        return { state: 'blocked', reason: 'Redirect leaves reviewed public hosts',
          requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
      redirects.push(next); url = next; continue;
    }
    if ([401,403,429].includes(response.status)) return { state: 'blocked', reason: `HTTP ${response.status}`,
      requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
    if (response.status !== 200) return { state: 'partial', reason: `HTTP ${response.status}`,
      requested_url: requestedUrl, final_url: url, redirects, upstream_status: response.status };
    const contentType = response.headers.get('content-type') || '';
    if (!acceptable.test(contentType)) return { state: 'partial', reason: `Unsupported content type: ${contentType || 'missing'}`,
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
