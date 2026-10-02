import { readFileSync, writeFileSync } from 'node:fs';
import { adminClient } from './lib/supabase-admin.mjs';

const [path, reportFlag, reportPath] = process.argv.slice(2);
if (!path || (reportFlag && (reportFlag !== '--report' || !reportPath)))
  throw new Error('Usage: node scripts/review-arkansas-municipalities.mjs MANIFEST.json [--report OUTPUT.md]');
const manifest = JSON.parse(readFileSync(path, 'utf8'));
if (manifest.expected_count !== manifest.municipalities?.length)
  throw new Error('Incomplete GIS municipality manifest');

const db = adminClient();
async function rows(table, columns) {
  const result = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
const [geographies, links] = await Promise.all([
  rows('procurement_geographies', 'id,kind,name,source_active'),
  rows('procurement_place_counties', 'place_id,county_id'),
]);
const counties = new Set(geographies.filter(x => x.kind === 'county').map(x => x.id));
const countyNames = new Map(geographies.filter(x => x.kind === 'county').map(x => [x.id, x.name]));
const legacyLinks = new Map();
for (const link of links) {
  const list = legacyLinks.get(link.place_id) ?? [];
  list.push(link.county_id);
  legacyLinks.set(link.place_id, list);
}
const discrepancies = [];
const missingCodes = [];
const unknownCounties = [];
const countyLabel = ids => ids.map(id => countyNames.get(id) ?? id).join(', ');
for (const item of manifest.municipalities) {
  for (const county of item.county_ids)
    if (!counties.has(county)) unknownCounties.push({ name: item.name, county });
  if (!item.place_fips) { missingCodes.push(item.name); continue; }
  const censusId = `05${item.place_fips}`;
  const prior = (legacyLinks.get(censusId) ?? []).sort();
  const current = [...item.county_ids].sort();
  if (prior.length && JSON.stringify(prior) !== JSON.stringify(current))
    discrepancies.push({ name: item.name, gis: current, census: prior,
      added: current.filter(id => !prior.includes(id)),
      removed: prior.filter(id => !current.includes(id)) });
}
const result = { count: manifest.expected_count,
  cross_county_count: manifest.municipalities.filter(x => x.county_ids.length > 1).length,
  missing_place_codes: missingCodes, unknown_counties: unknownCounties,
  county_link_differences_from_legacy_census: discrepancies,
  note: 'Legacy Census links are comparison evidence, not the import authority.' };
if (reportPath) {
  const additionsOnly = discrepancies.every(x => x.added.length > 0 && x.removed.length === 0);
  const clean = !missingCodes.length && !unknownCounties.length && additionsOnly;
  const lines = [
    '# Arkansas municipality import review',
    '',
    `Source snapshot: \`${path}\` (${manifest.dataset_version})`,
    '',
    `The GIS snapshot contains **${result.count} incorporated municipalities**. ${result.cross_county_count} have land in more than one county. All place codes and county IDs are present.`,
    '',
    `**${discrepancies.length} county-link differences:** ${additionsOnly ? 'each GIS difference adds a county; none removes a Census county.' : 'some GIS links remove or replace a Census county and need investigation.'}`,
    '',
    clean
      ? '**Recommendation:** Use the current Arkansas GIS county links for import. The older Census links are retained for historical references.'
      : '**Recommendation:** Resolve the listed exceptions before import.',
    '',
    '| Municipality | Existing Census counties | Current Arkansas GIS counties | Change |',
    '| --- | --- | --- | --- |',
    ...discrepancies.map(x => `| ${x.name.replaceAll('|', '\\|')} | ${countyLabel(x.census)} | ${countyLabel(x.gis)} | ${x.added.length ? 'Adds ' + countyLabel(x.added) : ''}${x.removed.length ? ' Removes ' + countyLabel(x.removed) : ''} |`),
    '',
    'Sources: [Arkansas GIS municipal boundaries](https://gis.arkansas.gov/product/municipal-boundaries-polygon/) and [county boundaries](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/48). County links use polygon interior overlap; a shared border alone does not count.',
    '',
  ];
  writeFileSync(reportPath, lines.join('\n'), { flag: 'wx' });
  console.log(JSON.stringify({ report: reportPath, count: result.count,
    cross_county_count: result.cross_county_count, differences: discrepancies.length,
    additions_only: additionsOnly, ready_for_import: clean }, null, 2));
} else console.log(JSON.stringify(result, null, 2));
