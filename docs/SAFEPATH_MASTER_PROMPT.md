# SafePath — Master Product & Development Prompt (v2)

> Revised version. Changes vs v1: free-tier-only stack, H3 grid aggregation, "Reported Activity Level" naming, cold-start data strategy, awareness/education modules, Bangla-first, stronger privacy and anti-stalking safeguards, reduced MVP scope.

---

## 1. Product Overview

**SafePath** is a free, open, community-powered **safety awareness** platform. It helps people understand the safety conditions of roads and areas before and during travel, and learn how to protect themselves.

The platform answers:

> **"Where is activity reported, what kind, when, why — and what can I do about it?"**

SafePath is **not** an official crime database. Community reports are never presented as confirmed facts unless verified through the verification workflow.

Positioning:

> **A community-powered safety awareness platform — informing people, not frightening them.**

Initial focus: **Dhaka, Bangladesh**. Architecture must support other cities and countries without rewrites.

### 1.1 Hard constraints

1. **100% free to run.** Every service must have a free tier or be self-hostable at zero cost. No paid APIs, no SMS, no paid map tiles.
2. **Bangla-first.** All UI ships in Bangla (`bn`) and English (`en`) from day one.
3. **Low-bandwidth friendly.** Must work on cheap Android phones on slow/expensive mobile data.
4. **Open by default.** Methodology is public; aggregated anonymized data is exportable.

---

## 2. Core Goals

Help people:

1. **Learn** — prevention tips, what to do after an incident, digital fraud awareness.
2. **Discover** areas with elevated reported activity.
3. **Understand** what is reported, when, and why an area has its level.
4. **Compare** areas, roads, and (Phase 2) routes.
5. **Report** incidents, environmental hazards, and positive safety signals.
6. **Act** — civic reporting of infrastructure problems to authorities.
7. **Share** trips with trusted contacts (Phase 2).
8. **Find** nearby support points (police, hospital, pharmacy, etc.).

Priorities, in order:

**Privacy → Accuracy → Transparency → Explainability → Usefulness → Scale**

---

## 3. Product Principles (non-negotiable)

1. **Awareness, not fear.** Inform calmly. Show positive signals and resolved problems, not only danger.
2. **Reported ≠ Confirmed.** Always label the source level of every number.
3. **Privacy first.** Never expose anything that could identify or endanger a victim or reporter.
4. **Explain every score.** No number without "why".
5. **Confidence is visible.** One unverified report must never look as authoritative as hundreds of verified ones.
6. **No false certainty.** Never say "safe" or "dangerous". Say "lower/higher reported activity" or "comparatively lower estimated risk".
7. **No accusations.** Never identify individuals, businesses, or groups as criminals.
8. **Data quality over quantity.** Never fabricate data. Label demo/mock data clearly.
9. **Human moderation.** Important reports pass through moderators.
10. **Not an emergency service.** Always point to official emergency numbers.

---

## 4. Terminology

| Term | Meaning |
|---|---|
| **Reported Activity Level (RAL)** | Public-facing 0–100 indicator. Replaces "risk score" in UI copy. Internally may be called `risk_score`. |
| **Confidence** | Low / Moderate / High — how much data supports the RAL. |
| **Cell** | One H3 hexagon (geographic aggregation unit). |
| **Source level** | Community Report → Moderator Reviewed → Verified → Media-reported → Official Source. |
| **Support point** | Police station, hospital, pharmacy, fire station, fuel station, transport point. Never called "safe place". |

### 4.1 RAL bands (single scale used everywhere)

| Score | Band | Color (Google-traffic style, decided 2026-10-06) |
|---|---|---|
| 0–15 | Very Low | `#1E9E4A` green |
| 16–30 | Low | `#8BC34A` light green |
| 31–50 | Moderate | `#FBC02D` yellow |
| 51–65 | Elevated | `#FB8C00` orange |
| 66–80 | High | `#E53935` red |
| 81–100 | Very High | `#9B1C1C` dark red |

- Green means **fewer reports**, never "safe" — copy must keep saying "lower reported activity".
- Red/green is not colorblind-safe on its own: always show a text label with the color, and keep the hatched pattern for low confidence.
- Map default basemap: satellite hybrid (Esri World Imagery + road/place overlays, free with attribution; production needs a free ArcGIS developer key). Vector map (OpenFreeMap) available via toggle.
- Cells below the k-anonymity threshold or with Low confidence render with a hatched/faded pattern.
- The whole city must not appear "hot". Use relative scaling and decay so only genuine concentrations stand out.

---

## 5. Users & Roles

