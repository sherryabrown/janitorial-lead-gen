-- Register incorporated Arkansas municipalities from the Arkansas GIS Office.
begin;

alter table public.procurement_geographies
  drop constraint procurement_geographies_check,
  drop constraint procurement_geographies_kind_check;
alter table public.procurement_geographies
  add column source_active boolean not null default true,
  add column source_label text,
  add column place_type text,
  add constraint procurement_geographies_kind_check
    check (kind in ('state', 'county', 'place', 'municipality')),
  add constraint procurement_geographies_check
    check ((kind = 'state' and id = '05')
      or (kind = 'county' and id ~ '^05[0-9]{3}$')
      or (kind = 'place' and id ~ '^05[0-9]{5}$')
      or (kind = 'municipality' and id ~ '^ARM[0-9a-f]{32}$'));

-- Preserve legacy Census IDs and relationships, but exclude Census places
-- from procurement request selection. Keep the original label for provenance.
update public.procurement_geographies
set source_label = name,
    place_type = lower(substring(name from ' (city|town|CDP)$')),
    name = regexp_replace(name, ' (city|town|CDP)$', '', 'i'),
    source_active = false
where kind = 'place';

alter table public.procurement_place_counties
  drop constraint procurement_place_counties_check;
alter table public.procurement_place_counties
  add constraint procurement_place_counties_check
    check ((place_id ~ '^05[0-9]{5}$' or place_id ~ '^ARM[0-9a-f]{32}$')
      and county_id ~ '^05[0-9]{3}$');

create or replace function public.sync_procurement_municipalities(
  p_municipalities jsonb, p_expected_count integer, p_dataset_version text)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare item jsonb; county_id text; municipality_id text; updated_count integer := 0;
begin
  if jsonb_typeof(p_municipalities) <> 'array'
     or p_expected_count is null or p_expected_count < 1
     or jsonb_array_length(p_municipalities) <> p_expected_count
     or nullif(btrim(p_dataset_version), '') is null then
    raise exception 'Complete GIS municipality manifest and version required';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_municipalities) x)
       <> p_expected_count then
    raise exception 'Duplicate municipality ID';
  end if;
  for item in select value from jsonb_array_elements(p_municipalities) loop
    municipality_id := item->>'id';
    if municipality_id !~ '^ARM[0-9a-f]{32}$'
       or nullif(btrim(item->>'name'), '') is null
       or nullif(btrim(item->>'classification'), '') is null
       or nullif(btrim(item->>'dataset_hash'), '') is null
       or jsonb_typeof(item->'county_ids') <> 'array'
       or jsonb_array_length(item->'county_ids') = 0 then
      raise exception 'Invalid GIS municipality entry: %', municipality_id;
    end if;
    if (select count(*) from jsonb_array_elements_text(item->'county_ids') x)
       <> (select count(distinct x) from jsonb_array_elements_text(item->'county_ids') x) then
      raise exception 'Duplicate county for municipality %', municipality_id;
    end if;
    for county_id in select value from jsonb_array_elements_text(item->'county_ids') loop
      if not exists (select 1 from public.procurement_geographies
        where id = county_id and kind = 'county' and source_active) then
        raise exception 'Unknown county % for municipality %', county_id, municipality_id;
      end if;
    end loop;
    insert into public.procurement_geographies
      (id, kind, name, state_code, incorporated, dataset_url, dataset_version,
       dataset_hash, source_active, source_label, place_type)
    values (municipality_id, 'municipality', btrim(item->>'name'), 'AR', true,
      'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41',
      p_dataset_version, item->>'dataset_hash', true, item->>'name', item->>'classification')
    on conflict (id) do update set
      name = excluded.name, dataset_version = excluded.dataset_version,
      dataset_hash = excluded.dataset_hash, source_active = true,
      source_label = excluded.source_label, place_type = excluded.place_type
    where public.procurement_geographies.kind = 'municipality';
    if not found then raise exception 'Geography ID collision: %', municipality_id; end if;
    delete from public.procurement_place_counties where place_id = municipality_id;
    insert into public.procurement_place_counties(place_id, county_id)
      select municipality_id, value from jsonb_array_elements_text(item->'county_ids');
    updated_count := updated_count + 1;
  end loop;
  update public.procurement_geographies set source_active = false
    where kind = 'municipality'
      and dataset_url = 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/41'
      and id not in (select x->>'id' from jsonb_array_elements(p_municipalities) x);
  return updated_count;
end $fn$;

revoke all on function public.sync_procurement_municipalities(jsonb,integer,text)
  from public, anon, authenticated;
grant execute on function public.sync_procurement_municipalities(jsonb,integer,text)
  to service_role;

alter table public.procurement_source_capabilities
  add column route_geography_id text references public.procurement_geographies(id),
  add column method_spec jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now(),
  add constraint procurement_source_capabilities_method_spec_check
    check (jsonb_typeof(method_spec) = 'object');

alter table public.procurement_search_requests
  add column requested_geography_id text references public.procurement_geographies(id),
  add column selected_city_ids text[] not null default '{}'::text[],
  add column cities_confirmed_at timestamptz,
  add column request_origin text,
  add constraint procurement_search_requests_request_origin_check
    check (request_origin is null or request_origin = 'chat');

