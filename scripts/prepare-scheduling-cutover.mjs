import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const runtimeCommit='c37bcc2bc42d7901bdb9764fc7e5d4acfe7e2b65';
export const cutoverMigrations=[
 '20261023000400_workflow_step_sequence_index.sql',
 '20261026000100_protect_profile_role.sql',
 '20261026000200_procurement_profile_capabilities.sql',
 '20261026000300_procurement_source_decisions.sql',
 '20261026000400_procurement_source_exclusion_claims.sql',
 '20261026000500_retire_procurement_members.sql',
 '20261027000100_procurement_guided_source_repairs.sql',
 '20261028000100_procurement_source_attention.sql',
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalize=sql=>sql.replace(/\r\n/g,'\n');
export async function schedulingCutoverPlan(){
 const entries=[];
 for(const name of cutoverMigrations){
  const path='supabase/migrations/'+name,sql=normalize(await readFile(path,'utf8'));
  const committed=normalize(execFileSync('git',['show',`${runtimeCommit}:${path}`],{encoding:'utf8'}));
  if(sql!==committed)throw Error('Migration differs from the tested runtime: '+name);
  if((sql.match(/^begin;\s*$/gmi)??[]).length!==1||(sql.match(/^commit;\s*$/gmi)??[]).length!==1||!sql.trimEnd().endsWith('commit;'))throw Error('Unexpected transaction wrappers: '+name);
  entries.push({name,sha256:sha(sql),body:sql.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'').trim()});
 }
 const preflight=`do $cutover$ begin
 if current_user not in ('postgres','supabase_admin') then raise exception 'Trusted migration operator required'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('scheduling-00-production-cutover',0)) then raise exception 'Another cutover is active'; end if;
 if (select count(*) from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\')<>42 then raise exception 'Reconcile the 42-table pre-cutover manifest first'; end if;
 if to_regclass('public.procurement_members') is null or to_regclass('public.procurement_source_labels') is not null
 or exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='procurement_protect_profile_role') then raise exception 'Unexpected or partially applied release; inspect before proceeding'; end if;
 if exists(select 1 from public.profiles where role is null or role::text not in ('user','admin')) then raise exception 'Resolve unsupported profile roles before cutover'; end if;
 if exists(select 1 from public.procurement_scheduler_settings where enabled) then raise exception 'Pause scheduler dispatch before cutover'; end if;
 if exists(select 1 from public.procurement_jobs where state='running' and (lease_until is null or lease_until>now()))
 or exists(select 1 from public.procurement_triggers where state='running' and (lease_until is null or lease_until>now())) then raise exception 'Drain active leases before cutover'; end if;
 perform set_config('procurement.cutover_member_digest',(select md5(coalesce(string_agg(to_jsonb(m)::text,E'\\n' order by m.id),'')) from public.procurement_members m),true);
end $cutover$;`;
 const postflight=`do $cutover$ begin
 if (select count(*) from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\')<>41 or to_regclass('public.procurement_members') is not null then raise exception 'Final table manifest mismatch'; end if;
 if (select md5(coalesce(string_agg((e.detail->'record')::text,E'\\n' order by e.detail->'record'->>'id'),'')) from public.procurement_events e where e.event_type='legacy_procurement_membership_archived') is distinct from current_setting('procurement.cutover_member_digest') then raise exception 'Archived membership equality check failed'; end if;
 if to_regclass('public.procurement_source_labels') is null or to_regprocedure('public.procurement_source_attention_page(boolean,integer,integer)') is null then raise exception 'Required safe source projections missing'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='procurement_protect_profile_role') then raise exception 'Role protection missing'; end if;
end $cutover$;`;
 const deploymentCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const appDiff=execFileSync('git',['diff','--name-only',runtimeCommit,'--','src','scripts/lib','scripts/workflow-server.mjs','Dockerfile.workflow','package.json','package-lock.json','supabase/migrations'],{encoding:'utf8'}).trim();
 if(appDiff)throw Error('Application differs from tested runtime; refresh acceptance before preparing cutover');
 let holdCommitted=true;try{execFileSync('git',['cat-file','-e',`${deploymentCommit}:scripts/scheduling-cutover-hold.mjs`],{stdio:'ignore'});}catch{holdCommitted=false;}
 const sql=`-- REVIEWED PREPARATION ONLY. No executor, credentials, network or migration-history writes.\n-- Runtime ${runtimeCommit}; project zreplhkoxswtzxlchtjf.\n-- Requires approved maintenance, verified backup, drained backend and operator authorization.\nbegin;\nset local lock_timeout='10s';\nset local statement_timeout='120s';\n${preflight}\n${entries.map(e=>`\n-- ${e.name} SHA256 ${e.sha256}\n${e.body}\n`).join('')}\n${postflight}\ncommit;\n`;
 return {sql,manifest:{runtime_commit:runtimeCommit,deployment_commit:holdCommitted?deploymentCommit:null,hold_server_committed:holdCommitted,project_ref:'zreplhkoxswtzxlchtjf',generated_at:new Date().toISOString(),atomic_transaction:true,execution_authorized:false,migration_history_writes:false,migrations:entries.map(({name,sha256})=>({name,sha256})),bundle_sha256:sha(sql)}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const plan=await schedulingCutoverPlan(),folder=resolve('outputs/deployment/scheduling-cutover');await mkdir(folder,{recursive:true});
 const maintenance=resolve(folder,'maintenance');await mkdir(maintenance,{recursive:true});
 await writeFile(resolve(maintenance,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scheduled update · Executive Services SPIN Leads</title><style>body{margin:0;padding:3rem 1.25rem;font:18px/1.6 system-ui,sans-serif;color:#292524;background:#faf8f5}main{max-width:38rem;margin:8vh auto;border-top:4px solid #ff914d;padding-top:1.5rem}h1{font-size:2rem;line-height:1.2}p{max-width:55ch}</style><main><p>Executive Services SPIN Leads</p><h1>Scheduled update in progress</h1><p>The application is temporarily unavailable while we update scheduling.</p><p>Keep any unsaved notes until the update is complete. Refresh this page after service returns.</p></main></html>');
 await writeFile(resolve(maintenance,'_redirects'),'/* /index.html 200\n');
 await writeFile(resolve(maintenance,'_headers'),'/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex\n');
 await writeFile(resolve(folder,'reviewed-cutover.sql'),plan.sql);await writeFile(resolve(folder,'manifest.json'),JSON.stringify(plan.manifest,null,2));
 console.log(JSON.stringify({prepared:true,folder,runtime_commit:runtimeCommit,atomic:true,migrations:cutoverMigrations.length,execution_authorized:false,live_changes:false}));
}
