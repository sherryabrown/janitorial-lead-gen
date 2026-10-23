# 05C1 — County addendum identity and Clearwater duplicate repair

Status: complete and accepted, 2026-10-23. [Implementation, verification and guarded rollout](../../docs/reviews/2026-10-23-county-addendum-identity-and-repair.md). Runtime commit `019c660` is deployed to Render and the Netlify preview; migration and targeted repair/readback passed. Original Applied stage and sales/history/FK data preserved. Netlify production unchanged. Parent: [Admin workspace](../todo/admin-workspace-redesign.md). Amendment to accepted [05C](05C-history-submit-and-analytics-overview.md). [05C2](../todo/05C2-schedule-execution-table-and-metric-clarity.md) remains planned; Phase 6 still follows.

## Initiating request and confirmed decision

User invoked plan-code on 2026-10-23: the same Clearwater project, city and dates was imported as a new lead instead of updating the existing lead; also requested schedule run date/ID ordering, one execution table and clearer analytics completeness wording. This child covers identity/import repair; 05C2 covers presentation. Planning only; do not implement, migrate, repair live data or deploy during planning. Keep Netlify production unchanged.

Confirmed: retain the original Clearwater lead, preserving its Applied stage and notes; attach addendum evidence to that canonical lead. Keep an audit trail. Stop for conflicting user-entered data rather than choosing a winner silently.

## Evidence and current implementation

Read-only saved-data inspection at `c1f1554` found two records under the same `wastewater` source (`0dc0e3ad-5515-501f-b5ce-8ba02b67d00a`):

| Record | Canonical lead ID | Saved external ID | Published listing evidence |
| --- | --- | --- | --- |
| Original, keep | `7cf2cd5e-abe8-546f-acde-feacb18d2d7b` | `1642` | Bid number `26003` |
| Duplicate/addendum | `5a5c4bb3-32af-5d49-a186-4a6f69938e10` | `1760` | Bid number `26003 Addendum 1` |

Both saved listing excerpts identify Little Rock Water Reclamation Authority, the same complete project title, issued 10/4/2026 and closing 11/5/2026 02:30 PM CT. Their official detail URLs differ by `bidID`. The original has twelve linked processed intakes; the duplicate has one. These are saved observations, not a fresh assertion that the current portal still publishes both pages. Browser display alone cannot establish safe canonical identity.

- `public-html-table.mjs` retains `bid_number`, organization and public row/detail ID in collected records. The saved canonical payloads do not expose a top-level solicitation ID for these observations; bid numbers remain in saved evidence excerpts.
- `county-automatic-import.mjs` groups by source/record external ID and approves validated new records when that exact identity is absent. Its cross-source guard does not connect these same-source differing portal IDs.
- `reviewed-batch.mjs` resolves exact source/external IDs; explicit same-source targets must also match that external ID. A new alias must be proven and checked here, not merely injected into an unchecked decision.
- `hosted-import.mjs` already snapshots source leads/intakes/links for rehearsal; reuse this pipeline, `research-persistence.mjs`, native rehearsal, batch readback and receipt reporting. `verified-reporting-records.mjs` supplies post-verification reporting outcomes.

The demonstrated gap is addendum-to-solicitation identity, not title normalization alone. Do not turn same-title/city/date similarity into a general automatic merge rule. Similarity should trigger a bounded identity check before a potential new insert; independently numbered procurements remain separate.

## Boundaries

Preserve automatic valid imports for manual and scheduled runs, evidence/location/date validation, classified transitions, freshness, deduplication, notes, sales stages, history, AI settings/budgets, queue behavior, SAM identity rules, Companies and email previews. No provider-access work, paid search or unrelated deadline/display changes. Missing identity evidence is an explicit issue with a next action, not a silent merge or an approval gate on all valid leads.

## Phase 1 — Proven solicitation identity in the existing import path

1. Add a captured fixture from the saved original/addendum listing evidence and linked intake identities. Establish the official issuer and base solicitation relationship using retained primary evidence; fetch only supported public detail/listing evidence if more proof is necessary during implementation. Record any evidence gap instead of assuming a relationship from the title. No challenge bypass.
2. Preserve the original display bid number, issuer, portal record ID, evidence locator/hash and URL as structured provenance from collection through interpretation and staging. Derive a source-scoped base solicitation only for a verified published addendum/revision format (e.g. `26003 Addendum 1` → base `26003`, revision `Addendum 1`). Do not globally strip suffixes from unrelated identifiers. Validate against the source's published fields and issuer; treat contradictory facts, multiple potential canonical targets or unproven cross-source matches as issues.
3. Implement one shared resolver used by automatic planning and final `planReviewedBatch` validation. Resolution precedence: existing proven record alias / exact record identity, then uniquely proven issuer/base solicitation relation. Preserve exact-ID behavior for all unrelated paths, including SAM/awards. Keep original lead ID/external identity stable; retain all observed external IDs and URLs as aliases/evidence. Use an additive private identity mapping only if existing provenance/intake links cannot enforce atomic uniqueness; avoid a parallel importer. If a mapping is needed, key it by source + issuer scope + observed ID, reference the canonical lead, retain proof, deny browser writes and test native permissions.
4. Recheck proof and target payload/link baselines inside the atomic SQL transaction. Concurrent first observations, replay, two source routes and stale snapshots must produce one canonical lead or a precise safe conflict. Snapshot/SQL/readback must include the proven aliases and any affected FK parents; no broad unbounded title scan. Index any new lookup needed by actual query plans.
5. A new addendum updates verified source facts/evidence on the existing lead while preserving user data. Retrieval-only repeats remain unchanged and must not manufacture business changes. Refresh reporting receipts with the actual canonical ID: addendum is updated when facts/evidence materially change, never added; identical repeats are unchanged. No historical receipt rewriting to fabricate an earlier outcome.

