import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {planRegistry,planManual,persistenceSql,canonicalUrl,publicUrl,safeMetadata,stableId} from '../scripts/lib/research-persistence.mjs';
import {planReviewedBatch,hash} from '../scripts/lib/reviewed-batch.mjs';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const before=load('tests/fixtures/research/build-persistence-before.json'),spec=load('tests/fixtures/research/build-registry-spec.json');
function registered(){const b=structuredClone(before),m=planRegistry(spec,b);for(const d of m.rows){b[d.table]=b[d.table].filter(x=>x.id!==d.row.id);b[d.table].push({...d.row,updated_at:'2026-09-30T20:00:00Z'});}return b;}
test('real source registry preserves existing configuration and separates SAM records',()=>{
 const m=planRegistry(spec,before);assert.equal(m.rows.filter(d=>d.table==='procurement_sources'&&!d.before).length,9);
 assert.deepEqual(m.mappings.sources['sam-federal'].map(s=>s.code),['sam','sam-awards']);
 const dhs=m.rows.find(d=>d.row.code==='dhs'),old=before.procurement_sources.find(s=>s.code==='dhs');
 assert.equal(dhs.row.id,old.id);assert.equal(dhs.row.url,old.url);
 for(const [key,value] of Object.entries(old.config??{}))assert.deepEqual(dhs.row.config[key],value);
 assert.equal(planRegistry(spec,registered()).rows.length,0,'Repeat registration performs no writes');
});

test('the final manual payload rejects secrets in provenance, field bases and authorization',()=>{
 const b=registered(),s=load('tests/fixtures/research/build-manual-spec.json');
 for(const mutate of [
  x=>{x.findings[0].field_basis.api_key='private';},
  x=>{x.findings[0].evidence[0].excerpt='See https://example.org/doc?access_token=private';},
  x=>{x.authorization='Bearer private-value';},
  x=>{x.findings[0].evidence[0].cookie='private';},
  x=>{x.findings[0].field_basis.title={nested:{password:'private'}};},
 ]) {const bad=structuredClone(s);mutate(bad);assert.throws(()=>planManual(bad,b),/Sensitive|Credential|Unsupported|bounded/);}
});

