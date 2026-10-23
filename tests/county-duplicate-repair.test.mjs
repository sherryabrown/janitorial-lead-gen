import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {planCountyDuplicateRepair,countyDuplicateRepairSql,verifyCountyDuplicateRepair} from '../scripts/lib/county-duplicate-repair.mjs';
import {canonicalReportingJobs} from '../scripts/lib/canonical-reporting.mjs';
import {verifiedRunOutcomes,identitySnapshot} from '../scripts/lib/reporting-identities.mjs';
const saved=JSON.parse(readFileSync('tests/fixtures/county/clearwater-addendum.json'));
test('targeted retirement preserves all sales/history/FK data; rollback, replay, stale guards and exact cohorts',async()=>{
 const db=await adminDatabase();try{
 const source='10000000-0000-4000-8000-000000000301',a='10000000-0000-4000-8000-000000000302',b='10000000-0000-4000-8000-000000000303',actor='10000000-0000-4000-8000-000000000304',note='10000000-0000-4000-8000-000000000305';
 await db.query("insert into auth.users(id) values($1)",[actor]);
 await db.query("insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level) values($1,'clearwater-repair','Clearwater fixture','https://arkansas.ionwave.net/','other_public','city')",[source]);
 for(const [n,id]of[a,b].entries())await db.query("insert into procurement_leads(id,source_id,external_id,payload,stage,notes)values($1,$2,$3,$4,$5,$6)",[id,source,saved.records[n].external_id,{...saved.records[n].payload,business_category:'other_public'},n?'new':'applied',n?null:'Keep original owner note']);
 await db.query("insert into procurement_lead_notes(id,lead_id,body,created_by)values($1,$2,'Original user note',$3)",[note,a,actor]);
 await db.query("insert into procurement_lead_note_edits(note_id,old_body,new_body,edited_by)values($1,'Before','Original user note',$2)",[note,actor]);
 const snapshot=async()=>Object.fromEntries(await Promise.all(['procurement_leads','procurement_intake_items','procurement_intake_leads','procurement_request_leads','procurement_contacts','procurement_lead_links','procurement_lead_notes','procurement_lead_note_edits','procurement_lead_stage_changes','procurement_versions','procurement_events'].map(async table=>[table,(await db.query('select to_jsonb(t) as row from '+table+' t order by id')).rows.map(r=>r.row)])));
 const before=await snapshot(),m=planCountyDuplicateRepair(before,{originalId:a,duplicateId:b}),sql=countyDuplicateRepairSql(m);
 await assert.rejects(db.exec(sql.replace('-- AFTER_CANONICAL_UPSERT: offline fault-injection point.',()=>"do $$ begin raise exception 'repair fault'; end $$;")),/repair fault/);await db.exec('rollback');assert.deepEqual(await snapshot(),before);
 await db.exec(sql);const after=await snapshot();assert.equal(verifyCountyDuplicateRepair(before,after,m).verified,true);
 assert.equal(after.procurement_leads.find(l=>l.id===a).stage,'applied');assert.equal(after.procurement_leads.find(l=>l.id===a).notes,'Keep original owner note');assert.equal(after.procurement_leads.length,2);
 await db.exec(sql);assert.deepEqual(await snapshot(),after,'Replay changes no timestamps, source history or user data');
 assert.equal(planCountyDuplicateRepair(after,{originalId:a,duplicateId:b}).summary.already_repaired,true);
 const jobs=[{state:'succeeded',checkpoint:{automatic:{},receipt:{verified:true},reporting_records:{version:1,records:[{id:a,outcome:'added',category:'opportunity'},{id:b,outcome:'added',category:'opportunity'}]}}}];
 const immutable=structuredClone(jobs),run={state:'completed'},old=verifiedRunOutcomes(run,jobs),normalized=await canonicalReportingJobs(sqlApi(db),jobs),resolved=verifiedRunOutcomes(run,normalized);
 assert.equal(resolved.records.length,1);assert.equal(resolved.records[0].id,a);assert.deepEqual(resolved.records[0].canonical_aliases,[b]);assert.notEqual(identitySnapshot(old.records),identitySnapshot(resolved.records));assert.deepEqual(jobs,immutable,'Immutable run evidence is never rewritten');
 await db.query("update procurement_leads set notes='Concurrent owner edit' where id=$1",[a]);await assert.rejects(db.exec(sql),/baseline changed/);await db.exec('rollback');
 const conflict=structuredClone(before);conflict.procurement_leads.find(l=>l.id===b).stage='interested';assert.throws(()=>planCountyDuplicateRepair(conflict,{originalId:a,duplicateId:b}),/user sales data/);
 }finally{await db.close();}
});
