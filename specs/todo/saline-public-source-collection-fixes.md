# Saline public-source collection fixes

Status: partial release verified. LRSD and airport B2Gnow public readers, registry activation, Render-first/Netlify preview release, and live manual/repeat/browser-closed scheduled acceptance passed. Local automated, native database and desktop/mobile/keyboard checks passed. PlanetBids server retrieval, unverified publication channels and forecast detail/date/location limitations remain; keep this plan in todo. See [source matrix and implementation checkpoint](../../docs/reviews/2026-10-19-saline-public-source-fixes.md).

## Initiating prompt

> $plan-code Please plan the remaining public-source fixes for Saline County: verify city and school bid channels, fix LRSD collection, and complete airport collection. Keep Bonfire separate, use no paid search provider, reuse existing code and/or structures when you can, do not change unrelated current behavior, and leave Netlify production unchanged.

## Objective and boundaries

Make the remaining reachable public city/school and airport channels reusable by ordinary manual and scheduled county runs, through collection, validated automatic import and verified database readback. Users must not supply technical method definitions or approve valid county imports. A website capture alone is not an opportunity check; an unavailable listing is not a zero-result check.

This is a focused follow-up to [automatic county discovery](automatic-county-source-discovery-and-collection.md), not a replacement for that broader plan. The [source research record](../../docs/reviews/2026-10-19-saline-public-source-research.md) supplies historical findings; its old non-SAM approval statements were superseded by [county automatic imports](../../docs/reviews/2026-10-19-county-automatic-imports.md). Preserve current county and SAM automatic imports, independent noncounty approval guards, notes/stages, identity and date/location validation, AI settings/budgets, schedule modes, source attention labels, Companies, email previews and every unrelated behavior.

Bonfire/Euna access and collectors remain separate and paused. Do not automate challenges, transfer clearance, or route protected airport/school work into Bonfire development. No paid search provider, subscriptions, new account registration, outreach, new infrastructure or schema changes are planned. Planning authorizes no deployment or database mutation. During implementation reuse existing authorized accounts if needed; stop the affected source with a specific access requirement if public access proves insufficient. Continue other sources.

## Inspected implementation and reuse map

- `scripts/lib/official-link-discovery.mjs`: durable county discovery stages, official links, capture reuse, bounded capture (currently 2 MB in automatic discovery), saved verification and continuation.
- `automatic-public-method.mjs`: evidenced terminal HTML recognizers including county/city bids and published document tables. Extend shared structures only when actual captures demonstrate the shape; do not add agency-name branches to orchestration.
- `public-source-check.mjs`: streamed response bounds, redirect/Refresh and DNS/host safety. Preserve these protections.
- `public-html-table.mjs`, `public-json-listing.mjs`, `public-table-details.mjs`, `supporting-capture.mjs`: existing listing contracts, stable public row/detail identities and signed supporting evidence. Existing JSON-files and IonWave contracts are specific; do not assume a new portal matches them.
- `hosted-discovery.mjs` and `research-persistence.mjs`: verified method persistence, source associations, reviewed registry package/rehearsal/readback and identity protection. Prefer capability/configuration updates to duplicate sources.
- `hosted-workflow.mjs`, existing interpretation/evidence extraction and county automatic import: continue through the same worker, audit, leases, interpretation, validation, canonical write and reconciliation services.
- `county-source-attention.mjs` and existing Admin results: retain source-specific blockers and next actions; update only if these new evidence types require accurate mapping. No UI redesign.
- Existing tests: `researched-county-sources.test.mjs`, `official-link-discovery.test.mjs`, `public-source-check.test.mjs`, `public-html-table.test.mjs`, `public-json-listing.test.mjs`, `automatic-county.test.mjs`, `county-automatic-import.test.mjs`, `county-source-attention.test.mjs`, fixtures under `tests/fixtures/county/`, native integration and Admin browser harnesses.

## Planning evidence and uncertainties

Checked official web material during planning, October 19 Eastern / October 20 UTC, 2026:

