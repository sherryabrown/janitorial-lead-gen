# Development workflow

Run commands from the repository root. Use Node 22.15+ on a supported Node release (tested with 22.15.0) and npm. Install the lockfile once with `npm ci`; repeat when dependencies change. The local tools are pinned: PGlite 0.5.8 and Supabase CLI 2.118.0. No separate research workspace is needed.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run test:app` | Vitest application tests |
| `npm run test:workflow` | Node workflow/mapping tests, including the reviewed batch CLI's offline SQL receipt |
| `npm run test:sql` | Historical intake/upsert SQL regressions, concurrency guards and protected-field preservation |
| `npm test` | All three suites, stopping at the first failing command |
| `npm run lint` | TS/TSX plus Node scripts/tests |
| `npm run typecheck` | TypeScript project checks |
| `npm run build` | Typecheck and production Vite build |
| `npm run check` | Lint, all tests, then build; stops on failure |
| `npm run supabase -- --version` | Installed CLI; no opportunistic `npx` download |

The workflow SQL regression covers the reusable planner/runner. The standalone SQL scripts retain historical reconciliation/upsert cases, including concurrent edits and provenance-only backfill; they are not redundant copies of that runner test. Each is invoked once by `npm test`. `check` runs `build`, which already includes typechecking; do not append another typecheck/build automatically.

The Node suites use a preload that rejects fetch/socket/HTTP connections, inherited by Node children. It is a regression guard, not an OS sandbox for arbitrary native binaries. Tests need no Supabase, Gmail or Resend credentials. Fixtures are documented in [tests/fixtures/README.md](../tests/fixtures/README.md). Missing fixtures cause failures, not skipped tests.

For an actual reviewed import package, use:

```powershell
node scripts/procurement-workflow.mjs test outputs/procurement-batches/NEW_PACKAGE
```

PGlite now resolves locally. The optional explicit engine path is retained for compatibility. This does not authorize a live apply. Fresh schema checks, pre-apply snapshot/intent, approval hashes, transaction rollback, replay and readback protections remain required. Do not reuse a receipt after changing its bound inputs. Local SQL tests do not prove Supabase Auth/RLS or simultaneous live sessions.

## Choose checks by the change

| Change | Checks |
| --- | --- |
| Plans/docs | Content, links and diff; no app rebuild |
| UI/helper | Relevant app tests and lint/typecheck; build for structural/config changes or milestone completion |
| Import/workflow | Relevant Node/SQL tests and script lint; retain rollback/replay/readback cases |
| Database access | Isolated Supabase/Postgres role/JWT tests and migration verification; PGlite alone is insufficient |
| Release/milestone | `npm run check` after final relevant code changes, plus applicable browser/access checks |

During edits, target a Node file with `node --import ./tests/offline-only.mjs --test tests/reviewed-workflow.test.mjs`, or a Vitest file with `npm run test:app -- src/PATH.test.ts`. After the appropriate gate passes, repeat it only if changes or new evidence justify it.

In PowerShell, separate necessary dependent commands with explicit failure handling, not a bare semicolon:

```powershell
npm.cmd run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Only then proceed to the separately authorized next operation.
```

## Measured costs — September 30, 2026

| Observation | Elapsed time |
| --- | ---: |
| Baseline lint | 5.6 s |
| Baseline app tests, approved rerun | 1.6 s |
| Baseline 31 Node tests using external PGlite/private captures | 13.6 s |
| Baseline standalone SQL scripts | 18.0 s |
| Baseline production build, approved rerun | 12.5 s |
| Initial portable 31 Node tests | 9.8 s command / 8.8 s test runner |
| Pinned CLI version startup | 0.7 s |
| Clean-copy `npm ci --offline --no-audit --no-fund` | 6.5 s |
| Clean-copy complete `npm run check` (4 app + 32 Node + 2 SQL scripts + lint/build) | 34.0 s |

These are single observations, not controlled benchmarks: some baseline commands ran concurrently, and filesystem/cache conditions differed. Do not claim a guaranteed percentage reduction. The clean copy included current uncommitted source changes but excluded `.env`, operational outputs, old research installations and Supabase local state. It installed its own dependencies from npm's already-populated cache. A first installation on a new machine needs network access.

Setup/permission waits are separate from these command timings. In this session, Vite failed within the filesystem sandbox and passed after approved execution. The CLI's `--version` also needed its normal user configuration/telemetry directory. The initial restricted dependency install stalled; the approved install completed in about four seconds. Locking versions does not bypass those access restrictions.

The new workflow removes external-folder setup and runtime package resolution. Smaller sanitized captures also reduced parsing/cloning work. No full live-operation timing profile was collected, and no production calls were needed for this build. Since local CLI startup is under a second, do not consolidate the transaction/snapshot pipeline speculatively. AppShell's size/coupling remains for the subsequent review-remediation plan.

## Working practices

- Start with the requested scope and working-tree status; preserve unrelated changes. Batch independent reads, search narrow paths and patch against verified context.
- Give concise progress updates and per-file `+`/`-` summaries. Avoid repeated full-file reads and broad test reruns without a new reason.
- Run local checks without credentials. If a sandbox/network error blocks a necessary operation, request the supported narrow approval once; do not retry indefinitely, disable security controls or copy secrets into test files.
- Keep a bounded milestone per build. Measure slow commands before restructuring them. Preserve required database verification even if it costs time.
- Do not run `npm ci` before every edit, reauthenticate already-working integrations, or deploy to verify a local documentation change.

Next: execute `specs/todo/02-code-review-remediation-and-authenticated-data-access.md`. This tooling work does not change live database permissions. The confirmed anonymous-read issue remains until that plan's access migration is implemented and verified.
