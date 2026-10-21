# Pulaski public source collection repairs — October 21, 2026

## Scope and preserved behavior

Repair county collection and interpretation through the existing bounded public-fetch, source registry, signed supporting captures, leased worker and automatic county import services. Preserve actual work-location/date/service validation, duplicate identity checks, notes and sales stages, AI models/pricing/budgets, independent SAM/state triggers and unrelated UI behavior. Bonfire and PlanetBids access remain separate. No Netlify deployment is required.

## Diagnosed failures and changes

- North Little Rock's multiline JSON-listing review was compared with a whitespace-normalized quotation without normalizing the saved review. Valid exclusion evidence failed `validateZeroBasis`, stopping later interpretation tasks. Both sides now use the same whitespace normalization; missing exclusions, missing rows and fabricated quotations still reject.
- CivicPlus div-based bid lists were treated as unstructured pages. The existing automatic listing recognizer now verifies their category counts, stable public bid IDs, explicit empty marker and traversal bounds. Missing dates such as “Upon Contract” remain unknown. A future janitorial row without verified site/date evidence remains unresolved.
- PCSSD and Sherwood publish their page content inside indexed Apptegy JSON. A shared inert reader follows only the current published, unprotected page's bounded content tree. It does not evaluate scripts or treat menu/draft data as listing coverage. The existing recognizer handles school invitation lists and civic bid panels, rejecting changed primary invitation formats. The same content supplies discovery review and quotation verification.
- The North Little Rock annual list includes historical janitorial bid summaries. The existing supporting-document continuation now captures relevant PDFs, verifies their configured organization and exact bid number, and excludes an opportunity only when the document explicitly records an opening before the request's deadline window. It never infers an award winner, a work site, or an open deadline from bidder prices or document upload dates. Unmatched/inaccessible documents remain partial; each attempt retains its signed evidence and does not loop.
- A discovery continuation encountering a definitively saved, finished HTTP failure now retains that failure as source attention without another fetch. An uncertain `request_pending` outcome still requires reconciliation.
- Registry readback accepts equivalent `last_success_at` timestamp representations, as it already did for verification dates. A changed timestamp still fails. SQL concurrency guards are unchanged.
- The two-document regression additionally preserves each primary listing row's distinct locator when attaching its signed PDF exclusion. HTTP-200 North Little Rock verification pages receive fixed source-attention copy instead of a generic JSON-format error; capture bytes remain saved and no challenge is executed.

## Verified public channels

| Existing source | Reused channel | Observed listing |
| --- | --- | --- |
| Maumelle | https://www.maumelle.gov/Bids.aspx | Explicitly no open bids |
| Cabot | https://www.cabotar.gov/Bids.aspx | Explicitly no open bids |
| Jacksonville | https://www.jacksonvillear.gov/Bids.aspx | One asphalt project; “Upon Contract” is not an exact deadline |
| PCSSD | https://www.pcssd.org/page/purchasing | Grounds maintenance, pest control and delivery truck invitations; addenda are not separate contracts |
| Sherwood | https://www.sherwoodar.gov/o/cos/page/bid-postings | Disaster debris monitoring; retained legacy source identity and corrected operational entry |
| North Little Rock | Existing active/annual public document listings | Janitorial summaries 26-3922 and 26-3910 record May 14 and February 10, 2026 bid openings; no award determination |

All six existing source identities and history are retained. The reviewed registry package contains six capability changes, six source metadata changes, six research-request associations and one scoped verification request. Public bytes and hashes are retained privately. No new paid search provider or account was added.

## Verification and release record

Initial code commit: `f08ecf4fe4a17f842d32665ed77439b0a95a149c` (`fix: resolve Pulaski source collection blockers`). Initial Render deployment: `dep-dbcj25eq1p3s73c8tv60`. Follow-up `34e3ebf` preserves distinct PDF-backed exclusion locators. Render environment hash remains `7c6e8222f163f9bdeba42b8a87921d0d2f72edfc59511620d29addb317c40903`.

Private evidence: `outputs/procurement-research/pulaski-2026-10-21/`. The source registry approval hash is `7adb010f267ff058c3cadc9ee15cce5d2837e47d4f3a8945c8679814db82ae39`; its current-schema rehearsal passed rollback, readback and no-op replay before application. Final live run and persistence results are recorded below after readback.

Registry application readback verified nine inserted and ten updated rows, with zero errors. No canonical lead was written by that registry package. Real manual trigger `47a3c5ae-b284-41cc-a331-730bc625b5ad` checks October 21, 2026 through February 17, 2027, with the unchanged $1/four-call ceiling. Its lead-saving receipt has already verified one unchanged lead; source research is still running at this checkpoint.

The full final `npm run check` passed 110 frontend tests, 370 workflow tests, the guarded SQL suites, lint and build. Native PostgreSQL/PostgREST acceptance passed separately. The final verification-page classification has seven additional focused assertions/tests passing. The existing frontend chunk-size warning remains.

Regression coverage includes real source-format fixtures and a public two-page NLR PDF, corrupted counts/empty states, changed school invitation format, draft/wrong-page content, missing work dates/sites, wrong PDF agency, dates inside versus before the request window, interrupted retrieval, no-repeat capture behavior, fabricated/missing zero evidence and timestamp drift. Native PostgreSQL/PostgREST acceptance covers automatic manual/scheduled county/SAM saving, duplicate protection, protected sales fields and access boundaries.

Netlify production remains the locked deployment `6ad583d1b9bb1b307abcf1fd`. Local backend port 8080 was restarted with the same existing guarded import/rehearsal and AI configuration.

## Observed external limitations

North Little Rock's public JSON/document channels work from the research machine, but Render received HTTP 200 HTML titled “One moment, please...” with “Please wait while your request is being verified...”. The saved response is a verification gate, not an empty listing. Supported access must be provided by the website operator; no clearance transfer, challenge execution or retry loop was added. Local document/parser verification does not prove hosted access.

Rock Region METRO's official vendor page points to `https://rrmetro.procureware.com/home`; the saved hosted attempt returned HTTP 403. UAMS's reviewed pages describe internal purchasing procedures but do not establish a complete public solicitation feed. Keo, Wrightsville, Alexander, Shannon Hills and Cammack Village require a verified current procurement publication channel; municipal homepages, officials, newsletters and historical construction notices alone do not establish an exhaustive janitorial check. Wrightsville and PlanetBids also returned HTTP 202 without usable content in the real run. Bonfire/PlanetBids work remains separate. These gaps must not be imported as leads or reported as zero opportunities.
