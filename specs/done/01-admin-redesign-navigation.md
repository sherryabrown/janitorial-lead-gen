# Phase 1 — Admin header and Settings navigation

Status: completed locally, 2026-10-20. Parent: [requirements and original prompt](../todo/admin-workspace-redesign.md).
Initiating phase instruction: implement header/navigation and Settings shell while preserving existing Admin actions and all unrelated behavior.
Dependency: parent only. Deliverable is usable immediately; no reporting API required.

## Scope and reuse

Change src/app/AppShell.tsx header and Admin entry; reuse Supabase session/onSignOut, lazy AdminScreen, lucide Settings/profile icons, shared InfoTooltip and existing styles.css/admin.css tokens. Preserve Contracts/Companies modes and all queue filters/context. No auth schema, roles, schedule changes, new router/design-system library or unrelated refactor.

## Implementation

1. Add compact accessible Settings and Profile buttons in that order at top right. Settings has name “Settings”, current-state indication and an Admin entry. Profile shows signed-in email on hover/focus, and opens a tap/keyboard-capable popover containing email and Sign out. Email is text, not injected markup. Escape/outside dismissal and focus return; pointer can reach popover without tooltip vanishing.
2. Settings enters Admin/Schedules with one action; do not add a redundant navigation page. Only then remove existing summary-pill Admin entry. Preserve return-to-contracts callback/refresh and prior queue selection.
3. Establish typed Admin view/context model for schedules/stats/history/sources/geography, optional schedule/run/section filters, and return destination. Validate IDs and unsupported state. Choose shell state + small History API adapter if needed; no new routing dependency. Owner-scope restored state, drafts and sign-out cleanup.
4. Create reusable view navigation/layout shell using existing CSS. Existing county/state/SAM manual controls remain reachable through a concise Run now entry; existing working content can remain inside the shell until the later phase replaces it. Hide future empty navigation destinations or link useful existing content; no fake ready views.
5. Preserve async abort/generation behavior, lazy loading, connection retry, focus heading on entry and restore originating button on return. Do not remount editors in a way that loses pending actions.

## Data/API changes

None. Use actual authenticated session email; do not add a profile/settings database table. Navigation model is UI state only. Store no tokens or private diagnostics in URLs.

## Acceptance and verification

- Only new Settings entry opens Admin; old Admin menu gone. Sign-out still works on keyboard/touch; profile email accessible without hover.
- Existing manual run, schedule editor and separate SAM/state controls remain functional; drafts survive leaving/returning and do not leak to another signed-in user.
- Test AppShell entry/exit, popover keyboard/Escape/outside click, long/missing email, slow lazy import and auth changes; extend existing app/Admin tests, not a parallel app.
- Build/lint + affected UI tests. Extend tests/integration/admin-ui-browser.mjs for desktop, 390px, 320px, 200% zoom, tab order/focus return and no header page overflow. Verify queue filters and existing note/email/Companies behavior unchanged.
- Update parent/checkpoint with exact checks. Leave this child in todo if header or retained controls are inaccessible. No release/production deployment in this phase.

## Implementation checkpoint

- Settings now opens Admin directly; old Admin summary item and standalone email/sign-out header controls are replaced by accessible Settings/Profile controls. Profile email is available on hover/focus/tap; its popover retains sign-out and supports Escape/outside dismissal/focus return. Existing tokens, lucide icons and button styles are reused.
- Admin starts with schedules and has working Schedules, History/logs and Run now section shortcuts. County map, state sources, SAM, schedule editing and evidence actions remain mounted/available; no future empty views or reporting data were fabricated. Keeping existing sections together is the planned phase-1 transition, not completion of phases 2–5.
- Typed owner-scoped navigation uses session state/storage; no URL/router dependency was needed. Existing queue selection/filters and draft/pending controls survive navigation. AuthGate has an optional actual-session-end callback; cleanup is not tied to StrictMode unmount, and a changed owner gets a fresh application instance. No authentication policy, data API or scheduler changes.
- Automated verification: npm run check passed lint, 79 UI tests at that checkpoint, 344 workflow tests, SQL constraints/import/protected-field/concurrency checks and build. Final UI rerun after auth/tooltip refinements passed 80 tests across 11 files; focused ownership/StrictMode/navigation/profile tests also passed. Final lint/build receipts retained privately. Existing bundle-size advisory remains.
- Existing local browser harness passed desktop/390px/320px, keyboard and 200% CSS zoom, slow lazy loading, profile tooltip/popover and Admin heading focus, county/manual confirmation, multiple-time schedule and independent SAM paths. Screenshots for header/profile and Admin at all three widths were inspected. Fixtures intercepted network operations; zero production mutations. Existing unrelated queue navigation overflow was not changed; the new header/profile fit the viewport.
- Logs: ignored outputs/deployment/admin-navigation/; screenshots: ignored outputs/deployment/admin-ui/navigation-*.png. No migration, commit/push, release or Netlify production deployment performed.
- User spot-check: real signed-in email/profile/sign-out on desktop/phone; Settings → manual county/state/SAM draft → contracts → Settings retains work. Automated local fixtures cover these behaviors, but no live user session or production workflow was exercised.
- No scope deviation. Proposed commit: feat: add Settings and profile navigation.
