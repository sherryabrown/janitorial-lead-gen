# Scheduling release: clear results, admin decisions and guided source repair

Created October 26, 2026. Planning only; no application behavior, permissions, database records, source settings or deployments are changed by this plan.

## Build status — October 27, 2026

The user authorized all three implementation phases, GitHub commits after each phase, and necessary Render/other deployments, with **no Netlify Production deployment**. Database changes are limited to procurement_* tables, with the subsequently approved narrow exception protecting profiles.role. The user confirmed no external writer to procurement_members and approved retiring it after lossless history preservation.

Phase 1 is complete locally: [implementation and test record](../done/01-scheduling-roles-and-source-decisions.md), [table audit](../../docs/reviews/2026-10-26-procurement-table-purpose-audit.md), [permission matrix](../../docs/reviews/2026-10-27-scheduling-permission-matrix.md). Phase 2, phase 3 and coordinated live release acceptance remain open. No live migration or deployment has been applied at this checkpoint. Historical planning statements below describe the original planning boundary; the execution authorization above governs this build.

## Initiating prompt and confirmed requirements

> the information that's shared for the logs, issues, sources, and geography is still very confusing...information overload and unclear information. reviewing best practices and great examples, what would you recommend to resolve this? keep in mind that we can consider separating Admin and User roles as well as acknowledging and/or performing a source fix; however, the Admin shouldn't have to be a rocket scientist to understand what the situation is and what actions need to be taken. let's make this the last refactor consideration for the Scheduling-related modules so we can get an appropriate release from this. please let me know what questions you have and/or if i should prompt you differently for this

The user subsequently confirmed:

- Separate Users and Admins, with permissions enforced at launch.
- A source problem needs a meaningful outcome: provide a website that the process can verify; record no website; acknowledge no issue; or decide not to fix/address it.
- Support both admin-performed fixes and developer intervention when needed. This is interpreted as guided supported repair plus a clear developer handoff, not expecting an admin to edit parser/code/configuration payloads.

Additional decisions confirmed October 26, 2026:

- Users create, edit, pause and run schedules; Admins manage source repairs and technical work. Existing active-account, version, ownership and scope constraints still apply.
- Keep the existing shared team workspace for schedules and leads. Enforce different actions for Users/Admins; do not introduce private user datasets or a new tenancy model.
- Recording **No website** or **Won't address** skips that affected source check in future scheduled runs until an Admin explicitly re-enables it. Other sources continue. A **No issue** decision does not disable checks.

The business-policy questions are answered. Existing Admin assignments must be verified from `public.profiles.role` before rollout. Reuse the existing profile/role assignment process; do not bootstrap a separate procurement role list, guess Admins, or elevate existing accounts automatically. Local implementation can use representative disposable profile records.

## Role authority clarification — October 26, 2026

Additional initiating instruction:

> we have a role on the public.profiles table that has a foreign key from public.user_id -> auth.id. why do we have a procurement_members table? The public.profiles.role will identify a user as a User or Admin

Use **`public.profiles.role` as the single authoritative User/Admin role**. Resolve the signed-in Auth user through the profile table's existing foreign key. Before implementation, inspect its actual columns, referenced Auth key, uniqueness, stored role values/casing, defaults and update policies; the user's description identifies the relationship, not permission to invent DDL or assume `profiles.id` equals the Auth ID. The sanitized procurement baseline inspected for this plan does not include `profiles`; its production definition has not been independently inspected in this planning update.

`procurement_members` is a legacy procurement staff allow-list, not a User/Admin role model. The baseline defines only an ID and unique `user_id` referencing `auth.users(id)`, with older `staff_read` policies checking membership. The September 30 authenticated-read migration and accepted access plan removed membership as a requirement for normal procurement reads/lead updates. Existing integration fixtures still exercise member/non-member behavior. These artifacts explain its historical purpose; they do not establish that the live table has no remaining dependencies.

Consequently:

- Do not create another role/membership table, require a matching `procurement_members` row, or synchronize a second role authority for this release.
- Derive API, database and UI capabilities from the trusted profile role and the confirmed shared-workspace permission matrix. A legacy membership row cannot grant Admin rights; its absence cannot block an otherwise authorized User/Admin.
- Protect `profiles.role` against ordinary-user self-promotion, including direct API updates and client-controlled metadata. Preserve permitted edits to unrelated profile fields and the existing trusted role-assignment process.
- Audit remaining membership policies, functions, grants, integrations and tests. Replace any live dependency that conflicts with profile-based access through reviewed forward migrations. Retire `procurement_members` only after dependency checks and regression verification establish that it is safe; do not drop it simply because it is not the role source.
- Preserve the agreed User schedule controls, Admin source decisions and shared team data. This clarification does not change scheduling behavior or authorize live role/schema changes.

