import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('queue SQL spans API limits, applies filters/counts, preserves order and denies anonymous reads', async () => {
  const db = new PGlite();
  try {
    // Offline policy/SQL regression only; real Auth/JWT verification is separate.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;`);
    for (const path of ['supabase/baselines/20260930_public_procurement.sql','supabase/migrations/20260930000100_authenticated_procurement_reads.sql','supabase/migrations/20260930000200_procurement_queue_pages.sql','supabase/migrations/20261001000100_queue_bounds_and_historical_dates.sql']) {
      await db.exec(readFileSync(path,'utf8'));
    }
    const fixture=JSON.parse(readFileSync('tests/fixtures/research/mapping.json','utf8'));
    const source=fixture.procurement_sources[0];
    await db.query('insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level) values($1,$2,$3,$4,$5,$6)',[source.id,source.code,source.name,source.url,source.business_category,source.contracting_entity_geo_level]);
    await db.query(`insert into procurement_leads(source_id,external_id,payload)
      select $1,'isolated-'||n,$2::jsonb from generate_series(1,1005) n`,[source.id,JSON.stringify(fixture.procurement_leads[1].payload)]);
    await db.exec(`insert into auth.users values ('11111111-1111-4111-a111-111111111111');
      select set_config('request.jwt.claim.sub','11111111-1111-4111-a111-111111111111',false);
      set role authenticated;`);
    const query=async(filters={},offset=0)=>(await db.query('select procurement_queue_page($1::jsonb,50,$2) as page',[JSON.stringify(filters),offset])).rows[0].page;
    const first=await query({query:'SSC',bidType:'award'});
    assert.equal(first.total,1005); assert.equal(first.rows.length,50); assert.equal(first.counts.new,1005);
    assert.equal(first.rows[0].payload.manual_capture,undefined,'List payload excludes full evidence');
    const ids=[];
    for(let offset=0;offset<1005;offset+=50) ids.push(...(await query({query:'SSC',bidType:'award'},offset)).rows.map(row=>row.id));
    assert.equal(ids.length,1005); assert.equal(new Set(ids).size,1005);
    assert.deepEqual((await query({query:'SSC',bidType:'award'})).rows.map(row=>row.id),first.rows.map(row=>row.id));
    assert.equal((await query({query:"'),stage.eq.won"})).total,0,'Search text is data, not a PostgREST expression');
    assert.equal((await query({dateFrom:'2099-01-01'})).total,0);
    assert.equal((await query({changedFrom:'2000-01-01'})).total,1005);
    await db.query('select update_procurement_lead_stage($1,\'interested\',null,null)',[first.rows[0].id]);
    assert.equal((await query({status:'interested'})).total,1,'Non-member stage update succeeds');
    const page=await query({status:'new'},1000);
    assert.equal(page.total,1004); assert.equal(page.rows.length,4);
    await assert.rejects(()=>db.query("select procurement_queue_page('{}',null,0)"),/Invalid page bounds/);
    await assert.rejects(()=>db.query("select procurement_queue_page('{}',50,null)"),/Invalid page bounds/);
    await db.exec('reset role;');
    await db.query('insert into procurement_leads(source_id,external_id,payload) values($1,$2,$3)',[source.id,'historical-date',JSON.stringify(fixture.procurement_leads[0].payload)]);
    await db.exec('set role authenticated;');
    assert.equal((await query({query:'710-25-028',dateFrom:'2024-12-06',dateTo:'2024-12-06'})).total,1,'Historical publication dates remain filterable without becoming opportunities');
    await db.exec('reset role; set role anon;');
    await assert.rejects(()=>db.query('select * from procurement_leads'),/permission denied/);
    await assert.rejects(()=>db.query('select procurement_queue_page()'),/permission denied/);
  } finally { await db.close(); }
});
