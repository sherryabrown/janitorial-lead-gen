create extension if not exists pgcrypto;

create table if not exists spin_procurement_sources (
  id uuid primary key default gen_random_uuid(),
  geography_id text,
  entity_name text not null,
  entity_type text not null,
  county text,
  state_code text not null default 'AR',
  portal_type text not null default 'unknown',
  bids_url text,
  awards_url text,
  forecast_url text,
  access text not null default 'public',
  confidence text not null default 'low',
  needs_human_review boolean not null default true,
  verification_status text not null default 'needs-review',
  verification_note text,
  found_by text not null default 'deterministic',
  last_checked_at timestamptz,
  last_verified_at timestamptz,
  raw_registry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_name, county)
);

create table if not exists spin_contract_generation_runs (
  id uuid primary key default gen_random_uuid(),
  geography_id text,
  input_city text,
  input_zip text,
  input_county text,
  normalized_location text,
  status text not null default 'queued',
  stage text not null default 'received',
  error_message text,
  source_count integer not null default 0,
  opportunity_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists spin_contract_opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references spin_procurement_sources(id),
  geography_id text,
  project_name text not null,
  agency_name text not null,
  category text not null default 'Government',
  location text,
  contact_name text,
  contact_phone text,
  contact_email text,
  due_at timestamptz,
  expires_at timestamptz,
  estimated_value text,
  status text not null default 'new',
  source_url text,
  external_id text,
  content_hash text,
  summary text,
  next_action text not null default 'Review bid packet',
  raw_payload jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create index if not exists spin_procurement_sources_geography_id_idx
  on spin_procurement_sources(geography_id);

create index if not exists spin_procurement_sources_state_county_idx
  on spin_procurement_sources(state_code, county);

create index if not exists spin_contract_opportunities_status_idx
  on spin_contract_opportunities(status);

create index if not exists spin_contract_opportunities_due_at_idx
  on spin_contract_opportunities(due_at);

create index if not exists spin_contract_opportunities_expires_at_idx
  on spin_contract_opportunities(expires_at);

create index if not exists spin_contract_opportunities_source_hash_idx
  on spin_contract_opportunities(source_id, content_hash);

create index if not exists spin_contract_generation_runs_geo_created_idx
  on spin_contract_generation_runs(geography_id, created_at desc);

alter table spin_procurement_sources enable row level security;
alter table spin_contract_generation_runs enable row level security;
alter table spin_contract_opportunities enable row level security;

drop policy if exists "spin_procurement_sources_read" on spin_procurement_sources;
create policy "spin_procurement_sources_read"
  on spin_procurement_sources for select
  to anon, authenticated
  using (true);

drop policy if exists "spin_contract_generation_runs_read" on spin_contract_generation_runs;
create policy "spin_contract_generation_runs_read"
  on spin_contract_generation_runs for select
  to anon, authenticated
  using (true);

drop policy if exists "spin_contract_opportunities_read" on spin_contract_opportunities;
create policy "spin_contract_opportunities_read"
  on spin_contract_opportunities for select
  to anon, authenticated
  using (true);

create or replace function spin_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists spin_procurement_sources_touch_updated_at on spin_procurement_sources;
create trigger spin_procurement_sources_touch_updated_at
  before update on spin_procurement_sources
  for each row execute function spin_touch_updated_at();

drop trigger if exists spin_contract_opportunities_touch_updated_at on spin_contract_opportunities;
create trigger spin_contract_opportunities_touch_updated_at
  before update on spin_contract_opportunities
  for each row execute function spin_touch_updated_at();
