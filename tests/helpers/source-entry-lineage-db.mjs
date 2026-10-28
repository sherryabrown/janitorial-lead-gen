import assert from 'node:assert/strict';
export async function verifySourceEntryLineage({sql,actor,opportunityId}){
 const save=async task=>(await sql.query("select record_procurement_source_decision($1,$2,0,'no_website','Verified entry lineage fixture','entry-root-decision',procurement_source_review_revisions(array[$2::uuid])->>$2::text,false) as r",[actor,task])).rows[0].r;
  // Native acceptance wraps the fixture in one transaction: now() ties there.
  // Keep its deterministic tie-break ordered just as separate observations are.
  const entryTask=async(key,source=null)=>(await sql.query(`insert into procurement_coverage_tasks(id,target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,state,evidence,query_window,source_id)
    select $4,target_id,$2,agency_scope,route_geography_id,'source_entry',priority,'Website entry assessment','source_missing','{}',query_window,$3 from procurement_coverage_tasks where id=$1 returning *`,[opportunityId,key,source,key==='entry-root-original'?'00000000-0000-4000-8000-000000000100':'ffffffff-ffff-4fff-8fff-fffffffffff0'])).rows[0];
  const originalEntry=await entryTask('entry-root-original'),entryReview=await save(originalEntry.id);
  const source=(await sql.query("insert into procurement_sources(code,name,url,business_category) values('entry-root-fixture','Official entry','https://entry-root.example/','other_public') returning id")).rows[0];
  const nextEntry=await entryTask('entry-root-after-registration',source.id);
  await sql.query(`insert into procurement_jobs(search_request_id,kind,state,dedupe_key,checkpoint)
   select search_request_id,'discover','succeeded','entry-root-proof',$2 from procurement_request_targets where id=$1`,[originalEntry.target_id,
   {guided_entry:true,review_task_id:originalEntry.id,saved_source_id:source.id,persistence:{receipt:{verified:true}}}]);
  const entryContext=(await sql.query('select procurement_source_review_context($1::uuid[]) as c',[[nextEntry.id]])).rows[0].c;
  assert.equal(entryContext.scopes[nextEntry.id].source_id,null,'Verified entry registration retains the original entity issue identity');
  assert.equal(entryContext.reviews[nextEntry.id].id,entryReview.id);assert.equal(entryContext.excluded[nextEntry.id],true,'The recorded decision and exclusion survive registration');

 await sql.query("update procurement_coverage_tasks set state='reviewed_no_results',pages_reviewed=1,evidence='{\"fixture\":\"completed entry check\"}' where id=$1",[nextEntry.id]);
 await sql.query("update procurement_action_requests set checks_excluded=false,review_decision='no_issue' where id=$1",[entryReview.id]);
 const reviewed=(await sql.query('select procurement_source_attention_page(true,0,100) as p')).rows[0].p;
 assert.ok(reviewed.items.some(i=>i.task_id===nextEntry.id),'Reviewed decisions survive successful later entry checks');
 await sql.query("update procurement_action_requests set review_decision='needs_developer' where id=$1",[entryReview.id]);
 const unresolved=(await sql.query('select procurement_source_attention_page(false,0,100) as p')).rows[0].p;
 assert.ok(unresolved.items.some(i=>i.task_id===nextEntry.id),'Explicit handoffs remain visible until resolved');
 return {entry_identity:true,decision_and_exclusion_retained:true,reviewed_history_retained:true,handoff_retained:true};
}
