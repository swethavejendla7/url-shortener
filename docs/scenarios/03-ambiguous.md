# Scenario 3 — Ambiguous: "We Want to Know Where Our Clicks Are Coming From"

## The ask
> "We want to know where our clicks are coming from."

This is the deliberately underspecified scenario. As stated it's not an engineering problem yet —
it's a product intent with several materially different, equally plausible interpretations.

## Requirement understanding: naming the ambiguity before resolving it
"Where clicks are coming from" could reasonably mean any of:

1. **Geographic origin** — which countries/cities are clicking (IP geolocation)
2. **Referring site** — which page or platform sent the click (HTTP `Referer` header)
3. **Device/browser context** — what people are clicking from (user-agent parsing)
4. **Marketing-campaign attribution** — which campaign/channel (UTM parameters), which the
   creator explicitly controls per-link rather than something inferred from the click itself

All four are legitimate "analytics" work; only one or two are worth building for a prototype.
Rather than pick silently, the interpretation is written down here as a decision, not an
assumption:

| Interpretation | In scope for this pass? | Why |
|---|---|---|
| Referring site (2) | **Yes** | Directly answers "where," is available on every request for free (the `Referer` header), no new infrastructure |
| Device/browser (3) | **Yes** | Cheap to add alongside (2) using the same click-capture path, and "where from" often implicitly includes "on what" in casual product usage |
| Geographic origin (1) | **No — explicitly excluded** | Requires either a paid IP-geolocation service or shipping a geo database, and raises real privacy questions (storing/deriving location from IP) that deserve a deliberate decision, not a byproduct of a vague one-line ask. If geographic breakdown turns out to be what was actually wanted, that's a five-minute follow-up conversation, not a rebuild — the `clicks` table and breakdown-query pattern established here extend directly to a `country` column the same way `browser`/`os` were added |
| Campaign attribution (4) | **No** | Needs the *creator* to supply UTM params at link-creation time — a different feature (extending `POST /api/urls`) with a different acceptance criteria, not a click-analytics change. Flagged as a plausible next ask, not built speculatively |

**Assumption made explicit**: "referrer" is normalized to just the referring **host**
(`twitter.com`, not the full URL with path/query), and clicks with no `Referer` header are
bucketed as `"direct"`. Grouping by full URL would fragment the breakdown into near-unique
buckets and defeat the point of a breakdown.

## Task decomposition
1. Interpret and record the ambiguity resolution above — depends on nothing (this is the actual
   engineering work in an ambiguous scenario, not a formality before the "real" work starts)
2. Schema change: `002_add_click_breakdown_columns.sql` adds `browser`/`os` columns to `clicks`
   — depends on (1)
3. `parseUserAgent()` / `bucketReferrer()` helpers (`src/lib/userAgent.ts`) — depends on nothing,
   parallel to (2)
4. Wire click capture (`UrlsService.recordClick`) to populate the new columns — depends on (2), (3)
5. `UrlsRepository.clickBreakdown()` — grouped counts per referrer/browser/OS — depends on (2)
6. Extend the analytics response (`AnalyticsView.breakdown`) — depends on (5)
7. Unit tests for the parsing/bucketing helpers against real UA strings (verified against actual
   `ua-parser-js` output, not assumed) — depends on (3)
8. Integration test proving the full path: a request with a known referrer + UA produces the
   expected breakdown counts — depends on (4), (6)
9. Manual smoke test against a running server — depends on (8)

## AI-assisted execution
Full entries in [`docs/ai-traceability.md`](../ai-traceability.md#scenario-3--ambiguous).
Highlights:

- **Verified rather than assumed**: `ua-parser-js`'s exact output strings were checked by running
  the library directly against the test UA strings before writing test assertions. This caught a
  wrong assumption immediately — macOS is reported as `"Mac OS"`, not `"macOS"` — which would have
  been an embarrassing, avoidable test failure (or worse, a silently-wrong assertion) if guessed
  instead of verified.
- **No bundled TypeScript types for `ua-parser-js`**; `@types/ua-parser-js` was installed after
  confirming it exists and matches the installed major version, rather than writing an ambient
  `declare module` shim that could silently drift from the real API.
- **Generated and accepted**: the grouped-count SQL (`GROUP BY ... ORDER BY count DESC LIMIT 10`)
  and the `ClickBreakdown` shape matched the intended design directly.

## Validation
- `npm run verify`: **48/48 tests passing** (8 new this scenario: 4 for `parseUserAgent`, 3 for
  `bucketReferrer`, 1 integration test proving the end-to-end breakdown).
- Manual smoke test against a running server: one click with a Hacker News referrer + a Chrome/
  macOS user-agent string, one click with neither — `analytics.breakdown` correctly reports
  `{news.ycombinator.com: 1, direct: 1}`, `{Chrome: 1, unknown: 1}`, `{"Mac OS": 1, unknown: 1}`.
- Confirmed the migration applies cleanly on top of the existing `001_init.sql`-created schema
  (the `_migrations` tracking table means it only runs once, and only against DBs that don't
  already have it applied).

## Risks, trade-offs, and limitations
- **User-agent parsing is best-effort.** `ua-parser-js` is a signature-matching library, not a
  guarantee — new or unusual UA strings can yield `null`/`unknown`. Acceptable for an analytics
  breakdown (some "unknown" bucket is normal and informative on its own), not acceptable if this
  data were ever used for something that needs certainty (e.g. serving different content by
  browser).
- **Referrer data is self-reported by the client and easily spoofed or stripped** — privacy-
  focused browsers and extensions omit `Referer` entirely, which is indistinguishable from an
  organic direct visit. The `"direct"` bucket is therefore an upper bound including both real
  direct traffic and referrer-stripped traffic, not a precise measurement. Worth stating plainly
  rather than presenting the numbers as more precise than they are.
- **Geographic breakdown was explicitly scoped out**, not deferred silently — see the
  interpretation table above. If it turns out to be what was actually wanted, that's the next
  ambiguity to resolve, not evidence this pass got it wrong.
- **No per-link opt-out of analytics collection.** Every click is recorded; there's no mechanism
  for a link creator to request click data not be stored. Reasonable for a prototype, but a real
  product handling this at scale would need to think about that as a privacy/compliance question.