## Procurement table purpose and duplication audit — October 26, 2026

Additional initiating instruction:

> please also make sure all 'procurement_...' tables are actually used for something and that it is a good, purposeful, and non-repeated need. please update the 00 release plan accordingly.

Make this a required part of phase 1 and the final release gate. Every `procurement_*` table must have an evidenced, purposeful role, with no unnecessary competing storage or duplicated workflow. This includes tables outside the visible Scheduling screens and tables proposed by this plan. Do not equate fewer tables with a better design: necessary relationships, immutable history, recovery checkpoints and validated caches can serve distinct purposes.

### Establish the complete inventory

1. Reconcile a read-only live catalog inventory with the repository baseline, all applicable forward migrations and proposed new schema. Include all relevant application schemas and identify partitions through their parent. Separate base tables from similarly named views, materialized views, functions and indexes. A text search for table creation is a starting list, not proof of the live schema.
2. The current repository contains **42 distinct `procurement_*` CREATE TABLE names**. This is a preliminary declaration inventory, not a certification that all 42 are live, active or justified:

```text
procurement_access_handoffs, procurement_action_requests, procurement_contacts,
procurement_county_state_research, procurement_coverage_tasks, procurement_event_receipts,
procurement_events, procurement_extraction_cache, procurement_geographies,
procurement_intake_items, procurement_intake_leads, procurement_interpretations,
procurement_jobs, procurement_lead_links, procurement_lead_note_edits,
procurement_lead_notes, procurement_lead_stage_changes, procurement_leads,
procurement_members, procurement_place_counties, procurement_public_captures,
procurement_registrations, procurement_request_leads, procurement_request_sources,
procurement_request_targets, procurement_runs, procurement_schedule_events,
procurement_schedule_occurrences, procurement_schedule_state_memberships,
procurement_scheduler_deliveries, procurement_scheduler_settings, procurement_schedules,
procurement_search_requests, procurement_source_capabilities, procurement_source_observations,
procurement_sources, procurement_state_trigger_associations, procurement_trigger_requests,
procurement_triggers, procurement_usage_ledger, procurement_versions, procurement_workflow_steps
```

3. Add live-only tables, record historical declarations already retired by forward migrations, and include proposed `procurement_source_issues`/`procurement_source_issue_events` as candidates rather than approved additions. Account for every discovered table; do not limit the audit to this seed list.

### Require a table-by-table purpose register

Produce `docs/reviews/2026-10-26-procurement-table-purpose-audit.md` during implementation, choosing a distinct receipt name if necessary. Each table needs:

| Required evidence | What to record |
| --- | --- |
| Purpose and owner | A plain-language business, execution, safety or explicit retention need; responsible subsystem |
| Data meaning | Record identity/granularity, authoritative versus derived data, and why this differs from neighboring tables |
| Writers | Actual application/worker/Edge Function/SQL trigger/RPC/cron/operator paths, with file/function references and the trigger for use |
| Readers and consequences | Actual consumer paths and what would fail, disappear or become unsafe without the table |
| Dependencies | FKs, policies, views, triggers, functions, jobs, dynamic SQL, supported CLI tools, external integrations and old supported deployments |
| Lifecycle | Creation/update/completion/recovery/retention rules; expiry/invalidation where it is a cache or projection |
| Observed use | Appropriate bounded, read-only database evidence and its observation window/limitations; no private row dumps |
| Overlap and recommendation | Relevant comparison tables, unique need, and retain/consolidate/retire recommendation with justification |
| Verification | Tests, migration/readback/rollback evidence and final disposition |

Trace reachable consumers, not merely matching strings. Tests, fixtures, DDL and old documentation are not sufficient evidence of current application use. Conversely, no direct UI/JavaScript reference, an empty table, or zero reads in one statistics window is not proof that a table is unused. For example, scheduler settings/deliveries are referenced through SQL scheduler functions. Historical audit data may be deliberately read only during investigation or recovery; document that purpose and retention policy rather than inventing an active writer.

### Challenge overlap and new storage

Review particularly:

