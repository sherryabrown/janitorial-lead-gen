begin;
-- Existing active leases may finish. Only unclaimed/expired collection and
-- research work is stopped; imports, reconciliation and unrelated sources run.
create function public.procurement_block_excluded_source_jobs() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.procurement_action_requests where checks_excluded) then return; end if;
 update public.procurement_jobs j set state='blocked',lease_token=null,lease_until=null,
   checkpoint=j.checkpoint||jsonb_build_object('source_check_excluded',true,
     'blocker','Not checked by admin decision'),updated_at=now()
 where j.kind in ('collect','discover') and
   (j.state in ('pending','partial') or j.state='running' and j.lease_until<now())
   and public.procurement_source_check_excluded(coalesce(j.task_id,
     case when j.checkpoint->>'task_id' ~ '^[a-f0-9-]{36}$' then (j.checkpoint->>'task_id')::uuid end));
end $$;
alter function public.claim_procurement_known_job(uuid) rename to claim_procurement_known_job_before_source_review;
create function public.claim_procurement_known_job(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.procurement_block_excluded_source_jobs();
 return public.claim_procurement_known_job_before_source_review(p_job_id);
end $$;
alter function public.claim_procurement_workflow_job_before_admin() rename to claim_procurement_workflow_job_before_source_review;
create function public.claim_procurement_workflow_job_before_admin() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.procurement_block_excluded_source_jobs();
 return public.claim_procurement_workflow_job_before_source_review();
end $$;
revoke all on function public.procurement_block_excluded_source_jobs(),
 public.claim_procurement_known_job_before_source_review(uuid),
 public.claim_procurement_workflow_job_before_source_review() from public,anon,authenticated,service_role;
revoke all on function public.claim_procurement_known_job(uuid),
 public.claim_procurement_workflow_job_before_admin() from public,anon,authenticated;
grant execute on function public.claim_procurement_known_job(uuid),
 public.claim_procurement_workflow_job_before_admin() to service_role;
commit;
