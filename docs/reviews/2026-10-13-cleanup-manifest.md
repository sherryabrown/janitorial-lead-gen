# Cleanup manifest — October 13, 2026

Scope: review remediation; Companies/email retained, Bonfire/Euna excluded. No production data/migration was deleted. Hashes describe local files, not live approval packages.

## Deleted files

| Path | Bytes | SHA-256 before deletion | Evidence / replacement |
| --- | ---: | --- | --- |
| `prompts/procurement-bid-site-finder.md` | 11133 | `a31ca0f32f378115e6063d5862f46b14557c18b921f3f36667bdd249fd140097` | Identical function-local prompt retained; runtime loader uses it. Guide updated; historical spec forwarding notice. |
| `sql-validation-template.tar.gz` | 4503638 | `aa8ff0eb9b109dfefde6b0122fa1db3b172362e8aa6613f5044c45585dc8adb8` | No runtime loader/reference. Docker/hosted preparation use native rehearsal; offline PGlite remains. |

## Removed symbols

- `src/lib/procurement.ts`: unused `findLeadIdsByActivityDate`; no source/test caller. Queue RPC owns activity-date filtering.
- `src/features/contracts/contract-utils.ts`: test-only `getApplicableContractDate`, `matchesContractFilters`, `matchesContractDateRange`, `compareContracts`, `matchesStatusFilter`, `compareTimes`. Live date/format/default/URL helpers remain. Useful priority/filter/tie-breaker assertions moved to queue SQL; mapping assertions test mapped facts.
- Duplicate initial AppShell filters now use the existing default function. Duplicate edit promise chains share one save handler.

## Retained candidates

| Exact item / family | Evidence / future use | Decision |
| --- | --- | --- |
| `scripts/prepare-sam-upserts.mjs`, `scripts/prepare-intake-processing.mjs`, `scripts/verify-intake-processing.mjs` | Fixed-batch reproduction/guards and SAM playbook | Keep pending audit retention decision; not new-batch entry points. |
| `scripts/lib/intake-reconcile.mjs`, `scripts/lib/sam-normalize.mjs` | Active reviewed-import/domain code | Keep. |
| Company/email prototype, related styles/types in `src` | User retained future functionality | Keep disabled; no speculative large refactor. |
| `supabase/functions/spin_generate_contracts` and spin schema history | Disabled legacy path/deferred replacement | Keep pending coordinated retirement; no table/migration deletion. |
| `tests/fixtures`, `supabase/baselines`, `supabase/migrations` | Sanitized regression data and rebuild/history | Keep. |
| `specs/todo`, `specs/deferred`, `specs/done`, `specs/archive`, dated reviews | Future requirements and historical decisions | Keep; update touched current pointers. |
| `outputs/known-source`, `outputs/procurement-batches`, `outputs/procurement-access`, `outputs/deployment`, `outputs/api-links` | Private evidence/approvals/recovery/session receipts | Keep; private metadata inventory only, no bulk deletion. |
| `outputs/skill-drafts/arkansas-procurement-leads` | Compared with installed repository skill | Keep unique/different material until reconciled. |
| `dist`, `node_modules`, build/cache metadata | Regenerable output/dependencies | Keep; removal unnecessary for integration. |
| `docs/reviews/2026-10-13-backend-document-history.md` | Verbatim prior backend doc and source hash | History only; current instructions in `docs/PROCUREMENT-BACKEND.md`. |

Draft comparison: 2 identical files; 4 different/missing installed counterparts. Private ignored output inventory: 2236 metadata entries; contents were not copied into public docs.

## Exact tracked operational/configuration inventory

Operational archives and sanitized fixtures serve different roles. Historical runtime readers can select UUID files without literal filename references. Filename/hash resemblance is not enough to delete; retain these entries.

