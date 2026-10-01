# Procurement collection and reviewed processing

This is the current operating procedure. It supersedes batch-specific preparation/import instructions in historical reports. It does not promise flawless source data or uninterrupted APIs. It requires clear failures, protected user data, explicit approvals, and verifiable outcomes.

## What must be true

1. **Authority and scope are stated first.** Define service, work area, sources and dates. Application geography research follows established source/intake persistence and verified-import authority; explicit research-only/export-only requests stop at that boundary. Explain intended changes before doing them. Honor separate scoped signup/verification and alert authority already supplied. Never infer permission for subscriptions, migrations, deployments or recurring work.
2. **The search actually ran.** Preserve official responses, exact queries, run IDs, HTTP status, retrieval method, and coverage limits. A successful function invocation is not necessarily a successful upstream API call. Unknown/blocked responses are not zero results. One complete query is not complete market coverage.
3. **Pagination is accounted for.** Page indexes start at zero. Finish each explicit query through a recognized terminal page, retaining every page. Missing/gapped pages fail validation unless partial coverage is expressly accepted in the reviewed batch. Duplicate query/page responses must be resolved, not silently summed. Respect quotas; never blindly retry a timeout or 429.
4. **Same versus different is evidence-based.** Awards match PIID + awarding subtier + referenced IDV PIID + referenced IDV subtier across sources. Modifications/options are actions under that identity, not automatically new leads. Notices match source/notice ID. Forecasts match their source identifier. Similar titles, agencies, vendors, or locations do not establish identity. A forecast/solicitation/award relationship requires corroboration, not an automatic merge.
5. **Newness, relevance, and openness are separate.** An unmatched award is not an open bid. `Active` does not prove an unexpired deadline. Check actual work sites, not buyer/vendor addresses. Preserve uncertainty, current versus potential completion, and raw values. Do not manufacture annual revenue from obligations, ceilings, options, or mixed-scope funding.
6. **Every selected intake item has a review decision.** Bind the decision to its actual payload hash. Explicitly approve each new canonical lead; leave ambiguous items deferred. Report captured-but-unreviewed records too. Never revive ignored intake or treat a whole portal/index page as a contract.
7. **Evidence and relationships are retained.** Keep intake and raw runs. Several intake records may support one lead. Link existing leads even if their payload is unchanged. `procurement_intake_leads` holds relationships; `procurement_intake_items.status` holds `pending/processed/ignored`. Processed means the evidence is saved/linked, not every uncertainty resolved.
8. **Lead upsert, links, and processing status succeed together.** Use one guarded transaction. Preserve user sales fields, original creation dates, existing source IDs, richer canonical facts, and dedicated source fields. The existing payload trigger can resynchronize old payload facts into dates/locations: test it and preserve existing dedicated values for evidence-only updates. Conflicts are evidence, not an instruction to replace canonical values.
9. **Approval identifies exact tested artifacts.** Bind review, baseline, explicit captures, SQL, and schema to the package hash. Changing artifacts or schema invalidates approval. Test against captured live constraints and lead-write triggers, including rollback and no-op replay. Do not run superseded SQL drafts or old seed/bootstrap commands.
10. **Readback establishes success.** Verify the actual persisted leads, links, statuses, protected fields, and per-lead history. A prepared file or zero CLI exit code alone is not proof. An uncertain commit outcome stops further apply attempts until readback/review resolves it. Never restore a broad snapshot over newer user work.

## Entry points and write boundaries

Application city/county research now follows the user's established source/intake persistence and verified-import intent. Explicit research-only/export-only instructions override that default. See the skill's [database persistence procedure](../.agents/skills/arkansas-procurement-leads/references/database-persistence.md). Existing scoped authorization supplies routine write authority; actual review decisions, tested package hashes and live readback remain mandatory. Do not require another generic confirmation merely because the CLI has an approval flag.

`register SPEC.json BEFORE.json SCHEMA.json NEW_PACKAGE` prepares guarded source/request registration. `stage-manual SPEC.json BEFORE.json SCHEMA.json NEW_PACKAGE` prepares evidence-bound primary/candidate intake. Both are offline packages using shared `test`, `apply --approve HASH`, and `verify`. Specs require configured project and scoped authorization. Use fresh baselines between dependent operations; source config stores only public procurement metadata, preserving earlier scopes/config. Candidate intake remains pending until primary verification. Manual-only canonical reviews use `run_ids: []`.