test('manual observations preserve originals, canonical identity and retrieval-only history',()=>{
 const b=registered(),s=load('tests/fixtures/research/build-manual-spec.json');s.findings=s.findings.slice(0,1);
 const parent=planManual(s,b).rows[0].row;parent.status='processed';b.procurement_intake_items.push(parent);
 const lead={id:stableId(['observation-test']),source_id:parent.source_id,external_id:parent.external_id,payload:parent.payload,stage:'hold',notes:'Existing owner note',search_term_used:null};
 b.procurement_leads.push(lead);b.procurement_intake_leads.push({id:stableId(['parent-link']),intake_id:parent.id,lead_id:lead.id});
 const original=structuredClone(parent);
 s.findings[0].amends_intake_id=parent.id;s.findings[0].evidence[0].retrieved_at='2026-10-01T12:00:00Z';
 const observation=planManual(s,b).rows[0].row;b.procurement_intake_items.push(observation);
 assert.deepEqual(parent,original);assert.equal(planManual(s,b).rows.length,0);
 const review={version:1,batch:'manual-amendment-test',project_ref:b.project_ref,request_id:s.findings[0].request_ids[0],work_state:'AR',scope:'Texarkana Arkansas custodial',limitations:'Offline identity regression',reviewed_by:'Offline test',run_ids:[],decisions:[{intake_id:observation.id,intake_hash:hash(observation.payload),action:'process',reason:'Same board document retrieved again',request_match_reason:'District source; site locations remain subject to review'}]};
 const m=planReviewedBatch(b,review,[]);
 assert.equal(m.records[0].id,lead.id);assert.equal(m.records[0].external_id,lead.external_id);
 assert.deepEqual(m.records[0].payload,lead.payload,'Retrieval-only observation does not rewrite business facts/history');
 assert.equal(m.decisions[0].request_reason,review.decisions[0].request_match_reason,'Existing lead gets reviewed missing request link');
 assert.equal(lead.stage,'hold');assert.equal(lead.notes,'Existing owner note');
 const changed=structuredClone(s);changed.findings[0].payload.verification_notes='New primary evidence needs explicit canonical review';
 const amended=planManual(changed,b).rows[0].row;b.procurement_intake_items.push(amended);
 const next=structuredClone(review);next.decisions[0].intake_id=amended.id;next.decisions[0].intake_hash=hash(amended.payload);
 const amendedPlan=planReviewedBatch(b,next,[]);
 assert.equal(amendedPlan.records[0].id,lead.id);assert.ok(amendedPlan.records[0].payload.intake_source_evidence[amended.id]);
 const wrong=structuredClone(s);wrong.findings[0].external_id='another-record';assert.throws(()=>planManual(wrong,b),/identity mismatch/);
 parent.status='ignored';assert.throws(()=>planManual(s,b),/Ignored/);
});
test('request scope normalizes names and retains county/city Arkansas boundaries',()=>{
 const m=planRegistry(spec,before),s=structuredClone(spec);s.requests[0].requested_search_areas[0].county_name=' ouachita ';
 assert.equal(planRegistry(s,registered()).rows.length,0);
 assert.notEqual(m.mappings.requests['ouachita-county'],m.mappings.requests['texarkana-ar']);
 s.requests[1].requested_search_areas[0].state_code='TX';assert.throws(()=>planRegistry(s,before),/Arkansas/);
});
test('explicit source aliases and canonical URL identity prevent guessed duplicates',()=>{
 const s=structuredClone(spec);delete s.sources.find(x=>x.code==='dhs').existing_id;assert.throws(()=>planRegistry(s,before),/alias/);
 assert.equal(canonicalUrl('https://www.tasd7.net/page/school-board-resources/#board'),canonicalUrl('https://www.tasd7.net/page/school-board-resources'));
 const b=registered(),n=structuredClone(spec);const x=n.sources.find(s=>s.code==='tasd-public-board');x.code='tasd-another-name';x.url=x.url.replace(/\/$/,'');assert.throws(()=>planRegistry(n,b),/identity|alias/);
 const other=structuredClone(spec);other.sources=[{...other.sources.find(x=>x.code==='tasd-public-board'),code:'another-agency',agency:'Different agency',name:'Different agency'}];
 assert.equal(planRegistry(other,b).rows.length,1,'Different agencies sharing a portal stay separate');
});
test('credentials and tokenized document URLs cannot enter public source metadata',()=>{
 assert.throws(()=>publicUrl('https://example.org/doc?X-Amz-Signature=private'),/Credential/);
 assert.throws(()=>safeMetadata({access_token:'private'}),/Sensitive/);
 const s=structuredClone(spec);s.sources[0].metadata={api_key:'private'};assert.throws(()=>planRegistry(s,before),/Sensitive/);
});
test('verified route capabilities require fresh evidence and never store credentials',()=>{
 const b=structuredClone(before),s=structuredClone(spec);
 b.procurement_geographies=[{id:'ARLaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',kind:'locality',name:'Texarkana',source_active:true}];
 b.procurement_source_capabilities=[];
 b.procurement_request_sources=[];
 s.capabilities=[{source_code:'texarkana-city',route_geography_id:b.procurement_geographies[0].id,
  kind:'opportunity',method:'api',endpoint_url:'https://www.texarkanaar.gov/bids',
  official_entry_url:'https://www.texarkanaar.gov/departments/finance.php',
  verified_at:'2026-10-02T12:00:00Z',verified_until:'2026-11-02T12:00:00Z',
  verification_evidence:{receipt:'saved public test response'},parser_version:'texarkana-v1',
  method_spec:{version:1,query:{category:'janitorial'},pagination:{type:'single-page'}}}];
 const m=planRegistry(s,b),cap=m.rows.find(x=>x.table==='procurement_source_capabilities');
 assert.ok(cap);assert.equal(cap.row.route_geography_id,b.procurement_geographies[0].id);
 assert.ok(m.rows.some(x=>x.table==='procurement_request_sources'));
 assert.match(persistenceSql(m),/lock table .*procurement_source_capabilities/);
 const applied=structuredClone(b);for(const d of m.rows){applied[d.table]=applied[d.table].filter(x=>x.id!==d.row.id);applied[d.table].push({...d.row,updated_at:'2026-10-02T12:00:00Z'});}
 assert.equal(planRegistry(s,applied).rows.length,0);
 const stale=structuredClone(s);stale.capabilities[0].verified_at='2026-09-01T12:00:00Z';
 assert.throws(()=>planRegistry(stale,applied),/Older method/);
 const secret=structuredClone(s);secret.capabilities[0].method_spec.api_key='private';
 assert.throws(()=>planRegistry(secret,b),/Sensitive/);
});
test('real manual findings require mapped requests, immutable evidence and primary promotion',()=>{
 const b=registered(),m=planRegistry(spec,before),f=load('tests/fixtures/research/finding.json');
 const input={version:1,project_ref:b.project_ref,authorization:spec.authorization,findings:[{source_id:m.mappings.sources[f.source_id][0].id,request_ids:[m.mappings.requests['texarkana-ar']],external_id:f.finding_id,confidence:'secondary',review_reason:'Unverified signed execution; offline test',payload:{title:f.title,source_url:f.source_url,bid_type:'award',work_performance_locations:[{city_name:'Texarkana',state_code:'AR'}]},evidence:[{url:f.source_url,content_sha256:createHash('sha256').update(readFileSync('tests/fixtures/research/board-excerpt.json')).digest('hex'),excerpt:'Board-approved SSC custodial contract',retrieved_at:f.checked_at,locator:'page 2'}]}]};
 const staged=planManual(input,b);b.procurement_intake_items.push(staged.rows[0].row);assert.equal(planManual(input,b).rows.length,0);
 const changed=structuredClone(input);changed.findings[0].payload.title='Changed';assert.throws(()=>planManual(changed,b),/Changed intake evidence/);
 const missing=structuredClone(input);missing.findings[0].evidence=[];assert.throws(()=>planManual(missing,b),/Evidence/);
 const r={version:1,batch:'manual-offline',project_ref:b.project_ref,request_id:input.findings[0].request_ids[0],work_state:'AR',scope:'Texarkana AR custodial',limitations:'District work-site city limits unverified',reviewed_by:'Offline test',run_ids:[],decisions:[{intake_id:staged.rows[0].row.id,intake_hash:hash(staged.rows[0].row.payload),action:'process',approve_new:true,reason:'Test',request_match_reason:'Needs actual work-site verification'}]};
 assert.throws(()=>planReviewedBatch(b,r,[]),/Secondary/);
 r.decisions[0]={...r.decisions[0],action:'defer',approve_new:undefined};assert.equal(planReviewedBatch(b,r,[]).records.length,0);
});
test('actual manual spec rejects wrong project, unmapped source scope and missing evidence',()=>{
 const b=registered(),s=load('tests/fixtures/research/build-manual-spec.json');
 const wrong=structuredClone(s);wrong.project_ref='aaaaaaaaaaaaaaaaaaaa';assert.throws(()=>planManual(wrong,b),/project/);
 const source=structuredClone(s);source.findings[0].source_id=before.procurement_sources.find(s=>s.code==='lrsd').id;assert.throws(()=>planManual(source,b),/registered for/);
 const request=structuredClone(s);request.findings[0].request_ids=[before.procurement_search_requests[0].id];assert.throws(()=>planManual(request,b),/registered for/);
 const stage=planManual(s,b);for(const row of stage.rows)b.procurement_intake_items.push({...row.row,status:'ignored'});
 assert.equal(planManual(s,b).rows.length,0,'Staging preserves ignored originals');
 const f=s.findings[0],i=b.procurement_intake_items.find(i=>i.external_id===f.external_id);i.status='pending';i.payload.work_performance_locations=[{city_name:'Texarkana',state_code:'TX'}];
 const r={version:1,batch:'reject-texas',project_ref:b.project_ref,request_id:f.request_ids[0],work_state:'AR',scope:'Texarkana AR',limitations:'Offline exclusion test',reviewed_by:'Offline test',run_ids:[],decisions:[{intake_id:i.id,intake_hash:hash(i.payload),action:'process',approve_new:true,allow_location_uncertainty:true,reason:'Cannot turn Texas into Arkansas',request_match_reason:'Test exclusion'}]};
 assert.throws(()=>planReviewedBatch(b,r,[]),/out-of-state/);
 i.payload.work_performance_locations=f.payload.work_performance_locations;i.payload.bid_type='opportunity';i.payload.deadline='2025-01-08T10:30:00-06:00';r.decisions[0].intake_hash=hash(i.payload);assert.throws(()=>planReviewedBatch(b,r,[]),/Expired/);
});
