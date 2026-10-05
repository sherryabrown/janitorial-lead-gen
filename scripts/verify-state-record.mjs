import { adminClient } from './lib/supabase-admin.mjs';
import { fetchPublicCheck } from './lib/public-source-check.mjs';
import { verifiedStateRecordMethod } from './lib/state-record-method-verification.mjs';

const flag = process.argv[2];
if (process.argv.length > 3 || (flag !== undefined && flag !== '--apply'))
  throw new Error('Usage: node scripts/verify-state-record.mjs [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const [source, geography, lead] = await Promise.all([
  one('procurement_sources', 'code', 'arbuy-janitorial'),
  one('procurement_geographies', 'id', '05'),
  one('procurement_leads', 'id', '04ebe88b-9152-5ed5-bef1-963e788844c6'),
]);
const host = new URL(source.url).hostname.toLowerCase();
const capture = await fetchPublicCheck({ runner_id: 'public-fetch',
  allowed_hosts: [host], max_bytes: 2_000_000 }, source.url);
if (capture.state !== 'captured') throw new Error(`ARBuy detail check: ${capture.reason}`);
const proposal = verifiedStateRecordMethod(source, geography, lead, capture);
const { data: existing, error: lookupError } = await db.from('procurement_source_capabilities')
  .select('*').eq('id', proposal.id);
if (lookupError) throw new Error(lookupError.message);
if (existing.length && (existing[0].source_id !== source.id ||
    existing[0].method_spec?.urls?.[0] !== source.url))
  throw new Error('Existing ARBuy record method differs; review before replacing it');
if (flag === '--apply' && !existing.length) {
  const { error } = await db.from('procurement_source_capabilities').insert(proposal);
  if (error) throw new Error(error.message);
}
if (flag === '--apply') {
  const saved = await one('procurement_source_capabilities', 'id', proposal.id);
  if (saved.verification_evidence?.lead_id !== lead.id || saved.source_id !== source.id)
    throw new Error('ARBuy record method readback failed');
}
console.log(JSON.stringify({ applied: flag === '--apply', existing: !!existing.length,
  source_id: source.id, lead_id: lead.id, method_id: proposal.id,
  content_sha256: capture.content_sha256, verified_until: proposal.verified_until,
  coverage_limit: proposal.verification_evidence.coverage_limit }, null, 2));
