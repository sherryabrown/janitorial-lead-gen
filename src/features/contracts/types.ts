import type { ProcurementBidType, ProcurementKeyDate } from '../../lib/procurement';
import type { ClosedSubcategory, LeadHistoryItem, LeadNote } from '../shared/types';

export type ContractCategory = 'School' | 'Government' | 'Medical';
export type ContractStatus = 'new' | 'interested' | 'not-interested' | 'applied' | 'hold' | 'won' | 'lost' | 'withdrew';
export type ContractDateType = 'due' | 'expiring';
export type ContractStatusFilter = 'open' | 'closed' | ContractStatus;
export type ContractView = 'admin' | ContractStatusFilter;
export type ContractBidTypeFilter = 'All' | ProcurementBidType;
export type ContractDateRangePreset = 'all' | 'today' | 'this-week' | 'this-month' | 'custom';
export type ContractSortKey = 'applicable-date' | 'added' | 'updated';
export type ContractSortDirection = 'asc' | 'desc';
export type SourceStatus = 'needs-review' | 'current';

export type BidSource = { id: string; name: string; agencyType: 'County' | 'City' | 'Municipality' | 'School district' | 'Agency'; location: string; category: ContractCategory; url: string; status: SourceStatus; lastChecked: string };
export type ContractOpportunity = { id: string; projectName: string; agencyName: string; category: ContractCategory; location: string; contactName: string; contactPhone?: string; contactEmail?: string; bidType?: ProcurementBidType; keyDates?: ProcurementKeyDate[]; dateType: ContractDateType; date: string; dateLabel: string; estimatedValue?: string; status: ContractStatus; sourceId: string; sourceUrl?: string; addedAt?: string; updatedAt?: string; nextAction: string; notes: LeadNote[]; researchNotes?: string[]; history: LeadHistoryItem[]; stageReason?: string };
export type ContractFilters = { category: 'All' | ContractCategory; bidType: ContractBidTypeFilter; dateRangePreset: ContractDateRangePreset; dateFrom?: string; dateTo?: string; query: string; status: ContractStatusFilter; closedSubcategory: ClosedSubcategory; sortKey: ContractSortKey; sortDirection: ContractSortDirection; changedDateRangePreset: ContractDateRangePreset; changedDateFrom?: string; changedDateTo?: string };
export type ContractAction = 'interested' | 'hold' | 'not-interested' | 'applied' | 'won' | 'lost' | 'withdrew';
export type ContractStageReason = { code: string; note?: string };
export type { ClosedSubcategory, LeadHistoryItem, LeadNote };