## Phase 2 — Targeted existing-duplicate reconciliation

1. Produce a read-only repair manifest for the two IDs above. Inventory all actual foreign keys, notes, note edits, stage changes/current stage, request/intake links, versions/events, stored receipt identities and saved deep-link behavior. Do not assume only `procurement_intake_leads` references leads. Include expected hashes/counts and original/addendum evidence.
2. Keep `7cf2cd5e-abe8-546f-acde-feacb18d2d7b` and its current sales data. Add the `1760` alias and its intake/evidence without losing original captures. Deduplicate relationship rows safely. Retain user-authored history and attribution; differing meaningful user data requires an explicit conflict report, not overwriting or dropping notes. Current user data must be checked again at repair time.
3. Retire the duplicate from ordinary Leads and exact cohort results using the repository's existing reconciliation/history patterns where possible. Do not hard-delete evidence/history or leave an ordinary duplicate behind. If no existing representation supports safe retirement, add a minimal auditable canonical redirect/tombstone with controlled reads. Old duplicate links resolve to the retained lead with a concise notice. Repair is idempotent and records before/after identities and why; provide rollback procedure before live execution.
4. Preserve immutable historical run evidence (a past receipt really did contain the duplicate ID). Teach current exact-member/read projections to resolve repaired IDs consistently, deduplicate canonical members and retain the alias provenance in the report identity snapshot. Recompute the current count and linked member set together so an old count cannot silently open a different cohort. Stale snapshot checks remain. Do not count one repaired lead twice or relabel old run events without an explicit correction record.
5. Rehearse the manifest in disposable native PostgreSQL/PostgREST with protected-data and readback assertions. A later build may prepare the repair, but applying it to shared data must occur only in the authorized release/repair step after exact reviewable evidence exists. No general historical mass merge.

## Phase 3 — Acceptance and release readiness

- Unit/workflow: 1642 original +1760 addendum resolves to original; original and amendment arriving together/in reverse order; exact repeat; changed deadline/addendum evidence; unrelated same title/city/dates with different solicitation; different issuer/source; missing base identity; ambiguous aliases; rejected out-of-scope/expired evidence; stale/cancelled requests; conflicting classifications and older captures.
- Native: transaction race/replay uniqueness, rollback, protected sales fields and notes/history byte-for-byte preservation, FK-safe repair, no-op repair replay, browser denial for private mapping, immutable receipts with correct canonical member projection and no count/link mismatch. SAM and award identity regressions stay unchanged.
- Manual and scheduled synthetic positives must use the existing worker/import pipeline, not a standalone repair-only helper. Count added/updated/unchanged from verified readback. Test exact lead links and searches after canonical resolution.
- Read-only real-data checks confirm both alias identities resolve to the retained Clearwater record after an authorized repair; no extra AI/research run needed just to populate metrics. If shared repair remains unauthorized or conflict-blocked, keep required live acceptance outstanding and document exact state.
- Run `npm run check`, `npm run test:access` and affected import/report/Leads browser tests. Verify desktop/mobile/keyboard/200% zoom if any redirect or notice UI changes. No unrelated layout changes.
- Document code/data changes, migration applicability, repair manifest/rollback, tests and limitations. Update parent/Phase 6. Move this plan to done only after required acceptance passes. No commit/push/deploy implied by planning. Production Netlify unchanged.

## Success criteria

Supported verified addenda update one canonical lead through manual and scheduled imports. Clearwater has one ordinary visible canonical lead with its original sales data, complete evidence and auditable alias repair. Independent solicitations remain distinct. Exact metric counts and member links agree. No unresolved product decision for the demonstrated case; unexpected user-data conflicts remain explicit exceptions.

## Completion evidence

167 frontend tests, 384 full offline workflow tests, 26 final focused checks, 12 identity compatibility checks, SQL/native access checks and native exact repair rehearsal passed. Live preview queue and canonical member counts both show one Clearwater lead, old-ID redirect works, and desktop/mobile/keyboard/200% zoom reconciliation context passed. No deletion; all prior evidence and receipts retained. See the linked verification report for the existing out-of-scope mobile status-strip limitation and administrative repair transport choice.
