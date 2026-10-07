import { hash,planReviewedBatch } from './reviewed-batch.mjs';
import { reconciliationSql } from './intake-reconcile.mjs';
import { testBatchSql } from './batch-sql-test.mjs';
import { verifyBatch } from './batch-verification.mjs';
import { procurementSchemaQuery } from './schema-query.mjs';
import { rows } from './hosted-store.mjs';
export const schemaHash=s=>hash(Object.fromEntries(Object.entries(s).map(([k,v])=>
  [k,Array.isArray(v)?[...v].sort((a,b)=>hash(a).localeCompare(hash(b))):v])));
const tables=['procurement_sources','procurement_leads','procurement_intake_items','procurement_intake_leads',
  'procurement_request_leads','procurement_search_requests','procurement_versions','procurement_events',
  'procurement_geographies','procurement_source_capabilities','procurement_request_sources'];

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
  for(const table of tables) {
    if(table==='procurement_sources')snapshot[table]=sources;
    else if(table==='procurement_intake_items')snapshot[table]=sourceIntakes;
    else if(table==='procurement_leads')snapshot[table]=leads;
    else if(table==='procurement_intake_leads')snapshot[table]=allIntakeIds.length?await rows(db,table,q=>q.in('intake_id',allIntakeIds)):[];
    else if(['procurement_events','procurement_versions','procurement_request_leads'].includes(table))
      snapshot[table]=leadIds.length?await rows(db,table,q=>q.in('lead_id',leadIds)):[];
    else if(table==='procurement_search_requests')snapshot[table]=await rows(db,table,q=>q.eq('id',review.request_id));
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
export async function prepareImport({db,project,transport,artifacts,review,actor}) {
  if(!review.decisions?.length)throw new Error('Explicit reviewed decisions required');
  // Hosted geography imports must bind their own persisted candidates; SAM has its own path.
  if(review.run_ids?.length)throw new Error('Use separate statewide SAM import path');
  const before=await importSnapshot(db,project,review);
  const manifest=planReviewedBatch(before,{...review,reviewed_by:actor},[]);
  const schema=await transport.schema(),sql=reconciliationSql(manifest);
  const packageData={version:1,review:{...review,reviewed_by:actor},before,schema,manifest,sql,
    schema_sha256:schemaHash(schema),sql_sha256:hash(sql)};
  packageData.approval_sha256=hash({manifest,sql_sha256:packageData.sql_sha256,schema_sha256:packageData.schema_sha256});
  const {PGlite}=await import('@electric-sql/pglite');
  packageData.test=await testBatchSql(PGlite,before,schema,manifest,sql);
  const artifact=await artifacts.put(packageData);
  return {artifact,approval_sha256:packageData.approval_sha256,summary:manifest.summary,test:packageData.test};
}
export async function applyImport({db,project,transport,artifacts,packageData,approval}) {
  const p=packageData;
  const rebuilt=planReviewedBatch(p.before,p.review,[]),sql=reconciliationSql(rebuilt);
  if(p.test?.status!=='offline_tests_passed' || hash(rebuilt)!==hash(p.manifest) || hash(sql)!==p.sql_sha256 ||
     p.review.project_ref!==project || schemaHash(p.schema)!==p.schema_sha256 ||
     hash({manifest:rebuilt,sql_sha256:hash(sql),schema_sha256:p.schema_sha256})!==approval)
    throw new Error('Exact tested package approval required');
  if(schemaHash(await transport.schema())!==p.schema_sha256)throw new Error('Live schema drift; prepare a new reviewed package');
  const before=await importSnapshot(db,project,p.review,p.manifest);
  // Intent is durable before a transaction is sent. Caller must also checkpoint its action lease.
  const intent=await artifacts.put({status:'applying',approval,at:new Date().toISOString()});
  await transport.apply(sql);
  const after=await importSnapshot(db,project,p.review,p.manifest),receipt=verifyBatch(before,after,p.manifest);
  const artifact=await artifacts.put({...receipt,approval,intent,at:new Date().toISOString()});
  if(!receipt.verified)throw new Error('Import readback did not verify; reconcile before retry');
  return {artifact,...receipt};
}
