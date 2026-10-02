import { adminClient } from './lib/supabase-admin.mjs';
import { verifiedSamMethod } from './lib/sam-method-verification.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [opportunityRunId, awardRunId, flag] = process.argv.slice(2);
if (!uuid.test(opportunityRunId || '') || !uuid.test(awardRunId || '') ||
    (flag !== undefined && flag !== '--apply') || process.argv.length > 5)
  throw new Error('Usage: node scripts/verify-sam-methods.mjs OPPORTUNITY_RUN_UUID AWARD_RUN_UUID [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const [state, opportunityRun, awardRun] = await Promise.all([
  one('procurement_geographies', 'id', '05'),
  one('procurement_runs', 'id', opportunityRunId), one('procurement_runs', 'id', awardRunId),
]);
const [opportunitySource, awardSource] = await Promise.all([
  one('procurement_sources', 'code', 'sam'), one('procurement_sources', 'code', 'sam-awards'),
]);
for (const source of [opportunitySource, awardSource]) {
  if (!source.source_coverage_areas?.some(area => area.area_type === 'state' && area.state_code === 'AR' ||
      area.area_type === 'country' && area.country_code === 'US'))
    throw new Error(`Source ${source.code} has no reviewed coverage applicable to Arkansas`);
}
const proposals = [
  verifiedSamMethod('opportunity', opportunityRun, opportunitySource, state),
  verifiedSamMethod('award', awardRun, awardSource, state),
];
const existing = await Promise.all(proposals.map(row => db.from('procurement_source_capabilities')
  .select('*').eq('id', row.id)));
for (const result of existing) if (result.error) throw new Error(result.error.message);
if (existing.some(result => result.data.length && result.data[0].source_id !==
    proposals[existing.indexOf(result)].source_id))
  throw new Error('Capability identity collision');
if (flag === '--apply') {
  for (const [index, row] of proposals.entries()) {
    if (existing[index].data.length) {
      const old = existing[index].data[0];
      if (old.verification_evidence?.run_id !== row.verification_evidence.run_id)
        throw new Error(`${row.kind} already has a method; review before replacing it`);
      continue;
    }
    const { error } = await db.from('procurement_source_capabilities').insert(row);
    if (error) throw new Error(`${row.kind}: ${error.message}`);
  }
  for (const row of proposals) {
    const saved = await one('procurement_source_capabilities', 'id', row.id);
    if (saved.verification_evidence?.run_id !== row.verification_evidence.run_id ||
        saved.route_geography_id !== '05' || saved.availability !== 'active')
      throw new Error(`${row.kind} capability readback failed`);
  }
}
console.log(JSON.stringify({ applied: flag === '--apply', methods: proposals.map(row => ({
  source_id: row.source_id, category: row.kind, geography_id: row.route_geography_id,
  evidence_run_id: row.verification_evidence.run_id, verified_until: row.verified_until,
  existing: !!existing[proposals.indexOf(row)].data.length,
})), next: flag === '--apply' ? 'Replan the geography request to add verified state checks.'
  : 'Review the methods and rerun with --apply to register them.' }, null, 2));
