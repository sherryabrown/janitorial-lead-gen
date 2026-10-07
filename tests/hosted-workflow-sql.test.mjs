import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { id } from './helpers/known-workflow.mjs';
const migration=readFileSync('supabase/migrations/20261007000100_hosted_procurement_workflow.sql','utf8');
async function fixture() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
    create table procurement_sources(id uuid primary key);
    create table procurement_search_requests(id uuid primary key default gen_random_uuid(),name text,
      request_origin text,search_boundary_mode text,requested_search_areas jsonb,contracting_entity_geo_levels text[],
      service_scope jsonb,search_windows jsonb,scope_resolution_state text,
      created_at timestamptz default now(),constraint procurement_search_requests_request_origin_check check(request_origin='chat'));
    create table procurement_jobs(id uuid primary key default gen_random_uuid(),search_request_id uuid references procurement_search_requests(id),
      dedupe_key text unique,kind text,state text default 'pending',checkpoint jsonb default '{}',lease_token uuid,lease_until timestamptz,
      attempts integer default 0,created_at timestamptz default now(),updated_at timestamptz default now());
    create function create_procurement_geography_request(text,text,text[],timestamptz,jsonb,jsonb,text) returns uuid language plpgsql as $$
      declare v uuid;begin insert into public.procurement_search_requests(name,request_origin)values($1,'chat') returning id into v;return v;end $$;
    insert into auth.users values('${id(1)}'),('${id(2)}');`);
  await db.exec(migration);return db;
}
const input={p_name:'Bounded test',p_geography_id:'ARMexample',p_selected_city_ids:[],p_cities_confirmed_at:null,
  p_service_scope:{service:'janitorial'},p_search_windows:{opportunity:{from:'2026-10-06',to:'2027-10-05',date_basis:'deadline'}},p_county_id:'05119'};
const submit=(db,key='request-key-1',hash='a'.repeat(64))=>db.query('select submit_procurement_api_request($1,$2,$3,$4,$5) as id',
  [id(1),key,hash,input,['opportunity']]);
test('request submission is atomic/idempotent, conflicting input rejected, and actor/category/job survive a restart',async()=>{
  const db=await fixture();try {
    const first=(await submit(db)).rows[0].id;
    assert.equal((await submit(db)).rows[0].id,first);
    await assert.rejects(submit(db,'request-key-1','b'.repeat(64)),/different input/);
    assert.equal((await db.query('select count(*)::integer n from procurement_jobs')).rows[0].n,1);
    const request=(await db.query('select * from procurement_search_requests')).rows[0];
    assert.equal(request.initiated_by,id(1));assert.deepEqual(request.requested_categories,['opportunity']);
    const job=(await db.query('select claim_procurement_workflow_job() as job')).rows[0].job;
    assert.equal((await db.query('select claim_procurement_workflow_job() as job')).rows[0].job,null);
    const checkpoint={stage:'interpret',interpreted_task_ids:[id(71)],cache_hits:2,artifact:'artifacts/'+ 'a'.repeat(64)};
    assert.equal((await db.query('select checkpoint_procurement_workflow($1,$2,$3,$4) as saved',
      [job.id,job.lease_token,'running',checkpoint])).rows[0].saved,true);
    await db.query("update procurement_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
    const resumed=(await db.query('select claim_procurement_workflow_job() as job')).rows[0].job;
    assert.equal(resumed.id,job.id);assert.notEqual(resumed.lease_token,job.lease_token);
    assert.deepEqual(resumed.checkpoint,checkpoint);assert.equal(resumed.attempts,job.attempts+1);
    assert.equal((await db.query('select checkpoint_procurement_workflow($1,$2,$3,$4) as saved',[job.id,job.lease_token,'succeeded',{stage:'bad'}])).rows[0].saved,false);
    assert.deepEqual((await db.query('select checkpoint from procurement_jobs where id=$1',[job.id])).rows[0].checkpoint,checkpoint);
    assert.equal((await db.query('select checkpoint_procurement_workflow($1,$2,$3,$4) as saved',[job.id,resumed.lease_token,'blocked',{stage:'interpret',next_action:'Review exact evidence'}])).rows[0].saved,true);
  }finally{await db.close();}
});
test('database enforces shared call/token/money budgets, uncertain outcomes, monthly cap and private grants',async()=>{
  const db=await fixture();try {
    const requestId=(await submit(db)).rows[0].id;
    const entry=n=>({id:id(20+n),request_id:requestId,actor_id:id(1),kind:'inference',provider:'openai',model:'test',rate_version:'fixture-only',
      input_tokens:8000,output_tokens:2000,reserved_usd:0.2});
    const reserve=(n,monthly=10)=>db.query('select reserve_procurement_usage($1,$2)',[entry(n),monthly]);
    await assert.rejects(reserve(0,0),/disabled/);
    await reserve(0);await assert.rejects(reserve(1),/unresolved/);
    await db.query("update procurement_usage_ledger set state='outcome_unknown' where id=$1",[id(20)]);
    await assert.rejects(reserve(1),/unresolved/);
    await db.query("update procurement_usage_ledger set state='completed',actual_usd=0.01 where id=$1",[id(20)]);
    for(let n=1;n<4;n++) {await reserve(n);await db.query("update procurement_usage_ledger set state='completed',actual_usd=0.01 where id=$1",[id(20+n)]);}
    await assert.rejects(reserve(4),/budget exhausted/);
    const other=(await submit(db,'request-key-2')).rows[0].id;
    await assert.rejects(db.query('select reserve_procurement_usage($1,$2)',[{...entry(9),request_id:other},0.1]),/Monthly/);
    const grants=(await db.query(`select has_table_privilege('authenticated','procurement_usage_ledger','select') as usage,
      has_table_privilege('anon','procurement_extraction_cache','select') as cache,
      has_function_privilege('authenticated','submit_procurement_api_request(uuid,text,text,jsonb,text[])','execute') as submit`)).rows[0];
    assert.deepEqual(grants,{usage:false,cache:false,submit:false});
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select claim_procurement_workflow_job()'),/permission denied/);
  }finally{await db.close();}
});


test('manual SAM submission is separately idempotent and never creates a geography collection job',async()=>{
  const db=await fixture();try {
    const args=[id(1),'sam-key-001','c'.repeat(64),'opportunity',{from:'2026-10-06',to:'2026-11-06'},{state:'AR',ncode:'561720'}];
    const submitSam=()=>db.query('select submit_procurement_sam_request($1,$2,$3,$4,$5,$6) as id',args);
    const first=(await submitSam()).rows[0].id;assert.equal((await submitSam()).rows[0].id,first);
    const request=(await db.query('select * from procurement_search_requests where id=$1',[first])).rows[0];
    assert.deepEqual(request.requested_categories,['opportunity']);
    assert.deepEqual(request.requested_search_areas,[{area_type:'state',state_code:'AR'}]);
    const job=(await db.query('select claim_procurement_workflow_job() as job')).rows[0].job;
    assert.equal(job.dedupe_key,'api-sam:'+first);assert.equal(job.checkpoint.stage,'sam_collect');
    args[3]='forecast';await assert.rejects(submitSam(),/Invalid statewide SAM/);
  }finally{await db.close();}
});