Source discovery and access setup use the repository's [Arkansas procurement skill](../.agents/skills/arkansas-procurement-leads/SKILL.md). Its [source/access ledger](../.agents/skills/arkansas-procurement-leads/references/api-access-and-tracking.md) persists under ignored `outputs/procurement-access/`; it is separate from intake/canonical data and the batch `status` command below. The [mailbox procedure](../.agents/skills/arkansas-procurement-leads/references/accounts-and-email.md) requires strictly read-only Gmail or manual verification. Authorized [signup-action alerts](../.agents/skills/arkansas-procurement-leads/references/signup-alerts.md) use Resend with independent send/delivery evidence. No local access record implies database import, working authentication or recurring monitoring.

Original research CLI:

```powershell
python lead_discovery.py workflow --repo C:/Users/sherr/janitorial-lead-gen help
```

Repository CLI (run from this repository):

```powershell
node scripts/procurement-workflow.mjs help
```

The Python entry point forwards the same arguments with no shell interpolation. Use either entry point; do not run both for the same operation.

| Command | Network/database effect |
| --- | --- |
| `sam-search` | One real SAM API request; writes response audit only, not leads/intake |
| `stage ... --confirm-stage` | One intake insert/upsert request; ignores existing identities, never overwrites them or writes leads |
| `snapshot`, `schema` | Read-only database access; saves private local audit files |
| `register`, `stage-manual` | Offline source/request or document intake packages; shared tested `apply` performs the write |
| `init`, `inventory`, `prepare`, `test`, `status`, `verify` | Local files/tests only; `verify` evaluates a supplied readback snapshot |
| `apply ... --approve HASH` | Explicit live transaction, followed by live readback; requires matching test receipt and unchanged schema |

The project is deliberately pinned to `zreplhkoxswtzxlchtjf`. Request ID, state, batch name, capture run IDs, and review decisions are inputs—not the prior three award approvals baked into code. This is not a multi-project deployment tool; a different project needs deliberate setup and schema validation.

## 1. Search and capture

Use the existing `sam-search` command with explicit dates/filters. The SAM key remains inside Supabase. Never request it in chat, move it to local `.env`, or embed it in the frontend. The trusted runner gets its server authorization through the authenticated Supabase CLI and does not print/store credentials.

Search NAICS and service words independently. Record geography and date-window blind spots, including multi-state notices. Save all page responses. The search CLI now exits nonzero on upstream errors or incomplete query results, while preserving their audit—nonzero does not mean there are no useful records.

Forecasts remain a separate official-document/browser collection path; no verified SAM forecast endpoint exists here. Use `stage-manual` with actual saved evidence files, stable record identities, mapped source/request UUIDs, confidence and field-level provenance; then test/apply/read back intake and review primary findings for canonical import. No automatic scraper or account creation is implied.

## 2. Stage API captures without changing canonical leads

Create a capture scope containing the configured project and the exact saved run IDs:

```json
{
  "project_ref": "zreplhkoxswtzxlchtjf",
  "run_ids": ["ACTUAL-SAVED-RUN-UUID"],
  "allow_partial": false
}
```

```powershell
node scripts/procurement-workflow.mjs stage CAPTURE_SCOPE.json outputs/sam-search NEW_STAGE_RECEIPT.json --confirm-stage
```

This groups award actions by full identity and stages distinct notices. Existing pending, processed, or ignored intake is never overwritten. Subsequent award evidence is read from the explicitly selected new captures during preparation; the original intake remains provenance. New notices cannot be promoted from a stale normalized intake that disagrees with the reviewed current capture—stop and review that normalization rather than overwriting intake silently. Retain each stage receipt: inserted versus existing-preserved counts are not canonical lead counts.

## 3. Snapshot and make explicit review decisions

Keep packages under the Git-ignored `outputs/procurement-batches/` directory. Snapshots can contain user notes. Choose new filenames; commands will not overwrite existing audit files. Create the parent directory before saving a standalone snapshot/review file.

```powershell
node scripts/procurement-workflow.mjs snapshot outputs/procurement-batches/before-NEXT.json
node scripts/procurement-workflow.mjs schema outputs/procurement-batches/schema-NEXT.json
node scripts/procurement-workflow.mjs inventory outputs/procurement-batches/before-NEXT.json
node scripts/procurement-workflow.mjs init outputs/procurement-batches/review-NEXT.json
```

