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

1. Prepare an eligible real candidate through the common reviewed import path. The user approved a bounded historical pilot, but this listing has no qualifying janitorial evidence. Saved DHS solicitation 710-25-028 has an unverified amended deadline; official PDF retrieval returned 403 on October 7. Do not promote the attributed deadline or substitute the superseded original deadline. Exact next action: retrieve the official amendment and verify its deadline and work site, or use another saved official candidate with verified qualifying dates. Do not count this blocked retrieval as coverage. A later exact import batch still requires approval.
2. Secure signup/sign-in continuation remains outside this batch and unfinished in the parent plan.

Focused verification: 37 discovery, native rehearsal, hosted workflow and registry regression tests passed, plus the new handoff replay regression passed separately. Both original SQL suites passed, including rollback, replay, concurrent edits and protected fields. Lint and whitespace checks passed. Keep the parent plan in todo. This report does not claim complete discovery acceptance or authenticated access execution.

Implementation commit message: `feat: enable bounded official-source discovery`. Acceptance documentation commit message: `docs: record public discovery and reuse checks`.
