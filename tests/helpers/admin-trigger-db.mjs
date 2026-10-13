import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const adminMigrations=[
  '20261002000100_arkansas_municipality_routing.sql','20261002000200_known_source_execution.sql',
  '20261002000300_public_source_checks.sql','20261002000400_reconcile_known_gaps.sql',
  '20261004000100_source_gap_accountability.sql','20261004000200_ardot_known_adapter.sql',
  '20261004000300_known_source_interpretations.sql','20261005000100_known_source_workflow_repair.sql',
  '20261007000100_hosted_procurement_workflow.sql','20261013000100_admin_county_triggers.sql'];
export async function adminDatabase() {
  const sql=new PGlite();
  await sql.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean);`);
  await sql.exec(readFileSync('supabase/baselines/20260930_public_procurement.sql','utf8'));
  for(const f of adminMigrations)await sql.exec(readFileSync('supabase/migrations/'+f,'utf8'));
  return sql;
}
// Offline Supabase query protocol adapter over the real disposable SQL engine.
export function sqlApi(sql) {
  const name=value=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw Error('Invalid SQL test identifier');return '"'+value+'"';};
  return {rpc:async(fn,args)=>{try {const keys=Object.keys(args);const r=await sql.query(`select ${name(fn)}(${keys.map((k,i)=>`${name(k)} => $${i+1}`).join(',')}) as data`,Object.values(args));return {data:r.rows[0].data};}catch(error){return {error};}},
    from(table){let columns='*',conditions=[],params=[],orders=[],start=0,end=null,update=null,single=false;
      const q={select(c='*'){columns=c;return q;},eq(k,v){params.push(v);conditions.push(`${name(k)}=$${params.length}`);return q;},
        in(k,values){params.push(values);conditions.push(`${name(k)}=any($${params.length})`);return q;},
        not(k,_op,v){if(v!==null)throw Error('Unsupported test query');conditions.push(`${name(k)} is not null`);return q;},
        gt(k,v){params.push(v);conditions.push(`${name(k)}>$${params.length}`);return q;},
        order(k,{ascending=true}={}){orders.push(`${name(k)} ${ascending?'asc':'desc'}`);return q;},
        range(a,b){start=a;end=b;return q;},update(v){update=v;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},
        async then(resolve){try {
          let statement;
          if(update){const entries=Object.entries(update);const assignments=entries.map(([k,v])=>{params.push(v);return `${name(k)}=$${params.length}`;});statement=`update ${name(table)} set ${assignments.join(',')}`;}
          else statement=`select ${columns==='*'?'*':columns.split(',').map(name).join(',')} from ${name(table)}`;
          if(conditions.length)statement+=' where '+conditions.join(' and ');
          if(update)statement+=' returning *';else {if(orders.length)statement+=' order by '+orders.join(',');if(end!==null)statement+=` limit ${end-start+1} offset ${start}`;}
          const result=await sql.query(statement,params);resolve({data:single?result.rows[0]??null:result.rows});
        }catch(error){resolve({error});}},};return q;}};
}
