import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDateRangeBounds } from './contract-utils';

afterEach(() => vi.useRealTimers());

describe('contract date policy', () => {
  it('returns deterministic calendar bounds for this week and this month', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T12:00:00'));
    expect(getDateRangeBounds('this-week')).toEqual({ dateFrom: '2026-09-14', dateTo: '2026-09-20' });
    expect(getDateRangeBounds('this-month')).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(getDateRangeBounds('custom', '2026-09-05', '2026-09-08')).toEqual({ dateFrom: '2026-09-05', dateTo: '2026-09-08' });
  });

});
