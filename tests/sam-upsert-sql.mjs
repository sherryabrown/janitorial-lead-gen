import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Offline PostgreSQL validation using captured REAL baseline, not a live database write.
import { PGlite } from '@electric-sql/pglite';
const root=fileURLToPath(new URL('./fixtures/sam/',import.meta.url));
const baseline=JSON.parse(readFileSync(resolve(root,'live-baseline.json'),'utf8'));
const delta=JSON.parse(readFileSync(resolve(root,'upsert-records.json'),'utf8')).records;
const sql=readFileSync(resolve(root,'007_incremental_sam_capture_2026_09_16.sql'),'utf8');
const db=new PGlite();
await db.exec(`create table procurement_leads (
 id uuid primary key default gen_random_uuid(),source_id uuid not null,external_id text not null,payload jsonb not null,
 search_term_used text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 detected_change_at timestamptz not null default now(),stage text default 'new',stage_reason text,notes text,
 owner_id uuid,follow_up_on date,estimated_annual_amount numeric,created_by uuid,updated_by uuid,
 unique(source_id,external_id));
 create table procurement_request_leads(search_request_id uuid,lead_id uuid references procurement_leads(id),match_status text,match_reason text,unique(search_request_id,lead_id));`);
await db.query(`insert into procurement_leads(id,source_id,external_id,payload,search_term_used,created_at)
select id,source_id,external_id,payload,search_term_used,created_at from jsonb_to_recordset($1::jsonb)
as x(id uuid,source_id uuid,external_id text,payload jsonb,search_term_used text,created_at timestamptz)`,[JSON.stringify(baseline)]);
await db.exec(`update procurement_leads set stage='interested',stage_reason='keep',notes='Preserve sales note',follow_up_on='2026-10-01',estimated_annual_amount=12000;`);
const snapshot=async()=> (await db.query('select * from procurement_leads order by id')).rows;
const before=await snapshot();
await db.exec(sql);
const after=await snapshot();
assert.equal(after.length,before.length+delta.filter(x=>!x.expected_payload).length);
for(const b of before) {
 const a=after.find(x=>x.id===b.id); assert.ok(a);
 for(const k of ['source_id','external_id','created_at','stage','stage_reason','notes','owner_id','follow_up_on','estimated_annual_amount','created_by','updated_by']) assert.deepEqual(a[k],b[k],k);
}
await db.exec(sql); assert.deepEqual(await snapshot(),after,'Replay must be a no-op');
const existing=delta.find(x=>x.expected_payload);
await db.query("update procurement_leads set payload=payload || '{\"new_source_fact\":true}'::jsonb where id=$1",[existing.id]);
const divergent=await snapshot();
await assert.rejects(()=>db.exec(sql),/differs from captured baseline/);
await db.exec('rollback'); assert.deepEqual(await snapshot(),divergent);
console.log(`PASS: real baseline ${before.length}; ${delta.length} proposed upserts; sales fields preserved; replay no-op; concurrent source changes rejected. Offline only.`);
await db.close();
