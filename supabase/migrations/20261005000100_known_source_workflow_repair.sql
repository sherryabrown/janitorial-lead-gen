-- Preserve interpretation history; serialize revisions and finalize receipts/tasks together.
begin;
alter table public.procurement_interpretations
  add column revision integer not null default 1,
  add column is_current boolean not null default true,
  add column supersedes_id uuid references public.procurement_interpretations(id);
with ranked as (
  select id, row_number() over(partition by task_id order by created_at,id)::integer n,
    row_number() over(partition by task_id order by created_at desc,id desc) latest
  from public.procurement_interpretations
)
update public.procurement_interpretations i set revision=r.n,is_current=(r.latest=1)
from ranked r where i.id=r.id;
alter table public.procurement_interpretations
  drop constraint procurement_interpretations_request_id_task_id_packet_hash_key,
  add constraint procurement_interpretations_revision_key unique(task_id,revision),
  add constraint procurement_interpretations_positive_revision check(revision>0);
create unique index procurement_interpretations_current_idx
  on public.procurement_interpretations(task_id) where is_current;

create function public.reserve_procurement_interpretation(
  p_request uuid,p_task uuid,p_packet text,p_hash text,p_result jsonb,p_outcome text,
  p_expected uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous public.procurement_interpretations; saved public.procurement_interpretations;
begin
  perform 1 from public.procurement_coverage_tasks t
    join public.procurement_request_targets g on g.id=t.target_id
    where t.id=p_task and g.search_request_id=p_request for update of t;
  if not found then raise exception 'Interpretation task/request mismatch'; end if;
  select * into previous from public.procurement_interpretations where task_id=p_task and is_current;
  if previous.id is not null and previous.packet_hash=p_packet and previous.result_hash=p_hash then
    return to_jsonb(previous);
  end if;
  if previous.id is distinct from p_expected then
    raise exception 'Revision conflict: current interpretation %, supply supersedes_id',previous.id;
  end if;
  if previous.id is not null and previous.staging_receipt is null then
    raise exception 'Resume unfinished interpretation % before revising',previous.id;
  end if;
  update public.procurement_interpretations set is_current=false where id=previous.id;
  insert into public.procurement_interpretations
    (request_id,task_id,packet_hash,result_hash,result,outcome,revision,supersedes_id)
    values(p_request,p_task,p_packet,p_hash,p_result,p_outcome,coalesce(previous.revision,0)+1,previous.id)
    returning * into saved;
  return to_jsonb(saved);
end $$;

create function public.finalize_procurement_interpretation(p_id uuid,p_receipt jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved public.procurement_interpretations;
begin
  select * into saved from public.procurement_interpretations where id=p_id;
  if not found then raise exception 'Interpretation missing'; end if;
  perform 1 from public.procurement_coverage_tasks where id=saved.task_id for update;
  select * into saved from public.procurement_interpretations where id=p_id;
  if not saved.is_current then raise exception 'Interpretation superseded; refresh report'; end if;
  if jsonb_typeof(p_receipt->'intake_ids') is distinct from 'array' then
    raise exception 'Staging receipt requires intake_ids';
  end if;
  update public.procurement_interpretations set staging_receipt=coalesce(staging_receipt,p_receipt)
    where id=p_id returning * into saved;
  update public.procurement_coverage_tasks set state=saved.outcome,
    results_count=jsonb_array_length(saved.result->'findings'),
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'interpretation_id',saved.id,'interpretation_revision',saved.revision,
      'interpretation_packet_hash',saved.packet_hash,'interpretation_result_hash',saved.result_hash,
      'interpretation_outcome',saved.outcome)
    where id=saved.task_id;
  return to_jsonb(saved);
end $$;
revoke all on function public.reserve_procurement_interpretation(uuid,uuid,text,text,jsonb,text,uuid)
  from public,anon,authenticated;
revoke all on function public.finalize_procurement_interpretation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_procurement_interpretation(uuid,uuid,text,text,jsonb,text,uuid) to service_role;
grant execute on function public.finalize_procurement_interpretation(uuid,jsonb) to service_role;
commit;
