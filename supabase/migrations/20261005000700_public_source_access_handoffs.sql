-- Research-only signup handoff. Account details and credentials belong elsewhere.
create table if not exists public.procurement_access_handoffs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.procurement_sources(id),
  registration_id uuid references public.procurement_registrations(id),
  channel text not null check (channel in ('portal','api')),
  tenant text not null,
  checked_on date not null,
  access_state text not null check (access_state in ('unknown','public','account_required','approval_required','key_required','paid','blocked','pending','verified')),
  next_actor text not null check (next_actor in ('researcher','user','agency','provider')),
  next_action text not null,
  details jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (source_id, channel, tenant)
);
alter table public.procurement_access_handoffs enable row level security;
revoke all on public.procurement_access_handoffs from public, anon, authenticated;
grant select, insert, update on public.procurement_access_handoffs to service_role;
