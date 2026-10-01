-- Preserve already-applied migration history; close null bounds and historical-date gaps.
begin;

-- Invoker permissions + RLS apply to all records, counts and activity predicates.
create or replace function public.procurement_queue_page(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare result jsonb; zone text := coalesce(p_filters->>'timezone','America/Chicago');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_limit is null or p_offset is null or p_limit not between 1 and 100 or p_offset < 0 then raise exception 'Invalid page bounds'; end if;
  if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Invalid timezone'; end if;
  with normalized as (
    select l.*, coalesce(l.payload,'{}'::jsonb) as facts,
      case when regexp_replace(lower(coalesce(l.stage,'new')),'[_\s]+','-','g') in ('interested','in-progress','in-review') then 'interested'
        when l.stage in ('hold','on_hold','on-hold','paused') then 'hold'
        when l.stage in ('not_interested','not-interested','not-a-fit','rejected') then 'not-interested'
        when l.stage in ('applied','submitted') then 'applied' when l.stage in ('won','awarded') then 'won'
        when l.stage in ('lost','closed-lost') then 'lost' when l.stage in ('withdrew','withdrawn') then 'withdrew' else 'new' end as queue_stage,
      case when lower(coalesce(l.bid_type,l.payload->>'bid_type','')) ~ 'historical|candidate' then 'unknown'
        when lower(coalesce(l.bid_type,l.payload->>'bid_type','')) like '%forecast%' then 'forecast'
        when lower(coalesce(l.bid_type,l.payload->>'bid_type','')) ~ 'opportunity|solicitation' then 'opportunity'
        when lower(coalesce(l.bid_type,l.payload->>'bid_type','')) ~ 'award|^contract$' then 'award' else 'unknown' end as queue_bid,
      case when lower(coalesce(l.business_category,l.payload->>'business_category','')) ~ 'school|university|education' then 'School'
        when lower(coalesce(l.business_category,l.payload->>'business_category','')) ~ 'medical|health|hospital|clinic' then 'Medical' else 'Government' end as queue_category
    from public.procurement_leads l
  ), dates as (
    select n.*,
      coalesce(publication_date,procurement_parse_date(facts->>'published_date')) as pub_day,
      coalesce(contract_start_date,procurement_parse_date(facts->>'contract_start')) as start_day,
      coalesce(contract_current_end_date,procurement_parse_date(coalesce(facts->>'contract_end',facts->>'expires_at'))) as end_day,
      coalesce(contract_potential_end_date,procurement_parse_date(facts->>'ultimate_end')) as potential_day,
      coalesce((response_deadline at time zone zone)::date,
        case when coalesce(facts->>'deadline',facts->>'due_at') ~ '^\d{4}-\d{2}-\d{2}$'
          then procurement_parse_date(coalesce(facts->>'deadline',facts->>'due_at'))
          else (procurement_parse_deadline(coalesce(facts->>'deadline',facts->>'due_at')) at time zone zone)::date end) as due_day
    from normalized n
  ), applicable as (
    select d.*, case queue_bid when 'forecast' then coalesce(pub_day,start_day)
      when 'opportunity' then coalesce(due_day,end_day,potential_day,pub_day,start_day)
      when 'award' then coalesce(end_day,potential_day,pub_day,start_day) else coalesce(pub_day,due_day,end_day,potential_day,start_day) end as applicable_day
    from dates d
  ), filtered as (
    select a.* from applicable a
    where (coalesce(p_filters->>'status','open')=queue_stage
      or (coalesce(p_filters->>'status','open')='open' and queue_stage not in ('not-interested','won','lost','withdrew'))
      or (p_filters->>'status'='closed' and queue_stage in ('not-interested','won','lost','withdrew')))
    and (p_filters->>'status'<>'closed' or coalesce(p_filters->>'closedSubcategory','all')='all' or queue_stage=p_filters->>'closedSubcategory')
    and (coalesce(p_filters->>'category','All')='All' or queue_category=p_filters->>'category')
    and (coalesce(p_filters->>'bidType','All')='All' or queue_bid=p_filters->>'bidType')
    and (coalesce(trim(p_filters->>'query'),'')='' or strpos(lower(concat_ws(' ',title,agency,work_performance_city,work_performance_state,
      facts->>'title',facts->>'agency',facts->>'work_performance_locations',facts->'contacts'->0->>'name',facts->'contacts'->0->>'email',facts->'contacts'->0->>'phone')),lower(trim(p_filters->>'query')))>0)
    and (nullif(p_filters->>'dateFrom','') is null or applicable_day >= (p_filters->>'dateFrom')::date)
    and (nullif(p_filters->>'dateTo','') is null or applicable_day <= (p_filters->>'dateTo')::date)
    and ((nullif(p_filters->>'changedFrom','') is null and nullif(p_filters->>'changedTo','') is null) or exists (
      select 1 from (
        select a.created_at as at union all select a.updated_at
        union all select c.created_at from public.procurement_lead_stage_changes c where c.lead_id=a.id
        union all select n.created_at from public.procurement_lead_notes n where n.lead_id=a.id
        union all select n.updated_at from public.procurement_lead_notes n where n.lead_id=a.id
        union all select e.edited_at from public.procurement_lead_note_edits e join public.procurement_lead_notes n on n.id=e.note_id where n.lead_id=a.id
      ) activity where activity.at is not null
        and (nullif(p_filters->>'changedFrom','') is null or (activity.at at time zone zone)::date >= (p_filters->>'changedFrom')::date)
        and (nullif(p_filters->>'changedTo','') is null or (activity.at at time zone zone)::date <= (p_filters->>'changedTo')::date)
    ))
  ), page as (
    select * from filtered order by
      case when coalesce(p_filters->>'sortDirection','asc')='asc' then case p_filters->>'sortKey' when 'added' then extract(epoch from created_at) when 'updated' then extract(epoch from updated_at) else extract(epoch from applicable_day) end end asc nulls last,
      case when p_filters->>'sortDirection'='desc' then case p_filters->>'sortKey' when 'added' then extract(epoch from created_at) when 'updated' then extract(epoch from updated_at) else extract(epoch from applicable_day) end end desc nulls last,
      title asc nulls last, id asc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'counts',(select coalesce(jsonb_object_agg(queue_stage,n),'{}') from (select queue_stage,count(*) n from normalized group by queue_stage) counts),
    'rows',coalesce((select jsonb_agg((to_jsonb(p)-array['payload','facts','search_term_used','owner_id','created_by','updated_by','queue_stage','queue_bid','queue_category','pub_day','start_day','end_day','potential_day','due_day','applicable_day']) || jsonb_build_object('payload',jsonb_strip_nulls(jsonb_build_object(
      'title',facts->'title','agency',facts->'agency','source_url',facts->'source_url','bid_type',facts->'bid_type',
      'business_category',facts->'business_category','work_performance_locations',facts->'work_performance_locations',
      'contacts',jsonb_build_array(facts->'contacts'->0),'published_date',facts->'published_date',
      'planned_advertisement_period',facts->'planned_advertisement_period','deadline',facts->'deadline','due_at',facts->'due_at',
      'contract_start',facts->'contract_start','contract_end',facts->'contract_end','expires_at',facts->'expires_at','ultimate_end',facts->'ultimate_end',
      'next_action',facts->'next_action','status_note',facts->'status_note','verification_notes',facts->'verification_notes'
    )))) from page p),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.procurement_queue_page(jsonb,integer,integer) from public, anon;
grant execute on function public.procurement_queue_page(jsonb,integer,integer) to authenticated;
grant execute on function public.procurement_parse_date(text),public.procurement_parse_deadline(text) to authenticated;
create index if not exists procurement_lead_stage_changes_lead_created_idx on public.procurement_lead_stage_changes(lead_id,created_at);
create index if not exists procurement_lead_notes_lead_created_idx on public.procurement_lead_notes(lead_id,created_at);
notify pgrst, 'reload schema';
commit;
