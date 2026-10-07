import { hash,planReviewedBatch } from './reviewed-batch.mjs';
import { reconciliationSql } from './intake-reconcile.mjs';
import {rehearsalBlueprint,rehearsalPolicy} from './native-sql-rehearsal.mjs';
import { verifyBatch } from './batch-verification.mjs';
import { procurementSchemaQuery } from './schema-query.mjs';
import { rows } from './hosted-store.mjs';
export const schemaHash=s=>hash(Object.fromEntries(Object.entries(s).map(([k,v])=>
  [k,Array.isArray(v)?[...v].sort((a,b)=>hash(a).localeCompare(hash(b))):v])));
const tables=['procurement_sources','procurement_leads','procurement_intake_items','procurement_intake_leads',
  'procurement_request_leads','procurement_search_requests','procurement_versions','procurement_events',
  'procurement_geographies','procurement_source_capabilities','procurement_request_sources'];

export async function assertCurrentReview(db,review) {
  const interpretations=await rows(db,'procurement_interpretations',q=>q.eq('request_id',review.request_id).eq('is_current',true));
  const eligible=new Set(interpretations.flatMap(i=>i.staging_receipt?.intake_ids??[]));
  if(review.run_ids?.length) {
    const jobs=await rows(db,'procurement_jobs',q=>q.eq('search_request_id',review.request_id));
    const job=jobs.find(j=>j.dedupe_key?.startsWith('api-sam:')&&j.checkpoint?.stage==='sam_review');
    if(!job||hash([...review.run_ids].sort())!==hash([...(job.checkpoint.run_ids??[])].sort()))throw new Error('Current SAM review run set required');
    for(const id of job.checkpoint.intake_ids??[])eligible.add(id);
  }
  if(!review.decisions?.length||review.decisions.some(d=>!eligible.has(d.intake_id)))throw new Error('Current request candidate review required');
}

