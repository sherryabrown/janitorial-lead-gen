# API lead-link correction batch — applied and verified

October 7, 2026. **333 inspected; 6 live links corrected and verified.** Code deployment remains held.

## Approved application result

User approved this exact six-link batch. Restricted reviewed application/readback passed; repeat application returned `replayed:true` before sending SQL. Each corrected lead has exactly one new event and version; prior history, original evidence, protected business fields and all relationships remained unchanged. No leads were created.

| Source | Actual links corrected | Verified API links after repair |
|---|---:|---:|
| USAspending | 1 | 265 |
| SAM awards | 4 | 4 |
| SAM notices | 1 | 4 |
| **Total** | **6** | **273** |

Post-application read-only audit checked all 333: 273 verified API links, 53 non-API exclusions and seven ambiguous origins; zero remaining confirmed-API link defects. Audit-only `corrected:0` means that audit made no writes; cumulative **actual correction count is 6**, evidenced by the application receipt. Seven provenance questions remain as listed below.

Private application/replay receipt: `outputs/api-links/2026-10-07/applied.json`; post-application baseline/audit: `outputs/api-links/2026-10-07-post-apply/`. The initial post-audit encountered a nonexistent general edit-table reference; the local CLI was corrected to use existing tables, and the read-only audit then passed. No additional live writes occurred. Deployment and unresolved-link migration remain held; implementation plan remains in todo.

The preparation audit and verification details below are retained as historical evidence; their zero-correction counts precede approval/application.

Exact private package approval SHA-256:

`c7a5b491f2de7fa754faa1a7c9af48b27abc2e6c7d9c03a8388bd5b8e7e99c7e`

Approval permits only this six-row link repair in the existing Supabase database. It does not permit code deployment or the pending unresolved-link migration. Baseline/schema/package drift requires reconciliation and new approval.

## Exact proposed corrections

Each row changes both `procurement_leads.source_url` and `payload.source_url`, saves verification metadata, retains the old URL as evidence, and appends existing event/version history. Names, sales fields, dates, amounts, identities, original evidence and relationships are preserved.

