# 05C1 — County solicitation/addendum identity and targeted repair

## Implementation

The existing collector, staging, automatic county policy, reviewed batch planner, SQL transaction, isolated rehearsal and verified readback remain the import path. A source-specific resolver proves IonWave issuer/base solicitation/issue-date identity from primary published listing excerpts. The captured portal ID, display bid number, revision, URL and evidence remain attached. Supported explicit suffixes are `Addendum N` and `Amendment N`; other formats remain exact-ID imports or explicit identity issues when an apparent repeat lacks proof. Title/city/date similarity alone never merges leads. Different issuers, sources, issue dates or solicitation numbers remain separate identities.

The importer retains the existing canonical ID/external ID and protects sales fields. Original and addendum in a batch use one lead regardless of listing order. The final SQL checks a bounded complete source payload baseline under the existing table lock, rejecting competing aliases, stale imports or repaired identities. Identical source observations remain unchanged. Staging-derived identity is rederived from verified evidence during county validation. SAM and unrelated prepared import SQL remain byte-identical; affected old IonWave prepared packages must be reconciled/regenerated if their prior exact package no longer matches. No uncertain write is replayed blindly.

## Clearwater repair

Read-only shared-data inventory confirms original `7cf2cd5e-abe8-546f-acde-feacb18d2d7b` (1642 / 26003) is Applied; duplicate `5a5c4bb3-32af-5d49-a186-4a6f69938e10` (1760 / 26003 Addendum 1) is New. The original has a saved stage-change row. All lead FKs were inventoried: contacts, source events/versions, intake/request links, lead links (both directions), notes and stage changes; note edits follow parent notes.

The typed repair retains both rows and every FK/history row. It adds proven addendum evidence/aliases and an audit correction to the original and a canonical redirect to the retired duplicate. Current queue reads exclude only that typed retirement; reporting resolves immutable receipt identities and deduplicates the current exact member set. Historical receipts retain their original IDs/outcomes. Snapshot fingerprints change with canonical membership so stale links fail safely rather than silently opening a different cohort. Source versions/events record the two payload corrections; notes/stage history are not edited. Old/stale detail reads resolve to the original with a concise notice and original owner history. Conflicting duplicate sales data or changed protected baselines stop repair.

`scripts/prepare-county-duplicate-repair.mjs` is offline and manifest-only; there is no implicit database/apply mode. It requires exact UUIDs, a complete private snapshot and a new output directory, retaining baseline, hashes, SQL and rollback instructions. Existing deployment scripts are not changed. The reviewed package is under ignored `outputs/deployment/05C1/reviewed-repair/`; its native rehearsal uses the existing restricted validator and rolls back all copied objects. Never commit snapshots/user data.

## Release order and rollback

Release/repair authorized and completed on 2026-10-23 at runtime commit `019c660` (`fix: reconcile county solicitation addenda`). Render deployed first, then Netlify preview `6adb88efe445f47c1f3a3135`, followed by the guarded two-record repair. The following checklist records the rollout/rollback contract:

1. Review the exact code, migration and private repair manifest. Refresh the shared baseline and rerun native rehearsal if either lead or protected relationship/history changed.
2. Apply `20261023000100_canonical_county_lead_reads.sql`. It reuses the current queue RPC verbatim apart from the typed retirement exclusion; existing pagination, date/quarter, stage/filter/count logic and permissions remain.
3. Release the matching Render backend, then the authorized Netlify preview. Verify compatible reads and current import jobs before the targeted data repair. Netlify production stays locked/unchanged.
4. Apply only the tested two-record SQL package with exact manifest/SQL hashes and successful native receipt. For this one-time repair, the existing Supabase administrative query path supplied the protected notes/history locks that the worker role intentionally lacks; no worker privileges were expanded. Recheck all protected data and source baselines transactionally. No broad historical reconciliation or source research is required.
5. Read back one ordinary Clearwater lead, both proven aliases, original Applied stage and unchanged notes/stage history/FK rows. Verify old duplicate lookup resolves to original, exact analytics member sets/counts agree and immutable receipts remain unchanged. Rehearsed manual and scheduled worker positives already establish import execution; do not spend AI simply to generate dashboard results.

Rollback retains both rows and all evidence. Preserve the private pre-repair baseline and native receipt. Pause only affected work while reconciling; compare exact post-repair rows and protected dependencies. If no later user/source edits occurred, rehearse a guarded restoration of just the two baseline payloads, preserving dedicated/sales fields and recording corrective source events. If later changes occurred, prepare a separately reviewed correction instead of overwriting them. Do not delete history or rewrite receipts. The read migration is backward-compatible without redirects and need not be removed merely to undo retirement.

## Verification checkpoint

- Frontend: 167 tests / 22 files passed serially; longer runner timeouts accommodate the Windows host, with unchanged assertions. Lint and production build passed (existing chunk-size advisory). SQL import/rollback/concurrent-user-edit suites passed. Final identity compatibility suite: 12 passed. Earlier forked-worker timing/stall attempts were superseded by the complete passing serial run.
- Full offline workflows: 384 passed before the last additional alias-parent regression; final focused import/identity/repair/rehearsal/analytics/queue suite: 26 passed.
- Native PostgreSQL/PostgREST acceptance passed, including actual manual public-detail addendum import and a naturally due scheduled repeat, with one canonical source lead and protected Applied stage/notes. Existing SAM, scheduling, private permissions and audit checks passed.
- The exact saved-data repair passed native PostgreSQL 17.4 validator rollback/readback/replay/cleanup. Rehearsal copied 1,432 rows, approximately 1.09 MB, and sent no production repair.
- Browser fixture acceptance: canonical lookup, persistent reconciliation notice, original owner notes, desktop/390/320, keyboard and 200% zoom passed for the changed detail region, with zero workflow mutations.
- Existing unrelated limitation: the Leads `.summary-wide` status strip extends beyond narrow viewports. The reconciliation detail region fits. Current CSS is untouched; this task does not silently redesign that strip.
- Authorized shared migration, Render/preview release and exact two-record repair are applied and verified. Live queue search returns one Clearwater lead in Applied; exact added/unique metric members resolve to that same ID (one member, formerly two). The old duplicate lookup resolves to the original, including in a simulated stale queue using real saved data. Sales/FK/history baselines and exactly two new source-correction events verified; repair replay is a no-op. All APIs returned 200, anonymous/private boundaries and preview CORS passed, five preview assets matched the committed build, and configuration hash remained unchanged. No history/data/API deletion. 05C2 remains separate and unimplemented. Netlify production remains locked at `6ad583d1b9bb1b307abcf1fd`.

Local receipts/logs/screenshots: ignored `outputs/deployment/05C1/` and `outputs/deployment/admin-ui/05C1/`. These paths include private data; publish only sanitized outcomes.

## Final acceptance

05C1 is complete and moved to done. There are no remaining repair or product decisions for this case. Limitations are the deliberately narrow published IonWave grammar and the unrelated existing mobile status strip noted above. The runtime is `019c660`; a documentation-only follow-up records completion. Private release receipts are in `outputs/deployment/05C1-release/`. No production Netlify release occurred.
