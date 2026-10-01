# Existing runner and approved persistence

The research method works without this particular repository. These command paths describe the user's current installation, not a portable or auto-deployed integration. If missing, ask for its location and continue authorized public research; do not silently rebuild an app/backend.

Repository: `C:/Users/sherr/janitorial-lead-gen`. Read its current `docs/PROCUREMENT-WORKFLOW.md` fully before processing data; it is the maintained detailed contract. The original Python CLI at `C:/Users/sherr/Documents/Codex/2026-09-09/browser-plugin-browser-openai-bundled-the/outputs/lead-discovery-cli/lead_discovery.py` forwards the same workflow:

```powershell
node scripts/procurement-workflow.mjs help
python C:/Users/sherr/Documents/Codex/2026-09-09/browser-plugin-browser-openai-bundled-the/outputs/lead-discovery-cli/lead_discovery.py workflow --repo C:/Users/sherr/janitorial-lead-gen help
```

## API retrieval

For systematic API discovery, signup and durable source/access status, read [api-access-and-tracking.md](api-access-and-tracking.md). Load the local access ledger before new applications; preserve sources even when this runner cannot retrieve them. Its access states are separate from this CLI's batch `status`, intake status and canonical import receipts. Actionable setup handoffs use [signup-alerts.md](signup-alerts.md), without changing the runner or importing tracking records into Supabase.

`scripts/sam-search.mjs opportunities|awards FILTERS_JSON` makes one request through the existing private Supabase function. The SAM key stays in Supabase; the local trusted runner uses the already authenticated management CLI to obtain server authorization in memory. Never ask the user to move the key to `.env`, expose it in chat, or embed it in the frontend.

Check the current official API documentation and runner allowlist for query fields/limits; do not invent a city/county filter. Save explicit dates/filters and run IDs, check actual upstream status/envelope and every page. Nonzero CLI exit may mean partial results were saved, not no results. Resolve quota/access/parser problems before retrying; inspect the saved audit after timeouts.

SAM endpoints previously verified:

- Opportunities: `https://api.sam.gov/opportunities/v2/search`.
- Awards: `https://api.sam.gov/contract-awards/v1/search`.
- Official documentation starting points: `https://open.gsa.gov/api/get-opportunities-public-api/` and `https://open.gsa.gov/api/contract-awards/`.

USAspending's earlier collector lives in the research package, not the SAM runner. Inspect its current help/config and official endpoint documentation before reuse. Do not accidentally invoke a combined collection/load command for a search-only task. Forecast documents use their verified public/browser path; no forecast API is implemented here.

## Important city/county limitation — tell the user before processing

The generic batch review has a **state-level** `work_state` check. It does not automatically establish city limits, county membership or a travel-radius match. For a new Arkansas jurisdiction, verify actual facilities/addresses and the applicable search request. Explain that city/county filtering and request matching need this additional evidence review. Do not relabel statewide rows as local or reuse the original statewide request ID by habit.

The project is pinned to `zreplhkoxswtzxlchtjf`. Use the reviewed `register` package to create/reuse sources and actual geographic requests under established application-persistence authority; see [database-persistence.md](database-persistence.md). Do not ask for routine authority again, substitute an unrelated statewide request, or replay seed SQL.

## Separate steps and their effects

- `init`, `inventory`, `prepare`, `test`, `status`, `verify`: local files/tests. Verification of saved files is not a fresh live read.
- `snapshot`, `schema`: read-only live access and private local files.
- `stage ... --confirm-stage`: authorized SAM-capture intake insertion only; existing intake is not overwritten. It does not stage arbitrary forecast/PDF extracts automatically.
- Manual forecasts/local sources: use `stage-manual`, test/apply/read back intake, then review and import primary findings with existing packages; defer secondary candidates. Retain original documents. Do not stop at local files because SAM staging cannot handle documents.
- `apply ... --approve HASH`: an authorized canonical transaction followed by live readback. Requires exact reviewed package hash, matching offline tests and unchanged schema. The existence of this command is not approval to run it.

A new reviewed batch supplies its own run IDs, request ID, payload-bound process/defer decisions and explicit new-lead approvals. Keep packages under the ignored private output directory, not in this skill. Check new source truth and work geography; do not reuse historical approvals or overwrite user notes/stages/owners/follow-ups. Uncertainty may remain even when intake is processed.

Upserts, intake links and processed statuses must be atomic. Preserve dedicated source columns across the existing payload-sync trigger. Missing links can be backfilled without claiming a new contract. Unknown commit outcomes require readback/reconciliation before retrying; never restore whole snapshots over later edits.

Source/request registration and manual staging/import were exercised against Supabase on September 30, 2026 with current-schema rollback/replay tests and verified live receipts. Each later batch still needs fresh evidence, schema validation and readback; previous success does not prove current source availability.

## Setup handoffs

- **CLI authorization/runtime missing:** name the required authenticated Supabase CLI, Node/Python or workspace access and the exact blocked step. Do not ask for the SAM secret in chat.
- **Offline SQL engine missing:** testing uses an installed PGlite module supplied by path. Ask for access or permission to install the dependency; do not silently skip required transaction tests.
- **Different project/schema:** deliberate adaptation and testing are required; this is not an automatic multi-project tool.
- **New city/county request or manual-source staging:** use established application-persistence authority, review source/request identities and test guarded packages. Ask only for genuinely new scope or missing information; continue independent retrieval.

After a database-only import, the published app needs a refresh if it uses that project; existing filters may hide records. Do not deploy or alter UI to demonstrate a research result.
