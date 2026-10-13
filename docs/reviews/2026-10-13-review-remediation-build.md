# Code-review remediation build — October 13, 2026

Implemented [the completed cleanup plan](../../specs/done/pre-integration-review-remediation-and-cleanup.md) locally, with Bonfire/Euna excluded and Companies/email retained as future functionality. No deployment, live database/provider call, schema migration, account action or email was performed.

## Changes and evidence

| Review finding | Result |
| --- | --- |
| F1 note failures | Failed writes/edits retain drafts; confirmed writes stay successful if history refresh fails. Older save responses cannot clear newer or switched-lead drafts. Rejected edit promises are handled. Shared draft behavior across lead switches is preserved. |
| F2 source reads | Workspace-owned in-flight cache; page/search changes reuse it. Manual refresh, source realtime events and stale focus invalidate it. No global protected cache survives workspace unmount. Failed/invalidated loads cannot repopulate a newer cache. |
| F3 history completeness | Stable 500-row pages, 100-note ID chunks, deterministic timestamp/ID ordering. Test reads 1,005 notes + 1,005 edits + 1,005 stages plus identification (3,016 records), with no missing/duplicate IDs. |
| F4 error disclosure | Controlled state-derived request/import actions, stable failure code and diagnostic UUID; original exception goes to private server logs. Previous arbitrary checkpoint messages are suppressed on status reads. Private-marker worker/readback/attention regression passes. |
| F5 lint contamination | Private/generated outputs and machine state excluded; maintained application/functions/scripts/tests/config remain checked. |
| F6 read cost | Known-source collection shares stable bounded read conventions. Status selects required task/interpretation/usage columns. Capture-change checks query existence rather than downloading full capture history. Import baseline/FK/concurrency guards remain. |
| F7 documentation | One current backend route/config/limitations contract, including session/capture/reconcile and actual injected official-link discovery. Previous document preserved verbatim with source hash as historical fenced content. Maintained guide/workflow pointers updated. |

Observed offline query evidence: three concurrent/sequential queue page/search loads use one registry page rather than three; explicit invalidation causes a new read. With 50,000 saved hashes, unchanged uses one one-row probe; changed/new uses two one-row probes. This measures response/query counts, not hosted elapsed time or database scan cost. Existing complete bounded baselines still block on oversized scopes rather than silently truncate.

The note editor now shares its edit-save handler and initial filters use the existing default function. No broad AppShell/prototype rewrite was needed to eliminate those duplicates.

## Deletions and retained material

Deleted the duplicate root procurement prompt (canonical function-local copy retained) and the unused ignored SQL template. Removed the unused activity-date helper and six test-only client date/filter/sort symbols. Useful queue behavior assertions now run against the authoritative SQL; live format/date/default/URL utilities remain.

[The exact cleanup manifest](2026-10-13-cleanup-manifest.md) records hashes, references, metadata inventory and retention decisions. Historical batch tools, operational evidence, sanitized fixtures, schema/migrations, outstanding plans and legacy Generate remain. Skill draft comparison found two identical and four different/missing counterparts; drafts remain pending reconciliation. Private output metadata stays under ignored output, not public documents.

## Verification

Final `npm run check` passed on the complete current suite:

| Check | Result |
| --- | --- |
| ESLint | Passed, including maintained application/functions/scripts/tests. |
| App tests | 19 passed across 4 files. |
| Workflow tests | 231 passed, zero failed/skipped. |
| Both standalone SQL suites | Passed actual constraints/triggers, rollback, protected fields, provenance, concurrent-edit and no-op replay checks. |
| TypeScript + production Vite build | Passed; JS 495.36 kB / 142.27 kB gzip, CSS unchanged. |
| Real isolated PostgreSQL 15 + PostgREST access suite | Passed anonymous/RPC denial, member/non-member reads/stages, signed invalid/expired JWT rejection, note ownership, actor history, 1,005-row paging and service workflow access. Production not contacted. |
| Whitespace and maintained-document references | Passed. |

Windows Vite realpath restrictions required approved execution outside the filesystem sandbox. Those environment failures are distinct from test assertions; the new fixture/assertion issues were corrected before acceptance. Private logs remain in `outputs/deployment/code-review-2026-10-12/`.

Repository change count: 28 paths, excluding the unchanged pre-existing Bonfire/Euna plan; the deleted ignored SQL template is an additional local generated artifact.

## Remaining decisions

No decision blocks this cleanup. Future coordinated retirement of the disabled spin generator, historical operational-artifact retention, and UI/scheduling scope remain separate choices. Companies/email stay retained. Bonfire/Euna remains a separate plan and was not investigated or changed by this build.

Next: review the local diff; commit only if explicitly requested. Deployment and UI collection wiring/scheduling require their separately scoped work.
