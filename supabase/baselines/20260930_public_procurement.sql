-- Development-only schema baseline captured 2026-09-30. NO DATA.

-- Load into a fresh disposable Supabase database; never run on production.

-- Requires existing Supabase auth schema and anon/authenticated/service_role roles.

begin;

set local check_function_bodies = false;

create table public."spin_geography" ("id" uuid default gen_random_uuid() not null,
"created_at" timestamp with time zone default now() not null,
"zip" text,
"county" text,
"city" text,
"state" text default 'AR'::text);

create table public."spin_contract_generation_runs" ("id" uuid default gen_random_uuid() not null,
"geography_id" text,
"input_city" text,
"input_zip" text,
"input_county" text,
"normalized_location" text,
"status" text default 'queued'::text not null,
"stage" text default 'received'::text not null,
"error_message" text,
"source_count" integer default 0 not null,
"opportunity_count" integer default 0 not null,
"started_at" timestamp with time zone default now() not null,
"completed_at" timestamp with time zone,
"created_at" timestamp with time zone default now() not null);

create table public."spin_contract_opportunities" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid,
"geography_id" text,
"project_name" text not null,
"agency_name" text not null,
"category" text default 'Government'::text not null,
"location" text,
"contact_name" text,
"contact_phone" text,
"contact_email" text,
"due_at" timestamp with time zone,
"expires_at" timestamp with time zone,
"estimated_value" text,
"status" text default 'new'::text not null,
"source_url" text,
"external_id" text,
"content_hash" text,
"summary" text,
"next_action" text default 'Review bid packet'::text not null,
"raw_payload" jsonb default '{}'::jsonb not null,
"discovered_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null);

create table public."spin_procurement_sources" ("id" uuid default gen_random_uuid() not null,
"geography_id" text,
"entity_name" text not null,
"entity_type" text not null,
"county" text,
"state_code" text default 'AR'::text not null,
"portal_type" text default 'unknown'::text not null,
"bids_url" text,
"awards_url" text,
"forecast_url" text,
"access" text default 'public'::text not null,
"confidence" text default 'low'::text not null,
"needs_human_review" boolean default true not null,
"verification_status" text default 'needs-review'::text not null,
"verification_note" text,
"found_by" text default 'deterministic'::text not null,
"last_checked_at" timestamp with time zone,
"last_verified_at" timestamp with time zone,
"raw_registry" jsonb default '{}'::jsonb not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null);

create table public."procurement_sources" ("id" uuid default gen_random_uuid() not null,
"code" text not null,
"name" text not null,
"contracting_entity_geo_level" text,
"business_category" text not null,
"source_coverage_areas" jsonb default '[]'::jsonb not null,
"url" text not null,
"config" jsonb default '{}'::jsonb not null,
"updated_at" timestamp with time zone default now() not null,
"identity_key" text);

create table public."procurement_versions" ("id" uuid default gen_random_uuid() not null,
"lead_id" uuid not null,
"observed_at" timestamp with time zone default now() not null,
"payload" jsonb not null);

create table public."procurement_events" ("id" uuid default gen_random_uuid() not null,
"lead_id" uuid,
"source_id" uuid,
"event_type" text not null,
"created_at" timestamp with time zone default now() not null,
"detail" jsonb default '{}'::jsonb not null,
"dedupe_key" text);

create table public."procurement_runs" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid not null,
"started_at" timestamp with time zone not null,
"finished_at" timestamp with time zone default now() not null,
"status" text not null,
"record_count" integer default 0 not null,
"detail" jsonb default '{}'::jsonb not null);

create table public."procurement_intake_items" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid not null,
"external_id" text not null,
"payload" jsonb not null,
"review_reason" text not null,
"status" text default 'pending'::text not null,
"updated_at" timestamp with time zone default now() not null);

create table public."procurement_registrations" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid not null,
"status" text default 'needs_company_details'::text not null,
"notification_status" text default 'not_configured'::text not null,
"account_email" text,
"setup" jsonb default '{}'::jsonb not null,
"updated_at" timestamp with time zone default now() not null,
"email_verification_state" text default 'unknown'::text not null,
"login_state" text default 'unknown'::text not null,
"api_state" text default 'unknown'::text not null,
"last_verified_at" timestamp with time zone);

create table public."procurement_contacts" ("id" uuid default gen_random_uuid() not null,
"lead_id" uuid,
"role" text not null,
"organization" text,
"name" text,
"email" text,
"phone" text,
"source_url" text not null,
"verified_at" timestamp with time zone,
"notes" text);

create table public."procurement_lead_links" ("id" uuid default gen_random_uuid() not null,
"from_lead" uuid,
"to_lead" uuid,
"relationship" text not null,
"confidence" text not null,
"evidence_url" text not null);

create table public."procurement_search_requests" ("id" uuid default gen_random_uuid() not null,
"name" text not null,
"search_boundary_mode" text not null,
"requested_search_areas" jsonb not null,
"contracting_entity_geo_levels" text[] default '{}'::text[] not null,
"state_search_names" jsonb default '[]'::jsonb not null,
"created_at" timestamp with time zone default now() not null,
"service_scope" jsonb default '{}'::jsonb not null,
"search_windows" jsonb default '{}'::jsonb not null,
"scope_resolution_state" text default 'legacy'::text not null);

create table public."procurement_request_sources" ("id" uuid default gen_random_uuid() not null,
"search_request_id" uuid not null,
"source_id" uuid not null,
"discovery_reason" text not null);

create table public."procurement_request_leads" ("id" uuid default gen_random_uuid() not null,
"search_request_id" uuid not null,
"lead_id" uuid not null,
"match_status" text not null,
"match_reason" text not null);

create table public."procurement_intake_leads" ("id" uuid default gen_random_uuid() not null,
"intake_id" uuid not null,
"lead_id" uuid not null);

create table public."procurement_event_receipts" ("id" uuid default gen_random_uuid() not null,
"event_id" uuid not null,
"consumer" text not null,
"acknowledged_at" timestamp with time zone default now() not null);

create table public."procurement_members" ("id" uuid default gen_random_uuid() not null,
"user_id" uuid not null);

create table public."procurement_leads" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid not null,
"external_id" text not null,
"payload" jsonb not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"detected_change_at" timestamp with time zone default now() not null,
"search_term_used" text,
"owner_id" uuid,
"stage" text default 'new'::text not null,
"next_action" text,
"follow_up_on" date,
"notes" text,
"estimated_annual_amount" numeric(18,2),
"bid_type" text generated always as ((payload ->> 'bid_type'::text)) stored not null,
"business_category" text generated always as ((payload ->> 'business_category'::text)) stored not null,
"contracting_entity_geo_level" text generated always as ((payload ->> 'contracting_entity_geo_level'::text)) stored,
"work_performance_locations" jsonb generated always as ((payload -> 'work_performance_locations'::text)) stored not null,
"created_by" uuid,
"updated_by" uuid,
"title" text,
"agency" text,
"source_url" text,
"solicitation_number" text,
"award_number" text,
"publication_date" date,
"response_deadline" timestamp with time zone,
"planned_advertisement_period" text,
"contract_start_date" date,
"contract_current_end_date" date,
"contract_potential_end_date" date,
"work_performance_city" text,
"work_performance_state" text,
"stage_reason" text);

create table public."procurement_lead_notes" ("id" uuid default gen_random_uuid() not null,
"lead_id" uuid not null,
"body" text not null,
"created_by" uuid not null,
"created_at" timestamp with time zone default now() not null,
"updated_by" uuid,
"updated_at" timestamp with time zone);

create table public."procurement_lead_note_edits" ("id" uuid default gen_random_uuid() not null,
"note_id" uuid not null,
"old_body" text not null,
"new_body" text not null,
"edited_by" uuid not null,
"edited_at" timestamp with time zone default now() not null);

create table public."procurement_lead_stage_changes" ("id" uuid default gen_random_uuid() not null,
"lead_id" uuid not null,
"from_status" text,
"to_status" text not null,
"from_reason" text,
"to_reason" text,
"reason_code" text,
"reason_note" text,
"changed_by" uuid not null,
"created_at" timestamp with time zone default now() not null);

create table public."procurement_geographies" ("id" text not null,
"kind" text not null,
"name" text not null,
"state_code" text default 'AR'::text not null,
"incorporated" boolean default false not null,
"dataset_url" text not null,
"dataset_version" text not null,
"dataset_hash" text not null,
"imported_at" timestamp with time zone default now() not null);

create table public."procurement_place_counties" ("place_id" text not null,
"county_id" text not null);

create table public."procurement_request_targets" ("id" uuid default gen_random_uuid() not null,
"search_request_id" uuid not null,
"target_key" text not null,
"geography_id" text,
"original_inputs" jsonb default '[]'::jsonb not null,
"state" text default 'pending'::text not null,
"checkpoint" jsonb default '{}'::jsonb not null,
"unresolved_reason" text,
"updated_at" timestamp with time zone default now() not null);

create table public."procurement_source_capabilities" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid not null,
"kind" text not null,
"method" text not null,
"endpoint_url" text not null,
"official_entry_url" text not null,
"agency_geography_id" text,
"availability" text default 'unknown'::text not null,
"verified_at" timestamp with time zone,
"verified_until" timestamp with time zone,
"verification_evidence" jsonb,
"last_success_at" timestamp with time zone,
"parser_version" text,
"next_action" text);

