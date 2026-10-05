import { adminClient } from './lib/supabase-admin.mjs';

const apply = process.argv[2] === '--apply';
if (process.argv.length > (apply ? 3 : 2))
  throw new Error('Usage: node scripts/reconcile-state-janitorial-source.mjs [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const source = await one('procurement_sources', 'code', 'arbuy-janitorial');
const lead = await one('procurement_leads', 'id', '04ebe88b-9152-5ed5-bef1-963e788844c6');
if (source.id !== lead.source_id || lead.external_id !== 'S000000473' ||
    lead.bid_type !== 'award' || lead.payload?.executed_contract_verified !== true ||
    lead.payload?.solicitation_id !== 'S000000473' ||
    !lead.payload?.intake_source_evidence?.['915f9867-8344-576b-a7aa-656809b7ed27'])
  throw new Error('Reviewed signed-contract evidence and source identity must match');
const name = 'Arkansas statewide janitorial contract S000000473';
const previousName = 'Arkansas statewide janitorial intent to award';
if (![name, previousName].includes(source.name))
  throw new Error('Source name changed; review before reconciliation');
const config = { ...source.config, name,
  coverage_note: 'Executed statewide contract 4600058030 verified from signed PDF; local work sites remain unverified.',
  phase2b_evidence: { prior_name: previousName, lead_id: lead.id,
    solicitation_id: 'S000000473', contract_number: '4600058030',
    signed_contract_intake_id: '915f9867-8344-576b-a7aa-656809b7ed27',
    classification: 'award', local_work_sites: 'unverified' } };
if (apply && source.name !== name) {
  const { data, error } = await db.from('procurement_sources').update({ name, config })
    .eq('id', source.id).eq('name', previousName).select('id');
  if (error || data?.length !== 1) throw new Error(`Source reconciliation failed: ${error?.message ?? 'stale name'}`);
}
if (apply) {
  const saved = await one('procurement_sources', 'id', source.id);
  if (saved.name !== name || saved.config?.phase2b_evidence?.lead_id !== lead.id)
    throw new Error('Source reconciliation readback failed');
}
console.log(JSON.stringify({ applied: apply, source_id: source.id, lead_id: lead.id,
  source_name: apply ? name : source.name, proposed_name: name,
  local_work_sites: 'unverified',
  next: apply ? 'Use the existing source ID and lead; review future contract changes before intake.'
    : 'Review the signed-contract classification, then rerun with --apply.' }, null, 2));