Schema snapshot paths currently must be simple workspace-relative paths (letters, digits, `_`, `-`, `.`, `/`); do not use paths with spaces for this command. The snapshot is read-only and paginated, not a single database-wide consistent transaction. During heavy concurrent activity, use a quiet window and reconcile any verification conflicts; never suppress them.

Fill the generated review template. It intentionally cannot pass validation untouched. Use the existing search-request UUID; do not invent one. Describe coverage limitations and the reviewer. A decision to process an already matched award looks like:

```json
{
  "intake_id": "ACTUAL-INTAKE-UUID",
  "intake_hash": "SHA256-FROM-INVENTORY",
  "action": "process",
  "reason": "Verified full contract identity; retain conflicting dates as evidence"
}
```

For a new lead, add `"approve_new": true` and a factual `"request_match_reason"`. Uncertain work location additionally requires `"allow_location_uncertainty": true`; explicitly state the conflict in `reason`. New request links conservatively use `needs_location_review`; this workflow does not automatically upgrade geographic certainty. New SAM notices also require `new_bid_type` of `opportunity`, `historical_opportunity`, or `award`; elapsed deadlines cannot be represented as open opportunities.

A deferred item uses `action: "defer"`, its hash, and the reason, with no promotion/target instructions. Captured records omitted from the decisions are reported as unreviewed, not silently imported or labeled complete.

An explicit cross-source notice-to-award link requires `target: {"source_code":"usaspending","external_id":"FULL-EXISTING-ID"}` plus `contract_identity`, corroborated by an award in the selected captures. A historical detail-page backfill requires an exact existing target and `match_evidence` containing `source_url`, `solicitation_id`, and `exact_text` from the captured page that explicitly includes that identifier. Page indexes and title-only matches remain deferred. Existing multi-lead/conflicting mappings stop for separately reviewed handling; no mappings are deleted or forcibly reduced to one.

## 4. Prepare and test—still no live import

```powershell
node scripts/procurement-workflow.mjs prepare REVIEW.json BEFORE.json CAPTURE_DIRECTORY SCHEMA.json outputs/procurement-batches/NEW_PACKAGE
node scripts/procurement-workflow.mjs test outputs/procurement-batches/NEW_PACKAGE
node scripts/procurement-workflow.mjs status outputs/procurement-batches/NEW_PACKAGE
```

The package contains the review, baseline, exact captures, current schema, manifest, and generated SQL. IDs for new rows are deterministic for the batch/source/external identity. The approval hash binds the manifest, SQL and schema. `status` reports preparation and receipts; it never claims that preparation equals application.

The offline SQL test uses the pinned local PGlite dependency installed by `npm ci`. No external research folder or module path is required. An optional explicit module path remains supported for compatibility; no package is downloaded automatically. It loads actual captured data/constraints and lead-write triggers, injects a failure after canonical upsert to prove rollback, verifies results, then proves exact replay preserves timestamps and history. It does not emulate production authentication/RLS, network failures, or simultaneous sessions. The process requires human review of service/geography and source truth; tests cannot establish those facts.

Review counts and proposed changes, including evidence differences and every unresolved record. Neither an unchanged lead nor a new observation timestamp should masquerade as a new contract. Existing canonical values are retained; replacing a disputed canonical fact requires separate reviewed authority.

## 5. Apply only the exact authorized package

Within established scoped user authority, review/test the actual additions and explain the counts before running. The hash binds the reviewed artifacts; it is not a fabricated user-issued approval.

```powershell
node scripts/procurement-workflow.mjs apply outputs/procurement-batches/NEW_PACKAGE --approve EXACT_REVIEWED_SHA256
```

The CLI validates package integrity, requires the matching offline test receipt, reads current schema and rejects drift, saves a pre-apply snapshot/intent receipt, submits the guarded transaction to the pinned project, reads back live data, and records verification. No UI deployment is part of this workflow. If the published app uses the same project, refresh it and account for current filters.

## 6. Recovery and honest reporting

