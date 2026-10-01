# Code review guide

Prepared October 1, 2026 for the current working tree, including uncommitted remediation changes. This is a reading plan, not another implementation plan or a new security audit. Check off a section only after reviewing its implementation and relevant tests.

The product lets signed-in users examine procurement leads, change stages, and keep notes/history. A separate research workflow discovers sources, retains evidence, reviews candidate findings, and imports verified records into Supabase. Skill instructions guide portal/API setup and alerts. These are distinct responsibilities, not one automatic background service.

## How to use this plan

Review in the order below. For each responsibility, answer: **What goes in? What comes out? What can change? Who can do it? What happens if it fails?** Record issues as `file/function → observed behavior → expected behavior → supporting test or reproduction`.

Start with the business behavior, then follow one record into the database. Do not begin by reading every migration or all 2,900+ lines of AppShell straight through. Function names below are useful search anchors if line numbers change.

## 1. Understand the product and boundaries

- [ ] Read the operating contract before implementation details.

| Read | What it explains |
| --- | --- |
| [AGENTS.md](C:/Users/sherr/janitorial-lead-gen/AGENTS.md) | Product behavior, concise UI, preserved context, brand and integration constraints. |
| [PROCUREMENT-WORKFLOW.md](C:/Users/sherr/janitorial-lead-gen/docs/PROCUREMENT-WORKFLOW.md) | Current research-to-import process, write boundaries, evidence and approval rules. |
| [September 30 review](C:/Users/sherr/janitorial-lead-gen/docs/reviews/2026-09-30-project-code-review.md) | Historical strengths and weaknesses; not a description of every current line. |
| [October 1 remediation report](C:/Users/sherr/janitorial-lead-gen/docs/reviews/2026-10-01-remediation-build.md) | What changed, what was verified, and what remains limited. |

**Confirm:** all signed-in users can read shared procurement data and change lead stages; author restrictions remain on note edits; imports use a separate server workflow. At the end of the remediation build, database migrations were live and frontend changes were local. This guide does not recheck deployment state.

## 2. Application startup, login and access

- [ ] Trace opening the page through session restoration, login and logout.

| Files, in reading order | Responsibility |
| --- | --- |
| [index.html](C:/Users/sherr/janitorial-lead-gen/index.html), [src/main.tsx](C:/Users/sherr/janitorial-lead-gen/src/main.tsx), [src/App.tsx](C:/Users/sherr/janitorial-lead-gen/src/App.tsx) | HTML root, React startup, styles and delegation to AppShell. |
| [src/lib/supabase.ts](C:/Users/sherr/janitorial-lead-gen/src/lib/supabase.ts), [.env.example](C:/Users/sherr/janitorial-lead-gen/.env.example) | Browser Supabase client using public configuration. Review the example, not secret values. |
| [AuthGate.tsx](C:/Users/sherr/janitorial-lead-gen/src/features/auth/AuthGate.tsx) | Session restoration/subscription, sign-in/signup screen, authenticated content boundary. |
| [AppShell.tsx: App](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx:444) | Connects the auth gate to the signed-in workspace and sign-out action. |

**Ask:** Does logout remove protected state? What happens to an expired session or failed session lookup? Does signing up require email confirmation? Remember that hiding the React screen is not database authorization—review section 6 too.

**Read tests:** auth/logout cases in [AppShell.test.tsx](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.test.tsx).

## 3. Load, interpret, search and page through leads

- [ ] Follow a database row to the queue card and selected detail.

