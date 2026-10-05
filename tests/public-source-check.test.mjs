import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterContract, buildKnownSourcePlan, registeredEntryContract, safePublicUrl } from '../scripts/lib/known-source-execution.mjs';
import { fetchPublicCheck, contentChangeType, semanticPublicHash } from '../scripts/lib/public-source-check.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source={id:id(1),code:'tasd-public-board',name:'TASD board',
  url:'https://www.tasd7.net/page/school-board-resources/',
  source_coverage_areas:[{area_type:'city',city_name:'Texarkana',state_code:'AR'}]};
const capability={id:id(2),source_id:source.id,route_geography_id:'ARM-TEXARKANA',
  kind:'award',method:'document',availability:'active',verified_at:'2026-01-01',
  verified_until:'2030-01-01',verification_evidence:{official_page:'reviewed'},parser_version:'public-capture-v1',
  method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',
    urls:['https://www.tasd7.net/page/school-board-resources/'],allowed_hosts:['www.tasd7.net'],max_bytes:2000}};

test('registered non-API source gets a check route, while its other categories need a method',()=>{
  const request={id:id(3),search_windows:{award:{from:'2026-10-01',to:'2026-10-31'}}};
  const targets=[{id:id(4),geography_id:'ARM-TEXARKANA',checkpoint:{route_order:0}}];
  const geographies=[{id:'ARM-TEXARKANA',kind:'municipality',name:'Texarkana',source_active:true}];
  const plan=buildKnownSourcePlan(request,targets,geographies,[capability],[source],new Date('2026-10-02'));
  assert.equal(plan.known,1);
  assert.equal(plan.tasks.find(t=>t.kind==='award').state,'unchecked');
  const gap=plan.tasks.find(t=>t.kind==='forecast');
  assert.equal(gap.state,'method_missing');
  assert.deepEqual(gap.evidence.registered_source_ids,[source.id]);
  assert.equal(adapterContract(capability,source).urls.length,1);
  assert.equal(plan.entry_checks,0,'verified document method does not also check the entry URL');
  const unverified=buildKnownSourcePlan(request,targets,geographies,[],[source],new Date('2026-10-02'));
  assert.equal(unverified.entry_checks,1);
  assert.equal(unverified.tasks.find(t=>t.kind==='source_entry').evidence.entry_url,source.url);
  assert.ok(unverified.tasks.some(t=>t.kind==='award'&&t.state==='method_missing'));
});

test('public check saves exact URL and hash without claiming zero results',async()=>{
  const contract=adapterContract(capability,source);
  const fetched=[];
  const result=await fetchPublicCheck(contract,contract.urls[0],async(url,options)=>{
    fetched.push({url,redirect:options.redirect});
    return new Response('<html>Board minutes</html>',{status:200,headers:{'content-type':'text/html'}});
  });
  assert.equal(result.state,'captured');
  assert.equal(result.requested_url,contract.urls[0]);
  assert.equal(result.content_sha256.length,64);
  assert.equal(result.body.toString(),'<html>Board minutes</html>');
  assert.deepEqual(fetched,[{url:contract.urls[0],redirect:'manual'}]);
  assert.equal(result.results_count,undefined);
});

test('the same URL and hash is unchanged; a new hash retains a changed version',()=>{
  assert.equal(contentChangeType([], 'a'.repeat(64)),'new');
  assert.equal(contentChangeType(['a'.repeat(64)], 'a'.repeat(64)),'unchanged');
  assert.equal(contentChangeType(['a'.repeat(64)], 'b'.repeat(64)),'changed');
});

