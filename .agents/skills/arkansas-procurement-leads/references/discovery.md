# Adapt discovery to an Arkansas jurisdiction

## Define geographic scope correctly

Separate the named city/county/municipality, agency coverage, and actual work site. Verify the city–county relationship and official agency sites; identical city/county names do not establish a relationship. Ask about city limits, countywide work, nearby service area, or statewide collection when that materially changes inclusion.

Start with the requested local government. Include schools, universities, water/wastewater, housing, transit, airports, state facilities and federal districts/installations when they fit the requested scope. Do not limit relevant federal work to agencies headquartered locally, and do not expand a local-only request to all statewide rows just because a state feed is available. Retain broader source context separately, and report uncertain locations rather than guessing.

For each source, keep a simple coverage ledger: agency, official entry URL, procurement portal/document URL, method, checked date, query/page range, forecasts status, opportunities status, awards status, distinct relevant findings, location uncertainties, access/cost/registration needs, evidence path, next action. Use `unchecked`, `partial`, `blocked`, `reviewed_with_results`, or `reviewed_no_results_for_stated_scope`; avoid an unsupported blanket `complete`.

Start with database source coverage/request associations through [database-persistence.md](database-persistence.md), then load the supplemental `outputs/procurement-access/sources.json`. Reuse known official URLs/access, recheck freshness and discover missing agencies. Register reviewed public sources/coverage in the database for application research, including blocked/empty sources. Preserve previous scopes; source association does not verify a contract site. Finish verified-finding import and readback, or name the exact blocked step; local JSON is not the completion point.

## Collection methods that worked

- **Forecasts:** inspect agency small-business/acquisition pages and the responsible district's current and next-year PDFs/spreadsheets. Use GSA Acquisition Gateway as another source, not a substitute for agency documents. Inspect all relevant pages/rows and preserve page references. A directory or homepage is not a completed forecast search. If direct retrieval fails, use an authorized browser or supported web/PDF extraction and label the method; do not bypass access controls or call extraction a working API.
- **Opportunities:** search SAM and official local/state portals, including amendments and archived sections. Check the latest notice, explicit deadline/timezone, cancellation/award status and actual work locations. A posted-date window may miss amendments to older notices. Review multi-site/multi-state notices rather than relying only on a state filter.
- **Awards:** use SAM/USAspending for federal awards; use public award/closed/contract tabs and executed attachments on local portals. Record incumbent, award number, current and potential ends separately. Missing private award details remain unknown. Do not turn a listing marked awarded, a bid tabulation, or intent letter into an unsupported executed-contract claim.

For janitorial work, search NAICS 561720 and terms independently: janitorial, custodial, housekeeping, cleaning, clean up/cleanup, floor care, carpet cleaning, window cleaning. Review related-service codes; a non-561720 code does not automatically exclude relevant cleaning. Exclude supplies, equipment, bridge sealing/construction and unrelated uses of “clean” after examining actual scope. Do not double-count keyword/NAICS overlap.

Commodity systems differ: NAICS, UNSPSC and NIGP are not interchangeable. Previously observed UNSPSC codes were 76111501, 76111500 and 76111604; select a portal's current matching descriptions, not these numbers in a different code system.

## Find the appropriate portal, not a copied account recipe

Follow the target government's current official supplier/bid links. Historical Little Rock examples include Euna/Bonfire, Arkansas Ariba and legacy ARBuy, IonWave, B2GNow and ProcureWare. These are routing examples, not evidence that every Arkansas jurisdiction uses them or that all their features are free. A government-hosted/vendor-hosted official portal is a direct source; a commercial aggregated discovery subscription is a different service.

Use the agency's current platform, not whichever old portal has a familiar name. Public documents come first; register when needed and authorized. Confirm whether registration is agency-specific even when the platform shares a login. Recheck the price/access boundary before selecting alerts, exports, or upgrades. Award access and bid alerts may have different requirements.

For every discovered source, inspect official developer/API documentation or an officially linked provider's API pages. Record API discovery as `not_checked`, `documented_available`, `not_found_after_review`, or `unavailable`, with URLs, checked date and limits of the review. Follow [api-access-and-tracking.md](api-access-and-tracking.md) for public no-key retrieval and authorized access applications. Browser network traffic alone does not establish an official API. Attempt authorized eligible free setup; if user action remains necessary, use [signup-alerts.md](signup-alerts.md) while continuing available public collection.

## Output discipline

Every lead needs a source identifier/URL, classification, agency, work-location evidence, relevant dates, service relevance, retrieval/query provenance, and uncertainty. Preserve source figures without inventing annual value. Account for excluded and duplicate rows with reasons. If the source is blocked, state what remains unsearched and what additional access would unlock—never report “no leads” solely from failed access.

Application geography research uses the established database-persistence workflow above. Explicit research-only/export-only requests stop at that boundary. Signup, email and schedules need their own scoped authority; route to the relevant reference and honor authority already supplied.
