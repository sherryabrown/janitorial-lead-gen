# Texarkana and Miller County known-source methods

Shared login/API activation is owned by [Arkansas source access activation and reuse](arkansas-source-access-activation-and-reuse.md). This plan retains its source/category-method checks; it does not require a separate signup implementation.

Scope: audit official forecast, opportunity, and award channels for the Texarkana city and Miller County routes. Register only methods supported by current official evidence. Preserve unresolved categories as gaps. Keep SAM on its separate Arkansas-wide path.

1. Record the official source, geographic scope, access method, check instructions, evidence, and limitations for every verified method. Record negative/partial findings without claiming category coverage.
2. Register verified methods using the existing `public-fetch` adapter and exact route geography. Add a county source entry only if its official identity and scope are established.
3. Test that the existing planner reuses the same source/capability contract for an arbitrary city or county request, and excludes SAM.
4. Run offline tests and a bounded live readback of registered rows and one capture. If deployment credentials or source access are unavailable, leave this plan here with that acceptance check open.

Out of scope: new UI, SAM scheduling, lead import, signup, and unverified claims of complete coverage.

## Current result and remaining check

The official TWU opportunity listing and Miller County transparency entry were registered live. The bounded TWU run received Cloudflare HTTP 403, so a second reviewed migration marked that method `blocked`; it is not operational. The Miller County entry capture succeeded and was saved, but does not cover a lead category. No verified forecast or executed-award method was found for either route, and the city, school district, and county category gaps remain visible. See `docs/TEXARKANA-MILLER-SOURCE-METHODS.md` for source-by-source evidence.

Offline routing, migration replay, SQL, app tests, and build passed. Live source/capability readback and a bounded county entry capture passed. Remaining: verify an authorized access method that can actually capture TWU bids, verify category methods for the other local sources where official evidence permits, and demonstrate interpretation and reviewed import on a real eligible finding. Leave this plan in `specs/todo/` until those checks are evidenced.
