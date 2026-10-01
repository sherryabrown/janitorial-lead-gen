import type { ProcurementBidType } from '../../lib/procurement';
import type { ContractDateRangePreset, ContractFilters, ContractOpportunity, ContractSortDirection, ContractStatus, ContractStatusFilter } from './types';

export const closedContractStatuses: ContractStatus[] = ['not-interested', 'won', 'lost', 'withdrew'];

export function getDefaultContractFilters(): ContractFilters {
  return { category: 'All', bidType: 'All', dateRangePreset: 'all', dateFrom: undefined, dateTo: undefined, query: '', status: 'open', closedSubcategory: 'all', sortKey: 'applicable-date', sortDirection: 'asc', changedDateRangePreset: 'all', changedDateFrom: undefined, changedDateTo: undefined };
}

export function getDateRangeBounds(preset: ContractDateRangePreset, dateFrom?: string, dateTo?: string) {
  if (preset === 'custom') return { dateFrom, dateTo };
  if (preset === 'all') return { dateFrom: undefined, dateTo: undefined };
  const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()); let end = new Date(start);
  if (preset === 'this-week') { const mondayOffset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - mondayOffset); end = new Date(start); end.setDate(start.getDate() + 6); }
  else if (preset === 'this-month') { start.setDate(1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0); }
  return { dateFrom: formatInputDate(start), dateTo: formatInputDate(end) };
}

export function getApplicableContractDate(contract: ContractOpportunity) {
  const priorities: Record<ProcurementBidType, string[]> = { forecast: ['publication', 'contract-start'], opportunity: ['response-deadline', 'current-end', 'potential-end', 'publication', 'contract-start'], award: ['current-end', 'potential-end', 'publication', 'contract-start'], unknown: ['publication', 'response-deadline', 'current-end', 'potential-end', 'contract-start'] };
  for (const key of priorities[contract.bidType ?? 'unknown']) { const date = (contract.keyDates ?? []).find((item) => item.key === key && item.kind !== 'text'); if (date && !Number.isNaN(new Date(date.value).getTime())) return date; }
  return contract.date ? { key: 'legacy-date', label: 'Applicable date', value: contract.date, kind: 'date' as const } : null;
}

export function matchesContractFilters(contract: ContractOpportunity, filters: ContractFilters) {
  const query = filters.query.trim().toLowerCase(); const matchesQuery = !query || contract.projectName.toLowerCase().includes(query) || contract.location.toLowerCase().includes(query) || contract.contactName.toLowerCase().includes(query) || (contract.contactPhone ?? '').toLowerCase().includes(query) || (contract.contactEmail ?? '').toLowerCase().includes(query) || contract.agencyName.toLowerCase().includes(query);
  return matchesQuery && (filters.category === 'All' || contract.category === filters.category) && (filters.bidType === 'All' || contract.bidType === filters.bidType) && matchesStatusFilter(contract.status, filters.status) && (filters.status !== 'closed' || filters.closedSubcategory === 'all' || contract.status === filters.closedSubcategory) && matchesContractDateRange(contract, filters);
}

export function matchesContractDateRange(contract: ContractOpportunity, filters: ContractFilters) {
  if (filters.dateRangePreset === 'all') return true; if (filters.dateRangePreset === 'custom' && filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return false;
  const applicable = getApplicableContractDate(contract); if (!applicable) return false; const date = new Date(applicable.value); if (Number.isNaN(date.getTime())) return false;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()); let end = new Date(start);
  if (filters.dateRangePreset === 'today') end = start; if (filters.dateRangePreset === 'this-week') { const mondayOffset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - mondayOffset); end = new Date(start); end.setDate(start.getDate() + 6); } if (filters.dateRangePreset === 'this-month') { start.setDate(1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0); } if (filters.dateRangePreset === 'custom') { const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null; const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null; return (!from || day >= from) && (!to || day <= to); } return day >= start && day <= end;
}

export function compareContracts(a: ContractOpportunity, b: ContractOpportunity, filters: ContractFilters) { if (filters.sortKey === 'added' || filters.sortKey === 'updated') { const field = filters.sortKey === 'added' ? 'addedAt' : 'updatedAt'; return compareTimes(a[field] ? new Date(a[field] as string).getTime() : Number.NaN, b[field] ? new Date(b[field] as string).getTime() : Number.NaN, filters.sortDirection, a, b); } const aDate = getApplicableContractDate(a); const bDate = getApplicableContractDate(b); return compareTimes(aDate ? new Date(aDate.value).getTime() : Number.NaN, bDate ? new Date(bDate.value).getTime() : Number.NaN, filters.sortDirection, a, b); }
function matchesStatusFilter(status: ContractStatus, filter: ContractStatusFilter) { return filter === 'open' ? !closedContractStatuses.includes(status) : filter === 'closed' ? closedContractStatuses.includes(status) : status === filter; }
function compareTimes(a: number, b: number, direction: ContractSortDirection, left: ContractOpportunity, right: ContractOpportunity) { if (Number.isNaN(a) && Number.isNaN(b)) return left.projectName.localeCompare(right.projectName); if (Number.isNaN(a)) return 1; if (Number.isNaN(b)) return -1; const result = a - b; return (direction === 'asc' ? result : -result) || left.projectName.localeCompare(right.projectName); }
function formatInputDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