| Lead ID | Existing project → verified public record | Current defect |
|---|---|---|
| `481f45a4-56e5-53e0-a8f7-75c628f4b945` | [THREE YEAR SERVICE CONTRACT, BASE PLUS TWO OPTION YEARS FOR OFFICE JANITORIAL SERVICES FOR MILLWOOD TR-LAKES PROJECT.](https://www.usaspending.gov/award/CONT_AWD_W9127S26PA069_9700_-NONE-_-NONE-) | USAspending search API |
| `4d90c670-8efc-4738-8f79-ee87cacc03ae` | [CUSTODIAL SERVICES FOR PINE BLUFF ARSENAL (PBA)](https://www.usaspending.gov/award/CONT_AWD_W519TC26CA043_9700_-NONE-_-NONE-) | SAM award API; PIID W519TC26CA043 |
| `a83235b0-99c5-5ce9-ab8c-5f359e244d86` | [PSAC CUSTODIAL SERVICES](https://www.usaspending.gov/award/CONT_AWD_36C10X26F0075_3600_GS21F184AA_4732) | SAM award API; PIID 36C10X26F0075 |
| `bfe6697f-4046-4bfc-95e4-b1a518ffc3c9` | [BASE PLUS 4 OPTION YEARS JANITORIAL FOR THE POTEAU/COLD SPRINGS RANGER DISTRICT AND WORK CENTER.](https://www.usaspending.gov/award/CONT_AWD_12444026C0006_12C2_-NONE-_-NONE-) | SAM award API; PIID 12444026C0006 |
| `c66901ae-59f3-4e6f-b6f1-0ed4558ebf96` | [QXR ARSR JANITORIAL AND GROUNDS PORTION 50/50 SPLIT WITH NDP PROGRAM FUNDING.](https://www.usaspending.gov/award/CONT_AWD_697DCK24C00028_6920_-NONE-_-NONE-) | SAM award API; PIID 697DCK24C00028 |
| `a84a9526-1088-5e2f-b020-800a09380570` | [Pool 2 Park Cleaning Services Pine Bluff Project Office/Arkansas Post Field Office](https://sam.gov/opp/4918f8a64da94373a72f5163ac8991c2/view) | SAM workspace route replaced by public notice route |

Award verification used full generated identity, including parent/agency, against official detail and the official public route contract. SAM notice verification used saved official notice identity/UI-link evidence and GSA route documentation. A page-shell HTTP 200 was not record verification. No AI inference was used.

## Reconciled audit

| Source | Checked | Verified unchanged | Proposed correction | Non-API excluded | Ambiguous origin | Actually corrected |
|---|---:|---:|---:|---:|---:|---:|
| USAspending | 265 | 264 | 1 | 0 | 0 | 0 |
| SAM notices | 6 | 3 | 1 | 2 | 0 | 0 |
| SAM awards | 4 | 0 | 4 | 0 | 0 | 0 |
| USACE Little Rock forecasts | 44 | 0 | 0 | 44 | 0 | 0 |
| Little Rock | 6 | 0 | 0 | 0 | 6 | 0 |
| North Little Rock | 2 | 0 | 0 | 2 | 0 | 0 |
| ARBuy janitorial | 1 | 0 | 0 | 1 | 0 | 0 |
| Rogers city bids | 1 | 0 | 0 | 1 | 0 | 0 |
| UALR | 1 | 0 | 0 | 1 | 0 | 0 |
| Airport forecast | 1 | 0 | 0 | 1 | 0 | 0 |
| DHS | 1 | 0 | 0 | 1 | 0 | 0 |
| TASD board | 1 | 0 | 0 | 0 | 1 | 0 |
| **Total** | **333** | **267** | **6** | **53** | **7** | **0** |

273 confirmed API-origin leads are accounted for; none has an unresolved public-record identity in this snapshot. Seven origin questions remain and are not counted as verified/repaired:

- Little Rock Bonfire records 172620, 179263, 183632, 226524, 179683 and 169158: legacy discovery says API, public portal or web query without distinguishing capture path. **Operator next action:** recover original listing capture/import evidence and identify the path for each row. Preserve current links meanwhile.
- TASD `tasd-board-20260519-ssc-custodial`: saved manual evidence uses a short document link without capture content type. **Operator next action:** recover the original board-document capture and establish content type/access path. Preserve current link meanwhile.

## Verification and remaining actions

- 58 targeted tests passed (57 combined plus an additional concurrent-edit guard test); both original SQL suites, changed-file lint and type checking passed.
- Final native rehearsal: PostgreSQL 17.4; 3,185 copied rows across 11 existing tables; 5.62 MB snapshot; 6.85 seconds; 205.8 MB peak process memory. Rollback, protected-field/history/relationship readback, replay and cleanup passed.
- Independent live readback: production baseline unchanged, **0 corrected**, **0 persistent test tables/views**. Transactional test clones disappear on rollback.
- Private baseline, raw official proofs, immutable package, rehearsal/cleanup receipts: ignored `outputs/api-links/2026-10-07/`; package also saved in existing private storage. No credentials/private baseline rows belong in Git.
- **Completed:** exact six-link approval, restricted reviewed application, persistence/history/link checks and no-write replay. Actual corrections: **6**.
- Migration `20261007000500_api_record_link_state.sql` is prepared/tested but unapplied. It permits an explicit unresolved link on otherwise eligible future API leads; adds no tables. Current six non-null corrections do not require it.
- Future-import code is implemented locally. Deployment and hosted acceptance remain held; live collection behavior has not changed.

The plan remains in `specs/todo/` for provenance questions, migration and hosted acceptance. No additional collection or eligibility changes were performed.
