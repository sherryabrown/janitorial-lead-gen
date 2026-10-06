-- Route registered independent agencies through their documented home city.
-- A source route selects where to check; it is not evidence of a lead's work site
-- or proof that a forecast, opportunity, or award method is complete.
begin;

do $route$
declare
  agency record;
  affected integer;
begin
  for agency in
    select * from (values
      ('airport', '98923165-7777-5b89-b7ca-a8d25c95f526'::uuid,
       'https://clintonairport.com/procurement/', 'Little Rock',
       'https://clintonairport.com/contractors/'),
      ('airport-forecast', '36e49031-41e5-5664-8108-372677b1bd66'::uuid,
       'https://clintonairport.com/wp-content/uploads/2026/03/Contracting-Opportunities-Forecast-public-March.pdf', 'Little Rock',
       'https://clintonairport.com/contractors/'),
      ('housing', '4d317052-28ec-5329-a95d-e973ea756501'::uuid,
       'https://lrhousing.org/business-with-lrha/', 'Little Rock',
       'https://lrhousing.org/business-with-lrha/'),
      ('lrsd', '568fd1a5-4a26-5cef-ad8d-33ebc1a92241'::uuid,
       'https://www.lrsd.org/page/procurement-and-materials-management', 'Little Rock',
       'https://www.lrsd.org/page/procurement-and-materials-management/'),
      ('ualr', '8648268b-56e7-5e78-b8d8-be3fbca0eff7'::uuid,
       'https://ualr.edu/procurement/bids/', 'Little Rock',
       'https://ualr.edu/procurement/contact/'),
      ('uams', 'c62b42f4-c8ad-589b-89e7-f0905332b2ca'::uuid,
       'https://supplychain.uams.edu/procurement/', 'Little Rock',
       'https://supplychain.uams.edu/procurement/about-us/'),
      ('wastewater', '0dc0e3ad-5515-501f-b5ce-8ba02b67d00a'::uuid,
       'https://lrwra.com/business-center/', 'Little Rock',
       'https://lrwra.com/about-us/who-we-are/'),
      ('water', '9625c242-3602-5f36-a44f-ac1df5b7a4b4'::uuid,
       'https://carkw.com/resources/procurement/', 'Little Rock',
       'https://carkw.com/contact/'),
      ('metro', '86477bd1-cca9-5056-94cb-dd80dd29640b'::uuid,
       'https://rrmetro.org/about/business/vendors/', 'North Little Rock',
       'https://rrmetro.org/about/business/')
    ) as v(code, source_id, registered_url, home_city, official_location_url)
  loop
    if not exists (
      select 1 from public.procurement_geographies
      where kind = 'municipality' and name = agency.home_city
        and state_code = 'AR' and source_active
    ) then
      raise exception 'Active city geography missing: %', agency.home_city;
    end if;
    update public.procurement_sources
      set source_coverage_areas = jsonb_build_array(jsonb_build_object(
            'area_type', 'city', 'city_name', agency.home_city, 'state_code', 'AR')),
          config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
            'known_source_route', jsonb_build_object(
              'basis', 'Official procurement or agency location; lead work site reviewed separately',
              'home_city', agency.home_city,
              'official_location_url', agency.official_location_url,
              'checked_on', '2026-10-05'))
      where id = agency.source_id and code = agency.code
        and url = agency.registered_url
        and source_coverage_areas = '[]'::jsonb;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Source identity or prior mapping changed: %', agency.code;
    end if;
  end loop;
end $route$;

commit;