| Files | Responsibility |
| --- | --- |
| [src/lib/procurement.ts](C:/Users/sherr/janitorial-lead-gen/src/lib/procurement.ts) | Typed database rows; `loadProcurementContracts` queue RPC; lazy `loadProcurementLeadDetail`; `mapProcurementLead`/`mapProcurementSource`; stage, category, location, date and value interpretation. Also contains the older `findLeadIdsByActivityDate` helper—check callers before treating every exported helper as active. |
| [contracts/types.ts](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/types.ts), [shared/types.ts](C:/Users/sherr/janitorial-lead-gen/src/features/shared/types.ts) | UI contracts for leads, filters, stages, notes and history. Compare these with database row types. |
| [contract-utils.ts](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/contract-utils.ts) | Default filters, date boundaries/priorities, date labels and URL validation. Includes client filtering/sorting helpers; the live queue now filters on the server. |
| [AppShell.tsx: AppShell](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx:448) | Queue state, loading/errors, refresh/realtime, stale-response guards, selected detail, counts and cross-page checkbox selection. |
| [queue RPC migration](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260930000200_procurement_queue_pages.sql), [queue corrections](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20261001000100_queue_bounds_and_historical_dates.sql) | Server filters/search, full-data counts, stable paging, lighter row projection, history-based date predicates and page bounds. The later function definition is authoritative. |

**Ask:** Are a forecast, an open opportunity and an award distinguished correctly? Does unknown remain unknown? Do date-only values retain their day? Are counts based on the full dataset? What happens when filters change, a request returns late, or records move between pages? Are large evidence payloads fetched only when needed?

**Read tests:** [procurement-mapping.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/procurement-mapping.test.mjs), [queue-sql.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/queue-sql.test.mjs), [contract-utils.test.ts](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/contract-utils.test.ts), [contract-correctness.test.ts](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/contract-correctness.test.ts), paging/stale-response cases in AppShell tests.

## 4. Change stages, write notes and preserve research/history

- [ ] Trace one Interested action, one bulk change, one new note and one note edit.

| Files | Responsibility |
| --- | --- |
| [AppShell.tsx](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx) | `applyContractAction`, `applyBulkContractStage`, note handlers and `refreshContractHistory` orchestrate interaction and refresh. `ContractActions`, `StageReasonDialog`, `ContractBulkStageBar`, `NotePanel` and `HistoryPanel` render controls. |
| [save-lead-change.ts](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/save-lead-change.ts) | Applies a confirmed write before separately handling a failed history read. |
| [procurement.ts: history and mutations](C:/Users/sherr/janitorial-lead-gen/src/lib/procurement.ts:183) | Reads history and calls single/bulk stage, create-note and edit-note RPCs. |
| [ResearchContext.tsx](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/ResearchContext.tsx) | Displays imported qualifications separately from editable user notes. |
| [database baseline](C:/Users/sherr/janitorial-lead-gen/supabase/baselines/20260930_public_procurement.sql) | Search for `update_procurement_lead_stage`, `bulk_update_procurement_lead_stage`, `create_lead_note`, `edit_lead_note`, audit triggers and note policies. |

**Ask:** Is a bulk operation atomic? Does audit history name the actual actor? Can one user edit another user's note? Are research qualifications preserved when notes refresh? Does a saved stage stay saved in the UI when its history read fails? Does queue movement expose the next useful action?

**Read tests:** [AppShell.test.tsx](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.test.tsx), [contract-correctness.test.ts](C:/Users/sherr/janitorial-lead-gen/src/features/contracts/contract-correctness.test.ts), [local-access.mjs](C:/Users/sherr/janitorial-lead-gen/tests/integration/local-access.mjs).

## 5. Presentation, accessibility and inactive prototype screens

- [ ] Review the layout separately from its data logic.

