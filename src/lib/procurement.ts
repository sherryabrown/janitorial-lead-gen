import type { SupabaseClient } from '@supabase/supabase-js';

type JsonRecord = Record<string, unknown>;

export type ProcurementBidType = 'forecast' | 'opportunity' | 'award' | 'unknown';
export type ProcurementKeyDateKind = 'date' | 'datetime' | 'text';
export type ProcurementKeyDate = {
  key: string;
  label: string;
  value: string;
  kind: ProcurementKeyDateKind;
};

export type ProcurementLead = {
  id: string;
  source_id: string | null;
  payload: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
  detected_change_at: string | null;
  search_term_used: string | null;
  stage: string | null;
  stage_reason: string | null;
  next_action: string | null;
  follow_up_on: string | null;
  notes: string | null;
  estimated_annual_amount: number | string | null;
  bid_type: string | null;
  business_category: string | null;
  contracting_entity_geo_level: string | null;
  title: string | null;
  agency: string | null;
  source_url: string | null;
  solicitation_number: string | null;
  award_number: string | null;
  publication_date: string | null;
  response_deadline: string | null;
  planned_advertisement_period: string | null;
  contract_start_date: string | null;
  contract_current_end_date: string | null;
  contract_potential_end_date: string | null;
  work_performance_city: string | null;
  work_performance_state: string | null;
};

export type ProcurementSource = {
  id: string;
  code: string | null;
  name: string | null;
  contracting_entity_geo_level: string | null;
  business_category: string | null;
  url: string | null;
  source_coverage_areas?: unknown;
  config?: JsonRecord | null;
};

export type ProcurementContract = {
  id: string;
  projectName: string;
  agencyName: string;
  category: 'School' | 'Government' | 'Medical';
  location: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  bidType: ProcurementBidType;
  keyDates: ProcurementKeyDate[];
  dateType: 'due' | 'expiring';
  date: string;
  estimatedValue?: string;
  status: 'new' | 'interested' | 'not-interested' | 'applied' | 'hold' | 'won' | 'lost' | 'withdrew';
  stageReason?: string;
  sourceId: string;
  sourceUrl?: string;
  addedAt: string;
  updatedAt: string;
  contractLastUpdatedAt?: string;
  nextAction: string;
  notes: string[];
  researchNotes: string[];
  history: string[];
};

export type ProcurementSourceView = {
  id: string;
  name: string;
  agencyType: 'County' | 'City' | 'Municipality' | 'School district' | 'Agency';
  location: string;
  category: 'School' | 'Government' | 'Medical';
  url: string;
  status: 'needs-review' | 'current';
  lastChecked: string;
};

export type ProcurementHistoryRow = {
  id: string;
  lead_id: string;
  actor_id: string | null;
  occurred_at: string;
  event_type: 'stage_changed' | 'note_added' | 'system' | 'lead_identified';
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note_text: string | null;
  metadata: Record<string, unknown>;
};
export type LeadNoteRow = { id: string; lead_id: string; body: string; created_by: string; created_at: string; updated_by: string | null; updated_at: string | null };
export type LeadNoteEditRow = { id: string; note_id: string; old_body: string; new_body: string; edited_by: string; edited_at: string };
export type LeadStatusChangeRow = { id: string; lead_id: string; from_status: string | null; to_status: string; from_reason: string | null; to_reason: string | null; reason_code: string | null; reason_note: string | null; changed_by: string; created_at: string };
type LeadTimestampRow = { id: string; created_at: string | null };
export type ProcurementStageReason = { code: string; note?: string };

export async function loadProcurementContracts(client: SupabaseClient, filters: Record<string, unknown> = {}, page = 0) {
  const { data, error } = await client.rpc('procurement_queue_page', {
    p_filters: filters, p_limit: 50, p_offset: Math.max(0, page) * 50,
  });
  if (error) throw error;
  const result = data as { rows: ProcurementLead[]; total: number; counts: Record<string, number> };
  const sources: ProcurementSource[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: rows, error: sourceError } = await client.from('procurement_sources')
      .select('id,code,name,contracting_entity_geo_level,business_category,url,source_coverage_areas,config')
      .order('id').range(offset, offset + 499);
    if (sourceError) throw sourceError;
    sources.push(...(rows ?? []) as ProcurementSource[]);
    if (!rows || rows.length < 500) break;
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return {
    contracts: result.rows.map((lead) => mapProcurementLead(lead, sourceById.get(lead.source_id ?? ''))),
    sources: sources.map(mapProcurementSource), total: result.total, counts: result.counts,
  };
}