create or replace function public.create_procurement_geography_request(
  p_name text, p_geography_id text, p_selected_city_ids text[],
  p_cities_confirmed_at timestamptz, p_service_scope jsonb, p_search_windows jsonb,
  p_county_id text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare requested public.procurement_geographies%rowtype;
        parent_id text; parent_name text; area jsonb; request_id uuid;
        route_id text; route_index integer := 0;
begin
  select * into requested from public.procurement_geographies
    where id = p_geography_id and source_active;
  if not found or requested.kind not in ('county', 'municipality') then
    raise exception 'Active Arkansas county or GIS municipality required';
  end if;
  if nullif(btrim(p_name), '') is null or jsonb_typeof(p_service_scope) <> 'object'
     or p_service_scope = '{}'::jsonb or jsonb_typeof(p_search_windows) <> 'object'
     or p_search_windows = '{}'::jsonb then
    raise exception 'Request name, service scope and search windows required';
  end if;

  if requested.kind = 'municipality' then
    if cardinality(coalesce(p_selected_city_ids, '{}'::text[])) <> 0
       or p_cities_confirmed_at is not null then
      raise exception 'City requests do not take county city selections';
    end if;
    if p_county_id is null and
       (select count(*) from public.procurement_place_counties where place_id = p_geography_id) <> 1 then
      raise exception 'County choice required for cross-county municipality';
    end if;
    select county_id into parent_id from public.procurement_place_counties
      where place_id = p_geography_id and (p_county_id is null or county_id = p_county_id);
    if parent_id is null then raise exception 'Selected county does not contain municipality'; end if;
    select name into parent_name from public.procurement_geographies where id = parent_id;
    area := jsonb_build_object('area_type', 'city', 'city_name', requested.name,
                               'county_name', parent_name, 'state_code', 'AR');
  else
    if p_county_id is not null then raise exception 'County request cannot take a parent county'; end if;
    parent_id := p_geography_id;
    parent_name := requested.name;
    if p_cities_confirmed_at is null or p_cities_confirmed_at > now()
       or p_cities_confirmed_at < now() - interval '1 day' then
      raise exception 'Fresh chat confirmation required for county city selection';
    end if;
    if cardinality(coalesce(p_selected_city_ids, '{}'::text[])) <>
       (select count(distinct x) from unnest(coalesce(p_selected_city_ids, '{}'::text[])) x) then
      raise exception 'Duplicate selected cities';
    end if;
    if exists (select 1 from unnest(coalesce(p_selected_city_ids, '{}'::text[])) x
      where not exists (select 1 from public.procurement_place_counties pc
        join public.procurement_geographies g on g.id = pc.place_id
        where pc.place_id = x and pc.county_id = parent_id
          and g.kind = 'municipality' and g.source_active)) then
      raise exception 'Selected city does not belong to requested county';
    end if;
    area := jsonb_build_object('area_type', 'county', 'county_name', parent_name,
                               'state_code', 'AR');
  end if;

  insert into public.procurement_search_requests
    (name, search_boundary_mode, requested_search_areas, contracting_entity_geo_levels,
     service_scope, search_windows, scope_resolution_state, requested_geography_id,
     selected_city_ids, cities_confirmed_at, request_origin)
  values (p_name, 'exact_area', jsonb_build_array(area),
          array['city','county','state','federal','municipality'], p_service_scope,
          p_search_windows, 'ready', p_geography_id,
          coalesce(p_selected_city_ids, '{}'::text[]), p_cities_confirmed_at, 'chat')
  returning id into request_id;

  if requested.kind = 'municipality' then
    insert into public.procurement_request_targets
      (search_request_id, target_key, geography_id, original_inputs, checkpoint)
    values (request_id, 'geography:' || requested.id, requested.id,
            jsonb_build_array(area), jsonb_build_object('route_order', route_index));
    route_index := route_index + 1;
  else
    for route_id in select x.id from unnest(coalesce(p_selected_city_ids, '{}'::text[])) with ordinality x(id, position)
      join public.procurement_geographies g on g.id = x.id
      order by x.position loop
      insert into public.procurement_request_targets
        (search_request_id, target_key, geography_id, original_inputs, checkpoint)
      values (request_id, 'geography:' || route_id, route_id,
              jsonb_build_array(area), jsonb_build_object('route_order', route_index));
      route_index := route_index + 1;
    end loop;
  end if;
  insert into public.procurement_request_targets
    (search_request_id, target_key, geography_id, original_inputs, checkpoint)
  values (request_id, 'geography:' || parent_id, parent_id,
          jsonb_build_array(area), jsonb_build_object('route_order', route_index));
  insert into public.procurement_request_targets
    (search_request_id, target_key, geography_id, original_inputs, checkpoint)
  values (request_id, 'geography:05', '05',
          jsonb_build_array(area), jsonb_build_object('route_order', route_index + 1));
  return request_id;
end $fn$;

revoke all on function public.create_procurement_geography_request(text,text,text[],timestamptz,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_procurement_geography_request(text,text,text[],timestamptz,jsonb,jsonb,text)
  to service_role;

commit;