| Files | Responsibility |
| --- | --- |
| [styles.css](C:/Users/sherr/janitorial-lead-gen/src/styles.css) | Brand, spacing, layout, selected/muted rows, controls, overlays, focus and responsive behavior. |
| [ModeSwitch.tsx](C:/Users/sherr/janitorial-lead-gen/src/features/shared/components/ModeSwitch.tsx) | Workspace switch and Coming Soon treatment. |
| [InfoTooltip.tsx](C:/Users/sherr/janitorial-lead-gen/src/features/shared/components/InfoTooltip.tsx), [EmptyQueueState.tsx](C:/Users/sherr/janitorial-lead-gen/src/features/shared/components/EmptyQueueState.tsx) | Filter explanations and actionable empty states. |
| [AppShell.tsx: SummaryPill](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx:1273) | Queue navigation/counts. Continue to `ContractFiltersBar`, `FilterSelect`, `ContractList`, `ContractContextPanel` and `SourceSummary`. |
| [AppShell.tsx: CompanyList](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx:1691) | Company prototype, related actions/context, sample company data and outreach previews. These are not the production procurement import pipeline. |
| [AppShell.tsx: EmailApprovalPreview](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx:2255) | Prototype email presentation; do not confuse this with the Resend signup-alert procedure. |

**Ask:** Can the owner scan and act quickly? Is keyboard focus visible? Are disabled functions clearly disabled? Are missing URLs plain text? Are busy, empty and error states understandable? Which pieces remain mock/prototype behavior?

## 6. Database model, permissions and migration history

- [ ] Read the current model first, then the changes that produce it.

Start with [the development baseline](C:/Users/sherr/janitorial-lead-gen/supabase/baselines/20260930_public_procurement.sql). It reconstructs the September 30 schema, including historical permissions that later migrations replace. It is **not** a production bootstrap command and **not** the final access policy by itself.

| Table family | Business responsibility |
| --- | --- |
| `procurement_sources`, requests, request-source and coverage tables | Known sources, requested geographies and coverage evidence. |
| `procurement_intake_items`, `procurement_intake_leads` | Candidate observations and links from evidence to canonical leads. |
| `procurement_leads`, `procurement_request_leads` | Application leads and their relationship to geographic requests. |
| Lead notes, note edits, stage changes, versions and events | User context, actor history and source-change audit. |
| Members, registrations, runs, jobs, receipts and action requests | Membership/account or operational state; inspect each policy rather than assuming identical visibility. |
| `spin_*` | Earlier generation/monitoring model; still relevant when checking alternate data exposure. |

Read every migration, grouped by purpose:

| Purpose | Files |
| --- | --- |
| Earlier generation model | [20260904000100_spin_contract_monitoring.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260904000100_spin_contract_monitoring.sql) |
| History and initial stage permissions | [20260910000200_procurement_lead_history.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260910000200_procurement_lead_history.sql), [20260910000300_procurement_stage_rpc_permissions.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260910000300_procurement_stage_rpc_permissions.sql) |
| Stage reasons and notes | [20260911000100_procurement_withdrew_stage_reason.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260911000100_procurement_withdrew_stage_reason.sql), [20260911000200_procurement_lead_notes_write_policies.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260911000200_procurement_lead_notes_write_policies.sql) |
| Bulk updates | [20260911000300_procurement_bulk_stage_updates.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260911000300_procurement_bulk_stage_updates.sql) |
| History naming/fixes | [20260911000400_rename_procurement_lead_history_tables.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260911000400_rename_procurement_lead_history_tables.sql), [20260911000500_fix_procurement_history_rpc_table_references.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260911000500_fix_procurement_history_rpc_table_references.sql) |
| Other-reason details | [20260911000600_procurement_other_reason_detail.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260911000600_procurement_other_reason_detail.sql) |
| Signed-in read boundary | [20260930000100_authenticated_procurement_reads.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260930000100_authenticated_procurement_reads.sql) |
| Complete queues and corrections | [20260930000200_procurement_queue_pages.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20260930000200_procurement_queue_pages.sql), [20261001000100_queue_bounds_and_historical_dates.sql](C:/Users/sherr/janitorial-lead-gen/supabase/migrations/20261001000100_queue_bounds_and_historical_dates.sql) |

**Ask:** Can anonymous clients reach data through any table, RPC or legacy copy? Are member restrictions applied only where intended? Are privileged functions narrowly scoped? Do triggers overwrite dedicated facts during an evidence-only change? Which migration definition wins?

