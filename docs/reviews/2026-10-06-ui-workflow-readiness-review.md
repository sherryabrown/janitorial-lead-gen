# Review: efficient procurement workflow managed from the UI

Reviewed October 6, 2026. Scope: Arkansas procurement skill, geography/source planning, capture, interpretation, discovery/access handoffs, reviewed persistence and existing UI integration. Static review plus 26 targeted offline regression tests; all passed. No deployment, application changes, live import or cost benchmark was performed. This is a readiness review, not an implementation plan or certification of every source.

## Conclusion

Reuse the existing procurement workflow. Much of the skill already has deterministic implementations. The missing product layer is a durable server worker, authenticated request/status/review API, structured interpretation/discovery execution, and a compact UI for requests, progress, human actions and reviewed imports. Do not enable the old generator or build a second procurement pipeline.

## Prioritized findings

| Priority | Code / current behavior | Required change |
|---|---|---|
| P1 | `src/app/AppShell.tsx:945` calls the disabled `spin_generate_contracts`; that function uses `spin_contract_generation_runs` and separate source/capture logic (`supabase/functions/spin_generate_contracts/index.ts:131,157,395,460`). It does not orchestrate the current reviewed workflow. | Replace that entry point with the current procurement pipeline. Validate user session and allowed actions on a server API; retain server-only collection/import credentials. Retire the old path after replacement tests prove parity; do not immediately delete legacy tables or data. |
| P1 | `scripts/known-source-workflow.mjs:13,141` accepts a manually supplied interpretation JSON. `scripts/public-source-discovery.mjs:7` exposes gap/handoff management rather than an automated researcher. The skill and private operational helpers still supply decisions. | Implement structured interpretation: deterministic row/date/service/location screening first, bounded AI only for unresolved content. Implement official-source discovery as a separate bounded job that saves a versioned method and hands collection back to the same pipeline. Persist outputs and exact next actions. |
| P1 | `scripts/procurement-workflow.mjs:53,81` and `scripts/known-source-workflow.mjs:76,245` depend on local files, child processes and CLI execution; `scripts/lib/supabase-admin.mjs` obtains secrets through a locally authenticated CLI. Existing functions accept server authorization, not ordinary UI requests. | Extract shared services behind thin CLI wrappers. Choose one server execution host that supports the current Node dependencies, durable jobs and private evidence storage. Keep existing leases, transactional writes, idempotency and reviewed-import checks. Do not make the browser execute SQL or read privileged keys. |
| P2 | `scripts/lib/known-source-execution.mjs:202` plans all three categories even when only opportunity bounds were requested; `scripts/lib/public-source-discovery.mjs:18` likewise enumerates all three. | Persist explicit requested categories and category-specific date bases. Plan, collect, discover and report only those categories. Preserve intentional all-category requests and separate statewide SAM. Test existing requests when category selection is absent. |
| P2 | `scripts/known-source-run.mjs:148,173,217` records content/semantic changes but still sends captures to pending interpretation. Packet identity includes request scope (`scripts/lib/known-source-workflow.mjs:43`), so replay protection alone does not reuse interpretation across new requests. | Cache extracted source facts by source, meaningful content hash, parser/method and interpretation-policy version. Apply each new request's dates/location deterministically to cached facts, saving fresh request evidence. Reinterpret changed/uncertain content only. A previous request's zero conclusion is not a reusable factual extraction. |
| P2 | `scripts/known-source-workflow.mjs:164` reads all intake and intake links to report one request. `scripts/intake-snapshot.mjs:7` snapshots entire tables. `src/lib/procurement.ts:124` reloads all source configurations per queue load. | Use request/source/identity-scoped reads and lightweight status projections; cache source display metadata. Retain the constraints and relevant baselines needed for reviewed import. Index demonstrated query paths. Avoid sending raw bodies/history to the UI or model when only status is needed. |
| P1 | `scripts/lib/known-source-workflow.mjs:83` checks that finding evidence names a saved run and has a locator/excerpt, but does not establish that the excerpt occurs in that run's content. `scripts/known-source-workflow.mjs:111` checks supporting PDF signature/hash without extracting the claimed passage. These validators previously followed an actual human/agent review. | Before automated interpretation is promotable, verify evidence spans against normalized extracted bytes/text, including PDFs. Keep unknown locations/deadlines unresolved. Model-generated citations are not sufficient evidence; test fabricated quotations, altered documents and missing fields. |
| P2 | `scripts/known-source-run.mjs:70` explicitly returns an authenticated-browser handoff. The private access lifecycle tracks account/email/API states; it does not run a signed-in browser unattended. | Expose the existing handoff states and exact human actions in the UI. Public/API operation may ship first with truthful browser blockers. Choose browser/session execution separately before promising login-dependent collection or signup automation. Respect no aggregator signup and duplicate-account reconciliation. |

