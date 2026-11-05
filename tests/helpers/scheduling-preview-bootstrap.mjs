// Preview setup is independent of the regression suite and its historical cases.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {prepareReleaseRoleFixture} from './release-roles-db.mjs';
import {savedReadMigrations} from './saved-scheduling-db.mjs';
import {schedulingDevPreview} from './scheduling-dev-preview.mjs';

export async function startSchedulingPreview({dbPort,httpPort,first,second,token}){
 const pool=new pg.Pool({host:'127.0.0.1',port:dbPort,user:'postgres',database:'postgres',max:1});
 const rehearsalPool=new pg.Pool({host:'127.0.0.1',port:dbPort,user:'procurement_rehearsal_backend',database:'postgres',max:1});
 try{
  await pool.query('create role procurement_rehearsal_backend login;create schema procurement_test authorization procurement_rehearsal_backend;');
  await prepareReleaseRoleFixture({pool,first,second});
  for(const name of ['20261027000100_procurement_guided_source_repairs.sql','20261028000100_procurement_source_attention.sql','20261026000500_retire_procurement_members.sql',...savedReadMigrations])
   await pool.query(readFileSync('supabase/migrations/'+name,'utf8'));
  await pool.query("notify pgrst, 'reload schema'");
  const db=createClient(`http://127.0.0.1:${httpPort}`,token('service_role'),{auth:{persistSession:false,autoRefreshToken:false},
   global:{fetch:(url,options)=>fetch(String(url).replace('/rest/v1/','/'),options)}});
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
   const result=await db.rpc('procurement_pending_run_results',{p_limit:1});
   if(!result.error){ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Local preview schema did not become available in PostgREST');
  await schedulingDevPreview({pool,rehearsalPool,db,first,second,token,gatewayPort:httpPort});
 }finally{await pool.end();await rehearsalPool.end();}
}
