import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {adminDatabase} from './helpers/admin-trigger-db.mjs';
import {schedulingCutoverHold} from '../scripts/scheduling-cutover-hold.mjs';
import {schedulingCutoverPlan,runtimeCommit} from '../scripts/prepare-scheduling-cutover.mjs';

test('cutover package rolls back all phases on an unexpected dependency and preserves membership losslessly on retry',async()=>{
 const db=await adminDatabase();
 const repoRoot=process.cwd();let fixture;
 try{
  // Exercise the historical release against its pinned runtime, not the
  // developer's changing app or the operator's real preparation outputs.
  fixture=await mkdtemp(join(tmpdir(),'janitorial-cutover-test-'));
  execFileSync('git',['clone','--local','--shared','--no-checkout',repoRoot.replaceAll('\\','/'),fixture],{stdio:'ignore',windowsHide:true});
  execFileSync('git',['-C',fixture,'checkout','--detach',runtimeCommit],{stdio:'ignore',windowsHide:true});
  for(const name of ['prepare-scheduling-cutover.mjs','prepare-scheduling-cutover-api.mjs','scheduling-cutover-hold.mjs','scheduling-cutover-preflight.sql'])
   await copyFile(join(repoRoot,'scripts',name),join(fixture,'scripts',name));
  process.chdir(fixture);
  const app=await readFile('src/App.tsx');
  await writeFile('src/App.tsx',Buffer.concat([app,Buffer.from('\n// Test-only runtime drift\n')]));
  await assert.rejects(schedulingCutoverPlan(),/Application differs from tested runtime/);
  await writeFile('src/App.tsx',app);
  await db.exec(await readFile('supabase/migrations/20260930000100_authenticated_procurement_reads.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261005000700_public_source_access_handoffs.sql','utf8'));
  await db.exec(`create type public.app_role as enum ('user','admin');
   create table public.profiles(user_id uuid unique references auth.users(id),role app_role not null default 'user',updated_at timestamptz default now(),first_name text,last_name text);
   insert into auth.users values('00000000-0000-4000-8000-000000000001');
   insert into public.profiles(user_id,role) values('00000000-0000-4000-8000-000000000001','admin');
   insert into procurement_members(user_id) values('00000000-0000-4000-8000-000000000001');
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);
   insert into supabase_migrations.schema_migrations values('19990101000000');
   create view public.procurement_cutover_test_dependency as select id from public.procurement_members;`);
  await db.exec(await readFile('scripts/scheduling-cutover-preflight.sql','utf8'));
  const before=(await db.query('select to_jsonb(m) as record from procurement_members m')).rows;
  const plan=await schedulingCutoverPlan();assert.equal(plan.manifest.migration_history_writes,false);
  execFileSync(process.execPath,['scripts/prepare-scheduling-cutover-api.mjs'],{stdio:'ignore',windowsHide:true});
  const api=JSON.parse(await readFile('outputs/deployment/scheduling-cutover/api/atomic-cutover.json','utf8'));
  assert.equal(api.query,plan.sql,'API transport must preserve the reviewed atomic bytes');assert.equal(api.read_only,false);
  const operator=JSON.parse(await readFile('outputs/deployment/scheduling-cutover/api/operator-preflight.json','utf8'));
  assert.match(operator.query,/^begin read only;/);assert.doesNotMatch(operator.query.replace(/'(?:''|[^'])*'/g,"''"),/\b(insert|update|delete|create table|alter table)\b/i);
  await db.exec(operator.query);
  const history=JSON.parse(await readFile('outputs/deployment/scheduling-cutover/api/approved-history.json','utf8')).query;
  await assert.rejects(db.exec(history),/Verify the committed/);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1,'History cannot mark unapplied release versions');
  await assert.rejects(db.exec(plan.sql),/depend/i);await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.procurement_source_labels') is null as old")).rows[0].old,true,'Earlier role/policy/view changes must roll back with failed retirement');
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='public.profiles'::regclass and tgname='procurement_protect_profile_role'")).rows[0].n,0);
  assert.deepEqual((await db.query('select to_jsonb(m) as record from procurement_members m')).rows,before);
  assert.equal((await db.query("select count(*)::int n from procurement_events where event_type='legacy_procurement_membership_archived'")).rows[0].n,0);
  await db.exec('drop view public.procurement_cutover_test_dependency');
  await db.exec(plan.sql);
  assert.deepEqual((await db.query("select detail->'record' as record from procurement_events where event_type='legacy_procurement_membership_archived'")).rows,before);
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\'")).rows[0].n,41);
  assert.equal((await db.query("select to_regclass('public.procurement_members') is null as retired")).rows[0].retired,true);
  await db.exec(history);await db.exec(history);
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,9,'Only eight release versions added, idempotently');
  assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='19990101000000'")).rows[0].n,1,'Unrelated history preserved');
  await assert.rejects(db.exec(plan.sql),/manifest|partially/i);await db.exec('rollback');
 }finally{
  process.chdir(repoRoot);await db.close();
  if(fixture){
   const target=resolve(fixture),root=resolve(tmpdir())+sep;
   assert.ok(target.startsWith(root)&&basename(target).startsWith('janitorial-cutover-test-'),'Unsafe cutover fixture cleanup path');
   await rm(target,{recursive:true,force:true});
  }
 }
});

test('explicit hold server exposes only a health marker and rejects business/private wakes without reflecting secrets',()=>{
 const server=schedulingCutoverHold();
 const send=(method,url)=>{
  const result={};server.emit('request',{method,url,headers:{authorization:'Bearer private-value'}},{writeHead(status,headers){result.status=status;result.headers=headers;},end(body){result.body=JSON.parse(body);}});return result;
 };
 const health=send('GET','/health');assert.equal(health.status,200);assert.equal(health.body.mode,'scheduling_cutover_hold');
 for(const path of ['/v1/schedules','/internal/procurement-scheduler/tick','/health?token=private-value']){
  const response=send('POST',path);assert.equal(response.status,503);assert.equal(response.headers['Retry-After'],'60');
  assert.equal(response.headers['Access-Control-Allow-Origin'],undefined);assert.ok(!JSON.stringify(response.body).includes('private-value'));
 }
});
