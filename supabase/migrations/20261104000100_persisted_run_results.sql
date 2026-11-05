begin;
-- Original job receipts remain authoritative. These are replaceable current projections.
alter table public.procurement_triggers add column reporting_source_version bigint not null default 0;
create table public.procurement_run_results (
 trigger_id uuid primary key references public.procurement_triggers(id),
 source_version bigint not null, revision text not null,
 generated_at timestamptz not null default now(), last_attempt_at timestamptz,
 result jsonb not null check(jsonb_typeof(result)='object')
);
create table public.procurement_run_result_members (
 trigger_id uuid not null references public.procurement_run_results(trigger_id),
 lead_id uuid not null, revision text not null,
 outcome text not null check(outcome in ('added','updated','unchanged')),
 categories text[] not null check(categories <@ array['forecast','opportunity','award']),
 historical boolean not null,
 canonical_aliases uuid[] not null default '{}',
 primary key(trigger_id,lead_id)
);
alter table public.procurement_run_results enable row level security;
alter table public.procurement_run_result_members enable row level security;
revoke all on public.procurement_run_results,public.procurement_run_result_members from public,anon,authenticated;
grant all on public.procurement_run_results,public.procurement_run_result_members to service_role;

-- Invalidation only, never collection or report computation under an import write.
create function public.procurement_invalidate_run_result() returns trigger
language plpgsql security definer set search_path='' as $$
declare request_ids uuid[];
begin
 if tg_table_name='procurement_triggers' then
  if old.state is distinct from new.state or old.config is distinct from new.config then
   new.reporting_source_version=old.reporting_source_version+1;
  end if;
  return new;
 elsif tg_table_name='procurement_trigger_requests' then
  update public.procurement_triggers set reporting_source_version=reporting_source_version+1
   where id in (select trigger_id from (select case when tg_op<>'INSERT' then old.trigger_id end trigger_id
    union select case when tg_op<>'DELETE' then new.trigger_id end) s where trigger_id is not null);
 elsif tg_table_name='procurement_usage_ledger' then
  if (tg_op='INSERT' and new.state in ('reserved','outcome_unknown')) or (tg_op='DELETE' and old.state in ('reserved','outcome_unknown'))
   or (tg_op='UPDATE' and (old.state in ('reserved','outcome_unknown') or new.state in ('reserved','outcome_unknown')) and old.state is distinct from new.state) then
   update public.procurement_triggers set reporting_source_version=reporting_source_version+1
    where id=case when tg_op='DELETE' then old.trigger_id else new.trigger_id end;
  end if;
 elsif tg_table_name='procurement_jobs' then
  if tg_op='UPDATE' and old.search_request_id is not distinct from new.search_request_id
   and old.state is not distinct from new.state
   and jsonb_build_array(old.checkpoint->'stage',old.checkpoint->'automatic',old.checkpoint->'receipt',old.checkpoint->'reporting_records',old.checkpoint->'county_records',old.checkpoint->'automatic_completed')
    is not distinct from jsonb_build_array(new.checkpoint->'stage',new.checkpoint->'automatic',new.checkpoint->'receipt',new.checkpoint->'reporting_records',new.checkpoint->'county_records',new.checkpoint->'automatic_completed') then return new; end if;
  request_ids=array[case when tg_op<>'INSERT' then old.search_request_id end,case when tg_op<>'DELETE' then new.search_request_id end];
  update public.procurement_triggers set reporting_source_version=reporting_source_version+1
   where id in (select trigger_id from public.procurement_trigger_requests where request_id=any(request_ids));
 end if;
 return null;
end $$;
revoke all on function public.procurement_invalidate_run_result() from public,anon,authenticated;
create trigger procurement_run_result_state before update of state,config on public.procurement_triggers
 for each row execute function public.procurement_invalidate_run_result();
create trigger procurement_run_result_children after insert or update or delete on public.procurement_trigger_requests
 for each row execute function public.procurement_invalidate_run_result();
