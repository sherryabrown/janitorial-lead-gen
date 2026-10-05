import { adminClient } from './lib/supabase-admin.mjs';

const apply = process.argv[2] === '--apply';
if (process.argv.length > (apply ? 3 : 2))
  throw new Error('Usage: node scripts/record-phase2b-open-items.mjs [--apply]');
const db = adminClient();
async function one(table, column, value) {
  const { data, error } = await db.from(table).select('*').eq(column, value).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
const openItems = [
  { code: 'arbuy', run_id: 'ad5fb88f-99f4-434d-9f5b-30993adb1cc5',
    status: 'current_open_view_only',
    blocker: 'A public current Open Bids view is verified, but the historical archive query, pagination and terminal condition are unverified; empty default results do not cover the archive.',
    next_action: 'Verify the public historical advanced-search request and archive pages, then determine whether any document requires supplier sign-in.',
    actor: 'agent' },
  { code: 'ardot', run_id: '13f24d4d-b052-40e3-9ade-a4887d1fde7c',
    status: 'listing_verified_documents_pending',
    blocker: 'All 2,497 table rows were captured across 25 pages, but linked bid, addendum and tab PDFs have not been reviewed as a complete document set. The 14 janitorial-keyword rows have historical 2011–2023 opening dates.',
    next_action: 'Review relevant official bid/tab PDFs and any amendments before interpreting historical awards or staging a lead. Keep Bid Express participation separate.',
    actor: 'agent' },
];
const output = [];
for (const item of openItems) {
  const source = await one('procurement_sources', 'code', item.code);
  const run = await one('procurement_runs', 'id', item.run_id);
  const capture = await one('procurement_public_captures', 'run_id', item.run_id);
  if (run.source_id !== source.id || capture.source_id !== source.id ||
      (item.code === 'arbuy' ? run.detail?.scope !== 'verified_method' :
        run.detail?.collector !== 'ardot-table' || run.detail?.records_total !== 2497 ||
        run.detail?.terminal !== true) || run.detail?.state !== 'content_saved' ||
      capture.requested_url !== (item.code === 'arbuy'
        ? 'https://arbuy.arkansas.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true'
        : 'https://ardot.gov/wp-admin/admin-ajax.php?action=get_wdtable&table_id=53') ||
      !capture.content_sha256)
    throw new Error(`${item.code} audited entry evidence does not match`);
  const status = { status: item.status, attempted_at: capture.retrieved_at,
    attempted_step: item.code === 'arbuy' ? 'bounded public Open Bids view and archive-method review'
      : 'complete 25-page ARDOT fiscal-year table check and candidate review',
    evidence_run_id: run.id, content_sha256: capture.content_sha256,
    blocker: item.blocker, next_action: item.next_action, actor: item.actor };
  if (apply && source.config?.phase2b_method_status?.evidence_run_id !== run.id) {
    const { data, error } = await db.from('procurement_sources')
      .update({ config: { ...source.config, phase2b_method_status: status } })
      .eq('id', source.id).eq('updated_at', source.updated_at).select('id');
    if (error || data?.length !== 1)
      throw new Error(`${item.code} status update failed: ${error?.message ?? 'stale source'}`);
  }
  if (apply) {
    const saved = await one('procurement_sources', 'id', source.id);
    if (saved.config?.phase2b_method_status?.evidence_run_id !== run.id)
      throw new Error(`${item.code} status readback failed`);
  }
  output.push({ code: item.code, ...status });
}
console.log(JSON.stringify({ applied: apply, open_items: output }, null, 2));