export async function loadProcurementLeadDetail(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('procurement_leads').select('*').eq('id', id).single();
  if (error) throw error;
  return mapProcurementLead(data as ProcurementLead);
}

export function mapProcurementLead(lead: ProcurementLead, source?: ProcurementSource): ProcurementContract {
  const payload = lead.payload ?? {};
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const contact = isRecord(contacts[0]) ? contacts[0] : {};
  const bidType = normalizeBidType(lead.bid_type ?? firstString(payload.bid_type));
  const keyDates = buildKeyDates(lead, payload, bidType);
  const primaryDate = getPrimaryDate(keyDates, bidType);
  const date = primaryDate ?? '';
  const location = formatDedicatedLocation(lead) ?? formatLocation(payload.work_performance_locations);
  const title = firstString(lead.title, payload.title, payload.project_name, payload.name) ?? 'Procurement opportunity';
  const agency = firstString(lead.agency, payload.agency, payload.agency_name) ?? source?.name ?? 'Agency pending';
  const linkState = isRecord(payload.source_link) ? payload.source_link : {};
  const storedUrl = firstString(lead.source_url, payload.source_url);
  const apiUrl = storedUrl && /^https:\/\/api\./i.test(storedUrl);
  const sourceUrl = linkState.status === 'unresolved' || apiUrl ? undefined : storedUrl;
  const addedAt = lead.created_at ?? '';
  const updatedAt = lead.updated_at ?? '';

  return {
    id: lead.id,
    projectName: title,
    agencyName: agency,
    category: mapCategory(lead.business_category ?? firstString(payload.business_category, source?.business_category)),
    location,
    contactName: firstString(contact.name, contact.email) ?? '',
    contactPhone: firstString(contact.phone),
    contactEmail: firstString(contact.email),
    bidType,
    keyDates,
    dateType: bidType === 'award' ? 'expiring' : 'due',
    date,
    estimatedValue: formatAmount(lead.estimated_annual_amount),
    status: mapStage(lead.stage),
    sourceId: lead.source_id ?? source?.id ?? `source-${lead.id}`,
    sourceUrl,
    addedAt,
    updatedAt,
    contractLastUpdatedAt: lead.detected_change_at ?? undefined,
    nextAction: firstString(lead.next_action, payload.next_action, linkState.next_action) ?? 'Review lead',
    notes: lead.notes ? [lead.notes] : [],
    researchNotes: [...new Set([firstString(payload.status_note), firstString(payload.verification_notes)].filter((note): note is string => Boolean(note)))],
    stageReason: lead.stage_reason ?? undefined,
    history: [],
  };
}

