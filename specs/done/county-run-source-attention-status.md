# Clear county run outcomes and source-specific next actions

Status: implemented and verified locally. Automated, desktop/mobile/keyboard and read-only existing Saline checks passed; see [verification](../../docs/reviews/2026-10-19-county-source-attention.md). Committed and pushed as `adffa71`; Render deployed first, then the approved Netlify preview. Release health, assets, preview CORS, configuration preservation and repeated read-only Saline checks passed. Netlify production remains locked on its original deployment. See the verification record for receipts and the hosted-authentication verification limit.

## Initiating prompt

> Please make that change: use “Finished — some sources need attention” for the overall run, and show the specific blocker and next action for each affected source. Keep Netlify production unchanged.

## Problem and scope

Admin Activity and Run details currently display `title(run.state)`. Consequently, a county run with verified automatic imports and unresolved source coverage appears as “Needs review,” suggesting that saved leads still require approval. Source rows often show a generic discovery action instead of the actual blocker.

For settled county runs whose remaining issues are source/access coverage, show exactly **Finished — some sources need attention** in Activity and the run heading. Each affected source must identify what could not be completed, who can act, and the next supported action. Valid saved leads and their verified counts remain visible through View leads.

This is a read-only presentation/status-contract change. Preserve stored trigger/job/task states, worker scheduling, polling/control semantics, import authority and validation, duplicate checks, notes/stages, AI settings/budgets, queues, Companies and email previews. Keep SAM and independent state/standalone review contracts unchanged. Do not resume Bonfire access work, add challenge automation, add a provider, migrate data, or deploy Netlify production. Do not relabel a genuine database/import failure as a finished source check.

## Current code to reuse

- `scripts/lib/county-triggers.mjs`: `status()` returns raw state and a generic `next(state)`; `list()` already batches relationships for paginated Activity. Parent aggregation deliberately preserves stronger active/unknown states. Keep that execution logic intact.
- `scripts/lib/hosted-workflow.mjs`: `status()` loads tasks, jobs, current interpretations and verified county import status. Task responses include source/location names and a generic discovery action, but do not expose the specific safe blocker. Jobs are associated with task IDs internally, which can be used before projecting the public response.
- `scripts/lib/hosted-store.mjs`: `publicJobAction()` already safely maps known checkpoint states and keeps arbitrary private exception text out of responses. Extend/reuse that approach for source attention, rather than exposing raw checkpoint objects.
- `scripts/lib/official-link-discovery.mjs`, `official-directory.mjs`, `public-source-check.mjs` and existing capture checkpoints hold structured failure state, HTTP outcomes, verification failures and access evidence. Inspect the actual saved forms before defining mappings. Some older checkpoints contain only prose; use a safe fallback for those.
- `src/features/admin/model.ts`, `ScheduleList.tsx` (`ActivityList`), `RunDetail.tsx`, `RequestReview.tsx` and `types.ts` own display labels, Activity actions, polling, selected request context and source rows. `RequestReview` currently substitutes `discovery_action` for the task reason and shows a general Retry source action.
- Existing regression suites: `tests/hosted-workflow.test.mjs`, `tests/automatic-county.test.mjs`, county trigger/SQL tests, `src/features/admin/IntegrationRemediation.test.tsx`, `AdminScreen.test.tsx`, and `tests/integration/admin-ui-browser.mjs`.

## Phase 1 — Safe, consistent read-only outcome projection

1. Define a small shared server projection for county outcome presentation, used by both trigger list and detail. Add optional response metadata, such as `presentation: { outcome: 'source_attention', attention_count: n }`; keep `state` unchanged. A frontend run-label helper maps this explicit outcome to the requested text. Do not globally replace `title('needs_review')` or introduce a new persisted status enum/table.
2. Emit `source_attention` only when the parent is settled and all its relevant children are settled, there is at least one unresolved source/access coverage issue, and no stronger blocker exists. Valid zero-result and source-only runs can finish with coverage gaps; a positive import is not a prerequisite. Do not require/import candidates for a source-only run.
3. Stronger blockers include active/pending work, paused or cancelled execution, unknown operations or AI charges, uncertain imports/reconciliation, real worker errors, blocked automatic persistence, or legitimate independent review/approval work. Preserve their existing labels/actions. Candidate validation exceptions are not automatically “source unavailable”; do not hide them under a sources-only explanation. An error-free legacy `interpret` wait already handled by the county coordinator is not a new failure.
4. Assess all children of a multi-county trigger, not only the currently selected request. Keep list/detail output consistent. Reuse scoped batch reads and existing chunking in `list()`; do not call `workflow.status()` per Activity row/child or perform source requests, AI calls, import preparation or writes while reading status. Fetch only required bounded data; avoid loading unrelated history or exposing checkpoints.
5. Project concise source attention data into existing request task responses, for example `attention: { kind, blocker, next_action, action_kind }`. Match collection/discovery/access jobs using task/source relationships, including job `task_id` and the discovery checkpoint task ID. Choose the current relevant attempt deterministically using persisted relationships/timestamps, not incidental row order. A resolved old attempt must not override a successful current check. Preserve distinct category/location gaps; avoid duplicate rows/actions for the same source task.
6. Use known codes/validated fields to generate public explanations. Never expose raw exceptions, arbitrary checkpoint prose, cookies, credentials, signed artifact links or private diagnostics. Unknown historical failures get “This source check could not finish; inspect saved evidence,” not an invented diagnosis. Do not infer Cloudflare from every HTTP 403 or assume all failures need human intervention.

