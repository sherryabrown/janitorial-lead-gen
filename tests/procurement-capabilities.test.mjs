import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminDatabase} from './helpers/admin-trigger-db.mjs';
import {profileCapabilities,requireCapability,scheduleBusinessRoute,businessResponse} from '../scripts/lib/procurement-capabilities.mjs';

test('profile authority is independent of legacy membership and request claims',async()=>{
  let reads=0;
  const db={from(table){assert.equal(table,'profiles');return {select(columns){assert.equal(columns,'role,updated_at');return this;},eq(column,id){assert.equal(column,'user_id');assert.equal(id,'signed-in-id');return this;},async maybeSingle(){reads++;return {data:{role:'user',updated_at:'revision'}};}};}};
  const capabilities=await profileCapabilities(db,'signed-in-id');
  assert.equal(reads,1);assert.equal(capabilities.manage_schedules,true);assert.equal(capabilities.manage_sources,false);
  for(const path of ['/v1/schedules','/v1/schedules/preview','/v1/admin/metric-members','/v1/admin/history'])requireCapability(capabilities,path.endsWith('preview')?'POST':'GET',path);
  for(const path of ['/v1/requests','/v1/access/any','/v1/scheduler/status','/v1/new-future-route','/v1/triggers/00000000-0000-4000-8000-000000000001/steps'])
    assert.throws(()=>requireCapability(capabilities,'GET',path),e=>e.status===403);
  assert.equal(scheduleBusinessRoute('POST','/v1/admin/metric-members'),false);
  assert.throws(()=>requireCapability({...capabilities,manage_schedules:false},'GET','/v1/schedules'),e=>e.status===403);
  assert.deepEqual(businessResponse({items:[{name:'Schedule',usage:{private:'usage'},reporting:{leads:{added:2},checkpoint:{private:'secret'}}}]}),{items:[{name:'Schedule',reporting:{leads:{added:2}}}]});
});

test('database capabilities and safe source labels protect raw configuration',async()=>{
  const db=await adminDatabase();
  try {
    await db.exec(readFileSync('supabase/migrations/20260930000100_authenticated_procurement_reads.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20261005000700_public_source_access_handoffs.sql','utf8'));
    await db.exec(`create type public.app_role as enum ('user','admin');
      create table public.profiles(id uuid primary key default gen_random_uuid(),user_id uuid unique not null references auth.users(id),
        role public.app_role not null default 'user',updated_at timestamptz not null default now());
      create or replace function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema public,auth to authenticated;
      insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
      insert into public.profiles(user_id,role) values('00000000-0000-4000-8000-000000000001','user'),('00000000-0000-4000-8000-000000000002','admin');
      grant select on procurement_sources to authenticated;
      create policy test_existing_read on procurement_sources for select to authenticated using (true);
      insert into procurement_sources(code,name,url,business_category,contracting_entity_geo_level,config) values('test','Test source','https://example.gov','other_public','county',
        '{"private":"secret-config","research_persistence":{"coverage_by_scope":{"scope":{"checked_at":"2026-10-26","private":"secret-evidence","coverage":{"opportunity":{"status":"checked","private":"secret"}}}}}}');`);
    await db.exec(readFileSync('supabase/migrations/20261026000200_procurement_profile_capabilities.sql','utf8'));
    await db.exec(`set role authenticated;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';`);
    const user=(await db.query('select procurement_capabilities() as c')).rows[0].c;
    assert.equal(user.role,'user');assert.equal(user.manage_sources,false);
    assert.equal((await db.query('select * from procurement_sources')).rows.length,0);
    const labels=(await db.query('select * from procurement_source_labels')).rows;
    assert.equal(labels.length,1);assert.equal(JSON.stringify(labels).includes('secret'),false);
    assert.equal(labels[0].config.research_persistence.coverage_by_scope.scope.coverage.opportunity.status,'checked');
    await db.exec(`set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';`);
    assert.equal((await db.query('select procurement_capabilities() as c')).rows[0].c.manage_sources,true);
    assert.equal((await db.query('select * from procurement_sources')).rows.length,1);
    await db.exec(`set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';`);
    assert.equal((await db.query('select procurement_capabilities() as c')).rows[0].c.manage_schedules,false);
    await db.exec(`reset role;insert into procurement_members(user_id) values('00000000-0000-4000-8000-000000000001');`);
    const legacy=(await db.query('select * from procurement_members order by id')).rows;
    await db.exec('create view procurement_member_external_dependency as select * from procurement_members');
    await assert.rejects(db.exec(readFileSync('supabase/migrations/20261026000500_retire_procurement_members.sql','utf8')),e=>e.code==='2BP01');
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from procurement_members order by id')).rows,legacy);
    assert.equal((await db.query("select count(*)::int as n from procurement_events where event_type='legacy_procurement_membership_archived'")).rows[0].n,0);
    await db.exec('drop view procurement_member_external_dependency');
    await db.exec(readFileSync('supabase/migrations/20261026000500_retire_procurement_members.sql','utf8'));
    assert.equal((await db.query("select to_regclass('public.procurement_members') as name")).rows[0].name,null);
    assert.deepEqual((await db.query("select detail->'record' as record from procurement_events where event_type='legacy_procurement_membership_archived' order by detail->'record'->>'id'")).rows.map(r=>r.record),legacy);
    assert.equal((await db.query("select count(*)::int as n from pending_procurement_events('test-consumer',1000)")).rows[0].n,0,'Archive stays internal');
  } finally {await db.close();}
});
