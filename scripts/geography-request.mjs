import { readFileSync } from 'node:fs';
import { adminClient } from './lib/supabase-admin.mjs';
import { resolveGeography, selectedRoutes, planSourceRoutes } from './lib/geography-routing.mjs';
import { safeMetadata } from './lib/research-persistence.mjs';

const usage = `Chat-initiated Arkansas geography request:
  node scripts/geography-request.mjs preview city|county NAME [--county COUNTY]
  node scripts/geography-request.mjs create INPUT.json

Preview reads the database and creates nothing. A county preview lists cities and a selection_token.
Ask the user in chat which city IDs to include, or to select county-only. Create requires
that answer as selected_city_ids (an empty array means county-only), the preview token,
and confirmed_city_selection:true. Never set confirmation before the user answers.
City create input needs kind, name and optional county. Both kinds need a name,
service_scope and search_windows objects. Create is an atomic live database write.
No search, signup, import, or schedule starts from this command.`;

async function rows(db, table, columns = '*') {
  const result = [];
  for (let start = 0; ; start += 1000) {
    let query = db.from(table).select(columns);
    query = table === 'procurement_place_counties'
      ? query.order('place_id').order('county_id') : query.order('id');
    const { data, error } = await query.range(start, start + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 1000) return result;
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(usage);
} else if (command === 'preview' || command === 'create') {
  let input;
  if (command === 'preview') {
    if (!['city', 'county'].includes(args[0]) || !args[1] || (args.length > 2 && (args[2] !== '--county' || !args[3])))
      throw new Error(usage);
    input = { kind: args[0], name: args[1], county: args[3] };
  } else {
    if (args.length !== 1) throw new Error(usage);
    input = JSON.parse(readFileSync(args[0], 'utf8'));
  }
  const db = adminClient();
  const [geographies, links, capabilities, sources] = await Promise.all([
    rows(db, 'procurement_geographies'), rows(db, 'procurement_place_counties'),
    rows(db, 'procurement_source_capabilities'), rows(db, 'procurement_sources'),
  ]);
  if (!geographies.some(g => g.kind === 'municipality' && g.source_active === true &&
      g.dataset_url === 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41'))
    throw new Error('Arkansas GIS municipalities have not been imported');
  const resolution = resolveGeography(geographies, links, input);
  if (command === 'preview' || resolution.status === 'needs_county') {
    console.log(JSON.stringify(resolution, null, 2));
  } else {
    if (!input.service_scope || !Object.keys(input.service_scope).length ||
        !input.search_windows || !Object.keys(input.search_windows).length)
      throw new Error('Nonempty service_scope and search_windows required');
    safeMetadata(input.service_scope);
    safeMetadata(input.search_windows);
    const routes = selectedRoutes(resolution, input.selected_city_ids,
      input.confirmed_city_selection === true, input.selection_token);
    const { data, error } = await db.rpc('create_procurement_geography_request', {
      p_name: input.request_name || `${input.name} Arkansas janitorial`,
      p_geography_id: resolution.geography.id,
      p_selected_city_ids: resolution.kind === 'county' ? input.selected_city_ids : [],
      p_cities_confirmed_at: resolution.kind === 'county' ? new Date().toISOString() : null,
      p_service_scope: input.service_scope,
      p_search_windows: input.search_windows,
      p_county_id: resolution.kind === 'city' ? resolution.county.id : null,
    });
    if (error) throw new Error(`Request not created: ${error.message}`);
    console.log(JSON.stringify({ request_id: data, routes: planSourceRoutes(routes, capabilities, sources),
      next_action: 'Review known route methods and missing-source research; collection has not started.' }, null, 2));
  }
} else throw new Error(usage);
