import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeAutomaticListing,inspectAutomaticListing} from '../scripts/lib/automatic-public-method.mjs';
import {countyProfile,directoryWebsite,resolveOfficialDirectory,countyDirectory,municipalWebsite,municipalLookup} from '../scripts/lib/official-directory.mjs';
import {publicDiscovery,publicReview} from '../scripts/lib/official-link-discovery.mjs';
import {createHash} from 'node:crypto';
import {automaticRouteAssociation,reviewedDiscoverySource} from '../scripts/lib/hosted-discovery.mjs';
import {capabilityCoversRoute} from '../scripts/lib/known-source-execution.mjs';
const url='https://agency.example/bids';
const listing='<main><h1>Open bids</h1><p>1 open bids</p><table><tr><th>Bid number</th><th>Title</th><th>Work county</th><th>Deadline</th></tr><tr><td>26-1</td><td><a href="/bid/26-1">Janitorial services</a></td><td>Saline</td><td>2026-11-30</td></tr></table></main>';
test('automatic shared method retains its original route and only adds explicitly verified associations',()=>{
  const old={id:'method',source_id:'source',kind:'opportunity',method:'browser',endpoint_url:url,route_geography_id:'city'};
  const proposed={...old,route_geography_id:'county',verification_evidence:{automation_policy:'county-public-v1',run_ids:['capture']}};
  const merged=automaticRouteAssociation(proposed,{id:'source'},[old]);
  assert.equal(merged.route_geography_id,'city');assert.deepEqual(merged.verification_evidence.route_geography_ids,['city','county']);
  assert.equal(capabilityCoversRoute(merged,'county'),true);assert.equal(capabilityCoversRoute(merged,'other'),false);
  assert.equal(capabilityCoversRoute({...merged,verification_evidence:{route_geography_ids:['other']}},'other'),false);
  assert.equal(automaticRouteAssociation(old,{id:'source'},[]),old);
});
test('saved registry route can reuse its official seed in a new request without accepting unrelated client IDs',()=>{
  const seed={id:'seed',code:'official'},spec={existing_id:'seed',code:'official'};
  assert.equal(reviewedDiscoverySource({evidence:{registered_source_ids:['seed']}},spec,[seed],[]),seed);
  assert.throws(()=>reviewedDiscoverySource({evidence:{registered_source_ids:['other']}},spec,[seed],[]),/must belong/);
});
test('automatic method verifies structured identities, actual work location, official links and terminal count',()=>{
  const {spec,listing:result}=proposeAutomaticListing(Buffer.from(listing),url);
  assert.equal(result.terminal,true);assert.equal(result.records[0].work_county,'Saline');
  assert.equal(result.records[0].source_url,'https://agency.example/bid/26-1');
  assert.throws(()=>inspectAutomaticListing(Buffer.from(listing.replace('1 open bids','2 open bids')),spec),/terminal/);
  assert.throws(()=>inspectAutomaticListing(Buffer.from(listing.replace('/bid/26-1','http://127.0.0.1/private')),spec),/official detail/);
  assert.throws(()=>inspectAutomaticListing(Buffer.from(listing.replace('</main>','<a rel="next">More</a></main>')),spec),/pagination/);
  assert.throws(()=>inspectAutomaticListing(Buffer.from(listing.replace('Open bids','Archived bids')),spec),/heading/);
});
test('explicit empty listing differs from shell, unrelated table and navigation text',()=>{
  assert.equal(proposeAutomaticListing(Buffer.from('<main><h1>Open bids</h1><p>No open bids available</p></main>'),url).listing.total,0);
  for(const html of ['<main><h1>Open bids</h1></main>','<nav><h1>Open bids</h1>No open bids available</nav>',
    '<main><h1>Open bids</h1><iframe></iframe>No open bids available</main>',
    '<main><h1>Open bids</h1><script>No open bids available</script></main>'])assert.throws(()=>proposeAutomaticListing(Buffer.from(html),url));
});
test('county directory resolves observed links for arbitrary counties, not guessed domains',async()=>{
  for(const name of ['Saline','Example County']){
    const geo={id:'test',name,kind:'county',state_code:'AR',source_active:true};
    const index=Buffer.from(`<div class="county"><a href="/counties/observed/">${name}</a></div>`);
    const profile=Buffer.from(`<h2>${name}</h2><h3><a href="http://county.example/">www.county.example</a></h3>`);
    assert.equal(countyProfile(index,geo),'https://www.arcounties.org/counties/observed/');
    assert.equal(directoryWebsite(profile,'https://www.arcounties.org/counties/observed/',geo),'https://county.example/');
    const calls=[],saved=[];const result=await resolveOfficialDirectory(geo,{fetcher:async request=>{
      calls.push(request);return new Response(request===countyDirectory?index:profile,{headers:{'content-type':'text/html'}});
    },capture:async e=>saved.push(e)});
    assert.equal(result.state,'resolved');assert.equal(calls.length,2);assert.equal(saved.length,2);
  }
});
test('directory rejects ambiguous, unrelated and unsafe websites',()=>{
  const geo={name:'Saline',kind:'county'};
  assert.equal(directoryWebsite(Buffer.from('<h2>Other County</h2><a href="https://wrong.example">www.wrong.example</a>'),countyDirectory,geo),null);
  assert.equal(directoryWebsite(Buffer.from('<h2>Saline</h2><p><a href="https://127.0.0.1/">www.local</a></p>'),countyDirectory,geo),null);
  assert.equal(directoryWebsite(Buffer.from('<h2>Saline</h2><p><a href="https://a.example/">www.a.example</a><a href="https://b.example/">www.b.example</a></p>'),countyDirectory,geo),null);
});

