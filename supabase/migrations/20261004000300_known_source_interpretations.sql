-- Durable, immutable interpretation decisions for confirmed known-source captures.
begin;
create table if not exists public.procurement_interpretations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.procurement_search_requests(id),
  task_id uuid not null references public.procurement_coverage_tasks(id),
  packet_hash text not null check (packet_hash ~ '^[0-9a-f]{64}$'),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  outcome text not null check (outcome in ('reviewed_with_results','reviewed_no_results','partial')),
  staging_receipt jsonb,
  created_at timestamptz not null default now(),
  unique (request_id,task_id,packet_hash)
);
create index if not exists procurement_interpretations_request_idx
  on public.procurement_interpretations(request_id,created_at);
alter table public.procurement_interpretations enable row level security;
revoke all on public.procurement_interpretations from public,anon,authenticated;
grant select,insert,update on public.procurement_interpretations to service_role;
commit;
