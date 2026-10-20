import test from 'node:test';import assert from 'node:assert/strict';
import {fetchLinkedDocument} from '../scripts/lib/public-linked-document.mjs';
const url='https://agency.example/contractors/',spec={runner_id:'public-fetch',allowed_hosts:['agency.example'],max_bytes:2000000,linked_document:{anchor_text:'View the Forecast'}};
const artifacts={async put(){return 'artifacts/'+'a'.repeat(64);}};
test('linked forecasts follow the currently published revision with immutable index provenance',async()=>{
 for(const revision of ['September','October']){
  const gets=[],fetcher=async target=>{gets.push(target);return new Response(target===url?`<a href="/docs/${revision}.pdf">View the Forecast</a>`:'%PDF-saved document',{headers:{'content-type':target===url?'text/html':'application/pdf'}});};
  const result=await fetchLinkedDocument(spec,url,{fetcher,artifacts});
  assert.equal(result.state,'captured');assert.equal(result.final_url,`https://agency.example/docs/${revision}.pdf`);
  assert.equal(result.linked_index.url,url);assert.equal(result.linked_index.artifact,'artifacts/'+'a'.repeat(64));assert.equal(gets.length,2);
 }
});
test('ambiguous, missing, external and non-PDF links never become empty forecast results',async()=>{
 for(const html of ['<main>Forecast</main>','<a href="https://other.example/a.pdf">View the Forecast</a>',
  '<a href="/a.pdf">View the Forecast</a><a href="/b.pdf">View the Forecast</a>','<a href="/login">View the Forecast</a>']){
  let gets=0;const result=await fetchLinkedDocument(spec,url,{artifacts,fetcher:async()=>{gets++;return new Response(html,{headers:{'content-type':'text/html'}});}});
  assert.equal(result.state,'partial');assert.equal(gets,1);
 }
 const result=await fetchLinkedDocument(spec,url,{artifacts,fetcher:async target=>new Response(target===url?'<a href="/a.pdf">View the Forecast</a>':'Sign in',{headers:{'content-type':'text/html'}})});
 assert.equal(result.state,'partial');assert.match(result.reason,/PDF/);assert.equal(result.body,undefined);
});