| Role | Can |
|---|---|
| **Anonymous visitor** | View map, area pages, tips, methodology. Submit anonymous report (stricter limits + CAPTCHA). |
| **Registered user** | All above + track own reports, subscribe to area digests, alerts, trusted contacts, trip sharing. |
| **Moderator** | Review, verify, reject, merge duplicates, redact, edit category/location, import media reports, add notes. |
| **Admin** | All moderator actions + manage users/moderators, categories, areas, risk config, feature flags, tips content, view analytics & audit logs. |

Super Admin is an Admin permission set (`is_superuser`), not a separate role, until the team grows.

Implement RBAC via Django groups + permissions.

---

## 6. Modules

| # | Module | Phase |
|---|---|---|
| 1 | Public Safety Map | MVP |
| 2 | Area Page + "Why this level?" | MVP |
| 3 | Incident Reporting (incl. positive signals) | MVP |
| 4 | Moderation & Verification | MVP |
| 5 | Risk Engine (time-aware, recency-weighted, confidence) | MVP |
| 6 | Awareness Hub (tips, after-incident guide, fraud awareness) | MVP |
| 7 | Media Import (cold-start data) | MVP |
| 8 | Methodology & Disclaimer pages | MVP |
| 9 | Audit Log | MVP |
| 10 | Basic Admin Analytics | MVP |
| 11 | Nearby Support Points (OSM) | Phase 2 |
| 12 | Civic Action (reports to city corporation) | Phase 2 |
| 13 | Area Digest (weekly push/email) | Phase 2 |
| 14 | Safer Route comparison | Phase 2 |
| 15 | Trip Sharing + Trusted Contacts | Phase 2 |
| 16 | Safe Walk + in-app alerts | Phase 2 |
| 17 | Open Data Export | Phase 2 |
| 18 | AI Safety Assistant | Phase 3 |
| 19 | Predictive patterns | Phase 3 |
| 20 | Native app (background geofencing) | Phase 3 |
| 21 | Organization / government dashboard | Phase 3 |

---

## 7. Public Safety Map

- **MapLibre GL JS** with **OpenFreeMap** tiles (free, no API key) or self-hosted **Protomaps PMTiles** on Cloudflare R2.
- **Never** use `tile.openstreetmap.org` for app traffic (violates OSM tile usage policy).
- Features: current location (with permission), search (place/road/area, Bangla + English), zoom/pan, RAL layer, time selector, category filter, source-level filter.

### 7.1 Zoom strategy

| Zoom | Shows |
|---|---|
| Low (city, zoom < 12) | H3 resolution 8 cells (~460 m edge) |
| Medium (zoom 12–14) | H3 resolution 9 cells (~175 m edge) |
| High (street, zoom ≥ 14) | H3 resolution 10 cells (~65 m edge, ~130 m across — the public privacy floor) |

Cells are aggregated from individual incidents at each resolution; only cells with ≥ k reports render, so empty land stays clear.
| Very high | Approximate incident markers **only** where privacy rules permit (cell has ≥ k reports, location jittered, no residential pinpoints) |

Phase 2 adds road-segment coloring at high zoom.

### 7.2 Map API

```text
GET /api/v1/map/cells?bbox=minLng,minLat,maxLng,maxLat&zoom=&hour=&dow=&category=&source=
```

- Returns aggregated cells only. Never raw incidents.
- Debounce client requests (≥300 ms). Cache responses (Redis or Postgres cache table) keyed by bbox tile + filters.
- GeoJSON or compact JSON `{h3, score, band, confidence}`.

---

## 8. Area Page

Route: `/area/[h3]` and `/place/[slug]` (named neighborhoods mapped to sets of cells).

### Example — Banasree, Road 7 area

**Reported Activity Level: 82 / 100 — Very High**
**Confidence: Moderate** (23 reports, 61% verified)

**Recent activity**
- Last 7 days: 5 reports
- Last 30 days: 17 reports
- Last 90 days: 41 reports

**Most reported**
- Mobile snatching — 11
- Bag/wallet snatching — 6
- Robbery — 3
- Other — 2

**When**
- 7–9 PM — Elevated
- 9 PM–12 AM — High
- 12–2 AM — High

**Trend:** Increasing (17 this month vs 10 last month)

**Why this level?**
- 17 reports in the last 30 days
- Most reports between 9 PM–12 AM
- 65% involve mobile/bag snatching
- Frequency increased compared with previous month
- Most recent reports were verified

**What locals say (community knowledge):**
- "Snatching from rickshaws near the U-loop, usually 9–11 PM" — 25+ confirmed · unverified
- "Road gets dark after Road 9 junction" — 10+ confirmed · corroborated

Each entry has **"I've seen/heard this too"** and **"Seems wrong/outdated"** buttons.

**Positive signals:** Well-lit main road (4), Busy until late (3)

**Infrastructure:** 2 broken street lights reported — 1 resolved

