import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceInventory,inventoryReport } from '../scripts/lib/source-inventory.mjs';
import { buildKnownSourcePlan } from '../scripts/lib/known-source-execution.mjs';
const now=new Date('2026-10-04');
const area={area_type:'state',state_code:'AR'};
const sources=[{id:'a',code:'a',name:'Working',url:'https://example.gov/',source_coverage_areas:[area],config:{api_status:'key needed'}},
  {id:'b',code:'b',name:'Pending',url:'https://example.gov/',source_coverage_areas:[area]},
  {id:'c',code:'c',name:'Unmapped',url:'https://example.gov/',source_coverage_areas:[]}];
const geo=[{id:'05',name:'Arkansas',kind:'state',source_active:true}];
const cap={id:'cap',source_id:'a',route_geography_id:'05',kind:'opportunity',method:'browser',availability:'active',
  verified_at:'2026-10-01',verified_until:'2026-11-01',verification_evidence:{run_id:'run'},parser_version:'v1',
  method_spec:{version:1,runner_id:'public-fetch',check_when:'each_request',urls:['https://example.gov/'],allowed_hosts:['example.gov'],max_bytes:1000}};
const target={id:'target',geography_id:'05',checkpoint:{route_order:0}};
test('working method cannot hide another source on the same portal; unmapped registry stays visible',()=>{
  const plan=buildKnownSourcePlan({id:'request'},[target],geo,[cap],sources,now);
  assert.equal(plan.known,1);
  assert.ok(plan.tasks.some(t=>t.source_id==='b'&&t.kind==='opportunity'&&t.state==='method_missing'));
  assert.ok(!plan.tasks.some(t=>t.source_id==='c'));
  assert.equal(plan.tasks.filter(t=>t.kind==='source_entry'&&t.source_id==='b').length,1);
  const inventory=sourceInventory(sources,[cap],geo,now);
  assert.equal(inventory.length,3);
  assert.equal(inventory.find(s=>s.code==='c').mapping_status,'mapping_missing');
  assert.equal(inventory[0].current_verified_methods,1);
  assert.equal(inventory[0].legacy_notes.api_status,'key needed');
  assert.match(inventory[0].warnings.join(' '),/historical/);
  assert.equal(inventoryReport(inventory).summary.mapping_missing,1);
  assert.deepEqual(plan,buildKnownSourcePlan({id:'request'},[target],geo,[cap],sources,now));
});
test('unsupported needs current route-specific evidence; stale methods stay unresolved',()=>{
  const reviewed=structuredClone(sources);
  reviewed[1].config={known_source_review:{category_assessments:[{kind:'forecast',route_geography_id:'05',status:'unsupported',
    reason:'Official page excludes forecasts',evidence:{url:'https://example.gov/'},checked_at:'2026-10-01',valid_until:'2026-11-01'}]}};
  let inventory=sourceInventory(reviewed,[{...cap,verified_until:'2026-10-03'}],geo,now);
  assert.equal(inventory[0].categories.find(c=>c.kind==='opportunity').status,'method_blocked');
  assert.equal(inventory[1].categories.find(c=>c.kind==='forecast').status,'unsupported');
  assert.equal(inventory[1].categories.find(c=>c.kind==='award').status,'category_unresolved');
  const plan=buildKnownSourcePlan({id:'r'},[target],geo,[],reviewed,now);
  assert.ok(!plan.tasks.some(t=>t.source_id==='b'&&t.kind==='forecast'));
  delete reviewed[1].config.known_source_review.category_assessments[0].evidence;
  inventory=sourceInventory(reviewed,[],geo,now);
  assert.equal(inventory[1].categories.find(c=>c.kind==='forecast').status,'category_unresolved');
});
test('same source retains independent methods and gaps across routes',()=>{
  const places=[...geo,{id:'city',name:'Example',kind:'municipality',source_active:true}];
  const registry=[{...sources[0],source_coverage_areas:[area,{area_type:'city',city_name:'Example',state_code:'AR'}]}];
  const plan=buildKnownSourcePlan({id:'r'},[target,{id:'city-target',geography_id:'city',checkpoint:{route_order:0}}],places,[cap],registry,now);
  assert.equal(plan.known,1);
  assert.ok(plan.tasks.some(t=>t.source_id==='a'&&t.route_geography_id==='city'&&t.kind==='opportunity'&&t.state==='method_missing'));
  assert.equal(sourceInventory(registry,[cap],places,now)[0].categories.length,6);
});

test('dated source blocker remains visible alongside a narrow verified method',()=>{
  const registry=[{...sources[0],config:{phase2b_method_status:{status:'current_open_view_only',
    attempted_at:'2026-10-04T21:00:00Z',evidence_run_id:'run',
    blocker:'Archive pagination unknown',next_action:'Verify archive query',actor:'agent'}}}];
  const row=sourceInventory(registry,[cap],geo,now)[0];
  assert.equal(row.current_verified_methods,1);
  assert.equal(row.next_action,'Verify archive query');
  assert.match(inventoryReport([row]).markdown,/Archive pagination unknown/);
});