create table public."procurement_coverage_tasks" ("id" uuid default gen_random_uuid() not null,
"target_id" uuid not null,
"task_key" text not null,
"agency_scope" text not null,
"route_geography_id" text not null,
"kind" text not null,
"priority" integer not null,
"reason" text not null,
"capability_id" uuid,
"state" text default 'unchecked'::text not null,
"evidence" jsonb default '{}'::jsonb not null,
"query_window" jsonb default '{}'::jsonb not null,
"checkpoint" jsonb default '{}'::jsonb not null,
"pages_reviewed" integer default 0 not null,
"results_count" integer default 0 not null,
"updated_at" timestamp with time zone default now() not null);

create table public."procurement_jobs" ("id" uuid default gen_random_uuid() not null,
"search_request_id" uuid,
"capability_id" uuid,
"dedupe_key" text not null,
"kind" text not null,
"state" text default 'pending'::text not null,
"checkpoint" jsonb default '{}'::jsonb not null,
"lease_until" timestamp with time zone,
"attempts" integer default 0 not null,
"next_attempt_at" timestamp with time zone,
"last_error" text,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null);

create table public."procurement_action_requests" ("id" uuid default gen_random_uuid() not null,
"source_id" uuid not null,
"capability_id" uuid,
"resume_job_id" uuid,
"dedupe_key" text not null,
"kind" text not null,
"state" text default 'pending'::text not null,
"required_action" text not null,
"delivery_state" text default 'not_sent'::text not null,
"provider_message_id" text,
"created_at" timestamp with time zone default now() not null,
"resolved_at" timestamp with time zone);

CREATE OR REPLACE FUNCTION public.procurement_lead_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if TG_OP = 'INSERT' or NEW.payload is distinct from OLD.payload then
    insert into public.procurement_versions(lead_id,payload) values(NEW.id,NEW.payload);
    insert into public.procurement_events(lead_id,source_id,event_type,detail)
      values(NEW.id,NEW.source_id,case when TG_OP='INSERT' then 'lead_new' else 'lead_changed' end,
        jsonb_build_object('title',NEW.payload->>'title','bid_type',NEW.payload->>'bid_type'));
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.pending_procurement_events(p_consumer text, p_limit integer DEFAULT 100)
 RETURNS SETOF procurement_events
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select e.* from public.procurement_events e where not exists
 (select 1 from public.procurement_event_receipts r where r.event_id=e.id and r.consumer=p_consumer)
 order by e.created_at,e.id limit greatest(1,least(p_limit,1000));
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_procurement_lead(p_source_id uuid, p_external_id text, p_payload jsonb, p_review_status text DEFAULT 'needs_review'::text, p_request_id uuid DEFAULT NULL::uuid, p_match_status text DEFAULT 'needs_location_review'::text, p_match_reason text DEFAULT 'Unreviewed'::text, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare rid uuid;
begin
  insert into public.procurement_leads(id,source_id,external_id,payload)
  values(coalesce(p_id,gen_random_uuid()),p_source_id,p_external_id,p_payload)
  on conflict(source_id,external_id) do update set
    payload=excluded.payload,updated_at=now(),
    detected_change_at=case when public.procurement_leads.payload is distinct from excluded.payload
      then now() else public.procurement_leads.detected_change_at end
  returning id into rid;
  if p_request_id is not null then
    insert into public.procurement_request_leads(search_request_id,lead_id,match_status,match_reason) values(p_request_id,rid,p_match_status,p_match_reason)
    on conflict(search_request_id,lead_id) do update set match_status=excluded.match_status,match_reason=excluded.match_reason;
  end if;
  return rid;
end $function$
;

CREATE OR REPLACE FUNCTION public.queue_recompete_reviews()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;
begin
  insert into public.procurement_events(lead_id,source_id,event_type,detail,dedupe_key)
  select r.id,r.source_id,'recompete_review_due',
    jsonb_build_object('contract_end',r.contract_current_end_date::text,'lead_days',d.days,
      'basis','Current reported end date; verify options, extensions, successor and procurement eligibility'),
    'recompete:'||r.id||':'||(r.contract_current_end_date::text)||':'||d.days
  from public.procurement_leads r cross join (values(365),(180),(90)) d(days)
  where r.payload->>'bid_type' in ('award','contract')
    and r.contract_current_end_date is not null
    and r.contract_current_end_date between current_date and current_date+d.days
  on conflict(dedupe_key) do nothing;
  get diagnostics n=row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.edit_lead_note(p_note_id uuid, p_new_body text)
 RETURNS procurement_lead_notes
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r public.procurement_lead_notes;
  old_body text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_new_body), '') is null then raise exception 'Note cannot be blank'; end if;
  select * into r from public.procurement_lead_notes where id = p_note_id for update;
  if not found then raise exception 'Note not found'; end if;
  old_body := r.body;
  if old_body is distinct from trim(p_new_body) then
    insert into public.procurement_lead_note_edits(note_id, old_body, new_body, edited_by)
    values(p_note_id, old_body, trim(p_new_body), auth.uid());
    update public.procurement_lead_notes
    set body = trim(p_new_body), updated_by = auth.uid(), updated_at = now()
    where id = p_note_id
    returning * into r;
  end if;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_procurement_lead_stage(p_lead_id uuid, p_new_stage text, p_reason_code text DEFAULT NULL::text, p_reason_note text DEFAULT NULL::text)
 RETURNS procurement_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  r public.procurement_leads;
  old_stage text;
  old_reason text;
  new_stage text := lower(replace(trim(coalesce(p_new_stage, '')), '_', '-'));
  new_reason_note text := nullif(trim(coalesce(p_reason_note, '')), '');
  stored_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then raise exception 'Invalid procurement stage'; end if;
  if new_stage in ('lost','not-interested','withdrew') and nullif(trim(coalesce(p_reason_code, '')), '') is null then raise exception 'A reason is required'; end if;
  if p_reason_code = 'Other' and new_reason_note is null then raise exception 'Other requires a reason detail'; end if;
  if new_stage not in ('lost','not-interested','withdrew') then
    p_reason_code := null;
    new_reason_note := null;
  end if;
  stored_reason := case when p_reason_code = 'Other' then new_reason_note else p_reason_code end;

  select * into r from public.procurement_leads where id = p_lead_id for update;
  if not found then raise exception 'Procurement lead not found'; end if;
  old_stage := r.stage;
  old_reason := r.stage_reason;
  update public.procurement_leads set stage = new_stage, stage_reason = stored_reason, updated_at = now() where id = p_lead_id returning * into r;
  if old_stage is distinct from new_stage or old_reason is distinct from stored_reason then
    insert into public.procurement_lead_stage_changes(lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by)
    values(p_lead_id, old_stage, new_stage, old_reason, stored_reason, p_reason_code, new_reason_note, auth.uid());
  end if;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_update_procurement_lead_stage(p_lead_ids uuid[], p_new_stage text, p_reason_code text DEFAULT NULL::text, p_reason_note text DEFAULT NULL::text)
 RETURNS SETOF procurement_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  lead_row public.procurement_leads;
  updated_row public.procurement_leads;
  found_count integer;
  new_stage text := lower(replace(trim(coalesce(p_new_stage, '')), '_', '-'));
  new_reason_note text := nullif(trim(coalesce(p_reason_note, '')), '');
  stored_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 or array_position(p_lead_ids, null) is not null then raise exception 'At least one valid procurement lead is required'; end if;
  if cardinality(p_lead_ids) <> (select count(distinct id) from unnest(p_lead_ids) as id) then raise exception 'Duplicate procurement lead ids are not allowed'; end if;
  if new_stage not in ('new','interested','applied','hold','won','lost','not-interested','withdrew') then raise exception 'Invalid procurement stage'; end if;
  if new_stage in ('lost','not-interested','withdrew') and nullif(trim(coalesce(p_reason_code, '')), '') is null then raise exception 'A reason is required'; end if;
  if p_reason_code = 'Other' and new_reason_note is null then raise exception 'Other requires a reason detail'; end if;
  if new_stage not in ('lost','not-interested','withdrew') then
    p_reason_code := null;
    new_reason_note := null;
  end if;
  stored_reason := case when p_reason_code = 'Other' then new_reason_note else p_reason_code end;
  select count(*) into found_count from public.procurement_leads where id = any(p_lead_ids);
  if found_count <> cardinality(p_lead_ids) then raise exception 'One or more procurement leads were not found'; end if;

  for lead_row in select * from public.procurement_leads where id = any(p_lead_ids) order by id for update loop
    if lead_row.stage is distinct from new_stage or lead_row.stage_reason is distinct from stored_reason then
      update public.procurement_leads set stage = new_stage, stage_reason = stored_reason, updated_at = now() where id = lead_row.id returning * into updated_row;
      insert into public.procurement_lead_stage_changes(lead_id, from_status, to_status, from_reason, to_reason, reason_code, reason_note, changed_by)
      values(lead_row.id, lead_row.stage, new_stage, lead_row.stage_reason, stored_reason, p_reason_code, new_reason_note, auth.uid());
      return next updated_row;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.procurement_parse_date(v text)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 return v::date;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.procurement_parse_deadline(v text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 -- Never assume a timezone for an unzoned deadline.
 if v is null or v !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})$' then return null; end if;
 return v::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.procurement_sync_lead_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p jsonb;
