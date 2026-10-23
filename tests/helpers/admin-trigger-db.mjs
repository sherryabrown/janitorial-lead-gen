import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const adminMigrations=[
  '20261002000100_arkansas_municipality_routing.sql','20261002000200_known_source_execution.sql',
  '20261002000300_public_source_checks.sql','20261002000400_reconcile_known_gaps.sql',
  '20261004000100_source_gap_accountability.sql','20261004000200_ardot_known_adapter.sql',
  '20261004000300_known_source_interpretations.sql','20261005000100_known_source_workflow_repair.sql',
  '20261007000100_hosted_procurement_workflow.sql','20261013000100_admin_county_triggers.sql','20261013000200_procurement_schedules.sql','20261013000300_procurement_scheduler_dispatch.sql','20261019000100_admin_sam_triggers.sql','20261019000200_verified_shared_source_routes.sql','20261019000300_county_public_read_reconciliation.sql','20261020000200_schedule_overview.sql','20261020000300_schedule_management_revision.sql','20261020000400_schedule_work_and_state_groups.sql','20261022000100_schedule_change_audit.sql'];
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
  const column=value=>{
    const json=value.match(/^([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)(->>?)([a-z_][a-z0-9_]*)$/);
    return json?`${name(json[2])}${json[3]}'${json[4]}' as ${name(json[1])}`:name(value);
  };
  return {rpc:async(fn,args)=>{try {const keys=Object.keys(args);const r=await sql.query(`select ${name(fn)}(${keys.map((k,i)=>`${name(k)} => $${i+1}`).join(',')}) as data`,Object.values(args));return {data:r.rows[0].data};}catch(error){return {error};}},
    from(table){let columns='*',conditions=[],params=[],orders=[],start=0,end=null,update=null,single=false,count=false;
      const q={select(c='*',options={}){columns=c;count=options.count==='exact';return q;},eq(k,v){params.push(v);conditions.push(`${name(k)}=$${params.length}`);return q;},
        is(k,v){if(v!==null)throw Error('Unsupported test query');conditions.push(`${name(k)} is null`);return q;},
        ilike(k,v){params.push(v);conditions.push(`${name(k)} ilike $${params.length}`);return q;},
        contains(k,v){params.push(JSON.stringify(v));conditions.push(`${name(k)} @> $${params.length}::jsonb`);return q;},
        in(k,values){params.push(values);conditions.push(`${name(k)}=any($${params.length})`);return q;},
        not(k,_op,v){if(v!==null)throw Error('Unsupported test query');conditions.push(`${name(k)} is not null`);return q;},
        lte(k,v){params.push(v);conditions.push(`${name(k)}<=$${params.length}`);return q;},
        gte(k,v){params.push(v);conditions.push(`${name(k)}>=$${params.length}`);return q;},
        lt(k,v){params.push(v);conditions.push(`${name(k)}<$${params.length}`);return q;},
        gt(k,v){params.push(v);conditions.push(`${name(k)}>$${params.length}`);return q;},
        order(k,{ascending=true,nullsFirst}={}){orders.push(`${name(k)} ${ascending?'asc':'desc'}${nullsFirst===false?' nulls last':''}`);return q;},
        range(a,b){start=a;end=b;return q;},update(v){update=v;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},
        async then(resolve){try {
          let statement;
          if(update){const entries=Object.entries(update);const assignments=entries.map(([k,v])=>{params.push(v);return `${name(k)}=$${params.length}`;});statement=`update ${name(table)} set ${assignments.join(',')}`;}
          else statement=`select ${columns==='*'?'*':columns.split(',').map(column).join(',')} from ${name(table)}`;
          if(conditions.length)statement+=' where '+conditions.join(' and ');
          if(update)statement+=' returning *';else {if(orders.length)statement+=' order by '+orders.join(',');if(end!==null)statement+=` limit ${end-start+1} offset ${start}`;}
          const result=await sql.query(statement,params);
          const total=count?(await sql.query(`select count(*)::integer as n from ${name(table)}${conditions.length?' where '+conditions.join(' and '):''}`,params)).rows[0].n:undefined;
          resolve({data:single?result.rows[0]??null:result.rows,...(count?{count:total}:{})});
        }catch(error){resolve({error});}},};return q;}};
}
