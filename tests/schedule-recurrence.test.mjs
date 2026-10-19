import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence,latestOccurrence,validateRecurrence,rollingWindows } from '../scripts/lib/schedule-recurrence.mjs';
const daily=times=>({timezone:'America/Chicago',frequency:'daily',local_times:times});
test('multiple daily times are ordered and each due instant is distinct',()=>{
  const r=validateRecurrence(daily(['16:00','08:00','12:00']));
  assert.deepEqual(r.local_times,['08:00','12:00','16:00']);
  assert.equal(nextOccurrence(r,'2026-10-13T13:00:00Z'),'2026-10-13T17:00:00.000Z');
  assert.equal(nextOccurrence(r,'2026-10-13T17:00:00Z'),'2026-10-13T21:00:00.000Z');
  assert.equal(latestOccurrence(r,'2026-10-13T20:00:00Z'),'2026-10-13T17:00:00.000Z');
});
test('spring gap uses first valid minute and fall fold executes once at first instant',()=>{
  const gap=daily(['02:30']);
  assert.equal(nextOccurrence(gap,'2026-03-08T06:00:00Z'),'2026-03-08T08:00:00.000Z');
  const fold=daily(['01:30']);
  assert.equal(nextOccurrence(fold,'2026-11-01T05:00:00Z'),'2026-11-01T06:30:00.000Z');
  assert.equal(nextOccurrence(fold,'2026-11-01T06:30:00Z'),'2026-11-02T07:30:00.000Z');
});
test('weekly days and monthly short/leap/year rollover obey local calendar',()=>{
  const weekly={...daily(['09:00']),frequency:'weekly',weekdays:[1,5]};
  assert.equal(nextOccurrence(weekly,'2026-10-13T13:00:00Z'),'2026-10-16T14:00:00.000Z');
  const monthly={...daily(['09:00']),frequency:'monthly',month_day:31};
  assert.equal(nextOccurrence(monthly,'2026-02-01T00:00:00Z'),'2026-02-28T15:00:00.000Z');
  assert.equal(nextOccurrence(monthly,'2028-02-01T00:00:00Z'),'2028-02-29T15:00:00.000Z');
  assert.equal(nextOccurrence(monthly,'2026-12-31T16:00:00Z'),'2027-01-31T15:00:00.000Z');
});
test('invalid cadence combinations are rejected and rolling dates use Central local day',()=>{
  for(const r of [daily([]),daily(['09:00','09:00']),daily(['24:00']),{...daily(['09:00']),timezone:'UTC'},
    {...daily(['09:00','12:00']),frequency:'weekly',weekdays:[1]}, {...daily(['09:00']),frequency:'monthly',month_day:0}])assert.throws(()=>validateRecurrence(r));
  const window=rollingWindows({opportunity:{from_offset_days:0,to_offset_days:365,date_basis:'deadline'}},['opportunity'],'2026-10-14T02:00:00Z');
  assert.equal(window.opportunity.from,'2026-10-13');assert.equal(window.opportunity.to,'2027-10-13');
});