**Inspection files:** [inspect-access.sql](C:/Users/sherr/janitorial-lead-gen/scripts/inspect-access.sql), [inspect-access.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/inspect-access.mjs), [verify-authenticated-access.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/verify-authenticated-access.mjs). These inspect live state; reading their source does not require running them.

## 7. Discover sources, request access and alert the owner

- [ ] Review the instructions that direct research behavior, not just executable code.

| Skill file | Responsibility |
| --- | --- |
| [SKILL.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/SKILL.md) | Main routing, geographic scope, evidence rules and completion requirements. |
| [discovery.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/discovery.md) | Search official sources for forecasts, opportunities and awards separately. |
| [verified-methods.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/verified-methods.md) | Dated evidence of working retrieval methods; not permanent guarantees. |
| [api-access-and-tracking.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/api-access-and-tracking.md) | Source/access ledger, API discovery and separate signup/credential/request states. |
| [accounts-and-email.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/accounts-and-email.md) | Existing-account checks, signup handoffs and strictly read-only Gmail or manual verification. |
| [signup-alerts.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/signup-alerts.md) | Resend alerts, fixed recipient/sender, deduplication and send/delivery receipts. |
| [database-persistence.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/database-persistence.md) | Reuse registered sources, retain candidates, review/import verified findings, amend observations and verify readback. |
| [runner-and-import.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/runner-and-import.md) | Tool entry points, external collector locations and geographic limitations. |
| [agents/openai.yaml](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/agents/openai.yaml) | Skill presentation/configuration. |

**Ask:** Is city/county performance established by evidence rather than a vendor address? Can a source be reused next time? Are submitted signup, account verification, issued key, successful API request and delivered alert distinct? Does an unresolved action survive the end of a research session?

These files instruct an agent during an authorized task. They are not an always-on scraper, mailbox listener, scheduler or Resend backend. Connection status and execution receipts live outside these instructions and require separate verification.

## 8. Retrieve API evidence and prepare database persistence

- [ ] Trace a saved API response and a saved public document through their separate entry paths.

| Files | Responsibility |
| --- | --- |
| [sam-search.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/sam-search.mjs) | Trusted local client for a SAM search and its saved audit. |
| [sam-search/index.ts](C:/Users/sherr/janitorial-lead-gen/supabase/functions/sam-search/index.ts), [supabase/config.toml](C:/Users/sherr/janitorial-lead-gen/supabase/config.toml) | Server-only SAM proxy, authorization, filter/endpoint limits, redaction, upstream calls and auditing. Review the handler's explicit secret check alongside `verify_jwt=false`. |
| [sam-normalize.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/sam-normalize.mjs) | Compound award/action identity, payload normalization, pagination/result classification and stable comparison. |
| [research-persistence.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/research-persistence.mjs) | `planRegistry` source/request reuse; `planManual` document observations/amendments; metadata guards; guarded persistence SQL and readback checks. |
| [supabase-admin.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/supabase-admin.mjs), [supabase-cli.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/supabase-cli.mjs) | Pinned project, server authorization held in memory and installed CLI invocation. These do not belong in the browser bundle. |

**Ask:** Does a failed or partial API response stay distinguishable from zero results? Are all pages accounted for? Does a contract modification become evidence for the same contract? Does recapture preserve originals? Can credentials enter provenance or logs?

**Read tests:** [sam-capture.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/sam-capture.test.mjs), [research-persistence.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/research-persistence.test.mjs).

## 9. Review, apply and verify imports

- [ ] Trace one package from preparation to verified database readback.

