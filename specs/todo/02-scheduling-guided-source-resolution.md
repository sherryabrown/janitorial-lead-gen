# Phase 2: Guided source repair and meaningful admin decisions

Parent and initiating prompt: [Scheduling release clarity plan](00-scheduling-release-clarity-and-source-resolution.md). Depends on [phase 1 roles/contracts](../done/01-scheduling-roles-and-source-decisions.md). The user wants Admin to provide a verifiable website, record no website, record no issue, or choose not to address the problem, and support both product-assisted fixes and developer intervention.

## Objective

Let an Admin make an informed source decision without reading raw logs or understanding a collector implementation. Reuse the existing worker, official-source checks, evidence persistence, audited reviewed-method validation and native rehearsal. Do not create a second repair engine or pretend every site can be automated.

Admin authority comes from the existing `public.profiles.role` through phase 1's trusted checks. Do not require legacy `procurement_members` membership or add a second role assignment for these actions.

## Existing implementation and constraints

- `RequestReview.tsx` currently mixes `taskActions`, source evidence, candidate processing and diagnostics. Split a focused source-resolution component from the existing reviewed candidate workflow; preserve all required import checks.
- `SourceReview.tsx` supplies the existing reviewed source/method operation but exposes technical inputs. Reuse its authoritative operation behind the new guided presentation where suitable.
- `scripts/lib/hosted-discovery.mjs` owns `saveDiscoveredMethod`, task/request/category/geography binding, reviewed source identity, baseline/native validation and persistence. `reviewedDiscoverySource` currently preserves an existing registration; an arbitrary URL edit is not already a supported verified repair just because the form contains a source name or endpoint field.
- Existing `/v1/requests/:id/discover/resume`, reviewed discovery, supporting capture and access routes have different eligibility rules. `county-source-attention.mjs` already identifies some retryable failures and fixed public messages. Keep those constraints; do not replace them with a generic retry button.

## 1. One source review workspace

Entry points from Results, Sources and Admin Needs attention open the same item, preserve originating context, and show:

1. Human-readable source/entity name and relevant location/category.
2. One-sentence condition and one-sentence impact, including whether other sources continued.
3. Latest attempt and last successful verification if genuinely recorded.
4. Current decision/owner where applicable.
5. One recommended action, with the remaining decision choices secondary.

A plain-language **Review details** disclosure contains the observed official page and short relevant evidence. **Technical details** is a separate Admin expansion with redacted references. Do not start by opening JSON, a method editor or a list of unrelated jobs.

Decision controls: Provide website, No website, No issue, Won't address. Developer intervention is offered when verification/repair cannot complete or when the known problem type already requires code/operator work. Do not make an Admin click through a failing verification merely to learn that repair is unsupported.

## 2. Provide website -> verify -> apply

1. Admin enters an official website/listing URL. Use the existing source name/location/category from the problem; do not require UUIDs, FIPS codes, runner names, field mappings or SQL.
2. Server validates Admin capability and scope. Apply existing public URL/host/network/redirect/size bounds; never fetch private/local endpoints or forward credentials. A user-supplied URL is untrusted evidence.
3. Queue one bounded verification through the existing leased worker. Use a stable idempotency key bound to problem version, candidate URL and scope. Display pending/progress state with a simple explanation and retry/recovery behavior.
4. Reuse supported adapters/checks to establish official identity, the requested category/location and the appropriate method evidence. A reachable homepage, challenge page, HTTP 200, old capture or unparsed document is not successful opportunity verification.
5. Show a concise preview: what will change, verification result, which category/location is supported and which other schedules use the affected registration. If verification establishes only a website entry, say that explicitly and keep the opportunity-method gap open.
6. Apply the reviewed change only after the necessary evidence/rehearsal and expected-version checks. Reuse current source identity; do not create a duplicate source to evade a conflicting registration. Add a narrow source-revision repair operation only where the existing operation cannot safely amend the URL/method. Keep the old revision/evidence and read back the applied result.
7. Mark `fixed_verified` only when verification covers this problem's actual requirement and the application readback agrees. If saving is uncertain, reconcile the saved operation before a second send. If a recheck is needed to prove the repair, it remains Checking until that recheck finishes.
8. Return to the same review context with **Next source** or **Back to results**. Offer a source-scoped check where supported; do not automatically rerun every county, reimport old leads, or claim the historical run is now complete.

No schema/source/global-scope change bypasses a preview of affected schedules and explicit Admin confirmation. Preserve current native validator/restricted transport constraints. Do not move privileged credentials, captures or registry mutation authority into the browser.

