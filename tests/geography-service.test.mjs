import test from 'node:test';
import assert from 'node:assert/strict';
import { geographyRequest } from '../scripts/lib/geography-service.mjs';

const county={id:'05001',kind:'county',name:'Arkansas County',source_active:true};
const city={id:'ARMcity',kind:'municipality',name:'Almyra',source_active:true,dataset_hash:'fixture',
  dataset_url:'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41'};
function fixture({ambiguous=false,failRegistry=false}={}) {
  const calls=[];
  const tables={procurement_geographies:[county,city,...(ambiguous?[{...county,id:'05003',name:'Ashley County'}]:[])],
    procurement_place_counties:[{place_id:city.id,county_id:county.id},...(ambiguous?[{place_id:city.id,county_id:'05003'}]:[])],
    procurement_source_capabilities:[],procurement_sources:[]};
  return {calls,db:{from(table){calls.push(table);const q={select(){return q;},order(){return q;},
    range:async()=>failRegistry&&['procurement_sources','procurement_source_capabilities'].includes(table)
      ?{error:{message:'fixture registry failure'}}:{data:tables[table]}};return q;},
    async rpc(){calls.push('write');return {data:'request'};}}};
}
const scope={service_scope:{service:'janitorial'},search_windows:{award:{from:'2026-10-01',to:'2026-10-31',date_basis:'award_date'}}};
test('preview and ambiguous create avoid unrelated registry reads',async()=>{
  for(const command of ['preview','create']) {
    const {db,calls}=fixture({ambiguous:command==='create',failRegistry:true});
    const result=await geographyRequest(db,command,{kind:'city',name:'Almyra',...scope});
    assert.equal(result.status,command==='preview'?'ready':'needs_county');
    assert.deepEqual(calls,['procurement_geographies','procurement_place_counties']);
  }
});
test('create loads registries before writing and preserves ordered routes',async()=>{
  const {db,calls}=fixture();
  const result=await geographyRequest(db,'create',{kind:'city',name:'Almyra',...scope});
  assert.equal(result.request_id,'request');
  assert.deepEqual(result.routes.map(r=>r.geography.id),[city.id,county.id,'05']);
  assert.deepEqual(calls,['procurement_geographies','procurement_place_counties','procurement_source_capabilities','procurement_sources','write']);
});
test('invalid county selection and registry failures perform no write',async()=>{
  const invalid=fixture();
  await assert.rejects(geographyRequest(invalid.db,'create',{kind:'county',name:county.name,...scope}),/Confirm this county/);
  assert.deepEqual(invalid.calls,['procurement_geographies','procurement_place_counties']);
  const failed=fixture({failRegistry:true});
  await assert.rejects(geographyRequest(failed.db,'create',{kind:'city',name:city.name,...scope}),/registry failure/);
  assert.equal(failed.calls.includes('write'),false);
  const valid=fixture();
  const preview=await geographyRequest(valid.db,'preview',{kind:'county',name:county.name});
  const result=await geographyRequest(valid.db,'create',{kind:'county',name:county.name,...scope,
    selected_city_ids:[],confirmed_city_selection:true,selection_token:preview.selection_token});
  assert.deepEqual(result.routes.map(r=>r.geography.id),[county.id,'05']);
});
