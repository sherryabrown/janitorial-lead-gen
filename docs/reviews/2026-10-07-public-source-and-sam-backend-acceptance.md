# Public-source and statewide SAM acceptance — October 7, 2026

## Completed approved imports

| Path | Exact approved job / hash | Verified result |
|---|---|---|
| Separate statewide SAM | `f4136bb3-cf68-4f85-a581-8583e889ffb4` / `11874ac536ca30157ee6ac69f815f66a91abe00edd2b9851871cc14179e698ee` | Existing Arkansas Post Field Office janitorial award: one processed intake and provenance link; zero new leads, payload changes or history events. |
| Registered North Little Rock public method | `1f2d93aa-75af-48cf-ba5d-f67313579410` / `1d9c12ce4e133e33e2d5fceee11f5c45c1f0cbae1ae0dcf0da7226c4a8a67660` | Existing 26-3922 Justice Center historical opportunity: one processed intake, provenance link, evidence update and history event; zero new leads. |

Both hosted preparations passed native procurement_test rollback, readback, replay and cleanup. Peak container memory was approximately 160.9 MiB for SAM and 236.2 MiB for the public batch. Both approved live imports passed independent readback; repeated exact approvals left the scoped database snapshots unchanged. Protected project fields and relationships were verified. All six previously corrected API lead links remain intact.

SAM request `cb4724ff-fedf-497f-b264-91cb5232fe22` reused saved run `63d5b666-5fbf-45b7-9239-a146931bcf86`. The Opportunities API returned an **award notice**, not an open opportunity. Lead `1146bdad-d221-5eaf-a6b6-4c5c5b0f76ae` retains its [specific SAM notice](https://sam.gov/opp/f7157407b8254d7fad83015fb800b683/view). Import receipt: `artifacts/a932911776f614d0f291549f4a48e5f2e368ebdf9f46c8a205a12f32f86cfadc`. This verifies that notice's reviewed processing and reconciliation, not every SAM category or statewide market coverage. The older Contract Awards candidate remains blocked by stale evidence.

Public request `aa598624-b6e5-4ad7-b00b-befc1d415d16` reused registered North Little Rock Commerce method `7e6deff3-dff9-5094-a1c1-369d1bab9d5f` with a June 1–30, 2026 document-publication window. No SAM job was planned. The public structured document listing and signed PDF support the existing historical opportunity, not an award or currently open solicitation. Listing creation date June 11 is distinct from the May 14 bid opening; original solicitation publication is unknown. Lead `55e9c2e1-68d5-5fda-a39a-c6fe3c248117` retains the [specific public bid-summary PDF](https://nlr.ar.gov/download/1004/2026/20645/26-3922-professional-janitorial-services-at-the-nlr-justice-center-summary.pdf). Import receipt: `artifacts/5fd390f1ae3d505348c5db4243bd367d9d5dc73b4bab7216e7c20ad1ffe6ece1`.

Real application lead mapping verifies both project names and specific public URLs. No new browser-click verification or frontend change is claimed.

## Focused fix and remaining acceptance

The user approved including already hash/signature/quotation-verified supporting evidence in the geography check. `scripts/lib/hosted-workflow.mjs` now verifies evidence before accepting supporting work-site quotations. Unchecked supporting text remains insufficient; wrong geography and out-of-window findings remain rejected. Fifteen focused tests, lint and whitespace checks passed.

The signed public PDF passed the corrected shared interpretation path and persisted interpretation `5cc80e0f-aae6-4e98-92d9-048a6cb10d08` and intake `67babd3f-02dd-5cc4-a951-3d0169eac0cb` before hosted preparation/import. **The code fix is not yet deployed:** commit/push authorization is pending. Deploy to the existing Render Free service, then replay this saved review through the hosted interpretation endpoint and verify the existing interpretation/intake is reused. Until then, the complete hosted public-source interpretation acceptance stays open.

The public worker stopped before inference because relevant evidence exceeded its AI input bound. Manual evidence review processed one selected document; remaining listing rows and other tasks are not claimed as reviewed lead coverage. Actual inference usage for these two requests: **0 calls, 0 input/output tokens, $0**. No new source research, SAM fetch, access work, schedules, frontend or AI behavior change occurred.

Private packages, snapshots and receipts remain under ignored `outputs/deployment/render/public-sam-*` and related SAM preparation files. No credentials are included here.

The owning plan remains `specs/todo/ui-managed-procurement-workflow.md`. Outstanding cache, restart/browser, discovery and access checks retain their existing status. Suggested code commit: `Fix geography validation for verified supporting evidence`.
