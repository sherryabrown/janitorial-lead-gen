# Arkansas SAM opportunity deadline check

Requested routine janitorial response-deadline window: October 6, 2026–October 6, 2027 inclusive.

Six successful API searches were captured in procurement_runs. All reached terminal pagination: Arkansas NAICS 561720; Arkansas titles janitorial, custodial, cleaning and housekeeping; and NAICS 561720 with Arkansas in the title without a state filter, to check multi-site notices.

Publication query window: October 7, 2025–October 6, 2026. Actual response deadlines were reviewed separately because the current server runner accepts publication dates but not response-deadline filters. This checks notices published now, not future unpublished notices, notices posted before this window or every possible multi-state/alternate terminology result.

Seven returned rows deduplicate to four notice IDs:

| Notice | Review |
|---|---|
| f7157407b8254d7fad83015fb800b683 — Arkansas Post Field Office | Award notice, no response deadline; excluded from open opportunities. |
| 5665042bdeab4cf4be1b1af5291286e9 — Ozark Powerhouse Russellville Site Office | Award notice, no response deadline; excluded from open opportunities. |
| 1a71da7afb094db3a2c8b9f5466ad6a2 — Arkansas Multi Site/Custodial | Award notice, no response deadline; excluded from open opportunities. |
| ae70956e37264b6aaa810a75668a7bad — Arkansas Multi Site/Custodial | Combined synopsis/solicitation; response deadline April 20, 2026. Expired before the requested range despite Active=Yes. |

Eligible opportunities: 0. New lead imports: 0. Award notices were not imported as open opportunities. No award API check, schedule or city/county SAM run was created.

Run IDs and exact filters are retained in receipts.json and immutable UUID-named API captures in the parent directory. The upstream responses are also saved in the application database audit. live-verification.json verifies those six persisted audit records.