- An upstream error/unknown envelope: preserve the raw audit, stop claiming completeness, fix access/query/parsing before another authorized call.
- Incomplete pages: capture the missing pages or explicitly accept limited coverage with documented limitations; never claim the whole source was searched.
- Changed files, schema, intake, source facts or conflicting links: regenerate from a fresh snapshot, test and review the new hash within existing scoped authority. Do not bypass guards.
- Apply timeout/error or failed readback: status is `commit_unknown` or `verification_failed`, not success. The package blocks blind repeat applications. Take a new read-only snapshot and use `verify PACKAGE NEW_SNAPSHOT NEW_REPORT` to examine outcomes. Compare intended and actual rows before deciding whether a fresh guarded package or a separately authorized forward correction is needed.
- A `verify` result based on saved snapshots is evidence for those snapshots, not a new live check. Preserve the original intent/result receipts. A verified recovery receipt may be saved inside the package as `receipt-recovery.json`; it binds the same approval hash. Never forge/edit a receipt to bypass a blocker.
- Never use broad rollback/deletion or a full database snapshot restoration to undo a committed batch over later user edits.

Final reporting must distinguish: source rows returned; distinct awards/notices; intake newly staged versus already present; proposed versus actually added leads; evidence updates; unchanged matches; links; processed statuses; unresolved/ignored items; and coverage limitations. Include lead identifiers and the verification receipt. Do not report “done” if the requested import only exists as SQL on disk.

## Maintained historical artifacts

`docs/SAM-SEARCH-PLAYBOOK.md` and `outputs/sam-search/RESULTS.md` document the successful September 16 run. The old `prepare-sam-upserts.mjs` and `prepare-intake-processing.mjs` remain historical batch tools, not entry points for a new batch. Do not run the old `007` or superseded `008` SQL drafts. The original Python CLI now forwards this current workflow instead of requiring users to discover disconnected scripts.

## Validation of this workflow update

The original Python CLI's help/forwarding was exercised. The existing 12 capture/identity regression tests passed, and ten reusable-workflow tests passed, including real captured-data preparation, changed approval/package rejection before credential access, partial/error/unknown responses, manual forecast review, expired-notice classification, committed-snapshot verification, and local SQL rollback/replay with captured production constraints and lead-write triggers. Syntax and whitespace checks passed.

Historical validation above describes the earlier runner update. On September 30, 2026 the database persistence build additionally exercised source/request registration, evidence-bound manual staging and two canonical imports on the pinned Supabase project. Live receipts verified nine new sources, five enriched existing sources, two geographic requests, four intake records, two leads with evidence/history links, and two pending candidates. Each package passed current-schema rollback/readback/no-op replay tests. Future batches still require fresh evidence, tests and live readback.


## Manual observations and reviewed request links

Keep a finding's stable external_id when recapturing it. When the payload or provenance changes, provide amends_intake_id referencing the prior same-source manual intake. Staging creates a separate deterministic observation identity; it never overwrites the original. Replaying the same observation is a no-op. An ignored parent cannot be revived this way.

Before promoting an amendment, its parent must already link to the same canonical lead. Review the original first when that link is missing. Title similarity is insufficient. Primary evidence is still required for promotion. Changed source facts add immutable provenance to the existing lead; this does not silently replace previously verified canonical fields. Retrieval/request-only observations add intake relationships without business-change events.

Include a factual request_match_reason when reviewing an existing lead for an additional request. The planner can now add a missing request relationship independently of lead creation. Existing relationship classifications remain intact; new links retain needs_location_review where appropriate. Statewide evidence alone does not establish local performance.

Evidence entries allow url, content_sha256, excerpt, retrieved_at, locator, optional capture_kind and the local-only local_path. field_basis is a bounded map of field names to text explanations. Validation covers the final payload, including provenance and authorization references; never place credentials or private account/email contents there.

Schema/policy migrations invalidate older schema-bound import packages. Preserve the originals; prepare and test a new package with fresh schema/snapshots. The test command uses local PGlite and does not require an external module path.

## Authenticated queues and deployment

All signed-in accounts may read shared procurement data and use the validated single/bulk stage RPCs. Anonymous table/RPC access is revoked; private account/membership records and author-only note changes retain their restrictions. Server imports continue through their existing credentials and reviewed packages. Source configuration is shared with signed-in users, so it must never contain credentials or private mailbox contents.

Queue results use 50-row pages with server-side filters and full-data counts. Checkbox selection applies only to explicitly checked records across visited pages; changing filters clears it. Sorting has a record-ID tie breaker. Each RPC is snapshot-consistent, but separate pages are not one frozen snapshot: concurrent inserts or edits can move records between pages. Refresh reconciles current results; it is not a bulk export. Detail payloads load on selection.

Keep Generate disabled and `spin_generate_contracts` undeployed until it has authenticated callers, bounded costs/rates, outbound URL/redirect controls, validated typed filters and canonical reviewed-import integration. No paid generation service is activated by this remediation.
