# Phase 2: known Arkansas source checks

> Current request-level commands: [Single known-source workflow](#single-known-source-workflow). The source-specific notes below are historical evidence and onboarding details.

## Phase 2A: account for every registered source

Phase 2 remains open for the entire registry. Use `node scripts/known-source-review.mjs registry` to generate a read-only Markdown/JSON inventory under `outputs/known-source/registry/`. It includes every source ID and URL, geography mapping, all route/category statuses, capability IDs and verification dates, and unresolved next actions. Current validated capabilities take precedence over historical config notes; old access claims remain visible as historical evidence. The report does not overwrite registry metadata or guess agency service territories.

The October 4 verification found 38 sources, nine missing geography mappings and five verified category methods. Historical request associations are flagged for agency-coverage review; they are not work-site evidence. Phase 2A leaves the nine mappings unresolved for their agency-specific batches.

The Phase 2A migration was applied to the configured project on October 4. Replanning request `52128503-d9d1-4a3d-84c4-8bbbd84bdf6d` saved 67 source/category gaps and zero new jobs; repeating it added no rows. This counts unresolved category/route combinations, not distinct sources or verified missing feeds. The six aggregate gaps and five methods remain intact.

Request `report` now shows both aggregate gaps and individual source/category gaps, plus registry sources whose missing mapping prevents assignment to the request. `plan` persists individual missing-method tasks with stable keys, without creating collection jobs for them. One working source cannot resolve another source's gap. Apply `supabase/migrations/20261004000100_source_gap_accountability.sql` after the existing Phase 2 migrations before using the updated `plan`; it adds only a service-role reconciliation function and preserves prior tasks/runs. Verified replacement methods supersede only the same source/category/route gap; expiry reopens it while retaining its prior resolution.

A category is unresolved unless a working capability or explicit reviewed unsupported assessment exists. Future agency batches may record `config.known_source_review.category_assessments` entries with `kind`, `route_geography_id`, `status: "unsupported"`, `reason`, `evidence`, `checked_at`, and `valid_until`. Undated legacy `unchecked` notes do not prove a category is unsupported. An unsupported assessment affects current planning/reporting; historical gap rows remain retained until a verified method supersedes them. All reports distinguish method readiness from completed lead coverage.

The runner accepts an existing, confirmed geography request UUID. It reads its ordered city/county/state targets. Verified SAM opportunity/award capabilities use `sam-search`. Verified public page and document capabilities use `public-fetch`. Registered sources with a mapped geography and a public listing URL also get one `source_entry` check per request. This checks the recorded entry point and saves evidence; it does **not** prove forecast, opportunity, or award coverage. Missing category methods are `method_missing`, separately from `source_missing`. No discovery or signup runs here.

1. Apply `supabase/migrations/20261002000200_known_source_execution.sql`, `20261002000300_public_source_checks.sql`, and `20261002000400_reconcile_known_gaps.sql` in order, and deploy the updated `sam-search` Edge function after review.
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

On October 2, the verified opportunity run `6d8a9fd1-a05d-4360-93df-f8915b06ea69` and award run `3e12d1f7-b27f-4846-a0a4-249c3c71e1c8` registered two capabilities on geography `05`, expiring November 1. Routed opportunity run `4d00a5f3-2601-4b23-8dcf-6188ca781d37` returned one Tichnor award notice, reviewed as outside the Texarkana city request; routed award run `f5d3180e-0002-47b1-94ec-c5b4ac57b9e5` returned a complete zero for its exact query.

### Verified public category methods

Two saved, audited entry captures also support narrow state category methods: `ariba` has an Office of State Procurement current-solicitation table, while `state-contracts` has a published contract reference table. Both require interpretation and linked-document review; the contract table alone does not prove an executed award. `verify-public-methods.mjs` validates their saved bytes, page identity and visible rows, then registers versioned `public-fetch` methods with explicit scope limits:

```powershell
node scripts/verify-public-methods.mjs BID_ENTRY_RUN_UUID CONTRACT_ENTRY_RUN_UUID
node scripts/verify-public-methods.mjs BID_ENTRY_RUN_UUID CONTRACT_ENTRY_RUN_UUID --apply
```

Entry runs `2baf6233-34cc-4564-89e1-e51040ef87f5` and `19688049-50fd-450a-b9b4-dd5a8f8ce061` verified the two pages. Routed category runs `10ee6f20-89d2-4f21-9932-84a09face03e` (opportunity) and `550aa49c-7527-436c-ab0c-1d8b787bb4e5` (contract reference) both ended `needs_interpretation`, with one saved page each. Use `known-source-review.mjs capture` on either run to see a readable table and exact page hash. Their methods expire November 1.

### Phase 2B Arkansas state checks

The October 4 bounded request `1e834d15-6337-4356-a95b-38083c98a0ea` verifies these additional **narrow** methods. Each normal runner result remains `needs_interpretation`; a saved page is not a zero-result finding or an imported lead.

| Source | Method and limit | Routed run |
| --- | --- | --- |
| `state-intents` | Anticipation-to-award listing after the reviewed `www.arkansas.gov` → `www.ark.org` redirect; intent is not an executed award. | `26f051db-11c9-4e43-bce2-b52dfceb45ec` |
| `state-other` | Solicitation rows in the shared other-unit index only; each originating agency detail and attachment needs review. | `df764ba1-32c1-4f89-a955-b7c5cc615372` |
| `dhs` | The official current procurement-announcements table includes 505 HTML rows and closed historical notices. Review closing date, type, exact detail and amendments. The registered historical janitorial URL remains reference evidence. | `90ddd683-c114-4166-b093-fc4b709b19ce` |
| `arbuy-janitorial` | Exact S000000473 public detail/status watcher, tied to the existing canonical award lead. Its page still says intent to award; the separate signed state-contract PDF proves execution. The watcher compares visible content and document IDs so changing page scripts do not trigger a false lead update. | `5a9d9411-aba6-4911-88f1-67bc4aba1ed1`; repeat `6ad2a943-493b-4782-9628-86d8d7e99ca1` is semantically `unchanged` |
| `arbuy` | Public Open Bids view only; the empty default table is not a zero finding for historical searches. | `ad5fb88f-99f4-434d-9f5b-30993adb1cc5` |
| `ardot` | Complete 100-row paginated fiscal-year table check, bounded at 30 pages/3,000 rows. The normal run saved 25 pages and all 2,497 reported rows; linked PDFs need separate review. | First page `6a146339-df7f-4367-89f8-0ef78c7ff68c`; terminal page `13f24d4d-b052-40e3-9ade-a4887d1fde7c` |

To reproduce verification, run `node scripts/verify-state-listing.mjs state-intents RUN_UUID`, or `state-other RUN_UUID`, then add `--apply` only after reviewing the scope. `node scripts/verify-dhs-method.mjs`, `node scripts/verify-state-record.mjs`, `node scripts/verify-arbuy-open-method.mjs`, and `node scripts/verify-ardot-method.mjs` preview their live page checks; `--apply` saves each method. The ARDOT adapter also needs `supabase/migrations/20261004000200_ardot_known_adapter.sql`; it was applied to the configured project on October 4. `node scripts/reconcile-state-janitorial-source.mjs --apply` reconciles the stale source name against the already reviewed lead while preserving source ID, historical name, and local-site uncertainty. After registration, run `known-source-run.mjs plan REQUEST_UUID` and a bounded `run REQUEST_UUID --source=CODE`; use `known-source-review.mjs capture REQUEST_UUID RUN_UUID` for a saved page. `node scripts/ardot-review.mjs REQUEST_UUID` verifies every ARDOT page and shows keyword rows across the full table.

The preserved `ariba` and `state-contracts` methods also ran on this request (`025fe901-3721-4f49-85f0-0ae30dec9aa7` and `058963bf-57cd-4468-a79c-f6f546707156`). Their linked portal pages and relevant contract PDFs still need separate review on changes. The prior S000000473 signed-contract intake and tested import remain the representative reviewed handoff; no new state listing from this bounded request was imported.

`arbuy` historical search remains unresolved: its public Open Bids view is runnable, but historical query, pagination and terminal behavior are unverified. ARDOT pagination is complete for this bounded run; `ardot-review.mjs` surfaces 14 janitorial-keyword rows with 2011–2023 opening dates. Their bid/tab PDFs and any amendments require separate review before a lead or executed award can be asserted. Both source records have dated, run-linked `config.phase2b_method_status` with an agent next action. DHS final line awards and amendments remain unresolved even though its announcement index is checkable.

The Texarkana request now has five verified category checks: four Arkansas state checks and the UAHT opportunity page. Six route/category gaps remain: Texarkana forecast and award, all three Miller County categories, and Arkansas forecast. These are aggregate route/category gaps, **not** a count of every unverified source/category pair. Replanning marks older `*:missing` rows `superseded` when a current method covers them, retaining their history; if that method expires, the gap reopens. The October 2 replan superseded three historical rows and a repeat replan created no jobs or changes.

### Texarkana UAHT opportunity page

`node scripts/verify-uaht-method.mjs` previews a bounded fetch of the [official UAHT procurement page](https://www.uaht.edu/about/procurement.php); `--apply` registers the method for the existing Texarkana municipality route after checking the live page sections and readback. This covers the page's **Current Solicitations** section only. It does not claim that every UAHT notice has a Texarkana work site or that the separate **Intent to Award** section is an executed award. Run `known-source-run.mjs plan REQUEST_UUID` and then `run REQUEST_UUID --source=ua-hope-texarkana` to capture it. On October 2, category run `ef14499a-2788-407b-8699-8efea285f912` saved the page and ended `needs_interpretation`; its visible Current Solicitations section has no janitorial listing. This is not a verified zero for all UAHT procurement.

The SAM opportunity query returned notice `f7157407b8254d7fad83015fb800b683`, titled “Janitorial Services, Arkansas Post Field Office.” Its type is **Award Notice**, with a September 30 award and SAM work site **Tichnor, Arkansas**. For the Texarkana city request, the review decision is to leave it out: the statewide query and Little Rock contracting office do not prove Texarkana work. The reviewed-intake fixture exercises an explicit deferral and verifies no canonical record or request link is planned. The live record was not staged as a Texarkana candidate.

Known-source audit for the remaining six gaps: Texarkana city finance entry run `46fa6d42-1e66-4224-9f97-168b9c4912a9` shows budgets, not a solicitation or executed-award listing. The TASD board-resources saved response has too little visible content to verify a category method. UAHT's separate intent-to-award section does not prove execution. GSA entry run `77f744db-9c6e-4157-a4a7-ee0820ed3f30` links to `https://acquisitiongateway.gov/forecast`; a bounded direct fetch returned a JavaScript shell, not Arkansas forecast rows. The registered USACE FY26 PDF is a fixed artifact and direct retrieval was blocked; it is not a current, reusable statewide forecast method. Miller County has no mapped county source, which requires Phase 3 discovery. Preserve these as open gaps rather than creating category capabilities from entry pages.

### Phase 2 capture review and intake handoff

- The 12 saved `ariba` solicitation rows had no janitorial service match in their visible titles/descriptions. This is a review of the saved page, not a zero-result claim for every Ariba tenant or linked portal.
- The 97 saved state-contract rows had three janitorial/cleaning keyword matches: two supply contracts and one **Janitorial Services** contract at row 92. The readable capture now surfaces matching rows beyond its first 50. Official detail and linked PDF identify contract tracking number `4600058030`, vendor Sharp Properties dba A Sharper Image, expiration May 31, 2027, and solicitation `S000000473`. Visual review of the PDF establishes the original term June 1, 2026 through May 31, 2027 and both digital signatures (contractor May 15; state June 11). Text extraction alone missed the filled form fields. The document does not establish a Texarkana facility.
- The exact `S000000473` identifier matches existing statewide lead `04ebe88b-9152-5ed5-bef1-963e788844c6`. An initial evidence-bound intake (`787b1893-36c9-5103-ac24-3affd96644f8`) was linked to it while preserving `intent_to_award`. A linked correction intake (`915f9867-8344-576b-a7aa-656809b7ed27`) records the signed PDF and a separate reviewed package promotes the same canonical lead to `award`, retaining source history. Both handoffs passed offline rollback/replay and live readback. The correction receipt verified **zero new leads, one evidence update, one intake link, and one processed intake**. No Texarkana link was added. Receipts are in ignored `outputs/procurement-batches/phase2-finish-stage-package/`, `phase2-finish-review-package/`, `phase2-correction-stage-package/`, and `phase2-correction-review-package-v2/`.
- Manual staging now accepts the authoritative `procurement_request_sources` link when old source configuration lacks a duplicate association. Cross-source review requires primary evidence and an exact shared solicitation identifier; title or vendor resemblance cannot merge leads.

The six aggregate gaps remain Texarkana forecast and award methods, all three Miller County source categories, and the Arkansas forecast method. Known-source method work remains Phase 2 across all 38 registry rows; genuine new-source discovery and new access orchestration remain Phase 3. These six aggregate counts do not measure registry completion.

The SAM adapter maps Arkansas work state and the reviewed service filter to a dated API window. A complete zero result needs a recognized terminal response. Each route retains page count, result count, run IDs, and coverage state. The runner stops at its verified page bound and marks partial coverage. `procurement_source_observations` keeps every distinct SAM source identity and payload hash; identical hashes do not become new intake candidates. Public captures retain each response version privately for later interpretation; equal URL and hash is marked unchanged.

## Registered source audit (October 2, 2026)

The initial October 2 inspection, before method registration, found 38 sources and no verified capabilities. Twenty-three had mapped geography and a public listing URL eligible for an entry-point check; nine had no geography mapping; six mapped records were API entries or historical detail/PDF URLs. Five category methods were registered later that day and remain present in the October 4 Phase 2A audit. These counts describe registry eligibility and method readiness, not completed lead coverage. The prior local ledger and `verified-methods.md` retain historical retrieval evidence.

# Single known-source workflow

For a chat-initiated Arkansas request, preview/create the geography with `scripts/geography-request.mjs` (confirm municipalities every time for a county), then run:

```powershell
node scripts/known-source-workflow.mjs run REQUEST_UUID --source=SOURCE_CODE
node scripts/known-source-workflow.mjs report REQUEST_UUID
node scripts/known-source-workflow.mjs packet REQUEST_UUID TASK_UUID
node scripts/known-source-workflow.mjs interpret PACKET.json RESULT.json
node scripts/known-source-workflow.mjs review-template REQUEST_UUID
```

Omit `--source` to execute all pending known jobs. `run` uses saved route methods and automatically stages complete SAM captures into immutable intake. Public HTML/PDF and ARDOT captures become packets under ignored `outputs/known-source/REQUEST_UUID/`. The packet includes exact method, run, URL, hash, request scope, completeness and saved guidance. The agent reviews the packet and raw file in this chat and writes a JSON result with `version`, `packet_hash`, `reviewed_by`, `reviewed_scope`, `coverage` (`complete` or `partial`), and `findings`, `exclusions`, `unresolved` arrays. Every item cites a saved `run_id`, `locator`, and `excerpt`. Each finding also needs `record_id`, `title`, matching `classification`, `reason`, `work_location_basis`, and a payload with `source_url`. A packet with missing pages cannot be called complete; entry checks cannot be interpreted as lead coverage.

`interpret` saves the decision in private `procurement_interpretations`, then stages findings through the existing immutable manual-intake rules. If staging is interrupted, repeat the same command. Repeating a saved interpretation preserves the prior result and intake. Changed source evidence creates a new packet and can stage an amendment. `report` shows the next packet, counts and a separate file with exact source gaps. An unavailable source does not stop other known checks.

`review-template` generates intake IDs and payload hashes. Fill the reviewer, each explicit `process` or `defer` decision, reason, and any required new-lead/location decision. Then use `scripts/procurement-workflow.mjs` `snapshot`, `schema`, `prepare`, `test`, and `apply PACKAGE_DIR --approve SHA256` for canonical import and verified readback. An interpretation never approves itself. The private interpretation table requires `supabase/migrations/20261004000300_known_source_interpretations.sql`; apply it after the prior Phase 2 migrations.

The October 4 bounded Texarkana request `1e834d15-6337-4356-a95b-38083c98a0ea` demonstrates the public route. Its saved state-contract listing was interpreted with one secondary pending contract reference, two supply exclusions and one linked-document uncertainty. It staged intake `e197eb70-0562-5369-a1b2-35679b82ed98` without changing a canonical lead. The same interpretation replayed without a second intake. This remains partial coverage and supplies no Texarkana work-site claim.
