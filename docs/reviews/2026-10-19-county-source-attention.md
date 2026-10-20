# County source attention — implementation verification

Implemented and verified locally. Commit, push, Render deployment and the matching Netlify preview are now authorized; release verification is pending. No migration, new search, import or schedule is needed. Netlify production must remain unchanged.

## Changes

- Eligible settled county runs use **Finished — some sources need attention** in Activity and Run details, with **View results** as the Activity action. Internal states and execution controls are unchanged.
- One shared read-only projection checks all children, usage uncertainty, actual current intake/request links, import receipts and validation exceptions. Active work, cancellation/pause, unknown effects, import failures, genuine worker errors and independent review remain stronger conditions. Resolved source attempts remain historical context rather than current blockers.
- Existing source rows show fixed public blocker/next-action copy. Access denial is distinct from confirmed human verification; unsupported formats and size limits identify developer work; missing channels identify manual source research. Saved project-detail gaps explicitly say that details are unavailable without guessing the underlying access requirement. Unknown evidence stays unknown. Arbitrary checkpoint errors, cached bodies, credentials and project URLs are not exposed by the new metadata.
- Retry remains the existing operation and appears only for a known transient failure in supported automatic discovery read stages. Evidence and access workflows remain available. County job details are secondary; independent state/standalone layout and controls are preserved.
- Activity uses bounded batch reads and projected JSON checkpoint fields rather than per-row status calls or cached interpretation bodies. The existing local SQL test adapter now supports the same restricted JSON aliases as the verified PostgREST query.

## Verification

`npm run check` passed: 74 UI tests, 329 workflow tests, SQL replay/concurrency checks, lint, TypeScript and production build. Final focused status/workflow checks passed all 26 tests, and the affected Admin/SQL-adapter checks passed all 16 tests. Final lint passes. The existing bundle-size warning remains. No native persistence changes were made, so the separate access/write acceptance harness did not need another run.

Focused server tests cover settled source-only/empty/verified-save cases; real import and worker blockers; multiple children; paused/cancelled requests; unknown AI usage; exact intake/request links; source access/format/limit/transient/legacy cases; resolved attempts; safe copy and read-only list/detail parity. UI checks cover consistent labels, stronger-state fallback, ineffective-retry suppression and preserved state research visibility.

The existing browser harness passes desktop, 390px, 320px and keyboard checks, including the long heading, source-specific blocker/action, a long state-source label, evidence/quotation preservation, existing guarded access and schedule controls. The 390px/320px results and exact 320px heading screenshots were inspected: text wraps without horizontal overflow and the lead/evidence actions remain available. Private logs/screenshots remain under ignored `outputs/deployment/county-auto/attention-*` and `outputs/deployment/admin-ui/`.

Final visual inspection prompted a narrow-screen adjustment scoped to this heading: the finished-source-attention title gets full width and Close details wraps below it. Production build and the full existing browser gate pass after that adjustment; the 320px heading was inspected again.

### Read-only existing Saline verification

The new local projection was run against the existing saved manual, repeat and scheduled Saline records, using only SELECT reads. All three retain raw `needs_review` and correctly produce `presentation.outcome = source_attention`, with 28 affected category/location task routes per run (not 28 unique source entities):

- Manual: `bf9a9d12-11c8-4ed6-ac64-5317689a62b1`.
- Repeat: `acc102d6-ece5-447b-a061-95ab264ddf49`.
- Scheduled: `f8a5baf2-1189-428e-817f-105b18737429`.

Saved evidence distinguishes access denial, unverified procurement listings, unavailable requests, collection limits and the remaining project-detail gap. Full canonical lead readback before/after is identical for `7cf2cd5e-abe8-546f-acde-feacb18d2d7b`. No verification actor was reactivated and no external source was fetched. Existing automatic import counts and historical acceptance receipts are unchanged; see the [automatic import release record](2026-10-19-county-automatic-imports.md).

## Release boundary

No production Netlify release is authorized by this implementation. The authorized release will deploy Render's optional status/task metadata first and then the approved Netlify preview, checking the production deployment ID/lock. Older backends safely retain existing display labels. No database changes or backfill are needed. Actual source coverage/access limitations remain; this change explains them rather than resolving them.

Proposed commit: `feat: clarify county source attention`.

