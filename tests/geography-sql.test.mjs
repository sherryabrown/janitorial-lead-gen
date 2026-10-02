import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { persistenceSql } from '../scripts/lib/research-persistence.mjs';

const migration = readFileSync('supabase/migrations/20261002000100_arkansas_municipality_routing.sql', 'utf8');
const setup = `
create role anon; create role authenticated; create role service_role;
create table public.procurement_geographies (id text primary key, kind text not null,
  name text not null, state_code text not null default 'AR', incorporated boolean not null default false,
  dataset_url text not null, dataset_version text not null, dataset_hash text not null,
  imported_at timestamptz not null default now(),
  constraint procurement_geographies_check check
    ((kind='state' and id='05') or (kind='county' and id ~ '^05[0-9]{3}$')
      or (kind='place' and id ~ '^05[0-9]{5}$')),
  constraint procurement_geographies_kind_check check (kind in ('state','county','place')));
create table public.procurement_place_counties (place_id text references public.procurement_geographies(id),
  county_id text references public.procurement_geographies(id), primary key(place_id,county_id),
  constraint procurement_place_counties_check check
    (place_id ~ '^05[0-9]{5}$' and county_id ~ '^05[0-9]{3}$'));
create table public.procurement_source_capabilities (id uuid primary key default gen_random_uuid(),
  source_id uuid not null, kind text not null, method text not null, endpoint_url text not null,
  official_entry_url text not null, agency_geography_id text references public.procurement_geographies(id),
  availability text not null default 'unknown', verified_at timestamptz, verified_until timestamptz,
  verification_evidence jsonb, parser_version text);
create table public.procurement_sources (id uuid primary key, code text not null, name text not null);
create table public.procurement_intake_items (id uuid primary key);
create table public.procurement_search_requests (id uuid primary key default gen_random_uuid(),
  name text not null, search_boundary_mode text not null, requested_search_areas jsonb not null,
  contracting_entity_geo_levels text[] not null default '{}', service_scope jsonb not null default '{}',
  search_windows jsonb not null default '{}', scope_resolution_state text not null default 'legacy');
create table public.procurement_request_targets (id uuid primary key default gen_random_uuid(),
  search_request_id uuid not null references public.procurement_search_requests(id),
  target_key text not null, geography_id text references public.procurement_geographies(id),
  original_inputs jsonb not null default '[]', checkpoint jsonb not null default '{}',
  unique(search_request_id,target_key));
create table public.procurement_request_sources (id uuid primary key,
  search_request_id uuid not null references public.procurement_search_requests(id),
  source_id uuid not null references public.procurement_sources(id),
  discovery_reason text not null, unique(search_request_id,source_id));
insert into public.procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values
  ('05','state','Arkansas','census','v1','existing'),
  ('05001','county','Arkansas County','census','v1','existing'),
  ('05003','county','Ashley County','census','v1','existing'),
  ('0500190','place','Bentonville city','census','v1','existing'),
  ('0500250','place','Biggers town','census','v1','existing'),
  ('0500580','place','Example CDP','census','v1','existing');
insert into public.procurement_place_counties values ('0500190','05001');
`;

