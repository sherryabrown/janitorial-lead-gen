import test from 'node:test';
import assert from 'node:assert/strict';
import { municipalityRecord, fetchMunicipalityManifest } from '../scripts/lib/arkansas-municipalities.mjs';

const feature = { attributes: {
  globalid: '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}',
  city_name: '  Bergman  ', city_fips: '12345', classification: 'Incorporated',
}, geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
const county = code => ({ attributes: { statefips: `05${code}`, countyfips: code } });

test('GIS names are clean and county links are deduplicated', () => {
  const record = municipalityRecord(feature, [county('009'), county('009'), county('001')]);
  assert.equal(record.id, 'ARMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(record.name, 'Bergman');
  assert.equal(record.place_fips, '12345');
  assert.deepEqual(record.county_ids, ['05001', '05009']);
  assert.equal(record.dataset_hash.length, 64);
  assert.throws(() => municipalityRecord(feature, []), /Incomplete/);
  assert.throws(() => municipalityRecord(feature, [{ attributes: { statefips: '04', countyfips: '009' } }]), /Invalid county/);
});

test('manifest fetches municipalities and official county interior overlaps', async () => {
  const calls = [];
  const manifest = await fetchMunicipalityManifest(async (url, params) => {
    calls.push({ url, params });
    if (params.returnCountOnly === 'true') return 1;
    return url.endsWith('/41') ? [feature] : [county('009')];
  });
  assert.equal(manifest.expected_count, 1);
  assert.equal(manifest.municipalities[0].name, 'Bergman');
  assert.equal(calls[2].params.spatialRel, 'esriSpatialRelRelation');
  assert.equal(calls[2].params.relationParam, 'T********');
  assert.equal(calls[2].params.returnGeometry, 'false');
});
