# Real API search results — September 16, 2026

## Update: approved intake processing is committed and verified

The three approved awards are now in `procurement_leads`. Live lead count increased **321 → 324**. This was a database-only import of previously captured results, not another SAM search.

| Award | New lead ID |
| --- | --- |
| 12444026C0006 — Poteau/Cold Springs janitorial | `bfe6697f-4046-4bfc-95e4-b1a518ffc3c9` |
| W519TC26CA043 — Pine Bluff Arsenal custodial | `4d90c670-8efc-4738-8f79-ee87cacc03ae` |
| 697DCK24C00028 — FAA QXR ARSR janitorial/grounds | `c66901ae-59f3-4e6f-b6f1-0ed4558ebf96` |

- Added evidence to **74 existing leads**: 73 SAM-related enrichments plus provenance for the older ARBuy Statewide Janitorial Services lead `S000000473`.
- Created **78 intake-to-lead links** and marked those intake items `processed`: 77 from the current SAM capture and one older ARBuy detail-page backfill. These support 77 distinct canonical leads because the multi-site award has both an award API intake and an award-notice intake.
- All 102 original intake records remain: **78 processed, 23 pending, one ignored**. Pending includes 21 older page-level snapshots with no reviewed individual-lead match, the historical forecast, and the unmatched historical solicitation. The bridge-deck construction record remains ignored.
- Three new awards retain location/scope uncertainty notes and request classification `needs_location_review`; they are not open solicitations. No annual revenue estimates were invented.
- Existing lead fields, stages/reasons, owners, notes, follow-ups, annual estimates and creation timestamps were verified unchanged. Source evidence updates generated 77 appropriate history events/versions. Live constraints and triggers were exercised offline before applying; live readback verified the committed result.
- Applied SQL: `008_intake_processing_final.sql`; manifest: `008_intake_processing_reviewed.json`; verification and itemized unresolved records: `intake-processing-verification.json`. Other `008` SQL files are superseded drafts. **Do not apply `007`**, which contains a forecast addition excluded from this authorization.
- UI unchanged. No Netlify deployment or extra SAM API requests. Production build and transaction/unit tests passed.

Next: refresh the app and review the three awards. Existing filters may hide them. The research qualifications remain captured in their payloads; this import adds no UI features to display new qualification fields.

## Original search report (historical, before the processing update above)

**Your SAM key worked. Both real SAM APIs returned HTTP 200. No UI changes were made.**

| Search | Actual result |
| --- | --- |
| SAM Opportunities | Seven requests; five distinct notices across NAICS, keyword and multi-state searches |
| SAM Contract Awards | Three requests; 124 returned actions, deduplicated to 120 actions across 74 distinct contracts |
| GSA forecasts | Official browser search, not SAM API: all 75 Arkansas listing summaries screened; one relevant forecast detail captured |

The primary SAM window was September 17, 2025–September 16, 2026. One additional awards query checked modifications September 11–16 and returned zero. Every requested query fit on its first page; results are complete for those filters, **not** comprehensive historical/all-agency coverage. Exact filters and responses are in `capture-summary.json` and the UUID-named JSON files, and in Supabase `procurement_runs`.

## What was saved

- Left the reusable private `sam-search` Supabase function deployed. It uses your existing secret in Supabase; no local SAM key or app sign-in is needed.
- Saved ten sanitized SAM responses and one forecast audit in the existing run table.
- Captured 80 records in the existing intake table: 74 award-contract groups, five notices, one forecast. The bridge-deck construction notice is marked ignored, not a janitorial lead. Raw award actions remain in the run captures.
- Compared against the LIVE 321-lead database, including Friday's additions and corrections.
- Prepared `007_incremental_sam_capture_2026_09_16.sql`: **one historical forecast addition and 73 existing-lead evidence enrichments**. It has NOT been applied to canonical leads. Sales fields and original creation dates are preserved. Original canonical dates/locations/contact details are not overwritten; differing SAM facts are retained as reviewable evidence.
- Three unmatched awards and one historical notice remain staged for review rather than creating duplicate or misleading leads.
- Updated the original research playbook and added its `sam-search` CLI command. Detailed operator instructions are in `docs/SAM-SEARCH-PLAYBOOK.md` in this repository.

## Three award candidates absent from the current lead database

