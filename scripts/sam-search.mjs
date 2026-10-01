import { serverKey, project } from './lib/supabase-admin.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The admin key stays in memory; never save/log it or send it to SAM.gov.
const [kind, filtersJson] = process.argv.slice(2);
if (!['opportunities', 'awards'].includes(kind) || !filtersJson) {
  console.error('Usage: node scripts/sam-search.mjs opportunities|awards FILTERS_JSON');
  process.exit(2);
}
const filters = JSON.parse(filtersJson);
if(!filters||Array.isArray(filters)||typeof filters!=='object'||Object.keys(filters).some(k=>/api.?key|authorization|token|password|secret/i.test(k))) {
  console.error('Filters must be an object without credentials. The SAM key stays in Supabase.');process.exit(2);
}
let key;
try {
  key = serverKey();
} catch {
  console.error('Unable to load server authorization through the authenticated Supabase CLI. No SAM request sent.');
  process.exit(1);
}
try {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/sam-search`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, filters }), signal: AbortSignal.timeout(100000),
  });
  const data = await response.json();
  const text = JSON.stringify(data, null, 2);
  if (text.includes(key)) throw new Error('Credential detected in response');
  const directory = resolve('outputs/sam-search');
  mkdirSync(directory, { recursive: true });
  const filename = resolve(directory, `${data.run_id || `${Date.now()}-error`}.json`);
  writeFileSync(filename, text + '\n',{flag:'wx'});
  console.log(JSON.stringify({ http_status: response.status, run_id: data.run_id, captured: data.captured,
    upstream_status: data.upstream_status, status: data.status, record_count: data.record_count,
    complete_for_query: data.complete_for_query, file: filename,
    response_keys: Object.keys(data.response || {}), error: data.error,
    upstream_error: data.upstream_status >= 400 ? data.response : undefined }, null, 2));
  if (!response.ok || !data.captured || data.upstream_status!==200 || !data.complete_for_query) process.exitCode = 1;
} catch { console.error('Search invocation failed; check the saved procurement_runs audit before retrying.'); process.exitCode = 1; }
