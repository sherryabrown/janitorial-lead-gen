# Phase 5 — Sources by geography and related geography

Integration note: use the [completed Phase 3 detail revision](../done/03-admin-redesign-detail-revision.md) for scope identity, fixed saved county membership and focused tabs. Source/geography links belong inside details, not extra schedule row quick actions.

Status: planned. Parent: [geography/source rules](admin-workspace-redesign.md).
Initiating instruction: add read-only source/geography views and schedule quick-action/detail integrations.
Dependencies: phases 1–3; consume phase 4 Stats links when available, without introducing a dependency for ordinary browsing.

## Reuse/data contracts

Use geography-routing/service, resolveGeography/selectionToken, sourceInventory, known-source-execution capabilityCoversRoute/adapterContract, county-triggers registry/stateSources, procurement_geographies, procurement_place_counties, procurement_sources, procurement_source_capabilities, procurement_state_trigger_associations. Reuse SourceReview/RequestReview for evidence/actions already supported.

No geography/source edit/delete, new schedule target, automatic discovery from browsing, account signup or Bonfire access work. Existing research/import operations remain behind their original explicit controls.

## Implementation

1. Sources view: geography type/name, county/municipality, source/provider, category, current method/readiness, verified/expiry dates, latest known check/outcome if evidenced, blocker/next action and linked independent state trigger. Search/filter/sort/page; show unmapped sources and unsupported/unverified categories as real states.
2. Scope-source membership derives from actual routing/capability coverage and current registry, not buyer-address string matches or name heuristics. Deduplicate source ID but retain route/category relationships. Label “Registered sources” separately from “Checked in this run”; never infer all current sources were checked historically.
3. Read-only Related geography: county + incorporated municipality list from GIS links, multi-county membership and active status. For state source, show existing associated counties and derived municipality lists with relationship basis visible. For SAM, statewide Arkansas target does not imply county-source associations or verified individual work sites.
4. Clearly distinguish current relationships versus saved schedule scope/version and run snapshot. Where dataset/token changed, show affected current/saved memberships; do not change a schedule or bypass required confirmation on a read.
5. Batch safe paginated browse/read endpoints through existing authenticated Render workflow API. Reuse pure sourceInventory logic with bounded inputs/server projection rather than invoking its all-source/full-history report for every row. Add route/search filters and relational query/index only as justified; do not duplicate registry in localStorage.
6. Source detail exposes current dated capability status, categories, geography/coverage basis, safe evidence reference and actual next action. Preserve source/category attention and independent state-update links. Legacy research/account notes labeled historical; never treat account metadata as valid current credentials.
7. All schedule quick actions and detail sections route into filtered view and return precisely. Source/geography details can link to existing manual scope editor but must require explicit action/preview to run. No side effect that starts shared-state refresh per county.

## Acceptance/tests

- Saline county → all registered municipalities; a multi-county municipality, state source shared by multiple counties, unmapped source and missing-source route, expired method, independent SAM/state source, saved dataset scope change.
- Preserve Tull/Little Rock geography and existing correct memberships; no invented county assignment from city name. Shared source not duplicated in totals or independently triggered on each county page.
- Test routing/capability/readiness parity with existing sourceInventory, safe metadata/XSS handling, authenticated pagination, full filtered results beyond first page, partial failed lookup, stale selection.
- Affected existing geography/source/HTTP tests, npm run check and native access checks for any SQL changes. Desktop/390/320/keyboard table-to-detail-to-back retains context; long geography/source names readable.
- No claim of new source coverage or solved portal access. Phase passes when views accurately expose registry/membership/attention, including real unresolved gaps.
