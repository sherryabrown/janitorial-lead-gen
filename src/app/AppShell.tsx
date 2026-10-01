import { AuthGate } from '../features/auth/AuthGate';
import type { ContractCategory, ContractStatus, ContractDateType, ContractStatusFilter, ContractView, ContractBidTypeFilter, ContractDateRangePreset, ContractSortKey, ContractSortDirection, GenerateStatus, BidSource, ContractOpportunity, ContractFilters, ContractAction, ContractStageReason } from '../features/contracts/types';
import { getDefaultContractFilters } from '../features/contracts/contract-utils';
import { saveLeadChange } from '../features/contracts/save-lead-change';
import {
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCheck,
  Clock3,
  FileCheck2,
  History,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  School,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { addProcurementLeadNote, bulkUpdateProcurementLeadStage, loadProcurementContracts, loadProcurementLeadDetail, loadProcurementLeadHistory, updateProcurementLeadStage, editProcurementLeadNote, type ProcurementHistoryRow, type ProcurementBidType } from '../lib/procurement';
import {
  closedContractStatuses as contractClosedStatuses,
  getDateRangeBounds as getContractDateRangeBounds,
} from '../features/contracts/contract-utils';
import { ResearchContext } from '../features/contracts/ResearchContext';
import { formatDateLabel, formatKeyDate, normalizeUrl } from '../features/contracts/contract-utils';
import { ComingSoon, ModeSwitch } from '../features/shared/components/ModeSwitch';
import { EmptyQueueState } from '../features/shared/components/EmptyQueueState';
import { InfoTooltip } from '../features/shared/components/InfoTooltip';

function getLoadContractsErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const message = typeof details.message === 'string' ? details.message : 'Unable to load contracts.';
    const context = [details.code, details.details, details.hint].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return context.length > 0 ? `${message} (${context.join(' — ')})` : message;
  }
  return 'Unable to load contracts.';
}
import type { Session } from '@supabase/supabase-js';

type WorkMode = 'contracts' | 'companies';
type Fit = 'High' | 'Medium' | 'Low';
type ContextPanelMode = 'note' | 'history' | 'email';
type HistoryType = 'status' | 'note' | 'note-edit' | 'system' | 'lead-identified';

type ClosedSubcategory = 'all' | 'won' | 'lost' | 'not-interested' | 'withdrew';

type CompanyStatusCategory = 'new' | 'ready-to-email' | 'needs-call' | 'in-progress' | 'closed';
type CompanyProgressStatus =
  | 'waiting-on-customer'
  | 'follow-up-in-2-days'
  | 'follow-up-next-week'
  | 'quote-sent'
  | 'decision-pending';
type CompanyClosedReason =
  | 'won'
  | 'lost'
  | 'not-interested'
  | 'withdrew'
  | 'too-small'
  | 'no-budget'
  | 'has-provider'
  | 'bad-fit';

type LeadHistoryItem = {
  id: string;
  noteId?: string;
  occurredAt?: string;
  updatedAt?: string;
  at: string;
  label: string;
  detail?: string;
  type: HistoryType;
};

type LeadNote = {
  id: string;
  at: string;
  text: string;
};

type CompanyLead = {
  id: string;
  businessName: string;
  category: string;
  location: string;
  distance: string;
  contactName: string;
  phone: string;
  email?: string;
  estimatedSqFt: string;
  fit: Fit;
  statusCategory: CompanyStatusCategory;
  progressStatus?: CompanyProgressStatus;
  closedReason?: CompanyClosedReason;
  nextAction: string;
  reason: string;
  addedAt: string;
  notes: LeadNote[];
  history: LeadHistoryItem[];
};

type CompanyFilters = {
  status: CompanyStatusCategory;
  query: string;
  closedSubcategory: ClosedSubcategory;
};

type GenerateContractsForm = {
  city: string;
  zip: string;
  county: string;
};

type GenerateContractsSource = {
  id: string;
  entityName: string;
  portalType: string;
  bidsUrl?: string | null;
  awardsUrl?: string | null;
  confidence: 'high' | 'medium' | 'low';
  needsHumanReview: boolean;
};

type GenerateContractsOpportunity = {
  id: string;
  sourceId?: string | null;
  projectName: string;
  agencyName: string;
  category: ContractCategory;
  location?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  dueAt?: string | null;
  expiresAt?: string | null;
  estimatedValue?: string | null;
  status: 'new';
  sourceUrl?: string | null;
  summary?: string | null;
};

type GenerateContractsResponse = {
  runId?: string;
  status: 'completed' | 'needs-review' | 'failed';
  stage: string;
  normalizedLocation?: string;
  sources: GenerateContractsSource[];
  opportunities: GenerateContractsOpportunity[];
  message?: string;
};

type GeneratePanelState = {
  status: GenerateStatus;
  stage?: string;
  message?: string;
  normalizedLocation?: string;
  sources: GenerateContractsSource[];
  opportunities: GenerateContractsOpportunity[];
};

type CompanyAction =
  | 'review-email'
  | 'approve-email'
  | 'call'
  | 'in-progress'
  | 'waiting-on-customer'
  | 'follow-up'
  | 'won'
  | 'closed-lost'
  | 'closed-not-interested'
  | 'closed-too-small'
  | 'closed-no-budget'
  | 'closed-has-provider'
  | 'closed-bad-fit'
  | 'closed-withdrew'
  | 'reopen';

type SummaryItem<T extends string> = {
  key: T;
  label: string;
  shortLabel: string;
  count: number;
  icon: typeof Building2;
  closedSubcategories?: Array<{ key: ClosedSubcategory; label: string; count: number }>;
  selectedClosedSubcategory?: ClosedSubcategory;
  isClosedSubcategoryExpanded?: boolean;
};

const senderName = 'John Doe';
const senderEmail = 'john@janitorialleadgen.example';

const statusLabels: Record<ContractStatus, string> = {
  new: 'New',
  interested: 'Interested',
  'not-interested': 'Not interested',
  applied: 'Applied',
  hold: 'Hold',
  won: 'Won',
  lost: 'Lost',
  withdrew: 'Withdrew',
};
const contractReasonOptions = ['No budget', 'Bad timing', 'Another vendor', 'Too small', 'Too large', 'Labor/staffing challenge', 'Scope not a fit', 'Deadline passed', 'Other'];

const companyStatusLabels: Record<CompanyStatusCategory, string> = {
  new: 'New',
  'ready-to-email': 'Ready to email',
  'needs-call': 'Needs call',
  'in-progress': 'In progress',
  closed: 'Closed',
};

const progressLabels: Record<CompanyProgressStatus, string> = {
  'waiting-on-customer': 'Waiting on customer',
  'follow-up-in-2-days': 'Follow up in 2 days',
  'follow-up-next-week': 'Follow up next week',
  'quote-sent': 'Quote sent',
  'decision-pending': 'Decision pending',
};

const closedReasonLabels: Record<CompanyClosedReason, string> = {
  won: 'Won',
  lost: 'Lost',
  'not-interested': 'Not interested',
  withdrew: 'Withdrew',
  'too-small': 'Too small',
  'no-budget': 'No budget',
  'has-provider': 'Has provider',
  'bad-fit': 'Bad fit',
};

const contractSummaryStatusOrder: ContractStatus[] = ['new', 'interested', 'applied', 'hold'];
const companyStatusOrder: CompanyStatusCategory[] = [
  'new',
  'ready-to-email',
  'needs-call',
  'in-progress',
  'closed',
];
const closedSubcategoryConfig: Array<{ key: ClosedSubcategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'not-interested', label: 'Not interested' },
  { key: 'withdrew', label: 'Withdrew' },
];
const companyCloseReasons: Array<{ action: CompanyAction; label: string }> = [
  { action: 'closed-lost', label: 'Lost' },
  { action: 'closed-not-interested', label: 'Not interested' },
  { action: 'closed-too-small', label: 'Too small' },
  { action: 'closed-no-budget', label: 'No budget' },
  { action: 'closed-has-provider', label: 'Has provider' },
  { action: 'closed-bad-fit', label: 'Bad fit' },
  { action: 'closed-withdrew', label: 'Withdrew' },
];
const fitRank: Record<Fit, number> = { High: 0, Medium: 1, Low: 2 };

const mockCompanies: CompanyLead[] = [
  makeCompany({
    id: 'company-001',
    businessName: 'River Market Dental',
    category: 'Dental clinic',
    location: 'Downtown Little Rock, AR',
    distance: '1.8 mi',
    contactName: 'Mara Ellis',
    phone: '(501) 555-0184',
    email: 'office@rivermarketdental.example',
    estimatedSqFt: '4.2k sq ft',
    fit: 'High',
    statusCategory: 'new',
    nextAction: 'Choose email or call',
    reason: 'Good fit',
    addedAt: 'Today, 9:18 AM',
    history: ['Found from local business list', 'Owner listed'],
  }),
  makeCompany({
    id: 'company-002',
    businessName: 'Hillcrest Family Care',
    category: 'Medical office',
    location: 'Hillcrest, Little Rock, AR',
    distance: '3.1 mi',
    contactName: 'Tonya Price',
    phone: '(501) 555-0129',
    estimatedSqFt: '5.8k sq ft',
    fit: 'High',
    statusCategory: 'new',
    nextAction: 'Call front desk',
    reason: 'No email found',
    addedAt: 'Today, 10:04 AM',
    history: ['Clinic has evening hours', 'No public email'],
  }),
  makeCompany({
    id: 'company-003',
    businessName: 'Argenta Fitness Studio',
    category: 'Fitness studio',
    location: 'North Little Rock, AR',
    distance: '4.6 mi',
    contactName: 'Chris Wynn',
    phone: '(501) 555-0177',
    email: 'hello@argentafit.example',
    estimatedSqFt: '3.6k sq ft',
    fit: 'Medium',
    statusCategory: 'ready-to-email',
    nextAction: 'Approve intro email',
    reason: 'High traffic',
    addedAt: 'Today, 8:35 AM',
    history: ['Email draft ready'],
  }),
  makeCompany({
    id: 'company-004',
    businessName: 'Benton Road Dental Arts',
    category: 'Dental clinic',
    location: 'Benton, AR',
    distance: '24.4 mi',
    contactName: 'Nia Benton',
    phone: '(501) 555-0193',
    email: 'care@bentonroadarts.example',
    estimatedSqFt: '4.9k sq ft',
    fit: 'High',
    statusCategory: 'needs-call',
    nextAction: 'Call today',
    reason: 'Email opened',
    addedAt: 'Tue, 2:12 PM',
    notes: [{ id: 'company-note-004', at: 'Yesterday, 4:20 PM', text: 'Mention evening cleaning.' }],
    history: ['Email approved', 'Opened twice'],
  }),
  makeCompany({
    id: 'company-005',
    businessName: 'Riverdale Therapy Group',
    category: 'Medical office',
    location: 'Riverdale, Little Rock, AR',
    distance: '2.7 mi',
    contactName: 'Dana Cole',
    phone: '(501) 555-0105',
    estimatedSqFt: '3.8k sq ft',
    fit: 'High',
    statusCategory: 'in-progress',
    progressStatus: 'follow-up-in-2-days',
    nextAction: 'Send estimate note',
    reason: 'Asked for range',
    addedAt: 'Today, 8:02 AM',
    notes: [{ id: 'company-note-005', at: 'Today, 10:45 AM', text: 'Asked for ballpark range.' }],
    history: ['Call completed', 'Follow up set'],
  }),
  makeCompany({
    id: 'company-006',
    businessName: 'Chenal Pediatric Dentistry',
    category: 'Dental clinic',
    location: 'Chenal, Little Rock, AR',
    distance: '8.8 mi',
    contactName: 'Robin Voss',
    phone: '(501) 555-0124',
    email: 'manager@chenalpediatric.example',
    estimatedSqFt: '5.5k sq ft',
    fit: 'High',
    statusCategory: 'closed',
    closedReason: 'won',
    nextAction: 'Ready for onboarding',
    reason: 'Decision made',
    addedAt: 'Yesterday, 12:30 PM',
    history: ['Quote accepted', 'Won'],
  }),
  makeCompany({
    id: 'company-007',
    businessName: 'Conway Church Offices',
    category: 'Church office',
    location: 'Conway, AR',
    distance: '31.6 mi',
    contactName: 'Paula Reed',
    phone: '(501) 555-0132',
    estimatedSqFt: '6.3k sq ft',
    fit: 'Low',
    statusCategory: 'closed',
    closedReason: 'too-small',
    nextAction: 'No action',
    reason: 'Seasonal only',
    addedAt: 'Mon, 9:40 AM',
    history: ['Closed: too small'],
  }),
  makeCompany({
    id: 'company-008',
    businessName: 'Maumelle Property Group',
    category: 'Property management',
    location: 'Maumelle, AR',
    distance: '13.2 mi',
    contactName: 'Renee Holt',
    phone: '(501) 555-0141',
    email: 'renee@maumelleproperty.example',
    estimatedSqFt: '12k sq ft',
    fit: 'High',
    statusCategory: 'closed',
    closedReason: 'lost',
    nextAction: 'No action',
    reason: 'Chose bundled maintenance vendor',
    addedAt: 'Fri, 3:20 PM',
    history: ['Closed: lost', 'Customer chose another provider'],
  }),
  makeCompany({
    id: 'company-009',
    businessName: 'Sherwood Legal Suites',
    category: 'Small law office',
    location: 'Sherwood, AR',
    distance: '9.7 mi',
    contactName: 'Alan Frey',
    phone: '(501) 555-0118',
    email: 'frontdesk@sherwoodlegal.example',
    estimatedSqFt: '2.9k sq ft',
    fit: 'Medium',
    statusCategory: 'closed',
    closedReason: 'not-interested',
    nextAction: 'No action',
    reason: 'Not changing cleaners this year',
    addedAt: 'Thu, 1:10 PM',
    history: ['Closed: not interested'],
  }),
  makeCompany({
    id: 'company-010',
    businessName: 'Bowman Road Learning Center',
    category: 'Daycare',
    location: 'West Little Rock, AR',
    distance: '6.4 mi',
    contactName: 'Jules Harper',
    phone: '(501) 555-0156',
    email: 'director@bowmanlearning.example',
    estimatedSqFt: '7.1k sq ft',
    fit: 'Medium',
    statusCategory: 'closed',
    closedReason: 'withdrew',
    nextAction: 'No action',
    reason: 'Owner paused vendor search',
    addedAt: 'Wed, 11:25 AM',
    history: ['Withdrew', 'Owner paused project'],
  }),
];

