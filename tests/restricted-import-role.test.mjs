import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {restrictedImportPoolOptions} from '../scripts/lib/restricted-import-connection.mjs';

test('import connection refuses owner credentials, another project and TLS verification overrides',()=>{
  const project='zreplhkoxswtzxlchtjf';
  assert.equal(restrictedImportPoolOptions({},project),null);
  for(const connection of [
    `postgres://postgres.${project}:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    'postgres://procurement_import_backend.otherproject:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    `postgres://procurement_import_backend.${project}:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=disable`,
    `postgres://procurement_import_backend.${project}:fake@unrelated.example:5432/postgres`,
  ])assert.throws(()=>restrictedImportPoolOptions({PROCUREMENT_DATABASE_URL:connection},project),/restricted import connection/);
  assert.throws(()=>restrictedImportPoolOptions({PROCUREMENT_DATABASE_URL:
    `postgres://procurement_import_backend.${project}:fake@aws-0-us-east-1.pooler.supabase.com:5432/postgres`},project),/CA certificate required/);
});

test('restricted import role uses explicit RLS grants and cannot delete, alter schema or read unrelated data',async()=>{
  const db=new PGlite();
  const tables=['procurement_sources','procurement_leads','procurement_intake_items','procurement_intake_leads',
    'procurement_request_leads','procurement_search_requests','procurement_versions','procurement_events',
    'procurement_geographies','procurement_source_capabilities','procurement_request_sources'];
  try {
    for(const t of tables)await db.exec(`create table public.${t}(id integer primary key); alter table public.${t} enable row level security;`);
    await db.exec(`create table public.unrelated_private_data(id integer);
      create function public.procurement_parse_date(text) returns date language sql as 'select null::date';
      create function public.procurement_parse_deadline(text) returns timestamptz language sql as 'select null::timestamptz';`);
    await db.exec(readFileSync('supabase/migrations/20261007000200_restricted_procurement_import_role.sql','utf8'));
    const role=(await db.query("select rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname='procurement_import_backend'")).rows[0];
    assert.ok(Object.values(role).every(v=>v===false));
    await db.exec('set role procurement_import_backend;');
    await db.exec('begin; insert into public.procurement_leads values(1); insert into public.procurement_versions values(1); update public.procurement_leads set id=2 where id=1; rollback;');
    assert.equal((await db.query('select count(*)::integer as count from public.procurement_leads')).rows[0].count,0);
    for(const sql of ['delete from public.procurement_leads','select * from public.unrelated_private_data',
      'create table public.unapproved(id integer)','alter table public.procurement_leads add column unapproved text',
      'update public.procurement_sources set id=2','update public.procurement_versions set id=2'])
      await assert.rejects(db.exec(sql),/permission denied|must be owner/);
  }finally{await db.close();}
});

test('helper restriction preserves existing callers while excluding importer and future roles',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role existing_caller; create role procurement_import_backend;
      create type public.app_role as enum ('member');
      create function public.cleanup_old_audit_logs() returns void language plpgsql security definer as $$begin return; end$$;
      create function public.get_user_role(uuid) returns public.app_role language sql security definer as $$select 'member'::public.app_role$$;
      create function public.has_role(uuid,public.app_role) returns boolean language sql security definer as $$select true$$;`);
    const query="select r.rolname,p.oid::regprocedure::text as signature,has_function_privilege(r.oid,p.oid,'EXECUTE') as allowed from pg_roles r cross join pg_proc p where p.proname in ('cleanup_old_audit_logs','get_user_role','has_role') order by r.rolname,signature";
    const before=(await db.query(query)).rows;
    await db.exec(readFileSync('supabase/migrations/20261007000300_restrict_inherited_admin_helpers.sql','utf8'));
    const after=(await db.query(query)).rows;
    assert.deepEqual(after.filter(r=>r.rolname!=='procurement_import_backend'),before.filter(r=>r.rolname!=='procurement_import_backend'));
    assert.ok(after.filter(r=>r.rolname==='procurement_import_backend').every(r=>!r.allowed));
    await db.exec('create role future_caller');
    assert.ok((await db.query(query)).rows.filter(r=>r.rolname==='future_caller').every(r=>!r.allowed));
  }finally{await db.close();}
});
