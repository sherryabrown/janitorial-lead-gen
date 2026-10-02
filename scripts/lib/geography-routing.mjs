import { createHash } from 'node:crypto';

const categories = ['forecast', 'opportunity', 'award'];
const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const countyName = value => normalize(value).replace(/ county$/, '');
const fail = message => { throw new Error(message); };
const byName = (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function resolveGeography(geographies, links, input) {
  if (!['city', 'county'].includes(input.kind) || !String(input.name ?? '').trim())
    fail('Specify an Arkansas city or county name');
  const counties = geographies.filter(g => g.kind === 'county' && g.source_active !== false);
  const localities = geographies.filter(g => g.kind === 'municipality' && g.source_active === true);
  const countyById = new Map(counties.map(g => [g.id, g]));
  if (input.kind === 'county') {
    const matches = counties.filter(g => countyName(g.name) === countyName(input.name));
    if (matches.length !== 1) fail(`County not uniquely resolved: ${input.name}`);
    const county = matches[0];
    const cityIds = new Set(links.filter(x => x.county_id === county.id).map(x => x.place_id));
    const cities = localities.filter(g => cityIds.has(g.id)).sort(byName);
    return { status: 'needs_city_confirmation', kind: 'county', geography: county, county,
      cities, selection_token: selectionToken(county, cities) };
  }
  const matches = localities.filter(g => normalize(g.name) === normalize(input.name))
    .flatMap(city => links.filter(x => x.place_id === city.id && countyById.has(x.county_id))
      .map(x => ({ city, county: countyById.get(x.county_id) })));
  const filtered = input.county
    ? matches.filter(x => countyName(x.county.name) === countyName(input.county)) : matches;
  if (!filtered.length) fail(`Municipality not found in active Arkansas GIS geography: ${input.name}`);
  if (filtered.length > 1) return { status: 'needs_county', kind: 'city', name: input.name,
    counties: filtered.map(x => x.county).sort(byName) };
  return { status: 'ready', kind: 'city', geography: filtered[0].city,
    county: filtered[0].county, cities: [] };
}

export function selectionToken(county, cities) {
  const material = [county.id, ...cities.map(c => [c.id, c.dataset_hash]).sort((a, b) => a[0].localeCompare(b[0]))];
  return createHash('sha256').update(JSON.stringify(material)).digest('hex');
}

export function selectedRoutes(resolution, selectedCityIds, confirmed = false, token) {
  if (resolution.status === 'needs_county') fail('Choose the city county before continuing');
  if (resolution.kind === 'county') {
    if (!confirmed || token !== resolution.selection_token || !Array.isArray(selectedCityIds))
      fail('Confirm this county request city selection in chat, including county-only selection');
    if (new Set(selectedCityIds).size !== selectedCityIds.length ||
        selectedCityIds.some(id => !resolution.cities.some(city => city.id === id)))
      fail('Selected city is not in this county list');
    const byId = new Map(resolution.cities.map(city => [city.id, city]));
    return [...selectedCityIds.map(id => byId.get(id)), resolution.county,
      { id: '05', kind: 'state', name: 'Arkansas', state_code: 'AR' }];
  }
  if (selectedCityIds?.length || confirmed || token) fail('City requests do not use county city selection');
  return [resolution.geography, resolution.county,
    { id: '05', kind: 'state', name: 'Arkansas', state_code: 'AR' }];
}

export function planSourceRoutes(routes, capabilities, sources, now = new Date()) {
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const seenCapabilities = new Set();
  return routes.map((geography, order) => {
    const perCategory = Object.fromEntries(categories.map(kind => {
      const attached = capabilities.filter(c => c.route_geography_id === geography.id && c.kind === kind);
      const verified = attached.filter(c => c.availability === 'active' && c.verified_at && c.verified_until &&
        Date.parse(c.verified_at) <= now.getTime() && Date.parse(c.verified_until) > now.getTime() &&
        c.verification_evidence && Object.keys(c.verification_evidence).length > 0 &&
        c.method_spec?.version === 1 && c.parser_version && sourceById.has(c.source_id));
      const runnable = c => c.method === 'api' && c.method_spec?.runner_id === 'sam-search' &&
        ((c.kind === 'opportunity' && sourceById.get(c.source_id)?.code === 'sam') ||
         (c.kind === 'award' && sourceById.get(c.source_id)?.code === 'sam-awards'));
      const known = verified.filter(runnable)
        .filter(c => { if (seenCapabilities.has(c.id)) return false; seenCapabilities.add(c.id); return true; })
        .map(c => ({ capability_id: c.id, source_id: c.source_id,
          source_name: sourceById.get(c.source_id).name, method: c.method }));
      const candidates = sources.filter(s => s.source_coverage_areas?.some(area =>
        geography.kind === 'municipality' ? area.area_type === 'city' && normalize(area.city_name) === normalize(geography.name)
          : geography.kind === 'county' ? area.area_type === 'county' && countyName(area.county_name) === countyName(geography.name)
            : area.state_code === 'AR' && s.contracting_entity_geo_level === 'state'))
        .map(s => ({ source_id: s.id, source_name: s.name }));
      return [kind, { known, needs_research: verified.length === 0,
        needs_implementation: verified.length > 0 && known.length === 0,
        reason: known.length ? null : verified.length ? 'Verified method needs a supported runner'
          : attached.length ? 'No current verified method' : 'No verified method registered',
        source_candidates: known.length ? [] : candidates }];
    }));
    return { order, geography: { id: geography.id, kind: geography.kind, name: geography.name }, categories: perCategory };
  });
}
