import { JSDOM, VirtualConsole } from 'jsdom';
import { fetchPublicCheck } from './public-source-check.mjs';
import { safePublicUrl } from './known-source-execution.mjs';
export const countyDirectory = 'https://www.arcounties.org/counties/';
export const municipalDirectory = 'https://www.armunileague.org/member-directory/';
const normalize = s => String(s ?? '').toLowerCase().replace(/\s+county$/, '').replace(/\s+/g, ' ').trim();
function document(body, url, operation) {
  const dom = new JSDOM(body.toString('utf8'), { url, virtualConsole: new VirtualConsole() });
  try { return operation(dom.window.document); } finally { dom.window.close(); }
}
function publicLink(anchor) {
  if(!anchor)return null;
  try {const url=new URL(anchor.href);if(url.protocol==='http:')url.protocol='https:';
    return safePublicUrl(url.href,[url.hostname])?url.href:null;} catch{return null;}
}
export function countyProfile(body, geography) {
  return document(body,countyDirectory,doc=>{
    const matches=[...doc.querySelectorAll('.county a[href]')].filter(a=>normalize(a.textContent)===normalize(geography.name));
    const url=matches.length===1?publicLink(matches[0]):null;
    return url&&new URL(url).hostname===new URL(countyDirectory).hostname?url:null;
  });
}
export function directoryWebsite(body,url,geography) {
  return document(body,url,doc=>{
    let links=[];
    if(geography.kind==='county') {
      const heading=[...doc.querySelectorAll('h2')].find(h=>normalize(h.textContent)===normalize(geography.name));
      if(!heading)return null;
      // County contact block is the content following the matched heading. Do
      // not accept unrelated footer/vendor links elsewhere in the directory.
      let node=heading.nextElementSibling;
      while(node&&!/^H[12]$/.test(node.tagName)) {
        links.push(...[...node.querySelectorAll('a[href]')].filter(a=>/^(?:https?:\/\/)?www\./i.test(a.textContent.trim())));
        if(node.matches('a[href]'))links.push(node);
        node=node.nextElementSibling;
      }
    }else if(geography.kind==='municipality') {
      for(const row of doc.querySelectorAll('tbody tr')) {
        const cells=[...row.querySelectorAll('td')];
        if(cells.length!==17||normalize(cells[0].textContent)!==normalize(geography.name)||cells[11].textContent.trim()!=='AR')continue;
        links.push(...cells[16].querySelectorAll('a[href]'));
      }
    }
    const urls=[...new Set(links.map(publicLink).filter(Boolean))];
    return urls.length===1?urls[0]:null;
  });
}
export function municipalLookup(body,name) {
  return document(body,municipalDirectory,doc=>{
    const input=[...doc.querySelectorAll('input')].find(e=>e.value.includes('"serverSide"'));
    if(!input)throw Error('Municipal directory configuration unavailable');
    const config=JSON.parse(input.value),params=config.dataTableParams;
    const url='https://www.armunileague.org/wp-admin/admin-ajax.php?action=get_wdtable&table_id=10';
    const nonce=doc.querySelector('#wdtNonceFrontendServerSide_10')?.value;
    if(config.tableWpId!==10||params?.ajax?.url!==url||params.columnDefs?.length!==17||!nonce)
      throw Error('Municipal directory contract changed');
    const form=new URLSearchParams({draw:'1',start:'0',length:'100','search[value]':name,'search[regex]':'false',wdtNonce:nonce});
    for(const [i,column] of params.columnDefs.entries()) {
      for(const [key,value] of Object.entries({data:i,name:column.name,searchable:column.searchable,orderable:column.orderable}))
        form.set(`columns[${i}][${key}]`,String(value));
      form.set(`columns[${i}][search][value]`,'');form.set(`columns[${i}][search][regex]`,'false');
    }
    return {url,form};
  });
}
export function municipalWebsite(body,geography) {
  const data=JSON.parse(body.toString('utf8'));
  if(!Array.isArray(data.data)||data.data.length>100||Number(data.recordsFiltered)!==data.data.length)
    throw Error('Municipal lookup is incomplete');
  const urls=[];
  for(const row of data.data)if(row.length===17&&normalize(row[0])===normalize(geography.name)&&row[11]==='AR') {
    document(Buffer.from(String(row[16])),municipalDirectory,doc=>{
      urls.push(...[...doc.querySelectorAll('a[href]')].map(publicLink).filter(Boolean));
    });
  }
  const unique=[...new Set(urls)];return unique.length===1?unique[0]:null;
}
export async function resolveOfficialDirectory(geography,{fetcher=fetch,capture=async()=>{}}={}) {
  if(geography?.state_code!=='AR'||!geography.source_active||!['county','municipality'].includes(geography.kind))
    return {state:'blocked',reason:'Official directory resolution does not support this geography'};
  const pages=[];
  async function read(url) {
    const result=await fetchPublicCheck({runner_id:'public-fetch',allowed_hosts:[new URL(url).hostname],max_bytes:2_000_000},url,fetcher);
    if(result.state!=='captured')return result;
    const evidence={url:result.final_url,content_sha256:result.content_sha256,content_type:result.content_type,body:result.body.toString('base64')};
    await capture(evidence);pages.push(evidence);return result;
  }
  let url=geography.kind==='county'?countyDirectory:municipalDirectory;
  let result=await read(url);
  if(result.state!=='captured')return {state:'blocked',reason:'Official directory unavailable',pages};
  if(geography.kind==='county') {
    url=countyProfile(result.body,geography);
    if(!url)return {state:'blocked',reason:'County is not identified in the official directory',pages};
    result=await read(url);
    if(result.state!=='captured')return {state:'blocked',reason:'County directory profile unavailable',pages};
  }
  let website=directoryWebsite(result.body,url,geography);
  if(!website&&geography.kind==='municipality') {
    try {
      const lookup=municipalLookup(result.body,geography.name);
      const response=await fetchPublicCheck({runner_id:'public-fetch',allowed_hosts:['www.armunileague.org'],max_bytes:2_000_000,response_format:'supporting-document-v1'},lookup.url,
        (destination,options)=>{
          if(destination!==lookup.url)throw Error('Directory POST redirect rejected');
          return fetcher(destination,{...options,method:'POST',headers:{...options.headers,'Content-Type':'application/x-www-form-urlencoded'},body:lookup.form.toString()});
        });
      if(response.state!=='captured')return {state:'blocked',reason:'Municipal directory lookup unavailable',pages};
      const evidence={url:response.final_url,content_sha256:response.content_sha256,content_type:response.content_type,body:response.body.toString('base64')};
      await capture(evidence);pages.push(evidence);website=municipalWebsite(response.body,geography);
    }catch{return {state:'blocked',reason:'Municipal directory could not verify this location',pages};}
  }
  return website?{state:'resolved',url:website,pages,geography_id:geography.id}:
    {state:'blocked',reason:'Official directory did not provide a unique website for this location; automated research capability needs extension',pages};
}