export async function importSnapshot(db,project,review,manifest) {
  const snapshot={project_ref:project,captured_at:new Date().toISOString()};
  const intakeIds=review.decisions.flatMap(d=>[d.intake_id,d.supersedes_pending_intake_id].filter(Boolean));
  const intakes=await rows(db,'procurement_intake_items',q=>q.in('id',intakeIds));
  const sourceIds=[...new Set(intakes.map(i=>i.source_id))];
  // Include all leads from candidate sources for canonical identity/overlap guards,
  // plus any explicit cross-source target. Scope only after relevant identities are known.
  const targets=review.decisions.filter(d=>d.target).map(d=>d.target);
  const sources=await rows(db,'procurement_sources');
  const scopedSources=[...new Set([...sourceIds,...targets.map(t=>sources.find(s=>s.code===t.source_code)?.id).filter(Boolean)])];
  const sourceIntakes=scopedSources.length?await rows(db,'procurement_intake_items',q=>q.in('source_id',scopedSources)):[];
  const leads=scopedSources.length?await rows(db,'procurement_leads',q=>q.in('source_id',scopedSources)):[];
  const leadIds=[...new Set([...leads.map(l=>l.id),...(manifest?.records??[]).map(r=>r.id)])];
  const allIntakeIds=sourceIntakes.map(i=>i.id);
  const requestLinks=leadIds.length?await rows(db,'procurement_request_leads',q=>q.in('lead_id',leadIds)):[];
  // Existing relevant leads can be linked to earlier requests. Their actual FK
  // targets belong in the bounded validation baseline, not just this request.
  const requestIds=[...new Set([review.request_id,...requestLinks.map(r=>r.search_request_id)])];
  for(const table of tables) {
    if(table==='procurement_sources')snapshot[table]=sources;
    else if(table==='procurement_intake_items')snapshot[table]=sourceIntakes;
    else if(table==='procurement_leads')snapshot[table]=leads;
    else if(table==='procurement_intake_leads')snapshot[table]=allIntakeIds.length?await rows(db,table,q=>q.in('intake_id',allIntakeIds)):[];
    else if(table==='procurement_request_leads')snapshot[table]=requestLinks;
    else if(['procurement_events','procurement_versions'].includes(table))
      snapshot[table]=leadIds.length?await rows(db,table,q=>q.in('lead_id',leadIds)):[];
    else if(table==='procurement_search_requests')snapshot[table]=await rows(db,table,q=>q.in('id',requestIds));
    else if(table==='procurement_request_sources')snapshot[table]=await rows(db,table,q=>q.eq('search_request_id',review.request_id));
    else snapshot[table]=await rows(db,table);
  }
  return snapshot;
}
export function postgresTransport(pool,project) {
  return {
    async schema() { return (await pool.query(procurementSchemaQuery)).rows[0].schema; },
    async apply(sql) {
      const client=await pool.connect();
      try { await client.query(sql); }
      finally {client.release(true);}
    }, project,
  };
}
export async function prepareImport({db,project,transport,artifacts,review,actor,runs=[],rehearse}) {
  if(!rehearse)throw new Error('Private native SQL rehearsal transport required');
  if(!review.decisions?.length)throw new Error('Explicit reviewed decisions required');
  // Hosted geography imports must bind their own persisted candidates; SAM has its own path.
  if(review.run_ids?.length&&!runs.length)throw new Error('Use separate statewide SAM import path');
  await assertCurrentReview(db,review);
  const before=await importSnapshot(db,project,review);
  const manifest=planReviewedBatch(before,{...review,reviewed_by:actor},runs);
  const schema=await transport.schema(),sql=reconciliationSql(manifest);
  const packageData={version:2,policy:rehearsalPolicy,review:{...review,reviewed_by:actor},runs,before,schema,manifest,sql,
    schema_sha256:schemaHash(schema),sql_sha256:hash(sql)};
  packageData.test=await rehearse({before,schema,manifest,sql});
  if(packageData.test?.status!=='native_tests_passed'||packageData.test.policy!==rehearsalPolicy||
    !['rollback','readback','replay','cleanup'].every(k=>packageData.test[k]===true)||
    packageData.test.rehearsal_sql_sha256!==hash(rehearsalBlueprint(before,schema,manifest).sql))
    throw new Error('Successful native rehearsal receipt required');
  packageData.approval_sha256=packageApproval(packageData);
  const artifact=await artifacts.put(packageData);
  return {artifact,approval_sha256:packageData.approval_sha256,summary:manifest.summary,test:packageData.test};
}
export function packageApproval(p) {
  return hash({version:p.version,policy:p.policy,review:p.review,runs:p.runs,before:p.before,schema:p.schema,
    manifest:p.manifest,sql:p.sql,test:p.test,schema_sha256:p.schema_sha256,sql_sha256:p.sql_sha256});
}
export async function applyImport({db,project,transport,artifacts,packageData,approval}) {
  const p=packageData;
  const rebuilt=planReviewedBatch(p.before,p.review,p.runs??[]),sql=reconciliationSql(rebuilt);
  if(p.version!==2||p.policy!==rehearsalPolicy||p.test?.status!=='native_tests_passed'||p.test.policy!==rehearsalPolicy||
     !['rollback','readback','replay','cleanup'].every(k=>p.test[k]===true)||
     p.test.rehearsal_sql_sha256!==hash(rehearsalBlueprint(p.before,p.schema,rebuilt).sql)||
     hash(rebuilt)!==hash(p.manifest) || p.sql!==sql || hash(sql)!==p.sql_sha256 ||
     p.review.project_ref!==project || schemaHash(p.schema)!==p.schema_sha256 ||
     packageApproval(p)!==approval||p.approval_sha256!==approval)
    throw new Error('Exact tested package approval required');
  if(schemaHash(await transport.schema())!==p.schema_sha256)throw new Error('Live schema drift; prepare a new reviewed package');
  await assertCurrentReview(db,p.review);
  const before=await importSnapshot(db,project,p.review,p.manifest);
  // Intent is durable before a transaction is sent. Caller must also checkpoint its action lease.
  const intent=await artifacts.put({status:'applying',approval,at:new Date().toISOString()});
  await transport.apply(sql);
  const after=await importSnapshot(db,project,p.review,p.manifest),receipt=verifyBatch(before,after,p.manifest);
  const artifact=await artifacts.put({...receipt,approval,intent,at:new Date().toISOString()});
  if(!receipt.verified)throw new Error('Import readback did not verify; reconcile before retry');
  return {artifact,...receipt};
}
