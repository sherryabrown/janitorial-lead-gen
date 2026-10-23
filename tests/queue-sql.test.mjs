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
    await db.exec(readFileSync('supabase/migrations/20261020000100_forecast_quarter_queue.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20261023000100_canonical_county_lead_reads.sql','utf8'));
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
    assert.equal((await query({query:'710-25-028',bidType:'opportunity'})).total,0,'Historical records never become opportunities');
    await db.exec('reset role;');
    for (const [name, deadline] of [['Alpha','2026-09-17T12:00:00Z'],['Bravo','2026-09-17T12:00:00Z'],['Later','2026-09-18T12:00:00Z']]) {
      await db.query('insert into procurement_leads(source_id,external_id,payload) values($1,$2,$3)',[source.id,`queue-regression-${name}`,JSON.stringify({...fixture.procurement_leads[1].payload,title:`Queue regression ${name}`,bid_type:'opportunity',published_date:'2026-09-01',deadline})]);
    }
    await db.exec('set role authenticated;');
    const today=await query({query:'Queue regression',dateFrom:'2026-09-17',dateTo:'2026-09-17',timezone:'America/Chicago'});
    assert.deepEqual(today.rows.map(row=>row.title),['Queue regression Alpha','Queue regression Bravo'],'Deadline takes priority over publication, with stable title tie-breaker');
    await db.query("select update_procurement_lead_stage($1,'won',null,null)",[today.rows[0].id]);
    assert.equal((await query({query:'Queue regression',status:'open'})).total,2,'Open excludes won');
    assert.equal((await query({query:'Queue regression',status:'closed',closedSubcategory:'won'})).total,1);
    assert.equal((await query({query:'Queue regression',dateFrom:'2026-09-18',dateTo:'2026-09-17'})).total,0,'Reversed bounds return no matches');
    await db.exec('reset role;');
    for(const [id,period,published] of [['quarter','Q4 2026',null],['invalid-quarter','Q5 2026',null],['exact','Q4 2026','2026-09-01']]) {
      await db.query('insert into procurement_leads(source_id,external_id,payload) values($1,$2,$3)',[source.id,id,JSON.stringify({source_url:'https://agency.example/forecast.pdf',business_category:"other_public",work_performance_locations:[],title:`Quarter regression ${id}`,bid_type:'forecast',planned_advertisement_period:period,...(published?{published_date:published}:{})})]);
    }
    await db.exec('set role authenticated;');
    const quarter=await query({query:'Quarter regression',bidType:'forecast',dateFrom:'2026-11-15',dateTo:'2026-11-15'});
    assert.equal(quarter.total,1,'An interior day overlaps the estimated release quarter');
    assert.equal(quarter.rows[0].planned_advertisement_period,'Q4 2026');
    assert.equal(quarter.rows[0].response_deadline,null,'Quarter boundaries never become deadlines');
    assert.equal((await query({query:'Quarter regression',dateFrom:'2027-01-01',dateTo:'2027-01-31'})).total,0);
    assert.equal((await query({query:'Quarter regression exact',dateFrom:'2026-09-01',dateTo:'2026-09-01'})).total,1,'Existing exact primary-date behavior stays unchanged');
    await db.exec('reset role;');
    const retire=(await db.query("select id from procurement_leads where external_id='isolated-1'")).rows[0].id;
    await db.query("update procurement_leads set payload=payload||jsonb_build_object('canonical_redirect',jsonb_build_object('policy','county-ionwave-solicitation-v1','lead_id',$1::text)) where id=$2",[first.rows[0].id,retire]);
    await db.exec('set role authenticated;');assert.equal((await query({query:'SSC',bidType:'award'})).total,1004,'Only the retired duplicate disappears from queue totals and paging');
    await db.exec('reset role; set role anon;');
    await assert.rejects(()=>db.query('select * from procurement_leads'),/permission denied/);
    await assert.rejects(()=>db.query('select procurement_queue_page()'),/permission denied/);
  } finally { await db.close(); }
});
