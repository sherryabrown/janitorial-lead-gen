import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateBrowserPages } from '../scripts/lib/authenticated-browser.mjs';
import { accessHash } from '../scripts/lib/source-access.mjs';
const spec={runner_id:'authenticated-browser',urls:['https://portal.example.gov/awards'],allowed_hosts:['portal.example.gov'],max_bytes:10000};
const body=Buffer.from('<html><title>Contract awards</title><table><tr><td>Janitorial contract</td></tr></table></html>');
const input=()=>({method_hash:accessHash(spec),terminal_confirmed:true,terminal_evidence:'Reviewed the single saved awards table and terminal page',
  pages:[{run_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',url:spec.urls[0],file:'outputs/fixture.html',content_type:'text/html',
    content_sha256:createHash('sha256').update(body).digest('hex'),retrieved_at:'2026-10-06T00:00:00Z'}]});
test('browser capture binds exact method, official destination, bytes and terminal evidence',()=>{
  const pages=validateBrowserPages(input(),spec,[body]);assert.equal(pages.length,1);assert.equal(pages[0].content_base64,body.toString('base64'));
  const wrong=input();wrong.method_hash='wrong';assert.throws(()=>validateBrowserPages(wrong,spec,[body]),/method/);
  const url=input();url.pages[0].url='https://other.gov/awards';assert.throws(()=>validateBrowserPages(url,spec,[body]),/destination/);
  assert.throws(()=>validateBrowserPages(input(),spec,[Buffer.from('changed')]),/hash/);
});
test('login shells, session-bearing HTML and credential-bearing document text are rejected',()=>{
  for(const raw of ['<title>Sign in</title><input type="password">','<title>Awards</title><script>session()</script>','<input type="hidden" value="fixture">','Use sb_secret_fixture_only']) {
    const data=Buffer.from(raw),manifest=input();manifest.pages[0].content_sha256=createHash('sha256').update(data).digest('hex');
    assert.throws(()=>validateBrowserPages(manifest,spec,[data]));
  }
});