- [LRSD procurement](https://www.lrsd.org/page/procurement-and-materials-management/) is indexed with bid/document and IonWave registration references, but a direct web read exposed only the site shell. [District documents](https://www.lrsd.org/documents/departments/procurement-and-materials-management/15290488) is another official discovery starting point. These are leads to verify, not proof of a working listing or public API.
- [Bryant RFP](https://www.bryantschools.org/page/rfp) and [Benton Schools](https://ww2.bentonschools.org/) likewise yielded shells in direct reads. A shell or heading cannot establish an empty listing.
- [Airport online bidding](https://clintonairport.com/procurement/online-bidding-portal/) explicitly links B2Gnow and PlanetBids. Existing B2Gnow solicitations remain there through opening; new PlanetBids postings are announced for November 2026. Discover targets from the official links, verify both at implementation time, and do not choose a portal only by today's date. [Contractor index](https://clintonairport.com/contractors/) also separates forecasts from solicitation portals.

Search indexing, a manual browser session and hosted worker retrieval are different proofs. Establish the real response, provenance, traversal and hosted support before activating a method. No public endpoint or empty result is assumed here.

## Phase 1 — Verify and retain public channels

1. Read current registry/capabilities, saved captures and source access state. Build a source-level baseline joining task routes to unique source IDs; do not treat 28 attention routes as 28 websites. Record existing lead/source identities, associations and relevant configuration for before/after comparison. Reuse prior receipts; never reactivate deleted verification actors.
2. Research city channels for Haskell, Shannon Hills, Bauxite and Alexander; schools for Benton, Bryant and Bauxite. Inventory LRSD separately in Phase 2. Keep working Saline County/Benton/Bryant city methods as regressions, not replacements. Benton Utilities may be resolved if directly encountered as an existing scoped public purchasing gap; label it separately from the city. UAMS, library and unrelated regional sources are not silently added to this effort.
3. Use agent web search and official navigation during development, then save reusable verified channels in the existing registry. The runtime worker does not inherit agent search. Follow official bid/RFP/document links, public CMS data actually used by the page, and agency-linked platforms. Verify public APIs where evidenced; do not invent API URLs or scrape internal/admin endpoints. Use existing browser tooling for diagnosis only; do not build a new browser execution service for a shell.
4. For each source save official entry, agency identity, final listing URL, link provenance, category, retrieval timestamp/hash, listing shape, pagination/terminal evidence, details/documents, stable identifiers and exact remaining limitation. Redact secrets/query credentials from public metadata; preserve necessary private evidence through existing artifacts. Procurement manuals, meeting packets, generic notices and purchasing contacts do not establish complete bid coverage.
5. Reuse existing source IDs and methods when correct; persist new evidence-bound capabilities and reviewed identity aliases through existing package/rehearsal/readback. New public channel discovery must not broaden geography or overwrite newer research. Tull/Traskwood may remain documented unresolved gaps: record bounded checked official sources and a specific next action; do not fabricate websites. Leave Tull's membership and Little Rock's inclusion unchanged. Any geography correction requires a separate impact discussion before implementation.

Deliverable: a source matrix of verified listing / verified empty / inaccessible / no public listing established, with evidence and persistence IDs. No unresolved source may be presented as collected.

## Phase 2 — Implement evidenced collection with existing services

### LRSD

1. Reproduce the saved oversized response and capture its actual size/content type safely. Determine whether meaningful bid content is in HTML, published CMS payload, linked documents, or an officially linked bidding platform. A larger response and a JavaScript shell are different problems.
2. Prefer the smallest authoritative category listing or documented/public page-linked data response over the full site shell. Validate organization, category, total/page completion and stable bid IDs. Reuse IonWave collection only if the actual district endpoint and schema pass its contract; registration references alone are insufficient.
3. If a necessary public response requires a larger bound, use an explicit source-scoped, tested finite contract after measuring it; keep a hard streaming bound and document the maximum. Do not globally raise limits, disable safety checks, or truncate content into apparent success. If the discovery stage itself prevents the supported smaller endpoint from being reached, make the narrow shared discovery adjustment with regression coverage.
4. Follow relevant detail/document evidence through existing bounded supporting capture and extraction. Missing work site, dates, document access or incomplete pagination stays partial; never substitute the district/contact address for the service location.

### Airport

1. Verify the official chain to both B2Gnow and PlanetBids and their airport-specific public listing/detail URLs. Preserve agency identity and existing source associations while representing two channels using current capabilities/configuration where supported. If existing selectors cannot represent both, document the smallest compatible extension before coding; do not overwrite one channel with the other.
2. Collect each reachable public channel with bounded traversal and explicit terminal/total evidence. Reuse current HTML/JSON/detail parsing where contracts match. Add a small fixture-backed parser/contract only for an evidenced unsupported format, wired into existing runner/verification/extraction dispatch; do not add a parallel worker or import pipeline.
3. Keep native portal IDs and originating channel in identities. Compare cross-posted records only with explicit shared solicitation identity/evidence, never title-only merging. Preserve channel failures independently so success on one does not imply complete airport coverage.
4. Reuse the existing forecast PDF capture/extraction and verify the currently linked forecast. Keep forecasts distinct from advertised opportunities and awards, with literal dates and work-location evidence. Do not force forecast items into an opportunity run or change existing category defaults.
5. Public listing success does not imply public document access. Record exact access barriers separately; no automated signups, submissions, challenge loops or clearance transfer. If a portal requires unsupported access, keep its acceptance open with evidence and the minimum next action.

### Shared continuation

Persist verified methods, replan existing coverage and continue the existing collect → supporting evidence → interpretation → validation → automatic county import → readback path. Reuse methods for update-only and scheduled runs. Preserve source-only settings. Use current finite retry, checkpoint, cancellation, per-parent budget and usage logging behavior. A blocked source must not halt independent sources. Do not bulk resume old jobs or historical candidates as a deployment side effect.

## Phase 3 — Acceptance, release and handoff

1. Add real public captures with provenance/hash and sanitized fixtures for city/school channels, LRSD and each airport channel. Cover nonempty listings, explicit empty, shell-only/heading-only, changed schema, duplicate IDs, multi-page/incomplete responses, redirects and unsafe hosts, exact byte bounds, inaccessible documents, stale/expired dates, unsupported service types and missing/conflicting work sites. A reusable parser must pass another-source fixture or a structurally different agency fixture where applicable.
2. Extend existing integration tests through method verification/persistence/reuse, worker collection and native automatic import. Verify duplicate-free repeats, protected notes/stages, reconciliation of uncertain writes, no imports for unsupported evidence, cancellation, shared budgets and accurate source attention. Add a dual-airport-channel regression with one failed channel; forecast results must not become open bids.
3. Run `npm run check`, `npm run test:access`, and `node tests/integration/admin-ui-browser.mjs`. Inspect desktop/390px/320px and keyboard results, evidence and next actions. Preserve drafts/context and existing unrelated county/state/SAM flows. Run focused tests during edits; avoid redundant full gates without new changes.
4. Prepare a reviewed registry package with exact before/after rows, immutable evidence, SQL rehearsal, replay/concurrency and readback. A package description or local JSON alone is not live persistence. Coordinate the release when concrete changes are reviewable; do not interpret this planning request as commit/push/deploy authorization.
5. On authorized release apply only the tested additive registry changes and deploy matching Render code first, then the approved Netlify preview. Verify exact commit, backend health, preview origin and assets. Record Netlify production ID/lock before and after and leave both unchanged; no production publish/unlock or incidental environment changes.
6. Run a real manual Saline request using the existing selected cities/categories and work options; repeat update-only to prove method reuse and deduplication. Verify one disposable scheduled occurrence through the same public methods with browser closed, then archive it. Use an authorized active test account; preserve historical deleted actors. Record trigger/occurrence/source/method IDs, unique source counts, actual usage and source-specific outcomes. Read back real imported records, immutable links and unchanged protected fields. Do not fabricate a positive opportunity if none is currently advertised: live bounded-empty proof plus captured positive extraction/native import tests are acceptable, clearly distinguished.
7. Update the source research record and relevant current docs, link this child plan from the broader discovery plan, and record deployed receipts separately from historical acceptance. Keep broader scope incomplete where unrelated sources remain unresolved; do not rewrite old approval receipts as automatic imports.

## Success criteria and completion rule

- Every in-scope city/school source has a dated evidence-backed outcome. Reachable supported public listings collect without user technical setup; missing/unpublished channels stay explicit gaps with next actions.
- LRSD's actual collection path is verified under bounded hosted retrieval, not merely a raised size cap or a browser screenshot.
- Both currently linked airport solicitation channels are independently verified/collected where publicly accessible; forecast collection remains category-correct and portal transition does not silently drop records.
- Manual, repeat and scheduled county execution reuse persisted methods and automatically save valid results with existing validation/deduplication and protected user fields intact.
- Exact per-source blockers and next actions remain clear. Claims of no matching results require complete bounded listing checks. Current source failures are not hidden by overall success.
- No paid search service, Bonfire work, unrelated behavior/geography changes, budget changes or Netlify production deployment occurs.

Keep this plan in todo if required LRSD or airport collection remains unimplemented, only fixture-verified, or blocked by inaccessible required channels. Unpublished city/school channels may be reported as external limits only after documented bounded official research; they do not count as collected. Report partial progress and precise next actions rather than declaring full Saline coverage. No product decision is currently required; any newly discovered access, scope or infrastructure requirement must be explained before changing unrelated behavior.
