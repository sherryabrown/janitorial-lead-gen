import { compactCountyPath } from './lib/county-map-path.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { GIS_BASE, arcgisQuery } from './lib/arkansas-municipalities.mjs';
const source = GIS_BASE + '/48',
  expected = await arcgisQuery(source, {
    where: '1=1',
    returnCountOnly: 'true',
  });
if (expected !== 75) throw Error('Expected all 75 Arkansas counties');
const url =
  source +
  '/query?' +
  new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: 'statefips,countyfips,county',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '4',
    orderByFields: 'statefips',
    resultRecordCount: '100',
  });
const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
if (!response.ok) throw Error('County geometry unavailable');
const raw = await response.text(),
  geo = JSON.parse(raw);
if (geo.error || geo.exceededTransferLimit || geo.features?.length !== expected)
  throw Error('Incomplete county geometry');
const terminal = await arcgisQuery(source, {
  where: '1=1',
  outFields: 'statefips',
  returnGeometry: 'false',
  orderByFields: 'statefips',
  resultOffset: '75',
  resultRecordCount: '100',
});
if (terminal.length) throw Error('Nonterminal county page');
const coordinates = geo.features.flatMap((f) =>
  (f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates
  ).flat(2),
);
const cos = Math.cos((35 * Math.PI) / 180),
  xs = coordinates.map((p) => p[0] * cos),
  ys = coordinates.map((p) => -p[1]);
const minX = xs.reduce((a, b) => Math.min(a, b), Infinity),
  minY = ys.reduce((a, b) => Math.min(a, b), Infinity),
  maxX = xs.reduce((a, b) => Math.max(a, b), -Infinity),
  maxY = ys.reduce((a, b) => Math.max(a, b), -Infinity),
  scale = 540 / Math.max(maxX - minX, maxY - minY);
const project = (p) => [
  Math.round(((p[0] * cos - minX) * scale + 15) * 10) / 10,
  Math.round(((-p[1] - minY) * scale + 15) * 10) / 10,
];
const counties = geo.features
  .map((f) => {
    const id = f.properties.statefips;
    if (id !== '05' + f.properties.countyfips) throw Error('FIPS mismatch');
    const rings = (
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates]
        : f.geometry.coordinates
    ).flat();
    const path = rings
      .map((r) => {
        const pts = r
          .map(project)
          .filter(
            (p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1],
          );
        if (new Set(pts.map((p) => p.join(','))).size < 3)
          throw Error('Quantization collapsed a ring');
        return 'M' + pts.map((p) => p.join(',')).join('L') + 'Z';
      })
      .join('');
    return {
      id,
      name: f.properties.county
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .toLowerCase()
        .replace(/(^|\s)\w/g, (c) => c.toUpperCase()),
      path: compactCountyPath(path),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
const ids = counties.map((c) => c.id).sort();
if (
  new Set(ids).size !== 75 ||
  ids.some((id, i) => id !== '05' + String(i * 2 + 1).padStart(3, '0'))
)
  throw Error('Unexpected county IDs');
mkdirSync('outputs/deployment/admin-ui', { recursive: true });
writeFileSync('outputs/deployment/admin-ui/counties.geojson', raw);
const asset = {
  metadata: {
    source,
    fetched_at: new Date().toISOString(),
    sha256: createHash('sha256').update(raw).digest('hex'),
    projection:
      'Equirectangular, standard parallel 35N; shared global 0.1 SVG-unit grid; consecutive duplicate and exactly collinear forward vertices removed; all rings retained, evenodd fill',
    command: 'node scripts/build-arkansas-county-map.mjs',
    count: 75,
    viewBox: `0 0 ${Math.ceil((maxX - minX) * scale + 30)} ${Math.ceil((maxY - minY) * scale + 30)}`,
  },
  counties,
};
writeFileSync(
  'src/features/admin/data/arkansas-counties.json',
  JSON.stringify(asset),
);
console.log(
  JSON.stringify({
    count: 75,
    bytes: JSON.stringify(asset).length,
    sha256: asset.metadata.sha256,
  }),
);