test('automatic saved capture advances through verification, registration and collection without a review submission',async()=>{
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const body=Buffer.from(listing),source={id:'source',code:'official',name:'Official county',url:'https://www.agency.example/bids',contracting_entity_geo_level:'county'};
  const capture={run_id:'run',source_id:source.id,content_base64:body.toString('base64'),content_sha256:hash(body),retrieved_at:new Date().toISOString()};
  const data={procurement_search_requests:[{id:'request'}],procurement_coverage_tasks:[{id:'task',target_id:'target',kind:'opportunity',route_geography_id:'county'}],
    procurement_request_targets:[{id:'target',search_request_id:'request'}],procurement_sources:[source],procurement_public_captures:[capture]};
  const db={from(table){const filters=[];const q={select:()=>q,eq:(key,value)=>{filters.push(r=>r[key]===value);return q;},
    maybeSingle:async()=>({data:data[table].find(r=>filters.every(f=>f(r)))}),single:async()=>({data:data[table].find(r=>filters.every(f=>f(r)))})};return q;}};
  const saved=new Map(),artifacts={put:async value=>{const bytes=Buffer.from(JSON.stringify(value)),id=hash(bytes);saved.set(id,bytes);return id;},get:async id=>saved.get(id)};
  const packet={seed_source_id:'source',pages:[{run_id:'run',url,requested_url:source.url,content_type:'text/html',content_sha256:hash(body),review:publicReview(body,'text/html')}],links:[]};
  const c={stage:'discovery_verify',task_id:'task',seed_source_id:'source',automation_policy:'county-public-v1',packet_artifact:await artifacts.put(packet),blocker:'An unrelated linked detail returned HTTP 404'};
  const events=[];let registered;
  const service=publicDiscovery({db,artifacts,persist:async review=>{registered=review;events.push('persist');return {receipt:{verified:true}};},
    collect:async args=>{events.push(args.planOnly?'plan':'collect');return {};},continueCollection:async()=>events.push('continue')});
  const job={search_request_id:'request'};
  await service.step(job,c,async state=>events.push(state));
  assert.equal(c.stage,'discovery_save');
  await service.step(job,c,async state=>events.push(state));
  assert.equal(c.stage,'discovery_collect');assert.equal(registered.capability.verification_evidence.automation_policy,'county-public-v1');
  await service.step(job,c,async state=>events.push(state));
  assert.equal(c.stage,'discovery_collected');assert.deepEqual(events,['pending','persist','plan','pending','collect','continue','succeeded']);
});

test('EvoGov explicit empty state is recognized but changed listing requires revalidation',()=>{
  const html=Buffer.from('<div class="evo_bids_empty"><p>There are currently no bids listed.</p></div>');
  const {spec,listing:result}=proposeAutomaticListing(html,url);assert.equal(result.total,0);
  assert.throws(()=>inspectAutomaticListing(Buffer.from('<main>There are currently no bids listed.</main>'),spec));
});

