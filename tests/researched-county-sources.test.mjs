import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {JSDOM} from 'jsdom';
import {proposeAutomaticListing,publishedDeadlineDate,inspectAutomaticListing} from '../scripts/lib/automatic-public-method.mjs';
import {makeInterpretationPacket,validateInterpretation} from '../scripts/lib/known-source-workflow.mjs';
import {extractFacts,evaluateFacts,verifyEvidenceSpans} from '../scripts/lib/hosted-interpretation.mjs';
import {inspectPublicHtmlTable} from '../scripts/lib/public-html-table.mjs';
import {publicTableFinding,continuePublicTableDetails,applyPublicTableDetails} from '../scripts/lib/public-table-details.mjs';
import {supportingCapture} from '../scripts/lib/supporting-capture.mjs';import {validateFindingBounds} from '../scripts/lib/hosted-workflow.mjs';
import {officialLinks} from '../scripts/lib/official-link-discovery.mjs';import {fetchPublicCheck} from '../scripts/lib/public-source-check.mjs';
import {registeredEntryContract,registeredPublicEntryUrl} from '../scripts/lib/known-source-execution.mjs';
const fixture=key=>readFileSync(`tests/fixtures/county/${key}.html`),sha=b=>createHash('sha256').update(b).digest('hex');
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function context(body,spec){return {request:{id:id(1),workflow_control:{admin_policy:'county_scope'},service_scope:{name:'janitorial'},requested_search_areas:[{area_type:'county',county_name:'Saline',state_code:'AR'},{area_type:'city',city_name:'Little Rock',state_code:'AR'}]},
 task:{id:id(2),source_id:id(3),capability_id:id(4),kind:'opportunity',query_window:{from:'2026-10-19',to:'2027-10-19',date_basis:'deadline'},pages_reviewed:1,evidence:{terminal_confirmed:true,run_ids:[id(5)]}},
 job:{task_id:id(2),id:id(6),state:'succeeded'},source:{id:id(3),code:'reviewed-public',url:spec.urls[0]},capability:{id:id(4),source_id:id(3),method:'browser',method_spec:spec,parser_version:'reviewed-public-v1',kind:'opportunity',availability:'active',verified_at:'2026-10-19',verified_until:'2027-01-01',verification_evidence:{official:true}},
 runs:[{id:id(5),job_id:id(6),coverage_task_id:id(2),source_id:id(3),page_index:0,detail:{state:'content_saved',content_sha256:sha(body)}}],
 captures:[{run_id:id(5),source_id:id(3),content_base64:body.toString('base64'),content_sha256:sha(body),content_type:'text/html',final_url:spec.urls[0],retrieved_at:'2026-10-19T23:00:00Z'}]};}
for(const key of ['ualr','housing','water-itb','water-rfp','water-rfi','water-rfq'])test(`actual ${key} listing preserves bounded records and literal exclusion evidence`,async()=>{
 const body=fixture(`${key}-published`),meta=JSON.parse(readFileSync(`tests/fixtures/county/${key}-published.json`)),{spec,listing}=proposeAutomaticListing(body,meta.url);
 assert.ok(listing.total>0);if(key==='ualr')assert.equal(listing.total,15);if(key==='housing')assert.equal(listing.total,11);
 const ctx=context(body,spec),p=makeInterpretationPacket(ctx),result=evaluateFacts(p,await extractFacts(p,spec));
 assert.equal(result.findings.length,0);assert.equal(result.unresolved.length,0);assert.equal(result.exclusions.length,listing.total);assert.equal(result.coverage,'complete');
 validateInterpretation(p,result);await verifyEvidenceSpans(p,result);
 if(key==='ualr')assert.throws(()=>proposeAutomaticListing(Buffer.from(body.toString()+'<script id="tablepress-datatables-after">{"serverSide":true}</script>'),meta.url),/traversal/);
 assert.throws(()=>proposeAutomaticListing(Buffer.from(body.toString().replace('</main>','<a rel="next">Next</a></main>')),meta.url),/pagination/);
});
const tableSpec={version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://arkansas.ionwave.net/SourcingEvents.aspx?SourceType=1'],allowed_hosts:['arkansas.ionwave.net'],max_bytes:2000000,
 response_format:'html-table-v1',max_records:100,expected_organization:'Little Rock Water Reclamation Authority',table_selector:'table.rgMasterTable',row_selector:'tr.rgRow, tr.rgAltRow',
 public_details:{key:'BidID',endpoint:'https://arkansas.ionwave.net/PublicDetail.aspx',client_state_selector:'input#ctl00_mainContent_rgBidList_ClientState'}};