## Preserve

- Geography mappings, county selection confirmation on every request, city/county/state routing and independent agency scopes.
- `procurement_sources`, versioned capabilities, requests/targets, jobs/leases, audit runs/captures, interpretations, intake, reviewed lead links and private access/registration lifecycle.
- Working public, Bonfire, IonWave, ARDOT and generic API adapters; SAM's separate statewide path.
- Protected user lead fields, stable identities, immutable evidence, explicit reviewed import decisions, rollback/replay tests and live readback.

## Cost controls to implement and prove

Known structured sources should operate without model calls when deterministic extraction resolves the evidence. Use saved facts for unchanged content; read/capture once when the same source appears on multiple geography routes, then evaluate each scope separately. Share only where access, query bounds and source method permit it.

For AI jobs enforce maximum pages, bytes, relevant text, calls, input/output tokens, attempts, elapsed time and a per-request budget. Save actual model usage and configured price assumptions; expose estimates and actual usage separately. Cache results, reject untrusted page instructions and stop blocked/429 retries. No percentage savings or dollar estimate is established by this review.

Prefer one shared service implementation, fixture-based tests and small targeted live verification. Do not repeatedly research known sources or require source-by-source implementation phases. Completion is a functioning workflow; missing source content/access remains an explicitly reported gap.

## Manageable delivery

Use one plan with two acceptance milestones, not separate plans per source:

1. **UI-operated known-source workflow:** server worker/API, category bounds, deterministic extraction/cache, bounded interpretation, progress/human-action display, candidate review and actual reviewed import. Separate manual statewide SAM control. A missing method creates a persisted discovery handoff.
2. **Bounded discovery/access continuation:** run official-source discovery only for persisted gaps; save methods/private setup checkpoints; execute methods through milestone 1; prove reuse without repeated discovery. Account/browser work requires a selected session architecture; unsupported access stays actionable and blocked.

The first milestone is useful on its own, but does not fulfill automated discovery or signed-in browser collection. Do not label the whole skill converted until the agreed second milestone is evidenced.

## Acceptance evidence

- Authenticated and authorized UI-to-server execution; no privileged keys/private setup records in frontend responses.
- County confirmation each request; selected categories and date semantics only; independent agencies included; SAM separate.
- Known public/API source: request → terminal bounded capture → verified interpretation → persisted candidate → reviewed canonical import → live readback.
- Same source/content on a second request uses saved extraction without model work; changed content invalidates the relevant cache; new date/location scope is reapplied.
- One missing method is discovered, versioned and reused without source-specific geography code.
- Duplicate submissions, worker restart, lease expiry, model failure, quota exhaustion and blocked login do not duplicate leads or claim coverage.
- Unchanged structured source incurs zero model calls; ambiguous fixture stays within a declared token/call budget. Report measured counts.
- Tests preserve working import/adapters and source-access privacy; UI displays imported counts, gaps and the next human action distinctly.

## Decisions needed before implementation

Execution host; whether the first delivery includes automated new-source discovery or ships known-source operation first; browser/session availability; AI provider/model and request budget; and who can initiate runs, manage access, review candidates and import. Propose defaults from existing infrastructure and ask only where a decision materially changes deployment or product behavior.
