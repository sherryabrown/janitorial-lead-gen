import { adminClient } from './lib/supabase-admin.mjs';
import { fetchPublicCheck } from './lib/public-source-check.mjs';
import { uahtProcurementUrl, verifiedUahtOpportunityMethod } from './lib/uaht-method-verification.mjs';

const flag = process.argv[2];
if (process.argv.length > 3 || (flag !== undefined && flag !== '--apply'))
  throw new Error('Usage: node scripts/verify-uaht-method.mjs [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const source = await one('procurement_sources', 'code', 'ua-hope-texarkana');
const { data: geographies, error } = await db.from('procurement_geographies').select('*')
  .eq('kind', 'municipality').eq('name', 'Texarkana').eq('state_code', 'AR').eq('source_active', true);
if (error || geographies?.length !== 1) throw new Error('Unique active Texarkana geography required');
const capture = await fetchPublicCheck({ runner_id: 'public-fetch',
  allowed_hosts: ['www.uaht.edu'], max_bytes: 2_000_000 }, uahtProcurementUrl);
if (capture.state !== 'captured') throw new Error(`UAHT page check: ${capture.reason}`);
const proposal = verifiedUahtOpportunityMethod(source, geographies[0], capture);
const { data: existing, error: existingError } = await db.from('procurement_source_capabilities')
  .select('*').eq('id', proposal.id);
if (existingError) throw new Error(existingError.message);
if (existing.length && existing[0].availability === 'active' &&
    new Date(existing[0].verified_until) > new Date()) {
  if (existing[0].method_spec?.urls?.[0] !== uahtProcurementUrl)
    throw new Error('Existing UAHT method differs; review before replacing it');
} else if (flag === '--apply') {
  const { error: insertError } = await db.from('procurement_source_capabilities')
    .upsert(proposal, { onConflict: 'id' });
  if (insertError) throw new Error(insertError.message);
  const saved = await one('procurement_source_capabilities', 'id', proposal.id);
  if (saved.verification_evidence?.content_sha256 !== capture.content_sha256 ||
      saved.route_geography_id !== geographies[0].id)
    throw new Error('UAHT method readback failed');
}
console.log(JSON.stringify({ applied: flag === '--apply', existing: !!existing.length,
  category: 'opportunity', source: source.code, geography_id: geographies[0].id,
  url: uahtProcurementUrl, content_sha256: capture.content_sha256,
  verified_until: proposal.verified_until,
  coverage_limit: proposal.verification_evidence.coverage_limit }, null, 2));
