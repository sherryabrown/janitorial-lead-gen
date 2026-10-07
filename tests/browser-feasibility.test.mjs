import test from 'node:test';
import assert from 'node:assert/strict';
import {browserFeasibility,startupBrowserBenchmark} from '../scripts/lib/browser-feasibility.mjs';
const url='https://nlr.ar.gov/departments/finance/commerce/';
function fixture({fail=false,peak=200000000}={}) {
  let connected=true,closed=false;const saved=new Map();
  return {options:{url,memory:async name=>name==='max'?536870912:peak,
    artifacts:{put:async bytes=>{const key=String(saved.size);saved.set(key,bytes);return key;},get:async key=>saved.get(key)},
    launch:async()=>({isConnected:()=>connected,close:async()=>{connected=false;},newContext:async()=>({
      close:async()=>{closed=true;},route:async()=>{},newPage:async()=>({goto:async()=>{if(fail)throw Error('private error');return {status:()=>200};},
        url:()=>url,content:async()=>'<html><body><script>secret</script><form><input value="secret"></form><p>Public commerce</p></body></html>',
        locator:()=>({count:async()=>0})})})})},saved,closed:()=>closed};
}
test('one public capture persists sanitized evidence and cleans browser',async()=>{
  const f=fixture(),r=await browserFeasibility(f.options);
  assert.equal(r.status,'passed');assert.equal(r.lead_coverage,false);assert.equal(r.ai_calls,0);assert.ok(f.closed());
  assert.doesNotMatch(f.saved.get(r.evidence_path).toString(),/secret|<script|<form/);
});
test('capture failure still cleans browser and persists truthful blocker',async()=>{
  const f=fixture({fail:true}),r=await browserFeasibility(f.options);
  assert.equal(r.status,'blocked');assert.ok(r.browser_closed);assert.ok(f.closed());assert.doesNotMatch(JSON.stringify(r),/private error/);
});
test('memory above Free limit cannot pass',async()=>{
  const r=await browserFeasibility(fixture({peak:600000000}).options);assert.equal(r.status,'blocked');
});
test('other URLs rejected before launch',async()=>{
  await assert.rejects(browserFeasibility({...fixture().options,url:'https://example.com/'}),/Registered/);
});
test('existing intent never launches another browser or reads sources',async()=>{
  const result=await startupBrowserBenchmark({id:'12345678-1234-1234-1234-123456789abc',
    db:{storage:{from:()=>({upload:async()=>({error:{code:'duplicate'}})})},from:()=>{throw Error('must not read');}}});
  assert.equal(result.status,'blocked');
});