function App() {
  return <AuthGate>{session => <AppShell session={session} onSignOut={() => void supabase?.auth.signOut()} />}</AuthGate>;
}

function AppShell({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [workMode, setWorkMode] = useState<WorkMode>('contracts');
  const [contractView, setContractView] = useState<ContractView>('open');
  const [contracts, setContracts] = useState<ContractOpportunity[]>([]);
  const [contractPage, setContractPage] = useState(0);
  const [contractTotal, setContractTotal] = useState(0);
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});
  const [checkedContractRecords, setCheckedContractRecords] = useState<Map<string, ContractOpportunity>>(new Map());
  const [companies, setCompanies] = useState<CompanyLead[]>(mockCompanies);
  const [sources, setSources] = useState<BidSource[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [contractsLoading, setContractsLoading] = useState(true);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [contractsRefreshError, setContractsRefreshError] = useState<string | null>(null);
  const [isRefreshingContracts, setIsRefreshingContracts] = useState(false);
  const [lastContractsSyncAt, setLastContractsSyncAt] = useState<Date | null>(null);
  const [contractsRefreshVersion, setContractsRefreshVersion] = useState(0);
  const [selectedCompanyId, setSelectedCompanyId] = useState(mockCompanies[0].id);
  const [checkedContractIds, setCheckedContractIds] = useState<Set<string>>(new Set());
  const [checkedCompanyIds, setCheckedCompanyIds] = useState<Set<string>>(new Set());
  const [contextMode, setContextMode] = useState<ContextPanelMode>('note');
  const [expandedClosedMode, setExpandedClosedMode] = useState<WorkMode | null>(null);
  const [contractFilters, setContractFilters] = useState<ContractFilters>({
    category: 'All',
    bidType: 'All',
    dateRangePreset: 'all',
    query: '',
    status: 'open',
    closedSubcategory: 'all',
    sortKey: 'applicable-date',
    sortDirection: 'asc',
    changedDateRangePreset: 'all',
    changedDateFrom: undefined,
    changedDateTo: undefined,
  });
  const [companyFilters, setCompanyFilters] = useState<CompanyFilters>({
    status: 'new',
    query: '',
    closedSubcategory: 'all',
  });
  const [generatePanel, setGeneratePanel] = useState<GeneratePanelState>({
    status: 'idle',
    sources: [],
    opportunities: [],
  });
  const contractRequestSequence = useRef(0);
  const historyRequestSequence = useRef(0);
  const contractRefreshTimer = useRef<number | null>(null);
  const lastContractRefreshAt = useRef(0);

  const refreshContracts = useCallback(async ({ initial = false }: { initial?: boolean } = {}) => {
    const requestId = ++contractRequestSequence.current;
    if (!supabase) {
      if (initial) {
        setContractsLoading(false);
        setContractsError('Supabase is not configured for production contract data.');
      } else {
        setContractsRefreshError('Refresh unavailable. Supabase is not configured.');
      }
      return;
    }

    if (initial) setContractsLoading(true);
    else setIsRefreshingContracts(true);
    setContractsRefreshError(null);

    const client = supabase;
    try {
      const bounds = getContractDateRangeBounds(contractFilters.dateRangePreset, contractFilters.dateFrom, contractFilters.dateTo);
      const changed = getContractDateRangeBounds(contractFilters.changedDateRangePreset, contractFilters.changedDateFrom, contractFilters.changedDateTo);
      const result = await loadProcurementContracts(client, { ...contractFilters, ...bounds,
        changedFrom: changed.dateFrom, changedTo: changed.dateTo, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, contractPage);
      if (requestId !== contractRequestSequence.current) return;
      const mappedContracts = result.contracts.map((contract) =>
        makeContract({
          ...contract,
          dateLabel: formatDateLabel(contract.date, contract.dateType),
          history: contract.history,
          notes: [],
          researchNotes: [...contract.researchNotes, ...contract.notes],
        }),
      );
      setContractTotal(result.total);
      setQueueCounts(result.counts);
      if (contractPage > 0 && contractPage * 50 >= result.total) {
        setContractPage(Math.max(0, Math.ceil(result.total / 50) - 1));
      }
      setContracts((current) => {
        const currentById = new Map(current.map((contract) => [contract.id, contract]));
        return mappedContracts.map((contract) => {
          const existing = currentById.get(contract.id);
          return existing ? { ...contract, history: existing.history, notes: existing.notes } : contract;
        });
      });
      setSources(result.sources);
      setCheckedContractRecords((current) => {
        const next = new Map(current);
        for (const row of mappedContracts) if (next.has(row.id)) next.set(row.id, row);
        return next;
      });
      setContractsError(null);
      setLastContractsSyncAt(new Date());
      setContractsRefreshVersion((current) => current + 1);
      lastContractRefreshAt.current = Date.now();
    } catch (error) {
      if (requestId !== contractRequestSequence.current) return;
      if (initial) {
        const message = getLoadContractsErrorMessage(error);
        setContractsError(
          /401|403|permission|row-level|not authorized|jwt/i.test(message)
            ? 'Access denied. Your session could not access procurement contracts. Sign in again or retry.'
            : message,
        );
      } else setContractsRefreshError('Could not refresh contracts. Try again.');
    } finally {
      if (requestId === contractRequestSequence.current) {
        setContractsLoading(false);
        setIsRefreshingContracts(false);
      }
    }
  }, [contractFilters, contractPage]);

  const latestContractRefresh = useRef(refreshContracts);
  useEffect(() => { latestContractRefresh.current = refreshContracts; }, [refreshContracts]);
  const queueContractRefresh = useCallback(() => {
    if (contractRefreshTimer.current !== null) return;
    contractRefreshTimer.current = window.setTimeout(() => {
      contractRefreshTimer.current = null;
      void latestContractRefresh.current();
    }, 750);
  }, []);

  const visibleContracts = contracts;
  const visibleCompanies = useMemo(
    () =>
      companies
        .filter((company) => matchesCompanyFilters(company, companyFilters))
        .sort((a, b) => fitRank[a.fit] - fitRank[b.fit]),
    [companies, companyFilters],
  );
  const selectedContract =
    visibleContracts.find((contract) => contract.id === selectedContractId) ??
    visibleContracts[0];
  const selectedCompany =
    companies.find((company) => company.id === selectedCompanyId) ??
    visibleCompanies[0] ??
    companies[0];
  const selectedSource = sources.find((source) => source.id === selectedContract?.sourceId);

  const refreshContractHistory = useCallback(async (contractId: string) => {
    if (!supabase) return false;
    const requestId = ++historyRequestSequence.current;
    const [rows, detail] = await Promise.all([loadProcurementLeadHistory(supabase, contractId), loadProcurementLeadDetail(supabase, contractId)]);
    if (requestId !== historyRequestSequence.current) return false;
    const history = rows.map(mapProcurementHistory);
    const notes = rows
      .filter((row) => row.event_type === 'note_added' && row.note_text && !(row.metadata as { edit?: boolean }).edit)
      .map((row) => ({ id: row.id, at: formatHistoryTimestamp(row.occurred_at), text: row.note_text ?? '' }));
    setContracts((current) => current.map((contract) => contract.id === contractId ? { ...contract, researchNotes: [...detail.researchNotes, ...detail.notes], history, notes } : contract));
    return true;
  }, []);

  const historyContractId = selectedContract?.id;
  useEffect(() => {
    if (!historyContractId) return;
    void refreshContractHistory(historyContractId).catch(() => setContractsRefreshError('History could not refresh. Retry refresh.'));
    return () => {
      historyRequestSequence.current += 1;
    };
  }, [contractsRefreshVersion, historyContractId, refreshContractHistory]);

  useEffect(() => {
    setContractPage(0);
    setCheckedContractIds(new Set());
    setCheckedContractRecords(new Map());
  }, [contractFilters]);
  const visibleCheckedContractIds = visibleContracts
    .map((contract) => contract.id)
    .filter((id) => checkedContractIds.has(id));
  const visibleCheckedCompanyIds = visibleCompanies
    .map((company) => company.id)
    .filter((id) => checkedCompanyIds.has(id));
  const allVisibleContractsSelected =
    visibleContracts.length > 0 && visibleCheckedContractIds.length === visibleContracts.length;
  const allVisibleCompaniesSelected =
    visibleCompanies.length > 0 && visibleCheckedCompanyIds.length === visibleCompanies.length;

  const contractClosedSubcategories = useMemo(
    () =>
      closedSubcategoryConfig.map((item) => ({
        ...item,
        count:
          item.key === 'all'
            ? contractClosedStatuses.reduce((count, status) => count + (queueCounts[status] ?? 0), 0)
            : queueCounts[item.key] ?? 0,
      })),
    [queueCounts],
  );
  const companyClosedSubcategories = useMemo(
    () =>
      closedSubcategoryConfig.map((item) => ({
        ...item,
        count:
          item.key === 'all'
            ? companies.filter((company) => company.statusCategory === 'closed').length
            : companies.filter(
                (company) =>
                  company.statusCategory === 'closed' && company.closedReason === item.key,
              ).length,
      })),
    [companies],
  );
  const contractSummary = useMemo<SummaryItem<ContractStatusFilter>[]>(
    () => [
      {
        key: 'open',
        label: 'Open contracts',
        shortLabel: 'Open',
        count: Object.entries(queueCounts).filter(([status]) => !contractClosedStatuses.includes(status as ContractStatus)).reduce((count, [, value]) => count + value, 0),
        icon: BriefcaseBusiness,
      },
      ...contractSummaryStatusOrder.map((status) => ({
        key: status,
        label: statusLabels[status],
        shortLabel: statusLabels[status],
        count: queueCounts[status] ?? 0,
        icon: getContractIcon(status),
      })),
      {
        key: 'closed',
        label: 'Closed contracts',
        shortLabel: 'Closed',
        count: contractClosedStatuses.reduce((count, status) => count + (queueCounts[status] ?? 0), 0),
        icon: CheckCheck,
        closedSubcategories: contractClosedSubcategories,
        selectedClosedSubcategory: contractFilters.closedSubcategory,
        isClosedSubcategoryExpanded: expandedClosedMode === 'contracts',
      },
    ],
    [contractClosedSubcategories, contractFilters.closedSubcategory, queueCounts, expandedClosedMode],
  );
  const companySummary = useMemo<SummaryItem<CompanyStatusCategory>[]>(
    () =>
      companyStatusOrder.map((status) => ({
        key: status,
        label: companyStatusLabels[status],
        shortLabel: companyStatusLabels[status],
        count: companies.filter((company) => company.statusCategory === status).length,
        icon: getCompanyIcon(status),
        closedSubcategories: status === 'closed' ? companyClosedSubcategories : undefined,
        selectedClosedSubcategory:
          status === 'closed' ? companyFilters.closedSubcategory : undefined,
        isClosedSubcategoryExpanded:
          status === 'closed' ? expandedClosedMode === 'companies' : undefined,
      })),
    [companies, companyClosedSubcategories, companyFilters.closedSubcategory, expandedClosedMode],
  );

  useEffect(() => {
    void refreshContracts({ initial: true });
    return () => {
      contractRequestSequence.current += 1;
    };
  }, [refreshContracts]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel('procurement-leads-freshness')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'procurement_leads' }, queueContractRefresh)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [queueContractRefresh]);

  useEffect(() => {
    const revalidateOnFocus = () => {
      if (Date.now() - lastContractRefreshAt.current >= 15_000) queueContractRefresh();
    };
    window.addEventListener('focus', revalidateOnFocus);
    return () => window.removeEventListener('focus', revalidateOnFocus);
  }, [queueContractRefresh]);

  useEffect(() => () => {
    if (contractRefreshTimer.current !== null) window.clearTimeout(contractRefreshTimer.current);
  }, []);

  useEffect(() => {
    if (workMode === 'contracts' && !visibleContracts.some((contract) => contract.id === selectedContractId)) {
      setSelectedContractId(visibleContracts[0]?.id ?? '');
    }
  }, [selectedContractId, visibleContracts, workMode]);

  useEffect(() => {
    if (
      workMode === 'companies' &&
      visibleCompanies[0] &&
      !visibleCompanies.some((company) => company.id === selectedCompanyId)
    ) {
      setSelectedCompanyId(visibleCompanies[0].id);
    }
  }, [selectedCompanyId, visibleCompanies, workMode]);

  const selectWorkMode = (mode: WorkMode) => {
    setWorkMode(mode);
    setExpandedClosedMode(null);
    setContextMode(
      mode === 'companies' && selectedCompany?.statusCategory === 'ready-to-email' ? 'email' : 'note',
    );
    setCheckedContractIds(new Set());
    setCheckedCompanyIds(new Set());
  };

  const selectContractSummary = (status: ContractStatusFilter) => {
    setContractView(status);
    setContractFilters((current) => ({
      ...current,
      status,
      closedSubcategory: status === 'closed' ? current.closedSubcategory : 'all',
    }));
    setExpandedClosedMode((current) =>
      status === 'closed' ? (current === 'contracts' ? null : 'contracts') : null,
    );
    setCheckedContractIds(new Set());
  };

  const selectGenerateContracts = () => {
    setContractView('generate');
    setExpandedClosedMode(null);
    setCheckedContractIds(new Set());
    setContextMode('note');
  };

  const selectCompanySummary = (status: CompanyStatusCategory) => {
    setCompanyFilters((current) => ({
      ...current,
      status,
      closedSubcategory: status === 'closed' ? current.closedSubcategory : 'all',
    }));
    setExpandedClosedMode((current) =>
      status === 'closed' ? (current === 'companies' ? null : 'companies') : null,
    );
    setContextMode(status === 'ready-to-email' ? 'email' : 'note');
    setCheckedCompanyIds(new Set());
  };

  const applyContractAction = async (ids: string[], action: ContractAction, reason?: ContractStageReason) => {
    const meta = getContractActionMeta(action);
    if (meta.confirm && !window.confirm(meta.confirm)) return;
    if (!supabase) return;
    try {
      const client = supabase;
      await saveLeadChange({
        write: () => ids.length === 1
          ? updateProcurementLeadStage(client, ids[0], meta.status, reason).then((row) => [row])
          : bulkUpdateProcurementLeadStage(client, ids, meta.status, reason),
        commit: (updated) => {
          contractRequestSequence.current += 1;
          setContracts((current) => current.map((contract) => {
            const row = updated.find((item) => item.id === contract.id);
            return row ? { ...contract, status: mapProcurementStage(row.stage), stageReason: row.stage_reason ?? undefined, nextAction: meta.nextAction } : contract;
          }));
          setContractsError(null);
        },
        refresh: () => selectedContract ? refreshContractHistory(selectedContract.id) : Promise.resolve(),
        onRefreshError: () => setContractsRefreshError('Stage saved. History could not refresh; retry refresh.'),
      });
      queueContractRefresh();
    } catch (error) {
      setContractsError(`Unable to save stage: ${getLoadContractsErrorMessage(error)}`);
      return;
    }
    setCheckedContractIds(new Set());
    selectNextContract(ids);
  };

  const applyBulkContractStage = async (ids: string[], stage: ContractStatus, reason?: ContractStageReason) => {
    if (!supabase) return false;
    try {
      const client = supabase;
      await saveLeadChange({
        write: () => bulkUpdateProcurementLeadStage(client, ids, stage, reason),
        commit: (updated) => {
          contractRequestSequence.current += 1;
          setContracts((current) => current.map((contract) => {
            const row = updated.find((item) => item.id === contract.id);
            return row ? { ...contract, status: mapProcurementStage(row.stage), stageReason: row.stage_reason ?? undefined, nextAction: getNextActionForStage(stage) } : contract;
          }));
          setContractsError(null);
        },
        refresh: () => selectedContract ? refreshContractHistory(selectedContract.id) : Promise.resolve(),
        onRefreshError: () => setContractsRefreshError('Stages saved. History could not refresh; retry refresh.'),
      });
      queueContractRefresh();
      setCheckedContractIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      return true;
    } catch (error) {
      setContractsError(`Unable to save stages: ${getLoadContractsErrorMessage(error)}`);
      return false;
    }
  };

  const applyCompanyAction = (ids: string[], action: CompanyAction) => {
    const meta = getCompanyActionMeta(action);
    if (meta.confirm && !window.confirm(meta.confirm)) return;
    setCompanies((current) =>
      current.map((company) =>
        ids.includes(company.id)
          ? {
              ...company,
              statusCategory: meta.statusCategory,
              progressStatus: meta.progressStatus,
              closedReason: meta.closedReason,
              nextAction: meta.nextAction,
              history: [makeHistoryItem(company.id, action, meta.history), ...company.history],
            }
          : company,
      ),
    );
    setCheckedCompanyIds(new Set());
    if (action === 'review-email') {
      setCompanyFilters((current) => ({ ...current, status: 'ready-to-email' }));
      setContextMode('email');
      setSelectedCompanyId(ids[0]);
      return;
    }
    selectNextCompany(ids);
  };

  const selectNextContract = (removedIds: string[]) => {
    const remainingVisible = visibleContracts.filter((contract) => !removedIds.includes(contract.id));
    if (remainingVisible[0]) setSelectedContractId(remainingVisible[0].id);
  };

  const selectNextCompany = (removedIds: string[]) => {
    const remainingVisible = visibleCompanies.filter((company) => !removedIds.includes(company.id));
    if (remainingVisible[0]) setSelectedCompanyId(remainingVisible[0].id);
  };

  const saveContractNote = async (contractId: string, text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    if (!supabase) return;
    try {
      await addProcurementLeadNote(supabase, contractId, cleanText);
      await refreshContractHistory(contractId);
    } catch (error) {
      setContractsError(`Unable to save note: ${getLoadContractsErrorMessage(error)}`);
    }
  };

  const editContractNote = async (contractId: string, noteId: string, text: string) => {
    if (!supabase) return;
    try {
      await editProcurementLeadNote(supabase, noteId, text.trim());
      await refreshContractHistory(contractId);
    } catch (error) {
      setContractsError(`Unable to edit note: ${getLoadContractsErrorMessage(error)}`);
      throw error;
    }
  };

  const saveCompanyNote = (companyId: string, text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    const note = makeNote(companyId, cleanText);
    setCompanies((current) =>
      current.map((company) => (company.id === companyId ? addNoteToRecord(company, note) : company)),
    );
  };

  const generateContracts = async (form: GenerateContractsForm) => {
    if (!isSupabaseConfigured || !supabase) {
      setGeneratePanel({
        status: 'failed',
        stage: 'configuration',
        message: 'Add Supabase env values before generating contracts.',
        sources: [],
        opportunities: [],
      });
      return;
    }

    setGeneratePanel({
      status: 'validating',
      stage: 'geography_lookup',
      message: 'Checking Arkansas geography and procurement sources.',
      sources: [],
      opportunities: [],
    });

    const { data, error } = await supabase.functions.invoke<GenerateContractsResponse>(
      'spin_generate_contracts',
      {
        body: {
          city: form.city.trim() || undefined,
          zip: form.zip.trim() || undefined,
          county: form.county.trim() || undefined,
        },
      },
    );

    if (error || !data) {
      setGeneratePanel({
        status: 'failed',
        stage: 'failed',
        message: error?.message ?? 'Contract generation failed.',
        sources: [],
        opportunities: [],
      });
      return;
    }

    const generatedSources = data.sources.map(mapGeneratedSource);
    const generatedContracts = data.opportunities.map(mapGeneratedContract);

    setSources((current) => mergeById(current, generatedSources));
    setContracts((current) => mergeById(generatedContracts, current));
    if (generatedContracts[0]) setSelectedContractId(generatedContracts[0].id);

    setGeneratePanel({
      status: data.status === 'completed' ? 'done' : data.status,
      stage: data.stage,
      message: data.message,
      normalizedLocation: data.normalizedLocation,
      sources: data.sources,
      opportunities: data.opportunities,
    });
  };

  const viewGeneratedContracts = () => {
    setContractView('new');
    setContractFilters((current) => ({ ...current, status: 'new', closedSubcategory: 'all' }));
    setExpandedClosedMode(null);
    setCheckedContractIds(new Set());
    const firstGenerated = generatePanel.opportunities[0];
    if (firstGenerated) setSelectedContractId(firstGenerated.id);
  };

  const toggleVisibleContracts = () => {
    setCheckedContractRecords((current) => new Map([...current, ...visibleContracts.map((row) => [row.id, row] as const)]));
    setCheckedContractIds((current) => {
      const next = new Set(current);
      if (allVisibleContractsSelected) {
        visibleContracts.forEach((contract) => next.delete(contract.id));
      } else {
        visibleContracts.forEach((contract) => next.add(contract.id));
      }
      return next;
    });
  };

  const toggleVisibleCompanies = () => {
    setCheckedCompanyIds((current) => {
      const next = new Set(current);
      if (allVisibleCompaniesSelected) {
        visibleCompanies.forEach((company) => next.delete(company.id));
      } else {
        visibleCompanies.forEach((company) => next.add(company.id));
      }
      return next;
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1 className="app-title">Executive Services SPIN Leads</h1>
        <div className="topbar-actions">
          <span className="signed-in-label">{session.user.email}</span>
          <button className="text-button" onClick={onSignOut} type="button">Sign out</button>
        </div>
      </header>

      <div className="workspace-mode-row">
        <ModeSwitch workMode={workMode} onChange={selectWorkMode} />
      </div>

      <div className="summary-strip summary-wide" aria-label={`${workMode} status counts`}>
        {workMode === 'contracts' ? (
          <>
            <ComingSoon label="Generate contracts">
              <button
                aria-label="Generate contracts"
                className={`summary-pill generate-summary-pill ${contractView === 'generate' ? 'is-active' : ''}`}
                disabled
                onClick={selectGenerateContracts}
                type="button"
              >
                <Sparkles size={18} aria-hidden="true" />
                <span>Generate</span>
              </button>
            </ComingSoon>
            <span className="summary-separator" aria-hidden="true">|</span>
            {contractSummary.map((item) => (
              <SummaryPill
                item={item}
                key={item.key}
                isActive={contractView === item.key}
                onClick={() => selectContractSummary(item.key)}
                onClosedSubcategoryChange={(closedSubcategory) => {
                  setContractFilters((current) => ({
                    ...current,
                    status: 'closed',
                    closedSubcategory,
                  }));
                  setExpandedClosedMode(null);
                  setCheckedContractIds(new Set());
                }}
              />
            ))}
          </>
        ) : (
          companySummary.map((item) => (
              <SummaryPill
                item={item}
                key={item.key}
                isActive={companyFilters.status === item.key}
                onClick={() => selectCompanySummary(item.key)}
                onClosedSubcategoryChange={(closedSubcategory) => {
                  setCompanyFilters((current) => ({
                    ...current,
                    status: 'closed',
                    closedSubcategory,
                  }));
                  setExpandedClosedMode(null);
                  setContextMode('note');
                  setCheckedCompanyIds(new Set());
                }}
              />
            ))
        )}
      </div>

      <section className="workspace">
        <section
          className="lead-worklist"
          aria-label={workMode === 'contracts' ? 'Contract opportunities' : 'Company leads'}
        >
          {workMode === 'contracts' ? (
            contractView === 'generate' ? (
              <ContractGeneratePanel
                panel={generatePanel}
                onClear={() =>
                  setGeneratePanel({ status: 'idle', sources: [], opportunities: [] })
                }
                onGenerate={generateContracts}
                onViewContracts={viewGeneratedContracts}
              />
            ) : (
              <>
              <ContractFiltersBar
                filters={contractFilters}
                onChange={setContractFilters}
                onReset={() => setContractFilters(getDefaultContractFilters())}
              />
              <div className="list-header">
                <div className="results-selection">
                  <div>
                    <p className="eyebrow">Contract monitoring</p>
                    <h2>{contractTotal} results</h2>
                    {lastContractsSyncAt ? <p className="sync-status">Updated {formatSyncTime(lastContractsSyncAt)}</p> : null}
                  </div>
                  <button
                    aria-label="Refresh contracts from Supabase"
                    className="secondary-button compact"
                    disabled={isRefreshingContracts}
                    onClick={() => void refreshContracts()}
                    type="button"
                  >
                    <RefreshCw className={isRefreshingContracts ? 'is-spinning' : undefined} size={15} aria-hidden="true" />
                    {isRefreshingContracts ? 'Refreshing' : 'Refresh'}
                  </button>
                  <button
                    aria-label={`${allVisibleContractsSelected ? 'Unselect' : 'Select'} all ${visibleContracts.length} visible contracts`}
                    className="secondary-button compact"
                    disabled={visibleContracts.length === 0}
                    onClick={toggleVisibleContracts}
                    type="button"
                  >
                    {allVisibleContractsSelected ? 'Unselect page' : 'Select page'}
                  </button>
                </div>
              </div>
              <div className="list-header" aria-label="Contract pages">
                <button className="secondary-button compact" disabled={contractPage === 0 || contractsLoading || isRefreshingContracts} onClick={() => setContractPage((page) => page - 1)}>Previous</button>
                <span>Page {contractPage + 1} of {Math.max(1, Math.ceil(contractTotal / 50))}{checkedContractIds.size ? ' · ' + checkedContractIds.size + ' selected across pages' : ''}</span>
                <button className="secondary-button compact" disabled={(contractPage + 1) * 50 >= contractTotal || contractsLoading || isRefreshingContracts} onClick={() => setContractPage((page) => page + 1)}>Next</button>
              </div>
              {contractsLoading ? (
                <p className="inline-status" role="status">Loading contracts from Supabase…</p>
              ) : null}
              {contractsError ? (
                <p className="inline-status is-error" role="alert">
                  Could not load production contracts: {contractsError}
                </p>
              ) : null}
              {contractsRefreshError ? (
                <div className="inline-status is-error inline-status-action" role="alert">
                  <span>{contractsRefreshError}</span>
                  <button className="text-button" onClick={() => void refreshContracts()} type="button">Retry</button>
                </div>
              ) : null}
              {checkedContractIds.size > 0 ? (
                <ContractBulkStageBar
                  contracts={[...checkedContractIds].map((id) => checkedContractRecords.get(id) ?? contracts.find((row) => row.id === id)).filter((row): row is ContractOpportunity => Boolean(row))}
                  onClear={() => { setCheckedContractIds(new Set()); setCheckedContractRecords(new Map()); }}
                  onSubmit={applyBulkContractStage}
                />
              ) : null}
              {visibleContracts.length > 0 ? (
                <ContractList
                  checkedIds={checkedContractIds}
                  contracts={visibleContracts}
                  selectedContractId={selectedContract?.id}
                  onAction={applyContractAction}
                  onSelect={(id) => {
                    setSelectedContractId(id);
                    setContextMode('note');
                  }}
                  onToggle={(id) => {
                    setCheckedContractIds((current) => toggleId(current, id));
                    const row = contracts.find((contract) => contract.id === id);
                    if (row) setCheckedContractRecords((current) => new Map(current).set(id, row));
                  }}
                />
              ) : (
                <EmptyQueueState
                  title="No contracts match"
                  hint="Clear filters or review closed contracts."
                  actionLabel="Clear filters"
                  onAction={() => setContractFilters(getDefaultContractFilters())}
                />
              )}
              </>
            )
          ) : (
            <>
              <CompanyFiltersBar filters={companyFilters} onChange={setCompanyFilters} />
              <div className="list-header">
                <div>
                  <p className="eyebrow">{companyStatusLabels[companyFilters.status]}</p>
                  <h2>{visibleCompanies.length} results</h2>
                </div>
                <button
                  className="secondary-button"
                  disabled={visibleCompanies.length === 0}
                  onClick={toggleVisibleCompanies}
                  type="button"
                >
                  {allVisibleCompaniesSelected ? 'Clear visible' : 'Select visible'}
                </button>
              </div>
              {visibleCheckedCompanyIds.length > 0 ? (
                <BulkActionBar
                  count={visibleCheckedCompanyIds.length}
                  onClear={() => setCheckedCompanyIds(new Set())}
                  onPrimary={() =>
                    applyCompanyAction(visibleCheckedCompanyIds, getCompanyBulkAction(companyFilters.status))
                  }
                  primaryLabel={getCompanyBulkLabel(companyFilters.status, visibleCheckedCompanyIds.length)}
                />
              ) : null}
              {visibleCompanies.length > 0 ? (
                <CompanyList
                  checkedIds={checkedCompanyIds}
                  companies={visibleCompanies}
                  selectedCompanyId={selectedCompany?.id}
                  status={companyFilters.status}
                  onAction={applyCompanyAction}
                  onHistory={(id) => {
                    setSelectedCompanyId(id);
                    setContextMode('history');
                  }}
                  onNote={(id) => {
                    setSelectedCompanyId(id);
                    setContextMode('note');
                  }}
                  onSelect={(companyId) => {
                    setSelectedCompanyId(companyId);
                    const company = companies.find((item) => item.id === companyId);
                    if (company?.statusCategory === 'ready-to-email') setContextMode('email');
                  }}
                  onToggle={(id) => setCheckedCompanyIds((current) => toggleId(current, id))}
                />
              ) : (
                <EmptyQueueState
                  title="No companies match"
                  hint="Clear the search or switch status."
                  actionLabel="Clear search"
                  onAction={() => setCompanyFilters((current) => ({ ...current, query: '' }))}
                />
              )}
            </>
          )}
        </section>

        {workMode === 'contracts' ? (
          <ContractContextPanel
            contract={selectedContract}
            mode={contextMode}
            source={selectedSource}
            onModeChange={setContextMode}
            onSaveNote={saveContractNote}
            onEditNote={editContractNote}
          />
        ) : (
          <CompanyContextPanel
            company={selectedCompany}
            mode={contextMode}
            onModeChange={setContextMode}
            onSaveNote={saveCompanyNote}
          />
        )}
      </section>
    </main>
  );
}

function SummaryPill<T extends string>({
  item,
  isActive,
  onClosedSubcategoryChange,
  onClick,
}: {
  item: SummaryItem<T>;
  isActive: boolean;
  onClosedSubcategoryChange?: (value: ClosedSubcategory) => void;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const hasSubfilter = Boolean(item.closedSubcategories);

  return (
    <div
      className={`summary-pill-shell ${hasSubfilter ? 'has-subfilter' : ''} ${
        item.isClosedSubcategoryExpanded ? 'is-expanded' : ''
      } ${
        isActive ? 'is-active' : ''
      }`}
    >
      <button
        aria-label={item.label}
        className={`summary-pill summary-pill-main ${isActive ? 'is-active' : ''}`}
        onClick={onClick}
        type="button"
      >
        <Icon size={18} aria-hidden="true" />
        <span>{item.shortLabel}</span>
        <strong>{item.count}</strong>
      </button>
      {item.closedSubcategories && item.isClosedSubcategoryExpanded ? (
        <div className="summary-suboptions" aria-label={`${item.label} subcategories`}>
          {item.closedSubcategories.map((subcategory) => (
            <button
              className={subcategory.key === item.selectedClosedSubcategory ? 'is-active' : ''}
              key={subcategory.key}
              onClick={(event) => {
                event.stopPropagation();
                onClosedSubcategoryChange?.(subcategory.key);
              }}
              type="button"
            >
              <span>{subcategory.label}</span>
              <strong>{subcategory.count}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContractGeneratePanel({
  panel,
  onClear,
  onGenerate,
  onViewContracts,
}: {
  panel: GeneratePanelState;
  onClear: () => void;
  onGenerate: (form: GenerateContractsForm) => void;
  onViewContracts: () => void;
}) {
  const [form, setForm] = useState<GenerateContractsForm>({ city: '', zip: '', county: '' });
  const isBusy = panel.status === 'validating';
  const canSubmit = Boolean(form.city.trim() || form.zip.trim() || form.county.trim());
  const showSources = panel.sources.length > 0;
  const showOpportunities = panel.opportunities.length > 0;

  return (
    <div className="generate-panel">
      <div className="list-header generate-header">
        <div>
          <p className="eyebrow">Contract monitoring</p>
          <h2>Generate contracts</h2>
        </div>
        <span className={`generate-status generate-${panel.status}`}>
          {labelForGenerateStatus(panel.status, panel.stage)}
        </span>
      </div>

      <form
        className="generate-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !isBusy) onGenerate(form);
        }}
      >
        <label className="input-field">
          <span>City</span>
          <input
            autoComplete="address-level2"
            onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
            placeholder="Little Rock"
            value={form.city}
          />
        </label>
        <label className="input-field">
          <span>ZIP</span>
          <input
            inputMode="numeric"
            onChange={(event) => setForm((current) => ({ ...current, zip: event.target.value }))}
            placeholder="72201"
            value={form.zip}
          />
        </label>
        <label className="input-field">
          <span>County</span>
          <input
            autoComplete="address-level1"
            onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))}
            placeholder="Pulaski"
            value={form.county}
          />
        </label>
        <label className="input-field state-field">
          <span>State</span>
          <input readOnly value="Arkansas" />
        </label>
        <div className="generate-actions">
          <button className="primary-button" disabled={!canSubmit || isBusy} type="submit">
            <Sparkles size={16} aria-hidden="true" />
            {isBusy ? 'Generating' : 'Generate contracts'}
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setForm({ city: '', zip: '', county: '' });
              onClear();
            }}
            type="button"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="generate-result">
        <p>{panel.message ?? 'Enter an Arkansas city, ZIP, or county to check bid sources and capture contracts.'}</p>
        {panel.normalizedLocation ? <strong>{panel.normalizedLocation}</strong> : null}
        {!isSupabaseConfigured ? (
          <p className="generate-warning">Supabase env values are required before this can run.</p>
        ) : null}
      </div>

      {showOpportunities ? (
        <section className="generate-section" aria-label="Generated contracts">
          <div className="generate-section-heading">
            <h3>{panel.opportunities.length} new contract{panel.opportunities.length === 1 ? '' : 's'}</h3>
            <button className="secondary-button compact" onClick={onViewContracts} type="button">
              View new contracts
            </button>
          </div>
          <div className="generate-rows">
            {panel.opportunities.map((opportunity) => (
              <div className="generate-row" key={opportunity.id}>
                <strong>{opportunity.projectName}</strong>
                <span>{opportunity.agencyName}</span>
                <span>{opportunity.dueAt ? formatDateLabel(opportunity.dueAt, 'due') : 'Date pending'}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showSources ? (
        <section className="generate-section" aria-label="Procurement sources">
          <div className="generate-section-heading">
            <h3>{panel.sources.length} source{panel.sources.length === 1 ? '' : 's'}</h3>
          </div>
          <div className="generate-rows">
            {panel.sources.map((source) => (
              <div className="generate-row" key={source.id}>
                <strong>{source.entityName}</strong>
                <span>{source.portalType}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ContractFiltersBar({
  filters,
  onChange,
  onReset,
}: {
  filters: ContractFilters;
  onChange: (filters: ContractFilters) => void;
  onReset: () => void;
}) {
  return (
    <div className="filter-bar" aria-label="Contract filters">
      <label className="search-field filter-search-row">
        <span>Search</span><Search size={16} aria-hidden="true" />
        <input aria-label="Search project, location, contracting agency" onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="Project, location, or contracting agency" value={filters.query} />
      </label>
      <div className="filter-controls-row">
        <FilterSelect label="Category" helpText="Business Category" onChange={(value) => onChange({ ...filters, category: value as ContractFilters['category'] })} value={filters.category} options={['All', 'School', 'Government', 'Medical']} />
        <FilterSelect label="Bid Type" helpText="Lead Stage" onChange={(value) => onChange({ ...filters, bidType: value as ContractBidTypeFilter })} value={filters.bidType} options={['All', 'forecast', 'opportunity', 'award']} />
        <div className="date-range-control contract-filter-control filter-control">
          <div className="filter-label-row"><span>Contract-Related Date</span><InfoTooltip label="Explain Applicable Date">Uses the most relevant available date for a forecast, opportunity, or award—usually a deadline or contract end; otherwise publication or start date.</InfoTooltip></div>
          <select className="contract-filter-select" aria-label="Applicable date range" onChange={(event) => onChange({ ...filters, dateRangePreset: event.target.value as ContractDateRangePreset })} value={filters.dateRangePreset}>
            {['all', 'today', 'this-week', 'this-month', 'custom'].map((option) => <option key={option} value={option}>{labelForOption(option)}</option>)}
          </select>
        </div>
      {filters.dateRangePreset === 'custom' ? (
        <>
          <label className="date-field">
            <span>From</span>
            <input
              aria-label="Contract date range start"
              onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
              type="date"
              value={filters.dateFrom ?? ''}
            />
          </label>
          <label className="date-field">
            <span>To</span>
            <input
              aria-label="Contract date range end"
              onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
              type="date"
              value={filters.dateTo ?? ''}
            />
          </label>
        </>
      ) : null}
        <div className="date-range-control contract-filter-control filter-control">
          <div className="filter-label-row"><span>Lead-Related Date</span><InfoTooltip label="Explain Updated Date">Date/time of changes made on this screen, such as stage and note changes, or when a lead was added/updated to this app</InfoTooltip></div>
          <select className="contract-filter-select" aria-label="Updated date range" value={filters.changedDateRangePreset} onChange={(event) => onChange({ ...filters, changedDateRangePreset: event.target.value as ContractDateRangePreset })}>
            {['all', 'today', 'this-week', 'this-month', 'custom'].map((option) => <option key={option} value={option}>{labelForOption(option)}</option>)}
          </select>
        </div>
        {filters.changedDateRangePreset === 'custom' ? <><label className="date-field"><span>Updated from</span><input aria-label="Updated date range start" type="date" value={filters.changedDateFrom ?? ''} onChange={(event) => onChange({ ...filters, changedDateFrom: event.target.value || undefined })} /></label><label className="date-field"><span>Updated to</span><input aria-label="Updated date range end" type="date" value={filters.changedDateTo ?? ''} onChange={(event) => onChange({ ...filters, changedDateTo: event.target.value || undefined })} /></label></> : null}
        <div className="sort-control contract-filter-control filter-control">
        <div className="filter-label-row"><span>Sort</span><InfoTooltip label="Explain Contract Sorting">Applicable uses the most relevant date for each bid type. Added and Updated use record timestamps.</InfoTooltip></div>
        <select
          aria-label="Sort contracts"
          onChange={(event) => {
            const [sortKey, sortDirection] = event.target.value.split(':') as [ContractSortKey, ContractSortDirection];
            onChange({ ...filters, sortKey, sortDirection });
          }}
          value={`${filters.sortKey}:${filters.sortDirection}`}
        >
          {['applicable-date:asc', 'applicable-date:desc', 'added:desc', 'added:asc', 'updated:desc'].map((option) => (
            <option key={option} value={option}>{labelForOption(option)}</option>
          ))}
        </select>
        </div>
      {filters.dateRangePreset === 'custom' && filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo ? (
        <p className="filter-error" role="alert">The start date must be on or before the end date.</p>
      ) : null}
      {filters.changedDateRangePreset === 'custom' && filters.changedDateFrom && filters.changedDateTo && filters.changedDateFrom > filters.changedDateTo ? (
        <p className="filter-error" role="alert">The updated date start must be on or before the end date.</p>
      ) : null}
        <div className="filter-actions contract-filter-control filter-control">
        <span aria-hidden="true" className="filter-label-spacer">&nbsp;</span>
        <button className="secondary-button compact" onClick={onReset} type="button">Reset filters</button>
      </div>
      </div>
    </div>
  );
}

function CompanyFiltersBar({
  filters,
  onChange,
}: {
  filters: CompanyFilters;
  onChange: (filters: CompanyFilters) => void;
}) {
  return (
    <div className="filter-bar" aria-label="Company filters">
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          aria-label="Search company, location, contact"
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Search company, location, contact"
          value={filters.query}
        />
      </label>
    </div>
  );
}

function FilterSelect({
  label,
  helpText,
  options,
  value,
  onChange,
}: {
  label: string;
  helpText?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="select-field filter-control">
      {helpText ? <span className="filter-label-row"><span>{label}</span><InfoTooltip label={`Explain ${label}`}>{helpText}</InfoTooltip></span> : <span>{label}</span>}
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labelForOption(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ContractList({
  checkedIds,
  contracts,
  selectedContractId,
  onAction,
  onSelect,
  onToggle,
}: {
  checkedIds: Set<string>;
  contracts: ContractOpportunity[];
  selectedContractId?: string;
  onAction: (ids: string[], action: ContractAction, reason?: ContractStageReason) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="lead-list">
      {contracts.map((contract) => {
        const sourceUrl = normalizeUrl(contract.sourceUrl ?? '');
        const isSelected = selectedContractId === contract.id;
        const latestNote = contract.notes[0];
        return (
          <article
            className={`lead-row contract-row no-utility ${contractClosedStatuses.includes(contract.status) ? 'is-closed-contract' : ''} ${isSelected ? 'is-selected' : 'is-muted'}`}
            key={contract.id}
            onClick={() => onSelect(contract.id)}
          >
            <label className="check-cell" onClick={(event) => event.stopPropagation()}>
              <input
                aria-label={`Select ${contract.projectName}`}
                checked={checkedIds.has(contract.id)}
                onChange={() => onToggle(contract.id)}
                type="checkbox"
              />
            </label>
            <CategoryIcon category={contract.category} />
            <div className="lead-main">
              <div className="lead-title-line">
                <h3>
                  {sourceUrl ? (
                    <a
                      aria-label={`Open source for ${contract.projectName}`}
                      href={sourceUrl}
                      onClick={(event) => event.stopPropagation()}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {contract.projectName} ↗
                    </a>
                  ) : (
                    contract.projectName
                  )}
                </h3>
                <span>{contract.estimatedValue ?? 'Value TBD'}</span>
                <span className="status-bubble">{getContractStageDisplay(contract)}</span>
                {contract.bidType && contract.bidType !== 'unknown' ? (
                  <span className="bid-type-bubble">{labelForBidType(contract.bidType)}</span>
                ) : null}
              </div>
              <p className="contract-source-line">
                {contract.agencyName ? <strong>{contract.agencyName}</strong> : null}
                <span>{contract.location} - {contract.category}</span>
              </p>
              {contract.keyDates?.length ? (
                <div className="contract-key-dates" aria-label="Key dates">
                  {contract.keyDates.map((keyDate) => (
                    <div key={keyDate.key}>
                      <span>{keyDate.label}</span>
                      <strong>{formatKeyDate(keyDate)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {contract.contactName || contract.contactPhone || contract.contactEmail ? (
                <div className="lead-contact">
                  {contract.contactName || contract.contactPhone ? (
                    <strong>{[contract.contactName, contract.contactPhone].filter(Boolean).join(' - ')}</strong>
                  ) : null}
                  {contract.contactEmail ? <span>{contract.contactEmail}</span> : null}
                </div>
              ) : null}
              {latestNote ? (
                <p className="latest-note">
                  <Pencil size={13} aria-hidden="true" />
                  {latestNote.text}
                </p>
              ) : null}
            </div>
            <ContractActions
              contract={contract}
              disabled={!isSelected}
              onAction={(action, reason) => onAction([contract.id], action, reason)}
            />
          </article>
        );
      })}
    </div>
  );
}

function CompanyList({
  checkedIds,
  companies,
  selectedCompanyId,
  status,
  onAction,
  onHistory,
  onNote,
  onSelect,
  onToggle,
}: {
  checkedIds: Set<string>;
  companies: CompanyLead[];
  selectedCompanyId?: string;
  status: CompanyStatusCategory;
  onAction: (ids: string[], action: CompanyAction) => void;
  onHistory: (id: string) => void;
  onNote: (id: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="lead-list">
      {companies.map((company) => {
        const isSelected = selectedCompanyId === company.id;
        const latestNote = company.notes[0];
        const showUtilityActions = status === 'ready-to-email';
        return (
          <article
            className={`lead-row company-row ${showUtilityActions ? '' : 'no-utility'} ${
              isSelected ? 'is-selected' : 'is-muted'
            }`}
            key={company.id}
            onClick={() => onSelect(company.id)}
          >
            <label className="check-cell" onClick={(event) => event.stopPropagation()}>
              <input
                aria-label={`Select ${company.businessName}`}
                checked={checkedIds.has(company.id)}
                onChange={() => onToggle(company.id)}
                type="checkbox"
              />
            </label>
            <div className={`fit-dot fit-${company.fit.toLowerCase()}`} aria-label={`${company.fit} fit`} />
            <div className="lead-main">
              <div className="lead-title-line">
                <h3>{company.businessName}</h3>
                <span>{company.estimatedSqFt}</span>
                <span className="status-bubble">{getCompanyStatusBubble(company)}</span>
              </div>
              <p>
                {company.category} - {company.location} - {company.distance}
              </p>
              <div className="lead-contact">
                <strong>
                  {company.contactName} - {company.phone}
                </strong>
                {company.email ? <span>{company.email}</span> : <span>No email found</span>}
              </div>
              <p className="compact-summary">
                {company.progressStatus
                  ? progressLabels[company.progressStatus]
                  : company.closedReason
                    ? closedReasonLabels[company.closedReason]
                    : company.nextAction}
              </p>
              {latestNote ? (
                <p className="latest-note">
                  <Pencil size={13} aria-hidden="true" />
                  {latestNote.text}
                </p>
              ) : null}
            </div>
            {showUtilityActions ? (
              <div className="lead-utility-actions" onClick={(event) => event.stopPropagation()}>
                <button className="icon-button" onClick={() => onNote(company.id)} title="Add note" type="button">
                  <Pencil size={16} />
                </button>
                <button className="icon-button" onClick={() => onHistory(company.id)} title="Show history" type="button">
                  <History size={16} />
                </button>
              </div>
            ) : null}
            <CompanyActions
              company={company}
              disabled={!isSelected}
              status={status}
              onAction={(action) => onAction([company.id], action)}
            />
            <div className="lead-touch">Added {company.addedAt}</div>
          </article>
        );
      })}
    </div>
  );
}

function ContractActions({
  contract,
  disabled,
  onAction,
}: {
  contract: ContractOpportunity;
  disabled: boolean;
  onAction: (action: ContractAction, reason?: ContractStageReason) => void;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [reasonAction, setReasonAction] = useState<ContractAction>('not-interested');
  const closeAction = contract.status === 'applied' ? 'lost' : 'not-interested';
  const openReasonMenu = (action: ContractAction) => {
    setReasonAction(action);
    setReason('');
    setReasonNote('');
    setReasonOpen(true);
  };
  const saveReason = () => {
    if (!reason || (reason === 'Other' && !reasonNote.trim())) return;
    setReasonOpen(false);
    onAction(reasonAction, { code: reason, note: reason === 'Other' ? reasonNote.trim() : undefined });
  };
  useEffect(() => {
    if (!reasonOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReasonOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [reasonOpen]);
  if (contractClosedStatuses.includes(contract.status)) {
    return null;
  }
  return (
    <div className="lead-card-actions contract-card-actions" onClick={(event) => event.stopPropagation()}>
      {contract.status === 'new' ? (
        <>
          <button className="primary-button compact" disabled={disabled} onClick={() => onAction('interested')} type="button">
            Interested
          </button>
          <button className="secondary-button compact" disabled={disabled} onClick={() => onAction('applied')} type="button">
            Applied
          </button>
        </>
      ) : null}
{contract.status === 'interested' ? <>
  <button className="primary-button compact" disabled={disabled} onClick={() => onAction('applied')} type="button">Applied</button>
  <button className="secondary-button compact pair-action" disabled={disabled} onClick={() => onAction('hold')} type="button">Hold</button>
  <button className="danger-button compact pair-action" disabled={disabled} onClick={() => reasonOpen && reasonAction === 'not-interested' ? setReasonOpen(false) : openReasonMenu('not-interested')} type="button">Not interested</button>
</> : null}
      {contract.status === 'hold' ? <>
        <button className="primary-button compact" disabled={disabled} onClick={() => onAction('interested')} type="button">Interested</button>
        <button className="secondary-button compact" disabled={disabled} onClick={() => onAction('applied')} type="button">Applied</button>
        <button className="danger-button compact" disabled={disabled} onClick={() => reasonOpen && reasonAction === 'not-interested' ? setReasonOpen(false) : openReasonMenu('not-interested')} type="button">Not interested</button>
      </> : null}
      {contract.status === 'applied' ? (
        <button className="primary-button compact" disabled={disabled} onClick={() => onAction('won')} type="button">
          Won
        </button>
      ) : null}
      {contract.status === 'applied' ? (
        <button
          className="secondary-button compact"
          disabled={disabled}
          onClick={() => openReasonMenu('withdrew')}
          type="button"
        >
          Withdrew
        </button>
      ) : null}
      {contract.status === 'new' || contract.status === 'applied' ? <button
        className="danger-button compact"
        disabled={disabled}
        onClick={() => reasonOpen && reasonAction === closeAction ? setReasonOpen(false) : openReasonMenu(closeAction)}
        type="button"
      >
        {contract.status === 'applied' ? 'Lost' : 'Not interested'}
      </button> : null}
      {reasonOpen ? <StageReasonDialog
        action={reasonAction}
        onCancel={() => setReasonOpen(false)}
        onReasonChange={setReason}
        onReasonNoteChange={setReasonNote}
        onSave={saveReason}
        reason={reason}
        reasonNote={reasonNote}
      /> : null}
    </div>
  );
}

function StageReasonDialog({ action, onCancel, onReasonChange, onReasonNoteChange, onSave, reason, reasonNote }: {
  action: ContractAction;
  onCancel: () => void;
  onReasonChange: (value: string) => void;
  onReasonNoteChange: (value: string) => void;
  onSave: () => void;
  reason: string;
  reasonNote: string;
}) {
  const canSave = Boolean(reason && (reason !== 'Other' || reasonNote.trim()));
  return <div className="stage-reason-backdrop" onClick={onCancel} role="presentation">
    <section aria-label={`Reason for ${statusLabels[getContractActionMeta(action).status]}`} aria-modal="true" className="stage-reason-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
      <h3>Reason for {statusLabels[getContractActionMeta(action).status]}</h3>
      <label><span>Reason</span><select autoFocus value={reason} onChange={(event) => onReasonChange(event.target.value)}><option value="">Choose a reason</option>{contractReasonOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      {reason === 'Other' ? <label><span>Detail</span><input onChange={(event) => onReasonNoteChange(event.target.value)} placeholder="Reason detail" value={reasonNote} /></label> : null}
      <div className="stage-reason-actions"><button className="text-button" onClick={onCancel} type="button">Cancel</button><button className="primary-button compact" disabled={!canSave} onClick={onSave} type="button">Save reason</button></div>
    </section>
  </div>;
}

function getContractStageDisplay(contract: ContractOpportunity) {
  const reason = contract.stageReason?.trim();
  return reason ? `${statusLabels[contract.status]} - ${reason}` : statusLabels[contract.status];
}

function CompanyActions({
  company,
  disabled,
  status,
  onAction,
}: {
  company: CompanyLead;
  disabled: boolean;
  status: CompanyStatusCategory;
  onAction: (action: CompanyAction) => void;
}) {
  const [showCloseReasons, setShowCloseReasons] = useState(false);
  const closeAs = (action: CompanyAction) => {
    setShowCloseReasons(false);
    onAction(action);
  };

  if (status === 'closed') {
    return (
      <div className="lead-card-actions" onClick={(event) => event.stopPropagation()}>
        <button className="secondary-button compact" disabled={disabled} onClick={() => onAction('reopen')} type="button">
          Reopen
        </button>
      </div>
    );
  }
  return (
    <div className="lead-card-actions" onClick={(event) => event.stopPropagation()}>
      {status === 'new' && company.email ? (
        <button className="primary-button compact" disabled={disabled} onClick={() => onAction('review-email')} type="button">
          Review email
        </button>
      ) : null}
      {status === 'ready-to-email' ? (
        <button className="primary-button compact" disabled={disabled} onClick={() => onAction('approve-email')} type="button">
          Approve email
        </button>
      ) : null}
      {status === 'new' || status === 'ready-to-email' ? (
        <button className="secondary-button compact" disabled={disabled} onClick={() => onAction('call')} type="button">
          Call
        </button>
      ) : null}
      {status === 'needs-call' ? (
        <button className="primary-button compact" disabled={disabled} onClick={() => onAction('in-progress')} type="button">
          In progress
        </button>
      ) : null}
      {status === 'in-progress' ? (
        <>
          <button className="secondary-button compact" disabled={disabled} onClick={() => onAction('waiting-on-customer')} type="button">
            Waiting
          </button>
          <button className="secondary-button compact" disabled={disabled} onClick={() => onAction('follow-up')} type="button">
            Follow up
          </button>
        </>
      ) : null}
      {status === 'needs-call' || status === 'in-progress' ? (
        <button className="primary-button compact" disabled={disabled} onClick={() => onAction('won')} type="button">
          Won
        </button>
      ) : null}
      <button
        className="danger-button compact"
        disabled={disabled}
        onClick={() => setShowCloseReasons((value) => !value)}
        type="button"
      >
        Close
      </button>
      {showCloseReasons ? (
        <div className="quick-close-actions" aria-label="Close reasons">
          {companyCloseReasons.map((reason) => (
            <button
              disabled={disabled}
              key={reason.action}
              onClick={() => closeAs(reason.action)}
              type="button"
            >
              {reason.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContractContextPanel({
  contract,
  mode,
  source,
  onModeChange,
  onSaveNote,
  onEditNote,
}: {
  contract?: ContractOpportunity;
  mode: ContextPanelMode;
  source?: BidSource;
  onModeChange: (mode: ContextPanelMode) => void;
  onSaveNote: (id: string, text: string) => void;
  onEditNote: (id: string, noteId: string, text: string) => Promise<void>;
}) {
  if (!contract) {
    return (
      <aside className="detail-panel context-panel" aria-label="Contract details">
        <p className="eyebrow">Contract details</p>
        <h2>{'No contract selected'}</h2>
        <p>Production procurement records will appear here when available.</p>
      </aside>
    );
  }
  if (mode === 'history') {
    return (
      <aside className="detail-panel context-panel" aria-label="Contract history">
        <HistoryPanel title={contract.projectName} history={contract.history} onAddNote={() => onModeChange('note')} />
      </aside>
    );
  }
  return (
    <aside className="detail-panel context-panel" aria-label="Contract details" tabIndex={0}>
      <ResearchContext notes={contract.researchNotes ?? []} />
      <NotePanel
        notes={contract.notes}
        title={contract.projectName}
        eyebrow={statusLabels[contract.status]}
        history={contract.history}
        inlineHistory
        leadCreatedAt={contract.addedAt}
        leadId={contract.id}
        leadUpdatedAt={contract.updatedAt}
        onSaveNote={(text) => onSaveNote(contract.id, text)}
        onEditNote={(noteId, text) => onEditNote(contract.id, noteId, text)}
      />
      {source ? <SourceSummary source={source} /> : null}
    </aside>
  );
}

function CompanyContextPanel({
  company,
  mode,
  onModeChange,
  onSaveNote,
}: {
  company: CompanyLead;
  mode: ContextPanelMode;
  onModeChange: (mode: ContextPanelMode) => void;
  onSaveNote: (id: string, text: string) => void;
}) {
  if (mode === 'email' && company.email && company.statusCategory === 'ready-to-email') {
    return (
      <aside className="detail-panel context-panel" aria-label="Email approval panel">
        <EmailApprovalPreview company={company} />
      </aside>
    );
  }
  if (mode === 'history') {
    return (
      <aside className="detail-panel context-panel" aria-label="Company history">
        <HistoryPanel title={company.businessName} history={company.history} onAddNote={() => onModeChange('note')} />
      </aside>
    );
  }
  return (
    <aside className="detail-panel context-panel" aria-label="Company notes">
      <NotePanel
        notes={company.notes}
        title={company.businessName}
        eyebrow={companyStatusLabels[company.statusCategory]}
        onHistory={() => onModeChange('history')}
        onSaveNote={(text) => onSaveNote(company.id, text)}
      />
      <section className="context-block">
        <p className="eyebrow">Next action</p>
        <strong>{company.nextAction}</strong>
        <p>{company.contactName} - {company.phone}</p>
        <p>{company.email ?? 'No email found'}</p>
      </section>
    </aside>
  );
}

function NotePanel({
  eyebrow,
  notes,
  title,
  history = [],
  inlineHistory = false,
  leadCreatedAt,
  leadId,
  leadUpdatedAt,
  onHistory,
  onSaveNote,
  onEditNote,
}: {
  eyebrow: string;
  notes: LeadNote[];
  title: string;
  history?: LeadHistoryItem[];
  inlineHistory?: boolean;
  leadCreatedAt?: string;
  leadId?: string;
  leadUpdatedAt?: string;
  onHistory?: () => void;
  onSaveNote: (text: string) => void | Promise<void>;
  onEditNote?: (noteId: string, text: string) => Promise<void>;
}) {
  const [noteText, setNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [historyTypes, setHistoryTypes] = useState<HistoryType[]>(['note']);
  const [showLeadRelatedDates, setShowLeadRelatedDates] = useState(false);
  const visibleHistory = history.filter((item) => item.type !== 'lead-identified' && historyTypes.includes(item.type));
  const leadRelatedDates = getLeadRelatedDates(leadCreatedAt, leadUpdatedAt);
  const [savingNote, setSavingNote] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  useEffect(() => {
    setShowLeadRelatedDates(false);
  }, [leadId]);
  const save = async () => {
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await onSaveNote(noteText);
      setNoteText('');
    } finally {
      setSavingNote(false);
    }
  };
  return (
    <section className="note-panel">
      <div className="context-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {!inlineHistory ? <button className="text-button" onClick={onHistory} type="button"><History size={16} />History</button> : null}
      </div>
      <textarea
        aria-label={`Note for ${title}`}
        onChange={(event) => setNoteText(event.target.value)}
        placeholder="Capture any applicable information, including where data may not be accurate."
        value={noteText}
      />
      <button className="primary-button" disabled={savingNote || !noteText.trim()} onClick={() => void save()} type="button">
        {savingNote ? 'Saving…' : 'Save note'}
      </button>
      {inlineHistory && leadRelatedDates.length > 0 ? (
        <>
          <button
            aria-controls={`lead-related-dates-${leadId}`}
            aria-expanded={showLeadRelatedDates}
            className="text-button lead-related-dates-toggle"
            onClick={() => setShowLeadRelatedDates((shown) => !shown)}
            type="button"
          >
            {showLeadRelatedDates ? 'Hide' : 'Show'} Lead-Related Dates/Times
          </button>
          {showLeadRelatedDates ? (
            <div className="lead-related-dates" id={`lead-related-dates-${leadId}`}>
              {leadRelatedDates.map((item) => (
                <article className="history-row" key={`${item.label}-${item.value}`}>
                  <div className="history-time"><span>{formatHistoryTimestamp(item.value)}</span></div>
                  <div><strong>{item.label}</strong></div>
                </article>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {!inlineHistory ? <div className="note-list">
        {notes.length > 0 ? (
          notes.map((note) => (
            <article key={note.id}>
              <strong>{note.at}</strong>
            {editingNoteId === note.id ? <><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} /><button className="text-button" type="button" onClick={() => { if (onEditNote) void onEditNote(note.id, editingText).then(() => setEditingNoteId(null)); }}>Save edit</button><button className="text-button" type="button" onClick={() => setEditingNoteId(null)}>Cancel</button></> : <><p>{note.text}</p>{onEditNote ? <button className="text-button" type="button" onClick={() => { setEditingNoteId(note.id); setEditingText(note.text); }}>Edit</button> : null}</>}
            </article>
          ))
        ) : (
          <p className="muted-copy">No notes yet.</p>
        )}
      </div> : null}
      {inlineHistory ? (
        <div aria-label="Contract history" className="history-list">
          <div className="history-filters">
            {([['note', 'Notes'], ['note-edit', 'Note edits'], ['status', 'Stage changes']] as const).map(([value, label]) => <label key={value}><input type="checkbox" checked={historyTypes.includes(value)} onChange={() => setHistoryTypes((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} /> {label}</label>)}
          </div>
          {visibleHistory.length > 0 ? visibleHistory.map((item) => (
            <article className={`history-row history-${item.type}`} key={item.id}>
              <div className="history-time"><span>{item.at}</span>{item.type === 'note' && item.updatedAt && item.occurredAt !== item.updatedAt ? <span className="note-updated-at">Updated {formatHistoryTimestamp(item.updatedAt)}</span> : null}</div>
              <div><strong>{item.label}</strong>{editingNoteId === item.noteId ? <><textarea aria-label={`Edit note from ${item.at}`} value={editingText} onChange={(event) => setEditingText(event.target.value)} /><div className="inline-actions"><button className="text-button" disabled={savingEdit || !editingText.trim()} type="button" onClick={() => { if (!onEditNote || !item.noteId || savingEdit) return; setSavingEdit(true); void onEditNote(item.noteId, editingText).then(() => setEditingNoteId(null)).finally(() => setSavingEdit(false)); }}>Save edit</button><button className="text-button" disabled={savingEdit} type="button" onClick={() => setEditingNoteId(null)}>Cancel</button></div></> : <>{item.detail ? <p>{item.detail}</p> : null}{item.type === 'note' && item.noteId && onEditNote ? <button aria-label={`Edit note from ${item.at}`} className="icon-button note-edit-button" title="Edit note" type="button" onClick={() => { setEditingNoteId(item.noteId ?? null); setEditingText(item.detail ?? ''); }}><Pencil size={15} aria-hidden="true" /></button> : null}</>}</div>
            </article>
          )) : <p className="muted-copy">{historyTypes.includes('note') ? 'No notes yet.' : 'No matching history.'}</p>}
        </div>
      ) : null}
    </section>
  );
}

function HistoryPanel({
  history,
  title,
  onAddNote,
}: {
  history: LeadHistoryItem[];
  title: string;
  onAddNote: () => void;
}) {
  return (
    <section className="history-panel">
      <div className="context-heading">
        <p className="eyebrow">History</p>
        <h2>{title}</h2>
        <button className="text-button" onClick={onAddNote} type="button">
          <Pencil size={16} />
          Add note
        </button>
      </div>
      <div className="history-list">
        {history.map((item) => (
          <article className={`history-row history-${item.type}`} key={item.id}>
            <span>{item.at}</span>
            <div>
              <strong>{item.label}</strong>
              {item.detail ? <p>{item.detail}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceSummary({
  source,
}: {
  source: BidSource;
}) {
  return (
    <section className="context-block">
      <p className="eyebrow">Bid website</p>
      <strong>{source.name}</strong>
      <p>{source.agencyType} - {source.location}</p>
      <p className="url-text">{source.url}</p>
    </section>
  );
}

function EmailApprovalPreview({ company }: { company: CompanyLead }) {
  const draft = useMemo(() => getEmailDraft(company.contactName, company.email ?? ''), [
    company.contactName,
    company.email,
  ]);
  const [customWindow, setCustomWindow] = useState('');
  const [scheduledCall, setScheduledCall] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editableDraft, setEditableDraft] = useState({
    to: draft.to,
    from: draft.from,
    subject: draft.subject,
    body: draft.body.join('\n\n'),
  });

  useEffect(() => {
    setEditableDraft({
      to: draft.to,
      from: draft.from,
      subject: draft.subject,
      body: draft.body.join('\n\n'),
    });
    setCustomWindow('');
    setScheduledCall('');
    setIsEditing(false);
  }, [draft, company.id]);

  return (
    <section className="email-preview is-panel" aria-label="Email draft for approval">
      <div className="email-preview-heading">
        <Mail size={17} aria-hidden="true" />
        <strong>Email to approve</strong>
      </div>
      <dl className="email-meta">
        <EmailField
          isEditing={isEditing}
          label="To"
          onChange={(value) => setEditableDraft((current) => ({ ...current, to: value }))}
          value={editableDraft.to}
        />
        <EmailField
          isEditing={isEditing}
          label="From"
          onChange={(value) => setEditableDraft((current) => ({ ...current, from: value }))}
          value={editableDraft.from}
        />
        <EmailField
          isEditing={isEditing}
          label="Subject"
          onChange={(value) => setEditableDraft((current) => ({ ...current, subject: value }))}
          value={editableDraft.subject}
        />
      </dl>
      <div className="email-body">
        {isEditing ? (
          <textarea
            aria-label="Email body"
            onChange={(event) =>
              setEditableDraft((current) => ({ ...current, body: event.target.value }))
            }
            value={editableDraft.body}
          />
        ) : (
          editableDraft.body.split('\n').map((line) => (line ? <p key={line}>{line}</p> : null))
        )}
        <div className="schedule-options" aria-label="Mock call scheduling links">
          {draft.slots.map((slot) => (
            <button
              className="schedule-link"
              key={slot}
              onClick={() => setScheduledCall(`Mock scheduled call: ${slot}`)}
              type="button"
            >
              {slot}
            </button>
          ))}
        </div>
        <div className="callback-field">
          <label htmlFor={`callback-${company.id}`}>Ask John to call me</label>
          <div>
            <input
              id={`callback-${company.id}`}
              onChange={(event) => setCustomWindow(event.target.value)}
              placeholder="between 2pm and 5pm on Wednesday"
              value={customWindow}
            />
            <button
              className="schedule-link"
              onClick={() => setScheduledCall(`Mock scheduled call: ${customWindow || 'Ask John to call me'}`)}
              type="button"
            >
              Use this time
            </button>
          </div>
        </div>
      </div>
      <footer className="email-footer" aria-label="Email footer">
        <div className="email-footer-links">
          <button
            className="email-footer-link"
            onClick={() => setScheduledCall(`Mock footer link: ${draft.footer.unsubscribeLabel}`)}
            type="button"
          >
            {draft.footer.unsubscribeLabel}
          </button>
          <button
            className="email-footer-link"
            onClick={() => setScheduledCall(`Mock footer link: ${draft.footer.contactUs}`)}
            type="button"
          >
            {draft.footer.contactUs}
          </button>
        </div>
        <span>{draft.footer.address}</span>
      </footer>
      {scheduledCall ? (
        <p className="scheduled-note" role="status">
          {scheduledCall}
        </p>
      ) : null}
      <div className="email-panel-actions">
        <button className="secondary-button" onClick={() => setIsEditing((value) => !value)} type="button">
          <Pencil size={16} />
          {isEditing ? 'Save' : 'Edit'}
        </button>
      </div>
    </section>
  );
}

function EmailField({
  isEditing,
  label,
  onChange,
  value,
}: {
  isEditing: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {isEditing ? (
          <input aria-label={label} onChange={(event) => onChange(event.target.value)} value={value} />
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function BulkActionBar({
  count,
  onClear,
  onPrimary,
  primaryLabel,
}: {
  count: number;
  onClear: () => void;
  onPrimary: () => void;
  primaryLabel: string;
}) {
  return (
    <div className="bulk-bar">
      <strong>{count} selected</strong>
      <button className="primary-button compact" onClick={onPrimary} type="button">
        <Check size={17} />
        {primaryLabel}
      </button>
      <button className="text-button" onClick={onClear} type="button">
        Clear
      </button>
    </div>
  );
}

function ContractBulkStageBar({
  contracts,
  onClear,
  onSubmit,
}: {
  contracts: ContractOpportunity[];
  onClear: () => void;
  onSubmit: (ids: string[], stage: ContractStatus, reason?: ContractStageReason) => Promise<boolean>;
}) {
  const [targetStage, setTargetStage] = useState<ContractStatus | ''>('');
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [saving, setSaving] = useState(false);
  const changeableContracts = targetStage ? contracts.filter((contract) => contract.status !== targetStage) : [];
  const unchangedContracts = targetStage ? contracts.filter((contract) => contract.status === targetStage) : [];
  const requiresReason = targetStage === 'lost' || targetStage === 'not-interested' || targetStage === 'withdrew';
  const canSubmit = Boolean(targetStage && changeableContracts.length && (!requiresReason || (reason && (reason !== 'Other' || reasonNote.trim()))) && !saving);
  const selectStage = (value: string) => {
    setTargetStage(value as ContractStatus | '');
    setReason('');
    setReasonNote('');
  };
  const submit = async () => {
    if (!targetStage || !canSubmit) return;
    const reasonValue = requiresReason ? { code: reason, note: reason === 'Other' ? reasonNote.trim() : undefined } : undefined;
    const detail = reasonValue ? ` - ${reasonValue.code}${reasonValue.note ? `: ${reasonValue.note}` : ''}` : '';
    if (!window.confirm(`Change ${changeableContracts.length} contract${changeableContracts.length === 1 ? '' : 's'} to ${statusLabels[targetStage]}${detail}?`)) return;
    setSaving(true);
    const succeeded = await onSubmit(changeableContracts.map((contract) => contract.id), targetStage, reasonValue);
    setSaving(false);
    if (succeeded) selectStage('');
  };
  return (
    <div className="bulk-bar contract-bulk-bar">
      <strong>{contracts.length} selected</strong>
      <label className="bulk-stage-select"><span>Change stage</span><select aria-label="Change selected contracts to stage" onChange={(event) => selectStage(event.target.value)} value={targetStage}><option value="">Choose stage</option>{(Object.keys(statusLabels) as ContractStatus[]).map((stage) => <option disabled={contracts.every((contract) => contract.status === stage)} key={stage} value={stage}>{statusLabels[stage]}</option>)}</select></label>
      {requiresReason ? <label className="bulk-stage-select"><span>Reason</span><select aria-label="Reason for selected stage" onChange={(event) => setReason(event.target.value)} value={reason}><option value="">Choose a reason</option>{contractReasonOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
      {requiresReason && reason === 'Other' ? <input aria-label="Other stage reason" className="bulk-reason-note" onChange={(event) => setReasonNote(event.target.value)} placeholder="Reason detail" value={reasonNote} /> : null}
      {targetStage ? unchangedContracts.length ? <span className="info-tooltip bulk-change-tooltip" tabIndex={0}><span aria-label={`${changeableContracts.length} will change; ${unchangedContracts.length} already ${statusLabels[targetStage]}`} className="bulk-change-count">{changeableContracts.length} will change</span><span className="tooltip-content" role="tooltip">{unchangedContracts.length} {unchangedContracts.length === 1 ? 'contract already has' : 'contracts already have'} the {statusLabels[targetStage]} stage and will not be updated.</span></span> : <span className="bulk-change-count">{changeableContracts.length} will change</span> : null}
      <button className="primary-button compact" disabled={!canSubmit} onClick={() => void submit()} type="button">{saving ? 'Saving…' : 'Apply stage'}</button>
      <button className="text-button" disabled={saving} onClick={onClear} type="button">Clear selection</button>
    </div>
  );
}

function CategoryIcon({ category }: { category: ContractCategory }) {
  const Icon = category === 'School' ? School : category === 'Medical' ? Stethoscope : Building2;
  return (
    <div className="category-icon" aria-label={`${category} contract`}>
      <Icon size={15} />
    </div>
  );
}

function makeHistory(
  id: string,
  at: string,
  detail: string,
  history: string[],
  notes: LeadNote[] = [],
) {
  return [
    { id: `${id}-added`, at, label: 'Added', detail, type: 'system' as const },
    ...history.map((item, index) => ({
      id: `${id}-history-${index}`,
      at: index === 0 ? at : 'Just before',
      label: item,
      type: 'status' as const,
    })),
    ...notes.map((note) => ({
      id: `${note.id}-history`,
      at: note.at,
      label: 'Note added',
      detail: note.text,
      type: 'note' as const,
    })),
  ];
}

function makeContract(
  contract: Omit<ContractOpportunity, 'notes' | 'history'> & {
    notes?: LeadNote[];
    history: string[] | LeadHistoryItem[];
  },
): ContractOpportunity {
  const notes = contract.notes ?? [];
  const history = contract.history.length > 0 && typeof contract.history[0] === 'string'
    ? makeHistory(contract.id, contract.dateLabel, '', contract.history as string[], notes)
    : contract.history as LeadHistoryItem[];
  return {
    ...contract,
    notes,
    history,
  };
}

function formatHistoryTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function getLeadRelatedDates(createdAt?: string, updatedAt?: string) {
  const createdTime = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  const updatedTime = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
  const created = Number.isNaN(createdTime) ? null : { label: 'Lead identified', value: createdAt as string, time: createdTime };
  const updated = Number.isNaN(updatedTime) || updatedTime === createdTime
    ? null
    : { label: 'Lead updated', value: updatedAt as string, time: updatedTime };
  return [updated, created]
    .filter((item): item is { label: string; value: string; time: number } => item !== null)
    .sort((a, b) => b.time - a.time);
}

function formatSyncTime(value: Date) {
  return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function mapProcurementStage(stage: string | null): ContractStatus {
  const normalized = (stage ?? 'new').toLowerCase().replace(/[_\s]+/g, '-');
  if (normalized === 'hold' || normalized === 'on-hold' || normalized === 'paused') return 'hold';
  if (normalized === 'interested' || normalized === 'in-progress' || normalized === 'in-review') return 'interested';
  if (normalized === 'not-interested' || normalized === 'not-a-fit' || normalized === 'rejected') return 'not-interested';
  if (normalized === 'applied' || normalized === 'submitted') return 'applied';
  if (normalized === 'won' || normalized === 'awarded') return 'won';
  if (normalized === 'lost' || normalized === 'closed-lost') return 'lost';
  if (normalized === 'withdrew' || normalized === 'withdrawn') return 'withdrew';
  return 'new';
}

function mapProcurementHistory(row: ProcurementHistoryRow): LeadHistoryItem {
  if (row.event_type === 'lead_identified') return { id: row.id, occurredAt: row.occurred_at, at: formatHistoryTimestamp(row.occurred_at), label: 'Lead identified', type: 'lead-identified' };
  const oldStage = typeof row.old_value?.stage === 'string' ? statusLabels[mapProcurementStage(row.old_value.stage)] : '';
  const newStage = typeof row.new_value?.stage === 'string' ? statusLabels[mapProcurementStage(row.new_value.stage)] : '';
  if (row.event_type === 'note_added') {
    const isEdit = (row.metadata as { edit?: boolean }).edit;
    const noteId = typeof row.metadata.note_id === 'string' ? row.metadata.note_id : row.id;
    const updatedAt = typeof row.metadata.updated_at === 'string' ? row.metadata.updated_at : undefined;
    return { id: row.id, noteId: isEdit ? undefined : noteId, occurredAt: row.occurred_at, updatedAt: isEdit ? undefined : updatedAt, at: formatHistoryTimestamp(row.occurred_at), label: isEdit ? 'Note edited' : 'Note added', detail: isEdit && row.old_value?.body ? `${row.old_value.body} → ${row.new_value?.body ?? row.note_text ?? ''}` : row.note_text ?? '', type: isEdit ? 'note-edit' : 'note' };
  }
  if (row.event_type === 'stage_changed') return { id: row.id, occurredAt: row.occurred_at, at: formatHistoryTimestamp(row.occurred_at), label: 'Stage changed', detail: `${oldStage || 'Unknown'} → ${newStage || 'Unknown'}${typeof row.new_value?.reason === 'string' && row.new_value.reason ? ` · ${row.new_value.reason}` : ''}`, type: 'status' };
  return { id: row.id, occurredAt: row.occurred_at, at: formatHistoryTimestamp(row.occurred_at), label: 'System update', detail: row.note_text ?? undefined, type: 'system' };
}

function makeCompany(
  company: Omit<CompanyLead, 'notes' | 'history'> & {
    notes?: LeadNote[];
    history: string[];
  },
): CompanyLead {
  const notes = company.notes ?? [];
  return {
    ...company,
    notes,
    history: makeHistory(company.id, company.addedAt, company.reason, company.history, notes),
  };
}

function getEmailDraft(contactName: string, email: string) {
  return {
    to: `${contactName} <${email}>`,
    from: `${senderName} <${senderEmail}>`,
    subject: 'Cleaning not where you want it to be?',
    body: [
      `Hi ${contactName},`,
      'You have so much on your plate as a small business owner. I wanted to see how you are managing cleaning now.',
      `${senderName} can help with consistent janitorial service in the Little Rock area.`,
      'Would a quick call this week be useful?',
    ],
    slots: ['Tue, Sep 8, 10:00 AM', 'Wed, Sep 9, 2:30 PM'],
    footer: {
      unsubscribeLabel: 'Unsubscribe',
      contactUs: 'Contact Us',
      address: '123 Main St Little Rock, AR 72221',
    },
  };
}

function matchesCompanyFilters(company: CompanyLead, filters: CompanyFilters) {
  const query = filters.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    company.businessName.toLowerCase().includes(query) ||
    company.location.toLowerCase().includes(query) ||
    company.contactName.toLowerCase().includes(query);
  const matchesClosedSubcategory =
    filters.status !== 'closed' ||
    filters.closedSubcategory === 'all' ||
    company.closedReason === filters.closedSubcategory;
  return company.statusCategory === filters.status && matchesQuery && matchesClosedSubcategory;
}

function getContractActionMeta(action: ContractAction) {
  const meta: Record<
    ContractAction,
    { status: ContractStatus; history: string; nextAction: string; confirm?: string }
  > = {
    interested: { status: 'interested', history: 'Marked interested', nextAction: 'Prepare bid review' },
    hold: { status: 'hold', history: 'Put on hold', nextAction: 'Follow up later' },
    'not-interested': {
      status: 'not-interested',
      history: 'Closed: not interested',
      nextAction: 'No action',
      confirm: 'Mark this contract not interested?',
    },
    applied: { status: 'applied', history: 'Applied', nextAction: 'Watch award notice' },
    won: { status: 'won', history: 'Won', nextAction: 'Schedule kickoff' },
    lost: {
      status: 'lost',
      history: 'Lost',
      nextAction: 'No action',
      confirm: 'Mark this contract lost?',
    },
    withdrew: {
      status: 'withdrew',
      history: 'Withdrew',
      nextAction: 'No action',
      confirm: 'Withdraw from this contract?',
    },
  };
  return meta[action];
}

function getNextActionForStage(stage: ContractStatus) {
  if (stage === 'interested') return 'Prepare bid review';
  if (stage === 'applied') return 'Watch award notice';
  if (stage === 'hold') return 'Follow up later';
  if (stage === 'won') return 'Schedule kickoff';
  if (contractClosedStatuses.includes(stage)) return 'No action';
  return 'Review lead';
}

function getCompanyActionMeta(action: CompanyAction) {
  const meta: Record<
    CompanyAction,
    {
      statusCategory: CompanyStatusCategory;
      progressStatus?: CompanyProgressStatus;
      closedReason?: CompanyClosedReason;
      history: string;
      nextAction: string;
      confirm?: string;
    }
  > = {
    'review-email': {
      statusCategory: 'ready-to-email',
      history: 'Moved to email review',
      nextAction: 'Approve intro email',
    },
    'approve-email': {
      statusCategory: 'needs-call',
      history: 'Email approved',
      nextAction: 'Call today',
    },
    call: { statusCategory: 'needs-call', history: 'Moved to call', nextAction: 'Call today' },
    'in-progress': {
      statusCategory: 'in-progress',
      progressStatus: 'decision-pending',
      history: 'Moved in progress',
      nextAction: 'Confirm decision timing',
    },
    'waiting-on-customer': {
      statusCategory: 'in-progress',
      progressStatus: 'waiting-on-customer',
      history: 'Waiting on customer',
      nextAction: 'Check for reply',
    },
    'follow-up': {
      statusCategory: 'in-progress',
      progressStatus: 'follow-up-in-2-days',
      history: 'Follow-up set',
      nextAction: 'Follow up in 2 days',
    },
    won: {
      statusCategory: 'closed',
      closedReason: 'won',
      history: 'Won',
      nextAction: 'Ready for onboarding',
    },
    'closed-lost': {
      statusCategory: 'closed',
      closedReason: 'lost',
      history: 'Closed: lost',
      nextAction: 'No action',
      confirm: 'Close this company opportunity?',
    },
    'closed-not-interested': {
      statusCategory: 'closed',
      closedReason: 'not-interested',
      history: 'Closed: not interested',
      nextAction: 'No action',
      confirm: 'Close this company as not interested?',
    },
    'closed-too-small': {
      statusCategory: 'closed',
      closedReason: 'too-small',
      history: 'Closed: too small',
      nextAction: 'No action',
      confirm: 'Close this company as too small?',
    },
    'closed-no-budget': {
      statusCategory: 'closed',
      closedReason: 'no-budget',
      history: 'Closed: no budget',
      nextAction: 'No action',
      confirm: 'Close this company for no budget?',
    },
    'closed-has-provider': {
      statusCategory: 'closed',
      closedReason: 'has-provider',
      history: 'Closed: has provider',
      nextAction: 'No action',
      confirm: 'Close this company because they have a provider?',
    },
    'closed-bad-fit': {
      statusCategory: 'closed',
      closedReason: 'bad-fit',
      history: 'Closed: bad fit',
      nextAction: 'No action',
      confirm: 'Close this company as a bad fit?',
    },
    'closed-withdrew': {
      statusCategory: 'closed',
      closedReason: 'withdrew',
      history: 'Withdrew',
      nextAction: 'No action',
      confirm: 'Mark this company opportunity withdrew?',
    },
    reopen: {
      statusCategory: 'in-progress',
      progressStatus: 'decision-pending',
      history: 'Reopened',
      nextAction: 'Confirm next step',
    },
  };
  return meta[action];
}

function getCompanyBulkAction(status: CompanyStatusCategory): CompanyAction {
  if (status === 'ready-to-email') return 'approve-email';
  if (status === 'needs-call') return 'in-progress';
  if (status === 'in-progress') return 'follow-up';
  if (status === 'closed') return 'reopen';
  return 'call';
}

function getCompanyBulkLabel(status: CompanyStatusCategory, count: number) {
  if (status === 'ready-to-email') return `Approve ${count} emails`;
  if (status === 'needs-call') return `Move ${count} in progress`;
  if (status === 'in-progress') return `Set ${count} follow-ups`;
  if (status === 'closed') return `Reopen ${count}`;
  return `Move ${count} to call`;
}

function getCompanyStatusBubble(company: CompanyLead) {
  if (company.closedReason) return closedReasonLabels[company.closedReason];
  if (company.progressStatus) return progressLabels[company.progressStatus];
  return companyStatusLabels[company.statusCategory];
}

function getContractIcon(status: ContractStatus) {
  if (status === 'new') return FileCheck2;
  if (status === 'interested') return Clock3;
  if (status === 'applied') return BriefcaseBusiness;
  return CheckCheck;
}

function getCompanyIcon(status: CompanyStatusCategory) {
  if (status === 'ready-to-email') return Mail;
  if (status === 'needs-call') return Phone;
  if (status === 'in-progress') return Clock3;
  if (status === 'closed') return CheckCheck;
  return Building2;
}

function toggleId<T extends string>(current: Set<T>, id: T) {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

function makeNote(recordId: string, text: string): LeadNote {
  return {
    id: `${recordId}-note-${Date.now()}`,
    at: 'Just now',
    text,
  };
}

function makeHistoryItem(recordId: string, action: string, label: string): LeadHistoryItem {
  return {
    id: `${recordId}-${action}-${Date.now()}`,
    at: 'Just now',
    label,
    type: 'status',
  };
}

function addNoteToRecord<T extends { notes: LeadNote[]; history: LeadHistoryItem[] }>(
  record: T,
  note: LeadNote,
) {
  return {
    ...record,
    notes: [note, ...record.notes],
    history: [
      {
        id: `${note.id}-history`,
        at: note.at,
        label: 'Note added',
        detail: note.text,
        type: 'note' as const,
      },
      ...record.history,
    ],
  };
}

function labelForOption(option: string) {
  if (option in statusLabels) return statusLabels[option as ContractStatus];
  if (option === 'due') return 'Due';
  if (option === 'expiring') return 'Expiring';
  if (option === 'all') return 'All dates';
  if (option === 'forecast') return 'Forecast';
  if (option === 'opportunity') return 'Opportunity';
  if (option === 'award') return 'Award';
  if (option === 'today') return 'Today';
  if (option === 'this-week') return 'This week';
  if (option === 'this-month') return 'This month';
  if (option === 'custom') return 'Custom range';
  if (option === 'applicable-date:asc') return 'Applicable date: soonest first';
  if (option === 'applicable-date:desc') return 'Applicable date: latest first';
  if (option === 'added:desc') return 'Added: newest first';
  if (option === 'added:asc') return 'Added: oldest first';
  if (option === 'updated:desc') return 'Updated: newest first';
  return option;
}

function labelForGenerateStatus(status: GenerateStatus, stage?: string) {
  if (status === 'validating') {
    if (stage === 'finding_sources') return 'Finding sources';
    if (stage === 'capturing_contracts') return 'Capturing contracts';
    if (stage === 'checking_sources') return 'Checking sources';
    return 'Validating';
  }
  if (status === 'done') return 'Done';
  if (status === 'needs-review') return 'Needs review';
  if (status === 'failed') return 'Failed';
  return 'Ready';
}

function mapGeneratedSource(source: GenerateContractsSource): BidSource {
  return {
    id: source.id,
    name: source.entityName,
    agencyType: source.entityName.toLowerCase().includes('school')
      ? 'School district'
      : source.entityName.toLowerCase().includes('city')
        ? 'City'
        : source.entityName.toLowerCase().includes('county')
          ? 'County'
          : 'Agency',
    location: 'Arkansas',
    category: source.entityName.toLowerCase().includes('school') ? 'School' : 'Government',
    url: source.bidsUrl ?? source.awardsUrl ?? '',
    status: source.needsHumanReview ? 'needs-review' : 'current',
    lastChecked: 'Just now',
  };
}

function mapGeneratedContract(opportunity: GenerateContractsOpportunity): ContractOpportunity {
  const dateType: ContractDateType = opportunity.expiresAt && !opportunity.dueAt ? 'expiring' : 'due';
  const dateValue = opportunity.dueAt ?? opportunity.expiresAt ?? '';
  return makeContract({
    id: opportunity.id,
    projectName: opportunity.projectName,
    agencyName: opportunity.agencyName,
    category: isContractCategory(opportunity.category) ? opportunity.category : 'Government',
    location: opportunity.location ?? 'Arkansas',
    contactName: opportunity.contactName ?? 'Contact pending',
    contactPhone: opportunity.contactPhone ?? undefined,
    contactEmail: opportunity.contactEmail ?? undefined,
    dateType,
    date: dateValue.slice(0, 10),
    dateLabel: formatDateLabel(dateValue, dateType),
    estimatedValue: opportunity.estimatedValue ?? undefined,
    status: 'new',
    sourceId: opportunity.sourceId ?? `source-${opportunity.id}`,
    nextAction: 'Review bid packet',
    history: ['Generated from contract monitoring'],
  });
}

function isContractCategory(value: string): value is ContractCategory {
  return value === 'School' || value === 'Government' || value === 'Medical';
}

function mergeById<T extends { id: string }>(preferred: T[], fallback: T[]) {
  const seen = new Set<string>();
  return [...preferred, ...fallback].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function labelForBidType(value: ProcurementBidType) {
  if (value === 'forecast') return 'Forecast';
  if (value === 'opportunity') return 'Opportunity';
  if (value === 'award') return 'Award';
  return 'Unknown';
}


export default App;
