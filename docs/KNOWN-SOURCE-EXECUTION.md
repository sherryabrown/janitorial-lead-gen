# Phase 2: known Arkansas source checks

The runner accepts an existing, confirmed geography request UUID. It reads its ordered city/county/state targets. Verified SAM opportunity/award capabilities use `sam-search`. Verified public page and document capabilities use `public-fetch`. Registered sources with a mapped geography and a public listing URL also get one `source_entry` check per request. This checks the recorded entry point and saves evidence; it does **not** prove forecast, opportunity, or award coverage. Missing category methods are `method_missing`, separately from `source_missing`. No discovery or signup runs here.

1. Apply `supabase/migrations/20261002000200_known_source_execution.sql` followed by `20261002000300_public_source_checks.sql`, and deploy the updated `sam-search` Edge function after review.
2. Register a verified capability on the exact `route_geography_id` with a bounded `method_spec`, for example `{"version":1,"runner_id":"sam-search","page_size":100,"max_pages":3,"query_defaults":{"q":"cleaning"}}` for SAM awards. Evidence, verification expiry, and parser version are required. The request needs `search_windows.award` or `.opportunity` with ISO `from` and `to` dates.
3. For a verified public listing or document set, register a route-specific capability with `method` `browser` or `document`, `method_spec` such as `{"version":1,"runner_id":"public-fetch","check_when":"each_request","urls":["https://official.example.gov/procurement/"],"allowed_hosts":["official.example.gov"],"max_bytes":2000000}`, plus current access evidence, expiry, and parser version. Fixed URLs are checked once per user request; list every required document URL to claim the document set was captured. JavaScript-only, authenticated, or larger sources remain partial/blocked until a verified method exists.
4. Run `node scripts/known-source-run.mjs plan REQUEST_UUID` and inspect `known`, `entry_checks`, `gaps`, and `blocked`. Repeating this command keeps existing jobs and coverage. Registered listing URLs are used only on matching mapped city/county/state routes, once per source per request. Historical lead-detail URLs, raw API endpoints, and fixed PDF artifacts are excluded from automatic entry checks.
5. Run `node scripts/known-source-run.mjs run REQUEST_UUID`. For a bounded verification of one registered public source, add `--source=SOURCE_CODE`; other pending jobs stay pending. Each SAM or public URL request is audited before fetching. SAM captures are saved under `outputs/known-source/REQUEST_UUID/`; public response bytes are saved privately in `procurement_public_captures`, linked to the run. A successful public fetch records URL, time, content type, hash, method version and `needs_interpretation`. It never means zero leads. Repeating the command reuses confirmed pages. An unconfirmed page requires inspection; a 429 permits another bounded attempt on the next invocation.
6. Review SAM observations in `procurement_source_observations`. For chosen SAM run IDs, create a scope file with `{"project_ref":"zreplhkoxswtzxlchtjf","run_ids":["..."],"allow_partial":false,"routed":true}`. Run `node scripts/procurement-workflow.mjs stage SCOPE.json outputs/known-source/REQUEST_UUID RECEIPT.json --confirm-stage`. This stages only new or changed SAM observations; it never imports a lead. Public captures await interpretation and the existing reviewed manual intake path; they are not silently parsed or staged.
7. Use `procurement-workflow.mjs` `snapshot`, `schema`, `init` or a filled review, `prepare`, `test`, and `apply` with its existing approval hash, then inspect the readback receipt. Unselected or uncertain records remain pending.

### Read a public capture and the remaining gaps

From this repository, use the chat/CLI review path; it reads the database and writes private, Git-ignored local review files:

```powershell
node scripts/known-source-review.mjs report REQUEST_UUID
node scripts/known-source-review.mjs capture REQUEST_UUID RUN_UUID
```

`report` shows the current city/county/state category gaps and completed entry checks. `capture` verifies the saved bytes against the audit hash, then writes a readable Markdown summary and a raw companion file under `outputs/known-source/REQUEST_UUID/`. HTML text and links are shown when present; a JavaScript-rendered page may have little saved visible text, so use its official URL for browser review. A PDF is exported intact for viewing. These commands do not classify leads, mark coverage complete, or stage intake. An entry check remains distinct from a verified forecast, opportunity, or award method.