| Path | Bytes | SHA-256 | Disposition / basis |
| --- | ---: | --- | --- |
| `outputs/arkansas-municipalities-2026-10-02-interior.json` | 148805 | `8e3c00ed0b706fa24eb785a679b13d34cfd849ff3faacbe7bd726e4c7e2a39eb` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/arkansas-municipalities-2026-10-02-review.json` | 148907 | `cd50c6762348a398f7ce810b8e7a3fbbc62c7e21b38e29f7d1618c29cf7e9b93` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/arkansas-municipalities-2026-10-02.json` | 134378 | `780ec2692415f4adc9270da3ec68e58443a9f1ad0c5f0997269ab8d8c080096e` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/arkansas-municipality-review-2026-10-02.md` | 3908 | `8a4a1ca65615de9fd542ee0d2b0f45b1f1e1f9b4dd956246a898a52d299d71a8` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/007_incremental_sam_capture_2026_09_16.sql` | 956621 | `c36867b34d3c3e9afe5c248fd89591f7d98e3c82c1dc523f35d119231959b05c` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/008_intake_processing.json` | 3516700 | `0f76e96da6551305f6f4e3a384cc690716d9c7d4f9cb6c2959acecada43cf064` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/008_intake_processing.sql` | 1962689 | `97c03a2d5094e12c1e4af22885dddfdaf5b5eacb3da257bc58673d24e37a043d` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/008_intake_processing_final.sql` | 1964516 | `073ec5cab011b610a22b44edbbb08341139721fb80d4884c76b743b3ed79f31d` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/008_intake_processing_reviewed.json` | 3516741 | `14069fd6e2a0a35326bef55630c49ab800029049f76af2d73c56877a4cb9a7f6` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/008_intake_processing_reviewed.sql` | 1962730 | `d6951993bf28239c26aeaf0fb476830539d22f07c58c33ad9cfb6814373d0608` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/0bdc27ee-5fdc-4292-b97d-0b742e3abf05.json` | 3702 | `b1c1464b790aef17c883053d87d324a657c0a0a93474235aeba1609bbbc56e3c` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/13d6c506-d074-46dc-9fa0-ab16a56e3ff4.json` | 804 | `8c8a8b537a8c79389c251524dc2ec3c71707c1fd77277b5e99e691b3ca68ae22` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/1c226a37-3ab1-4e1a-8a10-deb31a936ad1.json` | 11993 | `75bf203c9744d6e53be696ef289ac056306039bcabc798d0f071f3f6669a0ff8` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/205653fc-3e11-45b0-a353-995bf4733e6a.json` | 3403 | `c00879a3546b7ff4a96710572d01920b393807a33037fd15061a79903a104fb1` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/20bc470d-bfd8-4bd7-a4e0-926cdcd3696d.json` | 3415 | `269b55e80e47d53c74c16d1105db42882c649c5fc6b67e465e315e2f6b912c37` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/27ebac41-b042-439d-8376-c017e7dc381e.json` | 913 | `07e9b386352e8e0a811315d43d4f47491096326590c48d017751f12c5142ce5a` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/40f1f909-b0cf-41b7-bf4d-8fc4c0d2f4fa.json` | 1523486 | `744651cac341e3953ebe6741f664687b217e563cb2c1a0a78130111bc1246629` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/60f9d157-e10f-496f-9670-625e72a33634.json` | 1686590 | `ff159e1ee2b5e4dc84b50f1c87a6cc4abf5b94cc90b96ca2f6947585da014194` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/61d1ce32-d8e4-47e2-a113-3f61ef449af6.json` | 3714 | `0f2fa96c2800a4097609732a15b3b5d2e36f6d138314c289555ad752b6ca80a5` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/6b703152-b3ac-49d9-b96d-310c3831d769.json` | 3763 | `c874aa3d2406c551a2e4bcdd4db0b1b2989e20142f19b556d3c716a6bf68425c` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/6bea0d5b-9bbe-411b-aa0c-86e2a89afc5a.json` | 5371 | `b6e8672bb4799383f36961d7b983663a39821b7266ede0e0b254e7e910db25bc` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/7517cb38-353d-4e8a-bf08-8e981022057b.json` | 776 | `fda5493378008bc5df0285f58088c956b983678a1d9df6bddfc75da1e95615bc` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/8d91dea4-7c62-4c80-99c5-d7b2235b23b0.json` | 922 | `da70f097d3fdd93e57a5c570f73f7af0665af1ff999739356b782458c61ffe1e` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/95675705-79ab-473c-8817-754ba336dfca.json` | 3001 | `63fbb055892ad3043b2efacb672fc021f7032cb0af05e84d08eecefb16b5b2c2` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/RESULTS.md` | 9301 | `d60162a773778d82980bdc8282fb317271d5fd6fdf27304238943db1854655c7` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/a04d2c79-eb7d-4c85-a8d6-4e4a5511dfed.json` | 1556633 | `3e3380444244fcea28f4598039ebc1a340d30058d5cb7c6bb3438d27f514c7b0` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/awards-custodial-page0.json` | 112 | `8c59164558507bc2323880006d9291952a73030fbdd4714a4a6a54a5a5815a02` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/awards-naics-page0.json` | 117 | `5b399adb82ab00f06d9dc344214ffb6af97158cf4636cf2dceb6291bc7aa353f` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/opportunities-cleaning-page0.json` | 108 | `e6fe0881ed852aec142450fa4aa257ee303745966f5ac8dd9141db8b61616b74` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/opportunities-custodial-page0.json` | 109 | `6bcd61df1db50bd1f6aabc605b716ab007b3ea5921e86f016c5905fe0b1ea27f` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/opportunities-forecast-page0.json` | 108 | `1ea0c0f02344d0d1dcf8233479b870fea3ae9330906c19582ce22dc6bb8fef08` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/opportunities-janitorial-page0.json` | 110 | `4fb21ba055b875457746ca44d3169ed106bcc62ee92ef741ee7835c354cdff40` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/arkansas-2026-09-01-to-10-05/opportunities-naics-page0.json` | 106 | `b8b85f304976cb619a6bc47b664dc152f15ed8fbd2e1924221a7333b956a7eee` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/b0098f0d-e96b-4c0b-bd66-c611634bb47e.json` | 537245 | `fa79736aad09c0746bec9bffd04f3afd44f810c67b04aafeed66228f82f4e73a` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/b50adc95-33ed-46da-b9ff-a92c59dab854.json` | 913 | `9a2f6f847b23bcdbc5b885b2e52c6063373bd3e4b5db007a8c45b8b95e9c199e` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/c549fc99-dba7-40f4-b909-f5da914bdc90.json` | 12889 | `286e349dec2c075fc29740d6239d7cdfc0c60953c2d9c1a2f50fda899af3009d` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/capture-summary.json` | 4804 | `25c1f94682ccec32209438e60b3fdcb0f2e7b99bda664b43806e3e626aaedda4` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/cbc393cc-e0e7-4315-b885-cc622495d9ba.json` | 900 | `7875a4381bb7c263570316c47ea8ba4b4a205bc389281341bb6bcff6fa14d745` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/cca820ce-2940-46b4-8e25-08d575fdbe84.json` | 5572 | `4d92485bc8995bd15c444d71b0edb1737e88bf4d6ec8d16ecc76a67f340a9c64` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/dd95cd3c-1f75-4ac2-8fea-c57c708730b6.json` | 810 | `33906532425ff961b6b21d44e3e4575d3cf0792f15e6b5bf0897eb77bd58d5ca` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006.mjs` | 1943 | `b18303f086c9917e3436bd770d2cfe05c16e68f3fbff99773f57e385f96037e9` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/RESULTS.md` | 1940 | `a612cd074993d795b1ded84a717e4b7cc0d38590d0647c028c4593e91b0ce181` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/filters-0-0.json` | 105 | `516a0a67b0e07d150e9ce75561d27752518dcd7ca76be98934e6f00bde823f25` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/filters-1-0.json` | 109 | `594d528b40eedc85185ef78f8201a797b7e13f6e85a0c1b6b648de157c996701` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/filters-2-0.json` | 108 | `4d4312314812486feb280cae8332893c3089dc9cf0c52232661f60a9c5aee229` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/filters-3-0.json` | 107 | `8407bd951c447cc3aed8905507978cb3f4b0d8c51cf1b72b8f36f1b315e45434` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/filters-4-0.json` | 111 | `4c00475cfe3f7b6161e1c68d413b2b493a52e41fddd67cb8f86a2e39551dc693` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/filters-5-0.json` | 111 | `043b9b6d45fb3b28c5c853f376933907b1a12c3ca5916abcd871511834a11c7a` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/live-verification.json` | 759 | `3f8e9e6d480a0ba9b7584667aaa62fa705655e6f715d5ba418465c168b50737c` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/notices.json` | 2190 | `e1b81cceb22963c13cb11d435c685d80b48781056e158bf4158bcb4ab9202b9d` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/deadline-check-20261006/receipts.json` | 2744 | `baa60b188a13c6ce4e4152bcad70b4f06ecccbc106d9fb0f70e3402ddc9e3a6c` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/eebaef77-5574-4aae-acfd-e056c9de050a.json` | 900 | `8240eec8f83a9d1c81f50384648d7ae435cd3422ffa206769109252d73855c90` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/forecast-capture.json` | 2557 | `ed097d042f7bb0a1e8f2a2a47ef47e52a0e30f59baad68819feb1d7d45fdd9e3` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/intake-processing-verification.json` | 10189 | `3ede2b0270e78fce9a455d614c800a55c7e1dcdf693a0f3cadc8585755c243f9` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/intake-schema.json` | 23031 | `59872a098c8d79a7157cf97a6d31e23c15637425284b7197b20bfe28748a703c` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/intake-schema.json.sql` | 1809 | `8da1b48fa27ccab9078ff7d5a952acba50213a829ae746219c59aed168635605` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/live-baseline.json` | 686522 | `020528f663ca602ad25628c43d0a1e951cf952a442b4816638ffb88dab969ec5` | Retain: historical evidence/reproduction; not confirmed disposable |
| `outputs/sam-search/upsert-records.json` | 1666082 | `2ba977e4d2783651342d028ea8e9780fafcc3b3efc94d73acd8acb4130d89f44` | Retain: historical evidence/reproduction; not confirmed disposable |
| `source-methods/little-rock-bonfire-contracts.json` | 701 | `479f2d5a36484d3268a53949b6a96d0e0ef7056c4697ede0e1684083e81a5ed3` | Retain: verifier input |
| `source-methods/little-rock-bonfire-open.json` | 713 | `4b9c5f3e637cc622cab7fc7279cf5c15d9595e9d32e2bb349657e39ccbc885a3` | Retain: verifier input |
| `source-methods/north-little-rock-2026-summaries.json` | 767 | `c376cbb961def4032dbcac00399232ef5f77c9522320d4f114db183064071500` | Retain: verifier input |
| `source-methods/north-little-rock-active-bids.json` | 753 | `8ec9aecda532e07ca4fd3631e15b8c5c4ed846c29d257fb079cafe7a33fb23a4` | Retain: verifier input |
| `source-methods/pulaski-current-bids.json` | 630 | `1e3e9876336ac5b30d485cf896fff79d9a5189abcfe7e9b395042cdcbd30e67b` | Retain: verifier input |


## Second-pass cleanup — October 13

Removed only the obsolete exported `contentChangeType` from `scripts/lib/public-source-check.mjs`, its test import and test. Runtime uses `savedContentChange`; bounded new/changed/unchanged tests remain. No files or database artifacts deleted in this pass. Current geography/access/known-source instructions and the active UI-managed plan now separate current scope from dated history. See [second-pass build report](2026-10-13-second-pass-cleanup-build.md). Prior retention decisions, Companies/email future functionality and Bonfire deferral remain intact.
