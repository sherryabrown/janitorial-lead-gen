# Automatic county discovery build — October 19, 2026

Local implementation checkpoint for [the plan](../../specs/todo/automatic-county-source-discovery-and-collection.md). Live preview acceptance is outstanding; this is not a production release record.

## Implemented

- Existing discovery jobs now resolve official starting websites, verify supported published listings, persist methods through the existing native registry rehearsal/readback, collect and continue the common interpretation worker. County and county state-research jobs carry `county-public-v1`; standalone human review remains available.
- Directory resolution follows observed Association of Arkansas Counties profile links and the Arkansas Municipal League's public filtered table. The municipal form uses its current page-issued nonce, not stored credentials or a private API. HTTPS upgrade of a published HTTP URL keeps its host; subsequent capture must succeed. Captures are private immutable artifacts. Missing/ambiguous entries remain gaps, not invented URLs.
- Supported automatic methods recognize bounded explicit-count tables, explicit EvoGov empty listings, published Revize bid tables and the observed City Bids table format. These are structural recognizers, not county-name switches or generated executable code. Existing registered JSON/API/PDF/portal runners remain available through their current contracts. Unknown formats are not automatically activated.
- Activation preserves source identity/coverage, records the immutable discovery packet hash and policy, rehearses writes and verifies readback. Unknown write outcomes do not retry blindly. An endpoint already registered for a different route is held for scope reconciliation rather than overwriting that route.
- Existing interpretation verifies actual work location/date evidence and stages candidates. Non-SAM canonical import approval remains required. SAM automatic imports, AI settings and shared budgets are unchanged; directory lookup and method verification do not call AI.
- Explicit retry can advance older county review/missing-seed checkpoints and refresh expired captures using new page indexes while retaining old packets/runs. Persistence intents are never reset. Deployment does not bulk-resume old jobs. Separate state triggers remain separate; an expired/unusable registered state method no longer suffices to mark state research complete.
- County results identify location/source, distinguish source-only runs and incomplete coverage, expose saved evidence without a technical method form, and provide contextual retry. Existing source-only schedules are not changed.

## Verification evidence

- Final `npm run check` passed: 68 UI tests, 294 workflow tests, SQL checks, lint, TypeScript and Vite build. The existing large Admin bundle warning remains. A subsequent focused nine-test run also passed after adding expired-evidence retry coverage. New tests cover identity/terminal validation, explicit empty versus shell/error, changed layouts, unsafe URLs, directory provenance/ambiguity, automatic stage continuation and dynamic municipal lookup.
- `npm run test:access` passed against real disposable PostgreSQL/PostgREST. New absent-source fixture resolved an official directory entry, rehearsed/applied/read back registration, captured a structured opportunity, and staged one candidate. A browser-independent scheduled run reused that method, staged one candidate, and duplicate ticks created one occurrence. Source count remained one; canonical writes remained zero. Existing SAM native writes/deduplication and access/budget/scheduler checks also passed. This fixture is Arkansas County, demonstrating that execution is not hardcoded to Saline.
- 68 UI tests, lint and TypeScript/Vite build passed. Browser fixture acceptance passed at 1440, 390 and 320px with keyboard focus, named county/source results, source-only message and read-only evidence. Screenshots inspected; no overflow or production mutations. Earlier queue/draft/history/SAM checks remain in the same harness.
- Read-only public checks: the directory resolved Saline County and Alexander. The municipal filtered lookup works, but Traskwood's returned directory records contain no website. On saved actual public pages the supported recognizers read 21 published Saline bid records, an explicit Benton empty listing and one Bryant record. These are **not** counts of current janitorial leads: archived records, service relevance, requested dates and actual work sites still require interpretation. No live county trigger/import was started by these read-only checks.
- Private logs/captures: `outputs/deployment/automatic-county/`; browser screenshots: `outputs/deployment/admin-ui/automatic-county-{1440,390,320}.png`.

## Remaining acceptance and limitations

The matching Render backend and Netlify preview must be released before fresh Saline manual/repeat/scheduled acceptance. Record per-source outcomes against the original six source gaps and nineteen method gaps, actual usage and canonical-write guard readback. A successful isolated test or public-page recognizer is not that acceptance.

No general paid web-search capability was introduced. Locations without an authoritative directory website remain incomplete. Unknown listing formats, unsupported cross-host portals, uncertain captures and conflicting route scopes remain explicit limitations. Expired evidence is refreshed on explicit retry. Existing access accounts and protected Bonfire work were not resumed. This build does not promise every public body publishes procurement opportunities online.

No migration, dependency, account or budget change. Netlify production remains unchanged. Keep the plan in todo until required acceptance passes, and record any remaining blockers rather than treating them as zero results.

Proposed commit message: `feat: automate county source collection`
