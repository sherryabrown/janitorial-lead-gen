import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminDatabase,sqlApi} from './helpers/admin-trigger-db.mjs';
import {countyTriggers} from '../scripts/lib/county-triggers.mjs';
import {executeKnownSources} from '../scripts/lib/known-source-collection.mjs';
const admin='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';

test('source decisions reuse storage, preserve check facts, replay safely and scope exclusions',async()=>{
 const sql=await adminDatabase();
 try {
  await sql.exec(`create table public.profiles(user_id uuid unique references auth.users(id),role text);
    insert into auth.users values('${admin}'),('${user}');insert into public.profiles values('${admin}','admin'),('${user}','user');
    insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values
      ('05','state','Arkansas','fixture','1','state'),('05001','county','Arkansas County','fixture','1','county');`);
  await sql.exec(readFileSync('supabase/migrations/20261026000300_procurement_source_decisions.sql','utf8'));
  await sql.exec(readFileSync('supabase/migrations/20261026000400_procurement_source_exclusion_claims.sql','utf8'));
  const db=sqlApi(sql),service=countyTriggers({db});
  async function attempt(key){
    const input={county_ids:['05001'],target_kind:'county_scope',maintain_sources:false,check_updates:true,
      requested_categories:['opportunity','award'],search_windows:{opportunity:{from:'2026-10-13',to:'2027-10-13',date_basis:'deadline'},award:{from:'2026-10-01',to:'2026-10-26',date_basis:'award_date'}}};
    const preview=await service.preview(input),run=await service.submit({...input,confirmed_scope:true,preview_hash:preview.preview_hash},admin,key);
    const request=(await service.status(run.trigger_id)).children[0].request_id;
    await executeKnownSources({db,command:'plan',requestId:request});
    return (await sql.query('select t.* from procurement_coverage_tasks t join procurement_request_targets r on r.id=t.target_id where r.search_request_id=$1 order by t.kind',[request])).rows;
  }
  const tasks=await attempt('source-review-first'),opportunity=tasks.find(t=>t.kind==='opportunity'),award=tasks.find(t=>t.kind==='award');
  assert.ok(opportunity);assert.ok(award);
  const save=async(actor,task,version,decision,key,reenable=false)=>(await sql.query(
    'select record_procurement_source_decision($1,$2,$3,$4,$5,$6,procurement_source_review_revisions(array[$2::uuid])->>$2::text,$7) as result',[actor,task,version,decision,'Reviewed official source availability',key,reenable])).rows[0].result;
  await assert.rejects(save(user,opportunity.id,0,'no_website','deny-user-key'),e=>e.code==='42501');
  await assert.rejects(save(admin,opportunity.id,0,'fixed_verified','cannot-fake-fix'),/Invalid source decision/);
  const saved=await save(admin,opportunity.id,0,'no_website','first-decision-key');
  assert.equal(saved.version,1);assert.equal(saved.checks_excluded,true);
  assert.deepEqual(await save(admin,opportunity.id,0,'no_website','first-decision-key'),saved);
  await assert.rejects(save(admin,opportunity.id,0,'no_issue','first-decision-key'),/Idempotency key reused/);
  await assert.rejects(save(admin,opportunity.id,0,'no_issue','stale-decision-key'),e=>e.code==='40001');
  assert.equal((await sql.query('select procurement_source_check_excluded($1) as excluded',[opportunity.id])).rows[0].excluded,true);
  assert.equal((await sql.query('select procurement_source_check_excluded($1) as excluded',[award.id])).rows[0].excluded,false);
  const later=await attempt('source-review-later'),laterTask=later.find(t=>t.kind==='opportunity');
  assert.equal((await sql.query('select procurement_source_check_excluded($1) as excluded',[laterTask.id])).rows[0].excluded,true);
  const {rows:[parent]}=await sql.query('select search_request_id from procurement_request_targets where id=$1',[laterTask.target_id]);
  await sql.query(`insert into procurement_jobs(search_request_id,task_id,dedupe_key,kind,state,checkpoint)
    values($1,$2,'excluded-known-check','collect','pending','{}'),($1,null,'api-workflow:excluded-research','discover','pending',jsonb_build_object('task_id',$2::text)),
    ($1,null,'api-import:unaffected-import','process','pending','{}')`,[parent.search_request_id,laterTask.id]);
  const {rows:[pending]}=await sql.query("select id from procurement_jobs where dedupe_key='excluded-known-check'");
  assert.equal((await sql.query('select claim_procurement_known_job($1) as job',[pending.id])).rows[0].job,null);
  const excludedJobs=(await sql.query("select state,checkpoint from procurement_jobs where dedupe_key in ('excluded-known-check','api-workflow:excluded-research')")).rows;
  assert.ok(excludedJobs.every(j=>j.state==='blocked'&&j.checkpoint.source_check_excluded===true));
  assert.equal((await sql.query("select state from procurement_jobs where dedupe_key='api-import:unaffected-import'")).rows[0].state,'pending');
  const reopened=await save(admin,laterTask.id,1,'unreviewed','reopen-review-key');
  assert.equal(reopened.id,saved.id);assert.equal(reopened.checks_excluded,true,'Reopen never re-enables');
  const enabled=await save(admin,laterTask.id,2,'unreviewed','explicit-enable-key',true);
  assert.equal(enabled.checks_excluded,false);
  const noIssue=await save(admin,award.id,0,'no_issue','no-issue-review-key');assert.equal(noIssue.checks_excluded,false);
  assert.equal((await sql.query('select state from procurement_coverage_tasks where id=$1',[opportunity.id])).rows[0].state,opportunity.state);
  const history=(await sql.query("select detail from procurement_events where event_type like 'source_review_%' order by created_at")).rows;
  assert.equal(history.length,4,'Replay and rejected writes add no duplicate history');
  assert.equal((await sql.query("select count(*)::int as n from information_schema.tables where table_name in ('procurement_source_issues','procurement_source_issue_events')")).rows[0].n,0);
  await sql.exec(readFileSync('supabase/migrations/20261027000100_procurement_guided_source_repairs.sql','utf8'));
  assert.deepEqual(await save(admin,award.id,0,'no_issue','no-issue-review-key'),noIssue,'Phase 1 acknowledgements still replay after the guided-repair migration');
  const revision=(await sql.query('select procurement_source_review_revisions(array[$1::uuid])->>$1::text as revision',[laterTask.id])).rows[0].revision;
  const queue=async()=>sql.query('select queue_procurement_source_repair($1,$2,$3,$4,$5,$6) as result',[admin,laterTask.id,3,revision,'guided-website-key','https://county.example/bids']);
  const queued=(await queue()).rows[0].result;
  assert.equal((await queue()).rows[0].result.job_id,queued.job_id);
  const verification=(await sql.query('select * from procurement_jobs where id=$1',[queued.job_id])).rows[0];
  assert.notEqual(verification.search_request_id,parent.search_request_id,'Repair evidence never attaches to the old schedule request');
  assert.notEqual(verification.checkpoint.task_id,laterTask.id);assert.equal(verification.checkpoint.review_task_id,laterTask.id);
  const currentReview=(await sql.query('select review_version,review_decision,checks_excluded from procurement_action_requests where id=$1',[saved.id])).rows[0];
  assert.equal(currentReview.review_decision,'repair_in_progress');assert.equal(currentReview.review_version,4);
  await assert.rejects(sql.query('select finish_procurement_guided_repair($1,$2)',[admin,queued.job_id]),/verified repair|lease required/i);
  const newest=await attempt('source-review-new-observation'),newAward=newest.find(t=>t.kind==='award');
  await sql.query("update procurement_coverage_tasks set state='blocked',evidence='{"+'"reason":"HTTP 403"'+"}' where id=$1",[newAward.id]);
  const {rows:[reopenedAward]}=await sql.query('select review_version,review_decision,latest_review_task_id from procurement_action_requests where id=$1',[noIssue.id]);
  assert.equal(reopenedAward.review_decision,'unreviewed');assert.equal(reopenedAward.latest_review_task_id,newAward.id);
  const allContexts=(await sql.query('select procurement_source_review_context($1::uuid[]) as c',[[award.id,newAward.id]])).rows[0].c;
  assert.equal(allContexts.current_tasks[award.id].id,newAward.id);assert.equal(allContexts.current_tasks[newAward.id].id,newAward.id);
  assert.equal(allContexts.current_revisions[award.id],allContexts.current_revisions[newAward.id],'All entry points review the same current observation');
  await sql.query("update procurement_coverage_tasks set state='blocked',evidence='{"+'"reason":"HTTP 403"'+"}' where id=$1",[newAward.id]);
  assert.equal((await sql.query('select review_version from procurement_action_requests where id=$1',[noIssue.id])).rows[0].review_version,reopenedAward.review_version);
  await save(admin,award.id,0,'no_issue','no-issue-review-key');
  assert.equal((await sql.query('select review_decision from procurement_action_requests where id=$1',[noIssue.id])).rows[0].review_decision,'unreviewed','Replaying an old acknowledgement never overwrites a newer observation');
 }finally{await sql.close();}
});
