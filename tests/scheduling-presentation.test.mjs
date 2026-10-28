import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleSourceSetup} from '../scripts/lib/scheduling-presentation.mjs';
import {scheduleBusinessRoute} from '../scripts/lib/procurement-capabilities.mjs';
test('User source setup is an explicit safe projection with scoped exclusions and no private evidence',async()=>{
 const review={review_scope:{geography_id:'05001',category:'opportunity',source_id:'source',capability_id:'old'},review_decision:'wont_address'};
 const calls=[];const db={from(table){calls.push(table);const q={eq:()=>q,not:()=>q,in:()=>q,order:()=>q,range:()=>q,select:()=>q,then:(yes,no)=>Promise.resolve({data:table==='procurement_action_requests'?[review]:[{id:'new',verification_evidence:{source_review_roots:{'05001':'old'}}}]}).then(yes,no)};return q;}};
 const catalog={sources:async()=>({as_of:'2026-10-28',scope:{requested_categories:['opportunity']},next_offset:null,total:1,gaps:{items:[],next_offset:null},items:[{id:'source',name:'County bids',url:'https://county.example/bids',kind:'county',config:{secret:'must not leak'},routes:[{geography_id:'05001',geography:'Arkansas County',kind:'opportunity',status:'verified_method',methods:[{id:'new',runner:'private',evidence:'private'}]},{geography_id:'05003',geography:'Ashley County',kind:'opportunity',status:'verified_method',methods:[{id:'new'}]},{geography_id:'05001',geography:'Arkansas County',kind:'award',status:'method_blocked',methods:[]}]}]})};
 const result=await scheduleSourceSetup(db,catalog,'schedule');assert.equal(result.items[0].name,'County bids');assert.equal(result.items[0].url,'https://county.example/bids');
 assert.deepEqual(result.items[0].routes.map(r=>r.checks_excluded),[true,false]);assert.equal(result.items[0].routes.length,2,'Unselected categories are omitted');
 assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('secret'));assert.equal(calls.length,2,'One batch for decisions and one for method lineage, not one read per route');
 const id='00000000-0000-4000-8000-000000000001';assert.equal(scheduleBusinessRoute('GET',`/v1/schedules/${id}/sources`),true);assert.equal(scheduleBusinessRoute('GET','/v1/source-reviews'),false);
});
