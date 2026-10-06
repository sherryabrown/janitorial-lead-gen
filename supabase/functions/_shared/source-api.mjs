// Shared by the trusted edge function and offline tests. No provider or geography branches.
const need = (ok, message) => { if (!ok) throw new Error(message); };
const pathParts = path => {
  need(typeof path === 'string' && /^[A-Za-z0-9_ .-]{1,120}$/.test(path), 'Invalid JSON field path');
  const parts=path.split('.');
  need(!parts.some(p=>['__proto__','prototype','constructor'].includes(p)), 'Unsafe JSON field path');
  return parts;
};
export function apiField(value,path) { return pathParts(path).reduce((v,k)=>v?.[k],value); }
function setField(value,path,item) {
  const parts=pathParts(path); let at=value;
  for(const key of parts.slice(0,-1)) { need(at && typeof at==='object' && Object.hasOwn(at,key), 'Configured query path is missing'); at=at[key]; }
  need(at && typeof at==='object','Configured query parent is missing'); at[parts.at(-1)]=item;
}
export function safeApiUrl(value,hosts) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash &&
      Array.isArray(hosts) && hosts.includes(u.hostname) &&
      !/^(localhost|.*\.local|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname) && !u.hostname.includes(':') &&
      ![...u.searchParams.keys()].some(k=>/token|signature|credential|api.?key|password|secret|code/i.test(k));
  } catch { return false; }
}
export function validateApiContract(spec) {
  need(spec?.version===1 && spec.runner_id==='api-bounded' && spec.check_when==='each_request', 'Versioned API method required');
  const allowed=['version','runner_id','check_when','allowed_hosts','endpoint_url','http_method','max_bytes','max_pages','page_size',
    'query_defaults','pagination','date_paths','date_basis','response_format','auth','access_handoff_id','interpretation_guidance','kind','parser_version'];
  need(Object.keys(spec).every(k=>allowed.includes(k)), 'Unsupported API method field');
  need(spec.allowed_hosts?.length>0 && spec.allowed_hosts.length<=5 && spec.allowed_hosts.every(h=>/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) &&
    safeApiUrl(spec.endpoint_url,spec.allowed_hosts), 'Reviewed HTTPS API endpoint required');
  need(['GET','POST'].includes(spec.http_method) && spec.response_format==='bounded-json-v1', 'Supported read API format required');
  for(const [field,max] of [['max_bytes',2000000],['max_pages',10],['page_size',100]])
    need(Number.isInteger(spec[field]) && spec[field]>0 && spec[field]<=max,'API bound is invalid');
  need(spec.query_defaults && typeof spec.query_defaults==='object' && !Array.isArray(spec.query_defaults) &&
    JSON.stringify(spec.query_defaults).length<=10000,'Bounded query defaults required');
  need(['publication','award_date','expected_solicitation_date','contract_end_date'].includes(spec.date_basis), 'Documented date basis required');
  need(spec.date_paths && Object.keys(spec.date_paths).length===2 &&
    Object.hasOwn(spec.date_paths,'from') && Object.hasOwn(spec.date_paths,'to'), 'Explicit date field paths required');
  for(const path of Object.values(spec.date_paths)) pathParts(path);
  const p=spec.pagination;
  need(p && Object.keys(p).every(k=>['page_path','limit_path','records_path','terminal_path','terminal_value','page_response_path','first_page'].includes(k)) &&
    [0,1].includes(p.first_page) && typeof p.terminal_value==='boolean', 'Explicit terminal pagination required');
  for(const key of ['page_path','limit_path','records_path','terminal_path','page_response_path']) pathParts(p[key]);
  need(spec.auth && Object.keys(spec.auth).every(k=>['mode','header'].includes(k)) && ['none','header','bearer'].includes(spec.auth.mode), 'Supported API authentication required');
  if(spec.auth.mode==='header') need(['X-API-Key','Api-Key','Authorization'].includes(spec.auth.header),'Reviewed API credential header required');
  need(/^[a-f0-9-]{36}$/i.test(spec.access_handoff_id ?? ''),'Private access handoff reference required');
  // Request configuration contains references, never secrets.
  need(!/sb_secret_|Bearer\s|"(?:password|api_key|access_token|cookie|secret)"/i.test(JSON.stringify(spec)), 'Credential-bearing configuration rejected');
  return spec;
}
export function apiQuery(spec,window,page) {
  validateApiContract(spec);
  const valid=d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
  need(valid(window?.from) && valid(window?.to) && window.from<=window.to &&
    (window.date_basis ?? 'publication')===spec.date_basis,'API window does not match verified date basis');
  need(Number.isInteger(page) && page>=0 && page<spec.max_pages,'API page bound exceeded');
  const query=structuredClone(spec.query_defaults);
  setField(query,spec.date_paths.from,window.from); setField(query,spec.date_paths.to,window.to);
  setField(query,spec.pagination.page_path,page+spec.pagination.first_page);
  setField(query,spec.pagination.limit_path,spec.page_size);
  return query;
}
export function inspectApiPage(data,spec,page) {
  const rows=apiField(data,spec.pagination.records_path);
  const terminal=apiField(data,spec.pagination.terminal_path);
  need(Array.isArray(rows) && rows.length<=spec.page_size && rows.every(r=>r && typeof r==='object' && !Array.isArray(r)), 'Malformed API records');
  need(typeof terminal==='boolean' && apiField(data,spec.pagination.page_response_path)===page+spec.pagination.first_page, 'API pagination proof missing or mismatched');
  need(rows.length>0 || terminal===spec.pagination.terminal_value,'Empty nonterminal page is incomplete');
  return {count:rows.length,terminal:terminal===spec.pagination.terminal_value};
}
export function sanitizeApiData(value,secret='') {
  if(typeof value==='string') {
    let safe=secret ? value.split(secret).join('[REDACTED]').split(encodeURIComponent(secret)).join('[REDACTED]') : value;
    safe=safe.replace(/([?&](?:api.?key|token|signature|secret|password|code)=)[^&\s"<>]+/gi,'$1[REDACTED]');
    return safe;
  }
  if(Array.isArray(value)) return value.map(v=>sanitizeApiData(v,secret));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>
    [k,/password|token|api.?key|authorization|cookie|secret|credential/i.test(k) ? '[REDACTED]' : sanitizeApiData(v,secret)]));
  return value;
}
export async function fetchApiPage(spec,window,page,{fetcher=fetch,secret='',allowedHosts=spec.allowed_hosts,allowedEndpoints=[spec.endpoint_url]}={}) {
  validateApiContract(spec);
  need(spec.allowed_hosts.every(h=>allowedHosts.includes(h)), 'API host has not been approved for server execution');
  need(allowedEndpoints.includes(spec.endpoint_url), 'API endpoint has not been approved for server execution');
  const query=apiQuery(spec,window,page),headers={'Accept':'application/json'};
  if(spec.auth.mode!=='none') {
    need(secret && secret.length<=4096,'Secure API credential unavailable');
    headers[spec.auth.mode==='bearer' ? 'Authorization' : spec.auth.header]=spec.auth.mode==='bearer' ? `Bearer ${secret}` : secret;
  }
  const url=new URL(spec.endpoint_url);
  if(spec.http_method==='GET') for(const [k,v] of Object.entries(query)) {
    need(['string','number','boolean'].includes(typeof v),'GET parameters must be scalar'); url.searchParams.set(k,String(v));
  } else headers['Content-Type']='application/json';
  let response;
  try { response=await fetcher(url.href,{method:spec.http_method,headers,redirect:'manual',
    body:spec.http_method==='POST' ? JSON.stringify(query) : undefined,signal:AbortSignal.timeout(30000)}); }
  catch { return {state:'outcome_unknown',reason:'API request failed or timed out'}; }
  if(response.status!==200) return {state:[401,403,429].includes(response.status) ? 'blocked' : 'partial',
    upstream_status:response.status,reason:response.status>=300 && response.status<400 ? 'API redirect refused' : `HTTP ${response.status}`};
  if(!/^application\/json(;|$)/i.test(response.headers.get('content-type') ?? ''))
    return {state:'partial',upstream_status:200,reason:'API returned an unsupported content type'};
  const reader=response.body?.getReader(); if(!reader) return {state:'partial',upstream_status:200,reason:'Empty API response'};
  const chunks=[];let size=0;
  try {
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength;
      if(size>spec.max_bytes) {await reader.cancel();return {state:'partial',upstream_status:200,reason:'API response exceeds bound'};} chunks.push(value); }
    const body=new Uint8Array(size);let offset=0; for(const chunk of chunks) {body.set(chunk,offset);offset+=chunk.length;}
    const data=sanitizeApiData(JSON.parse(new TextDecoder().decode(body)),secret);
    const assessment=inspectApiPage(data,spec,page);
    return {state:'captured',upstream_status:200,query,data,...assessment};
  } catch {return {state:'partial',upstream_status:200,reason:'API stream, envelope or pagination could not be verified'};}
}
