# SAM Admin release acceptance — October 19, 2026

The SAM manual import-approval behavior in this historical release is superseded by [automatic validated SAM saving](ADMIN-SAM-AUTOMATIC-DEPLOYMENT.md). Non-SAM approval flows remain unchanged.

Feature commit: `84f70f5` (`feat: add SAM Admin runs and schedules`), pushed to `codex/admin-county-trigger-ui`.

## Release

- Supabase forward migration `20261019000100_admin_sam_triggers.sql` applied after production preflight found zero county-less existing trigger children; migration history recorded atomically. Private `sam-search` function deployed before the matching backend.
- Existing Render service deployment `dep-dbaq8aqjnfac738ndp5g` is live on the feature commit. Environment configuration hash remained unchanged; no new worker, scheduler, account subscription, API key or AI setting.
- [Approved draft preview](https://bonfire-review--janitorial-lead-gen.netlify.app), deployment `6ad5a44a59793bbe6290154a`, serves the SAM controls and uses the existing Render backend. HTTP 200, health 200, exact-origin CORS preflight 204.
- Netlify production remains locked on deployment `6ad583d1b9bb1b307abcf1fd`. No production frontend publish.

## Verification

`npm run check` passed: lint, 59 UI tests, 270 workflow tests, SQL import/upsert tests, typecheck and build. The existing large lazy Admin/map chunk warning remains. A Windows sandbox temporary-cache failure was resolved by rerunning the complete check outside the sandbox.

`npm run test:access` passed against real isolated PostgreSQL 15/PostgREST. Added SAM assertions verify private access boundaries, future occurrence submission, leased capture context, audit, pause/resume and replay prevention without production contact. An initial gateway startup timeout passed on retry and in the extended scenario.

The browser fixture suite passed desktop, 390px, 320px and keyboard/focus checks. It preserved county selection, tested separate SAM confirmation/schedules and contacted no production API. The first live browser attempt stopped at an exact-label selector before submitting any SAM request; the corrected selector passed and its temporary account was soft-deleted.

## Live checks

Authenticated checks were submitted through the actual draft Admin UI with Arkansas performance location and NAICS 561720. October 16–18, 2026 returned one terminal captured page and zero matching records for each category. These are saved provider responses, not inferred empty coverage:

| Category | Parent trigger | Saved provider run |
| --- | --- | --- |
| Opportunities | `ab4671c7-af33-4055-980b-d4a79668f0f6` | `7bdd9366-410a-4651-b23b-82af2cb1d4c8` |
| Awards | `16502f93-08b7-4481-ab99-fe3843a3b738` | `91eaba73-e475-4d76-9028-8acfdb0089b2` |

Both parents reached needs-review with exact saved packets, `partial: false` and `terminal_confirmed: true`. Children have role SAM and no county or geography targets. No canonical lead import was performed. Existing reviewed import/readback/replay evidence and isolated tests remain the basis for import integration.

The disposable one-day opportunity schedule was created through Admin for October 19, 2026 at 05:07 UTC (00:07 America/Chicago); browser closed before its due time. Cron created occurrence `c1876ca0-5b6a-4301-a626-38acc1f2dad7` and parent `78ee208c-93a4-45ff-8df6-9a2b634296bd`. Run `8e66a6de-6c13-4fcf-94c0-090fc08d92fa` saved one terminal page for October 19 with zero records. All observed steps report AI not used, zero tokens and USD 0. Exactly one scheduled occurrence was persisted. The schedule was paused and archived after completion; the dedicated acceptance user was soft-deleted. Existing SAM jobs and environment configuration were preserved.

Private receipts/logs/screenshots are retained under ignored `outputs/deployment/admin-sam/`; they contain no saved bearer token, password or API key. The feature retains strict unknown-outcome reconciliation and explicit import testing/approval. Companies, email previews, county/state-source behavior and Bonfire access gates are preserved.

Final read-only verification at 05:08:20 UTC found one accepted scheduler HTTP 202 delivery and four successful Cron executions during acceptance. Original saved SAM jobs and all Render environment values were unchanged. Netlify production was rechecked after cleanup and remained locked on its original deployment. No required acceptance blocker or product decision remains.
