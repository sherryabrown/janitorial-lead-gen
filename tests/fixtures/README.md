# Offline regression evidence

These fixtures are sanitized derivatives, **not live import packages or approvals**.
Never submit their SQL or review data to production.

The October 1 remediation tests reuse these same derivatives for 1,005-row isolated queue tests, Auth/RLS role tests, manual observations, request links and composed UI regressions. No production fixtures or approval receipts were rewritten. The reproducible core schema is separately maintained in `supabase/baselines/20260930_public_procurement.sql` and is development-only.

- `sam/`: selected September 16 SAM captures, the reviewed 008 batch and before/after rows, captured constraints/triggers, and the earlier 007 upsert regression. Keep the real 92-action response and 78 intake relationships to preserve existing pagination, compound-identity and reconciliation assertions. Unrelated historical events/versions were removed. These tests intentionally retain the batch's 321 baseline identities and protected-field coverage.
- `research/`: selected September 30 Ouachita/Texarkana registry/manual metadata, two mapped leads, one source and an extracted board-minutes excerpt. No PDFs, approval receipts, live credentials or full research archive are needed.

Sanitization removes user ownership/authorship IDs, user-managed notes/follow-ups/amounts, contact/account fields, local paths and credential-shaped metadata. Vendor identifiers are redacted. Only SAM action fields consumed by normalization/identity logic remain. Registry authorization text explicitly identifies an offline fixture. SQL 007's data literal is regenerated from the sanitized delta while retaining its guard statements. Review hashes are calculated from fixture payloads at test time.

Fixtures are compact JSON to avoid repeating the large formatted operational archives. They retain public procurement IDs/URLs and geographic facts needed to reproduce regressions. Their assertions do not establish current procurement availability, geography verification or production authorization.

Update related before/after/manifest/capture data consistently. Run `npm run test:workflow` and `npm run test:sql`; do not copy an entire private snapshot into this directory. Operational source archives stay in ignored `outputs/` locations. Tests fail when fixtures are missing, and the Node regression suites block network access.

## Added fixture files (`+`)

- `+ research/board-excerpt.json` (4,950 bytes)
- `+ research/build-manual-spec.json` (23,521 bytes)
- `+ research/build-persistence-before.json` (34,960 bytes)
- `+ research/build-registry-spec.json` (26,750 bytes)
- `+ research/finding.json` (204 bytes)
- `+ research/mapping.json` (23,505 bytes)
- `+ sam/007_incremental_sam_capture_2026_09_16.sql` (487,731 bytes)
- `+ sam/008_intake_processing_reviewed.json` (977,883 bytes)
- `+ sam/205653fc-3e11-45b0-a353-995bf4733e6a.json` (2,382 bytes)
- `+ sam/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json` (2,394 bytes)
- `+ sam/40f1f909-b0cf-41b7-bf4d-8fc4c0d2f4fa.json` (269,353 bytes)
- `+ sam/6bea0d5b-9bbe-411b-aa0c-86e2a89afc5a.json` (3,671 bytes)
- `+ sam/7517cb38-353d-4e8a-bf08-8e981022057b.json` (650 bytes)
- `+ sam/8d91dea4-7c62-4c80-99c5-d7b2235b23b0.json` (762 bytes)
- `+ sam/95675705-79ab-473c-8817-754ba336dfca.json` (2,146 bytes)
- `+ sam/b0098f0d-e96b-4c0b-bd66-c611634bb47e.json` (94,676 bytes)
- `+ sam/b50adc95-33ed-46da-b9ff-a92c59dab854.json` (753 bytes)
- `+ sam/cca820ce-2940-46b4-8e25-08d575fdbe84.json` (3,681 bytes)
- `+ sam/intake-after.json` (2,287,700 bytes)
- `+ sam/intake-before.json` (1,593,486 bytes)
- `+ sam/intake-schema.json` (17,545 bytes)
- `+ sam/live-baseline.json` (568,129 bytes)
- `+ sam/upsert-records.json` (486,214 bytes)
