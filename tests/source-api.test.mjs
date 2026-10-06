import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApiContract, apiQuery, inspectApiPage, fetchApiPage } from '../supabase/functions/_shared/source-api.mjs';
import { adapterContract, buildKnownSourcePlan } from '../scripts/lib/known-source-execution.mjs';
import { zeroEvidence } from '../scripts/lib/interpretation-evidence.mjs';
export const spec={version:1,runner_id:'api-bounded',check_when:'each_request',endpoint_url:'https://api.example.gov/search',
  allowed_hosts:['api.example.gov'],http_method:'POST',max_bytes:10000,max_pages:2,page_size:10,
  query_defaults:{filters:{dates:[{from:'',to:''}],state:'AR'},page:1,limit:10},
  date_paths:{from:'filters.dates.0.from',to:'filters.dates.0.to'},date_basis:'publication',
  pagination:{page_path:'page',limit_path:'limit',records_path:'results',terminal_path:'page_metadata.hasNext',terminal_value:false,page_response_path:'page_metadata.page',first_page:1},
  response_format:'bounded-json-v1',auth:{mode:'none'},access_handoff_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
const window={from:'2026-09-01',to:'2026-10-06'};
const data={results:[{id:'one',title:'Routine janitorial'}],page_metadata:{page:1,hasNext:false}};
test('saved API contract binds request window, pagination and terminal response shape',()=>{
  validateApiContract(spec);
  validateApiContract({...spec,date_paths:{to:spec.date_paths.to,from:spec.date_paths.from}});
  assert.throws(()=>apiQuery(spec,{from:'2026-02-30',to:'2026-03-01'},0),/window/);
  const query=apiQuery(spec,window,0);
  assert.equal(query.filters.dates[0].from,window.from);assert.equal(query.filters.state,'AR');
  assert.equal(apiQuery(spec,window,1).page,2);assert.throws(()=>apiQuery(spec,window,2),/bound/);
  assert.throws(()=>apiQuery(spec,{...window,date_basis:'contract_end_date'},0),/date basis/);
  assert.deepEqual(inspectApiPage(data,spec,0),{count:1,terminal:true});
  assert.throws(()=>inspectApiPage({results:[],page_metadata:{page:1,hasNext:true}},spec,0),/incomplete/);
  assert.throws(()=>inspectApiPage({...data,page_metadata:{page:2,hasNext:false}},spec,0),/mismatched/);
});
test('keyed read sends the credential only in the reviewed header and sanitizes saved data',async()=>{
  const keyed={...spec,auth:{mode:'header',header:'X-API-Key'}};
  const secret='unit-test-value-only';let called=0;
  const result=await fetchApiPage(keyed,window,0,{secret,fetcher:async(url,options)=>{
    called++;assert(!url.includes(secret));assert.equal(options.headers['X-API-Key'],secret);assert.equal(options.redirect,'manual');
    return new Response(JSON.stringify({...data,echo:secret,access_token:'fixture-only',url:`https://example.gov/?token=${secret}`}),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(called,1);assert.equal(result.state,'captured');
  assert(!JSON.stringify(result).includes(secret));assert.equal(result.data.access_token,'[REDACTED]');
});
test('blocked, redirects, oversized, malformed and failed calls never become zero results',async()=>{
  for(const status of [401,403,429,302]) {
    const result=await fetchApiPage(spec,window,0,{fetcher:async()=>new Response('',{status,headers:{Location:'https://other.gov'}})});
    assert.notEqual(result.state,'captured');assert.equal(result.upstream_status,status);
  }
  for(const body of ['not json',JSON.stringify({results:[]}),JSON.stringify({...data,padding:'x'.repeat(11000)})]) {
    const result=await fetchApiPage(spec,window,0,{fetcher:async()=>new Response(body,{headers:{'Content-Type':'application/json'}})});
    assert.equal(result.state,'partial');
  }
  assert.equal((await fetchApiPage(spec,window,0,{fetcher:async()=>{throw new Error('private failure');}})).state,'outcome_unknown');
});
test('unreviewed hosts, credentials in configuration and unsafe field paths are refused before fetch',async()=>{
  assert.throws(()=>validateApiContract({...spec,endpoint_url:'https://127.0.0.1/search',allowed_hosts:['127.0.0.1']}));
  assert.throws(()=>validateApiContract({...spec,date_paths:{from:'__proto__.from',to:spec.date_paths.to}}));
  assert.throws(()=>validateApiContract({...spec,query_defaults:{api_key:'fixture'}}));
  await assert.rejects(()=>fetchApiPage(spec,window,0,{allowedHosts:['other.gov'],fetcher:()=>{throw new Error('must not send');}}),/approved/);
});
test('generic geography route uses the saved API without SAM or source-name branches',()=>{
  const source={id:'source',code:'any-agency',url:spec.endpoint_url,source_coverage_areas:[{state_code:'AR',area_type:'city',city_name:'Generic City'}]};
  const geo={id:'city',kind:'municipality',name:'Generic City',source_active:true};
  const cap={id:'cap',source_id:source.id,route_geography_id:geo.id,kind:'award',method:'api',availability:'active',parser_version:'api-v1',
    verified_at:'2026-01-01',verified_until:'2027-01-01',verification_evidence:{run:'fixture'},method_spec:spec};
  assert.equal(adapterContract(cap,source,new Date('2026-10-06')).runner_id,'api-bounded');
  const plan=buildKnownSourcePlan({search_windows:{award:window}},[{id:'target',geography_id:geo.id}],[geo],[cap],[source],new Date('2026-10-06'));
  assert(plan.tasks.some(t=>t.capability_id===cap.id && t.state==='unchecked'));
});
test('API empty response requires explicit terminal metadata for zero evidence',()=>{
  const body=Buffer.from(JSON.stringify({results:[],page_metadata:{page:1,hasNext:false}}));
  const proof=zeroEvidence(body,'application/json','generic-source',0,'',spec);
  assert.equal(proof.eligible,true);assert.match(proof.text,/0 results/);
});
