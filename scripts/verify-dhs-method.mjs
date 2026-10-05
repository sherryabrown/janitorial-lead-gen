import { adminClient } from './lib/supabase-admin.mjs';
import { fetchPublicCheck } from './lib/public-source-check.mjs';
import { dhsAnnouncementsUrl, verifiedDhsOpportunityMethod } from './lib/dhs-method-verification.mjs';

const flag = process.argv[2];
if (process.argv.length > 3 || (flag !== undefined && flag !== '--apply'))
  throw new Error('Usage: node scripts/verify-dhs-method.mjs [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const [source, geography] = await Promise.all([
  one('procurement_sources', 'code', 'dhs'), one('procurement_geographies', 'id', '05'),
]);
const capture = await fetchPublicCheck({ runner_id: 'public-fetch',
  allowed_hosts: ['humanservices.arkansas.gov'], max_bytes: 2_000_000 }, dhsAnnouncementsUrl);
if (capture.state !== 'captured') throw new Error(`DHS page check: ${capture.reason}`);
const proposal = verifiedDhsOpportunityMethod(source, geography, capture);
const { data: existing, error: lookupError } = await db.from('procurement_source_capabilities')
  .select('*').eq('id', proposal.id);
if (lookupError) throw new Error(lookupError.message);
if (existing.length && (existing[0].source_id !== source.id ||
    existing[0].method_spec?.urls?.[0] !== dhsAnnouncementsUrl))
  throw new Error('Existing DHS method differs; review before replacing it');
if (flag === '--apply' && !existing.length) {
  const { error } = await db.from('procurement_source_capabilities').insert(proposal);
  if (error) throw new Error(error.message);
}
if (flag === '--apply') {
  const saved = await one('procurement_source_capabilities', 'id', proposal.id);
  if (saved.source_id !== source.id || saved.method_spec?.urls?.[0] !== dhsAnnouncementsUrl)
    throw new Error('DHS method readback failed');
}
console.log(JSON.stringify({ applied: flag === '--apply', existing: !!existing.length,
  source_id: source.id, category: proposal.kind, method_id: proposal.id,
  url: dhsAnnouncementsUrl, rows: proposal.verification_evidence.table_rows_visible,
  content_sha256: capture.content_sha256, verified_until: proposal.verified_until,
  coverage_limit: proposal.verification_evidence.coverage_limit }, null, 2));
