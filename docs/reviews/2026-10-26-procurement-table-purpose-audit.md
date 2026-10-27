# Procurement table purpose audit

Observed October 26–27, 2026. Phase 1 evidence register; final migration/role/consumer reconciliation remains required before release.

## Inventory and observation limits

The read-only live catalog contains **42 base tables**, all in public, no partition children, and four procurement views (schedule activity, deletion, overview and work reservations). The repository declaration seed has the same 42 names. Proposed issue tables are not approved: reuse action_requests/events instead. No private rows or credentials are copied into this report.

Statistics are cumulative counters with an **unknown start** (database stats_reset is null). Estimates are not exact row counts; -1 means unanalysed, not empty. Reads include maintenance and test traffic, so counters do not prove business activity or external integrations. Function references are source-text candidates, including historical *_before_* compatibility functions; they require reachable-call review, not an assertion that every matching function runs. SQL consumers prevent equating absent JS references with dead storage.

The catalog evidence also records columns, FKs, policies and noninternal triggers in ignored local receipts. Repository references below include operator/recovery consumers; merely inspecting a table is distinguished from an active application consumer in each purpose. Existing data retention is preserved: no new automatic deletion or archival retention period is invented. A separate retention policy can be agreed later without deleting evidence in this release.

## Role authority and authorized boundary

Supported backend readback: Render deployment `dep-dbdrah0m7kps73beh9gg` is live at commit `617442642c6fee33f7fa18c289d808e809351a60` (created October 23). The checked-out base is `858c130e8583d87ee834f0cf6492982a3c992bfb`; `git diff --name-only` between those commits for scripts, src and supabase is empty. The operational source audit therefore covers that supported deployed code as well as the local base. New uncommitted release changes are additive and separately tested. No unknown external client is claimed absent; preserving existing service RPCs and history avoids silently removing their contracts.

Verified profiles: UUID primary key distinct from unique user_id → auth.users(id); app_role default user; live assigned values user/admin (31/2 at observation). Existing own-row INSERT/UPDATE policies and table grants permit self-assigned roles; no profile trigger protects them. The user explicitly authorized **only the role-protection exception** on October 26. All other table mutations must target procurement_*; profiles is otherwise read-only. No role assignments are changed.

## Storage and remediation manifest

- Keep one current source decision in existing procurement_action_requests (review kind), with scoped identity/version/exclusion. Keep append-only decision/observation events in existing procurement_events with unique idempotency keys. Preserve existing action delivery fields and domain event producers/consumer acknowledgement. Do not add procurement_source_issues or procurement_source_issue_events.
- The user confirmed no external writer and approved retirement of procurement_members after preserving history. Migration `20261026000500` archives every original record losslessly in Admin-only events, verifies equality, replaces all five live membership policies and drops the table with RESTRICT. An unexpected dependency aborts the whole transaction; this rollback is tested.
- Keep the existing event receipt RPC contract. There is no evidence of an active delivery consumer in this observation window, but removing pending/acknowledge would change a supported service contract and risk replay. Retention is a compatibility decision, not a claim of active notification work. No new external messages or deliveries are introduced.
- No other table removals or identity changes are approved. Existing tables have distinct granularity/recovery/retention contracts below. Safe source labels are a read projection of canonical sources, not another table/cache.
- Before cutover: rehearse additive migrations, assert roles and safe projections, verify review CAS/replay/history/exclusions and unchanged protected lead fields. Reconcile the final catalog and actual supported deployment dependencies. Rollback must preserve additive decision/audit records and role protection; do not restore an old insecure permission boundary.

## Table register

### procurement_access_handoffs