test('published bid layouts preserve record identities and do not infer work sites from agency names',()=>{
  const revize=Buffer.from('<main><h1>Bids</h1><p>All current and active bid opportunities are listed below.</p><table id="rpfbids"><thead><tr><th>Description</th><th>Opening Date/Time</th><th>Closing Date/Time</th></tr></thead><tbody><tr data-exp="20261130"><td><a href="/bid_detail_T4_R1.php">Janitorial services</a></td><td>October 19, 2026</td><td>November 30, 2026</td></tr></tbody></table></main>');
  const first=proposeAutomaticListing(revize,url).listing.records[0];
  assert.equal(first.id,'T4_R1');assert.equal(first.deadline,'2026-11-30');assert.equal(first.work_county,undefined);
  assert.throws(()=>proposeAutomaticListing(Buffer.from(revize.toString().replace('data-exp','other')),url));
  const city=Buffer.from('<main><h1>City Bids</h1><p>View current bid opportunities for the City of Example.</p><table><tr><th>Bid Name</th><th>Contact</th><th>PDF</th><th>Details</th></tr><tr><td>Janitorial services <span>Closes: 2026-11-30</span></td><td>Office</td><td></td><td><a href="/bids/info.php?id=9">View</a></td></tr></table></main>');
  const second=proposeAutomaticListing(city,url).listing.records[0];assert.equal(second.id,'9');assert.equal(second.work_city,undefined);
  assert.throws(()=>proposeAutomaticListing(Buffer.from(city.toString().replace('id=9','other=9')),url));
});

test('municipal lookup uses the observed public table contract and rejects incomplete or ambiguous responses',()=>{
  const response=rows=>Buffer.from(JSON.stringify({recordsFiltered:rows.length,data:rows}));
  const row=Array(17).fill('');row[0]='EXAMPLE';row[11]='AR';row[16]='<a href="http://city.example/">Website</a>';
  assert.equal(municipalWebsite(response([row]),{name:'Example'}),'https://city.example/');
  assert.equal(municipalWebsite(response([row]),{name:'Other'}),null);
  assert.equal(municipalWebsite(response([row,[...row.slice(0,16),'<a href="https://different.example/">Site</a>']]),{name:'Example'}),null);
  assert.throws(()=>municipalWebsite(Buffer.from(JSON.stringify({recordsFiltered:101,data:[row]})),{name:'Example'}),/incomplete/);
  const config={tableWpId:10,serverSide:true,dataTableParams:{ajax:{url:'https://www.armunileague.org/wp-admin/admin-ajax.php?action=get_wdtable&table_id=10'},columnDefs:Array.from({length:17},(_,i)=>({name:String(i),searchable:true,orderable:true}))}};
  const html=Buffer.from(`<input value='${JSON.stringify(config)}'><input id="wdtNonceFrontendServerSide_10" value="public-form-value">`);
  const lookup=municipalLookup(html,'Example');assert.equal(lookup.form.get('search[value]'),'Example');assert.equal(lookup.form.get('length'),'100');
  assert.throws(()=>municipalLookup(Buffer.from(html.toString().replace('www.armunileague.org/wp-admin','localhost/wp-admin')),'Example'),/contract/);
});

test('explicit retry refreshes stale captures with new indexes without discarding evidence or replaying uncertain writes',async()=>{
  for(const uncertain of [false,true]) {
    const checkpoint={stage:'discovery_verify',packet_artifact:'old-packet',run_ids:['old-run'],seed_source_id:'source',
      visited:[url],links:[],...(uncertain?{persistence_intent:'intent'}:{})};
    const job={id:'job',state:'blocked',updated_at:'version',dedupe_key:'api-workflow:discovery:request:task',checkpoint};
    const data={procurement_search_requests:[{id:'request',workflow_control:{admin_policy:'county_scope'}}],
      procurement_coverage_tasks:[{id:'task',target_id:'target',kind:'opportunity'}],
      procurement_request_targets:[{id:'target',search_request_id:'request'}],procurement_jobs:[job],
      procurement_sources:[{id:'source',url}],procurement_runs:[{job_id:'job',page_index:4}],
      procurement_public_captures:[{run_id:'old-run',retrieved_at:'2020-01-01'}]};
    const db={from(table){let update;const filters=[];
      const result=()=>{const found=data[table].filter(row=>filters.every(f=>f(row)));if(update)found.forEach(row=>Object.assign(row,update));return {data:found};};
      const q={select:()=>q,update:value=>{update=value;return q;},eq:(key,value)=>{filters.push(row=>row[key]===value);return q;},
        in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q;},range:()=>q,order:key=>{if(table==='procurement_public_captures')assert.equal(key,'run_id');return q;},
        maybeSingle:async()=>({data:result().data[0]}),single:async()=>({data:result().data[0]}),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)};return q;}};
    await publicDiscovery({db}).resume('request',{task_id:'task'},'actor');
    assert.equal(job.state,'pending');
    if(uncertain){assert.equal(job.checkpoint.persistence_intent,'intent');assert.equal(job.checkpoint.packet_artifact,'old-packet');}
    else {assert.equal(job.checkpoint.stage,'discovery_capture');assert.equal(job.checkpoint.page_offset,5);
      assert.deepEqual(job.checkpoint.previous_packets,['old-packet']);assert.deepEqual(job.checkpoint.run_ids,[]);assert.deepEqual(job.checkpoint.queue,[url]);}
  }
});
