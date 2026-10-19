# Arkansas Admin: county triggers and activity

Planning began October 13, 2026. Parts 01/02 and scheduler acceptance are complete; part 03 is implemented and available in the approved preview. SAM automatic persistence has its own completed plan and deployment evidence. This parent retains the coordinated **Netlify production** release decision, intentionally outstanding; it is not an instruction to rebuild completed parts. Current local remediation is tracked in [the integration review plan](../done/integration-review-remediation-and-cleanup.md). See [Admin UI](../../docs/ADMIN-UI.md) and dated deployment reports for source, preview and production status.

## Initiating request

“Let's begin the UI update for managing the manual and scheduled triggers to (a) perform new source research for new locations, (b) update known sources, and (c) review existing sources for updates for the different counties in Arkansas. (a) and (b) are not dependent on the user to determine if it's new or known sources. Key steps must be logged including whether or not AI was used and if AI how many tokens/credits were used for that step (if they're not already). I'd like an Arkansas map that shows the counties so they can be selected and deselected to add/remove from the manual and scheduled triggers. You can consider this an Admin screen which should replace the current disabled Generate option. Please keep this clean, concise, very easy to understand and use. Please match the current UI.”

## Product decisions and scope

October 19 follow-up: [Automatic county source discovery and collection](automatic-county-source-discovery-and-collection.md) plans removal of technical seed/method setup from normal county runs, with Saline live acceptance. Its automatic verification requirements supersede the human source-review requirement below only after implementation and acceptance; non-SAM lead-import approval and explicit source-only schedule behavior remain unchanged. This is planned work, not a claim of current automatic discovery coverage.

Replace the disabled Generate entry in the Contracts summary strip with Admin. Keep existing queue filters, selection, notes, Companies and email previews intact. Admin spans the work area without the lead detail sidebar. Returning to a queue restores its context. Use existing typography, CSS tokens, neutral surfaces and #FF914D for selected counties and the principal action. Avoid a CRM dashboard or a pile of status cards.

One county selection drives one trigger configuration. Manual and saved schedules use the same configuration schema but independent drafts. Users never classify a county/source as new or known. The backend resolves that distinction on every run.

Two concise work options map to the requested outcomes:
- Maintain sources: reuse existing registrations/accounts; research missing sources and revalidate expired/changed methods for selected locations. This combines (a) and (b).
- Check for lead updates: fetch verified methods, compare evidence, review existing canonical leads and identify new candidates. This supplies (c). It does not silently promote candidates or overwrite protected user facts.
Both are initially selected. Category choices: Forecasts, Opportunities, Awards. SAM remains a separate statewide operation; this county feature does not silently add SAM calls. Bonfire/Euna stays deferred; its blocked route is recorded as partial coverage while other sources proceed.

Confirmed county scope: default to all incorporated cities plus county sources. Show the actual city names grouped by selected county, not just a count; use compact expandable lists for large selections. Run now/Save schedule confirms this visible scope and persists the resolved city IDs/revision. Do not require a separate city-picking task by default. Existing chat/CLI county confirmation behavior is preserved outside this new Admin flow.

State sources: research them when onboarding a new county scope. “New” means no completed state-source research checkpoint for that county/category/scope revision, not simply a new request UUID or missing fetch timestamp. A failed/partial checkpoint resumes instead of being considered complete. Once a relevant state source is found, persist its county/category relationships and give it an independent source trigger. Later county runs reuse its saved observations and report freshness/coverage; they do not enqueue that state's update again. A later new county can inspect the shared registry/evidence to find relevant state sources without repeating an already configured update. State-source triggers own their manual/scheduled execution and results feed relevant county reviews with actual work-location checks. No automatic geographic certainty from agency jurisdiction.

Confirmed access: every signed-in user may use Admin; no additional role restrictions for now. Preserve existing authentication and private-data boundaries. Confirmed cadence: daily with one or multiple chosen run times, weekly, and monthly; configure each county-scope or independent state-source trigger separately.

Initial timezone: America/Chicago, visibly shown; do not infer recurrence from browser timezone. Schedule starts only on explicit Save schedule with Enabled selected; default a new schedule to paused until that action. Cadence and time controls are native compact inputs: daily supports Add time/Remove time; weekly chooses weekday(s) and time; monthly chooses day of month and time. No raw cron editor.

## Screen layout

Header: Admin · County checks. Short explanatory line: “Keep procurement sources current and check for new or changed leads.”

Desktop: map and searchable county checklist on the left; compact trigger form on the right. Mobile stacks the form below the selector. Map/list are two synchronized ways to edit one selection.

Form: selected county count/names; work options; category choices; compact scope/date-window control; Run now principal action; Save schedule secondary action opening inline name/frequency/day/time controls. Show the scope and current AI spending cap beside the action, not implementation details. Zero counties or categories disables execution with an inline reason.

Below: a compact State sources section lists independently managed state-source triggers (source, related counties, last check, next run, Run now/Edit). Found sources receive one saved source trigger; recurrence is configured/enabled explicitly, without choosing a frequency on the user’s behalf. County map edits never alter state-trigger recurrence. Schedules table (name, county count, frequency/next local run, enabled/paused, Edit, Run now, Pause/Resume); Activity table (time, trigger, counties, status, changes, AI usage/cost, next action). A selected activity expands inline to county and step rows. No separate navigation required to see progress or a blocker.

After Run now: retain selection; show queued activity and focus its progress row. After Save schedule: show the saved schedule, next run, Edit/Run now. After completion: Review results links to saved candidates/evidence; View leads returns to the existing queue. No automatic import approval. Implement packet-bound candidate review and exact import-summary approval inline using existing services; show Reconcile for unknown commit outcomes.

## Planning baseline before part 01

- AppShell contains disabled Generate state/handlers/invocation/panel and the summary strip; the existing frontend uses Supabase directly for lead queues, without a workflow HTTP client.
- workflow-http.mjs authenticates Supabase bearer tokens and supports geography preview, single-county requests, status, attention, research packets, interpretation, reviewed imports and controls. No county list, trigger list, schedule CRUD or step-log endpoint exists.
- geography-service/geography-routing already resolve county cities and route supported non-SAM methods. Multi-county selection needs a parent trigger and frozen child scopes, not a fabricated county name or an unrestricted all-source run.
- official-link-discovery performs bounded saved official-link research. Missing source tasks need a verified official seed; no unrestricted web search or automatic method activation exists. Human review of source/method evidence remains necessary.
- usage ledger records request/provider/model/rate version, reservations, token bounds and actual usage/USD. It has no step foreign key or complete non-AI event timeline. Jobs/runs contain checkpoint/capture evidence, not a user-ready step audit.
- Worker wakes on request/status traffic for up to two minutes. A schedule that merely creates a database row will not reliably run. Durable scheduling and wake/continuation are required.

## Plans and order

1. [01: execution and step audit](../done/01-admin-county-trigger-execution-and-audit.md): shared trigger model, automatic source routing, usage attribution and sanitized APIs.
2. [02: durable schedules complete](../done/02-admin-county-trigger-scheduling.md): recurrence, atomic occurrences, wake/continuation and recovery without a browser.
3. [03: Admin UI and county map — locally complete](../done/03-admin-county-trigger-ui.md): current-style map/form/schedules/activity/review wiring and legacy Generate UI replacement.

The screen can be developed against shared fixtures once 01's API contract is set. Do not release enabled scheduling until 02 passes browser-closed/restart acceptance. Each plan includes meaningful tests and completion criteria; move each independently to done after success. Update links in this coordinator as plans move. Move the coordinator only after all three parts pass together.

## Cross-cutting constraints

Preserve canonical reviewed-import guards, protected fields, accounts/tenant distinctions, immutable evidence, bounded methods and existing actual-usage handling. No automatic signup, provider challenge workaround, new paid service or new AI budget. Each entire trigger occurrence shares at most the existing $1 request envelope and four-call/32k-input/8k-output limits across children, plus the configured monthly cap (existing documented approval ceiling $10). Do not multiply that spending envelope by the county count. Exhaustion is a durable action, not silent partial success. Provider dollar cost is available; “credits” are displayed only when actually reported with their unit, never invented or confused with Codex credits.

Use a shared typed trigger target (county scope or state source) so independent state triggers share execution/logging/scheduling rather than a second scheduler. Deduplicate state triggers by stable source identity and category/method scope across counties; associate many counties to one source trigger.

Known-source method expiry causes revalidation; missing capability is not necessarily a missing source. Source registry changes and fetched content changes have separate logs. Preserve current any-historical-hash classification until separately changed; record actual comparison baseline/meaning rather than presenting it as “since last run.”

## Sources checked during planning

Official [Arkansas GIS county layer 48](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Boundaries/FeatureServer/48) exposes polygon boundaries, county names/FIPS and GeoJSON queries; it is also the county layer used by the repository municipality loader. Use a reviewed local snapshot for rendering, not live browser dependency on the GIS service.

[Supabase Cron](https://supabase.com/docs/guides/cron) and [scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) document pg_cron/pg_net and private Vault-held authorization. These support the proposed wake mechanism; this review did not inspect installed extensions, project grants or deployed configuration.

## Verification and completion

All three plans pass local lint/app/workflow/SQL/build and applicable real isolated access gates. UI verified at desktop/mobile widths, keyboard-only operation, map/list parity and visual match. Scheduling runs with app closed and survives duplicate ticks/restart without duplicate captures or imports. Per-step AI usage is attributable, unknown usage stays unknown, and totals are not double-counted. Perform authorized infrastructure/provider acceptance only after local gates and reviewable configuration are ready; document any deployment prerequisite rather than claiming a mock is live.

Parts 01/02 backend is deployed and scheduling passed production acceptance October 18: [API contract](../../docs/ADMIN-TRIGGERS.md) and [build/verification report](../../docs/reviews/2026-10-13-admin-trigger-execution-build.md). The map/Admin UI are implemented locally in part 03; the coordinated release/readback remains outstanding.

Next: review the part 03 build on `codex/admin-county-trigger-ui`. Commit/push is authorized; production Netlify deployment is explicitly excluded. A later authorized coordinated backend/frontend release still needs authenticated production readback. Preserve this coordinator in todo until that integrated production check passes.

SAM Admin follow-up completed October 19, 2026 in [its separate implementation plan](../done/admin-sam-manual-and-scheduled-updates.md). It reuses the shared scheduler and SAM backend without adding SAM to county searches. [Live acceptance](../../docs/ADMIN-SAM-DEPLOYMENT.md) covers the draft preview and existing backend; Netlify production remains unchanged.
