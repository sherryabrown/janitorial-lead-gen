import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGeography, selectedRoutes, planSourceRoutes } from '../scripts/lib/geography-routing.mjs';

const countyA={id:'05001',kind:'county',name:'Arkansas County',source_active:true};
const countyB={id:'05003',kind:'county',name:'Ashley County',source_active:true};
const cityA={id:'ARMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',kind:'municipality',name:'Shared City',source_active:true,dataset_hash:'a'};
const cityB={id:'ARMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',kind:'municipality',name:'Shared City',source_active:true,dataset_hash:'b'};
const cityC={id:'ARMcccccccccccccccccccccccccccccccc',kind:'municipality',name:'Almyra',source_active:true,dataset_hash:'c'};
const geo=[{id:'05',kind:'state',name:'Arkansas'},countyA,countyB,cityA,cityB,cityC];
const links=[{place_id:cityA.id,county_id:countyA.id},{place_id:cityB.id,county_id:countyB.id},
  {place_id:cityC.id,county_id:countyA.id}];

test('city routes resolve county, ask on cross-county ambiguity, and reject guessed aliases',()=>{
  const ambiguous=resolveGeography(geo,links,{kind:'city',name:'Shared City'});
  assert.equal(ambiguous.status,'needs_county');
  assert.deepEqual(ambiguous.counties.map(x=>x.name),['Arkansas County','Ashley County']);
  const resolved=resolveGeography(geo,links,{kind:'city',name:' shared  city ',county:'Ashley'});
  assert.deepEqual(selectedRoutes(resolved).map(x=>x.id),[cityB.id,countyB.id,'05']);
  assert.throws(()=>resolveGeography(geo,links,{kind:'city',name:'Shared',county:'Ashley'}),/not found/);
  assert.throws(()=>selectedRoutes(resolved,[cityB.id],true),/do not use/);
});

test('county requires a fresh explicit selection on every request, including county-only',()=>{
  const resolved=resolveGeography(geo,links,{kind:'county',name:' Arkansas County '});
  assert.equal(resolved.status,'needs_city_confirmation');
  assert.deepEqual(resolved.cities.map(x=>x.name),['Almyra','Shared City']);
  assert.throws(()=>selectedRoutes(resolved,[],false,resolved.selection_token),/Confirm/);
  assert.throws(()=>selectedRoutes(resolved,[],true,'stale'),/Confirm/);
  assert.deepEqual(selectedRoutes(resolved,[],true,resolved.selection_token).map(x=>x.id),[countyA.id,'05']);
  assert.deepEqual(selectedRoutes(resolved,[cityC.id,cityA.id],true,resolved.selection_token).map(x=>x.id),
    [cityC.id,cityA.id,countyA.id,'05']);
  assert.throws(()=>selectedRoutes(resolved,[cityB.id],true,resolved.selection_token),/not in/);
  assert.throws(()=>selectedRoutes(resolved,[cityA.id,cityA.id],true,resolved.selection_token),/not in/);
});

test('verified runnable methods are known; stale and candidate-only routes need research',()=>{
  const resolved=resolveGeography(geo,links,{kind:'city',name:'Almyra'});
  const routes=selectedRoutes(resolved);
  const source={id:'source-1',code:'county-board',name:'County postings',contracting_entity_geo_level:'county',
    source_coverage_areas:[{area_type:'county',county_name:'Arkansas',state_code:'AR'}]};
  const sam={id:'source-sam',code:'sam',name:'SAM notices',contracting_entity_geo_level:'federal',source_coverage_areas:[]};
  const verified={id:'cap-1',source_id:sam.id,route_geography_id:'05',kind:'opportunity',
    method:'api',availability:'active',verified_at:'2026-09-01T00:00:00Z',
    verified_until:'2026-11-01T00:00:00Z',verification_evidence:{receipt:'test'},
    method_spec:{version:1,runner_id:'sam-search',query_defaults:{ncode:'561720'}},parser_version:'v1'};
  const result=planSourceRoutes(routes,[verified,{...verified,id:'cap-stale',route_geography_id:countyA.id,
    source_id:source.id,verified_until:'2026-09-30T00:00:00Z'}],[source,sam],new Date('2026-10-02T00:00:00Z'));
  assert.deepEqual(result.map(x=>x.geography.id),[cityC.id,countyA.id,'05']);
  assert.equal(result[0].categories.opportunity.needs_research,true);
  assert.equal(result[1].categories.opportunity.needs_research,true);
  assert.equal(result[1].categories.opportunity.source_candidates[0].source_id,source.id);
  assert.equal(result[2].categories.opportunity.known.length,0);
  assert.equal(result[2].categories.opportunity.needs_research,true);
  assert.equal(result[2].categories.opportunity.source_candidates.some(s=>s.source_id===sam.id),false);
  const unsupported=planSourceRoutes(routes,[{...verified,id:'cap-other',method_spec:{version:1,runner_id:'future-adapter'}}],
    [source,sam],new Date('2026-10-02T00:00:00Z'));
  assert.equal(unsupported[2].categories.opportunity.needs_research,true);
  const stateSource={id:'source-state',code:'state-other',name:'State postings',
    source_coverage_areas:[{area_type:'state',state_code:'AR'}]};
  const publicMethod={...verified,id:'cap-public',source_id:stateSource.id,method:'browser',
    method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',
      urls:['https://example.gov/bids'],allowed_hosts:['example.gov'],max_bytes:2000000}};
  const withPublic=planSourceRoutes(routes,[verified,publicMethod],[source,sam,stateSource],new Date('2026-10-02'));
  assert.deepEqual(withPublic[2].categories.opportunity.known.map(c=>c.capability_id),['cap-public']);
});