test('published public table IDs bind the right detail while rejecting altered IDs, hosts and incomplete traversal',()=>{
 const body=fixture('ionwave-public-listing'),r=inspectPublicHtmlTable(body,tableSpec);assert.equal(r.terminal,true);assert.equal(r.records.length,4);assert.equal(r.records[0].id,'1642');assert.match(r.records[0].source_url,/bidID=1642/);
 assert.throws(()=>inspectPublicHtmlTable(Buffer.from(body.toString().replace('"1642"','"private"')),tableSpec),/identity/);
 assert.throws(()=>inspectPublicHtmlTable(Buffer.from(body.toString().replace('"1754"','"1642"')),tableSpec),/identity/);
 assert.throws(()=>inspectPublicHtmlTable(body,{...tableSpec,public_details:{...tableSpec.public_details,endpoint:'https://127.0.0.1/PublicDetail.aspx'}}),/contract/);
 const paged=new JSDOM(body.toString());paged.window.document.querySelector('.rgInfoPart').textContent='80 items in 8 pages';
 assert.equal(inspectPublicHtmlTable(paged.serialize(),tableSpec).terminal,false);paged.window.close();
});
test('public detail continuation stages only actual site evidence, never contact address or stale cached positives',async()=>{
 const listing=fixture('ionwave-public-listing'),detail=fixture('ionwave-public-detail'),ctx=context(listing,tableSpec),packet=makeInterpretationPacket(ctx),checkpoint={},stored=new Map();let gets=0;
 const artifacts={async put(value){const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),key='artifacts/'+sha(b);stored.set(key,b);return key;},async get(key){assert.ok(stored.has(key));return stored.get(key);}};
 const support=supportingCapture({artifacts,serverKey:'isolated-public-detail-test',fetcher:async()=>{gets++;return new Response(detail,{headers:{'content-type':'text/html'}});}});
 const args={context:ctx,packet,supporting:support,checkpoint,save:async()=>{},actor:'test'};
 assert.equal(await continuePublicTableDetails(args),false);assert.equal(await continuePublicTableDetails(args),true);assert.equal(gets,1);
 const original=await extractFacts(packet,tableSpec),result=evaluateFacts(packet,applyPublicTableDetails(original,packet,checkpoint));assert.equal(result.findings.length,1);
 const f=result.findings[0];f.supporting_evidence=await Promise.all(f.supporting_evidence.map(e=>support.rebind(ctx,packet,e)));
 assert.equal(f.payload.work_city,'Little Rock');assert.equal(f.payload.deadline,'2026-11-05');assert.equal(f.payload.work_county,undefined);
 validateInterpretation(packet,result,{verifiedSupporting:true});await verifyEvidenceSpans(packet,result,{loadSupporting:e=>support.load(ctx,packet,e)});validateFindingBounds(packet,result,{verifiedSupporting:true});
 assert.throws(()=>validateFindingBounds({...packet,request_scope:{...packet.request_scope,requested_search_areas:[{area_type:'county',county_name:'Saline',state_code:'AR'}]}},result,{verifiedSupporting:true}),/location/);
 const record=inspectPublicHtmlTable(listing,tableSpec).records[0];
 assert.equal(publicTableFinding(Buffer.from(detail.toString().replace('Starting Location','Contact Location')),record,{},packet.pages[0]),null);
 assert.equal(publicTableFinding(Buffer.from(detail.toString().replace('11/5/2026','11/15/2026')),record,{},packet.pages[0]),null);
 checkpoint.public_table_details[packet.task_id].entries[0].finding=null;
 const old={...original,facts:original.facts.map((fact,i)=>i===0?{...fact,record:null,verified_finding:{...f,evidence:[]}}:fact)};
 assert.equal(applyPublicTableDetails(old,packet,checkpoint).facts[0].verified_finding,undefined);
});
test('county research reads only public published menu links and immediate safe CMS refresh',async()=>{
 const data=[{type:1,status:2,hidden:3,name:4,url:5},'link','published',false,'Request for Proposals','https://district.example/page/rfp',
 {type:1,status:7,hidden:3,name:4,url:8},'draft','https://district.example/private'];
 const body=Buffer.from(`<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`);
 assert.deepEqual(officialLinks(body,'https://district.example/',{automatic:true}).map(x=>x.url),['https://district.example/page/rfp']);assert.deepEqual(officialLinks(body,'https://district.example/'),[]);
 const url='https://district.example/',contract={runner_id:'public-fetch',allowed_hosts:['district.example'],max_bytes:2000};
 const fetcher=async u=>u===url?new Response('',{headers:{refresh:'0;URL=https://ww2.district.example/'}}):new Response('<main>District</main>',{headers:{'content-type':'text/html'}});
 assert.equal((await fetchPublicCheck(contract,url,fetcher,{researchEntry:url,resolveHost:async()=>[{address:'8.8.8.8'}]})).state,'captured');
 assert.equal((await fetchPublicCheck(contract,url,fetcher,{researchEntry:url,resolveHost:async()=>[{address:'127.0.0.1'}]})).state,'blocked');
 assert.equal((await fetchPublicCheck(contract,url,fetcher)).state,'partial');
 assert.equal(publishedDeadlineDate('02/31/2026'),null);
});