begin
 p:=NEW.payload;
 if TG_OP='INSERT' or NEW.payload is distinct from OLD.payload then
 NEW.title:=nullif(p->>'title','');
 NEW.agency:=nullif(p->>'agency','');
 NEW.source_url:=nullif(p->>'source_url','');
 NEW.solicitation_number:=nullif(p->>'solicitation_id','');
 NEW.award_number:=nullif(p->>'award_id','');
 NEW.publication_date:=public.procurement_parse_date(p->>'published_date');
 NEW.response_deadline:=public.procurement_parse_deadline(p->>'deadline');
 NEW.planned_advertisement_period:=nullif(p->>'planned_advertisement_period','');
 NEW.contract_start_date:=public.procurement_parse_date(p->>'contract_start');
 NEW.contract_current_end_date:=public.procurement_parse_date(p->>'contract_end');
 NEW.contract_potential_end_date:=public.procurement_parse_date(p->>'ultimate_end');
 NEW.work_performance_city:=nullif(p#>>'{work_performance_locations,0,city_name}','') || case when jsonb_array_length(p->'work_performance_locations')>1 then ' (multiple)' else '' end;
 NEW.work_performance_state:=nullif(p#>>'{work_performance_locations,0,state_code}','');
 end if;
 return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_lead_note(p_lead_id uuid, p_body text)
 RETURNS procurement_lead_notes
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r public.procurement_lead_notes;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Note cannot be blank'; end if;
  insert into public.procurement_lead_notes(lead_id, body, created_by)
  values(p_lead_id, trim(p_body), auth.uid())
  returning * into r;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spin_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_procurement_search_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a jsonb; field text;
begin
 for a in select value from jsonb_array_elements(NEW.requested_search_areas) loop
  field:=case a->>'area_type' when 'state' then 'state_code' when 'county' then 'county_name'
    when 'city' then 'city_name' when 'municipality' then 'municipality_name' when 'zip' then 'postal_code' end;
  if field is null or coalesce(a->>field,'')='' or coalesce(a->>'state_code','') !~ '^[A-Z]{2}$' then
    raise exception 'Area type, identifier and state_code required'; end if;
  if a->>'area_type'='zip' and (jsonb_typeof(a->'postal_code') <> 'string' or a->>'postal_code' !~ '^\d{5}$') then
    raise exception 'ZIP must be a five-digit string'; end if;
  if NEW.search_boundary_mode='surrounding_county' and a->>'area_type'<>'county' then
    raise exception 'Explicit county areas required for surrounding_county'; end if;
 end loop;
 return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.ingest_procurement_intake(p_source_id uuid, p_external_id text, p_payload jsonb, p_review_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare rid uuid;
begin
 insert into public.procurement_intake_items(source_id,external_id,payload,review_reason)
 values(p_source_id,p_external_id,p_payload,p_review_reason)
 on conflict(source_id,external_id) do update set payload=excluded.payload,updated_at=now()
 returning id into rid;
 return rid;
end $function$
;

CREATE OR REPLACE FUNCTION public.acknowledge_procurement_event(p_consumer text, p_event_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 insert into public.procurement_event_receipts(consumer,event_id) values(p_consumer,p_event_id)
 on conflict(event_id,consumer) do nothing;
$function$
;

alter table public."spin_geography" add constraint "spin_geography_pkey" PRIMARY KEY (id);

alter table public."spin_contract_generation_runs" add constraint "spin_contract_generation_runs_pkey" PRIMARY KEY (id);

alter table public."spin_contract_opportunities" add constraint "spin_contract_opportunities_pkey" PRIMARY KEY (id);

alter table public."spin_contract_opportunities" add constraint "spin_contract_opportunities_source_id_content_hash_key" UNIQUE (source_id, content_hash);

alter table public."spin_procurement_sources" add constraint "spin_procurement_sources_entity_name_county_key" UNIQUE (entity_name, county);

alter table public."spin_procurement_sources" add constraint "spin_procurement_sources_pkey" PRIMARY KEY (id);

alter table public."procurement_sources" add constraint "procurement_sources_business_category_check" CHECK ((business_category = ANY (ARRAY['school'::text, 'university'::text, 'utility'::text, 'airport'::text, 'transit'::text, 'housing'::text, 'other_public'::text])));

alter table public."procurement_sources" add constraint "procurement_sources_code_key" UNIQUE (code);

alter table public."procurement_sources" add constraint "procurement_sources_contracting_entity_geo_level_check" CHECK ((contracting_entity_geo_level = ANY (ARRAY['federal'::text, 'state'::text, 'city'::text, 'county'::text, 'municipality'::text])));

alter table public."procurement_sources" add constraint "procurement_sources_pkey" PRIMARY KEY (id);

alter table public."procurement_sources" add constraint "procurement_sources_source_coverage_areas_check" CHECK ((jsonb_typeof(source_coverage_areas) = 'array'::text));

alter table public."procurement_sources" add constraint "procurement_sources_url_check" CHECK ((url ~~ 'https://%'::text));

alter table public."procurement_versions" add constraint "procurement_versions_pkey" PRIMARY KEY (id);

alter table public."procurement_events" add constraint "procurement_events_dedupe_key_key" UNIQUE (dedupe_key);

alter table public."procurement_events" add constraint "procurement_events_pkey" PRIMARY KEY (id);

alter table public."procurement_runs" add constraint "procurement_runs_pkey" PRIMARY KEY (id);

alter table public."procurement_runs" add constraint "procurement_runs_status_check" CHECK ((status = ANY (ARRAY['success'::text, 'partial'::text, 'blocked'::text, 'error'::text, 'review_required'::text])));

alter table public."procurement_intake_items" add constraint "procurement_intake_items_pkey" PRIMARY KEY (id);

alter table public."procurement_intake_items" add constraint "procurement_intake_items_source_id_external_id_key" UNIQUE (source_id, external_id);

alter table public."procurement_intake_items" add constraint "procurement_intake_items_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'ignored'::text])));

alter table public."procurement_registrations" add constraint "procurement_registrations_api_state_check" CHECK ((api_state = ANY (ARRAY['unknown'::text, 'needed'::text, 'verification_pending'::text, 'verified'::text, 'blocked'::text, 'expired'::text])));

alter table public."procurement_registrations" add constraint "procurement_registrations_email_verification_state_check" CHECK ((email_verification_state = ANY (ARRAY['unknown'::text, 'pending'::text, 'verified'::text, 'expired'::text])));

alter table public."procurement_registrations" add constraint "procurement_registrations_login_state_check" CHECK ((login_state = ANY (ARRAY['unknown'::text, 'verified'::text, 'blocked'::text, 'expired'::text])));

alter table public."procurement_registrations" add constraint "procurement_registrations_pkey" PRIMARY KEY (id);

alter table public."procurement_registrations" add constraint "procurement_registrations_source_id_key" UNIQUE (source_id);

alter table public."procurement_contacts" add constraint "procurement_contacts_pkey" PRIMARY KEY (id);

alter table public."procurement_contacts" add constraint "procurement_contacts_role_check" CHECK ((role = ANY (ARRAY['buyer'::text, 'contract_administrator'::text, 'incumbent_contact'::text, 'general_procurement'::text])));

alter table public."procurement_lead_links" add constraint "procurement_lead_links_from_lead_to_lead_relationship_key" UNIQUE (from_lead, to_lead, relationship);

alter table public."procurement_lead_links" add constraint "procurement_lead_links_pkey" PRIMARY KEY (id);

alter table public."procurement_search_requests" add constraint "procurement_request_area_resolution" CHECK (((jsonb_typeof(requested_search_areas) = 'array'::text) AND ((jsonb_array_length(requested_search_areas) > 0) OR (scope_resolution_state = 'needs_review'::text))));

alter table public."procurement_search_requests" add constraint "procurement_search_requests_contracting_entity_geo_levels_check" CHECK ((contracting_entity_geo_levels <@ ARRAY['federal'::text, 'state'::text, 'city'::text, 'county'::text, 'municipality'::text]));

alter table public."procurement_search_requests" add constraint "procurement_search_requests_pkey" PRIMARY KEY (id);

alter table public."procurement_search_requests" add constraint "procurement_search_requests_scope_resolution_state_check" CHECK ((scope_resolution_state = ANY (ARRAY['legacy'::text, 'ready'::text, 'needs_review'::text])));

alter table public."procurement_search_requests" add constraint "procurement_search_requests_search_boundary_mode_check" CHECK ((search_boundary_mode = ANY (ARRAY['exact_area'::text, 'surrounding_county'::text, 'custom_areas'::text])));

alter table public."procurement_request_sources" add constraint "procurement_request_sources_pkey" PRIMARY KEY (id);

alter table public."procurement_request_sources" add constraint "procurement_request_sources_search_request_id_source_id_key" UNIQUE (search_request_id, source_id);

alter table public."procurement_request_leads" add constraint "procurement_request_leads_match_status_check" CHECK ((match_status = ANY (ARRAY['matches'::text, 'needs_location_review'::text, 'outside'::text])));

alter table public."procurement_request_leads" add constraint "procurement_request_leads_pkey" PRIMARY KEY (id);

alter table public."procurement_request_leads" add constraint "procurement_request_leads_search_request_id_lead_id_key" UNIQUE (search_request_id, lead_id);

alter table public."procurement_intake_leads" add constraint "procurement_intake_leads_intake_id_lead_id_key" UNIQUE (intake_id, lead_id);

alter table public."procurement_intake_leads" add constraint "procurement_intake_leads_pkey" PRIMARY KEY (id);

alter table public."procurement_event_receipts" add constraint "procurement_event_receipts_event_id_consumer_key" UNIQUE (event_id, consumer);

alter table public."procurement_event_receipts" add constraint "procurement_event_receipts_pkey" PRIMARY KEY (id);

alter table public."procurement_members" add constraint "procurement_members_pkey" PRIMARY KEY (id);

alter table public."procurement_members" add constraint "procurement_members_user_id_key" UNIQUE (user_id);

alter table public."procurement_leads" add constraint "procurement_leads_annual_amount_check" CHECK (((estimated_annual_amount >= (0)::numeric) AND (estimated_annual_amount < 'Infinity'::numeric)));

alter table public."procurement_leads" add constraint "procurement_leads_payload_check" CHECK ((((payload ->> 'contracting_entity_geo_level'::text) IS NULL) OR ((payload ->> 'contracting_entity_geo_level'::text) = ANY (ARRAY['federal'::text, 'state'::text, 'city'::text, 'county'::text, 'municipality'::text]))));

alter table public."procurement_leads" add constraint "procurement_leads_payload_check1" CHECK ((jsonb_typeof((payload -> 'work_performance_locations'::text)) = 'array'::text));

alter table public."procurement_leads" add constraint "procurement_leads_payload_check2" CHECK (((COALESCE((payload ->> 'title'::text), ''::text) <> ''::text) AND (COALESCE((payload ->> 'source_url'::text), ''::text) ~~ 'https://%'::text)));

alter table public."procurement_leads" add constraint "procurement_leads_payload_check3" CHECK (((payload ->> 'bid_type'::text) = ANY (ARRAY['forecast'::text, 'opportunity'::text, 'intent_to_award'::text, 'award'::text, 'contract'::text, 'historical_opportunity'::text])));

alter table public."procurement_leads" add constraint "procurement_leads_payload_check4" CHECK (((payload ? 'title'::text) AND (payload ? 'source_url'::text) AND (payload ? 'bid_type'::text) AND (payload ? 'business_category'::text) AND (payload ? 'work_performance_locations'::text)));

alter table public."procurement_leads" add constraint "procurement_leads_payload_check5" CHECK (((payload ->> 'business_category'::text) = ANY (ARRAY['school'::text, 'university'::text, 'utility'::text, 'airport'::text, 'transit'::text, 'housing'::text, 'other_public'::text])));

alter table public."procurement_leads" add constraint "procurement_leads_pkey" PRIMARY KEY (id);

alter table public."procurement_leads" add constraint "procurement_leads_source_id_external_id_key" UNIQUE (source_id, external_id);

alter table public."procurement_lead_notes" add constraint "lead_notes_body_check" CHECK ((length(TRIM(BOTH FROM body)) > 0));

alter table public."procurement_lead_notes" add constraint "lead_notes_pkey" PRIMARY KEY (id);

alter table public."procurement_lead_note_edits" add constraint "lead_note_edits_new_body_check" CHECK ((length(TRIM(BOTH FROM new_body)) > 0));

alter table public."procurement_lead_note_edits" add constraint "lead_note_edits_pkey" PRIMARY KEY (id);

alter table public."procurement_lead_stage_changes" add constraint "lead_status_changes_pkey" PRIMARY KEY (id);

alter table public."procurement_lead_stage_changes" add constraint "lead_status_changes_to_status_check" CHECK ((to_status = ANY (ARRAY['new'::text, 'interested'::text, 'applied'::text, 'hold'::text, 'won'::text, 'lost'::text, 'not-interested'::text, 'withdrew'::text])));

alter table public."procurement_geographies" add constraint "procurement_geographies_check" CHECK ((((kind = 'state'::text) AND (id = '05'::text)) OR ((kind = 'county'::text) AND (id ~ '^05[0-9]{3}$'::text)) OR ((kind = 'place'::text) AND (id ~ '^05[0-9]{5}$'::text))));

alter table public."procurement_geographies" add constraint "procurement_geographies_kind_check" CHECK ((kind = ANY (ARRAY['state'::text, 'county'::text, 'place'::text])));

alter table public."procurement_geographies" add constraint "procurement_geographies_pkey" PRIMARY KEY (id);

alter table public."procurement_geographies" add constraint "procurement_geographies_state_code_check" CHECK ((state_code = 'AR'::text));

alter table public."procurement_place_counties" add constraint "procurement_place_counties_check" CHECK (((place_id ~ '^05[0-9]{5}$'::text) AND (county_id ~ '^05[0-9]{3}$'::text)));

alter table public."procurement_place_counties" add constraint "procurement_place_counties_pkey" PRIMARY KEY (place_id, county_id);

alter table public."procurement_request_targets" add constraint "procurement_request_targets_check" CHECK (((geography_id IS NOT NULL) OR (state = 'needs_review'::text)));

alter table public."procurement_request_targets" add constraint "procurement_request_targets_original_inputs_check" CHECK ((jsonb_typeof(original_inputs) = 'array'::text));

alter table public."procurement_request_targets" add constraint "procurement_request_targets_pkey" PRIMARY KEY (id);

alter table public."procurement_request_targets" add constraint "procurement_request_targets_search_request_id_target_key_key" UNIQUE (search_request_id, target_key);

alter table public."procurement_request_targets" add constraint "procurement_request_targets_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'needs_review'::text, 'in_progress'::text, 'partial'::text, 'completed'::text, 'blocked'::text])));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabiliti_source_id_kind_endpoint_url_m_key" UNIQUE (source_id, kind, endpoint_url, method);

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_availability_check" CHECK ((availability = ANY (ARRAY['unknown'::text, 'verification_pending'::text, 'active'::text, 'blocked'::text, 'expired'::text, 'unavailable'::text])));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_check" CHECK (((availability <> 'active'::text) OR ((verified_at IS NOT NULL) AND (verified_until IS NOT NULL) AND (verification_evidence IS NOT NULL) AND (jsonb_typeof(verification_evidence) = 'object'::text) AND (verification_evidence <> '{}'::jsonb))));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_check1" CHECK (((verified_until IS NULL) OR (verified_until > verified_at)));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_endpoint_url_check" CHECK ((endpoint_url ~ '^https://'::text));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_kind_check" CHECK ((kind = ANY (ARRAY['forecast'::text, 'opportunity'::text, 'award'::text])));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_method_check" CHECK ((method = ANY (ARRAY['api'::text, 'browser'::text, 'document'::text])));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_official_entry_url_check" CHECK ((official_entry_url ~ '^https://'::text));

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_pkey" PRIMARY KEY (id);

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_check" CHECK (((state <> ALL (ARRAY['reviewed_with_results'::text, 'reviewed_no_results'::text])) OR ((evidence <> '{}'::jsonb) AND (query_window <> '{}'::jsonb))));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_check1" CHECK (((state <> 'reviewed_with_results'::text) OR (results_count > 0)));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_check2" CHECK (((state <> 'reviewed_no_results'::text) OR (results_count = 0)));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_kind_check" CHECK ((kind = ANY (ARRAY['forecast'::text, 'opportunity'::text, 'award'::text])));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_pages_reviewed_check" CHECK ((pages_reviewed >= 0));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_pkey" PRIMARY KEY (id);

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_priority_check" CHECK ((priority >= 0));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_results_count_check" CHECK ((results_count >= 0));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_state_check" CHECK ((state = ANY (ARRAY['unchecked'::text, 'source_missing'::text, 'blocked'::text, 'partial'::text, 'reviewed_with_results'::text, 'reviewed_no_results'::text])));

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_target_id_task_key_key" UNIQUE (target_id, task_key);

alter table public."procurement_jobs" add constraint "procurement_jobs_attempts_check" CHECK ((attempts >= 0));

alter table public."procurement_jobs" add constraint "procurement_jobs_dedupe_key_key" UNIQUE (dedupe_key);

alter table public."procurement_jobs" add constraint "procurement_jobs_kind_check" CHECK ((kind = ANY (ARRAY['discover'::text, 'verify_access'::text, 'collect'::text, 'process'::text])));

alter table public."procurement_jobs" add constraint "procurement_jobs_pkey" PRIMARY KEY (id);

alter table public."procurement_jobs" add constraint "procurement_jobs_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'running'::text, 'blocked'::text, 'partial'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'outcome_unknown'::text])));

alter table public."procurement_action_requests" add constraint "procurement_action_requests_dedupe_key_key" UNIQUE (dedupe_key);

alter table public."procurement_action_requests" add constraint "procurement_action_requests_delivery_state_check" CHECK ((delivery_state = ANY (ARRAY['not_sent'::text, 'queued'::text, 'sent'::text, 'failed'::text, 'unknown'::text])));

alter table public."procurement_action_requests" add constraint "procurement_action_requests_kind_check" CHECK ((kind = ANY (ARRAY['registration'::text, 'email_verification'::text, 'credentials'::text, 'agency_approval'::text, 'review'::text])));

alter table public."procurement_action_requests" add constraint "procurement_action_requests_pkey" PRIMARY KEY (id);

alter table public."procurement_action_requests" add constraint "procurement_action_requests_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'verification_pending'::text, 'resolved'::text, 'cancelled'::text])));

alter table public."spin_contract_opportunities" add constraint "spin_contract_opportunities_source_id_fkey" FOREIGN KEY (source_id) REFERENCES spin_procurement_sources(id);

alter table public."procurement_versions" add constraint "procurement_versions_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id);

alter table public."procurement_events" add constraint "procurement_events_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id);

alter table public."procurement_events" add constraint "procurement_events_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_runs" add constraint "procurement_runs_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_intake_items" add constraint "procurement_intake_items_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_registrations" add constraint "procurement_registrations_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_contacts" add constraint "procurement_contacts_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id);

alter table public."procurement_lead_links" add constraint "procurement_lead_links_from_lead_fkey" FOREIGN KEY (from_lead) REFERENCES procurement_leads(id);

alter table public."procurement_lead_links" add constraint "procurement_lead_links_to_lead_fkey" FOREIGN KEY (to_lead) REFERENCES procurement_leads(id);

alter table public."procurement_request_sources" add constraint "procurement_request_sources_search_request_id_fkey" FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id);

alter table public."procurement_request_sources" add constraint "procurement_request_sources_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_request_leads" add constraint "procurement_request_leads_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id);

alter table public."procurement_request_leads" add constraint "procurement_request_leads_search_request_id_fkey" FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id);

alter table public."procurement_intake_leads" add constraint "procurement_intake_leads_intake_id_fkey" FOREIGN KEY (intake_id) REFERENCES procurement_intake_items(id);

alter table public."procurement_intake_leads" add constraint "procurement_intake_leads_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id);

alter table public."procurement_event_receipts" add constraint "procurement_event_receipts_event_id_fkey" FOREIGN KEY (event_id) REFERENCES procurement_events(id);

alter table public."procurement_members" add constraint "procurement_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."procurement_leads" add constraint "procurement_leads_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_lead_notes" add constraint "lead_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public."procurement_lead_notes" add constraint "lead_notes_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id) ON DELETE CASCADE;

alter table public."procurement_lead_notes" add constraint "lead_notes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

alter table public."procurement_lead_note_edits" add constraint "lead_note_edits_edited_by_fkey" FOREIGN KEY (edited_by) REFERENCES auth.users(id);

alter table public."procurement_lead_note_edits" add constraint "lead_note_edits_note_id_fkey" FOREIGN KEY (note_id) REFERENCES procurement_lead_notes(id) ON DELETE CASCADE;

alter table public."procurement_lead_stage_changes" add constraint "lead_status_changes_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id);

alter table public."procurement_lead_stage_changes" add constraint "lead_status_changes_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES procurement_leads(id) ON DELETE CASCADE;

alter table public."procurement_place_counties" add constraint "procurement_place_counties_county_id_fkey" FOREIGN KEY (county_id) REFERENCES procurement_geographies(id);

alter table public."procurement_place_counties" add constraint "procurement_place_counties_place_id_fkey" FOREIGN KEY (place_id) REFERENCES procurement_geographies(id);

alter table public."procurement_request_targets" add constraint "procurement_request_targets_geography_id_fkey" FOREIGN KEY (geography_id) REFERENCES procurement_geographies(id);

alter table public."procurement_request_targets" add constraint "procurement_request_targets_search_request_id_fkey" FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id);

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_agency_geography_id_fkey" FOREIGN KEY (agency_geography_id) REFERENCES procurement_geographies(id);

alter table public."procurement_source_capabilities" add constraint "procurement_source_capabilities_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_capability_id_fkey" FOREIGN KEY (capability_id) REFERENCES procurement_source_capabilities(id);

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_route_geography_id_fkey" FOREIGN KEY (route_geography_id) REFERENCES procurement_geographies(id);

alter table public."procurement_coverage_tasks" add constraint "procurement_coverage_tasks_target_id_fkey" FOREIGN KEY (target_id) REFERENCES procurement_request_targets(id);

alter table public."procurement_jobs" add constraint "procurement_jobs_capability_id_fkey" FOREIGN KEY (capability_id) REFERENCES procurement_source_capabilities(id);

alter table public."procurement_jobs" add constraint "procurement_jobs_search_request_id_fkey" FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id);

