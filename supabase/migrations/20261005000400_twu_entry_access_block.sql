-- Avoid repeating a known Cloudflare challenge on every geography request.
-- The dated block expires so access can be retried and reverified later.
begin;

update public.procurement_sources
set config = jsonb_set(config, '{known_source_research,entry_access}',
  '{"status":"blocked","method":"public-fetch","checked_at":"2026-10-05T00:00:00Z","valid_until":"2026-11-04T00:00:00Z","reason":"Cloudflare HTTP 403 on bounded live check","request_id":"aa68b201-9fc3-448c-a212-da94b5610fc4","task_id":"acc3ba0c-29f8-4aca-bdbd-ee10f6b75d76"}'::jsonb, true)
where id = '6706d1e1-c962-598d-a130-5192b9af52d5';

commit;
