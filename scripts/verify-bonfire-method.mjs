import { readFileSync } from 'node:fs';
import { adminClient } from './lib/supabase-admin.mjs';
import { fetchPublicCheck } from './lib/public-source-check.mjs';
import { verifiedBonfireMethod } from './lib/bonfire-method.mjs';

const [file, flag] = process.argv.slice(2);
if (!file || (flag && flag !== '--apply') || process.argv.length > 4)
  throw new Error('Usage: node scripts/verify-bonfire-method.mjs CONFIG.json [--apply]');
const config = JSON.parse(readFileSync(file, 'utf8'));
const db = adminClient();
async function rows(table, filter) {
  const { data, error } = await filter(db.from(table).select('*'));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const [source] = await rows('procurement_sources', q => q.eq('code', config.source_code));
const geographies = await rows('procurement_geographies', q => q.eq('kind', 'municipality')
  .eq('name', config.geography_name).eq('state_code', 'AR').eq('source_active', true));
if (!source || geographies.length !== 1) throw new Error('Unique registered source and city required');
const host = new URL(config.url).hostname;
const contract = { runner_id: 'public-fetch', allowed_hosts: [host], max_bytes: 2_000_000 };
const entry = await fetchPublicCheck(contract, config.entry_url);
const capture = await fetchPublicCheck({ ...contract,
  response_format: config.kind === 'award' ? 'bonfire-contracts-v1' : 'bonfire-projects-v1' }, config.url);
if (entry.state !== 'captured' || capture.state !== 'captured')
  throw new Error(`Bonfire public fetch: ${entry.reason ?? capture.reason}`);
const method = verifiedBonfireMethod(config, source, geographies[0], entry, capture);
const existing = await rows('procurement_source_capabilities', q => q.eq('id', method.id));
if (existing.length && existing[0].endpoint_url !== method.endpoint_url)
  throw new Error('Existing method differs; review before replacing');
if (flag === '--apply') {
  const { error } = await db.from('procurement_source_capabilities').upsert(method, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  const [saved] = await rows('procurement_source_capabilities', q => q.eq('id', method.id));
  if (saved?.verification_evidence?.content_sha256 !== capture.content_sha256 ||
      saved.route_geography_id !== geographies[0].id) throw new Error('Method readback failed');
}
console.log(JSON.stringify({ applied: flag === '--apply', source: source.code,
  geography_id: geographies[0].id, category: method.kind, method_id: method.id,
  public_records: method.verification_evidence.record_count,
  content_sha256: capture.content_sha256, verified_until: method.verified_until,
  coverage_limit: config.coverage_limit }, null, 2));
