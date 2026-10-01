import { same } from './sam-normalize.mjs';
import { verifyBatch } from './batch-verification.mjs';

export async function testBatchSql(PGlite,before,schema,manifest,sql,{verify=verifyBatch}={}) {
  const db=new PGlite(),tables=[...new Set(schema.columns.map(c=>c.table))];
  const quote=s=>'"'+s.replaceAll('"','""')+'"';
  const constraints=[...schema.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')));
  const snapshot=async()=>({project_ref:manifest.project_ref,...Object.fromEntries(await Promise.all(tables.map(async t=>[t,
    (await db.query(`select to_jsonb(t) as row from ${quote(t)} t order by id`)).rows.map(r=>r.row)])))});
  try {
    for(const table of tables) {
      const cols=schema.columns.filter(c=>c.table===table);
      await db.exec(`create table ${quote(table)} (${cols.map(c=>`${quote(c.name)} ${c.type}${c.generated?` generated always as (${c.default}) stored`:c.default?` default ${c.default}`:''}${c.required?' not null':''}`).join(',')});`);
      const fields=cols.filter(c=>!c.generated).map(c=>quote(c.name)).join(',');
      if(before[table]?.length) await db.query(`insert into ${quote(table)} (${fields}) select ${fields} from jsonb_populate_recordset(null::${quote(table)},$1::jsonb)`,[JSON.stringify(before[table])]);
    }
    for(const c of constraints) await db.exec(`alter table ${quote(c.table)} add ${c.definition};`);
    for(const f of schema.functions) await db.exec(f);
    const mutated=manifest.kind==='registry'||manifest.kind==='manual'
      ? [...new Set(manifest.rows.map(row=>row.table))]
      : ['procurement_leads','procurement_intake_items','procurement_intake_leads','procurement_request_leads'];
    for(const t of schema.triggers.filter(t=>mutated.some(table=>t.includes(`ON public.${table} `)))) await db.exec(t);
    const initial=await snapshot();
    let rejected=false;
    try {await db.exec(sql.replace('-- AFTER_CANONICAL_UPSERT: offline fault-injection point.',()=>"do $$ begin raise exception 'offline injected failure'; end $$;"));}
    catch(e) {if(!e.message.includes('offline injected failure')) throw e;rejected=true;await db.exec('rollback');}
    if(!rejected||!same(initial,await snapshot())) throw new Error('Atomic rollback test failed');
    await db.exec(sql);const after=await snapshot(),verification=verify(initial,after,manifest);
    if(!verification.verified) throw new Error(verification.errors.join('\n'));
    await db.exec(sql);if(!same(after,await snapshot())) throw new Error('Replay changed records, timestamps or history');
    return {status:'offline_tests_passed',rollback:true,readback:true,replay:true,
      limitations:'Local engine exercises captured columns/constraints and lead-write triggers, not production authentication, network behavior, or simultaneous sessions.'};
  } finally {await db.close();}
}
