# Scheduling access startup fix — November 3, 2026

Published to https://spin.aptimap.tools following the owner's explicit deployment request. Netlify deployment `6aea5d0ccb5cc3a094a8357b` is ready, published and locked, replacing `6ae797261d5716040bf2693f`.

The frontend baseline remains `a8f417a9f16f4be000e73389c11a5b1dd35208e3` with only the scheduling startup changes in `src/features/admin/SchedulingRole.tsx` and `src/lib/procurement-workflow.ts`. These changes are currently uncommitted; the private build manifest records the exact deployed asset SHA-256 values.

The capabilities read allows 90 seconds for Render Free startup. After five seconds, Schedules explains that the service may be waking up. A failed connection reports a connection problem and retains the existing automatic retry interval; confirmed permission denials still fail closed. Focus events cannot overlap an existing access check. Other read deadlines remain unchanged.

Verification:

- 25 focused tests, lint and production build passed before deployment. Tests cover a 52-second wake, the 90-second deadline and automatic recovery, confirmed access denial, and cancellation when inactive.
- Draft and production HTML, JavaScript and CSS match the six-file production manifest. HTML verification allows only Netlify's existing public HUD addition. Production configuration points to the existing Supabase project and Render backend; no local preview configuration or private environment values were included.
- Signed-in draft and production browser checks loaded Saved schedules without runtime errors or product mutations.
- In the production browser, the first real successful capabilities response was deliberately held for 52 seconds. The waking message remained visible beyond the old 30-second deadline without an alert; schedules loaded when the response was released. This tests the live frontend under an imposed delay, rather than claiming an observed natural Render cold start.
- Read-only Render checks before and after publishing confirmed `plan=free`, automatic deployment off, and the same service update timestamp. No backend deployment, hosting-plan change, database migration or schedule mutation was performed.

Private release script, deployment receipts, asset hashes and browser screenshots are in ignored `outputs/deployment/access-check-release/`.
