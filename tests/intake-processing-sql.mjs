import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { reconciliationSql } from '../scripts/lib/intake-reconcile.mjs';
process.on('uncaughtException',e=>{console.error(e.message,e.detail||'',e.where||'');process.exit(1);});
const root=resolve('outputs/sam-search');
const load=name=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const before=load('intake-before.json'),schema=load('intake-schema.json'),m=load('008_intake_processing_reviewed.json');
schema.constraints.sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')));
const sql=reconciliationSql(m);
const prior=process.env.PROCUREMENT_RESEARCH_DIR;
if(!prior) throw new Error('Set PROCUREMENT_RESEARCH_DIR to the original research workspace.');
const {PGlite}=await import(pathToFileURL(resolve(prior,'work/sql-test/node_modules/@electric-sql/pglite/dist/index.js')));
const db=new PGlite();
const tables=[...new Set(schema.columns.map(c=>c.table))];
const q=s=>'"'+s.replaceAll('"','""')+'"';
for(const table of tables) {
  const columns=schema.columns.filter(c=>c.table===table);
  await db.exec(`create table ${q(table)} (${columns.map(c=>`${q(c.name)} ${c.type}${c.generated?` generated always as (${c.default}) stored`:c.default?` default ${c.default}`:''}${c.required?' not null':''}`).join(',')});`);
  const insert=columns.filter(c=>!c.generated).map(c=>q(c.name)).join(',');
  if(before[table].length) await db.query(`insert into ${q(table)} (${insert}) select ${insert} from jsonb_populate_recordset(null::${q(table)},$1::jsonb)`,[JSON.stringify(before[table])]);
}
// All actual constraints and both lead-write triggers are tested. Request-validation trigger is not needed: this batch never writes search requests.
for(const c of schema.constraints) await db.exec(`alter table ${q(c.table)} add ${c.definition};`);
for(const f of schema.functions) await db.exec(f);
for(const t of schema.triggers.filter(t=>t.includes(' ON public.procurement_leads '))) await db.exec(t);
const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.query(`select to_jsonb(t) as row from ${q(t)} t order by id`)).rows.map(r=>r.row)])));
const original=await snapshot();
await db.exec(sql);
const applied=await snapshot();
assert.equal(applied.procurement_leads.length,324);
assert.equal(applied.procurement_intake_leads.length,78);
assert.equal(applied.procurement_intake_items.filter(i=>i.status==='processed').length,78);
assert.equal(applied.procurement_versions.length,before.procurement_versions.length+77);
assert.equal(applied.procurement_events.length,before.procurement_events.length+77);
assert.equal(applied.procurement_request_leads.length,324);
for(const l of original.procurement_leads) {
  const a=applied.procurement_leads.find(x=>x.id===l.id);
  for(const [k,v] of Object.entries(l)) if(!['payload','search_term_used','updated_at','detected_change_at'].includes(k)) assert.deepEqual(a[k],v,`${l.id}/${k}`);
}
for(const i of original.procurement_intake_items) {
  const a=applied.procurement_intake_items.find(x=>x.id===i.id);
  const scoped=m.decisions.some(d=>d.intake.id===i.id);
  if(!scoped) assert.deepEqual(a,i);
  else for(const [k,v] of Object.entries(i)) if(!['status','updated_at'].includes(k)) assert.deepEqual(a[k],v);
}
await db.exec(sql);assert.deepEqual(await snapshot(),applied,'Replay changes no timestamps or history');
console.log('PASS actual constraints/date parsers/history triggers; 3 inserts, 74 enrichments, 78 links/statuses, protected fields, replay.');

// Tests below run inside disposable transactions and reset back to the original baseline.
async function reset() {
  await db.exec('drop schema public cascade; create schema public;');
  for(const table of tables) {
    const columns=schema.columns.filter(c=>c.table===table);
    await db.exec(`create table ${q(table)} (${columns.map(c=>`${q(c.name)} ${c.type}${c.generated?` generated always as (${c.default}) stored`:c.default?` default ${c.default}`:''}${c.required?' not null':''}`).join(',')});`);
    const insert=columns.filter(c=>!c.generated).map(c=>q(c.name)).join(',');
    if(before[table].length) await db.query(`insert into ${q(table)} (${insert}) select ${insert} from jsonb_populate_recordset(null::${q(table)},$1::jsonb)`,[JSON.stringify(before[table])]);
  }
  for(const c of schema.constraints) await db.exec(`alter table ${q(c.table)} add ${c.definition};`);
  for(const f of schema.functions) await db.exec(f);
  for(const t of schema.triggers.filter(t=>t.includes(' ON public.procurement_leads '))) await db.exec(t);
}
async function rejectsWithoutChange(label,mutate,statement=sql,pattern=/changed|conflict|injected/i) {
  await reset(); await mutate(); const start=await snapshot();
  await assert.rejects(()=>db.exec(statement),pattern);await db.exec('rollback');
  assert.deepEqual(await snapshot(),start,label);console.log(`PASS ${label}`);
}
await rejectsWithoutChange('failure after lead upsert rolls back leads/history/links/statuses',async()=>{},
  sql.replace('-- AFTER_CANONICAL_UPSERT: offline fault-injection point.',()=>"do $$ begin raise exception 'injected failure'; end $$;"));
const d=m.decisions[0],existing=m.records.find(r=>r.expected_payload&&r.identity),fresh=m.records.find(r=>!r.expected_payload);
await rejectsWithoutChange('concurrent intake edit',()=>db.query("update procurement_intake_items set review_reason='Concurrent review' where id=$1",[d.intake.id]));
await rejectsWithoutChange('concurrent canonical evidence edit',()=>db.query("update procurement_leads set payload=payload||'{\"new_fact\":true}'::jsonb where id=$1",[existing.id]));
await rejectsWithoutChange('conflicting intake link',()=>db.query('insert into procurement_intake_leads(intake_id,lead_id) values($1,$2)',[d.intake.id,before.procurement_leads.find(l=>l.id!==d.lead_id).id]));
await rejectsWithoutChange('cross-source contract inserted after preparation',()=>db.query('insert into procurement_leads(source_id,external_id,payload) values($1,$2,$3::jsonb)',[m.sources.usaspending,`CONT_AWD_${fresh.identity}`,JSON.stringify(fresh.payload)]));
await reset();await db.query("update procurement_leads set stage='interested',notes='Concurrent user note',follow_up_on='2026-10-01',estimated_annual_amount=12000 where id=$1",[existing.id]);
await db.exec(sql);const row=(await db.query('select stage,notes,follow_up_on,estimated_annual_amount from procurement_leads where id=$1',[existing.id])).rows[0];
assert.equal(row.stage,'interested');assert.equal(row.notes,'Concurrent user note');assert.equal(Number(row.estimated_annual_amount),12000);console.log('PASS concurrent user sales edits preserved.');
await reset();
// Unchanged payload still processes missing intake relationships, without lead history writes.
const unchanged=structuredClone(m);for(const r of unchanged.records.filter(r=>r.expected_payload)) {r.payload=r.expected_payload;r.search_term_used=r.expected_search_term;}
await db.exec(reconciliationSql(unchanged));
assert.equal((await snapshot()).procurement_intake_leads.length,78);
assert.equal((await snapshot()).procurement_events.length,before.procurement_events.length+3);
console.log('PASS provenance backfill does not depend on a canonical payload delta. Offline only.');
await db.close();