alter table public."procurement_action_requests" add constraint "procurement_action_requests_capability_id_fkey" FOREIGN KEY (capability_id) REFERENCES procurement_source_capabilities(id);

alter table public."procurement_action_requests" add constraint "procurement_action_requests_resume_job_id_fkey" FOREIGN KEY (resume_job_id) REFERENCES procurement_jobs(id);

alter table public."procurement_action_requests" add constraint "procurement_action_requests_source_id_fkey" FOREIGN KEY (source_id) REFERENCES procurement_sources(id);

CREATE INDEX procurement_jobs_pending ON public.procurement_jobs USING btree (state, next_attempt_at);

CREATE INDEX lead_status_changes_lead_created_idx ON public.procurement_lead_stage_changes USING btree (lead_id, created_at DESC);

CREATE INDEX lead_status_changes_status_created_idx ON public.procurement_lead_stage_changes USING btree (to_status, created_at DESC);

CREATE INDEX lead_status_changes_actor_created_idx ON public.procurement_lead_stage_changes USING btree (changed_by, created_at DESC);

CREATE INDEX spin_contract_opportunities_status_idx ON public.spin_contract_opportunities USING btree (status);

CREATE INDEX spin_contract_opportunities_due_at_idx ON public.spin_contract_opportunities USING btree (due_at);

