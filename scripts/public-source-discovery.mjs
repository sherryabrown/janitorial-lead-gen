import { readFileSync, existsSync } from 'node:fs';
import { adminClient } from './lib/supabase-admin.mjs';
import { discoveryView, validateHandoff, ledgerHasAdvancedAccess } from './lib/public-source-discovery.mjs';
import { same } from './lib/sam-normalize.mjs';

const [command, arg] = process.argv.slice(2);
const usage = 'Usage: node scripts/public-source-discovery.mjs gaps REQUEST_UUID | handoff SOURCE_CODE | save-handoff INPUT.json';
if (!['gaps','handoff','save-handoff'].includes(command) || !arg || process.argv.length !== 4)
  throw new Error(usage);
const db = adminClient();
async function rows(table, filter = q => q) {
  const output = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await filter(db.from(table).select('*')).range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    output.push(...data);
    if (data.length < 1000) return output;
  }
}
const sources = await rows('procurement_sources');
if (command === 'gaps') {
  if (!/^[a-f0-9-]{36}$/i.test(arg)) throw new Error(usage);
  const [request, targets, geographies, capabilities] = await Promise.all([
    rows('procurement_search_requests', q => q.eq('id', arg)),
    rows('procurement_request_targets', q => q.eq('search_request_id', arg)),
    rows('procurement_geographies'), rows('procurement_source_capabilities'),
  ]);
  if (request.length !== 1 || !targets.length || targets.some(t => !t.geography_id || t.state === 'needs_review'))
    throw new Error('Confirmed city or county request required');
  console.log(JSON.stringify(discoveryView(request[0], targets, geographies, capabilities, sources), null, 2));
} else if (command === 'handoff') {
  const source = sources.find(s => s.code === arg);
  if (!source) throw new Error('Registered source code required');
  const [handoffs, registrations] = await Promise.all([
    rows('procurement_access_handoffs', q => q.eq('source_id', source.id)),
    rows('procurement_registrations', q => q.eq('source_id', source.id)),
  ]);
  console.log(JSON.stringify({ source: source.code, registration: registrations.map(r => ({
    id: r.id, status: r.status, email_verification_state: r.email_verification_state,
    login_state: r.login_state, api_state: r.api_state,
  })), handoffs: handoffs.map(h => ({ id: h.id, channel: h.channel, tenant: h.tenant,
    checked_on: h.checked_on, access_state: h.access_state, next_actor: h.next_actor,
    next_action: h.next_action, details: h.details })) }, null, 2));
} else {
  const input = JSON.parse(readFileSync(arg, 'utf8'));
  const [registrations, handoffs] = await Promise.all([
    rows('procurement_registrations', q => q.eq('source_id', input.source_id)),
    rows('procurement_access_handoffs', q => q.eq('source_id', input.source_id)),
  ]);
  // The private legacy ledger is advisory. Never overwrite its more advanced access state.
  const ledgerPath = 'outputs/procurement-access/sources.json';
  if (existsSync(ledgerPath)) {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const legacy = ledger.sources?.find(s => s.database_persistence?.source_id === input.source_id ||
      s.source_id === sources.find(row => row.id === input.source_id)?.code);
    if (ledgerHasAdvancedAccess(legacy,input.channel) &&
        !['pending','verified'].includes(input.access_state))
      throw new Error('Private ledger has an advanced access state; reconcile before saving');
  }
  const validated = validateHandoff(input, sources, registrations, handoffs);
  const existing = handoffs.find(h => h.channel === validated.channel && h.tenant === validated.tenant);
  const details = Object.fromEntries(Object.entries(validated).filter(([key]) =>
    !['source_id','channel','tenant','checked_on','access_state','next_actor','next_action','registration_id'].includes(key)));
  if (existing && same(existing.details, details) &&
      existing.checked_on === validated.checked_on && existing.access_state === validated.access_state &&
      existing.next_actor === validated.next_actor && existing.next_action === validated.next_action) {
    console.log(JSON.stringify({ status: 'unchanged', id: existing.id, source_id: validated.source_id }));
  } else {
    const row = { source_id: validated.source_id, registration_id: validated.registration_id,
      channel: validated.channel, tenant: validated.tenant, checked_on: validated.checked_on,
      access_state: validated.access_state, next_actor: validated.next_actor,
      next_action: validated.next_action, details, updated_at: new Date().toISOString(),
      history: existing ? [...(existing.history ?? []), { checked_on: existing.checked_on,
        access_state: existing.access_state, next_action: existing.next_action }] : [] };
    const query = existing ? db.from('procurement_access_handoffs').update(row).eq('id', existing.id)
      .eq('updated_at', existing.updated_at).select('id,source_id,channel,tenant,access_state,next_action')
      : db.from('procurement_access_handoffs').insert(row).select('id,source_id,channel,tenant,access_state,next_action');
    const { data, error } = await query.single();
    if (error || !data) throw new Error(`Access handoff not saved: ${error?.message ?? 'concurrent edit'}`);
    console.log(JSON.stringify({ status: 'saved', ...data }));
  }
}
