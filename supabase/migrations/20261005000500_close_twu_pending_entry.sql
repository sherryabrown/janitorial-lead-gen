-- Close the one already queued entry check created before the access block was saved.
begin;

update public.procurement_jobs
set state = 'blocked'
where id = '66c49e3f-db85-4ddc-809e-9bb4fdb7aa37'
  and task_id = '7ea633ff-781b-431f-b8dc-9e8b9ecb2aff'
  and search_request_id = 'aa68b201-9fc3-448c-a212-da94b5610fc4'
  and state = 'pending';

update public.procurement_coverage_tasks
set state = 'blocked',
    reason = 'Official TWU entry returned a Cloudflare HTTP 403 to the public-fetch method; reverify access before retry',
    evidence = evidence || '{"access_status":"blocked","upstream_status":403,"source_method":"public-fetch"}'::jsonb
where id = '7ea633ff-781b-431f-b8dc-9e8b9ecb2aff'
  and source_id = '6706d1e1-c962-598d-a130-5192b9af52d5'
  and state = 'unchecked';

commit;
