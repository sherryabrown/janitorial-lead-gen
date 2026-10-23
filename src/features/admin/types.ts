export type Category = 'forecast' | 'opportunity' | 'award';
export type SamConfig = {
  target_kind: 'sam';
  requested_categories: ['opportunity' | 'award'];
  publication_window: { from: string; to: string };
};
export type SamSchedule = Omit<Schedule, 'config' | 'window_policy'> & {
  config: SamConfig;
  window_policy: Record<string, { lookback_days: number }>;
};
export type AnySchedule = Schedule | SamSchedule;
export type County = { id: string; name: string; cities?: {id:string;name:string}[]; selection_token?:string };
export type ScopeCounty = County & {
  city_ids: string[];
  cities: County[];
  selection_token: string;
};
export type Config = {
  target_kind: 'county_scope' | 'state_source';
  state_trigger_id?: string | null;
  state_trigger_ids?: string[];
  state_sources?: {id:string;source_id:string;name:string;category:Category;county_ids:string[]}[];
  county_ids: string[];
  counties?: ScopeCounty[];
  maintain_sources: boolean;
  check_updates: boolean;
  requested_categories: Category[];
  search_windows?: Record<
    string,
    { from: string; to: string; date_basis: string }
  >;
};
export type WindowPolicy = Record<
  string,
  { from_offset_days: number; to_offset_days: number; date_basis: string }