| Contract | SAM description / incumbent | Review needed |
| --- | --- | --- |
| 12444026C0006 | Poteau/Cold Springs Ranger District and Work Center janitorial; FORTAZO CORP. | Signed September 11, 2026. Structured work city is Hot Springs National Park; verify actual facilities. The API reports current and ultimate completion as September 20, 2031 despite base-plus-options wording. |
| W519TC26CA043 | Pine Bluff Arsenal custodial; A&M JV LLC | Structured city says Little Rock, while the scope names Pine Bluff Arsenal. Retain that discrepancy. Current end June 21, 2027; potential end June 21, 2031. |
| 697DCK24C00028 | FAA QXR ARSR janitorial/grounds; UNIQUE CLEANING SERVICE, INC. | Related-service NAICS 561210; verify the exact facility and service scope. Captured actions report completion April 30, 2028. |

These are awarded contracts for incumbent/recompete research, not new invitations to bid. No annual revenue estimate was invented from obligations or contract totals.

## Notice and forecast findings

- [Ozark Powerhouse janitorial](https://sam.gov/opp/b878faa7fc7a496c9fef1ac3f0798de6/view): already in the database; response deadline September 11 has passed.
- [Pool 2 park cleaning](https://sam.gov/opp/4918f8a64da94373a72f5163ac8991c2/view): already in the database; August 28 deadline has passed. This notice uses NAICS 561210 and would be missed by janitorial NAICS alone.
- [Arkansas multi-site custodial award notice](https://sam.gov/opp/1a71da7afb094db3a2c8b9f5466ad6a2/view): W911SA26PA127, HR CONTROL SOLUTIONS LLC, reported notice total $1,428,735. Matched to the existing award instead of proposing a duplicate lead.
- [Related multi-site solicitation](https://sam.gov/opp/ae70956e37264b6aaa810a75668a7bad/view): April 20 deadline has passed; staged for historical linkage/geography review.
- [Clean and Seal Bridge Decks](https://sam.gov/opp/e2b978662702480f9d8fefb1406849d2/view): excluded from janitorial lead proposals; this is bridge-deck sealing/construction.
- [FWS2025001061, Crossett janitorial forecast](https://acquisitiongateway.gov/forecast/resources/38155?nid=38155): an option-exercise forecast, below $150K, estimated solicitation March 31, 2026; planned dates have elapsed. Contact Rachel Pearson, rachel_pearson@fws.gov; small-business contact Josh Gordon, small_business_opts@fws.gov. Not a verified open solicitation.

**No newly open, confirmed janitorial solicitation was established by this bounded run.** The useful additions are source evidence, incumbent/contract history, and review candidates.

## APIs, URLs and limitations

- Opportunities endpoint: `https://api.sam.gov/opportunities/v2/search` — [official documentation](https://open.gsa.gov/api/get-opportunities-public-api/).
- Awards endpoint: `https://api.sam.gov/contract-awards/v1/search` — [official documentation](https://open.gsa.gov/api/contract-awards/). Keyless URLs saved with award evidence identify the endpoint/query; authenticated API calls still require the key inside Supabase.
- Forecast search: [Acquisition Gateway](https://acquisitiongateway.gov/forecast). No SAM forecast endpoint was verified. Its public browser UI worked; the public listings API documentation is a placeholder, not a working forecast API. Your SAM key was never sent to that website.
- The existing USACE forecasts were not overwritten or reimported. GSA summary screening does not prove complete federal agency forecast coverage.
- Both real APIs worked; no authentication failure or rate-limit response occurred in these ten calls. Initial award-count parsing needed adjustment for `awardSummary` and the distinct zero-results envelope; saved audit metadata was corrected without repeating those API requests.
- No accounts, subscriptions, notifications, recurring jobs, emails, UI changes or Netlify deployments were created.

## Verification and next action

The deployed function rejects unauthenticated requests (401), wrong methods (405), unsupported search kinds (400) and arbitrary URLs (400). Offline tests validate parsing of actual captures, identity matching, unchanged canonical facts, SQL replay and conflict protection. SQL tests use the real captured baseline in a local engine, not the production database; production triggers were not fully simulated.

Next: review the three unmatched awards and historical notice, then review/apply the prepared incremental SQL separately. The existing 321 canonical leads remain untouched by this run.
