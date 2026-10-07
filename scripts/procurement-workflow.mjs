import { readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath,pathToFileURL } from 'node:url';
import {createHash} from 'node:crypto';
import { planReviewedBatch,hash,validateReview,collectRuns } from './lib/reviewed-batch.mjs';
import { samIntakeRows } from './lib/sam-intake.mjs';
import {resolveSamAwardLinks} from './lib/api-record-links.mjs';
import { reconciliationSql } from './lib/intake-reconcile.mjs';
import { verifyBatch } from './lib/batch-verification.mjs';
import { project } from './lib/supabase-admin.mjs';
import { testBatchSql } from './lib/batch-sql-test.mjs';
import { runSupabase } from './lib/supabase-cli.mjs';
import {planRegistry,planManual,persistenceSql,verifyPersistence} from './lib/research-persistence.mjs';
import { routedCapture } from './lib/known-source-execution.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function evidenceBytes(spec,dir,copy=false){
 for(const f of spec.findings)for(const e of f.evidence??[]){
  if(!e.local_path)throw new Error('Manual capture requires the actual saved evidence file');
  const bytes=readFileSync(copy?e.local_path:join(dir,'evidence',e.content_sha256));
  if(createHash('sha256').update(bytes).digest('hex')!==e.content_sha256)throw new Error('Saved evidence file hash mismatch');
  const destination=join(dir,'evidence',e.content_sha256);
  if(copy&&!existsSync(destination))writeFileSync(destination,bytes,{flag:'wx'});
 }
}
const help=`Procurement workflow — search is not import; no implicit live writes.
  register SPEC.json SNAPSHOT.json SCHEMA.json NEW_PACKAGE_DIR
                                       Prepare reviewed source/request persistence (offline)
  stage-manual SPEC.json SNAPSHOT.json SCHEMA.json NEW_PACKAGE_DIR
                                       Prepare document/candidate intake persistence (offline)
  init NEW_REVIEW.json                  Write an unapproved review template (offline)
  inventory SNAPSHOT.json               List intake IDs/hashes for review (offline)
  stage CAPTURE_SCOPE.json CAPTURE_DIR NEW_RECEIPT.json --confirm-stage
                                       LIVE intake-only capture; existing intake never overwritten
                                       Set routed:true in scope to stage only new/changed known-route observations
  snapshot NEW_SNAPSHOT.json            Read-only live data snapshot (project is pinned)
  schema NEW_SCHEMA.json                Read-only live schema/trigger snapshot
  prepare REVIEW.json SNAPSHOT.json CAPTURE_DIR SCHEMA.json NEW_PACKAGE_DIR
                                       Validate explicit runs/decisions and emit review-bound SQL (offline)
  test PACKAGE_DIR [PGLITE_MODULE_PATH] Test constraints/triggers, rollback and replay with local PGlite
  status PACKAGE_DIR                    Show planned counts and any apply/verification receipts (offline)
  verify PACKAGE_DIR AFTER_SNAPSHOT.json NEW_REPORT.json
                                       Verify saved readback against bound baseline (offline)
  apply PACKAGE_DIR --approve SHA256    Execute approved SQL on configured project, then read back
                                       LIVE WRITE; explicit per-batch authorization is required

Snapshot: node scripts/intake-snapshot.mjs NEW_SNAPSHOT.json (read-only network)
Search: node scripts/sam-search.mjs opportunities|awards FILTERS_JSON (one API request)
Staging never creates canonical leads; prepare refuses missing intake records and never auto-approves results.
No UI changes, migrations, signups, or schedules. See docs/PROCUREMENT-WORKFLOW.md.`;
function snapshot(destination) {
  execFileSync(process.execPath,[join(root,'scripts/intake-snapshot.mjs'),destination],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  return load(destination);
}
function queryFile(path) {
  return runSupabase(['db', 'query', '--linked', '--project-ref', project, '--file', path], { cwd: root });
}
function readPackage(dir) {
  const metadata=load(join(dir,'bundle.json'));
  if(metadata.kind==='persistence') {
    const before=load(join(dir,'before.json')),spec=load(join(dir,'spec.json')),schema=load(join(dir,'schema.json'));
    if(metadata.manifest.kind==='manual')evidenceBytes(spec,dir);
    const m=metadata.manifest.kind==='registry'?planRegistry(spec,before):planManual(spec,before),sql=persistenceSql(m);
    if(spec.project_ref!==project||hash(m)!==hash(metadata.manifest)||hash(sql)!==metadata.sql_sha256||hash(readFileSync(join(dir,'apply.sql'),'utf8'))!==metadata.sql_sha256||schemaHash(schema)!==metadata.schema_sha256||hash({manifest:m,sql_sha256:metadata.sql_sha256,schema_sha256:metadata.schema_sha256})!==metadata.approval_sha256)throw new Error('Persistence package changed; regenerate and retest');
    return {bundle:metadata,before,schema};
  }
  const bundle=load(join(dir,'bundle.json')),before=load(join(dir,'before.json')),review=load(join(dir,'review.json')),schema=load(join(dir,'schema.json'));
  const runs=review.run_ids.map(id=>load(join(dir,'captures',`${id}.json`)));
  const rebuilt=planReviewedBatch(before,review,runs),sql=reconciliationSql(rebuilt);
  if(hash(rebuilt)!==hash(bundle.manifest)||hash(sql)!==bundle.sql_sha256||hash(readFileSync(join(dir,'apply.sql'),'utf8'))!==bundle.sql_sha256||
    schemaHash(schema)!==bundle.schema_sha256||hash({manifest:bundle.manifest,sql_sha256:bundle.sql_sha256,schema_sha256:bundle.schema_sha256})!==bundle.approval_sha256) throw new Error('Package changed or generator version differs. Prepare and review a new package; do not reuse approval.');
  if(review.project_ref!==project) throw new Error('Package project differs from configured project');
  return {bundle,before,review,schema};
}
const schemaHash=s=>hash(Object.fromEntries(Object.entries(s).map(([k,v])=>[k,Array.isArray(v)?[...v].sort((a,b)=>hash(a).localeCompare(hash(b))):v])));
function inspectSchema(destination) {
  // Inspector deliberately accepts simple relative paths only. Package paths are resolved for other file operations.
  const relative=destination.replaceAll('\\','/');
  execFileSync(process.execPath,[join(root,'scripts/inspect-intake-schema.mjs'),relative],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});return load(relative);
}
async function main() {
  const [command,...args]=process.argv.slice(2);
  if(!command||['--help','help','-h'].includes(command)){console.log(help);return;}
  if(['register','stage-manual'].includes(command)) {
    if(args.length!==4)throw new Error(help);
    const [input,baseline,schemaFile,dir]=args,spec=load(input),before=load(baseline),schema=load(schemaFile);
    if(spec.project_ref!==project||existsSync(dir))throw new Error('Wrong project or existing package directory');
    const manifest=command==='register'?planRegistry(spec,before):planManual(spec,before),sql=persistenceSql(manifest);
    const sql_sha256=hash(sql),schema_sha256=schemaHash(schema),approval_sha256=hash({manifest,sql_sha256,schema_sha256});
    mkdirSync(dir,{recursive:true});save(join(dir,'spec.json'),spec);save(join(dir,'before.json'),before);save(join(dir,'schema.json'),schema);
    if(command==='stage-manual'){mkdirSync(join(dir,'evidence'));evidenceBytes(spec,dir,true);}
    save(join(dir,'bundle.json'),{kind:'persistence',manifest,sql_sha256,schema_sha256,approval_sha256});writeFileSync(join(dir,'apply.sql'),sql,{flag:'wx'});
    console.log(JSON.stringify({status:'prepared_not_applied',kind:manifest.kind,rows:manifest.rows.length,mappings:manifest.mappings,approval_sha256},null,2));return;
  }
  if(command==='init') {
    if(args.length!==1) throw new Error(help);
    save(args[0],{version:1,batch:'REPLACE_WITH_UNIQUE_BATCH',project_ref:project,request_id:'REPLACE_WITH_EXISTING_REQUEST_UUID',work_state:'AR',
      scope:'Describe services, work area, sources, and date windows',limitations:'Describe missing sources/windows, manual forecasts, and uncertainty',
      reviewed_by:'',run_ids:[],allow_partial:false,decisions:[]});console.log('Created unapproved template. Nothing searched or imported.');return;
  }
  if(command==='inventory') {
    if(args.length!==1) throw new Error(help);const s=load(args[0]);
    console.log(JSON.stringify({project_ref:s.project_ref,intake:s.procurement_intake_items.map(i=>({intake_id:i.id,source_id:i.source_id,external_id:i.external_id,
      title:i.payload.title||i.payload.url,status:i.status,intake_hash:hash(i.payload)}))},null,2));return;
  }
  if(command==='snapshot'||command==='schema') {
    if(args.length!==1) throw new Error(help);
    const result=command==='snapshot'?snapshot(args[0]):inspectSchema(args[0]);
    console.log(JSON.stringify({status:'read_only_snapshot_saved',file:args[0],project_ref:project,hash:hash(result)},null,2));return;
  }
  if(command==='stage') {
    if(args.length!==4||args[3]!=='--confirm-stage') throw new Error('stage requires CAPTURE_SCOPE.json CAPTURE_DIR NEW_RECEIPT.json --confirm-stage');
    const [scopeFile,captureDir,receipt]=args,scope=load(scopeFile);
    if(scope.project_ref!==project||!Array.isArray(scope.run_ids)||!scope.run_ids.length||new Set(scope.run_ids).size!==scope.run_ids.length||
      scope.run_ids.some(id=>!/^[a-f0-9-]{36}$/.test(id))) throw new Error('Explicit configured project and unique run IDs required');
    if(existsSync(receipt)) throw new Error('Receipt already exists');
    const runs=scope.run_ids.map(id=>load(join(captureDir,`${id}.json`))),collection=collectRuns(runs,scope.run_ids,{allow_partial:scope.allow_partial===true});
    const {adminClient}=await import('./lib/supabase-admin.mjs');const db=adminClient();
    const {data:sources,error}=await db.from('procurement_sources').select('id,code');if(error) throw new Error('Cannot read source registry');
    const source=code=>{const row=sources.find(s=>s.code===code);if(!row) throw new Error(`Missing source ${code}`);return row.id;};
    let observationGroups=null,priorEvidence=null;
    if(scope.routed===true){
      const {data:observations,error:observationError}=await db.from('procurement_source_observations')
        .select('source_id,record_group,payload_hash,change_type,first_run_id').in('first_run_id',scope.run_ids);
      if(observationError)throw new Error('Cannot verify routed observations; no intake write sent');
      observationGroups=new Map();
      for(const o of observations){
        const key=`${o.source_id}/${o.record_group}`,group=observationGroups.get(key)??[];
        group.push(o);observationGroups.set(key,group);
      }
      priorEvidence=new Map();
      for(const table of ['procurement_intake_items','procurement_leads']){
        for(let offset=0;;offset+=1000){
          const {data,error:priorError}=await db.from(table).select('source_id,external_id,payload')
            .in('source_id',[source('sam'),source('sam-awards')]).range(offset,offset+999);
          if(priorError)throw new Error('Cannot compare previous SAM evidence; no intake write sent');
          for(const prior of data){
            const identity=prior.payload.routed_capture?.record_identity??prior.external_id;
            const row=prior.source_id===source('sam')?prior.payload.sam_notice_evidence?.record:
              prior.payload.sam_api_evidence?.latest_action;
            if(row){const key=`${prior.source_id}/${identity}`,saved=priorEvidence.get(key)??new Set();
              saved.add(hash(row));priorEvidence.set(key,saved);}
          }
          if(data.length<1000)break;
        }
      }
    }
    const routeRecord=(sourceId,identity,row)=>{
      if(!observationGroups)return {external_id:identity,metadata:{}};
      const group=observationGroups.get(`${sourceId}/${identity}`);
      return routedCapture(identity,group,row,priorEvidence.get(`${sourceId}/${identity}`));
    };
    const linkFile=`${receipt}.links.json`;
    const awardLinks=existsSync(linkFile)?load(linkFile):await resolveSamAwardLinks(collection);
    if(!existsSync(linkFile))save(linkFile,awardLinks);
    const items=samIntakeRows(collection,source,routeRecord,awardLinks);
    if(!items.length) {save(receipt,{status:'staged',inserted:0,existing_preserved:0,partial:collection.partial});console.log('No captured records; no intake write needed.');return;}
    // One request is transactional. ignoreDuplicates preserves processed/ignored/pending originals alike.
    const result=await db.from('procurement_intake_items').upsert(items,{onConflict:'source_id,external_id',ignoreDuplicates:true,count:'exact'}).select('id');
    if(result.error) throw new Error('Staging failed or outcome uncertain; inspect intake before retrying. No canonical leads were written.');
    if(!Number.isInteger(result.count)) throw new Error('Staging returned without a verified affected-row count; inspect intake before claiming totals.');
    const report={status:'staged_not_imported',run_ids:scope.run_ids,inserted:result.count,existing_preserved:items.length-result.count,partial:collection.partial,canonical_writes:0};
    save(receipt,report);console.log(JSON.stringify(report,null,2));return;
  }
  if(command==='prepare') {
    if(args.length!==5) throw new Error(help);
    const [reviewFile,beforeFile,captureDir,schemaFile,output]=args,review=load(reviewFile),before=load(beforeFile),schema=load(schemaFile);
    validateReview(review);if(review.project_ref!==project) throw new Error('Wrong configured project');
    if(existsSync(output)) throw new Error('Package directory exists; choose a new one');
    const runs=review.run_ids.map(id=>load(join(captureDir,`${id}.json`))),m=planReviewedBatch(before,review,runs);
    const sql=reconciliationSql(m),sql_sha256=hash(sql),schema_sha256=schemaHash(schema),approval_sha256=hash({manifest:m,sql_sha256,schema_sha256});
    mkdirSync(join(output,'captures'),{recursive:true});save(join(output,'before.json'),before);save(join(output,'review.json'),review);
    for(const r of runs) save(join(output,'captures',`${r.run_id}.json`),r);
    save(join(output,'schema.json'),schema);save(join(output,'bundle.json'),{version:1,manifest:m,sql_sha256,schema_sha256,approval_sha256});writeFileSync(join(output,'apply.sql'),sql,{flag:'wx'});
    console.log(JSON.stringify({status:'prepared_not_applied',counts:m.summary,coverage:m.coverage,approval_sha256,next:'Review package and test against current schema before authorizing apply.'},null,2));return;
  }
  if(command==='test') {
    if(args.length<1||args.length>2) throw new Error(help);const dir=resolve(args[0]),{bundle,before,schema}=readPackage(dir);
    if(existsSync(join(dir,'offline-test.json'))) throw new Error('Test receipt exists; preserve immutable package or prepare a new one');
    const {PGlite}=await import(args[1] ? pathToFileURL(resolve(args[1])).href : '@electric-sql/pglite');
    const result=await testBatchSql(PGlite,before,schema,bundle.manifest,readFileSync(join(dir,'apply.sql'),'utf8'),{verify:bundle.kind==='persistence'?verifyPersistence:verifyBatch});
    save(join(dir,'offline-test.json'),{...result,approval_sha256:bundle.approval_sha256});console.log(JSON.stringify(result,null,2));return;
  }
  if(command==='status') {
    if(args.length!==1) throw new Error(help);const dir=resolve(args[0]),{bundle}=readPackage(dir);
    const receipts=readdirSync(dir).filter(f=>/^receipt-.*\.json$/.test(f)).sort().map(f=>load(join(dir,f)));
    const verified=receipts.some(r=>r.status==='verified'&&r.approval_sha256===bundle.approval_sha256);
    console.log(JSON.stringify({status:verified?'verified':receipts.at(-1)?.status||'prepared_not_applied',counts:bundle.manifest.summary??{inserts:bundle.manifest.rows.filter(r=>!r.before).length,updates:bundle.manifest.rows.filter(r=>r.before).length},
      counts_are:'planned; actual results are in verification receipts',approval_sha256:bundle.approval_sha256,receipts},null,2));return;
  }
  if(command==='verify') {
    if(args.length!==3) throw new Error(help);const {bundle,before}=readPackage(resolve(args[0]));
    const result={...(bundle.kind==='persistence'?verifyPersistence:verifyBatch)(before,load(args[1]),bundle.manifest),approval_sha256:bundle.approval_sha256};save(args[2],result);console.log(JSON.stringify(result,null,2));
    if(!result.verified) process.exitCode=1;return;
  }
  if(command==='apply') {
    if(args.length!==3||args[1]!=='--approve') throw new Error('Apply requires PACKAGE_DIR --approve the exact reviewed SHA256');
    const dir=resolve(args[0]),{bundle}=readPackage(dir);
    if(args[2]!==bundle.approval_sha256) throw new Error('Approval hash mismatch; no database request sent');
    const test=load(join(dir,'offline-test.json'));
    if(test.status!=='offline_tests_passed'||test.approval_sha256!==bundle.approval_sha256) throw new Error('Matching offline test receipt required');
    const existing=readdirSync(dir).filter(f=>/^receipt-.*\.json$/.test(f)).map(f=>load(join(dir,f)));
    if(existing.some(r=>r.status==='verified'&&r.approval_sha256===bundle.approval_sha256)) {console.log('Already verified. No apply request sent.');return;}
    if(existing.some(r=>['applying','commit_unknown','verification_failed'].includes(r.status))) throw new Error('Unresolved prior attempt: inspect live readback first. Do not blindly retry this package.');
    const attempt=new Date().toISOString().replaceAll(/[:.]/g,'-'),beforePath=join(dir,`preapply-${attempt}.json`),afterPath=join(dir,`postapply-${attempt}.json`);
    // Use a simple workspace-relative inspector path; never fall back to applying against unverified schema.
    const schemaPath=`outputs/procurement-batches/schema-check-${attempt}.json`;
    mkdirSync(dirname(schemaPath),{recursive:true});
    if(schemaHash(inspectSchema(schemaPath))!==bundle.schema_sha256) throw new Error('Live schema/trigger drift: refresh, regenerate, test and review. No import sent.');
    const before=snapshot(beforePath),intent={status:'applying',attempt,approval_sha256:bundle.approval_sha256};
    save(join(dir,`receipt-${attempt}-intent.json`),intent);
    let output;
    try {output=queryFile(join(dir,'apply.sql'));} catch {
      save(join(dir,`receipt-${attempt}-result.json`),{...intent,status:'commit_unknown',message:'CLI failed/timed out. Read back live state before any retry; no automatic rollback or resubmission.'});
      throw new Error('Application outcome unknown. Inspect receipt and live records; do not retry blindly.');
    }
    try {
      JSON.parse(output);const after=snapshot(afterPath),result=(bundle.kind==='persistence'?verifyPersistence:verifyBatch)(before,after,bundle.manifest);
      save(join(dir,`receipt-${attempt}-result.json`),{...result,attempt,approval_sha256:bundle.approval_sha256});
      console.log(JSON.stringify(result,null,2));if(!result.verified) process.exitCode=1;
    } catch {
      save(join(dir,`receipt-${attempt}-readback.json`),{...intent,status:'commit_unknown',message:'Apply returned, but readback did not verify. Inspect live state; do not reapply.'});
      throw new Error('Apply returned but readback failed; no verified-success claim made.');
    }
    return;
  }
  throw new Error(help);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