test('ARBuy record fingerprint ignores page scripts but detects status and document changes', () => {
  const page = (script, status, documentId) => Buffer.from(`<html><body><script>${script}</script>` +
    `Bid Number: S000000473 ${status}<a href="javascript:downloadFile('${documentId}');">Solicitation</a>` +
    '</body></html>');
  const first = semanticPublicHash('arbuy-janitorial', page('nonceA', 'Intent to Award', '16273'));
  assert.equal(first, semanticPublicHash('arbuy-janitorial',
    page('nonceB', 'Intent to Award', '16273')));
  assert.notEqual(first, semanticPublicHash('arbuy-janitorial',
    page('nonceB', 'Awarded', '16273')));
  assert.notEqual(first, semanticPublicHash('arbuy-janitorial',
    page('nonceB', 'Intent to Award', '16274')));
});

test('state intent fingerprint ignores page clock but detects a new notice', () => {
  const page = (clock, notice) => Buffer.from(`<html><body>Notice - Anticipation to Award ${clock}` +
    `<table><tr class="rowitem1_bold"><td>${notice}</td>` +
    '<td><a href="https://sas.arkansas.gov/ata/notice/">Download</a></td></tr></table></body></html>');
  const first = semanticPublicHash('state-intents', page('07:12 PM', 'SP-27-022'));
  assert.equal(first, semanticPublicHash('state-intents', page('07:16 PM', 'SP-27-022')));
  assert.notEqual(first, semanticPublicHash('state-intents', page('07:16 PM', 'SP-27-023')));
});

test('ARBuy open-view fingerprint ignores session fields but detects a result row', () => {
  const page = (csrf, row) => Buffer.from(`<html><body><input value="${csrf}">` +
    `<table><tbody><tr><td>${row}</td></tr></tbody></table></body></html>`);
  const first = semanticPublicHash('arbuy', page('session-one', 'No records found.'));
  assert.equal(first, semanticPublicHash('arbuy', page('session-two', 'No records found.')));
  assert.notEqual(first, semanticPublicHash('arbuy', page('session-two', 'SP-27-001')));
});

test('unsafe URL, unreviewed redirect, rate limit and oversize content stop the check',async()=>{
  const contract=adapterContract(capability,source),url=contract.urls[0];
  assert.equal(safePublicUrl('http://www.tasd7.net/page',contract.allowed_hosts),false);
  assert.equal(safePublicUrl('https://www.tasd7.net/page?token=secret',contract.allowed_hosts),false);
  assert.equal(safePublicUrl('https://127.0.0.1/page',['127.0.0.1']),false);
  const redirect=await fetchPublicCheck(contract,url,async()=>new Response(null,{status:302,
    headers:{location:'https://unreviewed.example/page'}}));
  assert.equal(redirect.state,'blocked');
  const limited=await fetchPublicCheck(contract,url,async()=>new Response(null,{status:429}));
  assert.equal(limited.state,'blocked');
  const oversized=await fetchPublicCheck(contract,url,async()=>new Response('x'.repeat(2001),{
    status:200,headers:{'content-type':'text/html'}}));
  assert.equal(oversized.state,'partial');
  assert.match(oversized.reason,/byte bound/);
});

test('legacy Arkansas listing redirect is bounded to the reviewed host', async () => {
  const entry = registeredEntryContract({ code: 'state-other',
    url: 'https://www.arkansas.gov/tss/procurement/bids/index.php' });
  assert.deepEqual(entry.allowed_hosts, ['www.arkansas.gov', 'www.ark.org']);
  const redirected = await fetchPublicCheck(entry, entry.urls[0], async url =>
    url.includes('arkansas.gov')
      ? new Response(null, { status: 302,
        headers: { location: 'https://www.ark.org/tss/procurement/bids/index.php' } })
      : new Response('<html>Current Solicitations</html>', { status: 200,
        headers: { 'content-type': 'text/html' } }));
  assert.equal(redirected.state, 'captured');
  assert.equal(redirected.redirects.length, 1);
  const unrelated = registeredEntryContract({ code: 'some-agency',
    url: 'https://www.arkansas.gov/tss/procurement/bids/index.php' });
  assert.deepEqual(unrelated.allowed_hosts, ['www.arkansas.gov']);
});
