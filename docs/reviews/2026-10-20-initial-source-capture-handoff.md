# Initial source capture handoff

## Failure and fix

County research can register an official source and replan its initial `source_entry` capture after the main workflow has stopped at interpretation. The existing continuation was called after verified-method collection only. A newly registered entry without a verified opportunity method could therefore remain pending indefinitely.

The county trigger coordinator now calls the existing continuation with an initial-capture guard. It resumes only a blocked interpreter without an error, when that request has a pending initial entry check. The existing collector claims its normal lease and saves the capture. The update retains the checkpoint and checks its saved state/version before changing it.

Cancelled and maintenance-only requests, running workers, failed/partial captures, unknown outcomes, and portal challenge controls retain their existing behavior. No new queue, schema, collector, budget policy, or UI is introduced. SAM is outside this coordinator path.

## Verification

- Targeted workflow tests: 22 passed, including pending-entry recovery, cancellation, maintenance-only, running/unknown/error states, partial/browser work, empty queues, checkpoint retention, and stale-write rejection.
- Isolated PostgreSQL 15 + PostgREST acceptance: passed. A Saline County run first stops at interpretation; subsequent registration and replanning queue an entry without a verified method. The normal coordinator/worker saves exactly one initial capture, leaves no pending/running jobs, and does not invent a lead or poll completed checks.
- The same native harness verifies nonempty county manual/scheduled imports, canonical duplicate reuse, protected notes/stages, shared AI limits, and SAM manual/scheduled imports.
- Lint and production build passed. The existing large frontend chunk warning remains.
- Full offline workflow suite: 353 passed. Intake-processing and SAM-upsert SQL suites passed, including rollback, concurrent sales edits, provenance, and replay checks.

The Saline regression uses saved/controlled HTTP responses and an isolated database. It does not claim that unresolved live Saline channels have become accessible. No migration or deployment was performed; Netlify production is unchanged.