- `procurement_members` against the authoritative existing `public.profiles.role`; no parallel role or business-access gate.
- `procurement_action_requests` and `procurement_event_receipts`: identify real producers/consumers and any external dependencies before deciding whether they remain necessary. Preliminary absence of non-test application references is not a removal verdict.
- `procurement_events`, `procurement_versions`, `procurement_source_observations`, schedule events and workflow steps: distinguish domain changes, snapshots, source observations, configuration audit and execution evidence; eliminate repeated storage only when it represents the same fact at the same granularity/lifecycle without a justified independent need.
- Search requests, triggers, jobs, occurrences and their links: explain orchestration versus execution, scope ownership, lease/retry/idempotency and no-run attempts. Preserve necessary many-to-many relationships and replay/recovery guarantees.
- Public captures, private artifacts, interpretations and extraction caches: justify repeated bytes/derived records, referential integrity, evidence immutability, cache invalidation and retention. Avoid independent editable copies of the same authoritative data.
- The two proposed source-issue tables: first evaluate whether existing action/event/audit storage can safely support the confirmed decisions, cross-run identity, exclusions, CAS and history. Prefer suitable existing structures. Add a table only with a documented gap and non-overlapping responsibility; these names are design candidates, not a requirement to create both.

A deliberately derived cache or read projection must identify its canonical source, regeneration/invalidation rule and measured/necessary benefit. A table kept for history must identify the retained facts and applicable retention need. Speculative future usefulness alone is not sufficient justification. Do not convert unrelated facts into one generic JSON table merely to reduce table count.

### Dispositions and safe remediation

Classify each table as **retain—operational**, **retain—history/retention**, **consolidate**, **retire**, or **unresolved**, with evidence. A retain decision explains why the need is distinct. Consolidation/retirement identifies the replacement, dependencies, affected behavior and data-preservation strategy. Unresolved items cannot be silently described as used or safe to remove.

Address unjustified active duplication and confirmed obsolete tables through a concrete reviewed migration/removal manifest, appropriate to this release. Do not claim the requirement complete by putting every doubtful table on an indefinite follow-up list. If a change would alter unrelated behavior or a consumer cannot be established, present the impact and resolve that decision before removal. An explicitly retained audit/archive table has a purposeful disposition; it is not falsely labeled an active workflow table.

Implement approved remediation with forward migrations, disposable rehearsals, dependency replacement, lossless mapping/backfill where required, row/reference reconciliation, authorization checks and rollback/restore planning. Preserve evidence, notes/stages, lead identities, historical outcomes, budgets, idempotency and active leases. Update relevant code, policies and fixtures together; do not rewrite applied migrations or drop tables based only on reference counts. A temporary compatibility copy needs an explicit cutover/reconciliation/removal plan rather than becoming a second permanent source of truth.

Completion requires a reconciled inventory, evidence-backed disposition for every table, justified new storage, and verified remediation or an explicit accepted retention decision. Any unresolved dependency or unexplained duplication keeps this audit gate open. This planning update performs no live database inspection, data cleanup or schema change and does not certify that the present tables already meet the requirement.

## Recommendation

Make Scheduling a results-and-action experience with three primary schedule sections:

| Section | What it answers | Default information |
| --- | --- | --- |
| Results | What happened, and can I use the leads? | Selected run outcome, verified new/updated leads, remaining source gaps, next action |
| Sources | Which websites support this schedule, and what is their current state? | Source name, relevant location/category, last verified check, plain-language condition; admin review action when permitted |
| Schedule changes | What changed about the schedule? | Readable configuration/lifecycle changes with actor and time |

Schedule location belongs in a concise, read-only **Schedule scope** disclosure near setup. Detailed GIS comparisons and registry methods belong in Admin source details. Run steps/logs become **Technical details** reached from the relevant run or source problem, rather than another equally prominent destination. A User can still see a short business progress summary without raw phases, IDs or diagnostics.

Use one selected run across results, source evidence and technical detail. Sources explicitly identifies **Current source setup**; run evidence explicitly identifies **What was checked in this run**. Repairing a source today must not rewrite an older run as complete.

Admin receives a focused **Needs attention** entry point, also reachable from schedule results and Sources. It opens the same source review workspace with the same source/problem identity. This queue is an entry point, not a separate workflow or duplicate set of issue records.

## Why the current screens are difficult

Inspected working-tree code, including the uncommitted efficiency fixes; preserve that work.