export async function loadProcurementLeadHistory(client: SupabaseClient, leadId: string) {
  const { data: notes, error: notesError } = await client.from('procurement_lead_notes').select('id,lead_id,body,created_by,created_at,updated_by,updated_at').eq('lead_id', leadId);
  const noteIds = ((notes ?? []) as LeadNoteRow[]).map((row) => row.id);
  const [{ data: lead, error: leadError }, { data: edits, error: editsError }, { data: changes, error: changesError }] = await Promise.all([
    client.from('procurement_leads').select('id,created_at').eq('id', leadId).maybeSingle(),
    noteIds.length ? client.from('procurement_lead_note_edits').select('id,note_id,old_body,new_body,edited_by,edited_at').in('note_id', noteIds) : Promise.resolve({ data: [], error: null }),
    client.from('procurement_lead_stage_changes').select('id,lead_id,from_status,to_status,from_reason,to_reason,reason_code,reason_note,changed_by,created_at').eq('lead_id', leadId),
  ]);
  if (notesError || leadError || editsError || changesError) throw notesError ?? leadError ?? editsError ?? changesError;
  const noteRows = (notes ?? []) as LeadNoteRow[];
  const editRows = (edits ?? []) as LeadNoteEditRow[];
  const changeRows = (changes ?? []) as LeadStatusChangeRow[];
  const leadRow = lead as LeadTimestampRow | null;
  return [
    ...(leadRow?.created_at ? [{ id: `lead-identified-${leadRow.id}`, lead_id: leadRow.id, actor_id: null, occurred_at: leadRow.created_at, event_type: 'lead_identified' as const, old_value: null, new_value: null, note_text: null, metadata: {} }] : []),
    ...noteRows.map((row) => ({ id: row.id, lead_id: row.lead_id, actor_id: row.created_by, occurred_at: row.created_at, event_type: 'note_added' as const, old_value: null, new_value: null, note_text: row.body, metadata: { note_id: row.id, updated_at: row.updated_at } })),
    ...editRows.map((row) => ({ id: row.id, lead_id: leadId, actor_id: row.edited_by, occurred_at: row.edited_at, event_type: 'note_added' as const, old_value: { body: row.old_body }, new_value: { body: row.new_body }, note_text: row.new_body, metadata: { note_id: row.note_id, edit: true } })),
    ...changeRows.map((row) => ({ id: row.id, lead_id: row.lead_id, actor_id: row.changed_by, occurred_at: row.created_at, event_type: 'stage_changed' as const, old_value: { stage: row.from_status, reason: row.from_reason }, new_value: { stage: row.to_status, reason: row.to_reason }, note_text: row.reason_note, metadata: { reason_code: row.reason_code } })),
  ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) as ProcurementHistoryRow[];
}

export async function updateProcurementLeadStage(
  client: SupabaseClient,
  leadId: string,
  stage: ProcurementContract['status'],
  reason?: ProcurementStageReason,
) {
  const { data, error } = await client.rpc('update_procurement_lead_stage', {
    p_lead_id: leadId,
    p_new_stage: stage,
    p_reason_code: reason?.code ?? null,
    p_reason_note: reason?.note ?? null,
  });
  if (error) throw error;
  return data as ProcurementLead;
}

