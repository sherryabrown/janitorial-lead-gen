import { adminClient } from './lib/supabase-admin.mjs';
import { fetchPublicCheck } from './lib/public-source-check.mjs';
import { ardotUrl, inspectArdotEntry, fetchArdotPage, verifiedArdotMethod } from './lib/ardot-table.mjs';

const flag = process.argv[2];
if (process.argv.length > 3 || (flag !== undefined && flag !== '--apply'))
  throw new Error('Usage: node scripts/verify-ardot-method.mjs [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const [source, geography] = await Promise.all([
  one('procurement_sources', 'code', 'ardot'), one('procurement_geographies', 'id', '05'),
]);
const capture = await fetchPublicCheck({ runner_id: 'public-fetch',
  allowed_hosts: ['ardot.gov'], max_bytes: 2_000_000 }, ardotUrl);
const entry = inspectArdotEntry(capture);
const firstPage = await fetchArdotPage(entry, 0);
if (firstPage.state !== 'captured') throw new Error(`ARDOT first page: ${firstPage.reason}`);
const proposal = verifiedArdotMethod(source, geography, capture, firstPage);
const { data: existing, error: lookupError } = await db.from('procurement_source_capabilities')
  .select('*').eq('id', proposal.id);
if (lookupError) throw new Error(lookupError.message);
if (existing.length && (existing[0].source_id !== source.id ||
    existing[0].method_spec?.runner_id !== 'ardot-table'))
  throw new Error('Existing ARDOT method differs; review before replacing it');
if (flag === '--apply' && !existing.length) {
  const { error } = await db.from('procurement_source_capabilities').insert(proposal);
  if (error) throw new Error(error.message);
}
if (flag === '--apply') {
  const saved = await one('procurement_source_capabilities', 'id', proposal.id);
  if (saved.source_id !== source.id || saved.method_spec?.ajax_url !== proposal.method_spec.ajax_url)
    throw new Error('ARDOT method readback failed');
}
console.log(JSON.stringify({ applied: flag === '--apply', existing: !!existing.length,
  source_id: source.id, method_id: proposal.id, first_page_rows: firstPage.rows,
  reported_total: firstPage.total, max_pages: proposal.method_spec.max_pages,
  verified_until: proposal.verified_until,
  coverage_limit: proposal.verification_evidence.coverage_limit }, null, 2));
