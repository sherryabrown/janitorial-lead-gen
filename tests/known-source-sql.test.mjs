import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20261002000200_known_source_execution.sql', 'utf8');
const publicMigration = readFileSync('supabase/migrations/20261002000300_public_source_checks.sql', 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setup = `
create role anon; create role authenticated; create role service_role;
create table public.procurement_sources (id uuid primary key, code text not null, url text);
create table public.procurement_search_requests (id uuid primary key);
create table public.procurement_request_targets (id uuid primary key, search_request_id uuid not null,
  geography_id text, checkpoint jsonb not null default '{}');
create table public.procurement_source_capabilities (id uuid primary key, source_id uuid not null,
  route_geography_id text, kind text not null, method text not null, availability text not null,
  verified_at timestamptz, verified_until timestamptz, method_spec jsonb not null default '{}');
create table public.procurement_coverage_tasks (id uuid primary key default gen_random_uuid(),
  target_id uuid not null, task_key text not null, agency_scope text not null,
  route_geography_id text not null, kind text not null, priority integer not null, reason text not null,
  capability_id uuid, state text not null default 'unchecked', query_window jsonb not null default '{}',
  checkpoint jsonb not null default '{}', evidence jsonb not null default '{}',
  pages_reviewed integer not null default 0, results_count integer not null default 0,
  updated_at timestamptz not null default now(), unique(target_id,task_key),
  constraint procurement_coverage_tasks_kind_check check (kind in ('forecast','opportunity','award')),
  constraint procurement_coverage_tasks_state_check check (state in
    ('unchecked','source_missing','blocked','partial','reviewed_with_results','reviewed_no_results')));
create table public.procurement_jobs (id uuid primary key default gen_random_uuid(),
  search_request_id uuid, capability_id uuid, dedupe_key text not null unique,
  kind text not null, state text not null default 'pending', checkpoint jsonb not null default '{}',
  lease_until timestamptz, attempts integer not null default 0, next_attempt_at timestamptz,
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.procurement_runs (id uuid primary key default gen_random_uuid(), source_id uuid not null,
  started_at timestamptz not null, finished_at timestamptz not null default now(),
  status text not null, record_count integer not null default 0, detail jsonb not null default '{}');
insert into public.procurement_sources values ('${id(1)}','sam-awards','https://example.gov/check');
insert into public.procurement_search_requests values ('${id(2)}');
insert into public.procurement_request_targets values ('${id(3)}','${id(2)}','05001','{}');
insert into public.procurement_source_capabilities values
 ('${id(4)}','${id(1)}','05001','award','api','active',now()-interval '1 day',
  now()+interval '1 day','{"version":1,"runner_id":"sam-search"}');
`;

test('known plan is idempotent, leased once, and complete zero is distinct from partial', async () => {
  const db = new PGlite();
  try {
    await db.exec(setup); await db.exec(migration); await db.exec(publicMigration);
    await db.exec(publicMigration);
    const task={target_id:id(3),task_key:`award:${id(4)}`,agency_scope:'county',
      route_geography_id:'05001',kind:'award',priority:0,reason:'reviewed method',
      capability_id:id(4),source_id:id(1),state:'unchecked',query_window:{from:'2026-09-01',to:'2026-09-30'}};
    const plan=async()=>db.query(`select public.create_procurement_known_plan($1,$2) result`,[id(2),[task]]);
    assert.deepEqual((await plan()).rows[0].result,{tasks_created:1,jobs_created:1});
    assert.deepEqual((await plan()).rows[0].result,{tasks_created:0,jobs_created:0});
    const job=(await db.query('select id from public.procurement_jobs')).rows[0];
    const claim=async()=>db.query('select public.claim_procurement_known_job($1) job',[job.id]);
    const leased=(await claim()).rows[0].job;
    assert.equal(leased.state,'running'); assert.equal((await claim()).rows[0].job,null);
    const finish=`select public.finish_procurement_known_job($1,$2,$3,$4,$5,$6,$7,$8,$9) done`;
    assert.equal((await db.query(finish,[job.id,leased.lease_token,'succeeded','reviewed_no_results',
      {next_page:1,run_ids:[id(5)]},{run_ids:[id(5)]},1,0,null])).rows[0].done,true);
    assert.equal((await claim()).rows[0].job,null);
    const taskRow=(await db.query('select state,pages_reviewed,results_count from public.procurement_coverage_tasks')).rows[0];
    assert.deepEqual(taskRow,{state:'reviewed_no_results',pages_reviewed:1,results_count:0});
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.claim_procurement_known_job($1)',[job.id]),/permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('source observations keep changed hashes and do not duplicate unchanged records',async()=>{
  const db=new PGlite();
  try {
    await db.exec(setup); await db.exec(migration); await db.exec(publicMigration);
    const taskId=id(5),jobId=id(6),runId=id(7);
    await db.query(`insert into public.procurement_coverage_tasks
      (id,target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,capability_id,source_id)
      values ($1,$2,'award:fixture','county','05001','award',0,'fixture',$3,$4)`,[taskId,id(3),id(4),id(1)]);
    await db.query(`insert into public.procurement_jobs(id,search_request_id,capability_id,task_id,dedupe_key,kind)
      values ($1,$2,$3,$4,'fixture-job','collect')`,[jobId,id(2),id(4),taskId]);
    await db.query(`insert into public.procurement_runs
      (id,source_id,started_at,status,detail,job_id,coverage_task_id,page_index)
      values ($1,$2,now(),'success',$3,$4,$5,0)`,[runId,id(1),{state:'response_captured',upstream_status:200},jobId,taskId]);
    await assert.rejects(db.query(`insert into public.procurement_runs
      (source_id,started_at,status,job_id,coverage_task_id,page_index) values ($1,now(),'partial',$2,$3,0)`,[id(1),jobId,taskId]),/duplicate key/);
    await db.query(`insert into public.procurement_runs
      (source_id,started_at,status,job_id,coverage_task_id,page_index,page_attempt) values ($1,now(),'blocked',$2,$3,0,1)`,[id(1),jobId,taskId]);
    const record=async hash=>db.query('select public.record_procurement_observations($1,$2) observations',
      [runId,[{external_id:'contract_mod_0',record_group:'contract',payload_hash:hash}]]);
    assert.equal((await record('a'.repeat(64))).rows[0].observations[0].change_type,'new');
    assert.equal((await record('a'.repeat(64))).rows[0].observations[0].change_type,'unchanged');
    assert.equal((await record('b'.repeat(64))).rows[0].observations[0].change_type,'changed');
    assert.equal((await db.query('select count(*)::integer n from public.procurement_source_observations')).rows[0].n,2);
  } finally {await db.close();}
});

test('rate limited partial job can be leased again with a new attempt',async()=>{
  const db=new PGlite();
  try {
    await db.exec(setup); await db.exec(migration); await db.exec(publicMigration);
    await db.query(`insert into public.procurement_coverage_tasks
      (id,target_id,task_key,agency_scope,route_geography_id,kind,priority,reason,capability_id,source_id)
      values ($1,$2,'award:retry','county','05001','award',0,'fixture',$3,$4)`,[id(5),id(3),id(4),id(1)]);
    await db.query(`insert into public.procurement_jobs(id,search_request_id,capability_id,task_id,dedupe_key,kind)
      values ($1,$2,$3,$4,'retry-job','collect')`,[id(6),id(2),id(4),id(5)]);
    const claim=async()=> (await db.query('select public.claim_procurement_known_job($1) job',[id(6)])).rows[0].job;
    const first=await claim();
    assert.equal(first.attempts,1);
    await db.query(`select public.finish_procurement_known_job($1,$2,'partial','blocked',$3,$4,0,0,'SAM returned 429')`,
      [id(6),first.lease_token,{next_page:0,run_ids:[]},{reason:'SAM returned 429'}]);
    const second=await claim();
    assert.equal(second.attempts,2);
    assert.notEqual(second.lease_token,first.lease_token);
    assert.equal((await db.query('select state from public.procurement_coverage_tasks where id=$1',[id(5)])).rows[0].state,'blocked');
  } finally {await db.close();}
});

test('public document run stores private content and ends awaiting interpretation',async()=>{
  const db=new PGlite();
  try {
    await db.exec(setup); await db.exec(migration); await db.exec(publicMigration);
    await db.query(`insert into public.procurement_source_capabilities
      (id,source_id,route_geography_id,kind,method,availability,verified_at,verified_until,method_spec)
      values ($1,$2,'05001','forecast','document','active',now()-interval '1 day',
        now()+interval '1 day',$3)`,[id(8),id(1),{version:1,runner_id:'public-fetch'}]);
    const task={target_id:id(3),task_key:'forecast:public',agency_scope:'county',route_geography_id:'05001',
      kind:'forecast',priority:0,reason:'Official document',capability_id:id(8),source_id:id(1),
      state:'unchecked',query_window:{from:'2026-10-01',to:'2026-10-31'}};
    const created=(await db.query('select public.create_procurement_known_plan($1,$2) result',[id(2),[task]])).rows[0].result;
    assert.equal(created.jobs_created,1);
    const jobId=(await db.query(`select id from public.procurement_jobs where capability_id=$1`,[id(8)])).rows[0].id;
    const leased=(await db.query('select public.claim_procurement_known_job($1) job',[jobId])).rows[0].job;
    await db.query(`insert into public.procurement_runs
      (id,source_id,started_at,status,job_id,coverage_task_id,page_index,page_attempt,detail)
      values ($1,$2,now(),'review_required',$3,$4,0,1,$5)`,[id(9),id(1),jobId,leased.task_id,
      {collector:'public-fetch',state:'content_saved',content_sha256:'a'.repeat(64)}]);
    await db.query(`insert into public.procurement_public_captures
      (run_id,source_id,requested_url,final_url,content_type,content_sha256,content_base64)
      values ($1,$2,'https://example.gov/check','https://example.gov/check',
        'text/html',$3,$4)`,[id(9),id(1),'a'.repeat(64),Buffer.from('checked page').toString('base64')]);
    const finished=(await db.query(`select public.finish_procurement_known_job
      ($1,$2,'succeeded','needs_interpretation',$3,$4,1,0,null) done`,
      [jobId,leased.lease_token,{next_page:1,run_ids:[id(9)]},{run_ids:[id(9)]}])).rows[0].done;
    assert.equal(finished,true);
    assert.equal((await db.query(`select state from public.procurement_coverage_tasks where id=$1`,[leased.task_id])).rows[0].state,
      'needs_interpretation');
    await db.exec('set role authenticated');
    await assert.rejects(db.query(`select * from public.procurement_public_captures`),/permission denied/);
    await db.exec('reset role');
  } finally {await db.close();}
});

test('registered source URL creates a source-entry job without asserting category coverage',async()=>{
  const db=new PGlite();
  try {
    await db.exec(setup); await db.exec(migration); await db.exec(publicMigration);
    await db.query(`insert into public.procurement_sources values ($1,'local-board','https://example.gov/board')`,[id(10)]);
    const task={target_id:id(3),task_key:`entry:${id(10)}`,agency_scope:'county',
      route_geography_id:'05001',kind:'source_entry',priority:9,
      reason:'Registered entry point',capability_id:null,source_id:id(10),state:'unchecked',
      query_window:{},evidence:{entry_url:'https://example.gov/board',scope:'entry_only'}};
    const result=(await db.query('select public.create_procurement_known_plan($1,$2) result',[id(2),[task]])).rows[0].result;
    assert.equal(result.jobs_created,1);
    const job=(await db.query(`select capability_id,kind from public.procurement_jobs where task_id in
      (select id from public.procurement_coverage_tasks where kind='source_entry')`)).rows[0];
    assert.equal(job.capability_id,null);
    assert.equal(job.kind,'collect');
    await assert.rejects(db.query('select public.create_procurement_known_plan($1,$2)',[id(2),
      [{...task,task_key:'entry:tampered',evidence:{entry_url:'https://other.gov/'}}]]),/registered source URL/);
  } finally {await db.close();}
});

test('an early public migration can be repaired by applying known-source then rerunning public migration',async()=>{
  const db=new PGlite();
  try {
    await db.exec(setup);
    await db.exec(publicMigration);
    await db.exec(migration);
    await db.exec(publicMigration);
    const columns=(await db.query(`select column_name from information_schema.columns
      where table_schema='public' and table_name='procurement_runs' and column_name='page_attempt'`)).rows;
    assert.equal(columns.length,1);
    assert.equal((await db.query(`select count(*)::integer n from public.procurement_public_captures`)).rows[0].n,0);
  } finally {await db.close();}
});
