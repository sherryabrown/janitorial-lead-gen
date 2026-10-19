import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactCountyPath} from '../scripts/lib/county-map-path.mjs';
test('county compaction removes only collinear forward segments, preserving holes and reverse turns',()=>{
  const path='M0,0L1,0L2,0L2,2L0,2L0,0ZM0.5,0.5L1,0.5L1.5,0.5L1.5,1.5L0.5,1.5Z';
  assert.equal(compactCountyPath(path),'M0,0L2,0L2,2L0,2L0,0ZM0.5,0.5L1.5,0.5L1.5,1.5L0.5,1.5Z');
  assert.equal(compactCountyPath('M0,0L2,0L1,0L2,2L0,0Z'),'M0,0L2,0L1,0L2,2L0,0Z');
});
test('all 75 production county paths remain stable under exact compaction',()=>{
  const asset=JSON.parse(readFileSync('src/features/admin/data/arkansas-counties.json'));
  assert.equal(new Set(asset.counties.map(c=>c.id)).size,75);
  for(const c of asset.counties)assert.equal(compactCountyPath(c.path),c.path);
});