| Files, in reading order | Responsibility |
| --- | --- |
| [procurement-workflow.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/procurement-workflow.mjs) | Main CLI: captures, registration/manual staging, snapshots, review/package preparation, test receipts, status, guarded apply and verification. |
| [reviewed-batch.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/reviewed-batch.mjs) | Review validation, selected-run completeness, identity matching, geographic evidence, new-lead decisions and existing-lead amendments/request links. |
| [intake-reconcile.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/intake-reconcile.mjs) | Shared matching/SQL reconciliation plus historical batch-specific constants/planning. Review active exported helpers separately from old fixed approvals. |
| [batch-sql-test.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/batch-sql-test.mjs) | Executes proposed SQL against isolated PGlite schema/data; tests rollback and replay. |
| [batch-verification.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/lib/batch-verification.mjs) | Checks resulting rows, links, statuses, audit and protected fields against the reviewed manifest. |
| [intake-snapshot.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/intake-snapshot.mjs), [inspect-intake-schema.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/inspect-intake-schema.mjs) | Standalone current database snapshots and relevant import-schema metadata. Compare with the main CLI's corresponding commands for drift. |

**Ask:** What exact bytes does approval authorize? What invalidates the package? Do lead, evidence link, request link and intake status change together? Are notes/stages preserved? Does replay avoid duplicates? What happens if the commit succeeds but the response is lost? Is city/county membership actually reviewed beyond the state check?

**Read tests:** [reviewed-workflow.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/reviewed-workflow.test.mjs), [intake-processing.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/intake-processing.test.mjs), [intake-processing-sql.mjs](C:/Users/sherr/janitorial-lead-gen/tests/intake-processing-sql.mjs), [sam-upsert-sql.mjs](C:/Users/sherr/janitorial-lead-gen/tests/sam-upsert-sql.mjs).

## 10. Disabled generation, older tools and external code

- [ ] Account for code that exists but is not the current live workflow.

| Files | Responsibility/status |
| --- | --- |
| [spin_generate_contracts/index.ts](C:/Users/sherr/janitorial-lead-gen/supabase/functions/spin_generate_contracts/index.ts) | Dormant source discovery, Anthropic calls, URL fetching, extraction and writes to the earlier `spin_*` model. Review authorization, cost/fetch limits and canonical import integration before any activation. |
| [function prompt](C:/Users/sherr/janitorial-lead-gen/supabase/functions/spin_generate_contracts/prompts/procurement-bid-site-finder.md), [root prompt](C:/Users/sherr/janitorial-lead-gen/prompts/procurement-bid-site-finder.md) | Generation instructions in two locations; compare for drift. |
| [AppShell.tsx: ContractGeneratePanel](C:/Users/sherr/janitorial-lead-gen/src/app/AppShell.tsx:1327) | Disabled generation UI; also inspect generation request/types and `mapGeneratedSource`/`mapGeneratedContract`. |
| [prepare-sam-upserts.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/prepare-sam-upserts.mjs), [prepare-intake-processing.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/prepare-intake-processing.mjs), [verify-intake-processing.mjs](C:/Users/sherr/janitorial-lead-gen/scripts/verify-intake-processing.mjs) | Earlier batch-specific preparation and verification; current new batches use the main workflow CLI. |
| [SAM-SEARCH-PLAYBOOK.md](C:/Users/sherr/janitorial-lead-gen/docs/SAM-SEARCH-PLAYBOOK.md) | Historical execution context and distinction between old SQL drafts and applied work. |

Historical executable artifacts also exist in [outputs/sam-search](C:/Users/sherr/janitorial-lead-gen/outputs/sam-search): `007_incremental_sam_capture_2026_09_16.sql`, `008_intake_processing.sql`, `008_intake_processing_final.sql`, `008_intake_processing_reviewed.sql`, and `intake-schema.json.sql`. Review their provenance if auditing old imports; do not run them as current migrations.

The older Python `lead_discovery.py` and USAspending collector are outside this repository; their documented location is in [runner-and-import.md](C:/Users/sherr/janitorial-lead-gen/.agents/skills/arkansas-procurement-leads/references/runner-and-import.md). This guide did not inspect those external implementations. Reviewing all operational collection code requires a separate pass over that package. Likewise, repository source does not prove the contents of every deployed function or connected service.