CREATE INDEX spin_contract_opportunities_expires_at_idx ON public.spin_contract_opportunities USING btree (expires_at);

CREATE INDEX spin_contract_opportunities_source_hash_idx ON public.spin_contract_opportunities USING btree (source_id, content_hash);

CREATE INDEX spin_contract_generation_runs_geo_created_idx ON public.spin_contract_generation_runs USING btree (geography_id, created_at DESC);

CREATE INDEX procurement_coverage_tasks_target ON public.procurement_coverage_tasks USING btree (target_id, state);

CREATE INDEX spin_procurement_sources_geography_id_idx ON public.spin_procurement_sources USING btree (geography_id);

CREATE INDEX spin_procurement_sources_state_county_idx ON public.spin_procurement_sources USING btree (state_code, county);

CREATE INDEX procurement_leads_payload ON public.procurement_leads USING gin (payload);

CREATE INDEX procurement_leads_changes ON public.procurement_leads USING btree (detected_change_at, id);

CREATE INDEX lead_notes_lead_created_idx ON public.procurement_lead_notes USING btree (lead_id, created_at DESC);

CREATE UNIQUE INDEX procurement_sources_identity_key ON public.procurement_sources USING btree (identity_key) WHERE (identity_key IS NOT NULL);

CREATE INDEX lead_note_edits_note_edited_idx ON public.procurement_lead_note_edits USING btree (note_id, edited_at DESC);

CREATE INDEX procurement_events_cursor ON public.procurement_events USING btree (id);

CREATE TRIGGER spin_contract_opportunities_touch_updated_at BEFORE UPDATE ON public.spin_contract_opportunities FOR EACH ROW EXECUTE FUNCTION spin_touch_updated_at();

CREATE TRIGGER spin_procurement_sources_touch_updated_at BEFORE UPDATE ON public.spin_procurement_sources FOR EACH ROW EXECUTE FUNCTION spin_touch_updated_at();

CREATE TRIGGER validate_procurement_search_request BEFORE INSERT OR UPDATE ON public.procurement_search_requests FOR EACH ROW EXECUTE FUNCTION validate_procurement_search_request();

CREATE TRIGGER procurement_lead_changed AFTER INSERT OR UPDATE ON public.procurement_leads FOR EACH ROW EXECUTE FUNCTION procurement_lead_changed();

CREATE TRIGGER procurement_sync_lead_columns BEFORE INSERT OR UPDATE OF payload ON public.procurement_leads FOR EACH ROW EXECUTE FUNCTION procurement_sync_lead_columns();

alter table public."spin_geography" enable row level security;

alter table public."spin_contract_generation_runs" enable row level security;

alter table public."spin_contract_opportunities" enable row level security;

alter table public."spin_procurement_sources" enable row level security;

alter table public."procurement_sources" enable row level security;

alter table public."procurement_versions" enable row level security;

alter table public."procurement_events" enable row level security;

alter table public."procurement_runs" enable row level security;

alter table public."procurement_intake_items" enable row level security;

alter table public."procurement_registrations" enable row level security;

alter table public."procurement_contacts" enable row level security;

alter table public."procurement_lead_links" enable row level security;

alter table public."procurement_search_requests" enable row level security;

alter table public."procurement_request_sources" enable row level security;

alter table public."procurement_request_leads" enable row level security;

alter table public."procurement_intake_leads" enable row level security;

alter table public."procurement_event_receipts" enable row level security;

alter table public."procurement_members" enable row level security;

alter table public."procurement_leads" enable row level security;

alter table public."procurement_lead_notes" enable row level security;

alter table public."procurement_lead_note_edits" enable row level security;

