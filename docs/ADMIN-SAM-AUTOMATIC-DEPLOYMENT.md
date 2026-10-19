# Automatic SAM saving — release evidence, October 19, 2026

## Outcome

Manual and scheduled statewide SAM runs automatically validate and persist canonical leads through the existing native-tested import transaction and readback. No candidate selection, review reason, new-lead checkbox, manual preparation or hash approval is required for SAM. Other source workflows retain their approval behavior. Invalid records retain factual exclusions; actual saved results remain distinct from collection success and partial coverage.

## Changes and verification

Feature commit `be38904` (`feat: automatically save validated SAM results`) adds the private versioned policy/worker continuation and results UI. Commit `6e1b084` (`fix: report unchanged SAM records accurately`) counts a canonical record with only a new search-provenance link as unchanged rather than omitting it. Commit `c40c341` (`fix: guard SAM import recovery and replay`) adds a specific recovery hold before further SAM fetch/save work and one bounded revalidation of changed canonical inputs before any send. Exact transaction/reconciliation controls remain. There is no new schema, private function deployment, provider integration, AI call or scheduler.

- `npm run check`: lint, 59 UI tests, 272 workflow tests, SQL rollback/readback/replay/protected-field checks, typecheck and production build passed. The final targeted suite passed 35 tests, including uncertain-import holds, no provider resend, exact policy provenance and bounded pre-send revalidation. Counter-specific regression checks also passed. Final lint/typecheck passed after the worker/packet changes.
- `npm run test:access`: passed against real disposable PostgreSQL 15/PostgREST, including nonempty manual and scheduled automatic imports, mixed valid/invalid locations, native rehearsal, protected canonical identity, deduplication and paused legacy continuation denial. The fixture includes the existing API-link migration. The local gateway now uses one runtime capability and retains startup diagnostics; initial startup/obsolete fixture failures were not counted as acceptance.
- The existing browser harness passed desktop, 390px, 320px, keyboard/focus, no horizontal overflow, preserved county selection and no SAM approval controls. Browser fixtures perform no production mutations. Screenshots were inspected. Existing large lazy Admin/map chunk warning remains.

## Genuine saved evidence and live execution

No public approval route was called in this acceptance. System policy metadata, exact saved run hashes, native test receipts and final canonical readback establish authorization and persistence.

| Check | Saved identity | Result |
| --- | --- | --- |
| User's existing DeQueen result | Request `d4b7ee3f-407d-4edd-8e2a-ff3ca0dc1bfd` | Saved evidence processed automatically without provider re-fetch; one verified unchanged canonical lead. |
| Fresh manual run through draft Admin | Trigger `56b21b66-243f-4565-a064-7b438049d372`, request `1e8147f9-34e8-4d95-a322-bb6f663e5369` | October 7 posted window returned one terminal notice; automatically processed/verified, no approval controls. |
| Future scheduled run, browser closed | Trigger `288c5bf4-4c2e-4c48-9b7f-014942deb0e4`, occurrence `c9da1c96-65fe-495b-943a-6f23c034309f` | October 19 at 05:50 UTC (00:50 America/Chicago); 13-day rolling lookback returned the same genuine notice and automatically processed/verified it. |

Both fresh parents completed after automatic import readback. The existing canonical DeQueen lead remains exactly one row, ID `313f0f5c-7b9f-5fff-a439-51ed5113a6d7`; no duplicate was inserted. These live cases establish a real nonempty canonical match and new provenance linkage, rather than a new lead insert. The isolated real PostgreSQL test separately proves a actual new canonical insert, replay and scheduled duplicate prevention.

The disposable schedule `039f075e-4885-4c89-a546-e888cb0f1a95` was paused and archived after exactly one occurrence. The acceptance user was soft-deleted. Scheduled step logs report AI not used, zero input/output tokens and USD 0. Other saved SAM requests and Render environment/AI settings are verified unchanged. Older manual preparation failures were not restarted; a successful automatic receipt supersedes their generic review state without hiding uncertain writes.

## Hosting and remaining work

The existing Render service and approved [draft preview](https://bonfire-review--janitorial-lead-gen.netlify.app) are the release targets. Netlify production remains locked on `6ad583d1b9bb1b307abcf1fd`; there is no production frontend publish. Final deployment IDs and read-only verification follow below.

Private receipts, logs and screenshots are under ignored `outputs/deployment/sam-automatic/` and `outputs/deployment/admin-sam/automatic-*`; no saved access token, password or API key is included in the release evidence. Bonfire access gates, county/state searches, Companies, email previews and existing non-SAM approvals remain unchanged. No product decision or validation exception remains for the exercised acceptance records.

Final verified release: Render `dep-dbar2pom7kps739v0lag` is live on `c40c341c1a8b56343d01058322e661ef1331d025`; draft Netlify deployment `6ad5b17fd16ad408f67d557c` uses the same source commit. Final API smoke returned HTTP 200 and verified counts 0 added / 0 updated / 1 unchanged for the actual manual notice. Local backend was restarted on matching code with port 5174 allowed. Backend health returned 200 and exact-origin preview CORS returned 204.

Final Cron proof: 1 accepted HTTP 202 delivery and 13 successful Cron executions during the observed window. AI/environment values and unrelated saved SAM work were unchanged; production remained locked. The plan is complete with no remaining required acceptance blocker.