create trigger procurement_run_result_jobs after insert or update of state,checkpoint,search_request_id or delete on public.procurement_jobs
 for each row execute function public.procurement_invalidate_run_result();
create trigger procurement_run_result_holds after insert or update of state or delete on public.procurement_usage_ledger
 for each row execute function public.procurement_invalidate_run_result();

create function public.procurement_pending_run_results(p_limit integer default 5) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_limit<1 or p_limit>100 then raise exception 'Invalid result batch';end if;
 return coalesce((select jsonb_agg(s.id) from (
  select t.id from public.procurement_triggers t left join public.procurement_run_results r on r.trigger_id=t.id
  where t.reporting_source_version>0 and (r.source_version is null or r.source_version<>t.reporting_source_version)
   and (t.state not in ('pending','running') or r.result->>'complete'='true' or exists(select 1 from public.procurement_trigger_requests c join public.procurement_jobs j on j.search_request_id=c.request_id
    where c.trigger_id=t.id and j.checkpoint#>>'{receipt,verified}'='true' and (r.generated_at is null or j.updated_at>r.generated_at)))
  order by r.last_attempt_at asc nulls first,t.updated_at,t.id limit p_limit) s),'[]'::jsonb);
end $$;
-- An invalid historical result must not starve newer completed runs in a batch.
create function public.procurement_defer_run_result(p_trigger uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.procurement_run_results(trigger_id,source_version,revision,result,last_attempt_at)
 select id,-1,repeat('0',64),'{}'::jsonb,clock_timestamp() from public.procurement_triggers where id=p_trigger
 on conflict(trigger_id) do update set last_attempt_at=excluded.last_attempt_at;
$$;
create function public.procurement_publish_run_result(p_trigger uuid,p_source_version bigint,p_revision text,p_result jsonb,p_members jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version bigint; current_revision text; member_count integer;
begin
 select reporting_source_version into current_version from public.procurement_triggers where id=p_trigger for update;
 if not found then raise exception 'Run unavailable';end if;
 if current_version<>p_source_version then raise exception using errcode='40001',message='Run results changed';end if;
 if p_revision !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_result)<>'object' or jsonb_typeof(p_members)<>'array' or jsonb_array_length(p_members)>=10000 then raise exception 'Invalid run result';end if;
 select revision into current_revision from public.procurement_run_results where trigger_id=p_trigger;
 if current_revision=p_revision and exists(select 1 from public.procurement_run_results where trigger_id=p_trigger and source_version=current_version) then
  return jsonb_build_object('revision',p_revision,'replayed',true);
 end if;
 insert into public.procurement_run_results(trigger_id,source_version,revision,result) values(p_trigger,current_version,p_revision,p_result)
 on conflict(trigger_id) do update set source_version=excluded.source_version,revision=excluded.revision,result=excluded.result,generated_at=now();
 delete from public.procurement_run_result_members where trigger_id=p_trigger;
 insert into public.procurement_run_result_members(trigger_id,lead_id,revision,outcome,categories,historical,canonical_aliases)
 select p_trigger,(m->>'id')::uuid,p_revision,m->>'outcome',array(select jsonb_array_elements_text(m->'categories')),
  (m->>'historical')::boolean,array(select jsonb_array_elements_text(coalesce(m->'canonical_aliases','[]'))::uuid)
 from jsonb_array_elements(p_members) m;
 get diagnostics member_count=row_count;
 return jsonb_build_object('revision',p_revision,'members',member_count,'replayed',false);
end $$;
revoke all on function public.procurement_pending_run_results(integer) from public,anon,authenticated;
revoke all on function public.procurement_defer_run_result(uuid) from public,anon,authenticated;
revoke all on function public.procurement_publish_run_result(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.procurement_pending_run_results(integer),public.procurement_publish_run_result(uuid,bigint,text,jsonb,jsonb) to service_role;
grant execute on function public.procurement_defer_run_result(uuid) to service_role;
commit;
