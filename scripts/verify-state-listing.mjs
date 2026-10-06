import { adminClient } from './lib/supabase-admin.mjs';
import { verifiedPublicMethod } from './lib/public-method-verification.mjs';
import { stateListingArgs } from './lib/state-listing-args.mjs';

const {code, runId, flag} = stateListingArgs(process.argv.slice(2));
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const [source, geography, run, capture] = await Promise.all([
  one('procurement_sources', 'code', code), one('procurement_geographies', 'id', '05'),
  one('procurement_runs', 'id', runId), one('procurement_public_captures', 'run_id', runId),
]);
const task = await one('procurement_coverage_tasks', 'id', run.coverage_task_id);
const method = verifiedPublicMethod(source, geography, run, task, capture);
const { data: existing, error: lookupError } = await db.from('procurement_source_capabilities')
  .select('*').eq('id', method.id);
if (lookupError) throw new Error(lookupError.message);
if (flag === '--apply') {
  if (existing.length && existing[0].verification_evidence?.run_id !== runId)
    throw new Error('A category method already exists; review before replacing it');
  if (!existing.length) {
    const { error } = await db.from('procurement_source_capabilities').insert(method);
    if (error) throw new Error(error.message);
  }
  const saved = await one('procurement_source_capabilities', 'id', method.id);
  if (saved.verification_evidence?.run_id !== runId || saved.availability !== 'active')
    throw new Error('Method readback failed');
}
console.log(JSON.stringify({ applied: flag === '--apply', source: code, category: method.kind,
  method_id: method.id, run_id: runId, coverage_limit: method.verification_evidence.coverage_limit,
  final_url: method.verification_evidence.final_url, verified_until: method.verified_until,
  existing: !!existing.length,
  next: flag === '--apply' ? 'Replan a confirmed request and run this source; review the saved listing and linked documents.'
    : 'Review the category and coverage limit, then rerun with --apply.' }, null, 2));
