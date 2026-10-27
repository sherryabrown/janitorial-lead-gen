# Efficiency follow-up: reporting and maintenance

This is follow-up to the completed first performance pass in [the review and implementation record](../done/2026-10-23-efficiency-and-duplicate-work-review.md). It is not a production deployment instruction.

1. Measure deployed warm/first-request latency, request counts/bytes, database plans and authentication time; inventory enabled scheduler jobs/services and active leases without changing them. Local fixture query counts do not establish deployed timings or duplicate execution.
2. Design versioned per-run reporting projections and report snapshots. Preserve distinct lead identities across runs, historical classifications, canonical redirects, usage event-date attribution, unknown/partial results, snapshot consistency and metric-member equality. Establish invalidation/backfill before replacing all-time reconstruction.
3. Design owner/query-scoped page and registry caching with explicit refresh/invalidation. Agree on freshness behavior before changing automatic page restoration. Debounce text searches without changing filter meaning, selections or retry ownership. Catalog caching should use a registry version, not silently stale source coverage.
4. Lazy-load county map/manual-editor code while preserving mounted drafts and keyboard behavior. Audit runtime imports before moving build/test dependencies out of the backend production installation. Measure bundle/image/startup changes rather than raising warning thresholds.
5. Produce a reviewed manifest of disposable temporary directories, verify no live process or fixture depends on them, and clean up only those paths. Preserve release receipts, private evidence, reviewed packages and tracked outputs. Define retention and temporary-directory placement so artifacts do not accumulate again.
6. Add safe operational timing/query diagnostics; project canonical redirect identity without fetching full lead payloads where possible. Avoid unrelated formatting or architectural rewrites.

Each implementation needs targeted behavioral and efficiency regressions plus the applicable final repository, native access and browser gates. No item authorizes deletion of evidence, weakened access checks, a new scheduler, altered collection freshness or automatic retries of uncertain writes.
