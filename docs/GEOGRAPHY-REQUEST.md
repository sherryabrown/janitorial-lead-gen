# Chat-initiated Arkansas geography requests

Phase 1 resolves geography and routes only. It does not collect leads, sign in to portals, or import records. Apply `20261002000100_arkansas_municipality_routing.sql` to the configured Supabase project, then import a reviewed Arkansas GIS municipality manifest before using the live request command. The municipality list comes from the Arkansas GIS Office's incorporated municipal boundary layer. County associations come from its county boundary layer. Census place rows and IDs remain for existing references but are excluded from request selection; `spin_geography` and ZIPs are not used.

Run `node scripts/sync-arkansas-municipalities.mjs fetch OUTPUT.json` to fetch the GIS data and inspect the complete municipality list and any multi-county interior overlaps. The county query excludes boundary-only contact. Use `node scripts/review-arkansas-municipalities.mjs OUTPUT.json` for a read-only comparison against legacy Census links. The output file must be reviewed before running `node scripts/sync-arkansas-municipalities.mjs apply REVIEWED.json`. The apply step is a live database write that validates the full manifest, updates municipality names and county links, and deactivates municipalities missing from the new snapshot. GIS classifications are stored separately from clean display names.

1. When the user requests a city or town, run `node scripts/geography-request.mjs preview city "Municipality Name"`. If the municipality spans counties or the name is ambiguous, ask which county and repeat with `--county "County Name"`.
2. When the user requests a county, run `node scripts/geography-request.mjs preview county "County Name"`. Show the incorporated municipalities and ask which to include or whether to check only county-level sources. Ask on every request; never reuse an earlier selection. Unincorporated communities are covered through county and state routes for now.
3. After the user answers, create a new JSON input file using the current preview's `selection_token`. For a county, set `confirmed_city_selection` to `true` and include `selected_city_ids`, including `[]` for county-only. Use actual service and search-window scopes from the user request. Then run `node scripts/geography-request.mjs create INPUT.json`.

Example county-only input (replace the token and scope with the actual preview and request):

```json
{
  "kind": "county",
  "name": "Arkansas County",
  "selected_city_ids": [],
  "selection_token": "PREVIEW_SELECTION_TOKEN",
  "confirmed_city_selection": true,
  "service_scope": { "service": "janitorial" },
  "search_windows": { "requested_at": "CURRENT_UTC_TIME" }
}
```

The create command inserts one request and its ordered geography targets atomically, then reports known runnable methods, methods needing an adapter, and research gaps separately for forecasts, opportunities and awards. Phase 1 recognizes the existing SAM search runner; other verified methods remain `needs_implementation` until an adapter is built. Existing public source metadata is a research candidate, not proof that a runnable method or local work site is known. Phase 2 will execute known methods; Phase 3 will discover missing methods and handle access. If a source row is present but its method is stale, it remains a research gap.

The existing `procurement-workflow.mjs register` package can now include optional `capabilities` entries. Each entry names an existing or newly registered `source_code`, an active `route_geography_id`, category (`forecast`, `opportunity`, or `award`), method, public endpoint and official entry URLs, parser version, `method_spec` with `version: 1`, verification dates and evidence. A fresh `snapshot` and `schema` include these rows and request-source associations; the existing guarded package test/apply/readback flow validates their writes. Historical URL or discovery metadata alone must not be registered as an active capability.

Use `node scripts/geography-request.mjs --help` for command details. Credentials and ZIPs do not belong in input files or chat.
