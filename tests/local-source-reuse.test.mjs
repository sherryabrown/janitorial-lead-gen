import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { adapterContract, buildKnownSourcePlan, registeredEntryContract } from '../scripts/lib/known-source-execution.mjs';

const method = { version: 1, runner_id: 'public-fetch', check_when: 'each_request',
  urls: ['https://utility.example.gov/bids'], allowed_hosts: ['utility.example.gov'], max_bytes: 2_000_000 };
const city = { id: 'city-1', kind: 'municipality', name: 'Bayfield', source_active: true };
const county = { id: 'county-1', kind: 'county', name: 'Pine County', source_active: true };
const utility = { id: 'source-1', code: 'utility-public-bids', name: 'Utility bids',
  url: method.urls[0], source_coverage_areas: [{ area_type: 'city', city_name: city.name, state_code: 'AR' }] };
const countyOffice = { id: 'source-2', code: 'county-office', name: 'County office',
  url: 'https://county.example.gov/transparency',
  source_coverage_areas: [{ area_type: 'county', county_name: county.name, state_code: 'AR' }] };
const sam = { id: 'source-3', code: 'sam', name: 'SAM',
  source_coverage_areas: [{ area_type: 'state', state_code: 'AR' }] };
const capability = { id: 'cap-1', source_id: utility.id, route_geography_id: city.id,
  kind: 'opportunity', method: 'browser', availability: 'active',
  verified_at: '2026-10-05T00:00:00Z', verified_until: '2026-11-04T00:00:00Z',
  verification_evidence: { official_listing: method.urls[0] },
  parser_version: 'public-capture-v1', method_spec: method };
const request = { id: 'request-1', search_windows: {} };
const now = new Date('2026-10-06T00:00:00Z');

test('a saved public method is reused by geography and county entry remains a gap', () => {
  const plan = buildKnownSourcePlan(request,
    [{ id: 'target-1', geography_id: city.id, checkpoint: { route_order: 0 } },
      { id: 'target-2', geography_id: county.id, checkpoint: { route_order: 1 } }],
    [city, county], [capability], [utility, countyOffice, sam], now);
  assert.equal(plan.known, 1);
  assert.equal(plan.tasks.find(t => t.capability_id === capability.id)?.state, 'unchecked');
  assert.equal(plan.tasks.find(t => t.source_id === countyOffice.id && t.kind === 'source_entry')?.state, 'unchecked');
  assert.equal(plan.tasks.filter(t => t.source_id === countyOffice.id && t.state === 'method_missing').length, 3);
  assert.equal(plan.tasks.some(t => t.source_id === sam.id), false);
  assert.equal(adapterContract(capability, utility, now).urls[0], method.urls[0]);
});

test('the same saved rows do not assign a city method to a county-only request', () => {
  const plan = buildKnownSourcePlan(request,
    [{ id: 'target-2', geography_id: county.id, checkpoint: { route_order: 0 } }],
    [city, county], [capability], [utility, countyOffice, sam], now);
  assert.equal(plan.known, 0);
  assert.equal(plan.tasks.some(t => t.source_id === utility.id), false);
  assert.equal(plan.tasks.some(t => t.source_id === countyOffice.id && t.kind === 'source_entry'), true);
});

test('a dated access block prevents repeated entry fetches while preserving category gaps', () => {
  const inaccessible = { ...countyOffice, config: { known_source_research: { entry_access: {
    status: 'blocked', method: 'public-fetch', checked_at: '2026-10-05T00:00:00Z',
    valid_until: '2026-11-04T00:00:00Z', reason: 'HTTP 403',
  } } } };
  const plan = buildKnownSourcePlan(request,
    [{ id: 'target-2', geography_id: county.id, checkpoint: { route_order: 0 } }],
    [city, county], [], [inaccessible], now);
  assert.equal(plan.entry_checks, 0);
  assert.equal(plan.source_gaps, 3);
  assert.equal(registeredEntryContract(inaccessible, new Date('2026-11-05T00:00:00Z'))?.runner_id, 'public-fetch');
});

test('reviewed registration persists only verified opportunity coverage', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261005000200_texarkana_miller_verified_sources.sql', import.meta.url), 'utf8');
  assert.match(sql, /'texarkana-water-utilities'/);
  assert.match(sql, /'miller-county'/);
  assert.match(sql, /'opportunity', 'browser'/);
  assert.doesNotMatch(sql, /'forecast', 'browser'|'award', 'browser'/);
  assert.match(sql, /"runner_id":"public-fetch"/);
});

test('reviewed registration and live access correction retain source evidence without false runnable coverage', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema if not exists public;
      create table public.procurement_sources (
        id uuid primary key, code text unique not null, name text not null,
        contracting_entity_geo_level text, business_category text not null,
        source_coverage_areas jsonb not null, url text not null,
        config jsonb not null, identity_key text);
      create table public.procurement_source_capabilities (
        id uuid primary key, source_id uuid references public.procurement_sources(id),
        kind text, method text, endpoint_url text, official_entry_url text,
        availability text, verified_at timestamptz, verified_until timestamptz,
        verification_evidence jsonb, parser_version text, next_action text,
        route_geography_id text, method_spec jsonb);`);
    const sql = readFileSync(new URL('../supabase/migrations/20261005000200_texarkana_miller_verified_sources.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const blocked = readFileSync(new URL('../supabase/migrations/20261005000300_block_twu_cloudflare_fetch.sql', import.meta.url), 'utf8');
    await db.exec(blocked);
    await db.exec(blocked);
    const entryBlock = readFileSync(new URL('../supabase/migrations/20261005000400_twu_entry_access_block.sql', import.meta.url), 'utf8');
    await db.exec(entryBlock);
    await db.exec(entryBlock);
    const sources = await db.query('select code, source_coverage_areas, config from public.procurement_sources order by code');
    const capabilities = await db.query('select kind, availability, method_spec, route_geography_id, verification_evidence from public.procurement_source_capabilities');
    assert.equal(sources.rows.length, 2);
    assert.deepEqual(sources.rows.find(row => row.code === 'miller-county').config.known_source_research.unverified_categories,
      ['forecast', 'opportunity', 'award']);
    assert.equal(sources.rows.find(row => row.code === 'texarkana-water-utilities')
      .config.known_source_research.entry_access.status, 'blocked');
    assert.equal(capabilities.rows.length, 1);
    assert.equal(capabilities.rows[0].kind, 'opportunity');
    assert.equal(capabilities.rows[0].method_spec.runner_id, 'public-fetch');
    assert.equal(capabilities.rows[0].availability, 'blocked');
    assert.equal(capabilities.rows[0].verification_evidence.live_check.method_status, 'blocked');
  } finally {
    await db.close();
  }
});
