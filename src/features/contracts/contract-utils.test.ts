import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareContracts,
  getApplicableContractDate,
  getDateRangeBounds,
  matchesContractFilters,
} from './contract-utils';
import type { ContractFilters, ContractOpportunity } from './types';

const filters: ContractFilters = {
  category: 'All', bidType: 'All', dateRangePreset: 'all', query: '', status: 'open',
  closedSubcategory: 'all', sortKey: 'applicable-date', sortDirection: 'asc', changedDateRangePreset: 'all',
};

function contract(overrides: Partial<ContractOpportunity> = {}): ContractOpportunity {
  return {
    id: 'lead-1', projectName: 'Alpha contract', agencyName: 'City of Little Rock', category: 'Government',
    location: 'Little Rock, AR', contactName: 'Contact', dateType: 'due', date: '2026-09-17',
    dateLabel: 'Due Sep 17, 2026', status: 'new', sourceId: 'source-1', nextAction: 'Review', notes: [], history: [],
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('contract date policy', () => {
  it('uses the bid-type key-date priority before the legacy display date', () => {
    const lead = contract({ bidType: 'opportunity', date: '2026-10-01', keyDates: [
      { key: 'publication', label: 'Published', value: '2026-09-10', kind: 'date' },
      { key: 'response-deadline', label: 'Due', value: '2026-09-20', kind: 'datetime' },
    ] });
    expect(getApplicableContractDate(lead)?.value).toBe('2026-09-20');
  });

  it('returns deterministic calendar bounds for this week and this month', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T12:00:00'));
    expect(getDateRangeBounds('this-week')).toEqual({ dateFrom: '2026-09-14', dateTo: '2026-09-20' });
    expect(getDateRangeBounds('this-month')).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(getDateRangeBounds('custom', '2026-09-05', '2026-09-08')).toEqual({ dateFrom: '2026-09-05', dateTo: '2026-09-08' });
  });

  it('filters by applicable date and excludes closed contracts from the open queue', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T12:00:00'));
    expect(matchesContractFilters(contract({ date: '2026-09-17T12:00:00' }), { ...filters, dateRangePreset: 'today' })).toBe(true);
    expect(matchesContractFilters(contract({ date: '2026-09-18T12:00:00' }), { ...filters, dateRangePreset: 'today' })).toBe(false);
    expect(matchesContractFilters(contract({ status: 'won' }), filters)).toBe(false);
  });

  it('uses the project name as a stable tie-breaker when dates match', () => {
    const right = contract({ id: 'lead-2', projectName: 'Bravo contract' });
    expect(compareContracts(contract(), right, filters)).toBeLessThan(0);
  });
});