- `ScheduleDetail.tsx` presents Overview, History, Logs, Related geography and Sources as peers. Sources combines the current `Catalog` with selected-run evidence from `ScheduleActivity`.
- `RequestReview.tsx` uses the same saved task collection for Issues and Sources. Its six-column source table repeats result, blocker and next-action text, includes hard-coded unknown checked times, and exposes overlapping evidence/research/retry controls. Processing and diagnostics add more separate concepts below it.
- `source-results.ts` falls back to title-cased internal states and generic instructions. `RunStepLog.tsx` presents a reason as the result and displays `Next: Not recorded` even where no human action is required.
- `Catalog.tsx` combines registration, routing, category methods, verification references, access limitations and geography. Its saved-versus-current geography is useful evidence, but unsuitable as default business-user content.
- `SourceReview.tsx` expects a reviewer to understand captured evidence, category methods, runner/identity constraints and native validation. It should remain the underlying reviewed operation, reached through a guided task where appropriate.
- `workflow-http.mjs` authenticates callers and then dispatches many management operations. It does not currently establish a complete User/Admin capability boundary. UI hiding alone cannot implement the requested separation.
- The lead UI's `createProcurementSourceCache()` directly reads `procurement_sources`, including `config`. Database grants/projections must be audited with the API changes so ordinary Users keep safe lead names/links without gaining technical data through direct Supabase reads. Role authority is the existing `public.profiles.role`; the legacy membership table is not an additional access gate.

## Presentation rules

1. Default to a short title, one impact sentence, responsibility, and one primary next action. Extra evidence appears only when requested.
2. Keep schedule state, run outcome, source coverage and admin decision distinct. An active schedule can have an incomplete last check; an accepted gap is not verified coverage.
3. Use specific, readable names. Internal UUIDs, FIPS IDs, phase codes, parser names, tokens, raw JSON and repetitive unknown fields do not belong in the default list.
4. Show uncertainty where it affects a decision. Show one relevant missing-time explanation rather than repeating unknown in every cell. Never invent success, zero leads, full coverage or a timestamp.
5. Show verified leads even when a source is unavailable. Do not make fixing every source a prerequisite for working valid saved leads.
6. A successful action updates the same workspace and offers the next unresolved item or a return to results, preserving run, filters, scroll, selection and notes.
7. Use the existing neutral visual foundation and #FF914D for the principal action. Routine completed checks recede; status meaning also uses text and accessible contrast. Avoid a wall of warnings/cards/badges.

### Example, illustrative rather than live data

Default user summary:

> Finished with source gaps · 3 new leads · 2 updated leads<br>
> Two websites could not be checked. Your saved leads are available.<br>
> **View leads** · View source status

Admin problem:

> **County bid website could not be checked**<br>
> This run did not check opportunity listings from this website. Other sources continued.<br>
> Last successful check: October 20 · Latest attempt: October 26<br>
> **Review source**

The review workspace offers: **Provide website**, **No website**, **No issue**, **Won't address**. Verification can also produce **Needs developer** with an understandable reason and a diagnostic reference. Do not add a generic acknowledgement button that leaves the meaning undefined.

## Source decision semantics

| Outcome | What is actually recorded | What must not be implied |
| --- | --- | --- |
| Website supplied and verified | Exact source/method revision passed the applicable verification and readback | A plain HTTP 200 proves collection, or all leads were imported |
| No website | Admin records no usable public website for the specified entity/route, with basis | The system proved that no website exists anywhere, or the area has no opportunities |
| No issue | Admin reviewed this observation and judged no repair necessary, with reason | A failed automated check became a successful check |
| Won't address | Admin accepts this particular gap and its impact, with reason | Coverage became complete or the underlying problem was repaired |
| Needs developer | Supported in-product repair cannot finish; saved evidence/reference is available | The admin should understand SQL, parser internals, or manually repeat uncertain writes |

Display accepted decisions neutrally in the reviewed list. Keep them discoverable and reflect unresolved coverage in business summaries where relevant. Reopening must use a defined material-change rule, not reopen the same reviewed problem on every scheduled run.

For No website/Won't address, persist an explicit exclusion as well as the review decision. Show the exact affected source/category/geography and other schedules before applying it. Scheduled checks and automatic retries/research must honor the exclusion; opening a page or saving an unrelated schedule edit must not re-enable it. Re-enabling is an explicit Admin action, with validation before checks resume if no usable website/method exists. Historical checks, verified leads and unaffected work remain intact.

