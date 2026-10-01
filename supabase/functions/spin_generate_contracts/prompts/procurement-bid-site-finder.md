# Arkansas Bid Site Finder

## Purpose

Discovery pass for an Arkansas government-contract lead pipeline. For each
**requested area**, find where every relevant public buyer publishes bids,
awards, and (if anywhere) upcoming work — **county government, cities and
municipalities within it, the statewide systems, and other independent buyers** —
and write a durable registry (one row per entity) that the recurring monitor
consumes.

Favor accuracy over coverage — an entry pointing confidently to the wrong page is
worse than one honestly marked "no structured source" — so every entry carries a
confidence level and a verification note.

## Tools

Web search, web fetch, browser use (for interactive portals), and code execution
(to write the registry). Without browser use, do what search + fetch allow and
flag gated entities for manual follow-up.

## Inputs

- The geography provided in JSON.
- Optional existing registry to refresh: re-verify low-confidence/stale entries;
  only re-discover URLs that now 404 or redirect.

## Procedure

**1. Enumerate the entities to resolve** for the requested area:
- the **county government**;
- each **incorporated city/municipality** in that county (geography → Places);
- the **statewide systems** as their own entities, noting which locals route
  through them;
- other **independent buyers** likely present (geography → Search Guide): school
  districts, water/utility authorities, the conservation district, airport,
  housing authority, public colleges.

**2. Resolve each entity's official site.** Search `"<entity name> Arkansas
official website"` (e.g. "City of Russellville AR", "Pope County AR"). Prefer
`.gov` / `.us` / government `.org`; confirm it's the real governing body — not a
chamber, aggregator, or Wikipedia page. If none exists, set `official_site: null`
and go to fallbacks (§F).

**3. Locate procurement surfaces.** Identify `portal_type` and capture URLs using
the detection guide below (§A–§F). The same signatures apply to any entity:
cities most often use a self-hosted CMS or BidNet; counties vary; state agencies
use SAP Ariba, AR Bid, or ARBuy. Don't skip fallbacks.

**4. Capture three surfaces separately** (any may be `null`):
- `bids_url` — current/open solicitations. A page can exist yet list nothing at
  capture — still record it.
- `awards_url` — awarded/closed contracts. Often absent at local level; `null`
  is common.
- `forecast_url` — upcoming work; usually absent, so use a proxy source (§F),
  else `null`. **Never fabricate one.**

One page may serve two surfaces — record it in both and note it.

**5. Verify and score confidence.** Open each captured URL and confirm it shows
what you claim: `high` (loaded, clearly correct), `medium` (gated or inferred
from nav), `low` (best guess). Set `needs_human_review: true` for anything
medium/low, gated, or missing a site.

**6. Before recording anything as gated, apply §0** — a login on the page rarely
means the bid information itself needs credentials.

---

# Portal detection

Classify an entity's `portal_type` during discovery. Arkansas public procurement
is fragmented: an entity may post bids on its own CMS, funnel everything to a
shared statewide portal, or publish almost nothing structured. Detect the portal
by the signatures below, then capture the specific URLs.

Order of likelihood at the *county* level (highest first): self-hosted CMS →
statewide system → BidNet → no structured source. Cities/municipalities skew
toward self-hosted CMS or BidNet; state agencies use SAP Ariba / AR Bid / ARBuy.
Commercial portals (OpenGov, DemandStar, Bonfire, Public Purchase) show up more
for cities than counties, but check anyway.

## §0. A login form is not a locked door — check for public views first

Many portals show a sign-in box but still expose public browse views — buttons or
tabs like **Current Bids**, **Closed Bids**, **Awarded Bids**, "View Bids", or
"Public Notices" — that need no account. AR Bid (ionWave,
`arkansas.ionwave.net`) is the clear case: its login page carries public Current /
Closed / Awarded buttons, so open solicitations and past awards are both readable
without signing in; registration is required only to *submit* a response. So:

- Look for public browse controls on or beside the login form and follow them.
  Capture the resulting `bids_url` (Current/Open) and `awards_url` (Awarded).
- A login on the page does **not** by itself make `access: registration-required`
  for browsing. Set `registration-required` only for the parts that truly need an
  account (usually submitting a response), and say so in the note.
- If the portal blocks automated access (`robots.txt`) but the public views open
  fine in a browser, capture them with browser use or flag for human capture —
  don't force the fetch or hammer the site. Note that the exact browse URLs still
  need confirming when that happens.

## §A. Self-hosted CMS (most common for counties and cities)

Many Arkansas county and city sites run on CivicPlus or a similar municipal CMS,
producing a recognizable bids module.

**Signatures**
- URL path contains `Bids.aspx`, `/bids`, `/Bids`, or `?CID=` (CivicPlus).
- A "Bid Postings", "Bid Opportunities", "Open Bids", or "Public Notices" nav item.
- A "Purchasing", "Procurement", or "Finance" department page linking to bids.
- Domains like `<county>county<ar|ar.gov|.org|.us>`, `<county>countyar.gov`.

**Where each surface usually lives**
- Current bids: the Bids module, "Open" tab.
- Awards: same module, "Closed"/"Awarded" tab, or absent (see §F).
- Forecast: almost never here — use §F.

