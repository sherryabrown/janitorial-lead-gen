import { resolveGeography, selectedRoutes, planSourceRoutes } from './geography-routing.mjs';
import { safeMetadata } from './research-persistence.mjs';
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

export async function geographyRequest(db,command,input,{create}={}) {
  const [geographies, links, capabilities, sources] = await Promise.all([
    rows(db, 'procurement_geographies'), rows(db, 'procurement_place_counties'),
    rows(db, 'procurement_source_capabilities'), rows(db, 'procurement_sources'),
  ]);
  if (!geographies.some(g => g.kind === 'municipality' && g.source_active === true &&
      g.dataset_url === 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41'))
    throw new Error('Arkansas GIS municipalities have not been imported');
  const resolution = resolveGeography(geographies, links, input);
  if (command === 'preview' || resolution.status === 'needs_county') {
    return resolution;
  } else {
    if (!input.service_scope || !Object.keys(input.service_scope).length ||
        !input.search_windows || !Object.keys(input.search_windows).length)
      throw new Error('Nonempty service_scope and search_windows required');
    safeMetadata(input.service_scope);
    safeMetadata(input.search_windows);
    const routes = selectedRoutes(resolution, input.selected_city_ids,
      input.confirmed_city_selection === true, input.selection_token);
    const { data, error } = await (create ?? (args=>db.rpc('create_procurement_geography_request',args)))({
      p_name: input.request_name || `${input.name} Arkansas janitorial`,
      p_geography_id: resolution.geography.id,
      p_selected_city_ids: resolution.kind === 'county' ? input.selected_city_ids : [],
      p_cities_confirmed_at: resolution.kind === 'county' ? new Date().toISOString() : null,
      p_service_scope: input.service_scope,
      p_search_windows: input.search_windows,
      p_county_id: resolution.kind === 'city' ? resolution.county.id : null,
    });
    if (error) throw new Error(`Request not created: ${error.message}`);
    return { request_id: data, routes: planSourceRoutes(routes, capabilities, sources),
      next_action: 'Review known route methods and missing-source research; collection has not started.' };
  }

}