alter table public."procurement_lead_stage_changes" enable row level security;

alter table public."procurement_geographies" enable row level security;

alter table public."procurement_place_counties" enable row level security;

alter table public."procurement_request_targets" enable row level security;

alter table public."procurement_source_capabilities" enable row level security;

alter table public."procurement_coverage_tasks" enable row level security;

alter table public."procurement_jobs" enable row level security;

alter table public."procurement_action_requests" enable row level security;

create policy "staff_read" on public."procurement_lead_links" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_geographies" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_jobs" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "lead_status_changes_read" on public."procurement_lead_stage_changes" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() IS NOT NULL));

create policy "staff_read" on public."procurement_request_leads" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_intake_items" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_action_requests" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "procurement_versions_read" on public."procurement_versions" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_versions" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_source_capabilities" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_request_sources" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "procurement_registrations_read" on public."procurement_registrations" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_registrations" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "spin_contract_opportunities_read" on public."spin_contract_opportunities" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "spin_contract_generation_runs_read" on public."spin_contract_generation_runs" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "own_membership" on public."procurement_members" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "staff_read" on public."procurement_coverage_tasks" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "spin_procurement_sources_read" on public."spin_procurement_sources" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_place_counties" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_intake_leads" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "procurement_leads_read" on public."procurement_leads" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_leads" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_search_requests" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "lead_notes_insert_own" on public."procurement_lead_notes" as PERMISSIVE for INSERT to "authenticated" with check ((created_by = auth.uid()));

create policy "lead_notes_read" on public."procurement_lead_notes" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() IS NOT NULL));

create policy "lead_notes_update_own" on public."procurement_lead_notes" as PERMISSIVE for UPDATE to "authenticated" using ((created_by = auth.uid())) with check ((created_by = auth.uid()));

create policy "procurement_sources_read" on public."procurement_sources" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_sources" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "lead_note_edits_insert_own" on public."procurement_lead_note_edits" as PERMISSIVE for INSERT to "authenticated" with check (((edited_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM procurement_lead_notes
  WHERE ((procurement_lead_notes.id = procurement_lead_note_edits.note_id) AND (procurement_lead_notes.created_by = auth.uid()))))));

create policy "lead_note_edits_read" on public."procurement_lead_note_edits" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() IS NOT NULL));

create policy "staff_read" on public."procurement_event_receipts" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "staff_read" on public."procurement_request_targets" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "procurement_events_read" on public."procurement_events" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_events" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "procurement_runs_read" on public."procurement_runs" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_runs" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

create policy "procurement_contacts_read" on public."procurement_contacts" as PERMISSIVE for SELECT to "anon","authenticated" using (true);

create policy "staff_read" on public."procurement_contacts" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM procurement_members
  WHERE (procurement_members.user_id = ( SELECT auth.uid() AS uid)))));

revoke all on public."spin_geography" from public, anon, authenticated;

revoke all on public."spin_contract_generation_runs" from public, anon, authenticated;

revoke all on public."spin_contract_opportunities" from public, anon, authenticated;

revoke all on public."spin_procurement_sources" from public, anon, authenticated;

revoke all on public."procurement_sources" from public, anon, authenticated;

revoke all on public."procurement_versions" from public, anon, authenticated;

revoke all on public."procurement_events" from public, anon, authenticated;

revoke all on public."procurement_runs" from public, anon, authenticated;

revoke all on public."procurement_intake_items" from public, anon, authenticated;

revoke all on public."procurement_registrations" from public, anon, authenticated;

revoke all on public."procurement_contacts" from public, anon, authenticated;

revoke all on public."procurement_lead_links" from public, anon, authenticated;

revoke all on public."procurement_search_requests" from public, anon, authenticated;

revoke all on public."procurement_request_sources" from public, anon, authenticated;

revoke all on public."procurement_request_leads" from public, anon, authenticated;

revoke all on public."procurement_intake_leads" from public, anon, authenticated;

revoke all on public."procurement_event_receipts" from public, anon, authenticated;

revoke all on public."procurement_members" from public, anon, authenticated;

revoke all on public."procurement_leads" from public, anon, authenticated;

revoke all on public."procurement_lead_notes" from public, anon, authenticated;

revoke all on public."procurement_lead_note_edits" from public, anon, authenticated;

revoke all on public."procurement_lead_stage_changes" from public, anon, authenticated;

revoke all on public."procurement_geographies" from public, anon, authenticated;

revoke all on public."procurement_place_counties" from public, anon, authenticated;

revoke all on public."procurement_request_targets" from public, anon, authenticated;

revoke all on public."procurement_source_capabilities" from public, anon, authenticated;

revoke all on public."procurement_coverage_tasks" from public, anon, authenticated;

revoke all on public."procurement_jobs" from public, anon, authenticated;

revoke all on public."procurement_action_requests" from public, anon, authenticated;

grant INSERT on public."spin_geography" to "anon";

grant SELECT on public."spin_geography" to "anon";

grant UPDATE on public."spin_geography" to "anon";

grant DELETE on public."spin_geography" to "anon";

grant TRUNCATE on public."spin_geography" to "anon";

grant REFERENCES on public."spin_geography" to "anon";

grant TRIGGER on public."spin_geography" to "anon";

grant INSERT on public."spin_geography" to "authenticated";

grant SELECT on public."spin_geography" to "authenticated";

grant UPDATE on public."spin_geography" to "authenticated";

grant DELETE on public."spin_geography" to "authenticated";

grant TRUNCATE on public."spin_geography" to "authenticated";

grant REFERENCES on public."spin_geography" to "authenticated";

grant TRIGGER on public."spin_geography" to "authenticated";

grant INSERT on public."spin_geography" to "service_role";

grant SELECT on public."spin_geography" to "service_role";

grant UPDATE on public."spin_geography" to "service_role";

grant DELETE on public."spin_geography" to "service_role";

grant TRUNCATE on public."spin_geography" to "service_role";

grant REFERENCES on public."spin_geography" to "service_role";

grant TRIGGER on public."spin_geography" to "service_role";

grant INSERT on public."spin_procurement_sources" to "anon";

grant SELECT on public."spin_procurement_sources" to "anon";

grant UPDATE on public."spin_procurement_sources" to "anon";

grant DELETE on public."spin_procurement_sources" to "anon";

grant TRUNCATE on public."spin_procurement_sources" to "anon";

grant REFERENCES on public."spin_procurement_sources" to "anon";

grant TRIGGER on public."spin_procurement_sources" to "anon";

grant INSERT on public."spin_procurement_sources" to "authenticated";

grant SELECT on public."spin_procurement_sources" to "authenticated";

grant UPDATE on public."spin_procurement_sources" to "authenticated";

grant DELETE on public."spin_procurement_sources" to "authenticated";

grant TRUNCATE on public."spin_procurement_sources" to "authenticated";

grant REFERENCES on public."spin_procurement_sources" to "authenticated";

grant TRIGGER on public."spin_procurement_sources" to "authenticated";

grant INSERT on public."spin_procurement_sources" to "service_role";

grant SELECT on public."spin_procurement_sources" to "service_role";

grant UPDATE on public."spin_procurement_sources" to "service_role";

grant DELETE on public."spin_procurement_sources" to "service_role";

grant TRUNCATE on public."spin_procurement_sources" to "service_role";

grant REFERENCES on public."spin_procurement_sources" to "service_role";

grant TRIGGER on public."spin_procurement_sources" to "service_role";

grant INSERT on public."spin_contract_generation_runs" to "anon";

grant SELECT on public."spin_contract_generation_runs" to "anon";

grant UPDATE on public."spin_contract_generation_runs" to "anon";

grant DELETE on public."spin_contract_generation_runs" to "anon";

grant TRUNCATE on public."spin_contract_generation_runs" to "anon";

grant REFERENCES on public."spin_contract_generation_runs" to "anon";

grant TRIGGER on public."spin_contract_generation_runs" to "anon";

grant INSERT on public."spin_contract_generation_runs" to "authenticated";

grant SELECT on public."spin_contract_generation_runs" to "authenticated";

grant UPDATE on public."spin_contract_generation_runs" to "authenticated";

grant DELETE on public."spin_contract_generation_runs" to "authenticated";

grant TRUNCATE on public."spin_contract_generation_runs" to "authenticated";

grant REFERENCES on public."spin_contract_generation_runs" to "authenticated";

grant TRIGGER on public."spin_contract_generation_runs" to "authenticated";

grant INSERT on public."spin_contract_generation_runs" to "service_role";

grant SELECT on public."spin_contract_generation_runs" to "service_role";

grant UPDATE on public."spin_contract_generation_runs" to "service_role";

grant DELETE on public."spin_contract_generation_runs" to "service_role";

grant TRUNCATE on public."spin_contract_generation_runs" to "service_role";

grant REFERENCES on public."spin_contract_generation_runs" to "service_role";

grant TRIGGER on public."spin_contract_generation_runs" to "service_role";

grant INSERT on public."spin_contract_opportunities" to "anon";

grant SELECT on public."spin_contract_opportunities" to "anon";

grant UPDATE on public."spin_contract_opportunities" to "anon";

grant DELETE on public."spin_contract_opportunities" to "anon";

grant TRUNCATE on public."spin_contract_opportunities" to "anon";