For the October 2 Texarkana request, the TASD School Board Resources capture is run `c144e654-3a33-42ef-a0d7-93ed96e60d11`. Its saved HTML has little visible text and is an entry check only. The report initially classified nine gaps: three Texarkana category methods missing, three Miller County categories with no mapped county source, and three Arkansas state category methods missing. Miller County research belongs to Phase 3; the nine unmapped registry sources in the broader audit concern Little Rock area agencies and must not be assigned to Miller County without evidence.

### Verified Arkansas state SAM methods

The source specific `verify-sam-methods.mjs` command validates a current, complete Arkansas/NAICS 561720 opportunity run and award run against the registered SAM sources. Its default is a read-only preview; `--apply` registers those two state-route capabilities and reads them back. It does not confer city or county work-location coverage.

```powershell
node scripts/verify-sam-methods.mjs OPPORTUNITY_RUN_UUID AWARD_RUN_UUID
node scripts/verify-sam-methods.mjs OPPORTUNITY_RUN_UUID AWARD_RUN_UUID --apply
node scripts/known-source-run.mjs plan REQUEST_UUID
```

On October 2, the verified opportunity run `6d8a9fd1-a05d-4360-93df-f8915b06ea69` and award run `3e12d1f7-b27f-4846-a0a4-249c3c71e1c8` registered two capabilities on geography `05`, expiring November 1. Routed opportunity run `4d00a5f3-2601-4b23-8dcf-6188ca781d37` returned one record that still needs work-site and service review before intake; routed award run `f5d3180e-0002-47b1-94ec-c5b4ac57b9e5` returned a complete zero for its exact query.

### Verified public category methods

Two saved, audited entry captures also support narrow state category methods: `ariba` has an Office of State Procurement current-solicitation table, while `state-contracts` has a published contract reference table. Both require interpretation and linked-document review; the contract table alone does not prove an executed award. `verify-public-methods.mjs` validates their saved bytes, page identity and visible rows, then registers versioned `public-fetch` methods with explicit scope limits:

```powershell
node scripts/verify-public-methods.mjs BID_ENTRY_RUN_UUID CONTRACT_ENTRY_RUN_UUID
node scripts/verify-public-methods.mjs BID_ENTRY_RUN_UUID CONTRACT_ENTRY_RUN_UUID --apply
```

Entry runs `2baf6233-34cc-4564-89e1-e51040ef87f5` and `19688049-50fd-450a-b9b4-dd5a8f8ce061` verified the two pages. Routed category runs `10ee6f20-89d2-4f21-9932-84a09face03e` (opportunity) and `550aa49c-7527-436c-ab0c-1d8b787bb4e5` (contract reference) both ended `needs_interpretation`, with one saved page each. Use `known-source-review.mjs capture` on either run to see a readable table and exact page hash. Their methods expire November 1.

The current Texarkana request has four verified state category checks and seven route/category gaps: three Texarkana methods, three Miller County source categories, and the Arkansas forecast method. These are aggregate route/category gaps, **not** a count of every unverified source/category pair. The prior `*:missing` task rows are historical placeholders; use the fresh `report`/`plan` output for current gaps. Individual registered sources still require category method review before their coverage can be claimed.

The SAM adapter maps Arkansas work state and the reviewed service filter to a dated API window. A complete zero result needs a recognized terminal response. Each route retains page count, result count, run IDs, and coverage state. The runner stops at its verified page bound and marks partial coverage. `procurement_source_observations` keeps every distinct SAM source identity and payload hash; identical hashes do not become new intake candidates. Public captures retain each response version privately for later interpretation; equal URL and hash is marked unchanged.

## Registered source audit (October 2, 2026)

Read-only registry inspection found 38 sources and no registered verified capabilities. Twenty-three have mapped geography and a public listing URL eligible for an entry-point check. Nine have no geography mapping, so the planner cannot safely assign them to a requested city/county/state. Six mapped records are SAM/USAspending API entries or historical detail/PDF URLs, which need their own verified method. These counts describe registry eligibility, not current successful retrieval or completed category coverage. The prior local ledger and `verified-methods.md` retain historical retrieval evidence; they do not automatically authorize a current working method.
