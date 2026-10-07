import {readFile} from 'node:fs/promises';
import {contract} from './native-rehearsal-contract.mjs';
import {hash} from './reviewed-batch.mjs';
import {same} from './sam-normalize.mjs';
import {verifyBatch} from './batch-verification.mjs';
import {reconciliationSql} from './intake-reconcile.mjs';
import {linkRepairSql,verifyLinkRepair} from './api-link-repair.mjs';
const generatedSql=(m,options)=>m.kind==='api-link-repair'?linkRepairSql(m,options):reconciliationSql(m,options);

export const rehearsalPolicy=contract.version;
export const rehearsalTables=['procurement_sources','procurement_leads','procurement_intake_items','procurement_intake_leads',
  'procurement_request_leads','procurement_search_requests','procurement_versions','procurement_events',
  'procurement_geographies','procurement_source_capabilities','procurement_request_sources'];
const functions=['procurement_lead_changed','procurement_sync_lead_columns','procurement_parse_date',
  'procurement_parse_deadline','validate_procurement_search_request'];
const norm=s=>s.replace(/\r/g,'').trim();
const digest=s=>hash(norm(s));
const quote=s=>{if(!/^[a-z][a-z0-9_]*$/.test(s))throw new Error('Unsupported rehearsal identifier');return `"${s}"`;};
const table=t=>`procurement_test.${quote(t)}`;
function approved(value,kind) {
  if(!contract[kind].includes(digest(value)))throw new Error(`Unsupported rehearsal ${kind}; review schema parity before proceeding`);
}
// Mapping is limited to definitions whose entire content was reviewed and hashed.
// This is not a general SQL rewriter: changed/unknown definitions never reach it.
function mappedFunction(definition) {
  approved(definition,'functions');
  return definition.replace(/public\.([a-z_]+)/g,(_match,name)=>{
    if(![...functions,...rehearsalTables].includes(name))throw new Error('Unsupported function dependency');
    return `procurement_test.${name}`;
  });
}
export function rehearsalBlueprint(before,schema,manifest) {
  const bytes=Buffer.byteLength(JSON.stringify({before,schema,manifest}));
  const count=rehearsalTables.reduce((n,t)=>n+(before[t]?.length??0),0);
  if(bytes>10*1024*1024||count>10000)throw new Error('Rehearsal snapshot exceeds 10 MB/10000 row bound');
  const tables=[...new Set(schema.columns.map(c=>c.table))];
  if(!tables.length||tables.some(t=>!rehearsalTables.includes(t)))throw new Error('Unsupported rehearsal tables');
  const ddl=[];
  for(const t of tables) {
    const columns=schema.columns.filter(c=>c.table===t);
    ddl.push(`create table ${table(t)} (${columns.map(c=>{
      if(!contract.types.includes(c.type))throw new Error('Unsupported rehearsal column type');
      if(c.default)approved(c.default,'defaults');
      if(c.generated&&!c.default)throw new Error('Missing generated expression');
      return `${quote(c.name)} ${c.type}${c.generated?` generated always as (${c.default}) stored`:c.default?` default ${c.default}`:''}${c.required?' not null':''}`;
    }).join(',')})`);
  }
  const constraints=[...schema.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')));
  for(const c of constraints) {
    if(!tables.includes(c.table))throw new Error('Unknown constraint table');
    approved(`${c.table}\n${c.definition}`,'constraints');
    const definition=c.definition.replace(/REFERENCES (?:public\.)?([a-z_]+)(?=\()/g,(_m,name)=>{
      if(!tables.includes(name))throw new Error('Missing FK target');return `REFERENCES ${table(name)}`;
    }).replace('REFERENCES auth.users(', 'REFERENCES procurement_test.actor_identities(');
    ddl.push(`alter table ${table(c.table)} add ${definition}`);
  }
  const functionNames=schema.functions.map(f=>/^CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/.exec(f)?.[1]);
  if(functionNames.some(n=>!functions.includes(n))||new Set(functionNames).size!==functionNames.length||
    functions.slice(0,4).some(n=>!functionNames.includes(n)))throw new Error('Required rehearsal functions missing or ambiguous');
  const functionDdl=schema.functions.map(mappedFunction);
  const triggerDdl=[];
  for(const t of schema.triggers) {
    approved(t,'triggers');
    const name=/EXECUTE FUNCTION (?:public\.)?([a-z_]+)\(/.exec(t)?.[1];
    // Older offline fixtures lack the non-mutated request validation function.
    if(name==='validate_procurement_search_request'&&!functionNames.includes(name))continue;
    if(!functionNames.includes(name))throw new Error('Missing trigger function');
    triggerDdl.push(t.replace(/ON public\.([a-z_]+)/,(_m,n)=>{
      if(!tables.includes(n))throw new Error('Missing trigger table');return `ON ${table(n)}`;
    }).replace(/EXECUTE FUNCTION (?:public\.)?([a-z_]+)\(/,(_m,n)=>`EXECUTE FUNCTION procurement_test.${n}(`));
  }
  for(const required of ['procurement_lead_changed','procurement_sync_lead_columns'])
    if(!schema.triggers.some(t=>t.includes(`EXECUTE FUNCTION ${required}(`)||t.includes(`EXECUTE FUNCTION public.${required}(`)))
      throw new Error('Required lead trigger missing');
  return {tables,tableDdl:ddl.slice(0,tables.length),constraintDdl:ddl.slice(tables.length),functionDdl,triggerDdl,
    sql:generatedSql(manifest,{schema:'procurement_test',transaction:false}),copied_rows:count,copied_bytes:bytes};
}
const objects=`select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='procurement_test')+
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='procurement_test')+
 (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='procurement_test') as count`;

export function nativeRehearsal(pool) {
  return async ({before,schema,manifest,sql})=>{
    if(sql!==generatedSql(manifest))throw new Error('Production rehearsal SQL mismatch');
    const b=rehearsalBlueprint(before,schema,manifest),started=Date.now();
    let peakRss=process.memoryUsage().rss,peakContainer=0,released=false,client;
    const sample=async()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);
      try{peakContainer=Math.max(peakContainer,Number(await readFile('/sys/fs/cgroup/memory.current','utf8')));}catch{/* Local tests lack cgroups. */}};
    const monitor=setInterval(()=>sample().catch(()=>{}),100);
    let timer;
    try {
      client=await pool.connect();
      timer=setTimeout(()=>{released=true;client.release(true);},120000);
      const identity=(await client.query('select current_user as role, current_database() as database, version() as version')).rows[0];
      if(identity.role!=='procurement_rehearsal_backend'||identity.database!=='postgres')throw new Error('Isolated validator identity required');
      await client.query('begin');
      await client.query('alter default privileges in schema procurement_test revoke execute on functions from public');
      await client.query('alter default privileges in schema procurement_test revoke all on tables from public');
      await client.query("set local lock_timeout='5s'; set local statement_timeout='90s'; set local idle_in_transaction_session_timeout='90s'; set local search_path=procurement_test,pg_catalog,pg_temp");
      // Transaction lock automatically releases on rollback/disconnect; unrelated imports use their own role.
      await client.query('select pg_advisory_xact_lock(187643,2)');
      if(Number((await client.query(objects)).rows[0].count)!==0)throw new Error('Unexpected persistent rehearsal objects; operator reconciliation required');
      await client.query('create table procurement_test.actor_identities(id uuid primary key)');
      for(const id of new Set((before.procurement_search_requests??[]).map(r=>r.initiated_by).filter(Boolean)))
        await client.query('insert into procurement_test.actor_identities values($1) on conflict do nothing',[id]);
      for(const ddl of b.tableDdl)await client.query(ddl);
      for(const t of b.tables) {
        const fields=schema.columns.filter(c=>c.table===t&&!c.generated).map(c=>quote(c.name)).join(',');
        if(before[t]?.length)await client.query(`insert into ${table(t)} (${fields}) select ${fields} from jsonb_populate_recordset(null::${table(t)},$1::jsonb)`,[JSON.stringify(before[t])]);
      }
      for(const ddl of [...b.constraintDdl,...b.functionDdl,...b.triggerDdl])await client.query(ddl);
      const snapshot=async()=>{
        const data={project_ref:manifest.project_ref};
        for(const t of b.tables)data[t]=(await client.query(`select to_jsonb(t) as row from ${table(t)} t order by id`)).rows.map(r=>r.row);
        return data;
      };
      const initial=await snapshot();
      await client.query('savepoint fault_check');
      let injected=false;
      try{await client.query(b.sql.replace('-- AFTER_CANONICAL_UPSERT: offline fault-injection point.',()=>"do $$ begin raise exception 'native injected failure'; end $$;"));}
      catch(error){if(error.message!=='native injected failure')throw error;injected=true;}
      await client.query('rollback to savepoint fault_check');
      if(!injected||!same(initial,await snapshot()))throw new Error('Native rollback test failed');
      await client.query(b.sql);
      const after=await snapshot(),verification=manifest.kind==='api-link-repair'?verifyLinkRepair(initial,after,manifest):verifyBatch(initial,after,manifest);
      if(!verification.verified)throw new Error(`Native readback did not verify: ${verification.errors.join('; ')}`);
      // Temporary generator tables live until outer rollback, so remove only those fixed names before replay.
      await client.query(manifest.kind==='api-link-repair'?
        'drop table pg_temp.link_repair_manifest,pg_temp.link_repair_delta,pg_temp.link_repair_changed':
        'drop table pg_temp.reconciliation_manifest,pg_temp.lead_delta,pg_temp.intake_delta,pg_temp.canonical_columns_before');
      await client.query(b.sql);
      if(!same(after,await snapshot()))throw new Error('Native replay changed records or history');
      await client.query('rollback');
      if(Number((await client.query(objects)).rows[0].count)!==0)throw new Error('Rehearsal cleanup did not verify');
      await sample();
      return {status:'native_tests_passed',policy:rehearsalPolicy,rollback:true,readback:true,replay:true,cleanup:true,
        rehearsal_sql_sha256:hash(b.sql),postgres_version:identity.version,
        resources:{elapsed_ms:Date.now()-started,copied_rows:b.copied_rows,copied_bytes:b.copied_bytes,peak_process_bytes:peakRss,peak_container_bytes:peakContainer||null},
        limitations:'Snapshot rehearsal is isolated; live production baseline locks, permission checks and readback remain required.'};
    }catch(error){const safe=new Error('Native SQL rehearsal failed; no production import was sent');safe.privateDiagnostic={code:error.code??null,message:String(error.message).slice(0,500)};throw safe;}
    finally {clearInterval(monitor);clearTimeout(timer);
      if(client&&!released){await client.query('rollback').catch(()=>{});client.release(true);}
    }
  };
}
