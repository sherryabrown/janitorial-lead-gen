// Partial native verification of an owner-supplied read-only manual export.
// Missing Auth/types/policies are never replaced by invented recovery data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
const source=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Owner-approved export path required');
const output=resolve('outputs/deployment/scheduling-backup-readiness/manual-export-inspection');
const inspection=JSON.parse(readFileSync(join(output,'inspection-private.json'),'utf8'));
assert.equal(resolve(inspection.source),source);
const bin=process.env.CUTOVER_TEST_PG_BIN||'C:/Program Files/PostgreSQL/15/bin';
const folder=mkdtempSync(join(tmpdir(),'manual-backup-restore-')),data=join(folder,'data');
const port=await new Promise((accept,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>accept(p));});});
const options={encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024};
const run=(name,args,extra={})=>execFileSync(join(bin,name+'.exe'),args,{...options,...extra});
const sql=input=>run('psql',['-X','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input});
let started=false;
try{
 run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
 run('pg_ctl',['-D',data,'-l',join(folder,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -F`,'-w','-t','30','start'],{stdio:'ignore',timeout:40000});started=true;
 assert.equal(sql("select current_setting('data_directory');").trim().replaceAll('\\','/'),data.replaceAll('\\','/'));
 const ddl=readFileSync(join(source,'Schema','procurement_sources.txt'),'utf8');
 if(/\b(program|dblink|foreign\s+server|extension|alter\s+system)\b|\\!/i.test(ddl))throw Error('Review unexpected SQL before local execution');
 sql(ddl);
 const csv=inspection.data.find(d=>d.table==='public.procurement_sources');assert.ok(csv);assert.equal(csv.invalid_width_rows,0);
 for(const c of csv.columns)assert.match(c,/^[a-z_][a-z0-9_]*$/);
 const path=join(source,'Data',csv.file).replaceAll('\\','/').replaceAll("'","''");
 const columns=csv.columns.map(c=>'"'+c+'"').join(',');
 sql(`\\copy public.procurement_sources(${columns}) from '${path}' with (format csv,header true)\n`);
 assert.equal(Number(sql('select count(*) from procurement_sources;').trim()),csv.rows);
 sql(`create schema restore_check;create table restore_check.source_csv(${csv.columns.map(c=>'"'+c+'" text').join(',')});`);
 sql(`\\copy restore_check.source_csv(${columns}) from '${path}' with (format csv,header true)\n`);
 const jsonColumns=JSON.parse(sql("select coalesce(jsonb_agg(attname),'[]'::jsonb) from pg_attribute where attrelid='procurement_sources'::regclass and attnum>0 and not attisdropped and atttypid in ('json'::regtype,'jsonb'::regtype);").trim());
 for(const column of jsonColumns)assert.match(column,/^[a-z_][a-z0-9_]*$/);
 // CSV encodes JSON as text; decode it before converting the staged row to its typed record.
 const expectedInput='to_jsonb(c)'+(jsonColumns.length?'||jsonb_build_object('+jsonColumns.map(c=>`'${c}',c."${c}"::jsonb`).join(',')+')':'');
 const expected=`select to_jsonb(jsonb_populate_record(null::procurement_sources,${expectedInput})) from restore_check.source_csv c`;
 assert.equal(sql(`select count(*) from ((select to_jsonb(s) as record from procurement_sources s except ${expected}) union all (${expected} except select to_jsonb(s) from procurement_sources s)) differences;`).trim(),'0');
 let profileFailure=false;
 try{sql(readFileSync(join(source,'Schema','profiles.txt'),'utf8'));}catch(error){profileFailure=/app_role/.test(String(error.stderr));writeFileSync(join(output,'profile-restore-error-private.log'),String(error.stderr));}
 assert.ok(profileFailure,'As-supplied profiles restoration must report the omitted type');
 const receipt={checked_at:new Date().toISOString(),runtime:run('postgres',['--version']).trim(),source_read_only:true,source_table:'procurement_sources',restored_rows:csv.rows,typed_records_match_csv:true,profiles_restore_blocked_by_missing_app_role:true,complete_database_restore:false,cutover_on_this_snapshot_rehearsed:false,reason:'Missing Auth users, app_role type, membership table and access-policy/permission exports; no placeholders or disabled constraints were used.'};
 writeFileSync(join(output,'partial-native-restore-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}catch(error){writeFileSync(join(output,'partial-native-restore-error-private.log'),String(error.stderr??error.message));console.error('Partial native restore verification failed; see private local diagnostic.');process.exitCode=1;}
finally{if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop'],{stdio:'ignore',timeout:40000});}
