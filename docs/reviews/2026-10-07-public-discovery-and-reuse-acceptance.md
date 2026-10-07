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
| Leads | No candidates or lead imports from this pilot yet. Listing review found no routine-janitorial bid in the saved October 6, 2026–October 5, 2027 deadline window. |
| Worker | Discovery job `098a7fbc-f8d2-4622-8db1-5b02310e098e` at `discovery_collect`; await deployment for hosted continuation. |

Private receipts: `outputs/deployment/20261007000600/` and `outputs/deployment/render/discovery-pilot-*.json`; remain ignored. The previous benchmark environment update omitted the validator connection due to pagination. Its existing value was restored, all prior variables preserved and read back; a new deployment must load the restored configuration.

## Remaining acceptance

1. Deploy the tested backend batch to the existing Render Free service after explicit commit permission; finish hosted collection, interpretation and resource measurement.
2. Prove a second bounded request reuses the saved method without research or location-specific code; no duplicate leads.
3. Prepare an eligible real candidate through the common reviewed import path. No qualifying candidate exists in this pilot window; historical pilot bounds require the pending user decision. Present any exact live import batch for approval.

Focused verification: 37 discovery, native rehearsal, hosted workflow and registry regression tests passed, plus the new handoff replay regression passed separately. Both original SQL suites passed, including rollback, replay, concurrent edits and protected fields. Lint and whitespace checks passed. Keep the parent plan in todo. This report does not claim complete discovery acceptance or authenticated access execution.

Suggested commit message: `feat: enable bounded official-source discovery`.
