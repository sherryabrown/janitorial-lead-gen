import { runSupabase } from './lib/supabase-cli.mjs';
import { writeFileSync,existsSync } from 'node:fs';
import { project } from './lib/supabase-admin.mjs';
const dest=process.argv[2];
if(!dest||existsSync(dest)) throw new Error('Provide a new schema snapshot path.');
const tables="'procurement_sources','procurement_leads','procurement_intake_items','procurement_intake_leads','procurement_request_leads','procurement_search_requests','procurement_versions','procurement_events'";
const sql=`select jsonb_build_object('columns',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relname in (${tables}) and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'definition',pg_get_constraintdef(k.oid))) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tables})),'functions',(select jsonb_agg(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('procurement_lead_changed','procurement_sync_lead_columns','procurement_parse_date','procurement_parse_deadline')),'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relname in (${tables}))) as schema;`;
// Static metadata query only; no credentials or command output logged.
if(!/^[a-zA-Z0-9_./-]+$/.test(dest)) throw new Error('Use a simple relative path.');
const inspectedSql=sql.replace("'procurement_parse_deadline'","'procurement_parse_deadline','validate_procurement_search_request'")
 .replace("'triggers',","'permissions',(select jsonb_agg(jsonb_build_object('table',tablename,'roles',roles,'command',cmd,'qual',qual,'with_check',with_check)) from pg_policies where schemaname='public' and tablename in ("+tables+")),'triggers',");
writeFileSync(dest+'.sql',inspectedSql,{flag:'wx'});
const out = runSupabase(['db', 'query', '--linked', '--project-ref', project, '--file', dest + '.sql']);
const result=JSON.parse(out);
writeFileSync(dest,JSON.stringify(result.rows[0].schema,null,2)+'\n',{flag:'wx'});
console.log('Saved live constraints, columns, date parsers and history triggers.');