test('county evidence scope includes only saved confirmed cities and binds them to the packet',()=>{
 const body=fixture('ionwave-public-listing'),ctx=context(body,tableSpec);
 ctx.request.requested_search_areas=[{area_type:'county',county_name:'Saline',state_code:'AR'}];
 ctx.request.selected_city_ids=['confirmed'];ctx.confirmedCities=[{id:'confirmed',kind:'municipality',name:'Little Rock',state_code:'AR',incorporated:true},{id:'other',kind:'municipality',name:'Other City',state_code:'AR',incorporated:true}];
 const unconfirmed=makeInterpretationPacket(ctx);assert.equal(unconfirmed.request_scope.requested_search_areas.length,1);
 ctx.request.cities_confirmed_at='2026-10-19T23:00:00Z';const confirmed=makeInterpretationPacket(ctx);
 assert.equal(confirmed.request_scope.requested_search_areas.length,2);assert.equal(confirmed.request_scope.requested_search_areas[1].city_name,'Little Rock');assert.notEqual(confirmed.packet_hash,unconfirmed.packet_hash);
 ctx.request.workflow_control.admin_policy='state_research';assert.equal(makeInterpretationPacket(ctx).request_scope.requested_search_areas.length,1);
});

const lrsdSpec={version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://lrsd.ionwave.net/SourcingEvents.aspx?SourceType=1'],allowed_hosts:['lrsd.ionwave.net'],max_bytes:2000000,response_format:'html-table-v1',max_records:100,expected_organization:'Purchasing',table_selector:'table.rgMasterTable',row_selector:'tr.rgRow, tr.rgAltRow',public_details:{key:'BidID',endpoint:'https://lrsd.ionwave.net/PublicDetail.aspx',client_state_selector:'input#ctl00_mainContent_rgBidList_ClientState'}};
test('actual LRSD explicit empty grid works without a public detail key map; malformed empty remains unresolved',async()=>{
 const body=fixture('lrsd-empty-published'),listing=inspectPublicHtmlTable(body,lrsdSpec);assert.equal(listing.terminal,true);assert.equal(listing.total,0);
 const p=makeInterpretationPacket(context(body,lrsdSpec)),result=evaluateFacts(p,await extractFacts(p,lrsdSpec));assert.equal(result.coverage,'complete');assert.equal(result.findings.length,0);validateInterpretation(p,result);await verifyEvidenceSpans(p,result);
 for(const altered of [body.toString().replace('No records to display.','Loading...'),body.toString().replace('<strong>0</strong> items','<strong>1</strong> items'),body.toString().replace('in <strong>1</strong> pages','in <strong>2</strong> pages')])assert.throws(()=>inspectPublicHtmlTable(Buffer.from(altered),lrsdSpec));
});
test('actual airport public listing verifies all 30 rows and excludes past duplicates from current opportunity identity',async()=>{
 const body=fixture('airport-b2g-published'),url='https://clintonairport.gob2g.com/FrontEnd/proposalsearchpublic.asp',{spec,listing}=proposeAutomaticListing(body,url);
 assert.equal(listing.total,3);assert.equal(listing.terminal,true);assert.deepEqual(listing.records.map(r=>r.id),['26003RFQ','230600','26056IFB']);assert.ok(listing.records.every(r=>r.source_url===url&&!('work_city'in r)));assert.equal(listing.records[0].deadline,'2026-10-20');
 const p=makeInterpretationPacket(context(body,spec)),result=evaluateFacts(p,await extractFacts(p,spec));assert.equal(result.findings.length,0);assert.equal(result.coverage,'complete');assert.equal(result.exclusions.length,3);validateInterpretation(p,result);await verifyEvidenceSpans(p,result);
 const other=Buffer.from(body.toString().replaceAll('Clinton National Airport','Example Regional Airport'));assert.equal(proposeAutomaticListing(other,'https://example.gov/bids').listing.total,3);assert.throws(()=>inspectAutomaticListing(other,spec),/identity/);
 for(const altered of [body.toString().replace('value="30"','value="31"'),body.toString().replace('<strong>Due Soon</strong>','<strong>Unknown</strong>'),body.toString().replace('name="Status"','name="Changed"'),body.toString().replace('10/29/2026','2/30/2026'),body.toString().replace('230600 - Cargo','26003RFQ - Cargo')])assert.throws(()=>inspectAutomaticListing(Buffer.from(altered),spec));
});
test('future public airport janitorial rows retain stable references and require actual location evidence before saving',async()=>{
 const body=Buffer.from(fixture('airport-b2g-published').toString().replace('IFB - Vehicles','IFB - Janitorial Services')),url='https://clintonairport.gob2g.com/FrontEnd/proposalsearchpublic.asp',{spec,listing}=proposeAutomaticListing(body,url);
 assert.equal(listing.records[2].id,'26056IFB');assert.equal(inspectAutomaticListing(Buffer.from(body.toString().replace('10/29/2026','11/05/2026')),spec).records[2].id,'26056IFB');
 const p=makeInterpretationPacket(context(body,spec)),result=evaluateFacts(p,await extractFacts(p,spec));assert.equal(result.findings.length,0);assert.equal(result.unresolved.length,1);assert.equal(result.coverage,'partial');
});
test('published school HTML content links are discovered inertly; bare school headings do not establish empty coverage',()=>{
 const values=[{html:1},'<p>Bid Opportunities <a href="https://district.ionwave.net/SourcingEvents.aspx?SourceType=1">Current bids</a></p><script>throw new Error("never execute")</script>'];
 const body=Buffer.from(`<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(values).replaceAll('</script>','<\\/script>')}</script>`);
 assert.deepEqual(officialLinks(body,'https://school.gov/page/procurement',{automatic:true}).map(l=>l.url),['https://district.ionwave.net/SourcingEvents.aspx?SourceType=1']);assert.deepEqual(officialLinks(body,'https://school.gov/page/procurement'),[]);
 assert.throws(()=>proposeAutomaticListing(Buffer.from('<h1>Request for Proposals/Qualifications</h1>'),'https://school.gov/page/rfp'),/No supported/);
});
test('a reviewed public maintenance entry preserves identity and byte limits; invalid or future metadata cannot redirect checks',()=>{
 const original='https://school.gov/large-procurement-page',entry={url:lrsdSpec.urls[0],official_entry_url:original,content_sha256:'a'.repeat(64),official_link_artifact:'artifacts/'+'b'.repeat(64),checked_at:'2026-10-19T00:00:00Z'};
 const source=value=>({code:'district',url:original,config:{research_persistence:{coverage_by_scope:{test:{verified_public_entry:value}}}}});
 const contract=registeredEntryContract(source(entry),new Date('2026-10-20'));
 assert.deepEqual(contract.urls,lrsdSpec.urls);assert.equal(contract.max_bytes,2000000);assert.equal(source(entry).url,original);
 for(const bad of [{...entry,url:'not a url'},{...entry,url:'https://school.gov/?token=secret'},{...entry,official_entry_url:'https://other.gov'},{...entry,checked_at:'2099-01-01'},{...entry,official_link_artifact:'missing'},{...entry,content_sha256:'missing'}])assert.equal(registeredPublicEntryUrl(source(bad),new Date('2026-10-20')),original);
});