>;
export type Recurrence = {
  timezone: 'America/Chicago';
  frequency: 'daily' | 'weekly' | 'monthly';
  local_times: string[];
  weekdays?: number[];
  month_day?: number | null;
};
export type Draft = {
  config: Config;
  window_policy: WindowPolicy;
  recurrence: Recurrence;
  name: string;
  enabled: boolean;
};
export type Preview = {
  config: Config & { counties: ScopeCounty[] };
  preview_hash: string;
  next_due_at?: string | null;
  budget?: { usd: number };
  actions?: { county_id: string; state_research?: { action: string }[] }[];
};
export type Schedule = Draft & {
  can_delete?: boolean;
  updated_at?: string;
  reporting?: { as_of: string; latest_occurrence?: {state: string; reason?: string; trigger_id?: string; created_at: string} | null;
    last_run: (Run & {leads: {identities?:boolean;added: number | null; updated: number | null; unchanged: number | null; completeness: string; reason?: string}}) | null };
  id: string;
  version: number;
  next_due_at: string | null;
  blocker?: string | null;
  archived_at?: string | null;
  archived?: boolean;
};
export type Page<T> = { items: T[]; next_offset: number | null; total?: number };
export type Usage = {
  ai: 'used' | 'not_used' | 'unknown';
  input_tokens: number | null;
  output_tokens: number | null;
  actual_usd: number | null;
  known_actual_usd: number;
  held_usd: number;
  credits?: number | null;
  credit_unit?: string | null;
};
export type Run = {
 identity_snapshot?:string;
  finished_at?: string | null;
  schedule_id?: string | null;
  occurrence_id?: string | null;
  reporting?: RunMetrics;
  leads?: LeadCounts;
  timing?: RunTiming;
  categories?: RunMetrics['categories'];
  candidates_attention?: RunMetrics['candidates_attention'];
  presentation?: {outcome: 'source_attention'; attention_count: number};
  category?: 'opportunity' | 'award' | null;
  id: string;
  state: string;
  created_at: string;
  target_kind: string;
  county_count?: number;
  candidate_count?: number;
  evidence_count?: number;
  schedule_name?: string | null;
  origin?: string;
  usage?: Usage;
  config?: Config | SamConfig;
  children?: { request_id: string; county_id: string; role: string; source_id?:string;source_name?:string;category?:Category }[];
  next_action?: string;
  related_state_sources?: StateSource[];
};
export type Step = {
  source_id?: string | null;
  source_name?: string | null;
  diagnostic_id?: string | null;
  origin?: string;
  id: string;
  sequence: number;
  phase: string;
  state: string;
  started_at: string;
  finished_at: string | null;
  county_id: string;
  reason: string;
  summary: Record<string, unknown>;
  usage: Usage;
};
export type LeadCounts = {identities?:boolean;added: number|null; updated: number|null; unchanged: number|null; completeness: string; reason?: string};
export type RunTiming = {created_at: string; finished_at: string|null; created_to_finished_ms: number|null; recorded_activity_ms: number|null; completeness: string; basis: string;reason?:string};
export type RunMetrics = {identity_snapshot?:string;leads?: LeadCounts; timing?: RunTiming; categories?: {completeness:string; forecast:number|null; opportunity:number|null; award:number|null; historical_opportunity?:number|null; reason:string}; candidates_attention?:{value:number|null;completeness:string;reason:string}};
export type StateSource = {
  id: string;
  source_id: string;
  name: string;
  category: Category;
  county_ids: string[];
  schedule_id: string | null;
  schedule_enabled: boolean | null;
  next_due_at: string | null;
  latest_run: string | null;
  last_finished_at: string | null;
};
export type SchedulerStatus = {
  enabled: boolean;
  extensions_ready: boolean;
  backend_key_configured?: boolean;
  ai_policy?: { enabled: boolean; monthly_usd: number | null };
};
export type Candidate = {
  intake_id: string;
  intake_hash: string;
  title: string;
  state: string;
};
export type Task = {
  attention?: {kind: string; blocker: string; next_action: string; action_kind: 'evidence' | 'retry'} | null;
  discovery_state?: string | null;
  discovery_action?: string | null;
  source_name?: string | null;
  location_name?: string | null;
  id: string;
  source_id: string | null;
  category: string;
  state: string;
  reason: string;
  pages: number;
};
export type Job = {
  access_handoff_id?: string | null;
  capture_state?: string | null;
  id: string;
  state: string;
  stage: string;
  next_action: string;
};
export type RequestStatus = {
  automatic_county?: boolean;
  automatic_import?: {
    policy: 'county-automatic-v1'; state: string; verified: boolean;
    added: number; updated: number; unchanged: number;
    exclusions: {intake_id: string; title?: string; reason: string}[]; job_ids: string[];
  };
  check_updates?: boolean;
  request_id: string;
  tasks: Task[];
  jobs: Job[];
  candidates: Candidate[];
  total_candidates: number;
  next_offset: number | null;
  usage: Usage;
};
export type SamPacket = {
  collection_pending?: boolean;
  evidence_key?: string | null;
  automatic?: {
    job_id?: string | null;
    collection_blocker?: string | null;
    can_continue?: boolean;
    state: string;
    stage: string;
    verified: boolean;
    added: number;
    updated: number;
    unchanged: number;
    exclusions: { intake_id: string; title: string; reason: string }[];
  };
  request_id: string;
  category?: string;
  publication_window?: { from: string; to: string };
  records?: number | null;
  run_ids: string[];
  terminal_confirmed: boolean;
  partial: boolean;
  canonical_writes: number;
  candidates: {
    intake_id: string;
    title: string;
    agency?: string;
    bid_type?: string;
    source_url?: string;
    deadline?: string;
    contract_start?: string;
    contract_end?: string;
    work_performance_locations?: unknown[];
  }[];
  captures: {
    run_id: string;
    kind: string;
    filters: Record<string, unknown>;
    query_url: string;
  }[];
  next_action: string;
};
export type EvidencePage = {
  run_id: string;
  url: string;
  review: string;
  content_sha256?: string;
};
export type Packet = {
  detail_collection?: {
    complete: boolean;
    reason?: string;
    projects: {
      id: string;
      state: string;
      documents_complete?: boolean;
      document_overflow?: boolean;
      evidence: {
        url: string;
        capture_receipt: string;
        content_sha256: string;
        content_type: string;
        retrieved_at: string;
        local_path: string;
      }[];
    }[];
  };
  portal_url?: string;
  project_links?: {
    id: string;
    title: string;
    closes: string;
    url: string;
    run_id: string;
    content_sha256: string;
  }[];
  version: number;
  packet_hash: string;
  category: Category;
  task_id: string;
  request_id: string;
  complete: boolean;
  registration_verified?: boolean;
  current_interpretation?: {
    id: string;
    packet_hash: string;
    counts: { findings: number; exclusions: number; unresolved: number };
  } | null;
  query_window?: { date_basis: string };
  pages: EvidencePage[];
  seed_source_id?: string;
  source?: {
    id: string;
    code: string;
    name: string;
    url: string;
    contracting_entity_geo_level: string;
    business_category: string;
    source_coverage_areas?: unknown[];
  };
  route_geography_id?: string;
  links?: { url: string; label: string }[];
  state?: string;
  next_action?: string;
};
export type ImportStatus = {
  job_id: string;
  state: string;
  stage: string;
  approval_sha256: string | null;
  summary: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
  next_action: string;
  test?: { status?: string };
};