Suggested public distinctions (wording may be tightened while retaining the meaning):

| Evidence-backed condition | Blocker | Next action |
| --- | --- | --- |
| Confirmed sign-in/human verification/access requirement | Manual action needed — portal access or verification is required | Review the saved access requirement and open the verified official portal when appropriate; use the existing access workflow |
| Accessible content but unsupported collection format | Automation support needed — this page cannot currently be collected reliably | View source evidence; collection support needs implementation |
| Official website or procurement listing not verified | Source not verified — no usable official listing was established | View the checked evidence; identify/verify the official procurement channel |
| Known timeout, unavailable website or transient HTTP failure | Website unavailable — the check did not complete | Retry the existing safe read only when supported, or view evidence |
| Known bounded response/page limit | Collection incomplete — the source exceeded the supported limit | View evidence; collection support needs adjustment |
| Genuine worker/import/database fault | Keep its existing error/attention treatment | Inspect the correlated diagnostic or reconcile the saved outcome; do not substitute a source retry |

Unsupported automation may need developer work, rather than a task for the business owner. Say so. If no effective in-app recovery exists, show an honest explanatory next action instead of a disabled or misleading fix button.

## Phase 2 — Concise UI, verification and documentation

1. Add the optional response types and one run-label helper. Use it in Activity and Run details without changing the global `title()` formatter, saved states or `activeRun()`. In the source-attention case, use **View results** as the Activity action; detail copy should lead to saved results and affected sources, not suggest candidate approval. Leave real review and reconciliation actions intact.
2. In existing source rows, show source name (or the unresolved location when no source exists), category/location context, a short **Blocker** explanation and **Next action**. Keep successful/no-result checks distinct. Put useful source attention near saved result counts, without reproducing the full technical job log. Keep logs/evidence available as secondary context.
3. Reuse existing View source evidence, SavedAccess and supported retry handlers. Gate retry by the actual recovery capability; a generic retry must not promise to resolve an unsupported parser, missing method or protected portal. This task does not add new retry, resume, verification or import behavior. Preserve selection, evidence pagination, county/schedule drafts, keyboard focus and queue context. Keep unrelated state/SAM interfaces unchanged.
4. Cover read-only projection and UI behavior with focused extensions to the existing tests:
   - Settled Saline-style manual and scheduled county runs with verified Added/Unchanged counts plus source gaps show the exact new label in Activity and details.
   - Source-only and valid empty runs with gaps; successful complete runs; multi-county runs with one active/unknown child; cancelled/paused runs; import blocked/unknown/pending; validation exceptions; genuine worker errors; independent state and SAM review remain correctly distinguished.
   - Human verification, unsupported collection, missing source, timeout/HTTP, size limit, legacy unknown blocker and resolved old attempts produce accurate source-specific text/actions. No arbitrary checkpoint content leaks.
   - List pagination uses bounded batch reads, with list/detail parity and no status-read writes, provider calls or new per-row request fan-out.
   - Source-specific actions reuse existing handlers; false automatic recovery claims and county approval gates are absent; counts and View leads remain intact.
5. Run `npm run check` and the existing browser harness. Verify desktop, 390px, 320px and keyboard layouts with the long overall label, long real source names and mixed blockers. Inspect screenshots and check overflow/focus. Existing native persistence acceptance need not be duplicated for a read-only projection; run it if implementation unexpectedly touches persistence/shared execution, then reconsider that scope before proceeding.
6. Reuse saved Saline receipt shapes from the county automatic-import verification for realistic fixtures. After an authorized preview release, read existing settled Saline runs to verify the new labels and source details; another live search/import or disposable schedule is unnecessary for this presentation change. Do not reactivate deleted test actors. Confirm existing valid leads and counts remain unchanged.
7. Update `docs/ADMIN-UI.md`, relevant API/status notes in `docs/ADMIN-TRIGGERS.md`, and a short verification record explaining that the raw internal state remains unchanged. Preserve historical acceptance receipts rather than rewriting their recorded `needs_review` state.
8. Keep this plan in todo until its automated and visual acceptance passes. If release is authorized, deploy a matching Render contract first when needed, then only the approved Netlify preview; verify production deployment ID/lock before and after. No production Netlify publish. Planning alone does not commit, push or deploy changes.

## Acceptance criteria

- An eligible settled county run shows exactly **Finished — some sources need attention** in both Activity and Run details.
- Each affected source/location clearly identifies its actual blocker and an honest, supported next action; human action and missing automation support are distinguished.
- Active work, import/worker failures, unknown effects and independent reviews retain accurate stronger status and controls.
- Saved leads, counts, validation, approvals outside county automatic imports, scheduling behavior, budgets and all unrelated functionality remain unchanged.
- Existing Saline records display correctly, with no unnecessary new searches or canonical writes. Netlify production remains unchanged.

No product decision is required before implementation. The requested label applies to finished county runs with source coverage attention; it must not conceal unfinished or unsafe work.