test('migration excludes legacy places and imports reviewed GIS municipalities', async () => {
  const db = new PGlite();
  try {
    await db.exec(setup);
    await db.exec(migration);
    await db.exec('set role anon');
    await assert.rejects(db.query(`select public.sync_procurement_municipalities('[]',0,'v1')`),/permission denied/);
    await db.exec('reset role');
    const geo = (await db.query(`select id,kind,name,source_label,place_type,dataset_url from public.procurement_geographies order by id`)).rows;
    assert.equal(geo.filter(x => x.kind === 'municipality').length, 0);
    assert.deepEqual(geo.find(x => x.id === '0500190'),
      { id:'0500190', kind:'place', name:'Bentonville', source_label:'Bentonville city',
        place_type:'city', dataset_url:'census' });
    assert.equal(geo.find(x=>x.id==='0500250').name,'Biggers');
    assert.equal(geo.find(x=>x.id==='0500250').place_type,'town');
    assert.equal(geo.find(x=>x.id==='0500580').name,'Example');
    assert.equal(geo.find(x=>x.id==='0500580').place_type,'cdp');
    assert.equal((await db.query(`select count(*)::integer n from public.procurement_geographies
      where kind='place' and source_active`)).rows[0].n, 0);
    const entries=[
      {id:'ARMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'Shared City',classification:'First Class',
        county_ids:['05001','05003'],dataset_hash:'a'},
      {id:'ARMcccccccccccccccccccccccccccccccc',name:'Almyra',classification:'Incorporated',
        county_ids:['05001'],dataset_hash:'c'},
    ];
    const sync=`select public.sync_procurement_municipalities($1,$2,$3) n`;
    await assert.rejects(db.query(sync,[entries,3,'2026-10-02']),/Complete GIS municipality manifest/);
    await assert.rejects(db.query(sync,[[{...entries[0],county_ids:['05999']}],1,'2026-10-02']),/Unknown county/);
    assert.equal((await db.query(sync,[entries,2,'2026-10-02'])).rows[0].n,2);
    assert.equal((await db.query(`select count(*)::integer n from public.procurement_place_counties`)).rows[0].n, 4);
    assert.equal((await db.query(`select count(*)::integer n from public.procurement_geographies
      where to_jsonb(procurement_geographies) ? 'zip'`)).rows[0].n, 0);
    const ids=(await db.query(`select id,name from public.procurement_geographies where kind='municipality' order by id`)).rows;
    const almyra=ids.find(x=>x.name==='Almyra').id;
    const shared=ids.find(x=>x.name==='Shared City').id;
    const args=['County request','05001',[almyra],new Date().toISOString(),
      {service:'janitorial'},{from:'2026-10-01'}];
    const call=`select public.create_procurement_geography_request($1,$2,$3,$4,$5,$6) id`;
    const created=(await db.query(call,args)).rows[0].id;
    const targets=(await db.query(`select geography_id from public.procurement_request_targets
      where search_request_id=$1 order by (checkpoint->>'route_order')::int`,[created])).rows;
    assert.deepEqual(targets.map(x=>x.geography_id),[almyra,'05001','05']);
    const request=(await db.query(`select selected_city_ids,request_origin from public.procurement_search_requests where id=$1`,[created])).rows[0];
    assert.deepEqual(request.selected_city_ids,[almyra]);
    assert.equal(request.request_origin,'chat');
    await assert.rejects(db.query(call,['Unconfirmed','05001',[],null,args[4],args[5]]),/confirmation/);
    const sharedCounties=(await db.query(`select county_id from public.procurement_place_counties
      where place_id=$1 order by county_id`,[shared])).rows.map(x=>x.county_id);
    assert.deepEqual(sharedCounties,['05001','05003']);
    await assert.rejects(db.query(call,['Wrong city','05003',[almyra],new Date().toISOString(),args[4],args[5]]),/does not belong/);
    await assert.rejects(db.query(call,['Ambiguous city',shared,[],null,args[4],args[5]]),/County choice required/);
    const crossCall=`select public.create_procurement_geography_request($1,$2,$3,$4,$5,$6,$7) id`;
    const crossId=(await db.query(crossCall,['Cross-county city',shared,[],null,args[4],args[5],'05003'])).rows[0].id;
    assert.deepEqual((await db.query(`select geography_id from public.procurement_request_targets
      where search_request_id=$1 order by (checkpoint->>'route_order')::int`,[crossId])).rows.map(x=>x.geography_id),
      [shared,'05003','05']);
    assert.equal((await db.query(`select count(*)::integer n from public.procurement_search_requests`)).rows[0].n,2);
    const cityCreated=(await db.query(call,['City request',almyra,[],null,args[4],args[5]])).rows[0].id;
    const cityTargets=(await db.query(`select geography_id from public.procurement_request_targets
      where search_request_id=$1 order by (checkpoint->>'route_order')::int`,[cityCreated])).rows;
    assert.deepEqual(cityTargets.map(x=>x.geography_id),[almyra,'05001','05']);
    await assert.rejects(db.query(call,['Legacy place','0500190',[],null,args[4],args[5]]),/GIS municipality required/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query(call,['No access','05001',[],new Date().toISOString(),args[4],args[5]]),
      /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('migration keeps geography and capability reads unchanged while restricting new write functions',()=>{
  assert.match(migration,/revoke all on function public\.sync_procurement_municipalities\(jsonb,integer,text\)/);
  assert.match(migration,/grant execute on function public\.create_procurement_geography_request\([\s\S]*?to service_role/);
  assert.doesNotMatch(migration,/grant (insert|update|delete) on public\.procurement_geographies to authenticated/i);
});

test('guarded persistence inserts capabilities and request-source links without replay changes',async()=>{
  const db=new PGlite();
  try {
    await db.exec(setup);
    await db.exec(migration);
    const sourceId='12345678-1234-4123-8123-123456789abc';
    const requestId='22345678-1234-4123-8123-123456789abc';
    await db.query(`insert into public.procurement_sources values ($1,'sam','SAM notices')`,[sourceId]);
    await db.query(`insert into public.procurement_search_requests
      (id,name,search_boundary_mode,requested_search_areas) values
      ($1,'Test','exact_area','[{"area_type":"county","county_name":"Arkansas","state_code":"AR"}]')`,[requestId]);
    const capId='32345678-1234-4123-8123-123456789abc';
    const linkId='42345678-1234-4123-8123-123456789abc';
    const manifest={rows:[
      {table:'procurement_source_capabilities',before:null,row:{id:capId,source_id:sourceId,
        kind:'opportunity',method:'api',endpoint_url:'https://api.sam.gov/opportunities/v2/search',
        official_entry_url:'https://sam.gov',route_geography_id:'05',availability:'active',
        verified_at:'2026-10-02T00:00:00Z',verified_until:'2026-11-02T00:00:00Z',
        verification_evidence:{receipt:'test'},parser_version:'v1',method_spec:{version:1,runner_id:'sam-search'}}},
      {table:'procurement_request_sources',before:null,row:{id:linkId,search_request_id:requestId,
        source_id:sourceId,discovery_reason:'Official source identity reviewed'}}]};
    const sql=persistenceSql(manifest);
    await db.exec(sql);
    const before=(await db.query(`select to_jsonb(c) row from public.procurement_source_capabilities c where id=$1`,[capId])).rows[0].row;
    await db.exec(sql);
    const after=(await db.query(`select to_jsonb(c) row from public.procurement_source_capabilities c where id=$1`,[capId])).rows[0].row;
    assert.deepEqual(after,before);
    assert.equal((await db.query(`select count(*)::integer n from public.procurement_request_sources`)).rows[0].n,1);
  } finally {await db.close();}
});
