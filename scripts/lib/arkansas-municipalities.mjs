import { createHash } from 'node:crypto';

export const GIS_BASE = 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer';
const municipalityLayer = `${GIS_BASE}/41`;
const countyLayer = `${GIS_BASE}/48`;

export async function arcgisQuery(url, params, fetcher = fetch) {
  const response = await fetcher(`${url}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...params }),
  });
  if (!response.ok) throw new Error(`Arkansas GIS HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`Arkansas GIS: ${body.error.message}`);
  if (params.returnCountOnly === 'true') {
    if (!Number.isInteger(body.count)) throw new Error('Arkansas GIS returned no feature count');
    return body.count;
  }
  if (!Array.isArray(body.features)) throw new Error('Arkansas GIS returned no feature list');
  return body.features;
}

export function municipalityRecord(feature, counties) {
  const attributes = feature.attributes ?? {};
  const globalId = String(attributes.globalid ?? '').replace(/[{}-]/g, '').toLowerCase();
  const name = String(attributes.city_name ?? '').trim().replace(/\s+/g, ' ');
  const classification = String(attributes.classification ?? '').trim();
  const placeFips = String(attributes.city_fips ?? '').trim();
  const countyIds = [...new Set(counties.map(x => {
    const a = x.attributes ?? {};
    if (!/^\d{3}$/.test(String(a.countyfips)) ||
        String(a.statefips) !== `05${a.countyfips}`)
      throw new Error(`Invalid county match for ${name}: ${JSON.stringify(a)}`);
    return `05${a.countyfips}`;
  }))].sort();
  if (!/^[0-9a-f]{32}$/.test(globalId) || !name || !classification ||
      (placeFips && !/^\d{5}$/.test(placeFips)) ||
      !feature.geometry?.rings?.length || !countyIds.length)
    throw new Error(`Incomplete GIS municipality: ${name || globalId}`);
  const id = `ARM${globalId}`;
  const datasetHash = createHash('sha256')
    .update(JSON.stringify([id, name, classification, placeFips, countyIds]))
    .digest('hex');
  return { id, name, classification, place_fips: placeFips || null,
    county_ids: countyIds, dataset_hash: datasetHash };
}

export async function fetchMunicipalityManifest(query = arcgisQuery) {
  const expectedCount = await query(municipalityLayer, { where: '1=1', returnCountOnly: 'true' });
  if (!Number.isInteger(expectedCount) || expectedCount < 1)
    throw new Error('Arkansas GIS municipality count unavailable');
  const records = [];
  for (let offset = 0; ; offset += 100) {
    const page = await query(municipalityLayer, {
      where: '1=1', outFields: 'objectid,globalid,city_name,city_fips,classification',
      returnGeometry: 'true', outSR: '26915', orderByFields: 'objectid',
      resultOffset: String(offset), resultRecordCount: '100',
    });
    for (const feature of page) {
      const counties = await query(countyLayer, {
        where: '1=1', outFields: 'statefips,countyfips,county',
        returnGeometry: 'false', geometryType: 'esriGeometryPolygon',
        spatialRel: 'esriSpatialRelRelation', relationParam: 'T********', inSR: '26915',
        geometry: JSON.stringify(feature.geometry),
      });
      records.push(municipalityRecord(feature, counties));
    }
    if (page.length < 100) break;
  }
  if (records.length !== expectedCount || new Set(records.map(x => x.id)).size !== records.length)
    throw new Error('Incomplete or duplicate Arkansas GIS municipality manifest');
  return { dataset_version: new Date().toISOString().slice(0, 10),
    expected_count: expectedCount, municipalities: records.sort((a, b) => a.name.localeCompare(b.name)) };
}
