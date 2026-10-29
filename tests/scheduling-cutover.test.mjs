import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adminDatabase} from './helpers/admin-trigger-db.mjs';
import {schedulingCutoverHold} from '../scripts/scheduling-cutover-hold.mjs';
import {schedulingCutoverPlan} from '../scripts/prepare-scheduling-cutover.mjs';

test('cutover package rolls back all phases on an unexpected dependency and preserves membership losslessly on retry',async()=>{
 const db=await adminDatabase();
 try{
  await db.exec(await readFile('supabase/migrations/20260930000100_authenticated_procurement_reads.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261005000700_public_source_access_handoffs.sql','utf8'));
  await db.exec(`create type public.app_role as enum ('user','admin');
   create table public.profiles(user_id uuid unique references auth.users(id),role app_role not null default 'user',updated_at timestamptz default now(),first_name text,last_name text);
   insert into auth.users values('00000000-0000-4000-8000-000000000001');
   insert into public.profiles(user_id,role) values('00000000-0000-4000-8000-000000000001','admin');
   insert into procurement_members(user_id) values('00000000-0000-4000-8000-000000000001');
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);
   create view public.procurement_cutover_test_dependency as select id from public.procurement_members;`);
  await db.exec(await readFile('scripts/scheduling-cutover-preflight.sql','utf8'));
  const before=(await db.query('select to_jsonb(m) as record from procurement_members m')).rows;
  const plan=await schedulingCutoverPlan();assert.equal(plan.manifest.migration_history_writes,false);
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
  await assert.rejects(db.exec(plan.sql),/manifest|partially/i);await db.exec('rollback');
 }finally{await db.close();}
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
