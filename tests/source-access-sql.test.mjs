import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { emptyAccess, transitionAccess, accessHash } from '../scripts/lib/source-access.mjs';

const source='00000000-0000-4000-8000-000000000001',handoff='00000000-0000-4000-8000-000000000002',registration='00000000-0000-4000-8000-000000000003';
const setup=`create role anon;create role authenticated;create role service_role;
create table procurement_sources(id uuid primary key);
create table procurement_registrations(id uuid primary key,login_state text default 'unknown',email_verification_state text default 'unknown',api_state text default 'unknown',updated_at timestamptz default now());
insert into procurement_sources values('${source}');insert into procurement_registrations(id)values('${registration}');`;
const handoffMigration=readFileSync('supabase/migrations/20261005000700_public_source_access_handoffs.sql','utf8');
const lifecycleMigration=readFileSync('supabase/migrations/20261006000100_source_access_lifecycle.sql','utf8');
const event={id:'verified-login',type:'stage',stage:'sign_in',state:'verified',at:'2026-10-06T00:00:00Z',verified_until:'2027-01-01T00:00:00Z',
  provenance:'observed',actor:'researcher',next_action:'Verify category document access',evidence:[{url:'https://portal.example.gov',note:'Observed signed-in account state'}]};
async function fixture(){const db=new PGlite();await db.exec(setup);await db.exec(handoffMigration);await db.exec(lifecycleMigration);
  await db.query(`insert into procurement_access_handoffs(id,source_id,registration_id,channel,tenant,checked_on,access_state,next_actor,next_action)values($1,$2,$3,'portal','portal.example.gov','2026-10-06','account_required','user','Sign in')`,[handoff,source,registration]);return db;}
async function current(db){return (await db.query('select * from procurement_access_handoffs')).rows[0];}
async function save(db,h,e){const next=transitionAccess(h,e,new Date('2026-10-06T12:00:00Z')).lifecycle;
  return (await db.query('select record_procurement_access_event($1,$2,$3,$4,$5,$6::jsonb) as receipt',[h.id,h.lifecycle_revision,h.updated_at,e.id,accessHash(e),JSON.stringify(next)])).rows[0].receipt;}
test('private lifecycle transition is atomic, replay-safe, concurrent-safe and channel-specific',async()=>{
  const db=await fixture();try {
    const original=await current(db);const receipt=await save(db,original,event);assert.equal(receipt.revision,1);
    const summary=(await db.query('select * from procurement_registrations')).rows[0];assert.equal(summary.login_state,'verified');assert.equal(summary.api_state,'unknown');
    assert.equal((await save(db,original,event)).status,'unchanged');
    await assert.rejects(()=>save(db,original,{...event,id:'concurrent'}),/changed/);
    const changed={...event,next_action:'Different action'};
    await assert.rejects(()=>db.query('select record_procurement_access_event($1,$2,$3,$4,$5,$6::jsonb)',[handoff,0,original.updated_at,event.id,accessHash(changed),JSON.stringify(emptyAccess())]),/identity conflict/);
    const fresh=await current(db);await db.query("update procurement_access_handoffs set details='{"+'"research":"changed"'+"}'::jsonb,updated_at=clock_timestamp() where id=$1",[handoff]);
    await assert.rejects(()=>save(db,fresh,{...event,id:'after-research'}),/changed/);
    assert.equal((await current(db)).lifecycle_revision,1);
  }finally{await db.close();}
});
test('database grants deny browser roles and preserve history rather than replace it',async()=>{
  const db=await fixture();try {
    await save(db,await current(db),event);
    const fresh=await current(db),next=transitionAccess(fresh,{...event,id:'second'},new Date('2026-10-06T12:00:00Z')).lifecycle;
    next.events.shift();
    await assert.rejects(()=>db.query('select record_procurement_access_event($1,$2,$3,$4,$5,$6::jsonb)',[handoff,fresh.lifecycle_revision,fresh.updated_at,'second',accessHash({...event,id:'second'}),JSON.stringify(next)]),/Invalid access event append/);
    const grants=await db.query(`select has_table_privilege('anon','procurement_access_handoffs','select') as anon_read,
      has_table_privilege('authenticated','procurement_access_handoffs','select') as browser_read,
      has_function_privilege('authenticated','record_procurement_access_event(uuid,integer,timestamptz,text,text,jsonb)','execute') as browser_write,
      has_function_privilege('service_role','record_procurement_access_event(uuid,integer,timestamptz,text,text,jsonb)','execute') as server_write`);
    assert.deepEqual(grants.rows[0],{anon_read:false,browser_read:false,browser_write:false,server_write:true});
  }finally{await db.close();}
});