**Examples of the pattern** (verify live; these show the shape, not a guaranteed
current URL): `garlandcounty.org/Bids.aspx`,
`bentoncountyar.gov/accounting/open-bids/`.

## §B. Statewide systems — SAP Ariba (current), ARBuy, AR Bid (ionWave)

Arkansas state procurement moved to **SAP Ariba** in 2026; older systems may
linger. Keep the *state* system separate from *local* ones; don't conflate the
three portal_types.

**SAP Ariba** (`portal_type: ariba`) — current state eProcurement (Office of
State Procurement). Public source of record is the SAS **Bid Opportunities** page:
`sas.arkansas.gov/procurement/bid-opportunities/` — a public HTML table (RFP name,
description, dates, department, UNSPSC commodity code), no login. Each row links
to an Ariba public preview
(`portal.us.bn.cloud.ariba.com/...RfxEvent/preview/...?anId=ANONYMOUS`) and a SAS
detail page (`sas.arkansas.gov/bid-opportunity/<docid>/`).
- Capture: `bids_url` = the SAS Bid Opportunities page (parseable — prefer it
  over deep Ariba links). `awards_url` =
  `sas.arkansas.gov/procurement/state-contracts/` (plus the "Anticipation to
  Award" notice). Also state-level: **Building Authority → Bid Announcements**
  (`sas.arkansas.gov/building-authority/bid-announcements/`) for
  construction/facilities. Non-OSP units index:
  `arkansas.gov/tss/procurement/bids/index.php`.

**ARBuy** (`portal_type: arbuy`) — prior state eProcurement at
`arbuy.arkansas.gov`. Status uncertain after the Ariba launch — verify it's still
active before relying on it.

**AR Bid** (`portal_type: ar-bid`) — ionWave, `arkansas.ionwave.net`. A **local**
system used by Pulaski County and Little Rock–area entities, not the state OSP.
Login page exposes public Current / Closed / Awarded views (§0); registration
only to submit.
- Signature: links to `arkansas.ionwave.net`; "AR Bid, powered by ionWave".

## §C. BidNet Direct — "Arkansas Purchasing Group"

BidNet aggregates state and local RFPs, bids, and awards under the "Arkansas
Purchasing Group" and covers some counties.

**Signatures**
- Links to `bidnetdirect.com/arkansas` or "Arkansas Purchasing Group".
- "Register to view bids" gated behind a BidNet login.

**Notes** — content usually sits behind free vendor registration. Record
`access: registration-required` and capture the county's BidNet member page, not
a deep link that will 302 to a login.

## §D. Commercial portals (check, but less common for counties — last resort)

| Portal | Signature in URL or page |
|---|---|
| OpenGov Procurement (formerly ProcureNow) | `procurement.opengov.com`, "Powered by OpenGov" |
| DemandStar | `demandstar.com`, "Register on DemandStar" |
| Bonfire (Euna) | `bonfirehub.com`, "Bonfire portal" |
| Public Purchase | `publicpurchase.com` |
| GovDeals | `govdeals.com` — usually surplus *auctions/awards*, not new bids |

Capture the county's portal landing page and set `access` accordingly (`public`
vs `registration-required`).

## §F. Fallbacks when no structured bid source exists

Small rural counties often post nothing machine-readable. Before giving up, check
in order:

1. **County finance/treasurer/judge pages** for PDF bid notices.
2. **Quorum Court agendas and minutes** — approvals and upcoming projects.
3. **Legal notices / newspaper of record** — many counties satisfy bid-notice
   requirements only through the local paper.
4. **Capital Improvement Plans, annual budgets, road plans** — the closest thing
   to a *forecast* of upcoming work.

If only fallbacks exist, still record them, set `portal_type: none-structured`,
and point the relevant URLs at the fallback source with a note. This is a real,
useful result for a lead pipeline — not a failure.

---

## Output

Write `arkansas-bid-registry.json` — one object per **entity** (all requested
entities, even mostly null):

```json
{
  "generated_at": "2026-09-03",
  "state": "AR",
  "scope": "counties Pulaski, Pope, Newton (county + city + state levels)",
  "entity_count": 0,
  "entities": [
    {
      "entity_name": "City of Russellville",
      "entity_type": "county | city | state | school-district | utility | conservation-district | airport | housing-authority | college | special-district | other",
      "county": "Pope",
      "official_site": "https://...",
      "portal_type": "self-hosted-cms | ariba | ar-bid | arbuy | bidnet | opengov | demandstar | bonfire | public-purchase | none-structured | unknown",
      "bids_url": "https://... or null",
      "awards_url": "https://... or null",
      "forecast_url": "https://... or null",
      "access": "public | registration-required | portal-search-required",
      "confidence": "high | medium | low",
      "needs_human_review": false,
      "notes": "How it was found, what's gated, any related key information, and/or why a field is null."
    }
  ]
}
```

## Guardrails

- Record the government source of record, not an aggregator.
- For genuinely gated bids set `access: registration-required` rather than
  bypassing a login — but a login form is not automatically a wall (§0).
- Be gentle — a few page loads per entity, not a crawl.
- When unsure, mark it uncertain — honest nulls and low-confidence flags are the
  point of the confidence system.