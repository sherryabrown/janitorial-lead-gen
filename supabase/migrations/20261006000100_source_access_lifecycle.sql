-- Private source activation, independent from public research metadata.
begin;
alter table public.procurement_access_handoffs
  add column if not exists lifecycle jsonb not null default '{"version":1,"stages":{},"attempts":[],"events":[]}'::jsonb,
  add column if not exists lifecycle_revision integer not null default 0;
alter table public.procurement_access_handoffs
  add constraint procurement_access_lifecycle_shape check (
    lifecycle->>'version' = '1' and jsonb_typeof(lifecycle->'stages')='object'
    and jsonb_typeof(lifecycle->'events')='array' and jsonb_array_length(lifecycle->'events')<=500
    and jsonb_typeof(lifecycle->'attempts')='array' and lifecycle_revision>=0);

create or replace function public.record_procurement_access_event(
  p_handoff_id uuid, p_expected_revision integer, p_expected_updated_at timestamptz,
  p_event_id text, p_input_hash text, p_lifecycle jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare h public.procurement_access_handoffs%rowtype; prior jsonb; event jsonb; summary text;
begin
  select * into h from public.procurement_access_handoffs where id=p_handoff_id for update;
  if not found then raise exception 'Access handoff missing'; end if;
  select value into prior from jsonb_array_elements(h.lifecycle->'events') where value->>'id'=p_event_id;
  if prior is not null then
    if prior->>'input_hash'<>p_input_hash then raise exception 'Access event identity conflict'; end if;
    return jsonb_build_object('status','unchanged','id',h.id,'revision',h.lifecycle_revision);
  end if;
  if h.lifecycle_revision<>p_expected_revision or h.updated_at<>p_expected_updated_at then
    raise exception 'Access record changed; reread before retry';
  end if;
  event := p_lifecycle->'events'->-1;
  if p_input_hash !~ '^[a-f0-9]{64}$' or event->>'id' is distinct from p_event_id
    or event->>'input_hash' is distinct from p_input_hash
    or p_lifecycle->>'version' is distinct from '1'
    or (p_lifecycle->'events') - (jsonb_array_length(p_lifecycle->'events')-1) <> h.lifecycle->'events'
    or jsonb_array_length(p_lifecycle->'events')<>jsonb_array_length(h.lifecycle->'events')+1 then
    raise exception 'Invalid access event append';
  end if;
  if event->>'provenance' not in ('observed','historical','user_reported')
    or event->>'actor' not in ('researcher','user','agency','provider')
    or coalesce(event->>'next_action','')='' then raise exception 'Invalid access evidence'; end if;
  -- Account details/credentials never belong in the staff-readable registration summary.
  if h.registration_id is not null and event->>'type'='stage' and event->>'provenance'='observed' then
    if h.channel='portal' and event->>'stage'='sign_in' then
      summary := case event->>'state' when 'verified' then 'verified' when 'expired' then 'expired' when 'blocked' then 'blocked' else 'unknown' end;
      update public.procurement_registrations set login_state=summary,updated_at=now() where id=h.registration_id;
    elsif h.channel='portal' and event->>'stage'='email_verification' then
      summary := case event->>'state' when 'verified' then 'verified' when 'expired' then 'expired' when 'awaiting_email' then 'pending' else 'unknown' end;
      update public.procurement_registrations set email_verification_state=summary,updated_at=now() where id=h.registration_id;
    elsif h.channel='api' and event->>'stage' in ('request_verification','credential_issuance') then
      summary := case when event->>'stage'='request_verification' and event->>'state'='verified' then 'verified'
        when event->>'state' in ('expired','revoked') then 'expired'
        when event->>'state'='failed' then 'blocked' else 'verification_pending' end;
      update public.procurement_registrations set api_state=summary,updated_at=now() where id=h.registration_id;
    end if;
  end if;
  update public.procurement_access_handoffs set lifecycle=p_lifecycle,
    lifecycle_revision=lifecycle_revision+1, updated_at=clock_timestamp() where id=h.id;
  return jsonb_build_object('status','saved','id',h.id,'revision',h.lifecycle_revision+1);
end $fn$;
revoke all on function public.record_procurement_access_event(uuid,integer,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_procurement_access_event(uuid,integer,timestamptz,text,text,jsonb) to service_role;
-- Existing table and captures remain service-role only.
revoke all on public.procurement_access_handoffs from public,anon,authenticated;
grant select,insert,update on public.procurement_access_handoffs to service_role;
commit;