## 3. Record the other requested decisions

| Choice | Minimum input and confirmation | Persisted/result presentation |
| --- | --- | --- |
| No website | Basis/reason and confirmation of entity/route being assessed; concise presets plus optional evidence/note | Admin recorded no usable public website; retain the gap and actor/date |
| No issue | A short reason explaining the review conclusion | Reviewed, no repair needed; preserve the actual check outcome and evidence |
| Won't address | A short reason and acknowledgement of the specific coverage impact | Accepted gap, with actor/date; never labeled verified |
| Needs developer | Safe prefilled problem summary and reason supported repair cannot proceed; optional Admin note | Internal handoff state, diagnostic reference and clear responsibility explaining what is needed from the developer; no automatic message or ticket |

Require reasons where they explain a review decision; do not require an essay or force fake evidence. Use appropriate confirmation for a shared-source exclusion/change, not a modal for every harmless navigation/read. A compact reason selector and optional short note should handle common decisions.

Confirmed policy: No website/Won't address atomically records the decision and skips the affected future source check until an Admin explicitly re-enables it. Apply the exclusion only to the selected entity/source/method/route/category; keep its coverage impact visible. Other sources and unrelated independent state/SAM work continue. No issue does not disable checking.

Show this effect before submission, including other schedules sharing the affected scope. Keep a clear Admin **Re-enable checks** action in the reviewed source details. For a no-website assessment, guide the Admin through providing/verifying a usable site before resuming checks when necessary. A successful URL repair may offer re-enable as the next explicit step; it must not silently clear an exclusion. Ordinary Users can manage and run schedules, but cannot override these Admin decisions. Existing in-flight operations may finish under the current cancellation policy.

Manual decisions cannot suppress a distinct import-outcome uncertainty or override missing lead evidence. Those items route to their existing review/reconciliation operation with a clearer explanation.

## 4. Known outcomes and safe next actions

| Situation | Plain-language explanation | Action |
| --- | --- | --- |
| Temporary timeout/rate limit | Website did not finish this check | Retry this source only when existing eligibility allows; keep rate limits/backoff |
| Official site not identified | No official bid website is verified for this location | Provide website or record No website |
| Supplied URL belongs to another entity | Website does not match the selected agency/location | Correct the URL; do not save |
| Working homepage without a supported listing | Website opens, but its bid listings cannot yet be checked automatically | Needs developer; preserve the verified entry separately |
| Login/human verification/portal restriction | Access must be confirmed before automatic checking can continue | Guided existing access review when supported; otherwise developer/operator handoff explaining what is needed from the developer; no challenge loop/bypass |
| Captured website without a matching current record | No matching records found only if the listing and date/category check completed | If incomplete, keep the limited verification explanation instead of zero results |
| Uncertain save/import outcome | The previous database operation must be checked before another attempt | Reconcile existing operation; do not offer ordinary retry or decision-based bypass |
| Native validation/unavailable collector | Product cannot safely apply this repair | Needs developer explaining what is needed from the developer, understandable reason and diagnostic reference |

Retain the paused unsupported provider limitations. This release adds a guided way to understand/route them, not new portal automation.

## Contracts, files and tests

Add a focused `SourceResolution` component and small client model in `src/features/admin/`; keep business-facing impact separate from the technical evidence panel. Extend `workflow-http.mjs`, `hosted-discovery.mjs` and the shared phase-1 decision/projection module only where required. Reuse `workflowRequest`/`mutationKey` cancellation and acknowledgement behavior.

Test all four requested outcomes plus Needs developer with a nontechnical scenario fixture. Include wrong URL/entity/category, empty/challenge/oversize pages, partial verification, old evidence, shared registration, concurrent edits, lost acknowledgement, slow verification, cancelled navigation, permission loss, duplicate retries and successful recheck/readback. Cover county, grouped state-source and SAM without forcing all into the same unsupported repair action.

Native tests prove role denial, scope binding, transaction/audit/readback and unchanged protected lead fields. UI tests prove no raw technical input is required, the note survives errors and returning from logs, and the action advances the same item. Verification is not allowed to become unbounded background polling or to repeat a completed collection on each UI refresh.

Acceptance: an Admin can choose and complete the correct supported path from one source item, tell whether it was fixed or accepted, and continue to the next item. Unavailable in-product repairs clearly become developer work. No claim of verification is made before authoritative persistence and the appropriate check succeed.
