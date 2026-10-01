# Application database persistence and source reuse

This user's application research requests include routine source/request registration, candidate intake and verified-finding import. Honor existing scoped authority without another generic permission question. Explicit research-only/export-only instructions override this default; signup/email/subscriptions/deployment require their own authority. Explain reviewed counts before writes. Local files and prepared SQL are not completion.

Read the maintained `docs/PROCUREMENT-WORKFLOW.md` and live schema before processing. Use existing pinned Supabase access; no historical seed SQL, mocks or frontend server keys.

1. Take fresh `snapshot`/`schema`; read database source coverage/request associations and supplemental local access ledger. Match provider/agency/official URL identities, reuse known sources/access and recheck stale coverage. Discover missing agencies. Source coverage, buyer/vendor addresses and shared portals never prove contract work location.
2. Prepare a `register` spec: `version:1`, pinned `project_ref`, scoped `authorization`, `requests`, `sources`. Requests specify local `key`, name, Arkansas city/county `requested_search_areas`, `service_scope`, `search_windows`. Sources specify `local_key`, code, name, provider/agency, official URL, record category, geo level, request keys, public metadata and factual `identity_evidence`. Existing aliases bind `existing_id`. Map SAM notices/awards separately; keep distinct agency tenants separate. Ambiguous aliases require review.
3. Run `register SPEC BEFORE SCHEMA NEW_PACKAGE`, shared `test`, then `apply --approve HASH` under established authorization. This unions `source_coverage_areas` and `config.research_persistence` request metadata while preserving older config/scopes. Source config is readable by all signed-in users after the October 1 access migration: never store credentials, mailbox contents, tax details, private connection records or tokenized URLs. Save verified mappings/receipts and merge database UUIDs into the local ledger.
4. For documents prepare a `stage-manual` spec with selected `findings`: registered source UUID, actual geographic request UUIDs, stable record `external_id`, normalized payload, review reason, primary/secondary confidence, field bases and evidence URL/SHA-256/excerpt/retrieval time/page or row locator. Each evidence entry supplies `local_path` to actual captured bytes: staging checks the hash and copies bytes into the immutable package; package test/apply checks them again. Local paths are stripped from database evidence. For secondary discovery summaries, label the captured summary as attributed rather than claiming the webpage itself was downloaded. Preserve originals privately; authoritative URL/excerpt must remain useful on another machine. Index pages are sources, not individual leads.
5. Prepare/test/apply/read back intake. Preserve existing intake originals/status/links; changed evidence uses the stable external_id plus amends_intake_id referencing the original same-source manual intake. Only primary evidence can be promoted. Expired solicitations stay historical; board approval stays provisional; renewal options are not forecasts. Attach corroborated protest evidence to its solicitation, not an invented winning award.
6. Build explicit payload-hashed process/defer decisions and actual geographic request IDs. Manual-only packages use `run_ids: []`; no unrelated SAM staging is needed. Reuse canonical prepare/test/apply/readback and protect user fields/history. Use `needs_location_review` where site boundaries remain unresolved. Secondary candidates stay pending with next actions.
7. Verify application loader records and truthful historical/provisional presentation. Report verified source/request IDs, inserted/reused intake and lead counts, links and deferred items. Refresh/filter the existing connected app; database-only work needs no deployment. Reconcile unknown commits through fresh readback before retrying; preserve receipts and never restore whole snapshots.

```powershell
node scripts/procurement-workflow.mjs register REGISTRY_SPEC.json BEFORE.json SCHEMA.json NEW_PACKAGE
node scripts/procurement-workflow.mjs stage-manual MANUAL_SPEC.json BEFORE.json SCHEMA.json NEW_PACKAGE
node scripts/procurement-workflow.mjs test NEW_PACKAGE
node scripts/procurement-workflow.mjs apply NEW_PACKAGE --approve REVIEWED_PACKAGE_HASH
```

The first two commands prepare locally; `apply` writes. Repeated exact verified packages are skipped. Offline replay tests prevent duplicate records/history. Database source reuse enables future geography research, not complete market coverage or recurring monitoring.


## Manual observations and reviewed request links

Keep a finding's stable external_id when recapturing it. When the payload or provenance changes, provide amends_intake_id referencing the prior same-source manual intake. Staging creates a separate deterministic observation identity; it never overwrites the original. Replaying the same observation is a no-op. An ignored parent cannot be revived this way.

Before promoting an amendment, its parent must already link to the same canonical lead. Review the original first when that link is missing. Title similarity is insufficient. Primary evidence is still required for promotion. Changed source facts add immutable provenance to the existing lead; this does not silently replace previously verified canonical fields. Retrieval/request-only observations add intake relationships without business-change events.

Include a factual request_match_reason when reviewing an existing lead for an additional request. The planner can now add a missing request relationship independently of lead creation. Existing relationship classifications remain intact; new links retain needs_location_review where appropriate. Statewide evidence alone does not establish local performance.

Evidence entries allow url, content_sha256, excerpt, retrieved_at, locator, optional capture_kind and the local-only local_path. field_basis is a bounded map of field names to text explanations. Validation covers the final payload, including provenance and authorization references; never place credentials or private account/email contents there.

Schema/policy migrations invalidate older schema-bound import packages. Preserve the originals; prepare and test a new package with fresh schema/snapshots. The test command uses local PGlite and does not require an external module path.

