# Scheduling permission boundary

Phase 1 implementation. Authority: `public.profiles.role`, joined using unique `user_id → auth.users.id`. Verified values: `user`, `admin`. Legacy membership, email, JWT user metadata, client state and URL names confer no authority. The production server resolves the current profile once on every authenticated request; there is no per-row role query or stale role cache.

| HTTP operation | User | Admin |
| --- | --- | --- |
| Capabilities, counties, state-source associations | Read | Read |
| Schedule list/detail/activity/occurrences/changes | Read | Read |
| Schedule preview/create/update/pause/resume/archive/delete/run-now | Existing constraints | Existing constraints |
| Verified analytics, metric membership and run history | Read business projection | Read |
| Trigger list/status | Read business projection | Read |
| Request source-status | Read safe check/decision projection | Read same identity |
| Source review decisions and explicit re-enable | Denied | Version/revision/idempotency checked |
| Raw trigger steps, scheduler settings, registry/GIS diagnostics | Denied | Existing redacted operations |
| Manual request/trigger/SAM submission and technical continuation | Denied | Existing scope/lease constraints |
| Request packet, supporting captures/evidence, interpretation, discovery/review/resume | Denied | Existing evidence/native validation |
| SAM packets/process/reconcile; import prepare/continue/approve/reconcile | Denied | Existing reconciliation/validation |
| Access evidence/events/session/capture/reconcile/continue | Denied | Existing private credential/portal bounds |
| Any future/unlisted route | Denied | Normal routing/validation; unknown route stays 404 |
| Private scheduler tick | Separate server key; never a browser role | Same |

The explicit allow-list is `scheduleBusinessRoute` in `scripts/lib/procurement-capabilities.mjs`. `/v1/admin/metric-members` remains a business operation despite its path. Unknown/missing roles fail closed; database failure is an unavailable permission check, never a default Admin. HTTP capability injection exists for isolated test harnesses; `scripts/workflow-server.mjs` always installs the trusted resolver.

Business HTTP responses recursively omit checkpoints, evidence, diagnostic references, AI usage and technical next-action payloads. Detailed request endpoints remain denied rather than relying on response stripping alone. Safe source status uses fixed public copy. Direct database technical reads have restrictive Admin policies over existing permissive policies; service-only tables remain service-only. Lead facts, versions, stage history, authored notes and ownership procedures retain their existing business access.

`procurement_source_labels` is a security-barrier view over canonical sources. It exposes source labels/URLs and only coverage status/date fields from configuration. It is not another table or independently writable cache. The existing business source cache uses this view; raw source configuration is Admin restricted. Source review events are restricted while existing lead events remain readable.

The user authorized the narrow `profiles.role` exception after live inspection revealed own-row INSERT/UPDATE could assign Admin. The role trigger rejects untrusted role assignments/changes, preserves personal edits and leaves trusted postgres/supabase_admin/service_role account administration intact. The user also approved retiring legacy membership after lossless archival. Five legacy policies are replaced and the table is dropped with RESTRICT; archive/review events remain Admin-only and cannot enter the outbound event feed. No live role assignment, profile backfill or new membership authority is introduced.

Verification: disposable PGlite regressions cover role assignment, safe labels, CAS/replay, scoped exclusions and immutable task facts. Native PostgreSQL/PostgREST acceptance covers actual JWT database grants/RLS, profile self-promotion denial, ordinary personal edits, Admin without membership, HTTP technical denial and immediate loss of privilege after a trusted role change. Native acceptance must be rerun after subsequent schema changes. UI stale-panel clearing and final User/Admin scenarios are phase 3 deliverables, not claimed complete here.

## Phase 3 presentation and preview

Users also read the explicit safe `/v1/schedules/:id/sources` projection. It includes website name/URL, human location/category, method readiness and applicable check exclusions; it excludes private registry/configuration/evidence. `/v1/source-reviews` is Admin-only and derives canonical work from existing tasks/action requests instead of another queue table. Both roles retain the Bid website business summary through procurement_source_labels. Actor labels expose only a display name, never profile email or unrelated personal fields.

The UI waits for a trusted capability read, refreshes it on focus/while visible, clears private panels/drafts on role loss, and suspends hidden reads. The isolated local preview has separate sample identities; its role selector is not part of the Production entry point. No live profile, schema or deployment is changed by that preview.
