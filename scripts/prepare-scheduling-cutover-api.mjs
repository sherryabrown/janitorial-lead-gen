// Preparation only: generate reviewed API bodies. No credentials or network calls.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {schedulingCutoverPlan} from './prepare-scheduling-cutover.mjs';
const plan=await schedulingCutoverPlan(),folder=resolve('outputs/deployment/scheduling-cutover/api');await mkdir(folder,{recursive:true});
const operatorPreflight=`begin read only;
set local statement_timeout='15s';
select current_user as operator,current_database() as database,
current_setting('transaction_read_only') as transaction_read_only,
has_schema_privilege(current_user,'public','CREATE') as can_create_public_objects,
has_table_privilege(current_user,'public.profiles','TRIGGER') as can_protect_profile_role,
has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') as can_record_approved_history;
commit;`;
const versions=plan.manifest.migrations.map(m=>m.name.split('_')[0]);
const history=`begin;
do $history$ begin
 if current_user not in ('postgres','supabase_admin') then raise exception 'Trusted migration operator required'; end if;
 if (select count(*) from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\')<>41
 or to_regclass('public.procurement_members') is not null or to_regclass('public.procurement_source_labels') is null
 or to_regprocedure('public.procurement_source_attention_page(boolean,integer,integer)') is null
 or not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='procurement_protect_profile_role') then
 raise exception 'Verify the committed reviewed cutover before recording history'; end if;
end $history$;
insert into supabase_migrations.schema_migrations(version) values
${versions.map(v=>`('${v}')`).join(',\n')}
on conflict(version) do nothing;
commit;`;
const requests=[
 {file:'operator-preflight.json',query:operatorPreflight,read_only:false,changes_data:false,retry:'SELECT-only transaction; use only after final GO for operator access'},
 {file:'atomic-cutover.json',query:plan.sql,read_only:false,changes_data:true,retry:'Never automatically retry; inspect committed state after an uncertain response'},
 {file:'approved-history.json',query:history,read_only:false,changes_data:true,retry:'Only after confirmed bundle commit and the approved history exception'},
 {file:'read-only-preflight.json',query:await readFile('scripts/scheduling-cutover-preflight.sql','utf8'),read_only:true,changes_data:false,retry:'Read-only backup/prestate evidence'},
];
const files=[];
for(const request of requests){const bytes=JSON.stringify({query:request.query,read_only:request.read_only},null,2);await writeFile(resolve(folder,request.file),bytes);files.push({file:request.file,sha256:createHash('sha256').update(bytes).digest('hex'),changes_data:request.changes_data,retry:request.retry});}
const manifest={project_ref:plan.manifest.project_ref,endpoint:'https://api.supabase.com/v1/projects/zreplhkoxswtzxlchtjf/database/query',method:'POST',bundle_sha256:plan.manifest.bundle_sha256,runtime_commit:plan.manifest.runtime_commit,deployment_commit:plan.manifest.deployment_commit,execution_authorized:false,requests:files};
await writeFile(resolve(folder,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({prepared:true,requests:files.length,execution_authorized:false,network_calls:0,folder}));
