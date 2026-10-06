-- The bounded live check on 2026-10-05 received Cloudflare HTTP 403.
-- Retain official-source research and run evidence; do not schedule this public-fetch method.
begin;

update public.procurement_source_capabilities
set availability = 'blocked',
    next_action = 'Cloudflare returned HTTP 403 to public-fetch; verify an authorized browser or alternate official access method before reactivation',
    verification_evidence = verification_evidence ||
      '{"live_check":{"checked_at":"2026-10-05","request_id":"aa68b201-9fc3-448c-a212-da94b5610fc4","task_id":"acc3ba0c-29f8-4aca-bdbd-ee10f6b75d76","outcome":"HTTP 403 Cloudflare challenge","method_status":"blocked"}}'::jsonb
where id = '70915bc1-f057-5241-a73b-08488d79e943'
  and source_id = '6706d1e1-c962-598d-a130-5192b9af52d5'
  and method_spec->>'runner_id' = 'public-fetch';

update public.procurement_sources
set config = jsonb_set(config, '{known_source_research,access_method}',
  '"Public listing visible in a browser; Cloudflare blocks the current server-side fetch"'::jsonb, true)
where id = '6706d1e1-c962-598d-a130-5192b9af52d5';

commit;