## Research and examples

These are design references, not products to integrate or UI styles to copy wholesale. Reviewed October 26, 2026.

| Reference | Relevant lesson | Application here |
| --- | --- | --- |
| [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Put uncommon advanced functions behind a deliberate secondary step | Outcome/actions first; evidence and raw logs on demand |
| [GOV.UK: Task list](https://design-system.service.gov.uk/components/task-list/) | Short task names and restrained completion states support scanning; simplify the service before adding a task list | A compact admin work list, not another task-management product or a forced checklist for all Users |
| [Carbon: Notifications](https://www.carbondesignsystem.com/building-blocks/core/components/notification/guidelines) | Contextual, concise feedback with a relevant action; avoid excessive interruption | One actionable source problem summary instead of repeated warnings across tabs |
| [GitHub: Workflow run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs?apiVersion=2022-11-28) | Run summary leads to a particular failed step and its logs | A stable run context and focused technical expansion rather than full logs by default |
| [PagerDuty: Incidents overview](https://docs.pagerduty.com/incident-management/incidents/overview) | Acknowledging work and resolving the problem are distinct events | Record reviewed/accepted decisions separately from a verified repair; do not import its on-call escalation model |
| [OWASP: Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Enforce permissions at trusted boundaries on every request | Server-side capabilities plus database policies and negative access tests |

The proposed layout is an application-specific synthesis of these references, not an externally validated usability result. Validate it with the concrete scenarios below before committing to presentation details.

## One release, three implementation phases

The scope spans authorization, persisted source decisions and guided UX; split the work into three ordered build specs with one coordinated release gate:

1. [Table-purpose audit, roles, source decisions and presentation contracts](../done/01-scheduling-roles-and-source-decisions.md). Complete the storage reuse/duplication assessment before finalizing new source-decision persistence.
2. [Guided source resolution and verification](02-scheduling-guided-source-resolution.md).
3. [User/Admin workspaces and release acceptance](03-scheduling-workspaces-and-release-acceptance.md).

Apply the confirmed policy consistently across all three phases. Do not ship a cosmetic role switch ahead of enforcement, or decision buttons ahead of persistence/verification. After acceptance, move each completed build spec and this parent to `specs/done/`; do not mark the release complete after a partial UI build.

## Release boundaries

Preserve recurrence/DST, county/state/SAM separation, leases, idempotency, audit/history, verified metric identities, lead notes/stages and import/reconciliation policy. No new scheduler, provider, portal bypass, general-purpose permission editor, invitation/email system or collector-platform rewrite. Developer handoff is an internal recorded state with copyable diagnostics; it does not send messages or create external tickets automatically.

The [efficiency follow-up](efficiency-reporting-and-maintenance.md) remains separate. Keep the completed inactive-polling, bounded read, query-sharing and incremental-log behavior. The explicitly requested procurement table-purpose audit and justified remediation are now in this release's scope, even for procurement tables beyond Scheduling. This does not absorb all-time reporting redesign, local output-file deletion, package dependency cleanup or unrelated lead UI work. Add only projections/caches justified by actual access patterns.

Freeze the section model, shared status vocabulary, disposition semantics and permission matrix after a short scenario review. Subsequent changes before release should fix demonstrated acceptance failures, not reopen the whole information architecture. This is a bounded final Scheduling refactor for this release, not a promise that future product needs will never change.

## Success criteria

- A nontechnical User can identify the latest result, whether leads are usable, any source limitation, and the next action without opening technical details.
- An Admin can explain an issue and complete one of the requested decisions without a raw log, JSON field or database identifier.
- The same problem has one current review state across schedule/run/source entry points. Distinct categories/geographies and uncertain imports are not collapsed incorrectly.
- User/Admin permissions hold for direct URLs, HTTP requests, Supabase reads/RPCs and stale sessions, not only visible controls.
- Every discovered `procurement_*` table, including proposed additions, has an evidenced purpose and distinct responsibility, an explicit justified history/retention role, or verified consolidation/retirement. No unexplained duplication or unresolved table-dependency decision is hidden behind release completion.
- Shared-source changes show affected scope; historical run evidence and user-managed lead data remain intact.
- Desktop/mobile/keyboard acceptance, actual role-denial tests, worker/idempotency regressions and previous read-efficiency checks pass.
- Prepare and verify a matching backend/schema/frontend release using the repository's existing release process. This planning request does not publish a site or apply live schema changes.
