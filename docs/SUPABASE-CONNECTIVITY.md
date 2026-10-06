# Supabase connectivity check

Use this when a CLI request fails before changing code or source methods.

1. Confirm the configured project reference without printing credentials: `Get-Content supabase/config.toml | Select-String project_id`.
2. Check reachability: `Test-NetConnection zreplhkoxswtzxlchtjf.supabase.co -Port 443`.
3. Confirm the authenticated CLI can list projects: `npx.cmd supabase projects list`. Do not include `--reveal` or print API keys.
4. Run an existing read-only workflow report: `node scripts/known-source-workflow.mjs report REQUEST_UUID` using a confirmed request. A missing request or table is a schema/scope error; a connection or authorization error is a connectivity/access issue.

The report reads saved workflow state and writes only a local ignored gap summary. Do not call the dormant Generate function for connectivity testing.
