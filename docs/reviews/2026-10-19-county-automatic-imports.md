# County automatic imports — implementation verification

The user requested automatic county imports for manual and scheduled runs, superseding the earlier county approval requirement. Unrelated current behavior and Netlify production remain unchanged. Source discovery and protected Bonfire access are not expanded.

## Implementation

- Internal `county-automatic-v1` validates the persisted county trigger/request relationship, active owner and schedule state. It binds candidates to current interpretations, original reserved digests, literal primary/signed supporting evidence, actual county/confirmed city and date/service scope.
- Reuses import jobs, canonical planner, native PostgreSQL rehearsal, exact package binding, transaction guards and readback. Pending observations retain stable identity and use supported pending-parent supersession. Source facts update through a narrow allowlist; notes, sales stages and owner-managed fields remain protected.
- Each candidate/evidence wave has a durable deduplication key. Empty validation cannot hide later candidates. Invalid records retain explanations, matching uncertain imports remain held, and definite pre-send changes have one bounded reprepare attempt.
- County results show verified Added/Updated/Unchanged counts and View leads without selection/reason/approval controls. Existing operator/state review and SAM automatic saving remain supported.
- Scheduler baselines record provenance, rather than skipping equal content; no migration or new table is required. Scheduled work uses the same policy and retains overlap/uncertain-effect guards.

## Verification

Native PostgreSQL/PostgREST acceptance passes manual and scheduled nonempty county writes, repeat identity reuse, protection of an existing note and hold stage, and the real captured public-table/detail continuation to canonical persistence. The same gate covers SAM automatic saving, private table/RPC denial, scheduler replay and uncertain-effect guards. Policy tests cover missing/ignored evidence, pending observations, older evidence, canonical count aggregation, forged authority and the empty-wave/late-candidate key regression.

The extended browser harness passes desktop/390px/320px/keyboard checks with zero production mutations. The 390px automatic-saving screenshot was inspected: save counts and View leads remain above source gaps without horizontal overflow or approval controls. Private logs/screenshots stay under ignored `outputs/deployment/`.

`npm run check` passed (70 UI tests, 321 workflow tests, existing SQL replay/concurrency checks, TypeScript and build). Subsequent focused checks pass all 25 hosted-workflow/county-policy tests and all 10 integration-remediation UI tests, including the added read-only reconciliation action; final lint and production build pass. `npm run test:access` passes with two canonical writes in the county fixture, including the public-detail path, repeat identity reuse and preserved note/stage. Existing SAM automatic-import and access-denial gates remain passing. The existing bundle-size warning remains.

The final full `npm run check` also passes: 71 UI tests, 322 workflow tests, SQL replay/concurrency, TypeScript and production build. The user authorized commit/push, Render first, the Netlify draft preview and real Saline acceptance. The plan remains in todo until nonempty manual/repeat and disposable browser-closed scheduled acceptance automatically save and verify canonical leads. Production must remain locked and unchanged. Earlier verification requests used subsequently soft-deleted actors; do not reactivate them or rewrite ownership. Use a fresh authorized request when needed. Release commit: `feat: automatically import county leads`.

## Live acceptance checkpoint

The first released manual Saline run automatically added the verified public LRWRA record `1642` to canonical lead `7cf2cd5e-abe8-546f-acde-feacb18d2d7b`, visible through the normal authenticated Leads client. It settled without active/unknown jobs or worker errors. Source/access gaps remain separate; full county coverage is not claimed.

Live inspection exposed normal interpretation waits displayed as errors, narrow-screen grid overflow and a long state-source action. These display fixes are committed and pass desktop/390px/320px/keyboard browser checks with a realistic long label. The repeat then exposed historical pending-parent siblings: the new observation and the first imported observation can both amend an older unimported parent. The county planner now requires the exact processed sibling's same-source/stable-record canonical link before accepting this case; standalone/manual guards remain unchanged. It never imports or rewrites that pending ancestor. A versioned validation-wave key allows the identified saved result to continue without another search. Only verified readback for the exact intake clears its old exception.

Final local repeat-fix checks pass: 71 UI tests, 324 workflow tests, SQL replay/concurrency, TypeScript/build, focused county/workflow tests and native database acceptance. The native captured public-page regression imports the first pending-parent observation, repeats into the same canonical lead as Unchanged, preserves the pending ancestor, and retains existing scheduled/SAM/protected-field/access gates. Live continuation and the disposable future scheduled occurrence remain pending before plan completion.
