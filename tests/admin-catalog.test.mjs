import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {adminCatalog,catalogProjection,catalogInput} from '../scripts/lib/admin-catalog.mjs';
import {sourceInventory} from '../scripts/lib/source-inventory.mjs';
import {workflowServer} from '../scripts/lib/workflow-http.mjs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
const now=new Date('2026-10-22T12:00:00Z'),city='ARM'+'a'.repeat(32),rock='ARM'+'b'.repeat(32);
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const county=(id,name)=>({id,name,kind:'county',source_active:true,dataset_hash:id});
function fixture(){
 const geographies=[{id:'05',name:'Arkansas',kind:'state',source_active:true},county('05125','Saline County'),county('05053','Grant County'),county('05119','Pulaski County'),{id:city,name:'Tull',kind:'municipality',source_active:true,dataset_hash:'current'},{id:rock,name:'Little Rock',kind:'municipality',source_active:true,dataset_hash:'rock'}];
 const links=[{place_id:city,county_id:'05053'},{place_id:city,county_id:'05125'},{place_id:rock,county_id:'05119'}];
 const sources=[{id:uuid(1),name:'Shared official channel',code:'shared',url:'https://example.gov/',contracting_entity_geo_level:'state',source_coverage_areas:[{area_type:'state',state_code:'AR'}],config:{api_status:'SECRET',phase2b_method_status:{blocker:'PRIVATE'}}},{id:uuid(2),name:'Unmapped',code:'unmapped',url:'javascript:alert(1)',source_coverage_areas:[]}];
 const cap={id:uuid(3),source_id:uuid(1),route_geography_id:'05',kind:'opportunity',method:'browser',availability:'active',verified_at:'2026-10-01',verified_until:'2027-10-01',verification_evidence:{automation_policy:'county-public-v1',route_geography_ids:[city],url:'https://example.gov/evidence',private_artifact:'SECRET'},parser_version:'v1',method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://example.gov/'],allowed_hosts:['example.gov'],max_bytes:1000}};
 return {geographies,links,sources,capabilities:[cap],associations:[{id:uuid(4),source_id:uuid(1),county_ids:['05125','05053'],category:'opportunity'}]};
}
test('catalog reuses execution coverage and method readiness without exposing private config or multiplying sources',()=>{
 const d=fixture(),result=catalogProjection(d,{},now);assert.equal(result.sources.total,2);
 const row=result.sources.items.find(s=>s.id===uuid(1));assert.equal(row.routes.find(r=>r.geography_id===city&&r.kind==='opportunity').status,'verified_method');assert.equal(row.associations[0].counties.length,2);
 assert.equal(row.routes.length,sourceInventory(d.sources,d.capabilities,d.geographies,now)[0].categories.length);
 assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 assert.equal(result.sources.items.find(s=>s.id===uuid(2)).url,null);assert.equal(result.sources.items.find(s=>s.id===uuid(2)).mapping_status,'mapping_missing');
 d.capabilities[0].verified_until='2026-10-01';assert.equal(catalogProjection(d,{category:'opportunity',readiness:'method_blocked'},now).sources.total,1);
 assert.ok(result.gaps.items.some(g=>g.geography_id==='05125'));assert.ok(result.gaps.items.some(g=>g.geography_id===rock));
});
test('related geography uses exact GIS memberships, inactive flags and immutable saved comparison',()=>{
 const d=fixture();d.geographies.push({id:'legacy',name:'Tull',kind:'place',source_active:false});d.links.push({place_id:'legacy',county_id:'05125'});d.schedule={version:3,config:{target_kind:'county_scope',county_ids:['05125'],counties:[{id:'05125',name:'Saline County',selection_token:'old',city_ids:[],cities:[]}]}};
 const before=JSON.stringify(d),r=catalogProjection(d,{geography:'05125'},now).geographies.items[0];assert.deepEqual(r.cities.map(c=>c.name),['Tull']);assert.equal(r.cities[0].counties.length,2);assert.equal(r.saved.changed,true);assert.equal(r.saved.added[0].name,'Tull');assert.equal(JSON.stringify(d),before);
 assert.throws(()=>catalogProjection(d,{geography:'05119'},now),/scope/);
 d.geographies.find(g=>g.id===city).source_active=false;assert.equal(catalogProjection(d,{geography:'05125'},now).geographies.items[0].cities[0].active,false);
});
test('state grouped memberships and SAM remain separate from county/site assertions',()=>{
 const d=fixture();d.schedule={version:1,config:{target_kind:'state_source',county_ids:['05125','05053'],state_trigger_ids:[uuid(4)],state_sources:[],counties:[]}};
 const state=catalogProjection(d,{},now);assert.equal(state.sources.total,1);assert.match(state.geographies.items[0].basis,/derived/);assert.equal(state.gaps.total,0);
 d.schedule.config={target_kind:'sam',county_ids:[]};const sam=catalogProjection(d,{},now);assert.equal(sam.geographies.total,1);assert.equal(sam.geographies.items[0].id,'05');assert.match(sam.geographies.items[0].basis,/record work sites/);assert.equal(sam.sources.total,0);assert.equal(sam.gaps.total,0);assert.throws(()=>catalogProjection(d,{geography:'05125'},now),/scope/);
 d.sources.push({id:uuid(5),code:'sam',name:'SAM.gov',url:'https://sam.gov/',source_coverage_areas:[]});assert.equal(catalogProjection(d,{},now).sources.total,1);
});
test('changed and missing state associations are explicit without rewriting saved counties',()=>{
 const d=fixture();d.schedule={version:2,config:{target_kind:'state_source',state_trigger_ids:[uuid(4),uuid(99)],county_ids:['05119','05125'],counties:[{id:'05119',name:'Pulaski County',cities:[]},{id:'05125',name:'Saline County',cities:[]}]}};
 const r=catalogProjection(d,{},now);assert.equal(r.scope.missing_state_associations.length,1);assert.equal(r.geographies.items.find(g=>g.id==='05119').association_status,'Saved association only');assert.equal(r.geographies.items.find(g=>g.id==='05053').association_status,'Current association only');assert.deepEqual(d.schedule.config.county_ids,['05119','05125']);
 const county=catalogProjection(fixture(),{geography:'05125',category:'opportunity'},now);assert.ok(county.sources.items.some(s=>s.id===uuid(1)));assert.ok(county.sources.items.find(s=>s.id===uuid(1)).routes.every(r=>r.kind==='opportunity'));
});
test('catalog filtering, stable pagination, gap paging and unsafe input rejection',()=>{
 const d=fixture();d.sources=Array.from({length:52},(_,i)=>({...d.sources[1],id:uuid(i+100),name:'Unmapped '+String(i).padStart(2,'0'),code:'u'+i}));
 const a=catalogProjection(d,{q:'Unmapped',limit:25},now),b=catalogProjection(d,{q:'Unmapped',limit:25,offset:25},now),c=catalogProjection(d,{q:'Unmapped',limit:25,offset:50},now);
 assert.equal(a.sources.total,52);assert.equal(b.sources.items.length,25);assert.equal(c.sources.items.length,2);assert.equal(new Set([...a.sources.items,...b.sources.items,...c.sources.items].map(s=>s.id)).size,52);
 const gap=catalogProjection(d,{limit:2,gap_offset:2},now);assert.equal(gap.gaps.items.length,2);assert.equal(gap.gaps.next_offset,4);
 for(const input of [{limit:101},{offset:-1},{gap_offset:'bad'},{sort:'secret'},{source:'<script>'},{q:'x'.repeat(121)}])assert.throws(()=>catalogInput(input),/Invalid catalog/);
});
test('real disposable SQL reads project registry and bounded capture metadata; history failure retains catalog',async()=>{
 const sql=await adminDatabase();try{
  await sql.exec(`insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash)values('05','state','Arkansas','fixture','1','a'),('05125','county','Saline County','fixture','1','b');`);
  await sql.query(`insert into procurement_sources(id,code,name,url,business_category,source_coverage_areas,config)values($1,'test','Official','https://example.gov/','other_public',$2,$3)`,[uuid(1),[{area_type:'county',county_name:'Saline',state_code:'AR'}],{secret:'HIDDEN'}]);
  await sql.query(`insert into procurement_runs(source_id,started_at,status,detail)values($1,'2026-10-22','partial',$2)`,[uuid(1),{secret:'HIDDEN'}]);
  const db=sqlApi(sql),service=adminCatalog({db}),result=await service.sources({geography:'05125'});assert.equal(result.total,1);assert.equal(result.items[0].last_check.status,'partial');assert.equal(JSON.stringify(result).includes('HIDDEN'),false);
  assert.equal((await service.geographies({geography:'05125'})).items[0].name,'Saline County');
  const failed=adminCatalog({db:{from(table){if(table==='procurement_runs')throw Error('private database detail');return db.from(table);}}});
  assert.equal((await failed.sources({})).items[0].last_check,null);assert.match((await failed.sources({})).items[0].check_basis,/unavailable/);
 }finally{await sql.close();}
});
test('catalog endpoints authenticate, reject bad filters, redact failures and never wake execution',async()=>{
 let kicks=0;const d=fixture(),catalog={sources:async input=>catalogProjection(d,input,now).sources,geographies:async input=>catalogProjection(d,input,now).geographies};
 const server=workflowServer({authenticate:async()=>({id:uuid(90)}),catalog,kick:()=>kicks++});
 const call=(url,authorized=true)=>new Promise(resolve=>{const req=Readable.from([]);Object.assign(req,{url,method:'GET',headers:authorized?{authorization:'Bearer fixture'}:{}});server.emit('request',req,{setHeader(){},writeHead(status){this.status=status;},end(body){resolve({status:this.status,body:JSON.parse(body)});}});});
 assert.equal((await call('/v1/admin/sources',false)).status,401);assert.equal((await call('/v1/admin/sources?limit=101')).status,400);assert.equal((await call('/v1/admin/geographies?geography=05125')).status,200);assert.equal((await call('/v1/admin/sources')).status,200);assert.equal(kicks,0);
 catalog.sources=async()=>{throw Error('private credential');};assert.equal(JSON.stringify(await call('/v1/admin/sources')).includes('private credential'),false);
});
