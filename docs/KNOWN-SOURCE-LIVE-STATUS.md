# Known-source live status — October 5, 2026 (Eastern)

The reusable route remains geography → verified source capability → bounded capture → cited interpretation → immutable intake → reviewed import. SAM remains a separate, manually run Arkansas-wide path. An entry-page fetch and a blocked fetch do not establish lead coverage.

## Operational in the live database

| Registered source | Verified method and limit | Live outcome |
| --- | --- | --- |
| North Little Rock Commerce | Public document-service JSON: Active Bids and 2026 Bid Summaries; terminal pagination required. | Two active-bid files reviewed as unrelated. Two official janitorial bid-summary PDFs reviewed, staged, and imported as **historical opportunities**, not open bids or awards. |
| Pulaski County Purchasing | Public AR Bid/IonWave table; filter Organization = Pulaski County and require a terminal page. | Two county rows reviewed as unrelated. Other organizations in the shared portal were excluded from county coverage. |
| City of Little Rock Procurement | Anonymous Bonfire open-project JSON named by the official portal; maximum 100 records. | Four public open projects reviewed as unrelated. Private invitations and past projects remain outside this method. |
| Little Rock public contracts | Anonymous Bonfire public-contract JSON; maximum 100 records. | Three public contract rows reviewed as unrelated. An index row alone is not signed-award proof. |
| Arkansas Ariba, other-unit solicitations, anticipation notices | Existing public methods retained. | Respectively 12, 6, and 1 saved rows reviewed with no janitorial match in those listings. |

North Little Rock request `83a45f9f-e12a-4cad-a68a-47b71d603908` produced two imported leads: `55e9c2e1-68d5-5fda-a39a-c6fe3c248117` (Justice Center, 26-3922) and `d396ec9e-6a82-5dca-a09e-55cafb89a43f` (Patrick Henry Hays Senior Citizens Center, 26-3910). The exact reviewed import package at `outputs/known-source/83a45f9f-e12a-4cad-a68a-47b71d603908/import-package` passed rollback/readback/replay tests and live verification: two new leads, two request links, two processed intake items, two history events. The PDFs and packet evidence are saved under the ignored request output directory.

Little Rock request `aa7a0101-1619-4191-8097-5a71ff8ad3ac` verified routing and capture of the new city methods. The Pulaski method also routes to city requests through their county without city-specific runner code.

## Partial or blocked

| Source | Verified limit or blocker | Next public-source work |
| --- | --- | --- |
| DHS announcements | 505 mixed historical rows include a 2026 janitorial anticipation notice. The saved index does not prove an executed award or a North Little Rock work site. Interpretation persisted as partial. | Review linked notice and geography; add a bounded date/category filter before claiming full coverage. |
| ARDOT | All 2,497 rows saved over 25 pages. Among 129 rows with opening dates in the Jan–Oct 2026 window, no janitorial keyword appeared; five tail rows have blank dates and descriptions. Interpretation persisted as partial. | Resolve undated blank rows or define an evidenced scope limit; review linked PDFs for historical candidates when relevant. |
| ARBuy Open Bids | Public advanced-search page loaded, but a blank default table does not prove complete current or historical results. Interpretation persisted as partial. | Verify the submitted search, pagination, and terminal condition. |
| ARBuy statewide janitorial record | Detail page is an intent-to-award record watch. The already imported statewide award has separate signed-contract evidence; no local work site was inferred. | Check for new signed actions and actual local work orders. |
| Arkansas state contracts | Janitorial Services OA 4600058030 matches the existing statewide canonical award S000000473. Index has 97 rows; no new lead was imported. | Reconcile exact existing identity and review linked documents for changes. |
| USACE Little Rock District forecast | Official forecast PDF and host returned HTTP 403 in the live public fetch. | Find an official accessible edition or use an authorized browser channel. No forecast coverage is claimed. |
| Texarkana Water Utilities | Earlier live Cloudflare HTTP 403 is saved as blocked. | Use an accessible official channel; do not retry its entry page as lead coverage. |
| Clinton National Airport forecast | Its public supplier page now links to a September 2026 forecast PDF. The saved registry URL still points to March. The source now routes to Little Rock, but no forecast method has been verified, so this is researched evidence, not completed routed coverage. The September PDF lists terrazzo floor maintenance for Q4 2026 and Q1 2027. An older June terrazzo forecast is already lead `7700e69e-1335-59c7-906b-eac8a4bfc005`; title similarity does not prove whether either new scope is the same procurement. | Register a method that follows the current official forecast link and review each forecast identity before linking or importing. |

The live registry has 40 sources. All nine previously unmapped independent agency sources now have evidence-backed city routes: airport procurement, its forecast, housing, LRSD, UA Little Rock, UAMS, water reclamation, and Central Arkansas Water route to Little Rock; Rock Region METRO routes to North Little Rock. Their source/category methods still require separate verification. Routing does not establish a lead's work site. The portal account state is unknown, and this batch used public methods only.

## Repeatable verification

Source method configurations are in `source-methods/`. The `verify-json-listing-method.mjs`, `verify-html-table-method.mjs`, and `verify-bonfire-method.mjs` commands recheck the live official responses before updating a capability. Their parsers reject changed shapes and unconfirmed pagination. `known-source-run.mjs` stores exact run/capture evidence, `known-source-workflow.mjs` persists interpretation and intake, and `procurement-workflow.mjs` tests and applies reviewed imports.

`npm run lint` and `npm run test:workflow` passed (123 workflow tests). The reviewed North Little Rock import also passed its offline rollback/readback/replay test and live readback. The nine city routes in migration `20261005000600_route_existing_city_agencies.sql` passed a live rollback trial, were applied, and were read back. Pure planning of the existing Little Rock and North Little Rock requests routed the eight and one agency sources respectively without creating jobs.