grant REFERENCES on public."spin_contract_opportunities" to "anon";

grant TRIGGER on public."spin_contract_opportunities" to "anon";

grant INSERT on public."spin_contract_opportunities" to "authenticated";

grant SELECT on public."spin_contract_opportunities" to "authenticated";

grant UPDATE on public."spin_contract_opportunities" to "authenticated";

grant DELETE on public."spin_contract_opportunities" to "authenticated";

grant TRUNCATE on public."spin_contract_opportunities" to "authenticated";

grant REFERENCES on public."spin_contract_opportunities" to "authenticated";

grant TRIGGER on public."spin_contract_opportunities" to "authenticated";

grant INSERT on public."spin_contract_opportunities" to "service_role";

grant SELECT on public."spin_contract_opportunities" to "service_role";

grant UPDATE on public."spin_contract_opportunities" to "service_role";

grant DELETE on public."spin_contract_opportunities" to "service_role";

grant TRUNCATE on public."spin_contract_opportunities" to "service_role";

grant REFERENCES on public."spin_contract_opportunities" to "service_role";

grant TRIGGER on public."spin_contract_opportunities" to "service_role";

grant INSERT on public."procurement_sources" to "service_role";

grant SELECT on public."procurement_sources" to "service_role";

grant UPDATE on public."procurement_sources" to "service_role";

grant DELETE on public."procurement_sources" to "service_role";

grant TRUNCATE on public."procurement_sources" to "service_role";

grant REFERENCES on public."procurement_sources" to "service_role";

grant TRIGGER on public."procurement_sources" to "service_role";

grant SELECT on public."procurement_sources" to "authenticated";

grant SELECT on public."procurement_sources" to "anon";

grant INSERT on public."procurement_registrations" to "service_role";

grant SELECT on public."procurement_registrations" to "service_role";

grant UPDATE on public."procurement_registrations" to "service_role";

grant DELETE on public."procurement_registrations" to "service_role";

grant TRUNCATE on public."procurement_registrations" to "service_role";

grant REFERENCES on public."procurement_registrations" to "service_role";

grant TRIGGER on public."procurement_registrations" to "service_role";

grant SELECT on public."procurement_registrations" to "authenticated";

grant SELECT on public."procurement_registrations" to "anon";

grant INSERT on public."procurement_intake_items" to "service_role";

grant SELECT on public."procurement_intake_items" to "service_role";

grant UPDATE on public."procurement_intake_items" to "service_role";

grant DELETE on public."procurement_intake_items" to "service_role";

grant TRUNCATE on public."procurement_intake_items" to "service_role";

grant REFERENCES on public."procurement_intake_items" to "service_role";

grant TRIGGER on public."procurement_intake_items" to "service_role";

grant SELECT on public."procurement_intake_items" to "authenticated";

grant INSERT on public."procurement_contacts" to "service_role";

grant SELECT on public."procurement_contacts" to "service_role";

grant UPDATE on public."procurement_contacts" to "service_role";

grant DELETE on public."procurement_contacts" to "service_role";

grant TRUNCATE on public."procurement_contacts" to "service_role";

grant REFERENCES on public."procurement_contacts" to "service_role";

grant TRIGGER on public."procurement_contacts" to "service_role";

grant SELECT on public."procurement_contacts" to "authenticated";

grant SELECT on public."procurement_contacts" to "anon";

grant INSERT on public."procurement_runs" to "service_role";

grant SELECT on public."procurement_runs" to "service_role";

grant UPDATE on public."procurement_runs" to "service_role";

grant DELETE on public."procurement_runs" to "service_role";

grant TRUNCATE on public."procurement_runs" to "service_role";

grant REFERENCES on public."procurement_runs" to "service_role";

grant TRIGGER on public."procurement_runs" to "service_role";

grant SELECT on public."procurement_runs" to "authenticated";

grant SELECT on public."procurement_runs" to "anon";

grant INSERT on public."procurement_events" to "service_role";

grant SELECT on public."procurement_events" to "service_role";

grant UPDATE on public."procurement_events" to "service_role";

grant DELETE on public."procurement_events" to "service_role";

grant TRUNCATE on public."procurement_events" to "service_role";

grant REFERENCES on public."procurement_events" to "service_role";

grant TRIGGER on public."procurement_events" to "service_role";

grant SELECT on public."procurement_events" to "authenticated";

grant SELECT on public."procurement_events" to "anon";

grant INSERT on public."procurement_versions" to "service_role";

grant SELECT on public."procurement_versions" to "service_role";

grant UPDATE on public."procurement_versions" to "service_role";

grant DELETE on public."procurement_versions" to "service_role";

grant TRUNCATE on public."procurement_versions" to "service_role";

grant REFERENCES on public."procurement_versions" to "service_role";

grant TRIGGER on public."procurement_versions" to "service_role";

grant SELECT on public."procurement_versions" to "authenticated";

grant SELECT on public."procurement_versions" to "anon";

grant INSERT on public."procurement_lead_links" to "service_role";

grant SELECT on public."procurement_lead_links" to "service_role";

grant UPDATE on public."procurement_lead_links" to "service_role";

grant DELETE on public."procurement_lead_links" to "service_role";

grant TRUNCATE on public."procurement_lead_links" to "service_role";

grant REFERENCES on public."procurement_lead_links" to "service_role";

grant TRIGGER on public."procurement_lead_links" to "service_role";

grant SELECT on public."procurement_lead_links" to "authenticated";

grant INSERT on public."procurement_request_sources" to "service_role";

grant SELECT on public."procurement_request_sources" to "service_role";

grant UPDATE on public."procurement_request_sources" to "service_role";

grant DELETE on public."procurement_request_sources" to "service_role";

grant TRUNCATE on public."procurement_request_sources" to "service_role";

grant REFERENCES on public."procurement_request_sources" to "service_role";

grant TRIGGER on public."procurement_request_sources" to "service_role";

grant SELECT on public."procurement_request_sources" to "authenticated";

grant INSERT on public."procurement_request_leads" to "service_role";

grant SELECT on public."procurement_request_leads" to "service_role";

grant UPDATE on public."procurement_request_leads" to "service_role";

grant DELETE on public."procurement_request_leads" to "service_role";

grant TRUNCATE on public."procurement_request_leads" to "service_role";

grant REFERENCES on public."procurement_request_leads" to "service_role";

grant TRIGGER on public."procurement_request_leads" to "service_role";

grant SELECT on public."procurement_request_leads" to "authenticated";

grant INSERT on public."procurement_intake_leads" to "service_role";

grant SELECT on public."procurement_intake_leads" to "service_role";

grant UPDATE on public."procurement_intake_leads" to "service_role";

grant DELETE on public."procurement_intake_leads" to "service_role";

grant TRUNCATE on public."procurement_intake_leads" to "service_role";

grant REFERENCES on public."procurement_intake_leads" to "service_role";

grant TRIGGER on public."procurement_intake_leads" to "service_role";

grant SELECT on public."procurement_intake_leads" to "authenticated";

grant INSERT on public."procurement_leads" to "service_role";

grant SELECT on public."procurement_leads" to "service_role";

grant UPDATE on public."procurement_leads" to "service_role";

grant DELETE on public."procurement_leads" to "service_role";

grant TRUNCATE on public."procurement_leads" to "service_role";

grant REFERENCES on public."procurement_leads" to "service_role";

grant TRIGGER on public."procurement_leads" to "service_role";

grant SELECT on public."procurement_leads" to "authenticated";

grant SELECT on public."procurement_leads" to "anon";

grant INSERT on public."procurement_event_receipts" to "service_role";

grant SELECT on public."procurement_event_receipts" to "service_role";

grant UPDATE on public."procurement_event_receipts" to "service_role";

grant DELETE on public."procurement_event_receipts" to "service_role";

grant TRUNCATE on public."procurement_event_receipts" to "service_role";

grant REFERENCES on public."procurement_event_receipts" to "service_role";

grant TRIGGER on public."procurement_event_receipts" to "service_role";

grant SELECT on public."procurement_event_receipts" to "authenticated";

grant INSERT on public."procurement_members" to "service_role";

grant SELECT on public."procurement_members" to "service_role";

grant UPDATE on public."procurement_members" to "service_role";

grant DELETE on public."procurement_members" to "service_role";

grant TRUNCATE on public."procurement_members" to "service_role";

grant REFERENCES on public."procurement_members" to "service_role";

grant TRIGGER on public."procurement_members" to "service_role";

grant SELECT on public."procurement_members" to "authenticated";

grant INSERT on public."procurement_search_requests" to "service_role";

grant SELECT on public."procurement_search_requests" to "service_role";

grant UPDATE on public."procurement_search_requests" to "service_role";

grant DELETE on public."procurement_search_requests" to "service_role";

grant TRUNCATE on public."procurement_search_requests" to "service_role";

grant REFERENCES on public."procurement_search_requests" to "service_role";

grant TRIGGER on public."procurement_search_requests" to "service_role";

grant SELECT on public."procurement_search_requests" to "authenticated";

grant INSERT on public."procurement_lead_notes" to "authenticated";

grant SELECT on public."procurement_lead_notes" to "authenticated";

grant UPDATE on public."procurement_lead_notes" to "authenticated";

grant DELETE on public."procurement_lead_notes" to "authenticated";

