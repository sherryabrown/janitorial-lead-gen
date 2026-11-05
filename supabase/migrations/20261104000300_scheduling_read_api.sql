begin;
create function public.procurement_saved_timestamp(v text) returns timestamptz
language plpgsql stable set search_path='' as $$begin
 if v ~ '^\d{4}-\d{2}-\d{2}$' then return v::date::timestamp at time zone 'UTC';end if;
 return v::timestamptz;exception when others then return null;end$$;
create function public.procurement_saved_config(c jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(c,'{}')) where key=any(array[
 'target_kind','county_ids','requested_categories','maintain_sources','check_updates','state_trigger_id','state_trigger_ids','search_windows','publication_window','sam_filters'])), '{}')
 ||jsonb_build_object('counties',coalesce((select jsonb_agg(jsonb_build_object('id',v->'id','name',v->'name','city_ids',v->'city_ids','selection_token',v->'selection_token',
 'cities',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name')) from jsonb_array_elements(coalesce(v->'cities','[]')) x),'[]'),
 'city_revisions',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','dataset_hash',x->'dataset_hash')) from jsonb_array_elements(coalesce(v->'city_revisions','[]')) x),'[]')))
 from jsonb_array_elements(coalesce(c->'counties','[]')) v),'[]'),
 'state_sources',coalesce((select jsonb_agg(jsonb_build_object('id',v->'id','source_id',v->'source_id','name',v->'name','category',v->'category','county_ids',v->'county_ids')) from jsonb_array_elements(coalesce(c->'state_sources','[]')) v),'[]'));
$$;
create function public.procurement_saved_audit_value(v jsonb,depth integer default 0) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if v is null or jsonb_typeof(v) in ('null','boolean','number') then return v;
 elsif jsonb_typeof(v)='string' then return to_jsonb(left(v#>>'{}',100));
 elsif depth>=3 then return 'null';
 elsif jsonb_typeof(v)='array' then return coalesce((select jsonb_agg(public.procurement_saved_audit_value(x,depth+1)) from (select value x from jsonb_array_elements(v) limit 100) s),'[]');
 else return coalesce((select jsonb_object_agg(key,public.procurement_saved_audit_value(value,depth+1)) from jsonb_each(v) where key in ('forecast','opportunity','award','historical_opportunity','lookback_days','from_offset_days','to_offset_days','date_basis')),'{}');end if;
end $$;
create function public.procurement_saved_occurrence(o jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when o is null or o='null' then null else jsonb_build_object('id',o->'id','version',o->'version','due_at',o->'due_at','effective_at',o->'effective_at','created_at',o->'created_at',
 'origin',o->'origin','state',o->'state','trigger_id',o->'trigger_id','config',public.procurement_saved_config(o->'config'),
 'reason',case when o->>'reason' in ('scope_changed','scope_unavailable','owner_inactive','previous_run_active','trigger_enqueue_failed') then o->>'reason' when o->>'reason' is null then null else 'saved_reason' end,
 'missed_from',o->'missed_from','missed_through',o->'missed_through','baseline',coalesce((select jsonb_agg(jsonb_build_object(
  'source_id',case when b->>'source_id' ~* '^[a-f0-9-]{36}$' then b->'source_id' else null end,
  'capability_id',case when b->>'capability_id' ~* '^[a-f0-9-]{36}$' then b->'capability_id' else null end,
  'run_id',case when b->>'run_id' ~* '^[a-f0-9-]{36}$' then b->'run_id' else null end,
  'category',case when b->>'category' in ('forecast','opportunity','award') then b->'category' else null end,
  'finished_at',case when public.procurement_saved_timestamp(b->>'finished_at') is not null then b->'finished_at' else null end,
  'content_sha256',case when b->>'content_sha256' ~ '^[a-f0-9]{64}$' then b->'content_sha256' else null end))
  from jsonb_array_elements(case when jsonb_typeof(o->'baseline')='array' then o->'baseline' else '[]' end) b),'[]')) end;
$$;
create function public.procurement_saved_schedule(p_id uuid,p_admin boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.procurement_schedule_overview%rowtype; r jsonb;
begin
 select * into s from public.procurement_schedule_overview where id=p_id;
 if not found then raise exception 'Schedule unavailable';end if;
 if s.last_run is not null then r=public.procurement_saved_run((s.last_run->>'id')::uuid,p_admin)->'reporting';end if;
 return jsonb_build_object('id',s.id,'name',s.name,'enabled',s.enabled,'archived',s.archived_at is not null,'version',s.version,'owner_id',s.owner_id,
 'config',public.procurement_saved_config(s.config),'recurrence',s.recurrence,'window_policy',s.window_policy,'next_due_at',s.next_due_at,'blocker',s.blocker,'updated_at',s.updated_at,
 'last_run',case when s.last_run is null then null else jsonb_set(s.last_run,'{config}',public.procurement_saved_config(s.last_run->'config')) end,'latest_occurrence',s.latest_occurrence,
 'can_delete',coalesce((select can_delete from public.procurement_schedule_deletion where id=s.id),false),
 'reporting',jsonb_build_object('as_of',now(),'last_run',r,'latest_occurrence',s.latest_occurrence));
end $$;

create function public.procurement_scheduling_read(p_read text,p_id uuid default null,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor_role text; admin boolean; f jsonb=coalesce(p_filters,'{}');
 result jsonb; items jsonb; total integer; lim integer=coalesce((p_filters->>'limit')::integer,50); off integer=coalesce((p_filters->>'offset')::integer,0);
 boundary timestamptz=coalesce((p_filters->>'as_of')::timestamptz,now());
 from_at timestamptz; through_at timestamptz; run_id uuid; seqs bigint[]; cursor_id bigint;
begin
 actor_role=public.procurement_saved_read_role();admin=actor_role='admin';
 if lim<1 or lim>100 or off<0 or jsonb_typeof(f)<>'object' or boundary>now()+interval '1 second' then raise exception 'Invalid read filters';end if;
 if coalesce(f->>'geography','')<>'' and f->>'geography' !~ '^(05|05\d{3})$'
  or coalesce(f->>'run','')<>'' and f->>'run' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(f->>'schedule','') not in ('','none') and f->>'schedule' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(f->>'target','')<>'' and f->>'target' not in ('county_scope','state_source','sam') and not(p_read='schedules' and f->>'target'='all')
  or coalesce(f->>'origin','') not in ('','manual','scheduled')
  or coalesce(f->>'outcome','') not in ('','pending','running','completed','partial','needs_review','outcome_unknown','cancelled')
  or coalesce(f->>'from','')<>'' and f->>'from' !~ '^\d{4}-\d{2}-\d{2}$'
  or coalesce(f->>'through','')<>'' and f->>'through' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid saved read filters';end if;
 if f ? 'from' and f->>'from'<>'' then from_at=(f->>'from')::date::timestamp at time zone 'America/Chicago';end if;
 if f ? 'through' and f->>'through'<>'' then through_at=((f->>'through')::date+1)::timestamp at time zone 'America/Chicago';end if;
 if from_at>through_at then raise exception 'Invalid history interval';end if;
 if p_read='source_status' then return public.procurement_saved_source_status(p_id,admin);
 elsif p_read='source_setup' then return public.procurement_saved_source_setup(p_id,lim,off);
 elsif p_read in ('analytics','metric_members') then return public.procurement_saved_analytics(f,admin,p_read='metric_members');
 elsif p_read='schedule' then return public.procurement_saved_schedule(p_id,admin);
 elsif p_read='run' then
  if f->>'projection'='progress' then
   select jsonb_build_object('progress_only',true,'id',t.id,'target_kind',t.target_kind,'state',t.state,'config',public.procurement_saved_config(t.config),
    'created_at',t.created_at,'finished_at',t.finished_at,'origin',t.origin,'schedule_id',t.schedule_id,'occurrence_id',t.occurrence_id,
    'children',public.procurement_saved_children(t.id),
    'reporting_pending',t.reporting_source_version>0 and not exists(select 1 from public.procurement_run_results h where h.trigger_id=t.id and h.source_version=t.reporting_source_version))
    ||case when admin then jsonb_build_object('usage',public.procurement_saved_usage(t.id),'next_action','Read saved progress') else '{}' end into result
   from public.procurement_triggers t where t.id=p_id and t.state in ('pending','running');
   if result is not null then return result;end if;
  elsif f ? 'projection' then raise exception 'Invalid trigger projection';end if;
  result=public.procurement_saved_run(p_id,admin);return jsonb_set(result,'{config}',public.procurement_saved_config(result->'config'));
 elsif p_read='scheduler_status' then
  if not admin then raise exception using errcode='42501',message='Admin required';end if;
  return public.procurement_scheduler_status()-'latest_delivery';
 elsif p_read='state_sources' then return jsonb_build_object('items',public.procurement_state_trigger_status());
 elsif p_read='counties' then
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name)||case when f->>'include'='scope' then jsonb_build_object(
   'cities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id) from public.procurement_place_counties pc join public.procurement_geographies c on c.id=pc.place_id and c.kind='municipality' and c.source_active where pc.county_id=g.id),'[]'),
   'selection_token',encode(sha256(convert_to('['||to_jsonb(g.id)::text||coalesce((select ','||string_agg('['||to_jsonb(c.id)::text||','||to_jsonb(c.dataset_hash)::text||']',',' order by c.id) from public.procurement_place_counties pc join public.procurement_geographies c on c.id=pc.place_id and c.kind='municipality' and c.source_active where pc.county_id=g.id),'')||']','UTF8')),'hex')) else '{}' end order by g.name,g.id),'[]') into items from public.procurement_geographies g where g.kind='county' and g.source_active;
  return jsonb_build_object('counties',items);
 elsif p_read='schedules' then
  if length(coalesce(f->>'q',''))>100 or coalesce(f->>'sort','name') not in ('name','target_kind','frequency','last_run_at','next_due_at','lifecycle') or coalesce(f->>'direction','asc') not in ('asc','desc')
   or coalesce(f->>'target','all') not in ('all','county_scope','state_source','sam') or coalesce(f->>'lifecycle','all') not in ('all','current','active','paused','archived') or coalesce(f->>'blocker','all') not in ('all','blocked','clear')
   or f ? 'projection' and f->>'projection'<>'choices' then raise exception 'Invalid schedule filters';end if;
  with filtered as materialized (
   select s.*,case coalesce(f->>'sort','name') when 'name' then s.name when 'target_kind' then s.target_kind when 'frequency' then s.frequency when 'last_run_at' then s.last_run_at::text when 'next_due_at' then s.next_due_at::text when 'lifecycle' then s.lifecycle end sort_key
   from public.procurement_schedule_overview s where strpos(lower(s.name),lower(coalesce(f->>'q','')))>0
    and (coalesce(f->>'target','all')='all' or s.target_kind=f->>'target')
    and (coalesce(f->>'lifecycle','all')='all' or f->>'lifecycle'='current' and s.archived_at is null or s.lifecycle=f->>'lifecycle')
    and (coalesce(f->>'blocker','all')='all' or f->>'blocker'='blocked' and s.blocker is not null or f->>'blocker'='clear' and s.blocker is null)
    and (coalesce(f->>'geography','')='' or f->>'geography'='05' and s.target_kind in ('state_source','sam') or s.config->'county_ids' ? (f->>'geography'))
  ), page as (select * from filtered order by case when coalesce(f->>'direction','asc')='asc' then sort_key end asc nulls last,case when f->>'direction'='desc' then sort_key end desc nulls last,id offset off limit lim)
  select (select count(*) from filtered),coalesce(jsonb_agg(case when f->>'projection'='choices' then jsonb_build_object('id',p.id,'name',p.name,'archived_at',p.archived_at) else public.procurement_saved_schedule(p.id,admin) end order by case when coalesce(f->>'direction','asc')='asc' then sort_key end asc nulls last,case when f->>'direction'='desc' then sort_key end desc nulls last,p.id),'[]') into total,items from page p;
 elsif p_read='history' then
  if f ? 'projection' and f->>'projection'<>'choices' then raise exception 'Invalid history projection';end if;
  with filtered as materialized (
   select t.* from public.procurement_triggers t where t.created_at<=boundary
    and (coalesce(f->>'schedule','')='' or f->>'schedule'='none' and t.schedule_id is null or t.schedule_id::text=f->>'schedule')
    and (coalesce(f->>'run','')='' or t.id::text=f->>'run') and (coalesce(f->>'target','')='' or t.target_kind=f->>'target')
    and (coalesce(f->>'origin','')='' or t.origin=f->>'origin') and (coalesce(f->>'outcome','')='' or t.state=f->>'outcome')
    and (from_at is null or t.created_at>=from_at) and (through_at is null or t.created_at<through_at)
    and (coalesce(f->>'geography','')='' or f->>'geography'='05' and t.target_kind in ('state_source','sam') or t.config->'county_ids' ? (f->>'geography'))
  ), page as (select * from filtered order by created_at desc,id offset off limit lim)
  select (select count(*) from filtered),coalesce(jsonb_agg(case when f->>'projection'='choices' then jsonb_build_object('id',t.id,'target_kind',t.target_kind,'schedule_id',t.schedule_id,'state',t.state,'origin',t.origin,'created_at',t.created_at) else
   (public.procurement_saved_run(t.id,admin)->'reporting')||jsonb_build_object('schedule_name',(select name from public.procurement_schedules where id=t.schedule_id)) end order by t.created_at desc,t.id),'[]') into total,items from page t;
 elsif p_read='steps' then
  if not admin then raise exception using errcode='42501',message='Admin required';end if;
  if f ? 'sequences' then if f->>'sequences' !~ '^\d{1,18}(,\d{1,18}){0,49}$' or f ? 'cursor' then raise exception 'Invalid step selection';end if;seqs=string_to_array(f->>'sequences',',')::bigint[];end if;
  if f ? 'cursor' then if f->>'cursor' !~ '^\d{1,18}$' then raise exception 'Invalid step cursor';end if;cursor_id=(f->>'cursor')::bigint;end if;
  if not exists(select 1 from public.procurement_triggers where id=p_id) then raise exception 'Run unavailable';end if;
  with selected as (select s.* from public.procurement_workflow_steps s where trigger_id=p_id and (cursor_id is null or sequence>cursor_id) and (seqs is null or sequence=any(seqs)) order by sequence limit lim+1),page as (select * from selected order by sequence limit lim)
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'sequence',s.sequence,'request_id',s.request_id,'job_id',s.job_id,'task_id',s.task_id,'source_id',s.source_id,'county_id',s.county_id,'phase',s.phase,'state',s.state,'execution',s.execution,'origin',s.origin,'actor_id',s.actor_id,
   'reason',case when s.reason in ('manual','deterministic','registered_source') then s.reason else 'saved_step' end,'started_at',s.started_at,'finished_at',s.finished_at,'diagnostic_id',case when s.diagnostic_id::text ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then s.diagnostic_id else null end,
   'source_name',(select name from public.procurement_sources where id=s.source_id),'usage',public.procurement_saved_usage(p_id,s.id),
   'summary',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(s.summary,'{}')) where key in ('pages','records','inserted','existing_preserved','results_count') and jsonb_typeof(value)='number' and value::text ~ '^\d+$' or key='outcome' and value#>>'{}' in ('captured','blocked','partial','outcome_unknown','unchanged','changed','new')),'{}')) order by s.sequence),'[]'),
   'next_cursor',case when seqs is null and (select count(*) from selected)>lim then max(s.sequence)::text else null end) into result from page s;
  return result;
 elsif p_read in ('activity','events','occurrences') then
  if not exists(select 1 from public.procurement_schedules where id=p_id) then raise exception 'Schedule unavailable';end if;
  if p_read='activity' then
   if coalesce(f->>'kind','') not in ('','run','attempt') or coalesce(f->>'attempt_state','') not in ('','queued','skipped','blocked') then raise exception 'Invalid activity filters';end if;
   with filtered as materialized (
    select a.* from public.procurement_schedule_activity a where schedule_id=p_id
    and (run_created_at is null or run_created_at<=boundary) and (occurrence_created_at is null or occurrence_created_at<=boundary)
    and (coalesce(f->>'kind','')='' or f->>'kind'='run' and kind='run' or f->>'kind'='attempt' and kind<>'run')
    and (coalesce(f->>'attempt_state','')='' or kind<>'run' and outcome=f->>'attempt_state')
    and (coalesce(f->>'run','')='' or kind='run' and trigger_id::text=f->>'run')
    and (coalesce(f->>'target','')='' or kind='run' and target_kind=f->>'target')
    and (coalesce(f->>'origin','')='' or kind='run' and origin=f->>'origin')
    and (coalesce(f->>'outcome','')='' or kind='run' and outcome=f->>'outcome')
    and (coalesce(f->>'geography','')='' or kind='run' and (f->>'geography'='05' and target_kind in ('state_source','sam') or config->'county_ids' ? (f->>'geography')))
    and (from_at is null or activity_at>=from_at) and (through_at is null or activity_at<through_at)
   ),page as (select * from filtered order by activity_at desc,id offset off limit lim)
   select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object('id',a.id,'activity_at',a.activity_at,'kind',a.kind,
    'run',case when a.kind='run' then public.procurement_saved_run(a.trigger_id,admin)->'reporting' else null end,
    'occurrence',public.procurement_saved_occurrence(a.occurrence),'clock_basis',case when a.kind='run' then 'Run creation date' when a.occurrence->>'effective_at' is not null then 'Effective date' when a.occurrence->>'due_at' is not null then 'Due date' else 'Attempt creation date' end) order by a.activity_at desc,a.id),'[]') into total,items from page a;
  elsif p_read='occurrences' then
   select count(*) into total from public.procurement_schedule_occurrences where schedule_id=p_id;
   select coalesce(jsonb_agg(public.procurement_saved_occurrence(to_jsonb(o))||jsonb_build_object('run',case when o.trigger_id is null then null else public.procurement_saved_run(o.trigger_id,admin)->'reporting' end) order by o.created_at desc,o.id),'[]') into items
   from (select * from public.procurement_schedule_occurrences where schedule_id=p_id order by created_at desc,id offset off limit lim) o;
  else
   select count(*) into total from public.procurement_schedule_events where schedule_id=p_id;
   select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'actor_id',e.actor_id,'actor_label',(select nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'') from public.profiles p where p.user_id=e.actor_id),
    'action',case when e.action in ('created','edited','pause','resume','archive','delete','owner_inactive','queued','skipped','blocked') then e.action else 'saved_event' end,'version',e.version,'at',e.at,
    'changes',case when e.summary#>>'{audit,version}'='1' and jsonb_typeof(e.summary#>'{audit,changes}')='array' then (select coalesce(jsonb_agg(jsonb_build_object('field',c->'field','before',public.procurement_saved_audit_value(c->'before'),'after',public.procurement_saved_audit_value(c->'after'))),'[]') from jsonb_array_elements(e.summary#>'{audit,changes}') c where c->>'field'=any(array['name','frequency','timezone','local_times','weekdays','month_day','categories','window_policy','maintain_sources','check_updates','state_trigger_ids','enabled','archived_at','deleted_at','blocker'])) else null end,
    'summary',jsonb_build_object('occurrence_id',case when e.summary->>'occurrence_id' ~* '^[a-f0-9-]{36}$' then e.summary->'occurrence_id' else null end,'reason',case when e.summary->>'reason' in ('scope_changed','scope_unavailable','owner_inactive','previous_run_active','trigger_enqueue_failed') then e.summary->>'reason' when e.summary->>'reason' is null then null else 'saved_reason' end)) order by e.at desc,e.id),'[]') into items
   from (select * from public.procurement_schedule_events where schedule_id=p_id order by at desc,id offset off limit lim) e;
  end if;
 else raise exception 'Unsupported saved read';
 end if;
 return jsonb_build_object('items',items,'total',total,'next_offset',case when off+lim<total then off+lim else null end,'as_of',boundary,'basis','Run creation date · America/Chicago');
end $$;
revoke all on function public.procurement_saved_timestamp(text),public.procurement_saved_config(jsonb),public.procurement_saved_audit_value(jsonb,integer),public.procurement_saved_occurrence(jsonb),public.procurement_saved_schedule(uuid,boolean),public.procurement_scheduling_read(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.procurement_scheduling_read(text,uuid,jsonb) to authenticated;
commit;
