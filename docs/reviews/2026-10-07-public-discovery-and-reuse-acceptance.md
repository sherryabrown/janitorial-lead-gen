# Bounded public discovery — acceptance in progress

Scope: one saved official public method gap; no signup/sign-in, frontend, schedule or paid hosting. Existing interpretation behavior and separate statewide SAM remain unchanged.

## Implemented

- Authenticated discovery submission, private review packet, evidence-bound method review and continuation use the existing durable worker and tables.
- Follow saved official same-host links: at most ten pages, two MB per page, one audited capture per checkpoint. External portal/API links become private research handoffs. No account actions or paid search.
- Register through the existing guarded registry SQL and native `procurement_test` rollback/readback/replay/cleanup rehearsal. Record transaction intent before sending; reconcile uncertain outcomes and finish private handoffs before collection.
- Preserve existing access progress and account references. Identical handoff replay adds no history.
- User approved scoped SELECT/INSERT/UPDATE grants on the three existing registry tables. Migration `20261007000600_hosted_official_method_registration.sql` applied and recorded; no DELETE, new tables or login.

## Live evidence so far

| Check | Result |
|---|---|
| Pilot | Registered `ualr` opportunity-method gap; request `20250d24-b3da-4968-85b6-9cb972312058`, task `095dd7c1-9e09-40b1-8ee0-abc7ad69051f` |
| Research | Nine official captures. A further document exceeded the byte bound; preserve this partial blocker. Research captures are not lead coverage. |
| Method | Official bid listing quotation verified; opportunity method persisted and read back. Forecast/award support not inferred. |
| Registration | One inserted and two updated registry rows; existing source identity retained. |
| Native rehearsal | PostgreSQL 17.4; rollback/readback/replay/cleanup passed; 5,974 ms, 1,358 copied rows / 844,880 bytes, local peak process 120.4 MiB. No hosted container measurement yet. |
| Usage | Zero paid search calls, inference calls, input/output tokens or AI cost for research/registration. |
| Leads | Zero eligible candidates or imports; all 15 listing rows reviewed and excluded. Interpretation `01fa47a2-b67d-4107-87d5-580825a80617` persisted as `reviewed_no_results`. This applies only to the captured opportunity listing and requested bounds. |
| Worker | Discovery job `098a7fbc-f8d2-4622-8db1-5b02310e098e` succeeded at `discovery_collected`. Hosted category capture run `c58b3cf7-4a09-480a-8f95-d0b15cb69b41`; separate entry run is not lead coverage. Collection stage 2,089 ms; sampled container peak 119,328,768 bytes (113.8 MiB), process RSS 172,195,840 bytes. |
| Deployment | Commit `917a03fb051555cc44698e1db87a1af8f02183e4`, Render Free deployment `dep-db36b6hsrm7s73c0p8q0` live; refreshed signed-in token verified HTTP flow. No Netlify changes. |
| Second request | `c529face-61d8-47dc-aefd-4b73dee2a665`, October 7, 2026–October 5, 2027; shared geography/collection services reused capability `ba397df6-c4c8-503b-abad-e4638ba6a021`. No discovery job/research or application inference. One category capture plus a distinct entry check. Source leads unchanged; interpretation `49a14cb5-ca41-4d92-8b66-417a59330c1b` persisted with 15 exclusions and no candidates. Local collection 3,678 ms, RSS 112,463,872 bytes. Other planned sources were not run. |

Private receipts: `outputs/deployment/20261007000600/` and `outputs/deployment/render/discovery-*.json`; remain ignored. The previous benchmark environment update omitted the validator connection due to pagination. Its existing value was restored, all prior variables preserved and read back; the new deployment loads the restored configuration.

## Remaining acceptance

### Positive-candidate continuation — Camden historical publication pilot

User approved a December 1–31, 2024 publication window for Camden DHS solicitation 710-25-028. Eligibility uses its verified December 6 publication and Camden work site; no disputed amended deadline is used or changed.

- Request `336d103a-c3ed-4c50-b5b0-4f62a56552cf`; registered DHS category task `38d782a6-3099-4285-abe4-80218f3ddcde`; live index capture `43b077a1-639f-48b9-8502-b87301ab7b74`. Only DHS collected. Shared-code collection took 3,238 ms, process RSS 160,165,888 bytes.
- Hosted signed-in supporting capture retrieved the specific official notice at `https://humanservices.arkansas.gov/announcements/710-25-028-janitorial-services-multiple-locations/`. Its publication date is verified. Preserve this public project page separately from index evidence.
- Original 21-page PDF bytes remain locally retained and match SHA-256 `806046fed396cefd76857d420b97f5cdd3502fd07ae875b471dfa8c0e76248fd` in processed primary intake `36976c1f-94ce-5315-a6af-be34a4f04293`, linked to existing historical lead `a53079cb-b47d-5fd6-a1dc-2133bd25ef32`. Independent extraction confirms December 6, 2024 and the Camden work site. No new canonical lead is proposed from this identity.
- Fresh hosted PDF request did not return a usable receipt. Render recorded a health-check timeout/restart at 15:47:54 UTC and became available again at 15:48:10 UTC; do not relabel this as a successful PDF capture or an OOM. No blind retry sent. Thirteen 30-second memory samples peaked at 215,515,140 bytes (205.5 MiB); this is a sampled peak, not instantaneous.
- Application usage ledger: zero calls, input/output tokens and cost. No new interpretation/candidate or import batch is prepared yet; no live import occurred.
- Exact blocker: supporting-evidence API accepts fresh fetches or its own signed portable receipts, but cannot adopt this earlier processed, hash-verified manual document. User decision requested for a focused saved-document reuse option that preserves original retrieval time, checks processed primary provenance/source/hash/current method and request bounds, and leaves default fresh fetching unchanged. Alternative: another eligible saved candidate.

