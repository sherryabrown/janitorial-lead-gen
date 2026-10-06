begin;
create or replace function public.record_procurement_browser_capture(
  p_handoff_id uuid,p_job_id uuid,p_lease_token uuid,p_method_spec jsonb,p_kind text,
  p_pages jsonb,p_terminal boolean,p_terminal_evidence text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare h public.procurement_access_handoffs%rowtype; j public.procurement_jobs%rowtype;
  c public.procurement_source_capabilities%rowtype; item jsonb; index integer:=0; ids jsonb:='[]'; existing public.procurement_public_captures%rowtype;
begin
  select * into h from public.procurement_access_handoffs where id=p_handoff_id for update;
  if not found or h.channel is distinct from 'portal' or h.lifecycle->'account'->>'kind' is distinct from 'user_session'
    or h.lifecycle->'stages'->'sign_in'->>'state' is distinct from 'verified'
    or h.lifecycle->'stages'->'sign_in'->>'provenance' is distinct from 'observed'
    or coalesce((h.lifecycle->'stages'->'sign_in'->>'verified_until')::timestamptz,'-infinity')<=now() then
    raise exception 'Current observed portal sign-in required';
  end if;
  if p_kind not in ('forecast','opportunity','award') or p_method_spec->>'runner_id'<>'authenticated-browser'
    or p_method_spec->>'access_handoff_id' is distinct from h.id::text
    or jsonb_typeof(p_pages)<>'array' or jsonb_array_length(p_pages) not between 1 and 20
    or coalesce(p_terminal_evidence,'')='' then raise exception 'Bounded reviewed browser method required'; end if;
  if p_job_id is not null then
    select * into j from public.procurement_jobs where id=p_job_id for update;
    if not found or j.state<>'running' or j.lease_token is distinct from p_lease_token or j.lease_until<=now() then
      raise exception 'Current browser job lease required'; end if;
    select * into c from public.procurement_source_capabilities where id=j.capability_id;
    if not found or c.source_id<>h.source_id or c.kind<>p_kind or c.availability<>'active'
      or c.verified_until<=now() or c.method_spec<>p_method_spec
      or not exists(select 1 from public.procurement_coverage_tasks t where t.id=j.task_id and t.source_id=h.source_id and t.capability_id=c.id and t.kind=p_kind) then
      raise exception 'Browser capability/source/task mismatch'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_pages) loop
    if not (p_method_spec->'urls' ? (item->>'url'))
      or length(decode(item->>'content_base64','base64')) not between 1 and least(2000000,(p_method_spec->>'max_bytes')::integer)
      or item->>'content_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid browser capture'; end if;
    select * into existing from public.procurement_public_captures where run_id=(item->>'run_id')::uuid;
    if found then
      if existing.source_id<>h.source_id or existing.content_sha256<>item->>'content_sha256' then raise exception 'Capture identity conflict'; end if;
      raise exception 'Capture already saved; reconcile before a new attempt';
    end if;
    insert into public.procurement_runs(id,source_id,job_id,coverage_task_id,page_index,page_attempt,started_at,finished_at,status,record_count,detail)
    values((item->>'run_id')::uuid,h.source_id,p_job_id,j.task_id,case when p_job_id is null then null else index end,coalesce(j.attempts,0),
      (item->>'retrieved_at')::timestamptz,now(),'review_required',0,
      jsonb_build_object('collector','authenticated-browser','state','content_saved','upstream_status',200,
        'kind',p_kind,'verification',p_job_id is null,'access_handoff_id',h.id,'method_spec',p_method_spec,
        'requested_url',item->>'url','final_url',item->>'url','content_sha256',item->>'content_sha256',
        'terminal_confirmed',p_terminal,'terminal_evidence',p_terminal_evidence));
    insert into public.procurement_public_captures(run_id,source_id,requested_url,final_url,content_type,content_sha256,content_base64,retrieved_at)
    values((item->>'run_id')::uuid,h.source_id,item->>'url',item->>'url',item->>'content_type',item->>'content_sha256',item->>'content_base64',(item->>'retrieved_at')::timestamptz);
    ids:=ids||jsonb_build_array(item->>'run_id');index:=index+1;
  end loop;
  if p_job_id is not null then
    if not public.finish_procurement_known_job(p_job_id,p_lease_token,case when p_terminal then 'succeeded' else 'partial' end,
      case when p_terminal then 'needs_interpretation' else 'partial' end,jsonb_build_object('next_page',index,'run_ids',ids),
      jsonb_build_object('runner','authenticated-browser','run_ids',ids,'pages_confirmed',index,'terminal_confirmed',p_terminal,
        'terminal_evidence',p_terminal_evidence,'interpretation','pending'),index,0,null) then raise exception 'Browser lease expired; transaction cancelled'; end if;
  end if;
  return jsonb_build_object('status','saved','run_ids',ids,'pages',index,'terminal_confirmed',p_terminal,'interpretation','pending');
end $fn$;
revoke all on function public.record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text) to service_role;
commit;
