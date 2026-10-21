# Alexander and Shannon Hills entry corrections

## Database changes

The two stale directory entries now use the existing `verified_public_entry` mechanism:

| City | Source ID | Active capture/research entry | Retained identity URL |
| --- | --- | --- | --- |
| Alexander | `4c4140e7-2507-5ad8-a9c5-2a05eab68f20` | https://www.cityofalexander.org/ | https://www.cityofalexander.com/ |
| Shannon Hills | `3bc866dd-7a17-5e58-a2e8-89428fcdb667` | https://shannonhills.ar.gov/ | https://www.shannonhills.arkansas.gov/ |

The canonical identity URLs, source IDs, codes, geographic coverage, other source configuration, and historic evidence are retained. The corrected operational entries are selected by the already-deployed `registeredPublicEntryUrl` and `registeredEntryContract` functions. No code, schema, or deployment change is required.

Existing reviewed registry preparation/testing/application saved two source-configuration updates, two city-scoped research requests, and their two source associations. No new source or capability was created. Twenty immutable public captures and identity-review evidence were retained privately. Package hash: `419f39c73c67448584f1b1d3b0b8b24df3480c6687ad628dc3b3e30cf6789bcb`. Application readback verified all changes and unrelated-row preservation.

## Procurement-channel review

Reviewed official homepages, published navigation, news, City Hall/council pages, agendas/minutes indexes, and targeted web searches. Each city had a bounded twelve-destination review. Alexander's current council agenda index links DOCX documents, which the existing public-check reader correctly reports as unsupported; those documents were not represented as parsed procurement evidence. Two Shannon Hills meeting PDFs were captured but not treated as a solicitation listing or proof of zero opportunities.

Neither reviewed site established a current, supported procurement listing, a documented procurement API, or an explicit empty-bid result. Historical construction notices and council records do not prove a current janitorial channel. No opportunity capability or lead was invented. Publication-channel status remains unverified; previously delivered city clarification inquiries remain the next external input. This work did not read their replies or send further messages.

## Live collection verification

On existing Saline request `a7030c20-7ae3-4f4e-9c3c-72f10a1f1cfe`, the existing audited collector explicitly retried only the two failed initial entry checks:

| City | Job | New saved capture/run | Result |
| --- | --- | --- | --- |
| Alexander | `ff55b268-2b10-43e5-b8a3-4d0cebd4b43e` | `2cb28e70-7302-47a9-b813-ed31a79ba165` | Succeeded; corrected URL and byte hash verified |
| Shannon Hills | `d742d1de-08d5-4bc7-82c2-2a171fec06b5` | `f8d44f2b-c15f-49fa-8ef2-165f4c7be80c` | Succeeded; corrected URL and byte hash verified |

These were real network captures through the trusted operator execution of the current collector, persisted in the shared database; they were not a fresh full county run or a Render-hosted browser test. Prior failures remain immutable. All canonical lead data and unrelated collection jobs were unchanged. No AI calls or lead writes occurred. PlanetBids remains the one partial initial-entry check from that run.

The registry package passed actual constraint/trigger rollback, readback, and replay tests. All 26 existing researched-source and official-link-discovery tests passed. Private receipts are under `outputs/procurement-research/city-entry-corrections/`.

Netlify production and unrelated application behavior are unchanged. Website capture is fixed; automated opportunity coverage for these cities remains blocked on verified publication-channel evidence.