Private continuation receipts use `outputs/deployment/render/positive-discovery-*` and `positive-dhs-*`. The earlier approval blocker is superseded by the continuation below.

### Approved saved-document continuation

- User approved the focused saved-document reuse behavior and explicitly authorized commit, push and deployment. Commit `5348c29` (`feat: reuse reviewed supporting documents`) is live on existing Render Free deployment `dep-db378epsrm7s73c3fqf0`.
- Nineteen focused supporting-evidence/hosted-workflow tests and lint passed. Tests verify no outbound fetch, preserved retrieval date, processed primary provenance, source identity, immutable bytes, changed-payload rejection, signed cross-request reuse and existing geography/date/method guards. Default fresh fetching remains unchanged; no new table or source was added.
- Original 364,867-byte PDF was saved and read back from existing private immutable storage at its verified SHA-256 path. Original retrieval remains September 30, 2026; this is reused evidence, not a fresh PDF capture or complete lead coverage.
- Hosted candidate preparation stopped before any new receipt/interpretation/import at HTTP 401: the signed-in test token expired. Exact next action: refresh `PROCUREMENT_TEST_ACCESS_TOKEN` privately, then run the deployed supporting reuse, reviewed interpretation and native import rehearsal. Present the exact batch for approval before live import. No lead changes occurred in this continuation.

### Refreshed-session hosted preparation

- User refreshed the private session. One supporting-document call returned HTTP 502 without a usable receipt; Render events showed no new crash and error logs no corresponding failure. One bounded retry succeeded. No claim is made about the cause of the transient 502.
- Hosted hash/provenance checks adopted the retained official PDF, preserving original retrieval time. Verified publication December 6, 2024 and Camden office work site; persisted intake `0f972edb-468c-541a-abbd-c037c0155e47` under request `336d103a-c3ed-4c50-b5b0-4f62a56552cf`. No deadline was asserted. Other rows/tasks remain unreviewed; coverage is partial.
- Exact prepared import job `2e7bca20-de78-4187-bb26-c86125f45040`, approval SHA-256 `a13d409830337f9e928448a72bd1085a394c50e0ecab68a776397f2c71e4f892`: zero new leads, one processed intake, one intake link and one existing-lead provenance update. Immutable package inspection confirms only `intake_source_evidence` changes in the canonical payload; title, specific public PDF link, deadline, protest evidence and protected user fields are preserved.
- Hosted PostgreSQL 17.4 native rehearsal passed rollback, readback, replay and cleanup in 1,694 ms. Peak measured container memory 361,324,544 bytes (344.6 MiB); summed process measurement 376,647,680 bytes (359.2 MiB), both below 512 MiB. Snapshot checks do not replace live baseline locks/readback.
- Application usage: zero inference calls, zero input/output tokens and $0. Exact import approval requested; no live import sent. Remaining check: approved application/readback, history/relationships and no-write duplicate replay.

### Approved live application — positive acceptance complete

- User approved the exact Camden batch/hash above. Hosted worker completed `import_verified`; independent database readback returned zero errors: zero new leads, one processed intake, one intake link, one history event and corresponding version. Request relationship and prior relationships/history were verified against the rehearsed baseline.
- Only `intake_source_evidence` changed in existing lead `a53079cb-b47d-5fd6-a1dc-2133bd25ef32`. Project title, specific public solicitation PDF link, user fields, existing protest evidence, identity and null deadline are preserved.
- Repeated exact approval returned the completed receipt. Independent pre/post replay snapshots matched for leads, intakes, intake/request links, events and versions: zero writes and no duplicates.
- Public-discovery positive-candidate acceptance is complete. Prior UALR registration and second-request reuse evidence remains preserved; no completed acceptance was repeated. This pilot is partial historical evidence review, not full Camden coverage. Access continuation and broader browser/access memory acceptance remain outside this batch; parent plan stays in todo.
- Private receipts: `positive-discovery-import-status.json`, `positive-discovery-import-package.json`, `positive-discovery-independent-verification.json`, `positive-discovery-postimport.json` and `positive-discovery-pre-replay.json`. Suggested documentation commit: `docs: complete public discovery import acceptance`.

1. Prepare an eligible real candidate through the common reviewed import path. The user approved a bounded historical pilot, but this listing has no qualifying janitorial evidence. Saved DHS solicitation 710-25-028 has an unverified amended deadline; official PDF retrieval returned 403 on October 7. Do not promote the attributed deadline or substitute the superseded original deadline. Exact next action: retrieve the official amendment and verify its deadline and work site, or use another saved official candidate with verified qualifying dates. Do not count this blocked retrieval as coverage. A later exact import batch still requires approval.
2. Secure signup/sign-in continuation remains outside this batch and unfinished in the parent plan.

Focused verification: 37 discovery, native rehearsal, hosted workflow and registry regression tests passed, plus the new handoff replay regression passed separately. Both original SQL suites passed, including rollback, replay, concurrent edits and protected fields. Lint and whitespace checks passed. Keep the parent plan in todo. This report does not claim complete discovery acceptance or authenticated access execution.

Implementation commit message: `feat: enable bounded official-source discovery`. Acceptance documentation commit message: `docs: record public discovery and reuse checks`.
