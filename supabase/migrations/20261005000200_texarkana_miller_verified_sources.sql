-- Reviewed official-source evidence as of 2026-10-05. A source entry is not category coverage.
-- TWU's public listing is an opportunity method; bid detail may require registration.
begin;

insert into public.procurement_sources
  (id, code, name, contracting_entity_geo_level, business_category,
   source_coverage_areas, url, config, identity_key)
values
  ('6706d1e1-c962-598d-a130-5192b9af52d5', 'texarkana-water-utilities',
   'Texarkana Water Utilities', 'city', 'other_public',
   '[{"area_type":"city","city_name":"Texarkana","state_code":"AR"}]'::jsonb,
   'https://twu.txkusa.org/bids.aspx',
   jsonb_build_object('known_source_research', jsonb_build_object(
     'checked_at','2026-10-05T00:00:00Z',
     'geographic_scope','Joint Texarkana AR/TX utility; route via Texarkana AR, then review each work site',
     'identity_evidence','https://twu.txkusa.org/pview.aspx?catid=70&id=645',
     'opportunity_evidence','https://twu.txkusa.org/bids.aspx',
     'access_method','Public HTML listing; linked bid details may require registration',
     'check_instructions','Fetch the current Bid Announcements listing for each request; interpret listing rows and check work location before staging; a successful fetch alone is not zero coverage',
     'unverified_categories',jsonb_build_array('forecast','award'))),
   encode(sha256('texarkana-water-utilities|https://twu.txkusa.org/bids.aspx'::bytea),'hex')),
  ('ed638142-6f85-542a-a7cf-929ff998e6a8', 'miller-county',
   'Miller County, Arkansas', 'county', 'other_public',
   '[{"area_type":"county","county_name":"Miller County","state_code":"AR"}]'::jsonb,
   'https://millercountyar.gov/transparency/',
   jsonb_build_object('known_source_research', jsonb_build_object(
     'checked_at','2026-10-05T00:00:00Z',
     'geographic_scope','Miller County government, Arkansas',
     'identity_evidence','https://millercountyar.gov/',
     'access_method','Public HTML entry page; current bids and bid winners are listed as text without linked records',
     'check_instructions','Check the official transparency entry and clerk documents; do not treat the entry check as forecast, opportunity, or award coverage',
     'entry_evidence','https://millercountyar.gov/transparency/',
     'minutes_evidence','https://millercountyclerkar.com/minutes/',
     'unverified_categories',jsonb_build_array('forecast','opportunity','award'))),
   encode(sha256('miller-county|https://millercountyar.gov/transparency/'::bytea),'hex'))
on conflict (id) do nothing;

-- Do not silently treat a code collision as the reviewed identity.
do $check$ begin
  if not exists (select 1 from public.procurement_sources where id='6706d1e1-c962-598d-a130-5192b9af52d5' and code='texarkana-water-utilities'
      and url='https://twu.txkusa.org/bids.aspx')
    or not exists (select 1 from public.procurement_sources where id='ed638142-6f85-542a-a7cf-929ff998e6a8' and code='miller-county'
      and url='https://millercountyar.gov/transparency/') then
    raise exception 'Reviewed source identity differs';
  end if;
end $check$;

insert into public.procurement_source_capabilities
  (id, source_id, kind, method, endpoint_url, official_entry_url, availability,
   verified_at, verified_until, verification_evidence, parser_version,
   next_action, route_geography_id, method_spec)
values
  ('70915bc1-f057-5241-a73b-08488d79e943',
   '6706d1e1-c962-598d-a130-5192b9af52d5', 'opportunity', 'browser',
   'https://twu.txkusa.org/bids.aspx', 'https://twu.txkusa.org/bids.aspx', 'active',
   '2026-10-05T00:00:00Z', '2026-11-04T00:00:00Z',
   jsonb_build_object('official_listing','https://twu.txkusa.org/bids.aspx',
     'official_scope','https://twu.txkusa.org/pview.aspx?catid=70&id=645',
     'observed_text','Current bid and RFP opportunities are listed below; No results found',
     'checked_at','2026-10-05T00:00:00Z',
     'coverage_limit','Public listing only; bid details may require registration; AR work site must be checked; an empty listing is not historical coverage',
     'interpretation','pending'),
   'public-capture-v1',
   'Review each saved listing row and linked detail; preserve registration and work-site gaps',
   'ARMc356855dbb7f44b0a2166b30318bb5eb',
   '{"version":1,"runner_id":"public-fetch","check_when":"each_request","urls":["https://twu.txkusa.org/bids.aspx"],"allowed_hosts":["twu.txkusa.org"],"max_bytes":2000000}'::jsonb)
on conflict (id) do nothing;

commit;