export async function bulkUpdateProcurementLeadStage(
  client: SupabaseClient,
  leadIds: string[],
  stage: ProcurementContract['status'],
  reason?: ProcurementStageReason,
) {
  const { data, error } = await client.rpc('bulk_update_procurement_lead_stage', {
    p_lead_ids: leadIds,
    p_new_stage: stage,
    p_reason_code: reason?.code ?? null,
    p_reason_note: reason?.note ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ProcurementLead[];
}

export async function findLeadIdsByActivityDate(client: SupabaseClient, dateFrom?: string, dateTo?: string) {
  let leadQuery = client.from('procurement_leads').select('id').order('updated_at', { ascending: false });
  let stageQuery = client.from('procurement_lead_stage_changes').select('lead_id').order('created_at', { ascending: false });
  let noteQuery = client.from('procurement_lead_notes').select('lead_id').order('created_at', { ascending: false });
  let editQuery = client.from('procurement_lead_note_edits').select('note_id').order('edited_at', { ascending: false });
  if (dateFrom) {
    const start = `${dateFrom}T00:00:00`;
    leadQuery = leadQuery.gte('updated_at', start);
    stageQuery = stageQuery.gte('created_at', start);
    noteQuery = noteQuery.gte('created_at', start);
    editQuery = editQuery.gte('edited_at', start);
  }
  if (dateTo) {
    const end = `${dateTo}T23:59:59.999`;
    leadQuery = leadQuery.lte('updated_at', end);
    stageQuery = stageQuery.lte('created_at', end);
    noteQuery = noteQuery.lte('created_at', end);
    editQuery = editQuery.lte('edited_at', end);
  }
  const [{ data: leads, error: leadsError }, { data: stages, error: stagesError }, { data: notes, error: notesError }, { data: edits, error: editsError }] = await Promise.all([
    leadQuery,
    stageQuery,
    noteQuery,
    editQuery,
  ]);
  if (leadsError || stagesError || notesError || editsError) throw leadsError ?? stagesError ?? notesError ?? editsError;

  const editedNoteIds = [...new Set((edits ?? []).map((row) => row.note_id as string))];
  const { data: editedNotes, error: editedNotesError } = editedNoteIds.length
    ? await client.from('procurement_lead_notes').select('lead_id').in('id', editedNoteIds)
    : { data: [], error: null };
  if (editedNotesError) throw editedNotesError;

  return [...new Set([
    ...(leads ?? []).map((row) => row.id as string),
    ...(stages ?? []).map((row) => row.lead_id as string),
    ...(notes ?? []).map((row) => row.lead_id as string),
    ...(editedNotes ?? []).map((row) => row.lead_id as string),
  ])];
}

export async function addProcurementLeadNote(client: SupabaseClient, leadId: string, text: string) {
  const { data, error } = await client.rpc('create_lead_note', {
    p_lead_id: leadId,
    p_body: text,
  });
  if (error) throw error;
  return data as LeadNoteRow;
}

export async function editProcurementLeadNote(client: SupabaseClient, noteId: string, text: string) {
  const { data, error } = await client.rpc('edit_lead_note', { p_note_id: noteId, p_new_body: text });
  if (error) throw error;
  return data as LeadNoteRow;
}

function normalizeBidType(value: string | null | undefined): ProcurementBidType {
  const normalized = (value ?? '').toLowerCase().replace(/[_\s-]+/g, '');
  if (normalized.includes('historical') || normalized.includes('candidate')) return 'unknown';
  if (normalized.includes('forecast')) return 'forecast';
  if (normalized.includes('opportunity') || normalized.includes('solicitation')) return 'opportunity';
  if (normalized.includes('award') || normalized === 'contract') return 'award';
  return 'unknown';
}

function buildKeyDates(
  lead: ProcurementLead,
  payload: JsonRecord,
  bidType: ProcurementBidType,
): ProcurementKeyDate[] {
  const publication = lead.publication_date ?? firstString(payload.published_date);
  const plannedAdvertisement = lead.planned_advertisement_period ?? firstString(payload.planned_advertisement_period);
  const responseDeadline = lead.response_deadline ?? firstString(payload.deadline, payload.due_at);
  const contractStart = lead.contract_start_date ?? firstString(payload.contract_start);
  const currentEnd = lead.contract_current_end_date ?? firstString(payload.contract_end, payload.expires_at);
  const potentialEnd = lead.contract_potential_end_date ?? firstString(payload.ultimate_end);
  const dates: ProcurementKeyDate[] = [];

  if (bidType === 'forecast') {
    addKeyDate(dates, 'publication', 'Published', publication, 'date');
    addKeyDate(dates, 'planned-advertisement', 'Expected advertisement', plannedAdvertisement, 'text');
    addKeyDate(dates, 'contract-start', 'Expected start', contractStart, 'date');
  } else if (bidType === 'opportunity') {
    addKeyDate(dates, 'publication', 'Published', publication, 'date');
    addKeyDate(dates, 'response-deadline', 'Response deadline', responseDeadline, 'datetime');
    addKeyDate(dates, 'contract-start', 'Anticipated start', contractStart, 'date');
    addKeyDate(dates, 'current-end', 'Current end', currentEnd, 'date');
    addKeyDate(dates, 'potential-end', 'Potential end', potentialEnd, 'date');
  } else if (bidType === 'award') {
    addKeyDate(dates, 'publication', 'Award notice published', publication, 'date');
    addKeyDate(dates, 'contract-start', 'Contract start', contractStart, 'date');
    addKeyDate(dates, 'current-end', 'Current end', currentEnd, 'date');
    addKeyDate(dates, 'potential-end', 'Potential end', potentialEnd, 'date');
  }
  return dates;
}

function addKeyDate(
  dates: ProcurementKeyDate[],
  key: string,
  label: string,
  value: string | null | undefined,
  kind: ProcurementKeyDateKind,
) {
  if (value && value.trim()) dates.push({ key, label, value: value.trim(), kind });
}

function getPrimaryDate(dates: ProcurementKeyDate[], bidType: ProcurementBidType) {
  const preferred = bidType === 'forecast'
    ? ['publication', 'contract-start']
    : bidType === 'opportunity'
      ? ['response-deadline', 'publication', 'contract-start']
      : bidType === 'award'
        ? ['current-end', 'contract-start', 'publication']
        : [];
  return preferred.map((key) => dates.find((date) => date.key === key)?.value).find(Boolean) ?? null;
}

export function mapProcurementSource(source: ProcurementSource): ProcurementSourceView {
  const name = source.name ?? source.code ?? 'Procurement source';
  const research = isRecord(source.config?.research_persistence) ? source.config.research_persistence : {};
  const scopes = isRecord(research.coverage_by_scope) ? Object.values(research.coverage_by_scope).filter(isRecord) : [];
  const checked = scopes.map(scope => firstString(scope.checked_at)).filter((value): value is string => Boolean(value)).sort();
  const coverage = scopes.flatMap(scope => isRecord(scope.coverage) ? Object.values(scope.coverage).filter(isRecord) : []);
  const areas = Array.isArray(source.source_coverage_areas) ? source.source_coverage_areas.filter(isRecord) : [];
  const locations = areas.map(area => {
    const name = firstString(area.city_name, area.county_name);
    return [name ? name + (area.area_type === 'county' ? ' County' : '') : undefined, firstString(area.state_code)].filter(Boolean).join(', ');
  }).filter(Boolean);
  return {
    id: source.id,
    name,
    agencyType: mapAgencyType(source.contracting_entity_geo_level, name),
    location: locations.length ? [...new Set(locations)].join(' • ') : source.contracting_entity_geo_level === 'federal' ? 'Arkansas coverage' : 'Arkansas',
    category: mapCategory(source.business_category),
    url: source.url ?? '',
    status: scopes.length && (!coverage.length || coverage.some(item => !['complete', 'checked'].includes(String(item.status)))) ? 'needs-review' : 'current',
    lastChecked: checked.at(-1)?.slice(0, 10) ?? 'From Supabase',
  };
}

function mapStage(stage: string | null): ProcurementContract['status'] {
  const normalized = (stage ?? 'new').toLowerCase().replace(/[_\s]+/g, '-');
  if (['interested', 'in-progress', 'in-review'].includes(normalized)) return 'interested';
  if (['hold', 'on-hold', 'paused'].includes(normalized)) return 'hold';
  if (['not-interested', 'not-a-fit', 'rejected'].includes(normalized)) return 'not-interested';
  if (['applied', 'submitted'].includes(normalized)) return 'applied';
  if (['won', 'awarded'].includes(normalized)) return 'won';
  if (['lost', 'closed-lost'].includes(normalized)) return 'lost';
  if (['withdrew', 'withdrawn'].includes(normalized)) return 'withdrew';
  return 'new';
}

function mapCategory(value?: string | null): ProcurementContract['category'] {
  const normalized = (value ?? '').toLowerCase();
  if (/school|university|education/.test(normalized)) return 'School';
  if (/medical|health|hospital|clinic/.test(normalized)) return 'Medical';
  return 'Government';
}

function mapAgencyType(value: string | null, name: string): ProcurementSourceView['agencyType'] {
  const normalized = `${value ?? ''} ${name}`.toLowerCase();
  if (normalized.includes('school') || normalized.includes('university')) return 'School district';
  if (normalized.includes('county')) return 'County';
  if (normalized.includes('city')) return 'City';
  if (normalized.includes('municip')) return 'Municipality';
  return 'Agency';
}

function formatLocation(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return 'Location pending';
  const locations = value.filter(isRecord).map((location) => {
    const city = firstString(location.city_name, location.city);
    const state = firstString(location.state_code, location.state);
    return [city, state].filter(Boolean).join(', ');
  }).filter(Boolean);
  if (locations.length === 0) return 'Location pending';
  return [...new Set(locations)].slice(0, 2).join(' • ');
}

function formatDedicatedLocation(lead: ProcurementLead) {
  const location = [lead.work_performance_city, lead.work_performance_state]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(', ');
  return location || undefined;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function formatAmount(value: number | string | null) {
  if (value == null || value === '') return undefined;
  return typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : value;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
