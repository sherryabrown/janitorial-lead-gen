// Native restore rehearsal with synthetic data only. No remote connection allowed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {adminMigrations} from '../helpers/admin-trigger-db.mjs';
import {schedulingCutoverPlan,cutoverMigrations} from '../../scripts/prepare-scheduling-cutover.mjs';

const bin=process.env.CUTOVER_TEST_PG_BIN||'C:/Program Files/PostgreSQL/15/bin';
const root=mkdtempSync(join(tmpdir(),'scheduling-cutover-restore-')),data=join(root,'data');
const port=await new Promise((accept,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>accept(p));});});
const options={encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024};
const run=(name,args,extra={})=>execFileSync(join(bin,name+'.exe'),args,{...options,...extra});
const conn=name=>['-h','127.0.0.1','-p',String(port),'-U','postgres','-d',name];
const sql=(name,input)=>run('psql',['-X','-qAt',...conn(name),'-v','ON_ERROR_STOP=1'],{input});
const sha=text=>createHash('sha256').update(text).digest('hex');
const schema=name=>sql(name,`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth') and p.prokind in ('f','p') order by 1;
 select schemaname||'.'||tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,'') from pg_policies order by 1;
 select pg_get_triggerdef(oid) from pg_trigger where not tgisinternal order by 1;`);
const members=name=>sql(name,'select to_jsonb(m) from procurement_members m order by id;');
const protectedRows=name=>sql(name,`select jsonb_build_object('leads',(select jsonb_agg(to_jsonb(l) order by id) from procurement_leads l),'notes',(select jsonb_agg(to_jsonb(n) order by id) from procurement_lead_notes n),'sources',(select jsonb_agg(to_jsonb(s) order by id) from procurement_sources s),'profiles',(select jsonb_agg(to_jsonb(p) order by user_id) from profiles p));`);
let started=false;
try{
 run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
 run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -F`,'-w','-t','30','start'],{stdio:'ignore',timeout:40000});started=true;
 assert.equal(sql('postgres',"select current_setting('data_directory');").trim().replaceAll('\\','/'),data.replaceAll('\\','/'));
 sql('postgres',`create role anon;create role authenticated;create role service_role bypassrls;create database rehearsal_source;create database rehearsal_restore;create database rehearsal_recovery;`);
 sql('rehearsal_source',`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select null::uuid';create schema storage;create table storage.buckets(id text primary key,name text,public boolean);`);
 for(const path of ['supabase/baselines/20260930_public_procurement.sql',...['20260930000100_authenticated_procurement_reads.sql','20260930000200_procurement_queue_pages.sql','20261001000100_queue_bounds_and_historical_dates.sql','20261005000700_public_source_access_handoffs.sql','20261006000100_source_access_lifecycle.sql','20261007000500_api_record_link_state.sql',...adminMigrations].map(n=>'supabase/migrations/'+n)])sql('rehearsal_source',readFileSync(path,'utf8'));
 sql('rehearsal_source',`create type public.app_role as enum('user','admin');create table public.profiles(user_id uuid unique references auth.users(id),role app_role not null default 'user',updated_at timestamptz default now(),first_name text,last_name text);
 insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
 insert into profiles(user_id,role) values('00000000-0000-4000-8000-000000000001','admin'),('00000000-0000-4000-8000-000000000002','user');
 insert into procurement_members(user_id) values('00000000-0000-4000-8000-000000000001');
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);
 create function public.procurement_restore_marker() returns text language sql immutable as $$select 'synthetic restore sentinel'::text$$;`);
 const source=JSON.parse(readFileSync('tests/fixtures/research/mapping.json','utf8')).procurement_sources[0];
 const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 sql('rehearsal_source',`insert into procurement_sources(code,name,url,business_category,contracting_entity_geo_level) select code,name,url,business_category,contracting_entity_geo_level from jsonb_populate_record(null::procurement_sources,${literal(source)});`);
 const payload=JSON.parse(readFileSync('tests/fixtures/research/mapping.json','utf8')).procurement_leads[1].payload;
 sql('rehearsal_source',`insert into procurement_leads(source_id,external_id,payload,stage,notes) select id,'synthetic-restore',${literal(payload)},'interested','Preserve lead context' from procurement_sources;
 insert into procurement_lead_notes(lead_id,body,created_by) select id,'Preserve author note','00000000-0000-4000-8000-000000000002'::uuid from procurement_leads;`);
 const before=schema('rehearsal_source'),membership=members('rehearsal_source'),protectedBefore=protectedRows('rehearsal_source');
 const dump=join(root,'synthetic.dump');run('pg_dump',[...conn('rehearsal_source'),'-Fc','-f',dump]);
 for(const name of ['rehearsal_restore','rehearsal_recovery']){
  run('pg_restore',[...conn(name),'--exit-on-error',dump]);assert.equal(schema(name),before,'Routine/policy/trigger definitions survive restore');assert.equal(members(name),membership);
  assert.equal(sql(name,"select count(*) from public.profiles;").trim(),'2');
  assert.equal(protectedRows(name),protectedBefore,'Source, lead payload/stage/notes, authored notes and profile records survive restore');
 }
 const plan=await schedulingCutoverPlan();
 sql('rehearsal_restore','create view public.procurement_restore_dependency as select id from procurement_members;');
 assert.throws(()=>sql('rehearsal_restore',plan.sql),/./);
 assert.equal(sql('rehearsal_restore',"select to_regclass('public.procurement_source_labels') is null;").trim(),'t');
 assert.equal(members('rehearsal_restore'),membership);assert.equal(schema('rehearsal_restore'),before,'Failed bundle leaves routines, policies and triggers untouched');
 sql('rehearsal_restore','drop view procurement_restore_dependency;');sql('rehearsal_restore',plan.sql);
 assert.equal(sql('rehearsal_restore',"select count(*) from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\';").trim(),'41');
 assert.equal(sql('rehearsal_restore',"select detail->'record' from procurement_events where event_type='legacy_procurement_membership_archived' order by detail->'record'->>'id';"),membership);
 assert.equal(protectedRows('rehearsal_restore'),protectedBefore,'Cutover preserves existing source, lead and profile records');
 // Approved bookkeeping scope is rehearsed only in the isolated fixture ledger.
 for(const name of cutoverMigrations)sql('rehearsal_restore',`insert into supabase_migrations.schema_migrations(version) values('${name.split('_')[0]}') on conflict do nothing;`);
 assert.equal(sql('rehearsal_restore','select count(*) from supabase_migrations.schema_migrations;').trim(),'8');
 assert.equal(schema('rehearsal_recovery'),before,'Recovery database remains the original restored pre-cutover schema');
 const receipt={checked_at:new Date().toISOString(),data:'synthetic fixtures only; NOT a production restore',runtime:run('postgres',['--version']).trim(),backup_sha256:sha(readFileSync(dump)),routines_policies_triggers_sha256:sha(before),checks:['native dump and two restores','routine/policy/trigger equality','profile and membership identity preservation','failed atomic cutover rollback','successful lossless cutover to 41 tables','eight isolated migration ledger entries','pre-cutover recovery database preserved']};
 const out=resolve('outputs/deployment/scheduling-backup-readiness');mkdirSync(out,{recursive:true});writeFileSync(join(out,'native-fixture-restore-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}finally{
 if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop'],{stdio:'ignore',timeout:40000});
}
