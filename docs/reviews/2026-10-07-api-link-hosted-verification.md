# API public-record links — hosted verification

## Deployment

- User released the code deployment hold. Render Free service `srv-db2q9mmi0phs738v7f80`: deployment `dep-db2t9nom7kps73c8d6rg` is live at commit `d26c059a9e741c7c1a4a2cfb1ffbca2e0d6fd65a`. Health 200; anonymous request 401; refreshed signed-in token succeeds.
- Existing Netlify site `425d7e19-1179-4ca3-b187-0bcbb8c332b1`: deployment `6ac5d5ccd335cb187b94a25a` published to https://spin.aptimap.tools. User approved temporary unlock; production lock restored and verified. Served `/assets/index-DHQ5zILa.js` matches the approved local build, SHA-256 `a1b04a393271164eceb562fe9d86218b69d5dfa2d5eeddd214c292c1b3c62533`.
- Initial deployment needed no further migration, paid hosting or AI inference. Subsequent SAM preparation identified a focused snapshot fix described below, now deployed and verified below. Six corrected links remain the cumulative repair count. Six Bonfire legacy origins remain explicitly unresolved under the user's instruction; no repeat source research.

## Hosted capture → interpretation → reviewed package

Saved Ashdown API listing and hash-verified official supporting detail reused; no new USAspending collection. Request `5cfb4876-166f-4a47-a68b-e82ca18a5c82`, task `87efc355-b318-47e3-9405-950108971503`.

The existing-review guard correctly rejected replacement without a superseded ID. Explicit revision created interpretation `266ecb5b-1d9e-41d4-ab9c-53bac03b144c`, revision 2, intake `48bd3d42-3b3c-5a35-a0d3-6db08d07721d`. Candidate readback confirms:

- Public record URL: https://www.usaspending.gov/award/CONT_AWD_W9127S26PA069_9700_-NONE-_-NONE-.
- API capture URL retained separately: https://api.usaspending.gov/api/v2/search/spending_by_award/.
- Verified record-link metadata and original manual capture evidence retained.
- Coverage remains partial; one saved award review does not cover remaining listing rows/categories/geographies.

## Exact verification batch — approved and verified

Job `6174642e-6dcc-4f8d-951b-097f20ab5486`.

Approval SHA-256: `1f98e6590749d48bbd705022f6bc65b07756ed161601bad5a93eded86393d7d9`.

It matches existing lead `481f45a4-56e5-53e0-a8f7-75c628f4b945` (Millwood Tri-Lakes office janitorial award W9127S26PA069). **Zero new leads.** Only changed canonical payload key: `intake_source_evidence`. Public URL, title, dates, amounts, user business fields and identities remain protected. Adds/processes the new reviewed intake and its lead link; legitimate evidence-update history appended once.

Hosted native rehearsal passed rollback/readback/replay/cleanup against PostgreSQL 17.4; 2,595 copied rows, 3.81 MB snapshot, 7.30 seconds, 226.0 MB peak process / 203.6 MB peak container. User approved this exact job; hosted application and independent readback passed with zero errors: zero new leads, one evidence update, one new intake link, one processed intake and one history event. Repeated approval left the snapshot unchanged. Receipt artifact: `artifacts/719982ae9192baca5cff6e70028e5f5736e8098338a38662f86a9ae23a5fe9da`. Private receipts: `outputs/deployment/render/api-links-import-*.json`.

User confirmed the live Millwood project-name click. Saved official identity evidence verifies six Millwood award URLs against six distinct award IDs; different destinations represent different awards. The other Millwood entry is a USACE forecast PDF. No additional URL correction was required.

## Separate statewide SAM

Nonempty verification followed using **dates already present in saved records**, without source research:

| Category / one-day window | Request | Verified staged public link |
|---|---|---|
| Opportunity / October 2, 2026 | `cb4724ff-fedf-497f-b264-91cb5232fe22` | `https://sam.gov/opp/f7157407b8254d7fad83015fb800b683/view` |
| Award / September 11, 2026 | `a4425d2d-e2f9-449f-85aa-5b4889b2bd2f` | `https://www.usaspending.gov/award/CONT_AWD_12444026C0006_12C2_-NONE-_-NONE-` |

Each completed one page/one record, persisted one immutable candidate, and retained API evidence separately. Authenticated packet and private intake hashes matched; notice/award record proof recomputed successfully, including full award parent/agency identity. No SAM import sent. Private readback: `outputs/deployment/render/api-links-sam-nonempty-verification.json`. Seventeen focused resolver/mapping/hosted-SAM regression tests passed; production build passed.

After token refresh, opportunity preparation job `ace74a04-c135-450e-8282-de4f25f3f502` found a missing foreign-key parent in its rehearsal snapshot: an older processed source intake links to a canonical lead belonging to another source. `scripts/lib/hosted-import.mjs` now includes only missing referenced lead parents and their existing related context. The regression in `tests/hosted-import.test.mjs` and live isolated native rehearsal passed (seven baseline leads, one matched notice, zero new leads, one proposed intake link). User committed and pushed the fix as `15e08694dcda9967d1e3a1db77dd949c8338d672`; Render Free deployment `dep-db2tj7p42hec73fs8bm0` is live. No tables, eligibility rules or production lead fields changed.

Award preparation job `05e8cb14-6659-4169-89d2-b2c5bac388b9` correctly rejected an older capture that would replace newer award evidence. Preserve this safety guard; no award import was sent. No additional SAM source searches are needed for the remaining notice check.

Two explicit one-day publication/modification checks, October 6, 2026:

| Category | Request | Outcome |
|---|---|---|
| Opportunities | `f477ec22-1b0d-46f0-a9f4-a035f53cd77e` | One page, zero records; reached review checkpoint |
| Awards | `24e184ff-3ac4-4544-9b6e-8dfeb523d84f` | One page, zero records; reached review checkpoint |

Both report statewide SAM separate from geography coverage. No captures were counted as nonempty link verification or imported leads. Shared SAM notice/award resolver regressions and prior exact-identity audit remain evidence for those paths; this live zero-result check alone does not prove nonempty SAM staging.

## Final hosted acceptance

Saved notice retry job `f4136bb3-cf68-4f85-a581-8583e889ffb4` reached `import_awaiting_approval` with `native_tests_passed`. Rollback, readback, replay and cleanup all passed: 1,399 copied rows, 969,195 serialized bytes, 2,403 ms, 158,851,072 peak process bytes and 168,734,720 peak container bytes, within Render Free's 512 MiB. Proposed package: zero new leads, one matched notice, one intake link and one processed intake. No approval or production application was sent for this SAM package.

All required API-link repair acceptance checks are evidenced. Six historical Bonfire origins remain explicitly unresolved as authorized; original evidence is needed to resolve them. Older SAM award evidence remains correctly rejected. These truthful states do not require repeating discovery or weakening import guards. Plan moved to `specs/done/api-procurement-lead-links.md`. No further Netlify deployment was needed for the backend-only snapshot fix. Cumulative corrected links: **6**.