**Stay aware (tips for this area's top categories):** contextual prevention tips.

**If something happens:** link to after-incident guide + emergency numbers.

Every number shows its source breakdown: Community / Verified / Media / Official.

**Busy-area note:** If the area is a known high-footfall hub (transport terminal, major market), show: *"This is a very busy area. More people passing through usually means more reports; the level reflects report volume, not individual likelihood."*

---

## 9. Risk Engine

The RAL is an **estimated indicator of reported activity**, not an official crime rating.

### 9.1 Inputs (per cell × time block)

- Recency-weighted incident count
- Severity weight per category (admin-configurable)
- Source-level confidence multiplier
- Time-of-day / day-of-week distribution
- Trend (current vs previous period)
- Repeat concentration (many reports in same cell)
- Positive signals (small dampening effect, capped)
- Exposure adjustment for flagged high-footfall cells (admin-configurable)

### 9.2 Recency decay

Use exponential decay with configurable half-life (default **30 days**), plus hard cutoff (default **365 days**). Reference buckets for UI:

```text
0–7 days      highest weight
8–30 days     high
31–90 days    medium
91–180 days   low
180–365 days  very low
365+ days     excluded from score (still in history)
```

Old incidents must never keep an area permanently elevated.

### 9.3 Source-level weights (default, configurable)

```text
Community report (pending)   0.3
Moderator reviewed           0.6
Verified                     1.0
Media-reported (with link)   0.8
Official source              1.0
Rejected / duplicate         0.0

Local knowledge (base)       0.15
  + per distinct confirmation  +0.05 × reporter trust   (cap at 0.6 total)
  Corroborated by moderator    0.7
  Disputed                     0.0
```

Local knowledge contributes mainly to the **time-of-day distribution** ("usually 11 PM–2 AM") and less to raw frequency, so a single popular pattern cannot dominate a cell's score.

New reports have limited influence until reviewed.

### 9.4 Explainable factors

Store per-cell factor contributions so the UI can explain:

```text
RAL 82
  Recent frequency     35%
  Time-of-day          25%
  Historical frequency 15%
  Severity             10%
  Verification         10%
  Trend                 5%
```

- Weights stored in `RiskConfig` table, editable by Admin, versioned, audit-logged.
- Do **not** show raw formula on public UI. Show plain-language reasons + link to the Methodology page.

### 9.5 Confidence

Derived from: report count, verification %, freshness, number of distinct reporters, source diversity.

```text
Low       < 3 reports OR < 20% verified OR all from 1 reporter
Moderate  3–15 reports with some verification
High      > 15 reports, > 50% verified, multiple sources
```

### 9.6 Time-aware

Compute distribution per cell by: hour, 3-hour block, day of week, weekday/weekend, day/night.
User can pick a time: *"Show activity around this area at 11 PM"* → returns time-specific RAL.

### 9.7 Computation

- Nightly full recompute + incremental recompute when a report changes state.
- Implementation: SQL aggregation into `cell_risk` table (materialized view or table refreshed by job).
- Unit-test the scoring function with fixed fixtures. It is critical business logic.

### 9.8 Privacy thresholds

- **k-anonymity:** a cell needs ≥ **3** non-rejected reports before any count is shown publicly. Below that: "Insufficient data".
- Low-count cells never show category breakdown.

---

## 10. Categories (admin-configurable, bilingual)

> **Current scope (decided 2026-10-06): chhintai (ছিনতাই / snatching) only.**
> Incident categories are the *ways* a chhintai happens — motorbike, rickshaw/CNG, while walking, bus/bus stop, at weapon-point — plus positive signals (well-lit, busy until late, patrol seen, CCTV). Other crime, transport, environmental and digital-fraud categories below are **deferred**, not part of the current build.

### Crime / Personal safety
Chhintai / snatching (ছিনতাই) · Hijacking (ride/vehicle hijack — CNG, rickshaw, car, bike) · Mobile snatching · Bag/wallet snatching · Robbery · Theft · Pickpocketing · Vehicle theft · Bike-related robbery · Harassment · Assault · Burglary · Extortion · Suspicious activity

### Transport safety
Harassment on public transport · Unsafe transport stop · Unsafe CNG/rickshaw incident · Reckless driving hotspot

### Environmental / Infrastructure
Poor street lighting · Broken street light · Dark/isolated road · Road obstruction · Dangerous crossing · Open manhole/drain · Abandoned area · Poor visibility · Waterlogging

### Digital fraud (not mapped by location; shown in Awareness Hub & trends)
bKash/Nagad fraud · OTP scam · Fake call / impersonation · Fake job offer · Online shopping scam

### Positive signals
Well-lit · Busy until late · Police patrol seen · CCTV present · Helpful shops open late · Light fixed

Each category has: `name_bn`, `name_en`, `group`, `severity_weight`, `is_mappable`, `is_positive`, `tips[]`, `active`.

---

## 11. Incident Reporting

### 11.1 Fields

- Category (required)
- Location — one of:
  - Map pin (snapped/fuzzed to cell; exact stored privately only if needed)
  - Area/landmark search
  - **Transport route** (bus route number / vehicle type: bus, CNG, rickshaw, ride-share) for incidents in moving vehicles
- Date — exact or fuzzy ("about 2 weeks ago")
- Time — exact or block ("evening", "late night")
- Description (optional, private by default, auto-redacted)
- Evidence image (optional, private)
- "Did you report to police?" (optional: GD filed / not filed) — for data quality, never required

### 11.2 Rules

- No personal info required. Anonymous allowed with Turnstile CAPTCHA and stricter rate limits.
- Auto-redact phone numbers, emails, NID-like numbers from descriptions before storage of public text.
- Free-text descriptions are **never public by default**. Public shows: category, approximate time, cell, source level.
- Show reporter a calm confirmation + relevant after-incident guide.

### 11.3 Workflow

```text
Submitted → Pending Review → Under Review → Verified | Unverified | Rejected | Duplicate
```

Plus `Needs Info` (moderator requested more detail) and `Resolved` (for infrastructure reports).

### 11.4 Three types of contribution

People share safety information in three ways:

| Type | Meaning | Example |
|---|---|---|
| **Incident report** | "This happened" (to me or I witnessed) | "My phone was snatched on Banasree Road 7 last night around 10 PM." |
| **Local knowledge** | "This happens here" (a pattern people know) | "Hijacking of CNGs happens on Kuril–300 ft road between 11 PM and 2 AM." |
| **Confirmation** | "I know this too" (acknowledges an existing report or pattern) | Taps **"I've seen/heard this too"** on the local-knowledge entry above. |

Each contribution is stored with `kind = incident | knowledge | confirmation` and the reporter's relation: `experienced | witnessed | heard_from_others`.

### 11.5 Quick Report — "What · Where · When"

Designed for 3 taps + optional details, Bangla-first, works one-handed.

```text
1. WHAT   → pick category icon (Chhintai, Hijacking, Harassment, Dark road, …)
2. WHERE  → tap the road/area on map, search a landmark, or pick bus route / vehicle
3. WHEN   → "Just now" · "Today" · "This week" · "Earlier"  +  time block
             (Morning · Afternoon · Evening · Late night · After midnight)
           For local knowledge: "Usually" + time range + days (every day / weekends / …)
   → optional: description, photo, "I experienced / I witnessed / I heard"
   → Submit
```

The generated public summary reads like:
> *"Hijacking reported on Kuril–300 ft road · usually 11 PM–2 AM · 14 people confirmed · Community knowledge (not verified)."*

### 11.6 Local knowledge rules

- Captures recurring patterns: category + road/area (cell or road segment) + usual time range + days of week.
- Starts as **Community knowledge — unconfirmed**, weight low (default 0.15 in risk engine).
- Gains weight as **distinct** people confirm it and as matching incident reports appear in the same cell/time window (capped; see §9.3).
- Moderators can mark it **Corroborated** (supported by incidents/media) or **Disputed**.
- Auto-expires from the score if no new confirmations or matching incidents for 180 days (stays in history).
- Same privacy rules: road/area level only, no names, no "the guy at the tea stall" accusations; descriptions auto-redacted and moderated.

### 11.7 Confirmations ("I've seen/heard this too")

- One confirmation per user per entry; login required (anonymous users can't confirm, to prevent inflation).
- Optional: "When did you see it?" (adds a time data point to the time-of-day distribution).
- Also offered: **"This seems wrong / outdated"** → feeds moderation and lowers weight.
- Confirmation weight scales with reporter trust score; confirmations from new accounts, the same IP/device, or bursts in a short time are discounted and flagged.
- Public count shown as ranges to avoid gaming: "3+", "10+", "25+", "50+".
- Confirmations never upgrade an entry to **Verified**; only moderators/official sources do.

---

## 12. Moderation & Verification

### Dashboard queues
- Pending
- High priority (severe categories, clusters)
- Potential duplicates
- Potential abuse
- Needs info
- Media imports pending

### Actions (all audit-logged)
Approve/verify · Reject (with reason) · Mark duplicate · Merge · Request info · Redact text/image · Change category · Adjust approximate location · Add verification note · Mark infrastructure resolved

### Duplicate detection (background job)
Score similarity on: distance (same/adjacent cell), time window (±3 h), same category, description trigram similarity (`pg_trgm`). Above threshold → suggest to moderator. Never auto-merge.

### Abuse prevention (decided 2026-10-06)

**No phone/OTP login.** Reporting stays fully anonymous; identity is never required or used to weight reports. All checks run server-side.

1. **Submission cost:** rate limits per device / IP hash (e.g. 5 reports per day, 2 per 10 min); Cloudflare Turnstile on every anonymous submission.
2. **Device fingerprint:** client sends a random install ID; server stores only salted hashes of device ID and IP (never raw values, never public).
3. **Plausibility checks:** no future dates / > 1 year old; duplicate/near-identical text across reports is flagged. **The reporter's own location is never collected or compared with the incident location** — victims often report later from home or a borrowed phone because their phone was snatched; location credibility comes from independent corroboration instead.
4. **Low initial weight:** pending community reports count 0.3×; verified 1.0×; a cell needs ≥ 3 reports from ≥ 2 independent devices before it renders.
5. **Corroboration:** independent matches (same/neighbouring cell, ±3 h, ±3 days, different device and IP) raise a report's confidence; confirmations from the same device count once.
6. **Hidden reporter trust score** per device hash: starts low, rises when reports are corroborated or verified, falls when rejected; scales weight (0.5×–1.5×); repeated rejections → temporary restriction. Never shown to users.
7. **Burst detection:** many reports for one cell (or neighbours) in a short window from few devices → flag cell for review, hold score changes.
8. **Human moderation** of flagged items; actions audit-logged.
9. **Decay:** 30-day half-life so anything that slips through fades.
- Never publicly expose or shame suspected abusers.

---

## 13. Cold-Start Data Strategy

The map must not launch empty, and data must never be fabricated.

1. **Media import tool.** Moderators add incidents from published news articles. Required: source URL, publication, date. Labelled **"Media-reported"**. Location limited to area level stated in the article.
2. **Community safety audits.** Volunteers walk routes (day + night) and rate lighting, openness, visibility, crowd, transport, security presence (Safetipin-style). Stored as environmental observations, labelled **"Community audit"**.
3. **OSM import.** Street lighting tags, support points.
4. **Partner data.** Only with written permission; labelled with the partner as source.

Until a cell has enough data, show **"Insufficient data"**, not "Very Low".

---

## 14. Awareness Hub (`/safety`)

Core of the "people awareness" mission. Bilingual, static/SSG content managed by Admin.

- **Prevention tips by category.** Practical, local. e.g. "Snatching often happens from passing motorbikes near rickshaws/CNGs — keep your phone and bag on the side away from the road."
- **After an incident — step by step:**
  - Get to a safe, public place
  - Emergency: **999** (National Emergency Service)
  - Women & children violence helpline: **109**
  - Child helpline: **1098**
  - How to file a GD (General Diary) — online and at a police station
  - Block SIM; report lost phone/IMEI
  - Freeze bKash / Nagad / bank accounts
  - Medical and legal aid resources
  - **All numbers and procedures must be verified before launch and reviewed periodically.**
- **Digital fraud awareness:** common scam scripts, how to recognize, how to report.
- **Women's safety on transport:** practical guidance and reporting options.
- **Know your rights:** plain-language, reviewed by a legal professional.
- Contextual surfacing: area page and post-report screen show tips relevant to that area's top categories.

---

## 15. Civic Action (Phase 2)

- Infrastructure reports (lighting, manholes, crossings) aggregate by ward.
- Generate a shareable, printable summary: *"14 broken street lights reported in Ward 23 (DNCC) in the last 60 days"* with a map.
- Link to official city corporation complaint channels.
- Track and display **Resolved** status — shows improvement, reduces fear.

---

## 16. Nearby Support Points (Phase 2)

- Source: **OpenStreetMap** via periodic Overpass import into PostGIS (police, hospital, clinic, pharmacy, fire station, fuel, bus/rail stations).
- Labels: **"Official emergency/support location"** vs **"Community-recommended place"**.
- Never label a business "safe". Use "Nearby support point" / "Nearby open location".
- Opening hours shown only when known from OSM.

---

## 17. Safer Route (Phase 2)

- Self-hosted **GraphHopper** with Bangladesh OSM extract (runs on the same free VM).
- Use GraphHopper **custom models** with per-request area priority penalties derived from current time-specific cell RAL.
- Return up to 3 options:

```text
Fastest     15 min  · Higher reported activity
Balanced    16 min  · Moderate
Lower risk  18 min  · Lower reported activity
```

Recommendation copy: *"Route C is about 3 minutes longer and passes through areas with lower reported activity at this time."*

- Route RAL = length-weighted average of cell RAL along the path at the selected time, plus a max-exposure flag for any High/Very High segment.
- Never call a route "safe".

---

## 18. Trip Sharing & Trusted Contacts (Phase 2)

- Share via **link** (no SMS cost). Optional Telegram bot / Web Push / email notifications.
- Shared view: destination, expected arrival, approximate current location, status.
- Events: Trip started · Nearing destination · Completed · *"Trip has exceeded the expected arrival time"* (neutral wording).

### Anti-stalking safeguards (mandatory)
- Persistent, visible "Sharing ON" indicator in the sharer's UI
- Auto-expiry (default: arrival + 30 min, max 12 h)
- One-tap stop, revocable links
- No silent or background sharing without the sharer's explicit action each trip
- Location shared approximately (≈100 m) unless the sharer opts into precise
- Contacts cannot request or start tracking

## 19. Safe Walk & Alerts (Phase 2)

- PWA in-app alerts while the app is open (browsers cannot reliably geofence in background; native app is Phase 3).
- Alerts: entering higher-activity cell, time-based elevated activity, route passes higher-activity segment.
- Calm copy: *"Heads up — the area about 350 m ahead has more reports at this time of night."*
- User controls: alert types, threshold, frequency cap, quiet hours. Default: off.

## 20. SOS (Phase 2, minimal)

- One-tap call **999** + one-tap share approximate location link with trusted contacts.
- Clear statement: *SafePath is not an emergency service.*

---

## 21. AI Safety Assistant (Phase 3)

- Use a free-tier LLM API or self-hosted open model. Retrieval only from SafePath data + approved Awareness Hub content.
- Must not: invent statistics or incidents, claim certainty, identify individuals, accuse, present predictions as facts.
- Required phrasing: *"Based on reported platform data…"*, *"This is an estimate, not an official crime assessment."*
- Phase 1–2 "Why this level?" explanations are **rule-based templates**, not LLM.

## 22. Predictive Patterns (Phase 3)

Only after ≥ 12 months of clean data. Output: estimated level + confidence. Copy: *"Historical reports indicate more activity during this period."* Never *"A crime will happen here."*

---

## 23. Trends & Analytics

Per area: 7-day, 30-day, 90-day, 6-month series. Labels: Increasing / Decreasing / Stable / Insufficient data.

Admin dashboard: total/pending/verified/rejected reports, reports today/month, verification rate, top cells, incidents by category/area/time, trend over time, moderator throughput.

Charts must use the colorblind-safe palette and include text values.

---

## 24. Methodology & Disclaimer

### `/methodology` (public)
- What RAL means and doesn't mean
- Factors considered (no raw formula)
- Source levels and how verification works
- Confidence levels
- Privacy protections (k-anonymity, fuzzing, redaction)
- Known limitations: under-reporting, busy-area bias, media bias, reporting skew toward smartphone users
- Changelog of methodology changes

### Disclaimer (shown on map, area pages, route results)
> Safety information on SafePath is based on community reports and available data sources. It may be incomplete or inaccurate and is not an official crime statistic or a guarantee of safety.

Final legal wording to be reviewed by a qualified lawyer familiar with Bangladesh cyber, defamation, and data protection law.

---

## 25. Privacy Rules

Never publicly expose:
- Names, phone numbers, emails, NID, addresses of anyone
- Exact home/workplace locations
- Medical information
- Report free text (unless moderator-approved and redacted)
- Evidence images
- Reporter identity (even to other users)
- Anything that could identify a victim

Implementation:
- Public data aggregated to H3 cells; k ≥ 3 threshold
- Exact coordinates stored only if needed, in a separate restricted column, purged after 90 days (store cell id permanently)
- Location jitter for any point displayed at very high zoom
- EXIF stripped from all images on upload
- Data retention policy documented; user can delete account and own reports (aggregates remain)
- No third-party analytics trackers. Use self-hosted **Umami** or **Plausible CE** if analytics needed.

---

## 26. Security

- Django auth with secure sessions (HttpOnly, Secure, SameSite) for web; JWT only if native app requires it
- RBAC via groups/permissions; object-level checks in services
- CSRF, CORS allowlist, secure headers (`django-csp`, HSTS)
- DRF throttling + Turnstile
- Input validation server-side (DRF serializers) **and** client-side (Zod) — never trust client
- Parameterized ORM queries only
- Secrets via environment variables; never committed
- Dependency scanning (GitHub Dependabot, free)

### File upload
- Allowed: JPEG, PNG, WebP only; MIME + magic-byte check
- Max 5 MB; re-encode + compress server-side (Pillow) — re-encoding also strips hidden payloads
- Strip EXIF
- Scan with **ClamAV** (container)
- Store in **private** Cloudflare R2 bucket; access via short-lived signed URLs for moderators only

### Audit log
- Who, action, entity, previous value, new value, timestamp, IP hash
- Append-only: DB-level trigger blocks UPDATE/DELETE; normal admins cannot modify
- Covers: report state changes, merges, redactions, risk config changes, role changes, category changes

---

## 27. Architecture

### 27.1 Free stack

| Layer | Choice | Cost |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Vercel Hobby / Cloudflare Pages — free |
| Backend | Django + Django REST Framework | Oracle Cloud Always Free VM |
| Database | PostgreSQL + PostGIS + `h3-pg` + `pg_trgm` | Same VM |
| Jobs | Celery + Redis **or** `django-q2` / `procrastinate` (Postgres-only, simpler) | Same VM |
| Map tiles | OpenFreeMap or Protomaps PMTiles | Free |
| Geocoding | Photon or self-hosted Nominatim (Bangladesh extract) | Same VM |
| Routing (P2) | GraphHopper (Bangladesh extract) | Same VM |
| File storage | Cloudflare R2 | Free 10 GB |
| CAPTCHA | Cloudflare Turnstile | Free |
| CDN/DNS | Cloudflare | Free |
| Push | Web Push (VAPID) | Free |
| Email | Brevo / Resend free tier | Free |
| Chat alerts | Telegram Bot API | Free |
| Malware scan | ClamAV | Same VM |
| Analytics | Umami (self-hosted) | Same VM |
| CI | GitHub Actions | Free |
| Errors | GlitchTip (self-hosted, Sentry-compatible) | Same VM |

Deployment: **Docker Compose** + **Caddy** or Nginx (auto HTTPS) on Oracle Always Free ARM VM.

Fallback if Oracle unavailable: Supabase/Neon free Postgres (PostGIS) + Render/Koyeb free tier for Django (note: sleep on idle, small storage).

### 27.2 Backend layout

```text
backend/
├── config/            # settings (base/dev/prod), urls, celery/q config
└── apps/
    ├── users/         # auth, roles, trust score
    ├── geo/           # H3 cells, named areas, support points, OSM imports
    ├── incidents/     # categories, incidents, evidence, workflow
    ├── moderation/    # queues, duplicates, abuse detection
    ├── risk/          # risk config, scoring engine, cell_risk
    ├── awareness/     # tips, guides, hotlines (bilingual)
    ├── analytics/     # aggregates, trends, open data export
    ├── trips/         # P2: trips, trusted contacts, share links
    ├── routes/        # P2: GraphHopper integration
    ├── notifications/ # P2: push, email, telegram
    └── audit/         # append-only audit log
```

Each app: `models.py`, `services/` (business logic), `selectors/` (read queries), `api/` (serializers + views), `tasks.py`, `tests/`.
**Business logic lives in services, not serializers or views.**

### 27.3 Frontend layout

```text
frontend/
├── app/
│   ├── [locale]/            # bn | en
│   │   ├── page.tsx         # home
│   │   ├── map/
│   │   ├── area/[h3]/
│   │   ├── place/[slug]/
│   │   ├── report/
│   │   ├── safety/          # Awareness Hub
│   │   ├── methodology/
│   │   ├── about/
│   │   ├── dashboard/       # user
│   │   └── admin/           # moderator + admin
├── components/
├── features/                # map, report, area, moderation …
├── lib/                     # api client, zod schemas, i18n
└── public/
```

- **State/data:** React Server Components for read pages; **TanStack Query** for client-side fetching. No Redux.
- **Forms:** React Hook Form + Zod.
- **i18n:** `next-intl`. Bangla font: Noto Sans Bengali / Hind Siliguri via `next/font`.
- **PWA:** installable, offline cache of saved areas + Awareness Hub; "Lite mode" (no map tiles, list view).
- Client components only where interaction is required (map, forms).

### 27.4 Core entities

```text
User, Role/Group, Permission, ReporterTrust
IncidentCategory, Incident, IncidentEvidence, IncidentVerification, DuplicateCandidate
LocalKnowledge, Confirmation (user × entry, unique), Dispute
Cell (H3), NamedArea, SupportPoint, TransportRoute
RiskConfig (versioned), CellRisk, CellRiskFactor
MediaSource, CommunityAudit
AwarenessArticle, Tip, Hotline
Trip, TrustedContact, ShareLink              (P2)
NotificationPreference, PushSubscription     (P2)
AuditLog, DataSource
```

UUID primary keys. PostGIS `geography(Point, 4326)` for points; `h3index` columns for cells; GiST + B-tree indexes.

---

## 28. API (REST, `/api/v1/`)

```text
# Public
GET    /api/v1/map/cells
GET    /api/v1/areas/{h3}
GET    /api/v1/places/{slug}
GET    /api/v1/search?q=
GET    /api/v1/categories
GET    /api/v1/awareness/articles
GET    /api/v1/awareness/hotlines
POST   /api/v1/reports                       # kind = incident | knowledge
GET    /api/v1/areas/{h3}/knowledge
POST   /api/v1/knowledge/{id}/confirm        # auth required, one per user
POST   /api/v1/knowledge/{id}/dispute
GET    /api/v1/methodology

# Authenticated user
GET    /api/v1/me/reports
PATCH  /api/v1/me/settings

# Moderator
GET    /api/v1/mod/queue?type=
POST   /api/v1/mod/reports/{id}/verify|reject|merge|request-info|redact
POST   /api/v1/mod/media-imports

# Admin
GET/PUT /api/v1/admin/risk-config
CRUD    /api/v1/admin/categories
CRUD    /api/v1/admin/users
GET     /api/v1/admin/analytics
GET     /api/v1/admin/audit-logs

# Phase 2
GET    /api/v1/support-points?near=
POST   /api/v1/routes/analyze
POST   /api/v1/trips
PATCH  /api/v1/trips/{id}
POST   /api/v1/trips/{id}/share
GET    /api/v1/share/{token}
GET    /api/v1/open-data/cells.csv

# Phase 3
POST   /api/v1/ai/ask
```

Document with **drf-spectacular** (OpenAPI). Generate TypeScript types from the schema for the frontend.

---

## 29. Performance

- GiST/H3 indexes; bbox queries only
- Pre-aggregated `cell_risk`; never compute from raw incidents on request
- Cache map responses (Redis or Postgres) per tile + filter combination; invalidate on recompute
- Pagination everywhere
- Debounced map requests
- Static/ISR for Awareness Hub and Methodology
- Never send raw incidents to the browser
- Vector tiles (Martin / pg_tileserv) only if scale requires

---

## 30. Accessibility & UX

- WCAG 2.1 AA: contrast, keyboard navigation, screen-reader labels, ≥ 44 px touch targets
- Map data also available as an accessible list/table
- Color never the only signal
- Calm visual tone: avoid alarm red, sirens, flashing
- Loading, error, empty, and "insufficient data" states everywhere
- Mobile-first, works at 360 px width

---

## 31. MVP Scope (build only this first)

**Public:** map (H3 cells), search, area page with "Why?", time & category filters, Quick Report (incident + local knowledge, incl. positive signals and transport-route reporting), "I've seen this too" confirmations, Awareness Hub, methodology, disclaimer, Bangla + English.

**Moderator/Admin:** login, moderation queues, verification workflow, duplicate suggestions, media import, category & tip management, risk config, basic analytics, audit log.

**Backend:** auth + RBAC, incident API, PostGIS + H3, risk engine with recency + confidence + time, Turnstile + throttling, secure upload pipeline, audit trigger.

**Not in MVP:** routing, trips, alerts, push, AI, prediction, native app.

---

## 32. Build Order

1. Repo scaffold: Docker Compose (Postgres+PostGIS+h3, Django, Next.js, Caddy), env config, CI
2. Data models + migrations: categories, incidents, cells, audit log (with append-only trigger)
3. Auth + RBAC
4. Report submission API (validation, redaction, rate limit, Turnstile, upload pipeline)
5. Moderation services + API + duplicate detection job
6. Risk engine + tests + nightly/incremental job
7. Map cells API + area API
8. Frontend: i18n shell, map page, area page, report form
9. Moderator/admin UI
10. Awareness Hub + methodology + disclaimer content
11. Media import tool; seed with real, cited media reports
12. Accessibility + performance pass, deploy to Oracle VM

---

## 33. Rules for AI Coding Agents

1. Do not generate the whole application at once. Work feature by feature, following §32.
2. Models → services → API contracts → frontend, in that order.
3. Business logic in services; none in views, serializers, or UI components.
4. Strict TypeScript (`strict: true`, no `any`). Python type hints + `mypy`/`ruff`.
5. No paid services or API keys. If something needs a paid service, stop and propose a free alternative.
6. Avoid unnecessary dependencies. No microservices.
7. Secrets only via environment variables; provide `.env.example`.
8. Every user-facing string goes through i18n (`bn` + `en`).
9. Every public number shows its source level and confidence.
10. Use the approved wording: "reported activity", "lower/higher estimated risk", "support point". Never "safe" or "dangerous".
11. Loading/error/empty/insufficient-data states on every view.
12. Mobile + desktop, accessible.
13. Automated tests for: risk scoring, confidence, confirmation weighting/caps & one-per-user rule, k-anonymity threshold, redaction, workflow transitions, permissions, upload validation, audit immutability.
14. Record architectural decisions in `docs/adr/`.
15. Never fabricate data. Demo/seed data must be marked `is_demo=true` and visibly labelled in UI.
16. Privacy check before every feature: could this expose or endanger someone?

---

## 34. Vision

SafePath grows from:

> *"A map of where incidents are reported"*

into:

> *"A free, open safety awareness platform that helps people make informed travel decisions, learn how to protect themselves, and push for safer streets — using community reports, verified information, and transparent analysis."*

**Useful → Transparent → Privacy-conscious → Explainable → Calm → Free → Scalable**