## 11. Build tooling, tests and repository hygiene

- [ ] Confirm the project can be reproduced and that passing checks prove the behavior you care about.

| Files | Responsibility |
| --- | --- |
| [package.json](C:/Users/sherr/janitorial-lead-gen/package.json), [package-lock.json](C:/Users/sherr/janitorial-lead-gen/package-lock.json) | Commands, dependencies and resolved versions. Review lockfile changes rather than reading every generated entry. |
| [vite.config.ts](C:/Users/sherr/janitorial-lead-gen/vite.config.ts), [eslint.config.js](C:/Users/sherr/janitorial-lead-gen/eslint.config.js) | Build/test discovery and lint coverage. |
| [tsconfig.json](C:/Users/sherr/janitorial-lead-gen/tsconfig.json), [tsconfig.app.json](C:/Users/sherr/janitorial-lead-gen/tsconfig.app.json), [tsconfig.node.json](C:/Users/sherr/janitorial-lead-gen/tsconfig.node.json), [vite-env.d.ts](C:/Users/sherr/janitorial-lead-gen/src/vite-env.d.ts) | Typechecking boundaries and environment types. |
| [offline-only.mjs](C:/Users/sherr/janitorial-lead-gen/tests/offline-only.mjs), [offline-guard.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/offline-guard.test.mjs) | Keep default Node test execution and child processes offline. |
| [integration/README.md](C:/Users/sherr/janitorial-lead-gen/tests/integration/README.md), [local-access.mjs](C:/Users/sherr/janitorial-lead-gen/tests/integration/local-access.mjs) | Disposable real PostgreSQL/PostgREST HTTP/JWT access verification. |
| [access.test.mjs](C:/Users/sherr/janitorial-lead-gen/tests/integration/access.test.mjs), [disposable-marker.sql](C:/Users/sherr/janitorial-lead-gen/tests/integration/disposable-marker.sql) | Separate optional Supabase Auth account-lifecycle tests with target protections. |
| [fixtures/README.md](C:/Users/sherr/janitorial-lead-gen/tests/fixtures/README.md), [fixtures directory](C:/Users/sherr/janitorial-lead-gen/tests/fixtures) | Sanitized input/output/schema evidence. Inspect the fixtures referenced by each test; they are not live approval packages. |
| [.gitignore](C:/Users/sherr/janitorial-lead-gen/.gitignore), [development-workflow.md](C:/Users/sherr/janitorial-lead-gen/docs/development-workflow.md) | Private/generated/local-state boundaries and efficient validation practices. |
| [specs/done](C:/Users/sherr/janitorial-lead-gen/specs/done), [specs/todo](C:/Users/sherr/janitorial-lead-gen/specs/todo) | Requirements and decision history. Read the relevant plan with its feature; older or superseded plans are not implementation truth. |

`npm run check` covers lint, app tests, offline workflow/SQL tests, typecheck and build. `npm run test:access` is a separate configured local database/API gate. `npm run test:access:supabase` is a separate disposable Supabase gate. Their different coverage matters; one green command does not prove every environment.

Do not treat `node_modules`, `dist`, `.netlify`, `supabase/.temp`, private captures, receipts or deployment archives as additional hand-written application modules. Review dependency/deployment/evidence provenance separately. No checked-in `.github` workflow directory was present in this inventory.

## Finish with three end-to-end traces

- [ ] **Owner workflow:** sign in → filter/page/select → read qualifications → change stage → inspect history → sign out.
- [ ] **Research workflow:** choose Arkansas geography → reuse/discover source → capture primary evidence → register/stage → review → test → apply → verify source, lead and request links.
- [ ] **Access handoff:** identify portal/API requirement → check prior status → attempt authorized setup → preserve blocker → send eligible alert through Resend → record acceptance/delivery separately → resume after user action.

For each trace, identify the responsible files above and write down anything that is manual, external, disabled or unverified. This prevents mistaking the presence of a file or instruction for a completed integration.
