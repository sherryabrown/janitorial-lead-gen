// Explicit operator-only read-only backup probe. Never prints connection inputs.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import pg from 'pg';

const root=resolve('outputs/deployment/scheduling-backup-readiness');
const vars=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).flatMap(line=>{const m=line.match(/^([A-Z0-9_]+)=(.*)$/);return m?[[m[1],m[2].replace(/^(['"])(.*)\1$/,'$2')]]:[];}));
const input=readFileSync('.env.scheduling-backup.local','utf8').match(/^SCHEDULING_BACKUP_DB_PASSWORD=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2');
if(!input)throw Error('Local backup password is empty');
const uri=new URL(readFileSync('supabase/.temp/pooler-url','utf8').trim());
if(!['postgres:','postgresql:'].includes(uri.protocol)||!uri.hostname.endsWith('.pooler.supabase.com')||uri.username!=='postgres.zreplhkoxswtzxlchtjf'||uri.pathname!=='/postgres')throw Error('Unexpected linked project');
// Keep TLS options explicit rather than accepting URL parameters that override them.
uri.search='';
uri.password=input;
const client=new pg.Client({connectionString:uri.toString(),ssl:{rejectUnauthorized:true,ca:Buffer.from(vars.PROCUREMENT_DATABASE_CA_BASE64,'base64').toString()},options:'-c default_transaction_read_only=on',connectionTimeoutMillis:15000});
try{
 await client.connect();await client.query('begin isolation level repeatable read read only');
 const {rows}=await client.query(`select current_setting('transaction_read_only') as read_only,current_setting('server_version') as server_version,current_user,
 (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as public_functions,
 (select count(*)::int from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\') as procurement_tables`);
 if(rows[0].read_only!=='on')throw Error('Read-only guard missing');
 writeFileSync(resolve(root,'approved-connection-receipt.json'),JSON.stringify({checked_at:new Date().toISOString(),...rows[0]},null,2));
 await client.query('rollback');console.log(JSON.stringify({connection:'verified_read_only',...rows[0]}));
}catch(error){console.error('Backup probe failed:',error.code??'connection_error');process.exitCode=1;}finally{await client.end();}
