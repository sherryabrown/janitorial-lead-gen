// Read-only live verification. Keys stay in memory; no lead data is printed.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { runSupabase } from './lib/supabase-cli.mjs';
import { project } from './lib/supabase-admin.mjs';

const keys = JSON.parse(runSupabase(['projects', 'api-keys', '--project-ref', project, '--reveal', '--output', 'json']));
const publicKey = keys.find(key => key.type === 'publishable')?.api_key;
const secretKey = keys.find(key => key.type === 'secret')?.api_key;
assert.ok(publicKey && secretKey, 'Required API credentials unavailable; none were logged.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(`https://${project}.supabase.co`, publicKey, options);
const admin = createClient(`https://${project}.supabase.co`, secretKey, options);
for (const table of ['procurement_leads', 'procurement_sources', 'procurement_versions', 'procurement_events', 'procurement_registrations', 'spin_contract_opportunities']) {
  const result = await anon.from(table).select('*', { head: true }).limit(1);
  assert.ok(result.error && [401, 403].includes(result.status), `Anonymous access was not denied for ${table} (HTTP ${result.status})`);
}
assert.ok((await anon.rpc('procurement_queue_page', {})).error, 'Anonymous queue RPC must be denied');
assert.equal((await admin.from('procurement_leads').select('id', { head: true }).limit(1)).error, null, 'Server read access must remain available');
console.log('PASS live anonymous reads/queue denied; server read access retained. No application rows or credentials logged.');