- **Owner/purpose:** Access workflow. One source/channel/tenant access assessment and resumable human action. Registration credentials and access evidence are not schedule outcomes.
- **Disposition/lifecycle:** Retain operational; versioned access history must survive source repair.
- **Repository reader/writer/recovery entry points:** `scripts/lib/hosted-attention.mjs:41`, `scripts/lib/hosted-browser.mjs:39`, `scripts/lib/hosted-discovery.mjs:153`, `scripts/lib/hosted-workflow.mjs:441`, `scripts/lib/known-access-run.mjs:8`, `scripts/lib/official-link-discovery.mjs:331`, `scripts/lib/source-access-store.mjs:32`, `scripts/public-source-discovery.mjs:35`, `scripts/source-access.mjs:26`, `supabase/functions/source-api/index.ts:39`
- **SQL reference candidates:** `record_procurement_access_event(uuid,integer,timestamp with time zone,text,text,jsonb)`, `record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (registration_id) REFERENCES procurement_registrations(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 98; inserts 102, updates 95, sequential scans 68, indexed scans 435. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_action_requests

- **Owner/purpose:** Source review / legacy action workflow. One deduplicated human action. Existing review kind and dedupe identity fit source decisions; extend this record rather than create a second issue store.
- **Disposition/lifecycle:** Consolidate proposed source issues here; preserve legacy registration/action rows and delivery fields.
- **Repository reader/writer/recovery entry points:** No direct non-test JS/TS consumer located; SQL/compatibility evidence below governs disposition.
- **SQL reference candidates:** None located in live function bodies.
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (capability_id) REFERENCES procurement_source_capabilities(id)`; `FOREIGN KEY (resume_job_id) REFERENCES procurement_jobs(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 0, updates 0, sequential scans 6, indexed scans 9. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_contacts

- **Owner/purpose:** Lead data preservation. Normalized lead contacts imported by supported data tooling; the current UI also has embedded payload contacts. These representations are not synchronized independent editors.
- **Disposition/lifecycle:** Retain history/retention; preserve FK children during duplicate repair and native import rehearsal. No assertion of an active separate contact UI.
- **Repository reader/writer/recovery entry points:** `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/schema-query.mjs:11`
- **SQL reference candidates:** None located in live function bodies.
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 3, updates 0, sequential scans 11, indexed scans 23. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_county_state_research

- **Owner/purpose:** County/state orchestration. One county research baseline/lease; prevents every county run repeating shared state research.
- **Disposition/lifecycle:** Retain operational; refresh under existing lease and baseline rules.
- **Repository reader/writer/recovery entry points:** `scripts/lib/county-triggers.mjs:64`
- **SQL reference candidates:** `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (county_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (request_id) REFERENCES procurement_search_requests(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 4; inserts 4, updates 720, sequential scans 7289, indexed scans 136. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_coverage_tasks

- **Owner/purpose:** Coverage planner. One request target/category/route attempt, including missing-source attempts. A saved lead is not proof that all tasks completed.
- **Disposition/lifecycle:** Retain operational and historical run coverage; never overwrite old task outcomes with current review decisions.
- **Repository reader/writer/recovery entry points:** `scripts/ardot-review.mjs:23`, `scripts/known-source-review.mjs:61`, `scripts/known-source-workflow.mjs:77`, `scripts/lib/admin-analytics.mjs:127`, `scripts/lib/county-source-attention.mjs:95`, `scripts/lib/county-triggers.mjs:123`, `scripts/lib/hosted-attention.mjs:37`, `scripts/lib/hosted-discovery.mjs:25`, `scripts/lib/hosted-workflow.mjs:63`, `scripts/lib/known-source-collection.mjs:57`, `scripts/lib/official-link-discovery.mjs:108`, `scripts/lib/research-persistence.mjs:111`, `scripts/lib/source-access-store.mjs:21`, `scripts/verify-public-methods.mjs:22`, `scripts/verify-state-listing.mjs:16`, `supabase/functions/sam-search/index.ts:89`, `supabase/functions/source-api/index.ts:34`
- **SQL reference candidates:** `reserve_procurement_interpretation(uuid,uuid,text,text,jsonb,text,uuid)`, `finalize_procurement_interpretation(uuid,jsonb)`, `record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text)`, `create_procurement_known_plan(uuid,jsonb)`, `finish_procurement_known_job(uuid,uuid,text,text,jsonb,jsonb,integer,integer,text)`, `reconcile_procurement_known_gaps(uuid,jsonb)`, `reconcile_procurement_county_reads(uuid,uuid)`, `reconcile_procurement_source_gaps(uuid,jsonb)`
- **FK dependencies:** `procurement_jobs`, `procurement_runs`, `procurement_interpretations`, `procurement_workflow_steps` Outgoing constraints: `FOREIGN KEY (capability_id) REFERENCES procurement_source_capabilities(id)`; `FOREIGN KEY (route_geography_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`; `FOREIGN KEY (target_id) REFERENCES procurement_request_targets(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 4265; inserts 4417, updates 2075, sequential scans 75, indexed scans 170723. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_event_receipts

- **Owner/purpose:** Event delivery compatibility. One consumer acknowledgement per domain event. Exposed service-only pending/acknowledge RPCs use this as an outbox-consumer cursor, not a source decision.
- **Disposition/lifecycle:** Retain operational compatibility for the existing RPC contract. No inserts observed in this window; no active external consumer is asserted. Do not remove an acknowledgement contract on that evidence alone.
- **Repository reader/writer/recovery entry points:** No direct non-test JS/TS consumer located; SQL/compatibility evidence below governs disposition.
- **SQL reference candidates:** `pending_procurement_events(text,integer)`, `acknowledge_procurement_event(text,uuid)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (event_id) REFERENCES procurement_events(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 0, updates 0, sequential scans 8, indexed scans 22. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_events

- **Owner/purpose:** Domain audit. One domain event, distinct from full lead snapshots. Lead trigger writes event metadata; pending-event RPC exposes durable consumer delivery.
- **Disposition/lifecycle:** Retain history/retention; reuse this append-only event identity/dedupe mechanism for source review events, protected from business-user raw reads.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/lib/api-link-repair.mjs:70`, `scripts/lib/batch-verification.mjs:42`, `scripts/lib/county-duplicate-repair.mjs:71`, `scripts/lib/hosted-import.mjs:11`, `scripts/lib/native-sql-rehearsal.mjs:14`, `scripts/lib/schema-query.mjs:1`, `scripts/verify-authenticated-access.mjs:14`, `scripts/verify-intake-processing.mjs:41`
- **SQL reference candidates:** `procurement_lead_changed()`, `pending_procurement_events(text,integer)`, `queue_recompete_reviews()`
- **FK dependencies:** `procurement_event_receipts` Outgoing constraints: `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 413; inserts 443, updates 0, sequential scans 236, indexed scans 165. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_extraction_cache

- **Owner/purpose:** Extraction worker. Content/method-keyed reusable extracted facts; raw evidence and per-request validation remain separate. Hosted workflow checks extractionKey and uses compare-and-swap refinement.
- **Disposition/lifecycle:** Retain operational cache. Key changes invalidate reuse; immutable evidence is retained. No time-based deletion is introduced.
- **Repository reader/writer/recovery entry points:** `scripts/lib/hosted-workflow.mjs:182`
- **SQL reference candidates:** `refine_procurement_extraction(text,jsonb,jsonb)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 149; inserts 206, updates 27, sequential scans 5, indexed scans 729. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_geographies

- **Owner/purpose:** Scope registry. One canonical geography identity; request/schedule snapshots reference it.
- **Disposition/lifecycle:** Retain operational; municipality sync changes registry, not historical saved scope.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-review.mjs:39`, `scripts/lib/admin-catalog.mjs:60`, `scripts/lib/county-triggers.mjs:18`, `scripts/lib/geography-service.mjs:18`, `scripts/lib/hosted-discovery.mjs:22`, `scripts/lib/hosted-import.mjs:12`, `scripts/lib/hosted-workflow.mjs:73`, `scripts/lib/known-source-collection.mjs:40`, `scripts/lib/native-sql-rehearsal.mjs:15`, `scripts/lib/official-link-discovery.mjs:118`, `scripts/lib/research-persistence.mjs:68`, `scripts/lib/schema-query.mjs:1`, `scripts/public-source-discovery.mjs:26`, `scripts/review-arkansas-municipalities.mjs:22`, `scripts/verify-arbuy-open-method.mjs:15`, `scripts/verify-ardot-method.mjs:15`, `scripts/verify-bonfire-method.mjs:17`, `scripts/verify-dhs-method.mjs:15`, `scripts/verify-html-table-method.mjs:17`, `scripts/verify-json-listing-method.mjs:17`, `scripts/verify-public-methods.mjs:15`, `scripts/verify-sam-methods.mjs:16`, `scripts/verify-state-listing.mjs:13`, `scripts/verify-state-record.mjs:16`, `scripts/verify-uaht-method.mjs:15`
- **SQL reference candidates:** `sync_procurement_municipalities(jsonb,integer,text)`, `create_procurement_geography_request(text,text,text[],timestamp with time zone,jsonb,jsonb,text)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`
- **FK dependencies:** `procurement_place_counties`, `procurement_place_counties`, `procurement_request_targets`, `procurement_source_capabilities`, `procurement_coverage_tasks`, `procurement_source_capabilities`, `procurement_search_requests`, `procurement_trigger_requests`, `procurement_county_state_research` Outgoing constraints: None.
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 1203; inserts 1203, updates 626, sequential scans 741, indexed scans 39192. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_intake_items

- **Owner/purpose:** Validation/import. One raw normalized candidate with processing state; not yet a canonical usable lead.
- **Disposition/lifecycle:** Retain operational and import evidence; reconciliation depends on retained candidate identity.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-workflow.mjs:78`, `scripts/lib/admin-analytics.mjs:127`, `scripts/lib/batch-sql-test.mjs:28`, `scripts/lib/batch-verification.mjs:27`, `scripts/lib/county-automatic-import.mjs:33`, `scripts/lib/county-solicitation-identity.mjs:35`, `scripts/lib/county-source-attention.mjs:101`, `scripts/lib/hosted-discovery.mjs:85`, `scripts/lib/hosted-import-jobs.mjs:51`, `scripts/lib/hosted-import.mjs:10`, `scripts/lib/hosted-sam.mjs:36`, `scripts/lib/hosted-workflow.mjs:48`, `scripts/lib/intake-reconcile.mjs:30`, `scripts/lib/interpretation-intake.mjs:13`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/research-persistence.mjs:124`, `scripts/lib/reviewed-batch.mjs:107`, `scripts/lib/schema-query.mjs:1`, `scripts/prepare-sam-upserts.mjs:132`, `scripts/procurement-workflow.mjs:106`, `scripts/verify-intake-processing.mjs:25`
- **SQL reference candidates:** `ingest_procurement_intake(uuid,text,jsonb,text)`
- **FK dependencies:** `procurement_intake_leads` Outgoing constraints: `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 137; inserts 154, updates 121, sequential scans 133, indexed scans 2995. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_intake_leads

- **Owner/purpose:** Import provenance. Many-to-many intake-to-canonical-lead lineage. One candidate may map to existing lead identity.
- **Disposition/lifecycle:** Retain operational provenance; distinct from request lead attribution.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-workflow.mjs:158`, `scripts/lib/batch-sql-test.mjs:28`, `scripts/lib/batch-verification.mjs:30`, `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/county-solicitation-identity.mjs:36`, `scripts/lib/county-source-attention.mjs:101`, `scripts/lib/hosted-import.mjs:10`, `scripts/lib/hosted-workflow.mjs:50`, `scripts/lib/intake-reconcile.mjs:42`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/reviewed-batch.mjs:135`, `scripts/lib/schema-query.mjs:1`, `scripts/verify-intake-processing.mjs:31`
- **SQL reference candidates:** None located in live function bodies.
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (intake_id) REFERENCES procurement_intake_items(id)`; `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 78; inserts 121, updates 0, sequential scans 601, indexed scans 1559. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_interpretations

- **Owner/purpose:** Evidence review. Versioned task interpretation with current marker and saved validation/evidence. Cache facts alone are not a reviewed task finding.
- **Disposition/lifecycle:** Retain operational/history; current interpretation selected explicitly, prior revisions retained.
- **Repository reader/writer/recovery entry points:** `scripts/known-source-workflow.mjs:156`, `scripts/lib/county-source-attention.mjs:97`, `scripts/lib/county-triggers.mjs:124`, `scripts/lib/hosted-import-jobs.mjs:19`, `scripts/lib/hosted-import.mjs:15`, `scripts/lib/hosted-workflow.mjs:89`
- **SQL reference candidates:** `reserve_procurement_interpretation(uuid,uuid,text,text,jsonb,text,uuid)`, `finalize_procurement_interpretation(uuid,jsonb)`
- **FK dependencies:** `procurement_interpretations` Outgoing constraints: `FOREIGN KEY (request_id) REFERENCES procurement_search_requests(id)`; `FOREIGN KEY (supersedes_id) REFERENCES procurement_interpretations(id)`; `FOREIGN KEY (task_id) REFERENCES procurement_coverage_tasks(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 532; inserts 556, updates 562, sequential scans 206, indexed scans 9704. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_jobs

- **Owner/purpose:** Leased worker. One bounded resumable unit with checkpoint, lease and outcome uncertainty. A trigger can own many jobs.
- **Disposition/lifecycle:** Retain operational/history; never erase active leases, uncertain sends or recovery checkpoints.
- **Repository reader/writer/recovery entry points:** `scripts/known-source-workflow.mjs:161`, `scripts/lib/admin-analytics.mjs:124`, `scripts/lib/browser-feasibility.mjs:56`, `scripts/lib/county-source-attention.mjs:96`, `scripts/lib/county-triggers.mjs:125`, `scripts/lib/hosted-attention.mjs:36`, `scripts/lib/hosted-browser.mjs:35`, `scripts/lib/hosted-discovery.mjs:30`, `scripts/lib/hosted-import-jobs.mjs:13`, `scripts/lib/hosted-import.mjs:17`, `scripts/lib/hosted-sam.mjs:11`, `scripts/lib/hosted-workflow.mjs:69`, `scripts/lib/known-source-collection.mjs:56`, `scripts/lib/official-link-discovery.mjs:122`, `scripts/lib/public-capture-reuse.mjs:10`, `scripts/lib/schedule-reporting.mjs:56`, `scripts/lib/workflow-http.mjs:194`, `scripts/source-access.mjs:39`, `supabase/functions/sam-search/index.ts:73`, `supabase/functions/source-api/index.ts:30`
- **SQL reference candidates:** `control_procurement_trigger(uuid,uuid,text)`, `record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text)`, `create_procurement_known_plan(uuid,jsonb)`, `submit_procurement_api_request(uuid,text,text,jsonb,text[])`, `checkpoint_procurement_workflow(uuid,uuid,text,jsonb)`, `claim_procurement_workflow_job_before_admin()`, `control_procurement_workflow(uuid,uuid,text)`, `submit_procurement_sam_request(uuid,text,text,text,jsonb,jsonb)`, `validate_sam_run_context()`, `claim_procurement_trigger()`, `claim_procurement_known_job(uuid)`, `finish_procurement_known_job(uuid,uuid,text,text,jsonb,jsonb,integer,integer,text)`, `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`, `reconcile_procurement_county_reads(uuid,uuid)`, `procurement_schedule_baseline_before_sam(uuid)`, `procurement_scheduler_needs_wake(timestamp with time zone)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`, `submit_procurement_trigger(uuid,text,text,jsonb)`
- **FK dependencies:** `procurement_action_requests`, `procurement_runs`, `procurement_workflow_steps` Outgoing constraints: `FOREIGN KEY (capability_id) REFERENCES procurement_source_capabilities(id)`; `FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id)`; `FOREIGN KEY (task_id) REFERENCES procurement_coverage_tasks(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 2614; inserts 2633, updates 11776, sequential scans 11281, indexed scans 138170. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_lead_links

- **Owner/purpose:** Lead data preservation. Directed relationships between canonical leads, distinct from intake/request provenance. Protected by duplicate repair/rehearsal tooling.
- **Disposition/lifecycle:** Retain history/retention and supported import compatibility; zero inserts here do not authorize losing existing relationships.
- **Repository reader/writer/recovery entry points:** `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/schema-query.mjs:11`
- **SQL reference candidates:** None located in live function bodies.
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (from_lead) REFERENCES procurement_leads(id)`; `FOREIGN KEY (to_lead) REFERENCES procurement_leads(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 0, updates 0, sequential scans 16, indexed scans 56. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_lead_note_edits

- **Owner/purpose:** Sales history. Append-only revisions of a user note; current note text lives in lead_notes.
- **Disposition/lifecycle:** Retain history/retention; note ownership and old text must survive imports and repairs.
- **Repository reader/writer/recovery entry points:** `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/schema-query.mjs:11`, `src/lib/procurement.ts:238`
- **SQL reference candidates:** `edit_lead_note(uuid,text)`, `procurement_queue_page(jsonb,integer,integer)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (edited_by) REFERENCES auth.users(id)`; `FOREIGN KEY (note_id) REFERENCES procurement_lead_notes(id) ON DELETE CASCADE`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 21, updates 0, sequential scans 34, indexed scans 329. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_lead_notes

- **Owner/purpose:** Sales workspace. One authored lead note and its current text.
- **Disposition/lifecycle:** Retain operational; only existing author/edit rules may change it.
- **Repository reader/writer/recovery entry points:** `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/schema-query.mjs:11`, `src/lib/procurement.ts:230`
- **SQL reference candidates:** `edit_lead_note(uuid,text)`, `procurement_queue_page(jsonb,integer,integer)`, `create_lead_note(uuid,text)`
- **FK dependencies:** `procurement_lead_note_edits` Outgoing constraints: `FOREIGN KEY (created_by) REFERENCES auth.users(id)`; `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id) ON DELETE CASCADE`; `FOREIGN KEY (updated_by) REFERENCES auth.users(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 0; inserts 25, updates 21, sequential scans 26635, indexed scans 931. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_lead_stage_changes

- **Owner/purpose:** Sales history. One sales-stage transition with actor/reason; current stage lives on the lead.
- **Disposition/lifecycle:** Retain history/retention; bulk stage changes and queue history consume it.
- **Repository reader/writer/recovery entry points:** `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/schema-query.mjs:11`, `src/lib/procurement.ts:243`
- **SQL reference candidates:** `update_procurement_lead_stage(uuid,text,text,text)`, `bulk_update_procurement_lead_stage(uuid[],text,text,text)`, `procurement_queue_page(jsonb,integer,integer)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (changed_by) REFERENCES auth.users(id)`; `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id) ON DELETE CASCADE`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 10; inserts 181, updates 0, sequential scans 10015, indexed scans 474. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_leads

- **Owner/purpose:** Sales workspace. One canonical source/external lead identity with protected sales fields.
- **Disposition/lifecycle:** Retain operational; imports merge verified facts without resetting stages/notes.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-workflow.mjs:160`, `scripts/lib/api-link-audit.mjs:5`, `scripts/lib/api-link-repair.mjs:11`, `scripts/lib/batch-sql-test.mjs:28`, `scripts/lib/batch-verification.mjs:11`, `scripts/lib/canonical-reporting.mjs:8`, `scripts/lib/county-automatic-import.mjs:37`, `scripts/lib/county-duplicate-repair.mjs:7`, `scripts/lib/county-solicitation-identity.mjs:46`, `scripts/lib/hosted-import.mjs:10`, `scripts/lib/hosted-workflow.mjs:213`, `scripts/lib/intake-reconcile.mjs:30`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/reviewed-batch.mjs:103`, `scripts/lib/schema-query.mjs:1`, `scripts/prepare-sam-upserts.mjs:6`, `scripts/procurement-workflow.mjs:135`, `scripts/reconcile-state-janitorial-source.mjs:13`, `scripts/verify-authenticated-access.mjs:14`, `scripts/verify-intake-processing.mjs:8`, `scripts/verify-state-record.mjs:17`, `src/app/AppShell.tsx:700`, `src/lib/procurement.ts:160`
- **SQL reference candidates:** `ingest_procurement_lead(uuid,text,jsonb,text,uuid,text,text,uuid)`, `queue_recompete_reviews()`, `update_procurement_lead_stage(uuid,text,text,text)`, `bulk_update_procurement_lead_stage(uuid[],text,text,text)`, `procurement_queue_page(jsonb,integer,integer)`
- **FK dependencies:** `procurement_versions`, `procurement_events`, `procurement_contacts`, `procurement_lead_links`, `procurement_lead_links`, `procurement_request_leads`, `procurement_intake_leads`, `procurement_lead_notes`, `procurement_lead_stage_changes` Outgoing constraints: `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** `procurement_lead_changed → procurement_lead_changed`, `procurement_sync_lead_columns → procurement_sync_lead_columns`
- **Observed counters:** estimate 324; inserts 336, updates 703, sequential scans 1940, indexed scans 6242. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_members

- **Owner/purpose:** Legacy access history. Historical staff allow-list, not a role or team membership authority. Existing profiles supplies User/Admin.
- **Disposition/lifecycle:** Retire after lossless archival in procurement_events, explicitly authorized by the user during this build. Five live legacy read policies are replaced with profile-based Admin checks. No current/deployed app writer or function consumer exists. RESTRICT prevents an unchecked dependency removal. No synchronization, bootstrap or new gate remains.
- **Repository reader/writer/recovery entry points:** No direct non-test JS/TS consumer located; SQL/compatibility evidence below governs disposition.
- **SQL reference candidates:** None located in live function bodies.
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 2, updates 0, sequential scans 21, indexed scans 46. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_place_counties

- **Owner/purpose:** Geography routing. Many-to-many municipality/county routing relation; cannot be replaced by a single county on every city.
- **Disposition/lifecycle:** Retain operational; municipality synchronization owns rebuild and routing needs join cardinality.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-catalog.mjs:60`, `scripts/lib/county-triggers.mjs:18`, `scripts/lib/geography-service.mjs:7`, `scripts/lib/hosted-discovery.mjs:128`, `scripts/review-arkansas-municipalities.mjs:23`
- **SQL reference candidates:** `sync_procurement_municipalities(jsonb,integer,text)`, `create_procurement_geography_request(text,text,text[],timestamp with time zone,jsonb,jsonb,text)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (county_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (place_id) REFERENCES procurement_geographies(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 1209; inserts 1209, updates 0, sequential scans 647, indexed scans 8332. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_public_captures

- **Owner/purpose:** Evidence acquisition. One immutable captured body/hash/final URL per capture run. Request sibling reuse rechecks hash, host, MIME, size and freshness.
- **Disposition/lifecycle:** Retain evidence/history. Shared bytes do not reuse coverage conclusions; 30-day acquisition reuse bound is enforced by public-capture-reuse.mjs.
- **Repository reader/writer/recovery entry points:** `scripts/ardot-review.mjs:32`, `scripts/known-source-review.mjs:96`, `scripts/known-source-workflow.mjs:34`, `scripts/lib/hosted-browser.mjs:67`, `scripts/lib/hosted-discovery.mjs:78`, `scripts/lib/hosted-workflow.mjs:71`, `scripts/lib/known-source-collection.mjs:26`, `scripts/lib/official-link-discovery.mjs:159`, `scripts/lib/public-capture-reuse.mjs:15`, `scripts/source-access.mjs:55`, `scripts/verify-public-methods.mjs:20`, `scripts/verify-state-listing.mjs:14`, `supabase/functions/source-api/index.ts:82`
- **SQL reference candidates:** `record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text)`, `reconcile_procurement_county_reads(uuid,uuid)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (run_id) REFERENCES procurement_runs(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 3018; inserts 3073, updates 0, sequential scans 5, indexed scans 8493. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_registrations

- **Owner/purpose:** Access workflow. One saved registration/account access reference with lifecycle; access_handoffs records channel-specific assessments.
- **Disposition/lifecycle:** Retain operational; no duplicate role authority and no browser credentials disclosure.
- **Repository reader/writer/recovery entry points:** `scripts/lib/hosted-discovery.mjs:153`, `scripts/lib/official-link-discovery.mjs:331`, `scripts/public-source-discovery.mjs:36`, `scripts/source-access.mjs:148`, `scripts/verify-authenticated-access.mjs:14`
- **SQL reference candidates:** `record_procurement_access_event(uuid,integer,timestamp with time zone,text,text,jsonb)`
- **FK dependencies:** `procurement_access_handoffs` Outgoing constraints: `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 29, updates 5, sequential scans 20, indexed scans 127. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_request_leads

- **Owner/purpose:** Reporting provenance. One request/lead attribution and import classification, used for verified counts and metric membership.
- **Disposition/lifecycle:** Retain operational/history; a lead can belong to many requests.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-workflow.mjs:159`, `scripts/lib/batch-sql-test.mjs:28`, `scripts/lib/batch-verification.mjs:33`, `scripts/lib/county-duplicate-repair.mjs:4`, `scripts/lib/county-source-attention.mjs:101`, `scripts/lib/hosted-import.mjs:11`, `scripts/lib/hosted-workflow.mjs:214`, `scripts/lib/intake-reconcile.mjs:51`, `scripts/lib/native-sql-rehearsal.mjs:14`, `scripts/lib/reviewed-batch.mjs:270`, `scripts/lib/schema-query.mjs:1`, `scripts/prepare-sam-upserts.mjs:168`, `scripts/verify-intake-processing.mjs:33`
- **SQL reference candidates:** `ingest_procurement_lead(uuid,text,jsonb,text,uuid,text,text,uuid)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id)`; `FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 309; inserts 364, updates 88, sequential scans 14, indexed scans 2306. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_request_sources

- **Owner/purpose:** Request scope. Source association selected for one request. Not the canonical source definition or category capability.
- **Disposition/lifecycle:** Retain operational/history; reviewed seed identity and shared registration scope depend on it.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-workflow.mjs:75`, `scripts/lib/hosted-attention.mjs:39`, `scripts/lib/hosted-discovery.mjs:73`, `scripts/lib/hosted-import.mjs:12`, `scripts/lib/hosted-workflow.mjs:96`, `scripts/lib/native-sql-rehearsal.mjs:15`, `scripts/lib/official-link-discovery.mjs:127`, `scripts/lib/research-persistence.mjs:62`, `scripts/lib/schema-query.mjs:1`
- **SQL reference candidates:** None located in live function bodies.
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 130; inserts 146, updates 0, sequential scans 61, indexed scans 2743. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_request_targets

- **Owner/purpose:** Request scope. One resolved geography/category target under a search request.
- **Disposition/lifecycle:** Retain operational/history; unresolved targets cannot be collected.
- **Repository reader/writer/recovery entry points:** `scripts/ardot-review.mjs:25`, `scripts/known-source-review.mjs:52`, `scripts/known-source-workflow.mjs:76`, `scripts/lib/admin-analytics.mjs:124`, `scripts/lib/county-source-attention.mjs:92`, `scripts/lib/county-triggers.mjs:121`, `scripts/lib/hosted-attention.mjs:34`, `scripts/lib/hosted-discovery.mjs:21`, `scripts/lib/hosted-workflow.mjs:64`, `scripts/lib/known-source-collection.mjs:36`, `scripts/lib/official-link-discovery.mjs:109`, `scripts/lib/research-persistence.mjs:112`, `scripts/public-source-discovery.mjs:25`
- **SQL reference candidates:** `reserve_procurement_interpretation(uuid,uuid,text,text,jsonb,text,uuid)`, `create_procurement_known_plan(uuid,jsonb)`, `create_procurement_geography_request(text,text,text[],timestamp with time zone,jsonb,jsonb,text)`, `reconcile_procurement_known_gaps(uuid,jsonb)`, `reconcile_procurement_source_gaps(uuid,jsonb)`, `procurement_schedule_baseline_before_sam(uuid)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`
- **FK dependencies:** `procurement_coverage_tasks` Outgoing constraints: `FOREIGN KEY (geography_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (search_request_id) REFERENCES procurement_search_requests(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 719; inserts 858, updates 0, sequential scans 144, indexed scans 88512. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_runs

- **Owner/purpose:** Capture/import execution. One source execution/capture result, linked to task/job. This is not the top-level multi-county trigger shown as a run in Scheduling.
- **Disposition/lifecycle:** Retain operational/history; verification binds exact run/capture IDs.
- **Repository reader/writer/recovery entry points:** `scripts/ardot-review.mjs:30`, `scripts/known-source-review.mjs:66`, `scripts/lib/admin-catalog.mjs:66`, `scripts/lib/hosted-browser.mjs:66`, `scripts/lib/hosted-discovery.mjs:79`, `scripts/lib/hosted-sam.mjs:64`, `scripts/lib/hosted-workflow.mjs:70`, `scripts/lib/known-access-run.mjs:13`, `scripts/lib/known-source-collection.mjs:116`, `scripts/lib/official-link-discovery.mjs:284`, `scripts/lib/public-capture-reuse.mjs:12`, `scripts/lib/source-access-store.mjs:15`, `scripts/prepare-sam-upserts.mjs:33`, `scripts/sam-search.mjs:48`, `scripts/source-access.mjs:60`, `scripts/verify-public-methods.mjs:19`, `scripts/verify-sam-methods.mjs:17`, `scripts/verify-state-listing.mjs:14`, `supabase/functions/sam-search/index.ts:78`, `supabase/functions/source-api/index.ts:63`
- **SQL reference candidates:** `record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text)`, `record_procurement_observations(uuid,jsonb)`, `reconcile_procurement_county_reads(uuid,uuid)`, `procurement_schedule_baseline_before_sam(uuid)`, `procurement_schedule_baseline(uuid)`
- **FK dependencies:** `procurement_public_captures`, `procurement_source_observations` Outgoing constraints: `FOREIGN KEY (coverage_task_id) REFERENCES procurement_coverage_tasks(id)`; `FOREIGN KEY (job_id) REFERENCES procurement_jobs(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** `procurement_runs_sam_context → validate_sam_run_context`
- **Observed counters:** estimate 3357; inserts 3516, updates 3492, sequential scans 453, indexed scans 47207. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_schedule_events

- **Owner/purpose:** Schedule audit. One configuration/lifecycle event with before/after and actor, distinct from execution logs or lead changes.
- **Disposition/lifecycle:** Retain history/retention; readable schedule changes and archive/delete eligibility depend on it.
- **Repository reader/writer/recovery entry points:** `scripts/lib/procurement-schedules.mjs:137`
- **SQL reference candidates:** `save_procurement_schedule(uuid,uuid,text,text,integer,jsonb,timestamp with time zone)`, `control_procurement_schedule(uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone)`, `disable_inactive_procurement_schedules(timestamp with time zone)`, `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`, `delete_procurement_schedule(uuid,uuid,integer,timestamp with time zone)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(id)`
- **Triggers:** `procurement_schedule_enrich_event → enrich_procurement_schedule_event`
- **Observed counters:** estimate 51; inserts 59, updates 0, sequential scans 16, indexed scans 57. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_schedule_occurrences

- **Owner/purpose:** Scheduler. One due/manual scheduling attempt including skipped/blocked/no-run attempts. Not all attempts create a trigger.
- **Disposition/lifecycle:** Retain operational/history; schedule/run-key uniqueness prevents duplicate execution.
- **Repository reader/writer/recovery entry points:** `scripts/lib/procurement-schedules.mjs:83`
- **SQL reference candidates:** `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`
- **FK dependencies:** `procurement_triggers` Outgoing constraints: `FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(id)`; `FOREIGN KEY (trigger_id) REFERENCES procurement_triggers(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 18; inserts 26, updates 25, sequential scans 117, indexed scans 5610. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_schedule_state_memberships

- **Owner/purpose:** Scheduler reservations. Relationship reserving shared state-source associations for a schedule; preserves grouped scope ownership.
- **Disposition/lifecycle:** Retain operational; SQL reservation/status functions use it even when no rows currently exist.
- **Repository reader/writer/recovery entry points:** `scripts/lib/procurement-schedules.mjs:30`
- **SQL reference candidates:** `procurement_state_trigger_status()`, `reserve_procurement_schedule_scope()`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (state_trigger_association_id) REFERENCES procurement_state_trigger_associations(id)`; `FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 0, updates 0, sequential scans 5, indexed scans 1936. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_scheduler_deliveries

- **Owner/purpose:** SQL scheduler dispatch. One private HTTP wake delivery and observed status; SQL dispatcher waits for pending delivery before sending again.
- **Disposition/lifecycle:** Retain operational/history; cron/pg_net consumers are in SQL, not JavaScript.
- **Repository reader/writer/recovery entry points:** No direct non-test JS/TS consumer located; SQL/compatibility evidence below governs disposition.
- **SQL reference candidates:** `procurement_scheduler_dispatch()`, `procurement_scheduler_status()`
- **FK dependencies:** No incoming FK. Outgoing constraints: None.
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 245; inserts 271, updates 271, sequential scans 1932, indexed scans 26430. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_scheduler_settings

- **Owner/purpose:** SQL scheduler dispatch. Singleton enabled switch for the existing private dispatcher.
- **Disposition/lifecycle:** Retain operational; dispatch/status SQL functions read it.
- **Repository reader/writer/recovery entry points:** No direct non-test JS/TS consumer located; SQL/compatibility evidence below governs disposition.
- **SQL reference candidates:** `procurement_scheduler_dispatch()`, `procurement_scheduler_status()`
- **FK dependencies:** No incoming FK. Outgoing constraints: None.
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 1, updates 3, sequential scans 11610, indexed scans 241. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_schedules

- **Owner/purpose:** Scheduler. Canonical schedule definition, recurrence, ownership, version and lifecycle.
- **Disposition/lifecycle:** Retain operational; snapshots on occurrences/triggers explain historical execution.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-catalog.mjs:60`, `scripts/lib/admin-run-history.mjs:57`, `scripts/lib/county-triggers.mjs:101`, `scripts/lib/procurement-schedules.mjs:44`, `scripts/lib/schedule-activity.mjs:20`
- **SQL reference candidates:** `save_procurement_schedule(uuid,uuid,text,text,integer,jsonb,timestamp with time zone)`, `control_procurement_schedule(uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone)`, `disable_inactive_procurement_schedules(timestamp with time zone)`, `procurement_scheduled_trigger_runnable(uuid)`, `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`, `procurement_state_trigger_status()`, `delete_procurement_schedule(uuid,uuid,integer,timestamp with time zone)`, `procurement_scheduler_needs_wake(timestamp with time zone)`
- **FK dependencies:** `procurement_schedule_state_memberships`, `procurement_schedule_occurrences`, `procurement_schedule_events`, `procurement_triggers` Outgoing constraints: `FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL`
- **Triggers:** `procurement_schedule_capture_changes → capture_procurement_schedule_changes`, `procurement_schedule_identity → guard_procurement_schedule_identity`, `procurement_schedule_management_lock → lock_procurement_schedule_management`, `procurement_schedule_scope_reservation → reserve_procurement_schedule_scope`
- **Observed counters:** estimate 13; inserts 13, updates 40, sequential scans 11448, indexed scans 62539. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_search_requests

- **Owner/purpose:** Request execution. One geography/source/category search intent and control state, shared by CLI and hosted worker.
- **Disposition/lifecycle:** Retain operational/history; a trigger may create multiple requests and standalone requests still work.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-review.mjs:50`, `scripts/known-source-workflow.mjs:74`, `scripts/lib/batch-sql-test.mjs:15`, `scripts/lib/county-source-attention.mjs:94`, `scripts/lib/county-triggers.mjs:212`, `scripts/lib/hosted-attention.mjs:33`, `scripts/lib/hosted-discovery.mjs:21`, `scripts/lib/hosted-import-jobs.mjs:46`, `scripts/lib/hosted-import.mjs:11`, `scripts/lib/hosted-sam.mjs:14`, `scripts/lib/hosted-workflow.mjs:63`, `scripts/lib/intake-reconcile.mjs:28`, `scripts/lib/known-source-collection.mjs:33`, `scripts/lib/native-sql-rehearsal.mjs:14`, `scripts/lib/official-link-discovery.mjs:108`, `scripts/lib/research-persistence.mjs:35`, `scripts/lib/reviewed-batch.mjs:100`, `scripts/lib/schema-query.mjs:1`, `scripts/public-source-discovery.mjs:24`, `scripts/verify-intake-processing.mjs:40`, `scripts/workflow-server.mjs:59`
- **SQL reference candidates:** `create_procurement_known_plan(uuid,jsonb)`, `submit_procurement_api_request(uuid,text,text,jsonb,text[])`, `control_procurement_workflow(uuid,uuid,text)`, `submit_procurement_sam_request(uuid,text,text,text,jsonb,jsonb)`, `create_procurement_geography_request(text,text,text[],timestamp with time zone,jsonb,jsonb,text)`, `reconcile_procurement_known_gaps(uuid,jsonb)`, `reconcile_procurement_county_reads(uuid,uuid)`, `reconcile_procurement_source_gaps(uuid,jsonb)`, `procurement_schedule_baseline_before_sam(uuid)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`, `submit_procurement_trigger(uuid,text,text,jsonb)`
- **FK dependencies:** `procurement_request_sources`, `procurement_request_leads`, `procurement_request_targets`, `procurement_jobs`, `procurement_interpretations`, `procurement_usage_ledger`, `procurement_trigger_requests`, `procurement_county_state_research`, `procurement_workflow_steps` Outgoing constraints: `FOREIGN KEY (initiated_by) REFERENCES auth.users(id)`; `FOREIGN KEY (requested_geography_id) REFERENCES procurement_geographies(id)`
- **Triggers:** `validate_procurement_search_request → validate_procurement_search_request`
- **Observed counters:** estimate 100; inserts 114, updates 82, sequential scans 376, indexed scans 138522. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_source_capabilities

- **Owner/purpose:** Collector registry. One source/category/route/method contract and verification evidence. Source URL alone is not an executable category method.
- **Disposition/lifecycle:** Retain operational; bounded adapter validation and native rehearsal protect mutations.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-review.mjs:39`, `scripts/lib/admin-catalog.mjs:60`, `scripts/lib/county-triggers.mjs:19`, `scripts/lib/geography-service.mjs:35`, `scripts/lib/hosted-browser.mjs:36`, `scripts/lib/hosted-discovery.mjs:22`, `scripts/lib/hosted-import.mjs:12`, `scripts/lib/hosted-workflow.mjs:70`, `scripts/lib/known-source-collection.mjs:40`, `scripts/lib/native-sql-rehearsal.mjs:15`, `scripts/lib/official-link-discovery.mjs:119`, `scripts/lib/research-persistence.mjs:68`, `scripts/lib/schema-query.mjs:1`, `scripts/public-source-discovery.mjs:26`, `scripts/source-access.mjs:40`, `scripts/verify-arbuy-open-method.mjs:21`, `scripts/verify-ardot-method.mjs:23`, `scripts/verify-bonfire-method.mjs:28`, `scripts/verify-dhs-method.mjs:21`, `scripts/verify-html-table-method.mjs:24`, `scripts/verify-json-listing-method.mjs:25`, `scripts/verify-public-methods.mjs:25`, `scripts/verify-sam-methods.mjs:31`, `scripts/verify-state-listing.mjs:18`, `scripts/verify-state-record.mjs:24`, `scripts/verify-uaht-method.mjs:22`, `supabase/functions/source-api/index.ts:31`
- **SQL reference candidates:** `record_procurement_browser_capture(uuid,uuid,uuid,jsonb,text,jsonb,boolean,text)`, `create_procurement_known_plan(uuid,jsonb)`, `reconcile_procurement_known_gaps(uuid,jsonb)`, `reconcile_procurement_source_gaps(uuid,jsonb)`, `procurement_schedule_baseline_before_sam(uuid)`
- **FK dependencies:** `procurement_action_requests`, `procurement_coverage_tasks`, `procurement_jobs` Outgoing constraints: `FOREIGN KEY (agency_geography_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (route_geography_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 50; inserts 61, updates 15, sequential scans 4452, indexed scans 9844. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_source_observations

- **Owner/purpose:** Source audit. One source observation recorded for a specific run; CLI status exposes collected observations. Not an Admin decision or current registry row.
- **Disposition/lifecycle:** Retain history/retention and supported CLI contract; do not duplicate human review state here.
- **Repository reader/writer/recovery entry points:** `scripts/procurement-workflow.mjs:126`
- **SQL reference candidates:** `record_procurement_observations(uuid,jsonb)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (first_run_id) REFERENCES procurement_runs(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate -1; inserts 3, updates 0, sequential scans 8, indexed scans 15. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_sources

- **Owner/purpose:** Source registry. Canonical registration/official source identity and current configuration.
- **Disposition/lifecycle:** Retain operational; safe business labels are a projection, not copied editable data.
- **Repository reader/writer/recovery entry points:** `scripts/ardot-review.mjs:21`, `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/known-source-review.mjs:39`, `scripts/known-source-workflow.mjs:73`, `scripts/lib/admin-catalog.mjs:60`, `scripts/lib/api-link-audit.mjs:12`, `scripts/lib/browser-feasibility.mjs:62`, `scripts/lib/county-triggers.mjs:19`, `scripts/lib/geography-service.mjs:35`, `scripts/lib/hosted-browser.mjs:37`, `scripts/lib/hosted-discovery.mjs:22`, `scripts/lib/hosted-import.mjs:10`, `scripts/lib/hosted-sam.mjs:75`, `scripts/lib/hosted-workflow.mjs:69`, `scripts/lib/intake-reconcile.mjs:26`, `scripts/lib/known-source-collection.mjs:40`, `scripts/lib/native-sql-rehearsal.mjs:13`, `scripts/lib/official-link-discovery.mjs:119`, `scripts/lib/research-persistence.mjs:43`, `scripts/lib/reviewed-batch.mjs:97`, `scripts/lib/schema-query.mjs:1`, `scripts/prepare-sam-upserts.mjs:17`, `scripts/procurement-workflow.mjs:122`, `scripts/public-source-discovery.mjs:20`, `scripts/reconcile-state-janitorial-source.mjs:12`, `scripts/source-access.mjs:25`, `scripts/verify-arbuy-open-method.mjs:15`, `scripts/verify-ardot-method.mjs:15`, `scripts/verify-authenticated-access.mjs:14`, `scripts/verify-bonfire-method.mjs:16`, `scripts/verify-dhs-method.mjs:15`, `scripts/verify-html-table-method.mjs:16`, `scripts/verify-intake-processing.mjs:40`, `scripts/verify-json-listing-method.mjs:16`, `scripts/verify-public-methods.mjs:19`, `scripts/verify-sam-methods.mjs:20`, `scripts/verify-state-listing.mjs:13`, `scripts/verify-state-record.mjs:15`, `scripts/verify-uaht-method.mjs:14`, `src/app/AppShell.tsx:701`, `src/lib/procurement.ts:121`, `supabase/functions/sam-search/index.ts:64`, `supabase/functions/source-api/index.ts:42`
- **SQL reference candidates:** `create_procurement_known_plan(uuid,jsonb)`, `validate_sam_run_context()`, `procurement_schedule_baseline_before_sam(uuid)`, `procurement_state_trigger_status()`
- **FK dependencies:** `procurement_leads`, `procurement_events`, `procurement_runs`, `procurement_intake_items`, `procurement_registrations`, `procurement_request_sources`, `procurement_source_capabilities`, `procurement_action_requests`, `procurement_public_captures`, `procurement_coverage_tasks`, `procurement_source_observations`, `procurement_access_handoffs`, `procurement_extraction_cache`, `procurement_state_trigger_associations`, `procurement_workflow_steps` Outgoing constraints: None.
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 102; inserts 102, updates 89, sequential scans 6783, indexed scans 71194. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_state_trigger_associations

- **Owner/purpose:** Shared state orchestration. One source/category/county association with shared research freshness and active trigger.
- **Disposition/lifecycle:** Retain operational; association/status/submit SQL and grouped schedule paths use it.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-catalog.mjs:60`, `scripts/lib/county-triggers.mjs:45`
- **SQL reference candidates:** `associate_procurement_state_trigger(uuid,text,text,text,jsonb)`, `procurement_state_trigger_status()`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`
- **FK dependencies:** `procurement_schedule_state_memberships` Outgoing constraints: `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 5; inserts 5, updates 3597, sequential scans 1632, indexed scans 4516. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_trigger_requests

- **Owner/purpose:** Trigger orchestration. Parent trigger to child search-request link and role. Several children and shared state requests cannot fit one FK on trigger.
- **Disposition/lifecycle:** Retain operational/history; cancellation, attribution and budget guards traverse it.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-analytics.mjs:122`, `scripts/lib/county-automatic-import.mjs:7`, `scripts/lib/county-source-attention.mjs:90`, `scripts/lib/county-triggers.mjs:93`, `scripts/lib/hosted-sam.mjs:15`, `scripts/lib/public-capture-reuse.mjs:7`, `scripts/lib/schedule-reporting.mjs:54`, `scripts/lib/workflow-audit.mjs:35`
- **SQL reference candidates:** `control_procurement_trigger(uuid,uuid,text)`, `reserve_procurement_usage(jsonb,numeric)`, `procurement_scheduled_request_runnable(uuid)`, `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`, `reconcile_procurement_county_reads(uuid,uuid)`, `procurement_schedule_baseline_before_sam(uuid)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`, `submit_procurement_trigger(uuid,text,text,jsonb)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (county_id) REFERENCES procurement_geographies(id)`; `FOREIGN KEY (request_id) REFERENCES procurement_search_requests(id)`; `FOREIGN KEY (trigger_id) REFERENCES procurement_triggers(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 51; inserts 68, updates 0, sequential scans 107, indexed scans 114023. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_triggers

- **Owner/purpose:** Scheduling execution. Top-level multi-county/state/SAM invocation with control, lease and persisted checkpoint.
- **Disposition/lifecycle:** Retain operational/history; one trigger is not one worker job or capture run.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-analytics.mjs:107`, `scripts/lib/admin-run-history.mjs:44`, `scripts/lib/county-automatic-import.mjs:9`, `scripts/lib/county-triggers.mjs:80`, `scripts/lib/hosted-sam.mjs:149`, `scripts/lib/procurement-schedules.mjs:86`, `scripts/lib/workflow-audit.mjs:37`
- **SQL reference candidates:** `checkpoint_procurement_trigger(uuid,uuid,text,jsonb)`, `control_procurement_trigger(uuid,uuid,text)`, `claim_procurement_workflow_job()`, `reserve_procurement_usage(jsonb,numeric)`, `claim_procurement_trigger()`, `procurement_scheduled_trigger_runnable(uuid)`, `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`, `reconcile_procurement_county_reads(uuid,uuid)`, `procurement_state_trigger_status()`, `procurement_scheduler_needs_wake(timestamp with time zone)`, `submit_procurement_trigger_before_sam(uuid,text,text,jsonb)`, `submit_procurement_trigger(uuid,text,text,jsonb)`, `procurement_schedule_baseline(uuid)`
- **FK dependencies:** `procurement_trigger_requests`, `procurement_workflow_steps`, `procurement_usage_ledger`, `procurement_schedule_occurrences` Outgoing constraints: `FOREIGN KEY (occurrence_id) REFERENCES procurement_schedule_occurrences(id)`; `FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(id)`; `FOREIGN KEY (initiated_by) REFERENCES auth.users(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 49; inserts 52, updates 3681, sequential scans 5635, indexed scans 260663. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_usage_ledger

- **Owner/purpose:** Budget guard. One reserved/reconciled provider spend identity with held/actual/unknown amounts.
- **Disposition/lifecycle:** Retain operational/history; prevents retries/leases from overspending and preserves uncertain charges.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-analytics.mjs:112`, `scripts/lib/county-source-attention.mjs:98`, `scripts/lib/county-triggers.mjs:94`, `scripts/lib/hosted-ai.mjs:72`, `scripts/lib/hosted-workflow.mjs:201`, `scripts/lib/schedule-reporting.mjs:55`
- **SQL reference candidates:** `control_procurement_trigger(uuid,uuid,text)`, `reserve_procurement_usage(jsonb,numeric)`, `enqueue_procurement_schedule(uuid,integer,text,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,text,text)`, `reconcile_procurement_county_reads(uuid,uuid)`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (actor_id) REFERENCES auth.users(id)`; `FOREIGN KEY (request_id) REFERENCES procurement_search_requests(id)`; `FOREIGN KEY (step_id) REFERENCES procurement_workflow_steps(id)`; `FOREIGN KEY (trigger_id) REFERENCES procurement_triggers(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 54; inserts 66, updates 66, sequential scans 2122, indexed scans 4905. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_versions

- **Owner/purpose:** Lead audit. Immutable full lead fact snapshot for each fact change. Events record a small domain event, not a second full payload.
- **Disposition/lifecycle:** Retain history/retention; imports and repair verification compare saved fact history.
- **Repository reader/writer/recovery entry points:** `scripts/inspect-intake-schema.mjs:6`, `scripts/intake-snapshot.mjs:7`, `scripts/lib/api-link-repair.mjs:70`, `scripts/lib/batch-verification.mjs:42`, `scripts/lib/county-duplicate-repair.mjs:71`, `scripts/lib/hosted-import.mjs:11`, `scripts/lib/native-sql-rehearsal.mjs:14`, `scripts/lib/schema-query.mjs:1`, `scripts/verify-authenticated-access.mjs:14`, `scripts/verify-intake-processing.mjs:41`
- **SQL reference candidates:** `procurement_lead_changed()`
- **FK dependencies:** No incoming FK. Outgoing constraints: `FOREIGN KEY (lead_id) REFERENCES procurement_leads(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 413; inserts 443, updates 0, sequential scans 215, indexed scans 180. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

### procurement_workflow_steps

- **Owner/purpose:** Execution audit. One ordered bounded phase attempt, mutable while executing then retained; technical logs query trigger/sequence.
- **Disposition/lifecycle:** Retain operational/history; existing incremental logs avoid repeatedly loading 61k+ rows. No unsupported retention deletion.
- **Repository reader/writer/recovery entry points:** `scripts/lib/admin-analytics.mjs:119`, `scripts/lib/admin-run-history.mjs:33`, `scripts/lib/county-triggers.mjs:146`
- **SQL reference candidates:** `begin_procurement_step(jsonb)`, `finish_procurement_step(uuid,text,jsonb,uuid)`, `reserve_procurement_usage(jsonb,numeric)`
- **FK dependencies:** `procurement_usage_ledger` Outgoing constraints: `FOREIGN KEY (actor_id) REFERENCES auth.users(id)`; `FOREIGN KEY (job_id) REFERENCES procurement_jobs(id)`; `FOREIGN KEY (request_id) REFERENCES procurement_search_requests(id)`; `FOREIGN KEY (source_id) REFERENCES procurement_sources(id)`; `FOREIGN KEY (task_id) REFERENCES procurement_coverage_tasks(id)`; `FOREIGN KEY (trigger_id) REFERENCES procurement_triggers(id)`
- **Triggers:** No noninternal table trigger.
- **Observed counters:** estimate 61217; inserts 61740, updates 61734, sequential scans 9196, indexed scans 69450. Observation-window caveats above apply.
- **Verification:** Relevant existing offline/native workflow, import, lead-access and scheduler tests must remain green; final catalog/policy reconciliation is pending. No table is certified retired by this initial register.

## Completion record

Phase 1 local audit/remediation is implemented and tested. The 42-table pre-migration inventory becomes **41 base tables** after the authorized membership retirement; the two proposed issue tables are not created. A safe source-label view adds no duplicated storage. Existing events retain the membership records and review history; internal review/archive events are excluded from the outbound event feed.

Verification: 183 UI tests, 399 offline workflow tests, both historical SQL scripts, lint and production build pass. Updated native PostgreSQL/PostgREST acceptance passes with actual role escalation denial, safe labels, decision CAS/replay, worker exclusion, membership archive equality/retirement and stale-role denial. The disposable failure rehearsal proves an unexpected view dependency rolls back the entire retirement. Existing county/SAM native import, protected-field, schedule audit, DST, concurrency/lease, analytics and incremental-log checks remain green.

Phase 2/3 and final release reconciliation remain pending. No production schema application or deployment has been performed. After authorized rollout, compare the live catalog to the expected 41-table disposition manifest, verify archive readback and rerun scoped allowed/denied live checks. This register does not claim that a local migration already changed production.
