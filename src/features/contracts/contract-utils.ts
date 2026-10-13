import type { ContractDateRangePreset, ContractFilters, ContractStatus } from './types';

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

function formatInputDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }

// Calendar dates are local calendar values; timestamp offsets retain their meaning.
export function parseContractDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  const year = Number(match[1]), month = Number(match[2]) - 1, day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : new Date(NaN);
}

export function formatDateLabel(value: string, dateType: 'due' | 'expiring') {
  const date = parseContractDate(value);
  if (Number.isNaN(date.getTime())) return dateType === 'due' ? 'Due date pending' : 'Expiry pending';
  return (dateType === 'due' ? 'Due ' : 'Expires ') + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatKeyDate(keyDate: { kind: 'date' | 'datetime' | 'text'; value: string }) {
  if (keyDate.kind === 'text') return keyDate.value;
  const date = parseContractDate(keyDate.value);
  if (Number.isNaN(date.getTime())) return 'Date pending';
  return keyDate.kind === 'datetime'
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function normalizeUrl(value: string): string | undefined {
  const text = value.trim();
  if (!text || /\s/.test(text)) return undefined;
  const explicitScheme = /^[a-z][a-z\d+.-]*:/i.test(text);
  // Bare domains are supported; relative paths and executable schemes are not.
  if (!explicitScheme && !/^[a-z\d.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text)) return undefined;
  try {
    const url = new URL(explicitScheme ? text : 'https://' + text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
