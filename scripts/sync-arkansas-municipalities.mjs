import { readFileSync, writeFileSync } from 'node:fs';
import { adminClient } from './lib/supabase-admin.mjs';
import { fetchMunicipalityManifest } from './lib/arkansas-municipalities.mjs';

const [command, path] = process.argv.slice(2);
const usage = 'Usage: node scripts/sync-arkansas-municipalities.mjs fetch OUTPUT.json | apply REVIEWED.json';
if (!path || !['fetch', 'apply'].includes(command)) throw new Error(usage);

if (command === 'fetch') {
  const manifest = await fetchMunicipalityManifest();
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ file: path, count: manifest.expected_count,
    cross_county: manifest.municipalities.filter(x => x.county_ids.length > 1)
      .map(x => ({ name: x.name, county_ids: x.county_ids })),
    next_action: 'Review the full municipality and county list before applying it.' }, null, 2));
} else {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(manifest.municipalities) ||
      manifest.expected_count !== manifest.municipalities.length ||
      !/^\d{4}-\d{2}-\d{2}$/.test(manifest.dataset_version))
    throw new Error('Invalid or incomplete reviewed GIS manifest');
  const { data, error } = await adminClient().rpc('sync_procurement_municipalities', {
    p_municipalities: manifest.municipalities,
    p_expected_count: manifest.expected_count,
    p_dataset_version: manifest.dataset_version,
  });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ imported: data, dataset_version: manifest.dataset_version }));
}
