# Evidence audit — reviewed September 17, 2026

This audit reviews saved results from September 9–16, not new searches or login tests. Recheck current official entry points and access when performing a new task. In particular, older `sources.json` and `REGISTRATIONS.md` still contain setup statuses from before the user supplied the SAM key; do not treat those stale statuses as current truth.

| Method | Verified outcome and limits |
| --- | --- |
| SAM Opportunities API | Seven real requests returned HTTP 200; five distinct notices. Endpoint: `https://api.sam.gov/opportunities/v2/search`. These findings did not establish a newly open, confirmed janitorial solicitation. API Active was not sufficient. |
| SAM Contract Awards API | Three real requests returned HTTP 200; 124 returned actions, 120 distinct actions, 74 full-identity contracts. Endpoint: `https://api.sam.gov/contract-awards/v1/search`. Seventy-one matched existing contracts; three were subsequently added. |
| SAM authentication | User obtained the key and stored `SAM_GOV_API_KEY` in Supabase. The private `sam-search` function used it successfully. This proves API access, not completion of Login.gov signup or portal alerts by the assistant. |
| USAspending | Official no-key award search and detail retrieval worked in the earlier research run. Source registry records `https://api.usaspending.gov/api/v2/search/spending_by_award/`. Useful for incumbent/history evidence, not proof of an open solicitation. |
| GSA Acquisition Gateway | Public browser search at `https://acquisitiongateway.gov/forecast` screened 75 Arkansas summaries and retrieved forecast FWS2025001061. Historical option-exercise forecast; not an open bid. No SAM forecast endpoint or working GSA forecast API was verified. |
| USACE district forecast | Full web extraction reviewed an 11-page Little Rock District PDF containing 358 rows. Forty-five relevant rows reconciled to 42 Arkansas, two uncertain multi-state, and one Missouri exclusion; 44 were retained. Direct HTTP download returned 403, so automated PDF fetching was not proven. |
| Other local/state sources | Official public listings, ARBuy solicitation S000000473, airport forecasts, and university intent evidence were retrieved in earlier runs. Some details/PDFs and other portals were blocked or only partially checked. Public retrieval does not prove authenticated award access. |
| Database processing | The September 16 transaction and readback verified three award inserts, 74 existing-lead enrichments and 78 intake links/processed statuses, increasing leads from 321 to 324. Preserve user sales and dedicated source fields. New generic orchestration was subsequently tested offline, not by another production write. |
| Little Rock Euna/Bonfire | User reported signing up. There is no saved proof here that the assistant completed signup/email verification, retrieved authenticated leads, or verified alerts. Do not create a duplicate account without checking. Free-tier usefulness remains a question to test against actual documents/access. |
| AR Bid/IonWave and other portals | User supplied a phone for AR Bid/IonWave, but completed registration/sign-in/email validation was not established. LRSD/IonWave public access had previously been blocked/empty. Do not claim successful credentialed retrieval. |

## Audit locations on this user's machine

- App/research runner root: `C:/Users/sherr/janitorial-lead-gen`.
- Recent raw API responses, report and verification: `outputs/sam-search/RESULTS.md`, UUID-named captures, `capture-summary.json`, `intake-processing-verification.json` under that root.
- Current process: `docs/PROCUREMENT-WORKFLOW.md`; historical API detail: `docs/SAM-SEARCH-PLAYBOOK.md`.
- Earlier research root: `C:/Users/sherr/Documents/Codex/2026-09-09/browser-plugin-browser-openai-bundled-the`.
- Earlier evidence: `outputs/arkansas-janitorial/docs/SWL-FORECAST-RECONCILIATION.md`, `data/swl-forecast-audit.json`, `data/sources.json`, and `docs/REGISTRATIONS.md` under that root. Their old load/seed instructions are historical, not current import authorization.
- Original CLI: `outputs/lead-discovery-cli/lead_discovery.py` and `WORKFLOW.md` under the earlier root.

If those locations are unavailable, ask for the current workspace/evidence location. Do not fabricate successful connections or install a replacement integration automatically. No mailbox connector was available when this skill was created; email verification remains conditional on authorized, functional access.
