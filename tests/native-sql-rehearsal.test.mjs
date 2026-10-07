import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {rehearsalBlueprint} from '../scripts/lib/native-sql-rehearsal.mjs';
import {reconciliationSql} from '../scripts/lib/intake-reconcile.mjs';
import {restrictedImportPoolOptions} from '../scripts/lib/restricted-import-connection.mjs';
import {offlineNativeSession} from './helpers/native-rehearsal.mjs';
const schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json'));
const manifest={project_ref:'test',request_id:'00000000-0000-4000-8000-000000000001',sources:{},records:[],decisions:[]};

test('native blueprint rejects changed executable definitions, missing triggers and oversized snapshots',()=>{
  const blueprint=rehearsalBlueprint({},schema,manifest);
  assert.ok(!blueprint.sql.includes('public.procurement_'));
  assert.ok(!/^\s*(begin|commit);/mi.test(blueprint.sql));
  assert.ok(blueprint.functionDdl.every(s=>!s.includes('public.')));
  for(const altered of [
    {...schema,functions:schema.functions.map((f,i)=>i?f:f.replace('insert into public.procurement_versions','insert into public.other_data'))},
    {...schema,columns:schema.columns.map((c,i)=>i?c:{...c,default:"nextval('public.secret_sequence')"})},
    {...schema,constraints:[...schema.constraints,{table:'procurement_leads',definition:'CHECK (public.has_role(null,null))'}]},
    {...schema,triggers:schema.triggers.filter(t=>!t.includes('procurement_lead_changed'))},
  ])assert.throws(()=>rehearsalBlueprint({},altered,manifest));
  assert.throws(()=>rehearsalBlueprint({procurement_leads:Array(10001).fill({})},schema,manifest),/bound/);
  assert.throws(()=>reconciliationSql(manifest,{schema:'public; drop schema public cascade'}),/target/);
});

test('new validator connection cannot use the production login or override TLS',()=>{
  const project='zreplhkoxswtzxlchtjf';
  assert.equal(restrictedImportPoolOptions({},project,{rehearsal:true}),null);
  assert.throws(()=>restrictedImportPoolOptions({PROCUREMENT_REHEARSAL_DATABASE_URL:
    `postgres://procurement_import_backend.${project}:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres`},project,{rehearsal:true}));
});

test('private schema migration isolates validator from production and rolls back test DDL/data',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create schema storage; create table public.procurement_leads(id uuid primary key); create table auth.users(id uuid); create table storage.objects(id uuid);');
    await db.exec(readFileSync('supabase/migrations/20261007000400_private_procurement_test_rehearsal.sql','utf8'));
    await db.exec('set role procurement_rehearsal_backend');
    for(const sql of ['select * from public.procurement_leads','insert into public.procurement_leads values(gen_random_uuid())',
      'update public.procurement_leads set id=gen_random_uuid()','delete from public.procurement_leads','select * from auth.users',
      'select * from storage.objects','create table public.unwanted(id integer)'])await assert.rejects(db.exec(sql));
    await db.exec('begin; create table procurement_test.probe(id integer); insert into procurement_test.probe values(1); rollback;');
    assert.equal((await db.query("select to_regclass('procurement_test.probe') as object")).rows[0].object,null);
    await db.exec('reset role; set role authenticated');
    assert.equal((await db.query("select has_schema_privilege(current_user,'procurement_test','USAGE') as allowed")).rows[0].allowed,false);
  }finally{await db.close();}
});

test('native constraint failure rolls back all cloned objects and the same session can rehearse again',async()=>{
  const session=await offlineNativeSession();
  try {
    const before=JSON.parse(readFileSync('tests/fixtures/sam/intake-before.json'));
    const m={...manifest,project_ref:before.project_ref,request_id:before.procurement_search_requests[0].id,
      sources:Object.fromEntries(before.procurement_sources.map(s=>[s.code,s.id])),summary:{}};
    const invalid=structuredClone(before);
    invalid.procurement_intake_items[0].source_id='00000000-0000-4000-8000-000000000999';
    await assert.rejects(session.run({before:invalid,schema,manifest:m,sql:reconciliationSql(m)}));
    assert.equal((await session.db.query("select count(*)::integer as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='procurement_test'")).rows[0].count,0);
    const result=await session.run({before,schema,manifest:m,sql:reconciliationSql(m)});
    assert.equal(result.cleanup,true);assert.equal(result.replay,true);
  }finally{await session.close();}
});