grant TRUNCATE on public."procurement_lead_notes" to "authenticated";

grant REFERENCES on public."procurement_lead_notes" to "authenticated";

grant TRIGGER on public."procurement_lead_notes" to "authenticated";

grant INSERT on public."procurement_lead_notes" to "service_role";

grant SELECT on public."procurement_lead_notes" to "service_role";

grant UPDATE on public."procurement_lead_notes" to "service_role";

grant DELETE on public."procurement_lead_notes" to "service_role";

grant TRUNCATE on public."procurement_lead_notes" to "service_role";

grant REFERENCES on public."procurement_lead_notes" to "service_role";

grant TRIGGER on public."procurement_lead_notes" to "service_role";

grant INSERT on public."procurement_lead_note_edits" to "authenticated";

grant SELECT on public."procurement_lead_note_edits" to "authenticated";

grant UPDATE on public."procurement_lead_note_edits" to "authenticated";

grant DELETE on public."procurement_lead_note_edits" to "authenticated";

grant TRUNCATE on public."procurement_lead_note_edits" to "authenticated";

grant REFERENCES on public."procurement_lead_note_edits" to "authenticated";

grant TRIGGER on public."procurement_lead_note_edits" to "authenticated";

grant INSERT on public."procurement_lead_note_edits" to "service_role";

grant SELECT on public."procurement_lead_note_edits" to "service_role";

grant UPDATE on public."procurement_lead_note_edits" to "service_role";

grant DELETE on public."procurement_lead_note_edits" to "service_role";

grant TRUNCATE on public."procurement_lead_note_edits" to "service_role";

grant REFERENCES on public."procurement_lead_note_edits" to "service_role";

grant TRIGGER on public."procurement_lead_note_edits" to "service_role";

grant INSERT on public."procurement_lead_stage_changes" to "authenticated";

grant SELECT on public."procurement_lead_stage_changes" to "authenticated";

grant UPDATE on public."procurement_lead_stage_changes" to "authenticated";

grant DELETE on public."procurement_lead_stage_changes" to "authenticated";

grant TRUNCATE on public."procurement_lead_stage_changes" to "authenticated";

grant REFERENCES on public."procurement_lead_stage_changes" to "authenticated";

grant TRIGGER on public."procurement_lead_stage_changes" to "authenticated";

grant INSERT on public."procurement_lead_stage_changes" to "service_role";

grant SELECT on public."procurement_lead_stage_changes" to "service_role";

grant UPDATE on public."procurement_lead_stage_changes" to "service_role";

grant DELETE on public."procurement_lead_stage_changes" to "service_role";

grant TRUNCATE on public."procurement_lead_stage_changes" to "service_role";

grant REFERENCES on public."procurement_lead_stage_changes" to "service_role";

grant TRIGGER on public."procurement_lead_stage_changes" to "service_role";

grant INSERT on public."procurement_geographies" to "service_role";

grant SELECT on public."procurement_geographies" to "service_role";

grant UPDATE on public."procurement_geographies" to "service_role";

grant DELETE on public."procurement_geographies" to "service_role";

grant TRUNCATE on public."procurement_geographies" to "service_role";

grant REFERENCES on public."procurement_geographies" to "service_role";

grant TRIGGER on public."procurement_geographies" to "service_role";

grant SELECT on public."procurement_geographies" to "authenticated";

grant INSERT on public."procurement_place_counties" to "service_role";

grant SELECT on public."procurement_place_counties" to "service_role";

grant UPDATE on public."procurement_place_counties" to "service_role";

grant DELETE on public."procurement_place_counties" to "service_role";

grant TRUNCATE on public."procurement_place_counties" to "service_role";

grant REFERENCES on public."procurement_place_counties" to "service_role";

grant TRIGGER on public."procurement_place_counties" to "service_role";

grant SELECT on public."procurement_place_counties" to "authenticated";

grant INSERT on public."procurement_request_targets" to "service_role";

grant SELECT on public."procurement_request_targets" to "service_role";

grant UPDATE on public."procurement_request_targets" to "service_role";

grant DELETE on public."procurement_request_targets" to "service_role";

grant TRUNCATE on public."procurement_request_targets" to "service_role";

grant REFERENCES on public."procurement_request_targets" to "service_role";

grant TRIGGER on public."procurement_request_targets" to "service_role";

grant SELECT on public."procurement_request_targets" to "authenticated";

grant INSERT on public."procurement_source_capabilities" to "service_role";

grant SELECT on public."procurement_source_capabilities" to "service_role";

grant UPDATE on public."procurement_source_capabilities" to "service_role";

grant DELETE on public."procurement_source_capabilities" to "service_role";

grant TRUNCATE on public."procurement_source_capabilities" to "service_role";

grant REFERENCES on public."procurement_source_capabilities" to "service_role";

grant TRIGGER on public."procurement_source_capabilities" to "service_role";

grant SELECT on public."procurement_source_capabilities" to "authenticated";

grant INSERT on public."procurement_coverage_tasks" to "service_role";

grant SELECT on public."procurement_coverage_tasks" to "service_role";

grant UPDATE on public."procurement_coverage_tasks" to "service_role";

grant DELETE on public."procurement_coverage_tasks" to "service_role";

grant TRUNCATE on public."procurement_coverage_tasks" to "service_role";

grant REFERENCES on public."procurement_coverage_tasks" to "service_role";

grant TRIGGER on public."procurement_coverage_tasks" to "service_role";

grant SELECT on public."procurement_coverage_tasks" to "authenticated";

grant INSERT on public."procurement_jobs" to "service_role";

grant SELECT on public."procurement_jobs" to "service_role";

grant UPDATE on public."procurement_jobs" to "service_role";

grant DELETE on public."procurement_jobs" to "service_role";

grant TRUNCATE on public."procurement_jobs" to "service_role";

grant REFERENCES on public."procurement_jobs" to "service_role";

grant TRIGGER on public."procurement_jobs" to "service_role";

grant SELECT on public."procurement_jobs" to "authenticated";

grant INSERT on public."procurement_action_requests" to "service_role";

grant SELECT on public."procurement_action_requests" to "service_role";

grant UPDATE on public."procurement_action_requests" to "service_role";

grant DELETE on public."procurement_action_requests" to "service_role";

grant TRUNCATE on public."procurement_action_requests" to "service_role";

grant REFERENCES on public."procurement_action_requests" to "service_role";

grant TRIGGER on public."procurement_action_requests" to "service_role";

grant SELECT on public."procurement_action_requests" to "authenticated";

revoke all on function procurement_lead_changed() from public, anon, authenticated;

grant execute on function procurement_lead_changed() to service_role;

revoke all on function pending_procurement_events(text,integer) from public, anon, authenticated;

grant execute on function pending_procurement_events(text,integer) to service_role;

revoke all on function ingest_procurement_lead(uuid,text,jsonb,text,uuid,text,text,uuid) from public, anon, authenticated;

grant execute on function ingest_procurement_lead(uuid,text,jsonb,text,uuid,text,text,uuid) to service_role;

revoke all on function queue_recompete_reviews() from public, anon, authenticated;

grant execute on function queue_recompete_reviews() to service_role;

revoke all on function edit_lead_note(uuid,text) from public, anon, authenticated;

grant execute on function edit_lead_note(uuid,text) to authenticated;

grant execute on function edit_lead_note(uuid,text) to service_role;

revoke all on function update_procurement_lead_stage(uuid,text,text,text) from public, anon, authenticated;

grant execute on function update_procurement_lead_stage(uuid,text,text,text) to authenticated;

grant execute on function update_procurement_lead_stage(uuid,text,text,text) to service_role;

revoke all on function bulk_update_procurement_lead_stage(uuid[],text,text,text) from public, anon, authenticated;

grant execute on function bulk_update_procurement_lead_stage(uuid[],text,text,text) to authenticated;

grant execute on function bulk_update_procurement_lead_stage(uuid[],text,text,text) to service_role;

revoke all on function procurement_parse_date(text) from public, anon, authenticated;

grant execute on function procurement_parse_date(text) to service_role;

revoke all on function procurement_parse_deadline(text) from public, anon, authenticated;

grant execute on function procurement_parse_deadline(text) to service_role;

revoke all on function procurement_sync_lead_columns() from public, anon, authenticated;

grant execute on function procurement_sync_lead_columns() to service_role;

revoke all on function create_lead_note(uuid,text) from public, anon, authenticated;

grant execute on function create_lead_note(uuid,text) to authenticated;

grant execute on function create_lead_note(uuid,text) to service_role;

revoke all on function spin_touch_updated_at() from public, anon, authenticated;

grant execute on function spin_touch_updated_at() to anon;

grant execute on function spin_touch_updated_at() to authenticated;

grant execute on function spin_touch_updated_at() to service_role;

revoke all on function validate_procurement_search_request() from public, anon, authenticated;

grant execute on function validate_procurement_search_request() to service_role;

revoke all on function ingest_procurement_intake(uuid,text,jsonb,text) from public, anon, authenticated;

grant execute on function ingest_procurement_intake(uuid,text,jsonb,text) to service_role;

revoke all on function acknowledge_procurement_event(text,uuid) from public, anon, authenticated;

grant execute on function acknowledge_procurement_event(text,uuid) to service_role;

commit;
